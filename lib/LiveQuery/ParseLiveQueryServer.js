"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseLiveQueryServer = void 0;
var _tv = _interopRequireDefault(require("tv4"));
var _node = _interopRequireDefault(require("parse/node"));
var _Subscription = require("./Subscription");
var _Client = require("./Client");
var _ParseWebSocketServer = require("./ParseWebSocketServer");
var _logger = _interopRequireDefault(require("../logger"));
var _RequestSchema = _interopRequireDefault(require("./RequestSchema"));
var _QueryTools = require("./QueryTools");
var _ParsePubSub = require("./ParsePubSub");
var _SchemaController = _interopRequireDefault(require("../Controllers/SchemaController"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _triggers = require("../triggers");
var _Auth = require("../Auth");
var _Controllers = require("../Controllers");
var _Config = _interopRequireDefault(require("../Config"));
var _lruCache = require("lru-cache");
var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
var _util = require("util");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// @ts-ignore

class ParseLiveQueryServer {
  // className -> (queryHash -> subscription)

  // The subscriber we use to get object update from publisher

  constructor(server, config = {}, parseServerConfig = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.config = config;
    config.appId = config.appId || _node.default.applicationId;
    config.masterKey = config.masterKey || _node.default.masterKey;

    // Store keys, convert obj to map
    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();
    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }
    _logger.default.verbose('Support key pairs', this.keyPairs);

    // Initialize Parse
    _node.default.Object.disableSingleInstance();
    const serverURL = config.serverURL || _node.default.serverURL;
    _node.default.serverURL = serverURL;
    _node.default.initialize(config.appId, _node.default.javaScriptKey, config.masterKey);

    // The cache controller is a proper cache controller
    // with access to User and Roles
    this.cacheController = (0, _Controllers.getCacheController)(parseServerConfig);
    config.cacheTimeout = config.cacheTimeout || 5 * 1000; // 5s

    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.
    this.authCache = new _lruCache.LRUCache({
      max: 500,
      // 500 concurrent
      ttl: config.cacheTimeout
    });
    // Initialize websocket server
    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config);
    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    if (!this.subscriber.connect) {
      this.connect();
    }
  }
  async connect() {
    if (this.subscriber.isOpen) {
      return;
    }
    if (typeof this.subscriber.connect === 'function') {
      await Promise.resolve(this.subscriber.connect());
    } else {
      this.subscriber.isOpen = true;
    }
    this._createSubscribers();
  }
  async shutdown() {
    if (this.subscriber.isOpen) {
      await Promise.all([...[...this.clients.values()].map(client => client.parseWebSocket.ws.close()), this.parseWebSocketServer.close?.(), ...Array.from(this.subscriber.subscriptions?.keys() || []).map(key => this.subscriber.unsubscribe(key)), this.subscriber.close?.()]);
    }
    if (typeof this.subscriber.quit === 'function') {
      try {
        await this.subscriber.quit();
      } catch (err) {
        _logger.default.error('PubSubAdapter error on shutdown', {
          error: err
        });
      }
    } else {
      this.subscriber.isOpen = false;
    }
  }
  _createSubscribers() {
    const messageRecieved = (channel, messageStr) => {
      _logger.default.verbose('Subscribe message %j', messageStr);
      let message;
      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        _logger.default.error('unable to parse message', messageStr, e);
        return;
      }
      if (channel === _node.default.applicationId + 'clearCache') {
        this._clearCachedRoles(message.userId);
        return;
      }
      this._inflateParseObject(message);
      if (channel === _node.default.applicationId + 'afterSave') {
        this._onAfterSave(message);
      } else if (channel === _node.default.applicationId + 'afterDelete') {
        this._onAfterDelete(message);
      } else {
        _logger.default.error('Get message %s from unknown channel %j', message, channel);
      }
    };
    this.subscriber.on('message', (channel, messageStr) => messageRecieved(channel, messageStr));
    for (const field of ['afterSave', 'afterDelete', 'clearCache']) {
      const channel = `${_node.default.applicationId}${field}`;
      this.subscriber.subscribe(channel, messageStr => messageRecieved(channel, messageStr));
    }
  }

  // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.
  _inflateParseObject(message) {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;
    _UsersRouter.default.removeHiddenProperties(currentParseObject);
    let className = currentParseObject.className;
    let parseObject = new _node.default.Object(className);
    parseObject._finishFetch(currentParseObject);
    message.currentParseObject = parseObject;
    // Inflate original object
    const originalParseObject = message.originalParseObject;
    if (originalParseObject) {
      _UsersRouter.default.removeHiddenProperties(originalParseObject);
      className = originalParseObject.className;
      parseObject = new _node.default.Object(className);
      parseObject._finishFetch(originalParseObject);
      message.originalParseObject = parseObject;
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  async _onAfterDelete(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterDelete is triggered');
    let deletedParseObject = message.currentParseObject.toJSON();
    const classLevelPermissions = message.classLevelPermissions;
    const className = deletedParseObject.className;
    _logger.default.verbose('ClassName: %j | ObjectId: %s', className, deletedParseObject.id);
    _logger.default.verbose('Current client number : %d', this.clients.size);
    const classSubscriptions = this.subscriptions.get(className);
    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);
      return;
    }
    for (const subscription of classSubscriptions.values()) {
      let isSubscriptionMatched;
      try {
        isSubscriptionMatched = this._matchesSubscription(deletedParseObject, subscription);
      } catch (e) {
        _logger.default.error(`Failed matching subscription for class ${className}: ${e.message}`);
        continue;
      }
      if (!isSubscriptionMatched) {
        continue;
      }
      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
          // Deep-clone shared object so each concurrent callback works on its own copy
          let localDeletedParseObject = JSON.parse(JSON.stringify(deletedParseObject));
          const acl = message.currentParseObject.getACL();
          // Check CLP
          const op = this._getCLPOperation(subscription.query);
          let res = {};
          try {
            const matchesCLP = await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            if (matchesCLP === false) {
              return null;
            }
            const isMatched = await this._matchesACL(acl, client, requestId);
            if (!isMatched) {
              return null;
            }
            res = {
              event: 'delete',
              sessionToken: client.sessionToken,
              object: localDeletedParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);
            if (trigger) {
              const auth = await this.getAuthFromClient(client, requestId);
              if (auth && auth.user) {
                res.user = auth.user;
              }
              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }
              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }
            if (!res.sendEvent) {
              return;
            }
            if (res.object && typeof res.object.toJSON === 'function') {
              localDeletedParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }
            res.object = localDeletedParseObject;
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            client.pushDelete(requestId, res.object);
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);
            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);
            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  async _onAfterSave(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterSave is triggered');
    let originalParseObject = null;
    if (message.originalParseObject) {
      originalParseObject = message.originalParseObject.toJSON();
    }
    const classLevelPermissions = message.classLevelPermissions;
    let currentParseObject = message.currentParseObject.toJSON();
    const className = currentParseObject.className;
    _logger.default.verbose('ClassName: %s | ObjectId: %s', className, currentParseObject.id);
    _logger.default.verbose('Current client number : %d', this.clients.size);
    const classSubscriptions = this.subscriptions.get(className);
    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);
      return;
    }
    for (const subscription of classSubscriptions.values()) {
      let isOriginalSubscriptionMatched;
      let isCurrentSubscriptionMatched;
      try {
        isOriginalSubscriptionMatched = this._matchesSubscription(originalParseObject, subscription);
        isCurrentSubscriptionMatched = this._matchesSubscription(currentParseObject, subscription);
      } catch (e) {
        _logger.default.error(`Failed matching subscription for class ${className}: ${e.message}`);
        continue;
      }
      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
          // Deep-clone shared objects so each concurrent callback works on its own copy.
          // Without cloning, _filterSensitiveData's in-place field deletion and afterEvent
          // trigger modifications corrupt the shared state across concurrent subscribers.
          let localCurrentParseObject = JSON.parse(JSON.stringify(currentParseObject));
          let localOriginalParseObject = originalParseObject ? JSON.parse(JSON.stringify(originalParseObject)) : null;
          // Set orignal ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let originalACLCheckingPromise;
          if (!isOriginalSubscriptionMatched) {
            originalACLCheckingPromise = Promise.resolve(false);
          } else {
            let originalACL;
            if (message.originalParseObject) {
              originalACL = message.originalParseObject.getACL();
            }
            originalACLCheckingPromise = this._matchesACL(originalACL, client, requestId);
          }
          // Set current ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let currentACLCheckingPromise;
          let res = {};
          if (!isCurrentSubscriptionMatched) {
            currentACLCheckingPromise = Promise.resolve(false);
          } else {
            const currentACL = message.currentParseObject.getACL();
            currentACLCheckingPromise = this._matchesACL(currentACL, client, requestId);
          }
          try {
            const op = this._getCLPOperation(subscription.query);
            const matchesCLP = await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            if (matchesCLP === false) {
              return;
            }
            const [isOriginalMatched, isCurrentMatched] = await Promise.all([originalACLCheckingPromise, currentACLCheckingPromise]);
            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', localOriginalParseObject, localCurrentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash);
            // Decide event type
            let type;
            if (isOriginalMatched && isCurrentMatched) {
              type = 'update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (localOriginalParseObject) {
                type = 'enter';
              } else {
                type = 'create';
              }
            } else {
              return null;
            }
            const watchFieldsChanged = this._checkWatchFields(client, requestId, message);
            if (!watchFieldsChanged && (type === 'update' || type === 'create')) {
              return;
            }
            // A `leave` or `enter` transition can be caused either by the object's
            // query match changing (the subscriber keeps read access) or by the
            // subscriber's ACL read access being revoked or granted in the same save.
            // In the access-change case the subscriber is not authorized to read the
            // object state that triggered the transition, so that state must not be
            // sent over the channel. (CLP read denial is handled earlier by
            // `_matchesCLP`, which skips the event entirely.)
            if (type === 'leave') {
              // The post-update object is readable on a query-mismatch leave but not
              // on an ACL-loss leave. Only send the post-update body when the
              // subscriber can still read the current object; otherwise fall back to
              // the last authorized (original) state, which still carries the objectId.
              const currentReadable = isCurrentSubscriptionMatched ? false : await this._matchesACL(message.currentParseObject.getACL(), client, requestId);
              if (!currentReadable) {
                localCurrentParseObject = JSON.parse(JSON.stringify(localOriginalParseObject));
              }
            } else if (type === 'enter') {
              // The pre-update object was readable on a query-match-gain enter but not
              // on an ACL-grant enter. Only send the pre-update body as `original`
              // when the subscriber could read the original object.
              const originalReadable = isOriginalSubscriptionMatched ? false : await this._matchesACL(message.originalParseObject.getACL(), client, requestId);
              if (!originalReadable) {
                localOriginalParseObject = null;
              }
            }
            res = {
              event: type,
              sessionToken: client.sessionToken,
              object: localCurrentParseObject,
              original: localOriginalParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);
            if (trigger) {
              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }
              if (res.original) {
                res.original = _node.default.Object.fromJSON(res.original);
              }
              const auth = await this.getAuthFromClient(client, requestId);
              if (auth && auth.user) {
                res.user = auth.user;
              }
              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }
            if (!res.sendEvent) {
              return;
            }
            if (res.object && typeof res.object.toJSON === 'function') {
              localCurrentParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }
            if (res.original && typeof res.original.toJSON === 'function') {
              localOriginalParseObject = (0, _triggers.toJSONwithObjects)(res.original, res.original.className || className);
            }
            res.object = localCurrentParseObject;
            res.original = localOriginalParseObject;
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            const functionName = 'push' + res.event.charAt(0).toUpperCase() + res.event.slice(1);
            if (client[functionName]) {
              client[functionName](requestId, res.object, res.original ?? null);
            }
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);
            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);
            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  }
  _onConnect(parseWebsocket) {
    parseWebsocket.on('message', request => {
      if (typeof request === 'string') {
        try {
          request = JSON.parse(request);
        } catch (e) {
          _logger.default.error('unable to parse request', request, e);
          return;
        }
      }
      _logger.default.verbose('Request: %j', request);

      // Check whether this request is a valid request, return error directly if not
      if (!_tv.default.validate(request, _RequestSchema.default['general']) || !_tv.default.validate(request, _RequestSchema.default[request.op])) {
        _Client.Client.pushError(parseWebsocket, 1, _tv.default.error.message);
        _logger.default.error('Connect message error %s', _tv.default.error.message);
        return;
      }
      switch (request.op) {
        case 'connect':
          this._handleConnect(parseWebsocket, request);
          break;
        case 'subscribe':
          this._handleSubscribe(parseWebsocket, request);
          break;
        case 'update':
          this._handleUpdateSubscription(parseWebsocket, request);
          break;
        case 'unsubscribe':
          this._handleUnsubscribe(parseWebsocket, request);
          break;
        default:
          _Client.Client.pushError(parseWebsocket, 3, 'Get unknown operation');
          _logger.default.error('Get unknown operation', request.op);
      }
    });
    parseWebsocket.on('disconnect', () => {
      _logger.default.info(`Client disconnect: ${parseWebsocket.clientId}`);
      const clientId = parseWebsocket.clientId;
      if (!this.clients.has(clientId)) {
        (0, _triggers.runLiveQueryEventHandlers)({
          event: 'ws_disconnect_error',
          clients: this.clients.size,
          subscriptions: this.subscriptions.size,
          error: `Unable to find client ${clientId}`
        });
        _logger.default.error(`Can not find client ${clientId} on disconnect`);
        return;
      }

      // Delete client
      const client = this.clients.get(clientId);
      this.clients.delete(clientId);

      // Delete client from subscriptions
      for (const [requestId, subscriptionInfo] of _lodash.default.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId);

        // If there is no client which is subscribing this subscription, remove it from subscriptions
        const classSubscriptions = this.subscriptions.get(subscription.className);
        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        }
        // If there is no subscriptions under this class, remove it from subscriptions
        if (classSubscriptions.size === 0) {
          this.subscriptions.delete(subscription.className);
        }
      }
      _logger.default.verbose('Current clients %d', this.clients.size);
      _logger.default.verbose('Current subscriptions %d', this.subscriptions.size);
      (0, _triggers.runLiveQueryEventHandlers)({
        event: 'ws_disconnect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId,
        sessionToken: client.sessionToken
      });
    });
    (0, _triggers.runLiveQueryEventHandlers)({
      event: 'ws_connect',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size
    });
  }
  _validateQueryConstraints(where) {
    if (typeof where !== 'object' || where === null) {
      return;
    }
    for (const op of ['$or', '$and', '$nor']) {
      if (where[op] !== undefined && !Array.isArray(where[op])) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `${op} must be an array`);
      }
      if (Array.isArray(where[op])) {
        where[op].forEach(subQuery => {
          this._validateQueryConstraints(subQuery);
        });
      }
    }
    for (const key of Object.keys(where)) {
      const constraint = where[key];
      if (typeof constraint === 'object' && constraint !== null) {
        if (constraint.$regex !== undefined) {
          const regex = constraint.$regex;
          const isRegExpLike = regex !== null && typeof regex === 'object' && typeof regex.source === 'string' && typeof regex.flags === 'string';
          if (typeof regex !== 'string' && !isRegExpLike) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Invalid regular expression: $regex must be a string or RegExp');
          }
          const pattern = isRegExpLike ? regex.source : regex;
          const flags = isRegExpLike ? regex.flags : constraint.$options || '';
          try {
            new RegExp(pattern, flags);
          } catch (e) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid regular expression: ${e.message}`);
          }
        }
      }
    }
  }
  _matchesSubscription(parseObject, subscription) {
    // Object is undefined or null, not match
    if (!parseObject) {
      return false;
    }
    return (0, _QueryTools.matchesQuery)(structuredClone(parseObject), subscription.query);
  }
  async _clearCachedRoles(userId) {
    try {
      const validTokens = await new _node.default.Query(_node.default.Session).equalTo('user', _node.default.User.createWithoutData(userId)).find({
        useMasterKey: true
      });
      await Promise.all(validTokens.map(async token => {
        const sessionToken = token.get('sessionToken');
        const authPromise = this.authCache.get(sessionToken);
        if (!authPromise) {
          return;
        }
        const [auth1, auth2] = await Promise.all([authPromise, (0, _Auth.getAuthForSessionToken)({
          cacheController: this.cacheController,
          sessionToken
        })]);
        auth1.auth?.clearRoleCache(sessionToken);
        auth2.auth?.clearRoleCache(sessionToken);
        this.authCache.delete(sessionToken);
      }));
    } catch (e) {
      _logger.default.verbose(`Could not clear role cache. ${e}`);
    }
  }
  getAuthForSessionToken(sessionToken) {
    if (!sessionToken) {
      return Promise.resolve({});
    }
    const fromCache = this.authCache.get(sessionToken);
    if (fromCache) {
      return fromCache;
    }
    const authPromise = (0, _Auth.getAuthForSessionToken)({
      cacheController: this.cacheController,
      sessionToken: sessionToken
    }).then(auth => {
      return {
        auth,
        userId: auth && auth.user && auth.user.id
      };
    }).catch(error => {
      // There was an error with the session token
      const result = {};
      if (error && error.code === _node.default.Error.INVALID_SESSION_TOKEN) {
        result.error = error;
        this.authCache.set(sessionToken, Promise.resolve(result), this.config.cacheTimeout);
      } else {
        this.authCache.delete(sessionToken);
      }
      return result;
    });
    this.authCache.set(sessionToken, authPromise);
    return authPromise;
  }
  async _matchesCLP(classLevelPermissions, object, client, requestId, op) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let userId;
    if (typeof subscriptionInfo !== 'undefined') {
      const result = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);
      userId = result.userId;
      if (userId) {
        aclGroup.push(userId);
      }
    }
    await _SchemaController.default.validatePermission(classLevelPermissions, object.className, aclGroup, op);
    // Enforce pointer permissions that validatePermission defers.
    // Returns false to silently skip the event (like ACL), rather than
    // throwing which would push errors to the client and log noise.
    if (!client.hasMasterKey && classLevelPermissions) {
      const permissionField = ['get', 'find', 'count'].indexOf(op) > -1 ? 'readUserFields' : 'writeUserFields';
      const pointerFields = [];
      if (classLevelPermissions[op]?.pointerFields) {
        pointerFields.push(...classLevelPermissions[op].pointerFields);
      }
      if (Array.isArray(classLevelPermissions[permissionField])) {
        for (const field of classLevelPermissions[permissionField]) {
          if (!pointerFields.includes(field)) {
            pointerFields.push(field);
          }
        }
      }
      if (pointerFields.length > 0) {
        // If public or user-specific permission already grants access, skip pointer check
        if (!_SchemaController.default.testPermissions(classLevelPermissions, aclGroup, op)) {
          if (!userId) {
            return false;
          }
          // Check if any pointer field points to the current user
          const hasAccess = pointerFields.some(field => {
            const value = typeof object.get === 'function' ? object.get(field) : object[field];
            if (!value) {
              return false;
            }
            // Handle Parse.Object pointer (has .id)
            if (value.id) {
              return value.id === userId;
            }
            // Handle raw pointer JSON (has .objectId)
            if (value.objectId) {
              return value.objectId === userId;
            }
            // Handle array of pointers
            if (Array.isArray(value)) {
              return value.some(item => {
                if (item.id) {
                  return item.id === userId;
                }
                if (item.objectId) {
                  return item.objectId === userId;
                }
                return false;
              });
            }
            return false;
          });
          if (!hasAccess) {
            return false;
          }
        }
      }
    }
  }

  // `addProtectedFields` reads role-scoped `protectedFields` groups from
  // `Auth.userRoles`, which stays empty unless the roles are explicitly loaded.
  // Without this, every `role:` group is silently skipped and LiveQuery would
  // disclose fields that the REST path strips for the same caller. The roles are
  // only fetched when the class actually declares a `role:` group, so classes
  // without one keep subscribing and receiving events without a role lookup.
  async _loadRolesForProtectedFields(classLevelPermissions, clientAuth) {
    if (typeof clientAuth?.getUserRoles !== 'function') {
      return;
    }
    const protectedFields = classLevelPermissions?.protectedFields;
    if (!protectedFields || Array.isArray(protectedFields)) {
      return;
    }
    if (!Object.keys(protectedFields).some(key => key.startsWith('role:'))) {
      return;
    }
    await clientAuth.getUserRoles();
  }
  async _filterSensitiveData(classLevelPermissions, res, client, requestId, op, query) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let clientAuth;
    if (typeof subscriptionInfo !== 'undefined') {
      // Fall back to the connect-frame token, the same way `_matchesACL` and
      // `getAuthFromClient` already do. The subscribe frame's session token is
      // optional, so resolving only it would redact against an anonymous identity
      // while the ACL check authorized the read against the connected user. That
      // mismatch skips every identity-derived `protectedFields` group
      // (`role:`, `authenticated` and `<objectId>`).
      const {
        userId,
        auth
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken || client.sessionToken);
      if (userId) {
        aclGroup.push(userId);
      }
      clientAuth = auth;
    }
    if (!client.hasMasterKey) {
      await this._loadRolesForProtectedFields(classLevelPermissions, clientAuth);
    }
    const filter = obj => {
      if (!obj) {
        return;
      }
      let protectedFields = classLevelPermissions?.protectedFields || [];
      if (client.hasMasterKey) {
        protectedFields = [];
      } else if (!Array.isArray(protectedFields)) {
        protectedFields = (0, _Controllers.getDatabaseController)(this.config).addProtectedFields(classLevelPermissions, res.object.className, query, aclGroup, clientAuth);
      }
      return _DatabaseController.default.filterSensitiveData(client.hasMasterKey, false, aclGroup, clientAuth, op, classLevelPermissions, res.object.className, protectedFields, obj, query);
    };
    res.object = filter(res.object);
    res.original = filter(res.original);
  }
  _getCLPOperation(query) {
    return typeof query === 'object' && Object.keys(query).length == 1 && typeof query.objectId === 'string' ? 'get' : 'find';
  }
  async _verifyACL(acl, token) {
    if (!token) {
      return false;
    }
    const {
      auth,
      userId
    } = await this.getAuthForSessionToken(token);

    // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.
    if (!auth || !userId) {
      return false;
    }
    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);
    if (isSubscriptionSessionTokenMatched) {
      return true;
    }

    // Check if the user has any roles that match the ACL
    return Promise.resolve().then(async () => {
      // Resolve false right away if the acl doesn't have any roles
      const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));
      if (!acl_has_roles) {
        return false;
      }
      const roleNames = await auth.getUserRoles();
      // Finally, see if any of the user's roles allow them read access
      for (const role of roleNames) {
        // We use getReadAccess as `role` is in the form `role:roleName`
        if (acl.getReadAccess(role)) {
          return true;
        }
      }
      return false;
    }).catch(() => {
      return false;
    });
  }
  async getAuthFromClient(client, requestId, sessionToken) {
    const getSessionFromClient = () => {
      const subscriptionInfo = client.getSubscriptionInfo(requestId);
      if (typeof subscriptionInfo === 'undefined') {
        return client.sessionToken;
      }
      return subscriptionInfo.sessionToken || client.sessionToken;
    };
    if (!sessionToken) {
      sessionToken = getSessionFromClient();
    }
    if (!sessionToken) {
      return;
    }
    const {
      auth
    } = await this.getAuthForSessionToken(sessionToken);
    return auth;
  }
  _checkWatchFields(client, requestId, message) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const watch = subscriptionInfo?.watch;
    if (!watch) {
      return true;
    }
    const object = message.currentParseObject;
    const original = message.originalParseObject;
    return watch.some(field => !(0, _util.isDeepStrictEqual)(object.get(field), original?.get(field)));
  }
  async _matchesACL(acl, client, requestId) {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    }
    // Check subscription sessionToken matches ACL first
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    if (typeof subscriptionInfo === 'undefined') {
      return false;
    }
    const subscriptionToken = subscriptionInfo.sessionToken;
    const clientSessionToken = client.sessionToken;
    if (await this._verifyACL(acl, subscriptionToken)) {
      return true;
    }
    if (await this._verifyACL(acl, clientSessionToken)) {
      return true;
    }
    return false;
  }
  async _handleConnect(parseWebsocket, request) {
    if (!this._validateKeys(request, this.keyPairs)) {
      _Client.Client.pushError(parseWebsocket, 4, 'Key in request is not valid');
      _logger.default.error('Key in request is not valid');
      return;
    }
    const hasMasterKey = this._hasMasterKey(request, this.keyPairs);
    const clientId = (0, _uuid.v4)();
    const client = new _Client.Client(clientId, parseWebsocket, hasMasterKey, request.sessionToken, request.installationId);
    try {
      const req = {
        client,
        event: 'connect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: request.installationId,
        user: undefined
      };
      const trigger = (0, _triggers.getTrigger)('@Connect', 'beforeConnect', _node.default.applicationId);
      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, req.sessionToken);
        if (auth && auth.user) {
          req.user = auth.user;
        }
        await (0, _triggers.runTrigger)(trigger, `beforeConnect.@Connect`, req, auth);
      }
      parseWebsocket.clientId = clientId;
      this.clients.set(parseWebsocket.clientId, client);
      _logger.default.info(`Create new client: ${parseWebsocket.clientId}`);
      client.pushConnect();
      (0, _triggers.runLiveQueryEventHandlers)(req);
    } catch (e) {
      const error = (0, _triggers.resolveError)(e);
      _Client.Client.pushError(parseWebsocket, error.code, error.message, false);
      _logger.default.error(`Failed running beforeConnect for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
    }
  }
  _hasMasterKey(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0 || !validKeyPairs.has('masterKey')) {
      return false;
    }
    if (!request || !Object.prototype.hasOwnProperty.call(request, 'masterKey')) {
      return false;
    }
    return request.masterKey === validKeyPairs.get('masterKey');
  }
  _validateKeys(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0) {
      return true;
    }
    let isValid = false;
    for (const [key, secret] of validKeyPairs) {
      if (!request[key] || request[key] !== secret) {
        continue;
      }
      isValid = true;
      break;
    }
    return isValid;
  }
  async _handleSubscribe(parseWebsocket, request) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before subscribing');
      _logger.default.error('Can not find this client, make sure you connect to server before subscribing');
      return;
    }
    const client = this.clients.get(parseWebsocket.clientId);
    const className = request.query.className;
    let authCalled = false;
    let clientAuth;
    try {
      const trigger = (0, _triggers.getTrigger)(className, 'beforeSubscribe', _node.default.applicationId);
      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
        authCalled = true;
        clientAuth = auth;
        if (auth && auth.user) {
          request.user = auth.user;
        }
        const parseQuery = new _node.default.Query(className);
        parseQuery.withJSON(request.query);
        request.query = parseQuery;
        await (0, _triggers.runTrigger)(trigger, `beforeSubscribe.${className}`, request, auth);
        const query = request.query.toJSON();
        request.query = query;
      }
      if (className === '_Session') {
        if (!authCalled) {
          const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
          clientAuth = auth;
          if (auth && auth.user) {
            request.user = auth.user;
          }
        }
        if (request.user) {
          request.query.where.user = request.user.toPointer();
        } else if (!request.master) {
          _Client.Client.pushError(parseWebsocket, _node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token', false, request.requestId);
          return;
        }
      }
      // Validate query condition depth
      const appConfig = _Config.default.get(this.config.appId);
      if (!client.hasMasterKey) {
        const rc = appConfig.requestComplexity;
        if (rc && rc.queryDepth !== -1) {
          const maxDepth = rc.queryDepth;
          const checkDepth = (node, depth) => {
            if (depth > maxDepth) {
              throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Query condition nesting depth exceeds maximum allowed depth of ${maxDepth}`);
            }
            if (node === null || typeof node !== 'object') {
              return;
            }
            if (Array.isArray(node)) {
              for (const item of node) {
                checkDepth(item, depth);
              }
              return;
            }
            // Descend into every value so that logical operators ($or/$and/$nor)
            // nested under field-level operators (e.g. $elemMatch, $not) or plain
            // field names are still counted. Only logical operators increase the
            // depth, which preserves the documented meaning of `queryDepth`.
            for (const key of Object.keys(node)) {
              const isLogical = key === '$or' || key === '$and' || key === '$nor';
              if (isLogical && !Array.isArray(node[key])) {
                throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `${key} must be an array`);
              }
              checkDepth(node[key], isLogical ? depth + 1 : depth);
            }
          };
          checkDepth(request.query.where, 0);
        }
      }

      // Check CLP for subscribe operation
      const schemaController = await appConfig.database.loadSchema();
      const classLevelPermissions = schemaController.getClassLevelPermissions(className);
      const op = this._getCLPOperation(request.query);
      const aclGroup = ['*'];
      if (!authCalled) {
        const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
        authCalled = true;
        clientAuth = auth;
        if (auth && auth.user) {
          request.user = auth.user;
          aclGroup.push(auth.user.id);
        }
      } else if (request.user) {
        aclGroup.push(request.user.id);
      }
      await _SchemaController.default.validatePermission(classLevelPermissions, className, aclGroup, op);

      // Check protected fields in WHERE clause and WATCH parameter
      if (!client.hasMasterKey) {
        await this._loadRolesForProtectedFields(classLevelPermissions, clientAuth);
        // `clientAuth` is undefined only when no session token was supplied on
        // either frame, in which case a `beforeSubscribe` trigger is the only way
        // `request.user` can be set. There is no session to resolve roles from for
        // such a trigger-assigned user, so `role:` groups cannot be applied to it.
        const auth = request.user ? clientAuth || {
          user: request.user,
          userRoles: []
        } : {};
        const protectedFields = appConfig.database.addProtectedFields(classLevelPermissions, className, request.query.where, aclGroup, auth) || [];
        if (protectedFields.length > 0 && request.query.where) {
          const checkWhere = where => {
            if (typeof where !== 'object' || where === null) {
              return;
            }
            for (const whereKey of Object.keys(where)) {
              const rootField = whereKey.split('.')[0];
              if (protectedFields.includes(whereKey) || protectedFields.includes(rootField)) {
                throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'Permission denied');
              }
            }
            for (const op of ['$or', '$and', '$nor']) {
              if (where[op] !== undefined && !Array.isArray(where[op])) {
                throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `${op} must be an array`);
              }
              if (Array.isArray(where[op])) {
                where[op].forEach(subQuery => checkWhere(subQuery));
              }
            }
          };
          checkWhere(request.query.where);
        }
        if (protectedFields.length > 0 && Array.isArray(request.query.watch)) {
          for (const watchField of request.query.watch) {
            const rootField = watchField.split('.')[0];
            if (protectedFields.includes(watchField) || protectedFields.includes(rootField)) {
              throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'Permission denied');
            }
          }
        }
      }

      // Validate regex patterns in the subscription query
      this._validateQueryConstraints(request.query.where);

      // Get subscription from subscriptions, create one if necessary
      const subscriptionHash = (0, _QueryTools.queryHash)(request.query);
      // Add className to subscriptions if necessary

      if (!this.subscriptions.has(className)) {
        this.subscriptions.set(className, new Map());
      }
      const classSubscriptions = this.subscriptions.get(className);
      let subscription;
      if (classSubscriptions.has(subscriptionHash)) {
        subscription = classSubscriptions.get(subscriptionHash);
      } else {
        subscription = new _Subscription.Subscription(className, request.query.where, subscriptionHash);
        classSubscriptions.set(subscriptionHash, subscription);
      }

      // Add subscriptionInfo to client
      const subscriptionInfo = {
        subscription: subscription
      };
      // Add selected fields, sessionToken and installationId for this subscription if necessary
      if (request.query.keys) {
        subscriptionInfo.keys = Array.isArray(request.query.keys) ? request.query.keys : request.query.keys.split(',');
      }
      if (request.query.watch) {
        subscriptionInfo.watch = request.query.watch;
      }
      if (request.sessionToken) {
        subscriptionInfo.sessionToken = request.sessionToken;
      }
      client.addSubscriptionInfo(request.requestId, subscriptionInfo);

      // Add clientId to subscription
      subscription.addClientSubscription(parseWebsocket.clientId, request.requestId);
      client.pushSubscribe(request.requestId);
      _logger.default.verbose(`Create client ${parseWebsocket.clientId} new subscription: ${request.requestId}`);
      _logger.default.verbose('Current client number: %d', this.clients.size);
      (0, _triggers.runLiveQueryEventHandlers)({
        client,
        event: 'subscribe',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId
      });
    } catch (e) {
      const error = (0, _triggers.resolveError)(e);
      _Client.Client.pushError(parseWebsocket, error.code, error.message, false, request.requestId);
      _logger.default.error(`Failed running beforeSubscribe on ${className} for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
    }
  }
  _handleUpdateSubscription(parseWebsocket, request) {
    this._handleUnsubscribe(parseWebsocket, request, false);
    this._handleSubscribe(parseWebsocket, request);
  }
  _handleUnsubscribe(parseWebsocket, request, notifyClient = true) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before unsubscribing');
      _logger.default.error('Can not find this client, make sure you connect to server before unsubscribing');
      return;
    }
    const requestId = request.requestId;
    const client = this.clients.get(parseWebsocket.clientId);
    if (typeof client === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find client with clientId ' + parseWebsocket.clientId + '. Make sure you connect to live query server before unsubscribing.');
      _logger.default.error('Can not find this client ' + parseWebsocket.clientId);
      return;
    }
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    if (typeof subscriptionInfo === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId + '. Make sure you subscribe to live query server before unsubscribing.');
      _logger.default.error('Can not find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId);
      return;
    }

    // Remove subscription from client
    client.deleteSubscriptionInfo(requestId);
    // Remove client from subscription
    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId);
    // If there is no client which is subscribing this subscription, remove it from subscriptions
    const classSubscriptions = this.subscriptions.get(className);
    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    }
    // If there is no subscriptions under this class, remove it from subscriptions
    if (classSubscriptions.size === 0) {
      this.subscriptions.delete(className);
    }
    (0, _triggers.runLiveQueryEventHandlers)({
      client,
      event: 'unsubscribe',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
      sessionToken: subscriptionInfo.sessionToken,
      useMasterKey: client.hasMasterKey,
      installationId: client.installationId
    });
    if (!notifyClient) {
      return;
    }
    client.pushUnsubscribe(request.requestId);
    _logger.default.verbose(`Delete client: ${parseWebsocket.clientId} | subscription: ${request.requestId}`);
  }
}
exports.ParseLiveQueryServer = ParseLiveQueryServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfQ29uZmlnIiwiX2xydUNhY2hlIiwiX1VzZXJzUm91dGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl91dGlsIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImdldENhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsInR0bCIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwiY29ubmVjdCIsImlzT3BlbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2NyZWF0ZVN1YnNjcmliZXJzIiwic2h1dGRvd24iLCJhbGwiLCJ2YWx1ZXMiLCJtYXAiLCJjbGllbnQiLCJwYXJzZVdlYlNvY2tldCIsIndzIiwiY2xvc2UiLCJBcnJheSIsImZyb20iLCJ1bnN1YnNjcmliZSIsInF1aXQiLCJlcnIiLCJlcnJvciIsIm1lc3NhZ2VSZWNpZXZlZCIsImNoYW5uZWwiLCJtZXNzYWdlU3RyIiwibWVzc2FnZSIsIkpTT04iLCJwYXJzZSIsIl9jbGVhckNhY2hlZFJvbGVzIiwidXNlcklkIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwib24iLCJmaWVsZCIsInN1YnNjcmliZSIsImN1cnJlbnRQYXJzZU9iamVjdCIsIlVzZXJSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiY2xhc3NOYW1lIiwicGFyc2VPYmplY3QiLCJfZmluaXNoRmV0Y2giLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiZGVsZXRlZFBhcnNlT2JqZWN0IiwidG9KU09OIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaWQiLCJzaXplIiwiY2xhc3NTdWJzY3JpcHRpb25zIiwiZ2V0IiwiZGVidWciLCJzdWJzY3JpcHRpb24iLCJpc1N1YnNjcmlwdGlvbk1hdGNoZWQiLCJfbWF0Y2hlc1N1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkcyIsIl8iLCJlbnRyaWVzIiwiY2xpZW50UmVxdWVzdElkcyIsImZvckVhY2giLCJyZXF1ZXN0SWQiLCJsb2NhbERlbGV0ZWRQYXJzZU9iamVjdCIsInN0cmluZ2lmeSIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwibWF0Y2hlc0NMUCIsIl9tYXRjaGVzQ0xQIiwiaXNNYXRjaGVkIiwiX21hdGNoZXNBQ0wiLCJldmVudCIsInNlc3Npb25Ub2tlbiIsIm9iamVjdCIsInVzZU1hc3RlcktleSIsImhhc01hc3RlcktleSIsImluc3RhbGxhdGlvbklkIiwic2VuZEV2ZW50IiwidHJpZ2dlciIsImdldFRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJydW5UcmlnZ2VyIiwidG9KU09Od2l0aE9iamVjdHMiLCJfZmlsdGVyU2Vuc2l0aXZlRGF0YSIsInB1c2hEZWxldGUiLCJyZXNvbHZlRXJyb3IiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJjb2RlIiwiaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkIiwibG9jYWxDdXJyZW50UGFyc2VPYmplY3QiLCJsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIm9yaWdpbmFsQUNMIiwiY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSIsImN1cnJlbnRBQ0wiLCJpc09yaWdpbmFsTWF0Y2hlZCIsImlzQ3VycmVudE1hdGNoZWQiLCJoYXNoIiwidHlwZSIsIndhdGNoRmllbGRzQ2hhbmdlZCIsIl9jaGVja1dhdGNoRmllbGRzIiwiY3VycmVudFJlYWRhYmxlIiwib3JpZ2luYWxSZWFkYWJsZSIsIm9yaWdpbmFsIiwiZnVuY3Rpb25OYW1lIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJzbGljZSIsInJlcXVlc3QiLCJ0djQiLCJ2YWxpZGF0ZSIsIlJlcXVlc3RTY2hlbWEiLCJfaGFuZGxlQ29ubmVjdCIsIl9oYW5kbGVTdWJzY3JpYmUiLCJfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uIiwiX2hhbmRsZVVuc3Vic2NyaWJlIiwiaW5mbyIsImhhcyIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsIl92YWxpZGF0ZVF1ZXJ5Q29uc3RyYWludHMiLCJ3aGVyZSIsInVuZGVmaW5lZCIsImlzQXJyYXkiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJzdWJRdWVyeSIsImNvbnN0cmFpbnQiLCIkcmVnZXgiLCJyZWdleCIsImlzUmVnRXhwTGlrZSIsInNvdXJjZSIsImZsYWdzIiwicGF0dGVybiIsIiRvcHRpb25zIiwiUmVnRXhwIiwibWF0Y2hlc1F1ZXJ5Iiwic3RydWN0dXJlZENsb25lIiwidmFsaWRUb2tlbnMiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiVXNlciIsImNyZWF0ZVdpdGhvdXREYXRhIiwiZmluZCIsInRva2VuIiwiYXV0aFByb21pc2UiLCJhdXRoMSIsImF1dGgyIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImNsZWFyUm9sZUNhY2hlIiwiZnJvbUNhY2hlIiwidGhlbiIsImNhdGNoIiwicmVzdWx0IiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImFjbEdyb3VwIiwicHVzaCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJwZXJtaXNzaW9uRmllbGQiLCJpbmRleE9mIiwicG9pbnRlckZpZWxkcyIsImluY2x1ZGVzIiwibGVuZ3RoIiwidGVzdFBlcm1pc3Npb25zIiwiaGFzQWNjZXNzIiwic29tZSIsInZhbHVlIiwib2JqZWN0SWQiLCJpdGVtIiwiX2xvYWRSb2xlc0ZvclByb3RlY3RlZEZpZWxkcyIsImNsaWVudEF1dGgiLCJnZXRVc2VyUm9sZXMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJzdGFydHNXaXRoIiwiZmlsdGVyIiwib2JqIiwiZ2V0RGF0YWJhc2VDb250cm9sbGVyIiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsIl92ZXJpZnlBQ0wiLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInJvbGVOYW1lcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsIndhdGNoIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInV1aWR2NCIsInJlcSIsInB1c2hDb25uZWN0IiwidmFsaWRLZXlQYWlycyIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzVmFsaWQiLCJzZWNyZXQiLCJhdXRoQ2FsbGVkIiwicGFyc2VRdWVyeSIsIndpdGhKU09OIiwidG9Qb2ludGVyIiwibWFzdGVyIiwiYXBwQ29uZmlnIiwiQ29uZmlnIiwicmMiLCJyZXF1ZXN0Q29tcGxleGl0eSIsInF1ZXJ5RGVwdGgiLCJtYXhEZXB0aCIsImNoZWNrRGVwdGgiLCJub2RlIiwiZGVwdGgiLCJpc0xvZ2ljYWwiLCJzY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwidXNlclJvbGVzIiwiY2hlY2tXaGVyZSIsIndoZXJlS2V5Iiwicm9vdEZpZWxkIiwic3BsaXQiLCJPUEVSQVRJT05fRk9SQklEREVOIiwid2F0Y2hGaWVsZCIsInN1YnNjcmlwdGlvbkhhc2giLCJxdWVyeUhhc2giLCJTdWJzY3JpcHRpb24iLCJhZGRTdWJzY3JpcHRpb25JbmZvIiwiYWRkQ2xpZW50U3Vic2NyaXB0aW9uIiwicHVzaFN1YnNjcmliZSIsIm5vdGlmeUNsaWVudCIsImRlbGV0ZVN1YnNjcmlwdGlvbkluZm8iLCJwdXNoVW5zdWJzY3JpYmUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHY0IGZyb20gJ3R2NCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICcuL0NsaWVudCc7XG5pbXBvcnQgeyBQYXJzZVdlYlNvY2tldFNlcnZlciB9IGZyb20gJy4vUGFyc2VXZWJTb2NrZXRTZXJ2ZXInO1xuLy8gQHRzLWlnbm9yZVxuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFJlcXVlc3RTY2hlbWEgZnJvbSAnLi9SZXF1ZXN0U2NoZW1hJztcbmltcG9ydCB7IG1hdGNoZXNRdWVyeSwgcXVlcnlIYXNoIH0gZnJvbSAnLi9RdWVyeVRvb2xzJztcbmltcG9ydCB7IFBhcnNlUHViU3ViIH0gZnJvbSAnLi9QYXJzZVB1YlN1Yic7XG5pbXBvcnQgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCB7XG4gIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMsXG4gIGdldFRyaWdnZXIsXG4gIHJ1blRyaWdnZXIsXG4gIHJlc29sdmVFcnJvcixcbiAgdG9KU09Od2l0aE9iamVjdHMsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sIEF1dGggfSBmcm9tICcuLi9BdXRoJztcbmltcG9ydCB7IGdldENhY2hlQ29udHJvbGxlciwgZ2V0RGF0YWJhc2VDb250cm9sbGVyIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgYXMgTFJVIH0gZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBVc2VyUm91dGVyIGZyb20gJy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcblxuXG5jbGFzcyBQYXJzZUxpdmVRdWVyeVNlcnZlciB7XG4gIHNlcnZlcjogYW55O1xuICBjb25maWc6IGFueTtcbiAgY2xpZW50czogTWFwPHN0cmluZywgYW55PjtcbiAgLy8gY2xhc3NOYW1lIC0+IChxdWVyeUhhc2ggLT4gc3Vic2NyaXB0aW9uKVxuICBzdWJzY3JpcHRpb25zOiBNYXA8c3RyaW5nLCBhbnk+O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogYW55O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogYW55O1xuICBhdXRoQ2FjaGU6IGFueTtcbiAgY2FjaGVDb250cm9sbGVyOiBhbnk7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIGNvbmZpZzogYW55ID0ge30sIHBhcnNlU2VydmVyQ29uZmlnOiBhbnkgPSB7fSkge1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuICAgIHRoaXMuY2xpZW50cyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICBjb25maWcuYXBwSWQgPSBjb25maWcuYXBwSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICBjb25maWcubWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleSB8fCBQYXJzZS5tYXN0ZXJLZXk7XG5cbiAgICAvLyBTdG9yZSBrZXlzLCBjb252ZXJ0IG9iaiB0byBtYXBcbiAgICBjb25zdCBrZXlQYWlycyA9IGNvbmZpZy5rZXlQYWlycyB8fCB7fTtcbiAgICB0aGlzLmtleVBhaXJzID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGtleVBhaXJzKSkge1xuICAgICAgdGhpcy5rZXlQYWlycy5zZXQoa2V5LCBrZXlQYWlyc1trZXldKTtcbiAgICB9XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ1N1cHBvcnQga2V5IHBhaXJzJywgdGhpcy5rZXlQYWlycyk7XG5cbiAgICAvLyBJbml0aWFsaXplIFBhcnNlXG4gICAgUGFyc2UuT2JqZWN0LmRpc2FibGVTaW5nbGVJbnN0YW5jZSgpO1xuICAgIGNvbnN0IHNlcnZlclVSTCA9IGNvbmZpZy5zZXJ2ZXJVUkwgfHwgUGFyc2Uuc2VydmVyVVJMO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBQYXJzZS5pbml0aWFsaXplKGNvbmZpZy5hcHBJZCwgUGFyc2UuamF2YVNjcmlwdEtleSwgY29uZmlnLm1hc3RlcktleSk7XG5cbiAgICAvLyBUaGUgY2FjaGUgY29udHJvbGxlciBpcyBhIHByb3BlciBjYWNoZSBjb250cm9sbGVyXG4gICAgLy8gd2l0aCBhY2Nlc3MgdG8gVXNlciBhbmQgUm9sZXNcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGdldENhY2hlQ29udHJvbGxlcihwYXJzZVNlcnZlckNvbmZpZyk7XG5cbiAgICBjb25maWcuY2FjaGVUaW1lb3V0ID0gY29uZmlnLmNhY2hlVGltZW91dCB8fCA1ICogMTAwMDsgLy8gNXNcblxuICAgIC8vIFRoaXMgYXV0aCBjYWNoZSBzdG9yZXMgdGhlIHByb21pc2VzIGZvciBlYWNoIGF1dGggcmVzb2x1dGlvbi5cbiAgICAvLyBUaGUgbWFpbiBiZW5lZml0IGlzIHRvIGJlIGFibGUgdG8gcmV1c2UgdGhlIHNhbWUgdXNlciAvIHNlc3Npb24gdG9rZW4gcmVzb2x1dGlvbi5cbiAgICB0aGlzLmF1dGhDYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiA1MDAsIC8vIDUwMCBjb25jdXJyZW50XG4gICAgICB0dGw6IGNvbmZpZy5jYWNoZVRpbWVvdXQsXG4gICAgfSk7XG4gICAgLy8gSW5pdGlhbGl6ZSB3ZWJzb2NrZXQgc2VydmVyXG4gICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlciA9IG5ldyBQYXJzZVdlYlNvY2tldFNlcnZlcihcbiAgICAgIHNlcnZlcixcbiAgICAgIHBhcnNlV2Vic29ja2V0ID0+IHRoaXMuX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldCksXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICBpZiAoIXRoaXMuc3Vic2NyaWJlci5jb25uZWN0KSB7XG4gICAgICB0aGlzLmNvbm5lY3QoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLnN1YnNjcmliZXIuaXNPcGVuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnN1YnNjcmliZXIuY29ubmVjdCgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLmlzT3BlbiA9IHRydWU7XG4gICAgfVxuICAgIHRoaXMuX2NyZWF0ZVN1YnNjcmliZXJzKCk7XG4gIH1cblxuICBhc3luYyBzaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5zdWJzY3JpYmVyLmlzT3Blbikge1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAuLi5bLi4udGhpcy5jbGllbnRzLnZhbHVlcygpXS5tYXAoY2xpZW50ID0+IGNsaWVudC5wYXJzZVdlYlNvY2tldC53cy5jbG9zZSgpKSxcbiAgICAgICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlci5jbG9zZT8uKCksXG4gICAgICAgIC4uLkFycmF5LmZyb20odGhpcy5zdWJzY3JpYmVyLnN1YnNjcmlwdGlvbnM/LmtleXMoKSB8fCBbXSkubWFwKGtleSA9PlxuICAgICAgICAgIHRoaXMuc3Vic2NyaWJlci51bnN1YnNjcmliZShrZXkpXG4gICAgICAgICksXG4gICAgICAgIHRoaXMuc3Vic2NyaWJlci5jbG9zZT8uKCksXG4gICAgICBdKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLnN1YnNjcmliZXIucXVpdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zdWJzY3JpYmVyLnF1aXQoKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ1B1YlN1YkFkYXB0ZXIgZXJyb3Igb24gc2h1dGRvd24nLCB7IGVycm9yOiBlcnIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5pc09wZW4gPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBfY3JlYXRlU3Vic2NyaWJlcnMoKSB7XG4gICAgY29uc3QgbWVzc2FnZVJlY2lldmVkID0gKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdTdWJzY3JpYmUgbWVzc2FnZSAlaicsIG1lc3NhZ2VTdHIpO1xuICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICB0cnkge1xuICAgICAgICBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlU3RyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgbWVzc2FnZScsIG1lc3NhZ2VTdHIsIGUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdjbGVhckNhY2hlJykge1xuICAgICAgICB0aGlzLl9jbGVhckNhY2hlZFJvbGVzKG1lc3NhZ2UudXNlcklkKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhpcy5faW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2UpO1xuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyU2F2ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlckRlbGV0ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignR2V0IG1lc3NhZ2UgJXMgZnJvbSB1bmtub3duIGNoYW5uZWwgJWonLCBtZXNzYWdlLCBjaGFubmVsKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHRoaXMuc3Vic2NyaWJlci5vbignbWVzc2FnZScsIChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiBtZXNzYWdlUmVjaWV2ZWQoY2hhbm5lbCwgbWVzc2FnZVN0cikpO1xuICAgIGZvciAoY29uc3QgZmllbGQgb2YgWydhZnRlclNhdmUnLCAnYWZ0ZXJEZWxldGUnLCAnY2xlYXJDYWNoZSddKSB7XG4gICAgICBjb25zdCBjaGFubmVsID0gYCR7UGFyc2UuYXBwbGljYXRpb25JZH0ke2ZpZWxkfWA7XG4gICAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKGNoYW5uZWwsIG1lc3NhZ2VTdHIgPT4gbWVzc2FnZVJlY2lldmVkKGNoYW5uZWwsIG1lc3NhZ2VTdHIpKTtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGxldCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQ7XG4gICAgICB0cnkge1xuICAgICAgICBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgbWF0Y2hpbmcgc3Vic2NyaXB0aW9uIGZvciBjbGFzcyAke2NsYXNzTmFtZX06ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIERlZXAtY2xvbmUgc2hhcmVkIG9iamVjdCBzbyBlYWNoIGNvbmN1cnJlbnQgY2FsbGJhY2sgd29ya3Mgb24gaXRzIG93biBjb3B5XG4gICAgICAgICAgbGV0IGxvY2FsRGVsZXRlZFBhcnNlT2JqZWN0ID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShkZWxldGVkUGFyc2VPYmplY3QpKTtcbiAgICAgICAgICBjb25zdCBhY2wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAvLyBDaGVjayBDTFBcbiAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgIGxldCByZXM6IGFueSA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzQ0xQID0gYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXNDTFAgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaXNNYXRjaGVkID0gYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChhY2wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGlmICghaXNNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogJ2RlbGV0ZScsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBsb2NhbERlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGxvY2FsRGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcy5vYmplY3QgPSBsb2NhbERlbGV0ZWRQYXJzZU9iamVjdDtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgcmVzLm9iamVjdCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgbGV0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkO1xuICAgICAgbGV0IGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQ7XG4gICAgICB0cnkge1xuICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICAgKTtcbiAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCBtYXRjaGluZyBzdWJzY3JpcHRpb24gZm9yIGNsYXNzICR7Y2xhc3NOYW1lfTogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIERlZXAtY2xvbmUgc2hhcmVkIG9iamVjdHMgc28gZWFjaCBjb25jdXJyZW50IGNhbGxiYWNrIHdvcmtzIG9uIGl0cyBvd24gY29weS5cbiAgICAgICAgICAvLyBXaXRob3V0IGNsb25pbmcsIF9maWx0ZXJTZW5zaXRpdmVEYXRhJ3MgaW4tcGxhY2UgZmllbGQgZGVsZXRpb24gYW5kIGFmdGVyRXZlbnRcbiAgICAgICAgICAvLyB0cmlnZ2VyIG1vZGlmaWNhdGlvbnMgY29ycnVwdCB0aGUgc2hhcmVkIHN0YXRlIGFjcm9zcyBjb25jdXJyZW50IHN1YnNjcmliZXJzLlxuICAgICAgICAgIGxldCBsb2NhbEN1cnJlbnRQYXJzZU9iamVjdCA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoY3VycmVudFBhcnNlT2JqZWN0KSk7XG4gICAgICAgICAgbGV0IGxvY2FsT3JpZ2luYWxQYXJzZU9iamVjdCA9IG9yaWdpbmFsUGFyc2VPYmplY3RcbiAgICAgICAgICAgID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcmlnaW5hbFBhcnNlT2JqZWN0KSlcbiAgICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgICAvLyBTZXQgb3JpZ25hbCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGlmICghaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG9yaWdpbmFsQUNMO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChvcmlnaW5hbEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTZXQgY3VycmVudCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgbGV0IHJlczogYW55ID0ge307XG4gICAgICAgICAgaWYgKCFpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFDTCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0woY3VycmVudEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNDTFAgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlc0NMUCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBsb2NhbEN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRNYXRjaGVkLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIERlY2lkZSBldmVudCB0eXBlXG4gICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAndXBkYXRlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIGlmIChsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2VudGVyJztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NyZWF0ZSc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2F0Y2hGaWVsZHNDaGFuZ2VkID0gdGhpcy5fY2hlY2tXYXRjaEZpZWxkcyhjbGllbnQsIHJlcXVlc3RJZCwgbWVzc2FnZSk7XG4gICAgICAgICAgICBpZiAoIXdhdGNoRmllbGRzQ2hhbmdlZCAmJiAodHlwZSA9PT0gJ3VwZGF0ZScgfHwgdHlwZSA9PT0gJ2NyZWF0ZScpKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEEgYGxlYXZlYCBvciBgZW50ZXJgIHRyYW5zaXRpb24gY2FuIGJlIGNhdXNlZCBlaXRoZXIgYnkgdGhlIG9iamVjdCdzXG4gICAgICAgICAgICAvLyBxdWVyeSBtYXRjaCBjaGFuZ2luZyAodGhlIHN1YnNjcmliZXIga2VlcHMgcmVhZCBhY2Nlc3MpIG9yIGJ5IHRoZVxuICAgICAgICAgICAgLy8gc3Vic2NyaWJlcidzIEFDTCByZWFkIGFjY2VzcyBiZWluZyByZXZva2VkIG9yIGdyYW50ZWQgaW4gdGhlIHNhbWUgc2F2ZS5cbiAgICAgICAgICAgIC8vIEluIHRoZSBhY2Nlc3MtY2hhbmdlIGNhc2UgdGhlIHN1YnNjcmliZXIgaXMgbm90IGF1dGhvcml6ZWQgdG8gcmVhZCB0aGVcbiAgICAgICAgICAgIC8vIG9iamVjdCBzdGF0ZSB0aGF0IHRyaWdnZXJlZCB0aGUgdHJhbnNpdGlvbiwgc28gdGhhdCBzdGF0ZSBtdXN0IG5vdCBiZVxuICAgICAgICAgICAgLy8gc2VudCBvdmVyIHRoZSBjaGFubmVsLiAoQ0xQIHJlYWQgZGVuaWFsIGlzIGhhbmRsZWQgZWFybGllciBieVxuICAgICAgICAgICAgLy8gYF9tYXRjaGVzQ0xQYCwgd2hpY2ggc2tpcHMgdGhlIGV2ZW50IGVudGlyZWx5LilcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnbGVhdmUnKSB7XG4gICAgICAgICAgICAgIC8vIFRoZSBwb3N0LXVwZGF0ZSBvYmplY3QgaXMgcmVhZGFibGUgb24gYSBxdWVyeS1taXNtYXRjaCBsZWF2ZSBidXQgbm90XG4gICAgICAgICAgICAgIC8vIG9uIGFuIEFDTC1sb3NzIGxlYXZlLiBPbmx5IHNlbmQgdGhlIHBvc3QtdXBkYXRlIGJvZHkgd2hlbiB0aGVcbiAgICAgICAgICAgICAgLy8gc3Vic2NyaWJlciBjYW4gc3RpbGwgcmVhZCB0aGUgY3VycmVudCBvYmplY3Q7IG90aGVyd2lzZSBmYWxsIGJhY2sgdG9cbiAgICAgICAgICAgICAgLy8gdGhlIGxhc3QgYXV0aG9yaXplZCAob3JpZ2luYWwpIHN0YXRlLCB3aGljaCBzdGlsbCBjYXJyaWVzIHRoZSBvYmplY3RJZC5cbiAgICAgICAgICAgICAgY29uc3QgY3VycmVudFJlYWRhYmxlID0gaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZFxuICAgICAgICAgICAgICAgID8gZmFsc2VcbiAgICAgICAgICAgICAgICA6IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0wobWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCksIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKCFjdXJyZW50UmVhZGFibGUpIHtcbiAgICAgICAgICAgICAgICBsb2NhbEN1cnJlbnRQYXJzZU9iamVjdCA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkobG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0KSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2VudGVyJykge1xuICAgICAgICAgICAgICAvLyBUaGUgcHJlLXVwZGF0ZSBvYmplY3Qgd2FzIHJlYWRhYmxlIG9uIGEgcXVlcnktbWF0Y2gtZ2FpbiBlbnRlciBidXQgbm90XG4gICAgICAgICAgICAgIC8vIG9uIGFuIEFDTC1ncmFudCBlbnRlci4gT25seSBzZW5kIHRoZSBwcmUtdXBkYXRlIGJvZHkgYXMgYG9yaWdpbmFsYFxuICAgICAgICAgICAgICAvLyB3aGVuIHRoZSBzdWJzY3JpYmVyIGNvdWxkIHJlYWQgdGhlIG9yaWdpbmFsIG9iamVjdC5cbiAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxSZWFkYWJsZSA9IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkXG4gICAgICAgICAgICAgICAgPyBmYWxzZVxuICAgICAgICAgICAgICAgIDogYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCksIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKCFvcmlnaW5hbFJlYWRhYmxlKSB7XG4gICAgICAgICAgICAgICAgbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGxvY2FsQ3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBvcmlnaW5hbDogbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vcmlnaW5hbCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGxvY2FsQ3VycmVudFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMoXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMub2JqZWN0ID0gbG9jYWxDdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgICAgICAgICByZXMub3JpZ2luYWwgPSBsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCByZXMub2JqZWN0LCByZXMub3JpZ2luYWwgPz8gbnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfb25Db25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnkpOiB2b2lkIHtcbiAgICBwYXJzZVdlYnNvY2tldC5vbignbWVzc2FnZScsIHJlcXVlc3QgPT4ge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKHJlcXVlc3QpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgcmVxdWVzdCcsIHJlcXVlc3QsIGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1JlcXVlc3Q6ICVqJywgcmVxdWVzdCk7XG5cbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGEgdmFsaWQgcmVxdWVzdCwgcmV0dXJuIGVycm9yIGRpcmVjdGx5IGlmIG5vdFxuICAgICAgaWYgKFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbJ2dlbmVyYWwnXSkgfHxcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hW3JlcXVlc3Qub3BdKVxuICAgICAgKSB7XG4gICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDEsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25uZWN0IG1lc3NhZ2UgZXJyb3IgJXMnLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChyZXF1ZXN0Lm9wKSB7XG4gICAgICAgIGNhc2UgJ2Nvbm5lY3QnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdzdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VwZGF0ZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndW5zdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAzLCAnR2V0IHVua25vd24gb3BlcmF0aW9uJyk7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgdW5rbm93biBvcGVyYXRpb24nLCByZXF1ZXN0Lm9wKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oYENsaWVudCBkaXNjb25uZWN0OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY29uc3QgY2xpZW50SWQgPSBwYXJzZVdlYnNvY2tldC5jbGllbnRJZDtcbiAgICAgIGlmICghdGhpcy5jbGllbnRzLmhhcyhjbGllbnRJZCkpIHtcbiAgICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0X2Vycm9yJyxcbiAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICBlcnJvcjogYFVuYWJsZSB0byBmaW5kIGNsaWVudCAke2NsaWVudElkfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYENhbiBub3QgZmluZCBjbGllbnQgJHtjbGllbnRJZH0gb24gZGlzY29ubmVjdGApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnRcbiAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICBmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm9dIG9mIF8uZW50cmllcyhjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3MpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgICAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkLCByZXF1ZXN0SWQpO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBldmVudDogJ3dzX2Nvbm5lY3QnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICB9KTtcbiAgfVxuXG4gIF92YWxpZGF0ZVF1ZXJ5Q29uc3RyYWludHMod2hlcmU6IGFueSk6IHZvaWQge1xuICAgIGlmICh0eXBlb2Ygd2hlcmUgIT09ICdvYmplY3QnIHx8IHdoZXJlID09PSBudWxsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgb3Agb2YgWyckb3InLCAnJGFuZCcsICckbm9yJ10pIHtcbiAgICAgIGlmICh3aGVyZVtvcF0gIT09IHVuZGVmaW5lZCAmJiAhQXJyYXkuaXNBcnJheSh3aGVyZVtvcF0pKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgJHtvcH0gbXVzdCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkod2hlcmVbb3BdKSkge1xuICAgICAgICB3aGVyZVtvcF0uZm9yRWFjaCgoc3ViUXVlcnk6IGFueSkgPT4ge1xuICAgICAgICAgIHRoaXMuX3ZhbGlkYXRlUXVlcnlDb25zdHJhaW50cyhzdWJRdWVyeSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh3aGVyZSkpIHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnQgPSB3aGVyZVtrZXldO1xuICAgICAgaWYgKHR5cGVvZiBjb25zdHJhaW50ID09PSAnb2JqZWN0JyAmJiBjb25zdHJhaW50ICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChjb25zdHJhaW50LiRyZWdleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgY29uc3QgcmVnZXggPSBjb25zdHJhaW50LiRyZWdleDtcbiAgICAgICAgICBjb25zdCBpc1JlZ0V4cExpa2UgPVxuICAgICAgICAgICAgcmVnZXggIT09IG51bGwgJiZcbiAgICAgICAgICAgIHR5cGVvZiByZWdleCA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIHR5cGVvZiByZWdleC5zb3VyY2UgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgICB0eXBlb2YgcmVnZXguZmxhZ3MgPT09ICdzdHJpbmcnO1xuICAgICAgICAgIGlmICh0eXBlb2YgcmVnZXggIT09ICdzdHJpbmcnICYmICFpc1JlZ0V4cExpa2UpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgJ0ludmFsaWQgcmVndWxhciBleHByZXNzaW9uOiAkcmVnZXggbXVzdCBiZSBhIHN0cmluZyBvciBSZWdFeHAnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gaXNSZWdFeHBMaWtlID8gcmVnZXguc291cmNlIDogcmVnZXg7XG4gICAgICAgICAgY29uc3QgZmxhZ3MgPSBpc1JlZ0V4cExpa2UgPyByZWdleC5mbGFncyA6IGNvbnN0cmFpbnQuJG9wdGlvbnMgfHwgJyc7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG5ldyBSZWdFeHAocGF0dGVybiwgZmxhZ3MpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEludmFsaWQgcmVndWxhciBleHByZXNzaW9uOiAke2UubWVzc2FnZX1gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9tYXRjaGVzU3Vic2NyaXB0aW9uKHBhcnNlT2JqZWN0OiBhbnksIHN1YnNjcmlwdGlvbjogYW55KTogYm9vbGVhbiB7XG4gICAgLy8gT2JqZWN0IGlzIHVuZGVmaW5lZCBvciBudWxsLCBub3QgbWF0Y2hcbiAgICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzUXVlcnkoc3RydWN0dXJlZENsb25lKHBhcnNlT2JqZWN0KSwgc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgfVxuXG4gIGFzeW5jIF9jbGVhckNhY2hlZFJvbGVzKHVzZXJJZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHZhbGlkVG9rZW5zID0gYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5lcXVhbFRvKCd1c2VyJywgUGFyc2UuVXNlci5jcmVhdGVXaXRob3V0RGF0YSh1c2VySWQpKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICB2YWxpZFRva2Vucy5tYXAoYXN5bmMgdG9rZW4gPT4ge1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHRva2VuLmdldCgnc2Vzc2lvblRva2VuJyk7XG4gICAgICAgICAgY29uc3QgYXV0aFByb21pc2UgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBpZiAoIWF1dGhQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IFthdXRoMSwgYXV0aDJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgYXV0aFByb21pc2UsXG4gICAgICAgICAgICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHsgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlciwgc2Vzc2lvblRva2VuIH0pLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGF1dGgxLmF1dGg/LmNsZWFyUm9sZUNhY2hlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgYXV0aDIuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWxldGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYENvdWxkIG5vdCBjbGVhciByb2xlIGNhY2hlLiAke2V9YCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW4/OiBzdHJpbmcpOiBQcm9taXNlPHsgYXV0aD86IEF1dGgsIHVzZXJJZD86IHN0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM/OiBhbnksXG4gICAgb2JqZWN0PzogYW55LFxuICAgIGNsaWVudD86IGFueSxcbiAgICByZXF1ZXN0SWQ/OiBudW1iZXIsXG4gICAgb3A/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIHVzZXJJZCA9IHJlc3VsdC51c2VySWQ7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcFxuICAgICk7XG4gICAgLy8gRW5mb3JjZSBwb2ludGVyIHBlcm1pc3Npb25zIHRoYXQgdmFsaWRhdGVQZXJtaXNzaW9uIGRlZmVycy5cbiAgICAvLyBSZXR1cm5zIGZhbHNlIHRvIHNpbGVudGx5IHNraXAgdGhlIGV2ZW50IChsaWtlIEFDTCksIHJhdGhlciB0aGFuXG4gICAgLy8gdGhyb3dpbmcgd2hpY2ggd291bGQgcHVzaCBlcnJvcnMgdG8gdGhlIGNsaWVudCBhbmQgbG9nIG5vaXNlLlxuICAgIGlmICghY2xpZW50Lmhhc01hc3RlcktleSAmJiBjbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICAgIGNvbnN0IHBlcm1pc3Npb25GaWVsZCA9XG4gICAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuICAgICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IFtdO1xuICAgICAgaWYgKGNsYXNzTGV2ZWxQZXJtaXNzaW9uc1tvcF0/LnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgICAgcG9pbnRlckZpZWxkcy5wdXNoKC4uLmNsYXNzTGV2ZWxQZXJtaXNzaW9uc1tvcF0ucG9pbnRlckZpZWxkcyk7XG4gICAgICB9XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjbGFzc0xldmVsUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkpIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBjbGFzc0xldmVsUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkge1xuICAgICAgICAgIGlmICghcG9pbnRlckZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJGaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocG9pbnRlckZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIElmIHB1YmxpYyBvciB1c2VyLXNwZWNpZmljIHBlcm1pc3Npb24gYWxyZWFkeSBncmFudHMgYWNjZXNzLCBza2lwIHBvaW50ZXIgY2hlY2tcbiAgICAgICAgaWYgKFxuICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhjbGFzc0xldmVsUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKCF1c2VySWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ2hlY2sgaWYgYW55IHBvaW50ZXIgZmllbGQgcG9pbnRzIHRvIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgICAgICBjb25zdCBoYXNBY2Nlc3MgPSBwb2ludGVyRmllbGRzLnNvbWUoZmllbGQgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPVxuICAgICAgICAgICAgICB0eXBlb2Ygb2JqZWN0LmdldCA9PT0gJ2Z1bmN0aW9uJyA/IG9iamVjdC5nZXQoZmllbGQpIDogb2JqZWN0W2ZpZWxkXTtcbiAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSGFuZGxlIFBhcnNlLk9iamVjdCBwb2ludGVyIChoYXMgLmlkKVxuICAgICAgICAgICAgaWYgKHZhbHVlLmlkKSB7XG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5pZCA9PT0gdXNlcklkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSGFuZGxlIHJhdyBwb2ludGVyIEpTT04gKGhhcyAub2JqZWN0SWQpXG4gICAgICAgICAgICBpZiAodmFsdWUub2JqZWN0SWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIYW5kbGUgYXJyYXkgb2YgcG9pbnRlcnNcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUuc29tZShpdGVtID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5pZCkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uaWQgPT09IHVzZXJJZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0ub2JqZWN0SWQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpdGVtLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaWYgKCFoYXNBY2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBgYWRkUHJvdGVjdGVkRmllbGRzYCByZWFkcyByb2xlLXNjb3BlZCBgcHJvdGVjdGVkRmllbGRzYCBncm91cHMgZnJvbVxuICAvLyBgQXV0aC51c2VyUm9sZXNgLCB3aGljaCBzdGF5cyBlbXB0eSB1bmxlc3MgdGhlIHJvbGVzIGFyZSBleHBsaWNpdGx5IGxvYWRlZC5cbiAgLy8gV2l0aG91dCB0aGlzLCBldmVyeSBgcm9sZTpgIGdyb3VwIGlzIHNpbGVudGx5IHNraXBwZWQgYW5kIExpdmVRdWVyeSB3b3VsZFxuICAvLyBkaXNjbG9zZSBmaWVsZHMgdGhhdCB0aGUgUkVTVCBwYXRoIHN0cmlwcyBmb3IgdGhlIHNhbWUgY2FsbGVyLiBUaGUgcm9sZXMgYXJlXG4gIC8vIG9ubHkgZmV0Y2hlZCB3aGVuIHRoZSBjbGFzcyBhY3R1YWxseSBkZWNsYXJlcyBhIGByb2xlOmAgZ3JvdXAsIHNvIGNsYXNzZXNcbiAgLy8gd2l0aG91dCBvbmUga2VlcCBzdWJzY3JpYmluZyBhbmQgcmVjZWl2aW5nIGV2ZW50cyB3aXRob3V0IGEgcm9sZSBsb29rdXAuXG4gIGFzeW5jIF9sb2FkUm9sZXNGb3JQcm90ZWN0ZWRGaWVsZHMoY2xhc3NMZXZlbFBlcm1pc3Npb25zPzogYW55LCBjbGllbnRBdXRoPzogYW55KSB7XG4gICAgaWYgKHR5cGVvZiBjbGllbnRBdXRoPy5nZXRVc2VyUm9sZXMgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5wcm90ZWN0ZWRGaWVsZHM7XG4gICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMgfHwgQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghT2JqZWN0LmtleXMocHJvdGVjdGVkRmllbGRzKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgY2xpZW50QXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgfVxuXG4gIGFzeW5jIF9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucz86IGFueSxcbiAgICByZXM/OiBhbnksXG4gICAgY2xpZW50PzogYW55LFxuICAgIHJlcXVlc3RJZD86IG51bWJlcixcbiAgICBvcD86IHN0cmluZyxcbiAgICBxdWVyeT86IGFueVxuICApIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCBjbGllbnRBdXRoO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIC8vIEZhbGwgYmFjayB0byB0aGUgY29ubmVjdC1mcmFtZSB0b2tlbiwgdGhlIHNhbWUgd2F5IGBfbWF0Y2hlc0FDTGAgYW5kXG4gICAgICAvLyBgZ2V0QXV0aEZyb21DbGllbnRgIGFscmVhZHkgZG8uIFRoZSBzdWJzY3JpYmUgZnJhbWUncyBzZXNzaW9uIHRva2VuIGlzXG4gICAgICAvLyBvcHRpb25hbCwgc28gcmVzb2x2aW5nIG9ubHkgaXQgd291bGQgcmVkYWN0IGFnYWluc3QgYW4gYW5vbnltb3VzIGlkZW50aXR5XG4gICAgICAvLyB3aGlsZSB0aGUgQUNMIGNoZWNrIGF1dGhvcml6ZWQgdGhlIHJlYWQgYWdhaW5zdCB0aGUgY29ubmVjdGVkIHVzZXIuIFRoYXRcbiAgICAgIC8vIG1pc21hdGNoIHNraXBzIGV2ZXJ5IGlkZW50aXR5LWRlcml2ZWQgYHByb3RlY3RlZEZpZWxkc2AgZ3JvdXBcbiAgICAgIC8vIChgcm9sZTpgLCBgYXV0aGVudGljYXRlZGAgYW5kIGA8b2JqZWN0SWQ+YCkuXG4gICAgICBjb25zdCB7IHVzZXJJZCwgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKFxuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiB8fCBjbGllbnQuc2Vzc2lvblRva2VuXG4gICAgICApO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBjbGllbnRBdXRoID0gYXV0aDtcbiAgICB9XG4gICAgaWYgKCFjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICBhd2FpdCB0aGlzLl9sb2FkUm9sZXNGb3JQcm90ZWN0ZWRGaWVsZHMoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBjbGllbnRBdXRoKTtcbiAgICB9XG4gICAgY29uc3QgZmlsdGVyID0gb2JqID0+IHtcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM/LnByb3RlY3RlZEZpZWxkcyB8fCBbXTtcbiAgICAgIGlmIChjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IFtdO1xuICAgICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGdldERhdGFiYXNlQ29udHJvbGxlcih0aGlzLmNvbmZpZykuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICByZXMub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICBjbGllbnRBdXRoXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gRGF0YWJhc2VDb250cm9sbGVyLmZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgIGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGZhbHNlLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgY2xpZW50QXV0aCxcbiAgICAgICAgb3AsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgb2JqLFxuICAgICAgICBxdWVyeVxuICAgICAgKTtcbiAgICB9O1xuICAgIHJlcy5vYmplY3QgPSBmaWx0ZXIocmVzLm9iamVjdCk7XG4gICAgcmVzLm9yaWdpbmFsID0gZmlsdGVyKHJlcy5vcmlnaW5hbCk7XG4gIH1cblxuICBfZ2V0Q0xQT3BlcmF0aW9uKHF1ZXJ5OiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mIHF1ZXJ5ID09PSAnb2JqZWN0JyAmJlxuICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PSAxICYmXG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICA/ICdnZXQnXG4gICAgICA6ICdmaW5kJztcbiAgfVxuXG4gIGFzeW5jIF92ZXJpZnlBQ0woYWNsOiBhbnksIHRva2VuOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgeyBhdXRoLCB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih0b2tlbik7XG5cbiAgICAvLyBHZXR0aW5nIHRoZSBzZXNzaW9uIHRva2VuIGZhaWxlZFxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBubyBhZGRpdGlvbmFsIGF1dGggaXMgYXZhaWxhYmxlXG4gICAgLy8gQXQgdGhpcyBwb2ludCwganVzdCBiYWlsIG91dCBhcyBubyBhZGRpdGlvbmFsIHZpc2liaWxpdHkgY2FuIGJlIGluZmVycmVkLlxuICAgIGlmICghYXV0aCB8fCAhdXNlcklkKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCA9IGFjbC5nZXRSZWFkQWNjZXNzKHVzZXJJZCk7XG4gICAgaWYgKGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHVzZXIgaGFzIGFueSByb2xlcyB0aGF0IG1hdGNoIHRoZSBBQ0xcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gUmVzb2x2ZSBmYWxzZSByaWdodCBhd2F5IGlmIHRoZSBhY2wgZG9lc24ndCBoYXZlIGFueSByb2xlc1xuICAgICAgICBjb25zdCBhY2xfaGFzX3JvbGVzID0gT2JqZWN0LmtleXMoYWNsLnBlcm1pc3Npb25zQnlJZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpO1xuICAgICAgICBpZiAoIWFjbF9oYXNfcm9sZXMpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRBdXRoRnJvbUNsaWVudChjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIsIHNlc3Npb25Ub2tlbj86IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIF9jaGVja1dhdGNoRmllbGRzKGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IGFueSwgbWVzc2FnZTogYW55KSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3Qgd2F0Y2ggPSBzdWJzY3JpcHRpb25JbmZvPy53YXRjaDtcbiAgICBpZiAoIXdhdGNoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qgb2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgcmV0dXJuIHdhdGNoLnNvbWUoZmllbGQgPT4gIWlzRGVlcFN0cmljdEVxdWFsKG9iamVjdC5nZXQoZmllbGQpLCBvcmlnaW5hbD8uZ2V0KGZpZWxkKSkpO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNBQ0woYWNsOiBhbnksIGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIFJldHVybiB0cnVlIGRpcmVjdGx5IGlmIEFDTCBpc24ndCBwcmVzZW50LCBBQ0wgaXMgcHVibGljIHJlYWQsIG9yIGNsaWVudCBoYXMgbWFzdGVyIGtleVxuICAgIGlmICghYWNsIHx8IGFjbC5nZXRQdWJsaWNSZWFkQWNjZXNzKCkgfHwgY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHN1YnNjcmlwdGlvbiBzZXNzaW9uVG9rZW4gbWF0Y2hlcyBBQ0wgZmlyc3RcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uVG9rZW4gPSBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbjtcbiAgICBjb25zdCBjbGllbnRTZXNzaW9uVG9rZW4gPSBjbGllbnQuc2Vzc2lvblRva2VuO1xuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIHN1YnNjcmlwdGlvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIGNsaWVudFNlc3Npb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLl92YWxpZGF0ZUtleXMocmVxdWVzdCwgdGhpcy5rZXlQYWlycykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDQsICdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIGxvZ2dlci5lcnJvcignS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhhc01hc3RlcktleSA9IHRoaXMuX2hhc01hc3RlcktleShyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IHV1aWR2NCgpO1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoXG4gICAgICBjbGllbnRJZCxcbiAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgaGFzTWFzdGVyS2V5LFxuICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICByZXF1ZXN0Lmluc3RhbGxhdGlvbklkXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxdWVzdC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgdXNlcjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKCdAQ29ubmVjdCcsICdiZWZvcmVDb25uZWN0JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXEuc2Vzc2lvblRva2VuKTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlQ29ubmVjdC5AQ29ubmVjdGAsIHJlcSwgYXV0aCk7XG4gICAgICB9XG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCA9IGNsaWVudElkO1xuICAgICAgdGhpcy5jbGllbnRzLnNldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNsaWVudC5wdXNoQ29ubmVjdCgpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhyZXEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICBsZXQgY2xpZW50QXV0aDtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBjbGllbnRBdXRoID0gYXV0aDtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICAgICAgICBwYXJzZVF1ZXJ5LndpdGhKU09OKHJlcXVlc3QucXVlcnkpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlU3Vic2NyaWJlLiR7Y2xhc3NOYW1lfWAsIHJlcXVlc3QsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVxdWVzdC5xdWVyeS50b0pTT04oKTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgICAgfVxuXG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSB7XG4gICAgICAgIGlmICghYXV0aENhbGxlZCkge1xuICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KFxuICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWQsXG4gICAgICAgICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICAgICAgICk7XG4gICAgICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0LnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnF1ZXJ5LndoZXJlLnVzZXIgPSByZXF1ZXN0LnVzZXIudG9Qb2ludGVyKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIFZhbGlkYXRlIHF1ZXJ5IGNvbmRpdGlvbiBkZXB0aFxuICAgICAgY29uc3QgYXBwQ29uZmlnID0gQ29uZmlnLmdldCh0aGlzLmNvbmZpZy5hcHBJZCk7XG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgICAgY29uc3QgcmMgPSBhcHBDb25maWcucmVxdWVzdENvbXBsZXhpdHk7XG4gICAgICAgIGlmIChyYyAmJiByYy5xdWVyeURlcHRoICE9PSAtMSkge1xuICAgICAgICAgIGNvbnN0IG1heERlcHRoID0gcmMucXVlcnlEZXB0aDtcbiAgICAgICAgICBjb25zdCBjaGVja0RlcHRoID0gKG5vZGU6IGFueSwgZGVwdGg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGRlcHRoID4gbWF4RGVwdGgpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgICAgYFF1ZXJ5IGNvbmRpdGlvbiBuZXN0aW5nIGRlcHRoIGV4Y2VlZHMgbWF4aW11bSBhbGxvd2VkIGRlcHRoIG9mICR7bWF4RGVwdGh9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vZGUgPT09IG51bGwgfHwgdHlwZW9mIG5vZGUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUpKSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBub2RlKSB7XG4gICAgICAgICAgICAgICAgY2hlY2tEZXB0aChpdGVtLCBkZXB0aCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRGVzY2VuZCBpbnRvIGV2ZXJ5IHZhbHVlIHNvIHRoYXQgbG9naWNhbCBvcGVyYXRvcnMgKCRvci8kYW5kLyRub3IpXG4gICAgICAgICAgICAvLyBuZXN0ZWQgdW5kZXIgZmllbGQtbGV2ZWwgb3BlcmF0b3JzIChlLmcuICRlbGVtTWF0Y2gsICRub3QpIG9yIHBsYWluXG4gICAgICAgICAgICAvLyBmaWVsZCBuYW1lcyBhcmUgc3RpbGwgY291bnRlZC4gT25seSBsb2dpY2FsIG9wZXJhdG9ycyBpbmNyZWFzZSB0aGVcbiAgICAgICAgICAgIC8vIGRlcHRoLCB3aGljaCBwcmVzZXJ2ZXMgdGhlIGRvY3VtZW50ZWQgbWVhbmluZyBvZiBgcXVlcnlEZXB0aGAuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhub2RlKSkge1xuICAgICAgICAgICAgICBjb25zdCBpc0xvZ2ljYWwgPSBrZXkgPT09ICckb3InIHx8IGtleSA9PT0gJyRhbmQnIHx8IGtleSA9PT0gJyRub3InO1xuICAgICAgICAgICAgICBpZiAoaXNMb2dpY2FsICYmICFBcnJheS5pc0FycmF5KG5vZGVba2V5XSkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYCR7a2V5fSBtdXN0IGJlIGFuIGFycmF5YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY2hlY2tEZXB0aChub2RlW2tleV0sIGlzTG9naWNhbCA/IGRlcHRoICsgMSA6IGRlcHRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICAgIGNoZWNrRGVwdGgocmVxdWVzdC5xdWVyeS53aGVyZSwgMCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgQ0xQIGZvciBzdWJzY3JpYmUgb3BlcmF0aW9uXG4gICAgICBjb25zdCBzY2hlbWFDb250cm9sbGVyID0gYXdhaXQgYXBwQ29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHNjaGVtYUNvbnRyb2xsZXIuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIGNvbnN0IGFjbEdyb3VwID0gWycqJ107XG4gICAgICBpZiAoIWF1dGhDYWxsZWQpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgY2xpZW50LFxuICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkLFxuICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICk7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBjbGllbnRBdXRoID0gYXV0aDtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgIGFjbEdyb3VwLnB1c2goYXV0aC51c2VyLmlkKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnVzZXIpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaChyZXF1ZXN0LnVzZXIuaWQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG5cbiAgICAgIC8vIENoZWNrIHByb3RlY3RlZCBmaWVsZHMgaW4gV0hFUkUgY2xhdXNlIGFuZCBXQVRDSCBwYXJhbWV0ZXJcbiAgICAgIGlmICghY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgICBhd2FpdCB0aGlzLl9sb2FkUm9sZXNGb3JQcm90ZWN0ZWRGaWVsZHMoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBjbGllbnRBdXRoKTtcbiAgICAgICAgLy8gYGNsaWVudEF1dGhgIGlzIHVuZGVmaW5lZCBvbmx5IHdoZW4gbm8gc2Vzc2lvbiB0b2tlbiB3YXMgc3VwcGxpZWQgb25cbiAgICAgICAgLy8gZWl0aGVyIGZyYW1lLCBpbiB3aGljaCBjYXNlIGEgYGJlZm9yZVN1YnNjcmliZWAgdHJpZ2dlciBpcyB0aGUgb25seSB3YXlcbiAgICAgICAgLy8gYHJlcXVlc3QudXNlcmAgY2FuIGJlIHNldC4gVGhlcmUgaXMgbm8gc2Vzc2lvbiB0byByZXNvbHZlIHJvbGVzIGZyb20gZm9yXG4gICAgICAgIC8vIHN1Y2ggYSB0cmlnZ2VyLWFzc2lnbmVkIHVzZXIsIHNvIGByb2xlOmAgZ3JvdXBzIGNhbm5vdCBiZSBhcHBsaWVkIHRvIGl0LlxuICAgICAgICBjb25zdCBhdXRoID0gcmVxdWVzdC51c2VyID8gY2xpZW50QXV0aCB8fCB7IHVzZXI6IHJlcXVlc3QudXNlciwgdXNlclJvbGVzOiBbXSB9IDoge307XG4gICAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9XG4gICAgICAgICAgYXBwQ29uZmlnLmRhdGFiYXNlLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUsXG4gICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgIGF1dGhcbiAgICAgICAgICApIHx8IFtdO1xuICAgICAgICBpZiAocHJvdGVjdGVkRmllbGRzLmxlbmd0aCA+IDAgJiYgcmVxdWVzdC5xdWVyeS53aGVyZSkge1xuICAgICAgICAgIGNvbnN0IGNoZWNrV2hlcmUgPSAod2hlcmU6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB3aGVyZSAhPT0gJ29iamVjdCcgfHwgd2hlcmUgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCB3aGVyZUtleSBvZiBPYmplY3Qua2V5cyh3aGVyZSkpIHtcbiAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkID0gd2hlcmVLZXkuc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyh3aGVyZUtleSkgfHwgcHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHJvb3RGaWVsZCkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkJ1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3Qgb3Agb2YgWyckb3InLCAnJGFuZCcsICckbm9yJ10pIHtcbiAgICAgICAgICAgICAgaWYgKHdoZXJlW29wXSAhPT0gdW5kZWZpbmVkICYmICFBcnJheS5pc0FycmF5KHdoZXJlW29wXSkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYCR7b3B9IG11c3QgYmUgYW4gYXJyYXlgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh3aGVyZVtvcF0pKSB7XG4gICAgICAgICAgICAgICAgd2hlcmVbb3BdLmZvckVhY2goKHN1YlF1ZXJ5OiBhbnkpID0+IGNoZWNrV2hlcmUoc3ViUXVlcnkpKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgICAgY2hlY2tXaGVyZShyZXF1ZXN0LnF1ZXJ5LndoZXJlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocHJvdGVjdGVkRmllbGRzLmxlbmd0aCA+IDAgJiYgQXJyYXkuaXNBcnJheShyZXF1ZXN0LnF1ZXJ5LndhdGNoKSkge1xuICAgICAgICAgIGZvciAoY29uc3Qgd2F0Y2hGaWVsZCBvZiByZXF1ZXN0LnF1ZXJ5LndhdGNoKSB7XG4gICAgICAgICAgICBjb25zdCByb290RmllbGQgPSB3YXRjaEZpZWxkLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgICBpZiAocHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHdhdGNoRmllbGQpIHx8IHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyhyb290RmllbGQpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgcmVnZXggcGF0dGVybnMgaW4gdGhlIHN1YnNjcmlwdGlvbiBxdWVyeVxuICAgICAgdGhpcy5fdmFsaWRhdGVRdWVyeUNvbnN0cmFpbnRzKHJlcXVlc3QucXVlcnkud2hlcmUpO1xuXG4gICAgICAvLyBHZXQgc3Vic2NyaXB0aW9uIGZyb20gc3Vic2NyaXB0aW9ucywgY3JlYXRlIG9uZSBpZiBuZWNlc3NhcnlcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkhhc2ggPSBxdWVyeUhhc2gocmVxdWVzdC5xdWVyeSk7XG4gICAgICAvLyBBZGQgY2xhc3NOYW1lIHRvIHN1YnNjcmlwdGlvbnMgaWYgbmVjZXNzYXJ5XG5cbiAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25zLmhhcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NOYW1lLCBuZXcgTWFwKCkpO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgICAgbGV0IHN1YnNjcmlwdGlvbjtcbiAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuaGFzKHN1YnNjcmlwdGlvbkhhc2gpKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IGNsYXNzU3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKGNsYXNzTmFtZSwgcmVxdWVzdC5xdWVyeS53aGVyZSwgc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uSGFzaCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHN1YnNjcmlwdGlvbkluZm8gdG8gY2xpZW50XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvOiBhbnkgPSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbjogc3Vic2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICAgIC8vIEFkZCBzZWxlY3RlZCBmaWVsZHMsIHNlc3Npb25Ub2tlbiBhbmQgaW5zdGFsbGF0aW9uSWQgZm9yIHRoaXMgc3Vic2NyaXB0aW9uIGlmIG5lY2Vzc2FyeVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkua2V5cykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmtleXMgPSBBcnJheS5pc0FycmF5KHJlcXVlc3QucXVlcnkua2V5cylcbiAgICAgICAgICA/IHJlcXVlc3QucXVlcnkua2V5c1xuICAgICAgICAgIDogcmVxdWVzdC5xdWVyeS5rZXlzLnNwbGl0KCcsJyk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS53YXRjaCkge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLndhdGNoID0gcmVxdWVzdC5xdWVyeS53YXRjaDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnNlc3Npb25Ub2tlbikge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiA9IHJlcXVlc3Quc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgICAvLyBBZGQgY2xpZW50SWQgdG8gc3Vic2NyaXB0aW9uXG4gICAgICBzdWJzY3JpcHRpb24uYWRkQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgIGBDcmVhdGUgY2xpZW50ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IG5ldyBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXI6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdzdWJzY3JpYmUnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3QucmVxdWVzdElkKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEdBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLGFBQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLHFCQUFBLEdBQUFKLE9BQUE7QUFFQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxjQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxXQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxZ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LDBDQUEwQyxHQUN4Q3ZCLGNBQWMsQ0FBQ3dELFFBQVEsR0FDdkIsa0JBQWtCLEdBQ2xCTSxTQUNKLENBQUM7TUFDRDtJQUNGOztJQUVBO0lBQ0FoRCxNQUFNLENBQUMrTyxzQkFBc0IsQ0FBQy9MLFNBQVMsQ0FBQztJQUN4QztJQUNBLE1BQU1ULFlBQVksR0FBRzRFLGdCQUFnQixDQUFDNUUsWUFBWTtJQUNsRCxNQUFNWixTQUFTLEdBQUdZLFlBQVksQ0FBQ1osU0FBUztJQUN4Q1ksWUFBWSxDQUFDOEUsd0JBQXdCLENBQUNuSSxjQUFjLENBQUN3RCxRQUFRLEVBQUVNLFNBQVMsQ0FBQztJQUN6RTtJQUNBLE1BQU1aLGtCQUFrQixHQUFHLElBQUksQ0FBQzNFLGFBQWEsQ0FBQzRFLEdBQUcsQ0FBQ1YsU0FBUyxDQUFDO0lBQzVELElBQUksQ0FBQ1ksWUFBWSxDQUFDK0Usb0JBQW9CLENBQUMsQ0FBQyxFQUFFO01BQ3hDbEYsa0JBQWtCLENBQUM4RSxNQUFNLENBQUMzRSxZQUFZLENBQUNxRCxJQUFJLENBQUM7SUFDOUM7SUFDQTtJQUNBLElBQUl4RCxrQkFBa0IsQ0FBQ0QsSUFBSSxLQUFLLENBQUMsRUFBRTtNQUNqQyxJQUFJLENBQUMxRSxhQUFhLENBQUN5SixNQUFNLENBQUN2RixTQUFTLENBQUM7SUFDdEM7SUFDQSxJQUFBc0YsbUNBQXlCLEVBQUM7TUFDeEJqSCxNQUFNO01BQ042RCxLQUFLLEVBQUUsYUFBYTtNQUNwQnRHLE9BQU8sRUFBRSxJQUFJLENBQUNBLE9BQU8sQ0FBQzRFLElBQUk7TUFDMUIxRSxhQUFhLEVBQUUsSUFBSSxDQUFDQSxhQUFhLENBQUMwRSxJQUFJO01BQ3RDMkIsWUFBWSxFQUFFcUQsZ0JBQWdCLENBQUNyRCxZQUFZO01BQzNDRSxZQUFZLEVBQUVoRSxNQUFNLENBQUNpRSxZQUFZO01BQ2pDQyxjQUFjLEVBQUVsRSxNQUFNLENBQUNrRTtJQUN6QixDQUFDLENBQUM7SUFFRixJQUFJLENBQUM0SyxZQUFZLEVBQUU7TUFDakI7SUFDRjtJQUVBOU8sTUFBTSxDQUFDZ1AsZUFBZSxDQUFDekksT0FBTyxDQUFDdkQsU0FBUyxDQUFDO0lBRXpDN0UsZUFBTSxDQUFDQyxPQUFPLENBQ1osa0JBQWtCYyxjQUFjLENBQUN3RCxRQUFRLG9CQUFvQjZELE9BQU8sQ0FBQ3ZELFNBQVMsRUFDaEYsQ0FBQztFQUNIO0FBQ0Y7QUFBQ2lNLE9BQUEsQ0FBQS9SLG9CQUFBLEdBQUFBLG9CQUFBIiwiaWdub3JlTGlzdCI6W119