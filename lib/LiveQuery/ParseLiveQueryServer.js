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
  async _filterSensitiveData(classLevelPermissions, res, client, requestId, op, query) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let clientAuth;
    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId,
        auth
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);
      if (userId) {
        aclGroup.push(userId);
      }
      clientAuth = auth;
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
    try {
      const trigger = (0, _triggers.getTrigger)(className, 'beforeSubscribe', _node.default.applicationId);
      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
        authCalled = true;
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
        const auth = request.user ? {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfQ29uZmlnIiwiX2xydUNhY2hlIiwiX1VzZXJzUm91dGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl91dGlsIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImdldENhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsInR0bCIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwiY29ubmVjdCIsImlzT3BlbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2NyZWF0ZVN1YnNjcmliZXJzIiwic2h1dGRvd24iLCJhbGwiLCJ2YWx1ZXMiLCJtYXAiLCJjbGllbnQiLCJwYXJzZVdlYlNvY2tldCIsIndzIiwiY2xvc2UiLCJBcnJheSIsImZyb20iLCJ1bnN1YnNjcmliZSIsInF1aXQiLCJlcnIiLCJlcnJvciIsIm1lc3NhZ2VSZWNpZXZlZCIsImNoYW5uZWwiLCJtZXNzYWdlU3RyIiwibWVzc2FnZSIsIkpTT04iLCJwYXJzZSIsIl9jbGVhckNhY2hlZFJvbGVzIiwidXNlcklkIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwib24iLCJmaWVsZCIsInN1YnNjcmliZSIsImN1cnJlbnRQYXJzZU9iamVjdCIsIlVzZXJSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiY2xhc3NOYW1lIiwicGFyc2VPYmplY3QiLCJfZmluaXNoRmV0Y2giLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiZGVsZXRlZFBhcnNlT2JqZWN0IiwidG9KU09OIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaWQiLCJzaXplIiwiY2xhc3NTdWJzY3JpcHRpb25zIiwiZ2V0IiwiZGVidWciLCJzdWJzY3JpcHRpb24iLCJpc1N1YnNjcmlwdGlvbk1hdGNoZWQiLCJfbWF0Y2hlc1N1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkcyIsIl8iLCJlbnRyaWVzIiwiY2xpZW50UmVxdWVzdElkcyIsImZvckVhY2giLCJyZXF1ZXN0SWQiLCJsb2NhbERlbGV0ZWRQYXJzZU9iamVjdCIsInN0cmluZ2lmeSIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwibWF0Y2hlc0NMUCIsIl9tYXRjaGVzQ0xQIiwiaXNNYXRjaGVkIiwiX21hdGNoZXNBQ0wiLCJldmVudCIsInNlc3Npb25Ub2tlbiIsIm9iamVjdCIsInVzZU1hc3RlcktleSIsImhhc01hc3RlcktleSIsImluc3RhbGxhdGlvbklkIiwic2VuZEV2ZW50IiwidHJpZ2dlciIsImdldFRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJydW5UcmlnZ2VyIiwidG9KU09Od2l0aE9iamVjdHMiLCJfZmlsdGVyU2Vuc2l0aXZlRGF0YSIsInB1c2hEZWxldGUiLCJyZXNvbHZlRXJyb3IiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJjb2RlIiwiaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkIiwibG9jYWxDdXJyZW50UGFyc2VPYmplY3QiLCJsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIm9yaWdpbmFsQUNMIiwiY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSIsImN1cnJlbnRBQ0wiLCJpc09yaWdpbmFsTWF0Y2hlZCIsImlzQ3VycmVudE1hdGNoZWQiLCJoYXNoIiwidHlwZSIsIndhdGNoRmllbGRzQ2hhbmdlZCIsIl9jaGVja1dhdGNoRmllbGRzIiwiY3VycmVudFJlYWRhYmxlIiwib3JpZ2luYWxSZWFkYWJsZSIsIm9yaWdpbmFsIiwiZnVuY3Rpb25OYW1lIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJzbGljZSIsInJlcXVlc3QiLCJ0djQiLCJ2YWxpZGF0ZSIsIlJlcXVlc3RTY2hlbWEiLCJfaGFuZGxlQ29ubmVjdCIsIl9oYW5kbGVTdWJzY3JpYmUiLCJfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uIiwiX2hhbmRsZVVuc3Vic2NyaWJlIiwiaW5mbyIsImhhcyIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsIl92YWxpZGF0ZVF1ZXJ5Q29uc3RyYWludHMiLCJ3aGVyZSIsInVuZGVmaW5lZCIsImlzQXJyYXkiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJzdWJRdWVyeSIsImNvbnN0cmFpbnQiLCIkcmVnZXgiLCJyZWdleCIsImlzUmVnRXhwTGlrZSIsInNvdXJjZSIsImZsYWdzIiwicGF0dGVybiIsIiRvcHRpb25zIiwiUmVnRXhwIiwibWF0Y2hlc1F1ZXJ5Iiwic3RydWN0dXJlZENsb25lIiwidmFsaWRUb2tlbnMiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiVXNlciIsImNyZWF0ZVdpdGhvdXREYXRhIiwiZmluZCIsInRva2VuIiwiYXV0aFByb21pc2UiLCJhdXRoMSIsImF1dGgyIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImNsZWFyUm9sZUNhY2hlIiwiZnJvbUNhY2hlIiwidGhlbiIsImNhdGNoIiwicmVzdWx0IiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImFjbEdyb3VwIiwicHVzaCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJwZXJtaXNzaW9uRmllbGQiLCJpbmRleE9mIiwicG9pbnRlckZpZWxkcyIsImluY2x1ZGVzIiwibGVuZ3RoIiwidGVzdFBlcm1pc3Npb25zIiwiaGFzQWNjZXNzIiwic29tZSIsInZhbHVlIiwib2JqZWN0SWQiLCJpdGVtIiwiY2xpZW50QXV0aCIsImZpbHRlciIsIm9iaiIsInByb3RlY3RlZEZpZWxkcyIsImdldERhdGFiYXNlQ29udHJvbGxlciIsImFkZFByb3RlY3RlZEZpZWxkcyIsIkRhdGFiYXNlQ29udHJvbGxlciIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJfdmVyaWZ5QUNMIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50Iiwid2F0Y2giLCJpc0RlZXBTdHJpY3RFcXVhbCIsImdldFB1YmxpY1JlYWRBY2Nlc3MiLCJzdWJzY3JpcHRpb25Ub2tlbiIsImNsaWVudFNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZUtleXMiLCJfaGFzTWFzdGVyS2V5IiwidXVpZHY0IiwicmVxIiwicHVzaENvbm5lY3QiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaXNWYWxpZCIsInNlY3JldCIsImF1dGhDYWxsZWQiLCJwYXJzZVF1ZXJ5Iiwid2l0aEpTT04iLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJhcHBDb25maWciLCJDb25maWciLCJyYyIsInJlcXVlc3RDb21wbGV4aXR5IiwicXVlcnlEZXB0aCIsIm1heERlcHRoIiwiY2hlY2tEZXB0aCIsIm5vZGUiLCJkZXB0aCIsImlzTG9naWNhbCIsInNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJ1c2VyUm9sZXMiLCJjaGVja1doZXJlIiwid2hlcmVLZXkiLCJyb290RmllbGQiLCJzcGxpdCIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJ3YXRjaEZpZWxkIiwic3Vic2NyaXB0aW9uSGFzaCIsInF1ZXJ5SGFzaCIsIlN1YnNjcmlwdGlvbiIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG4vLyBAdHMtaWdub3JlXG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtcbiAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyxcbiAgZ2V0VHJpZ2dlcixcbiAgcnVuVHJpZ2dlcixcbiAgcmVzb2x2ZUVycm9yLFxuICB0b0pTT053aXRoT2JqZWN0cyxcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiwgQXV0aCB9IGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHsgZ2V0Q2FjaGVDb250cm9sbGVyLCBnZXREYXRhYmFzZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgeyBMUlVDYWNoZSBhcyBMUlUgfSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IFVzZXJSb3V0ZXIgZnJvbSAnLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuXG5cbmNsYXNzIFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIHtcbiAgc2VydmVyOiBhbnk7XG4gIGNvbmZpZzogYW55O1xuICBjbGllbnRzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAvLyBjbGFzc05hbWUgLT4gKHF1ZXJ5SGFzaCAtPiBzdWJzY3JpcHRpb24pXG4gIHN1YnNjcmlwdGlvbnM6IE1hcDxzdHJpbmcsIGFueT47XG4gIHBhcnNlV2ViU29ja2V0U2VydmVyOiBhbnk7XG4gIGtleVBhaXJzOiBhbnk7XG4gIC8vIFRoZSBzdWJzY3JpYmVyIHdlIHVzZSB0byBnZXQgb2JqZWN0IHVwZGF0ZSBmcm9tIHB1Ymxpc2hlclxuICBzdWJzY3JpYmVyOiBhbnk7XG4gIGF1dGhDYWNoZTogYW55O1xuICBjYWNoZUNvbnRyb2xsZXI6IGFueTtcblxuICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGFueSwgY29uZmlnOiBhbnkgPSB7fSwgcGFyc2VTZXJ2ZXJDb25maWc6IGFueSA9IHt9KSB7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgdGhpcy5jbGllbnRzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIGNvbmZpZy5hcHBJZCA9IGNvbmZpZy5hcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIGNvbmZpZy5tYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5IHx8IFBhcnNlLm1hc3RlcktleTtcblxuICAgIC8vIFN0b3JlIGtleXMsIGNvbnZlcnQgb2JqIHRvIG1hcFxuICAgIGNvbnN0IGtleVBhaXJzID0gY29uZmlnLmtleVBhaXJzIHx8IHt9O1xuICAgIHRoaXMua2V5UGFpcnMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5UGFpcnMpKSB7XG4gICAgICB0aGlzLmtleVBhaXJzLnNldChrZXksIGtleVBhaXJzW2tleV0pO1xuICAgIH1cbiAgICBsb2dnZXIudmVyYm9zZSgnU3VwcG9ydCBrZXkgcGFpcnMnLCB0aGlzLmtleVBhaXJzKTtcblxuICAgIC8vIEluaXRpYWxpemUgUGFyc2VcbiAgICBQYXJzZS5PYmplY3QuZGlzYWJsZVNpbmdsZUluc3RhbmNlKCk7XG4gICAgY29uc3Qgc2VydmVyVVJMID0gY29uZmlnLnNlcnZlclVSTCB8fCBQYXJzZS5zZXJ2ZXJVUkw7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIFBhcnNlLmluaXRpYWxpemUoY29uZmlnLmFwcElkLCBQYXJzZS5qYXZhU2NyaXB0S2V5LCBjb25maWcubWFzdGVyS2V5KTtcblxuICAgIC8vIFRoZSBjYWNoZSBjb250cm9sbGVyIGlzIGEgcHJvcGVyIGNhY2hlIGNvbnRyb2xsZXJcbiAgICAvLyB3aXRoIGFjY2VzcyB0byBVc2VyIGFuZCBSb2xlc1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gZ2V0Q2FjaGVDb250cm9sbGVyKHBhcnNlU2VydmVyQ29uZmlnKTtcblxuICAgIGNvbmZpZy5jYWNoZVRpbWVvdXQgPSBjb25maWcuY2FjaGVUaW1lb3V0IHx8IDUgKiAxMDAwOyAvLyA1c1xuXG4gICAgLy8gVGhpcyBhdXRoIGNhY2hlIHN0b3JlcyB0aGUgcHJvbWlzZXMgZm9yIGVhY2ggYXV0aCByZXNvbHV0aW9uLlxuICAgIC8vIFRoZSBtYWluIGJlbmVmaXQgaXMgdG8gYmUgYWJsZSB0byByZXVzZSB0aGUgc2FtZSB1c2VyIC8gc2Vzc2lvbiB0b2tlbiByZXNvbHV0aW9uLlxuICAgIHRoaXMuYXV0aENhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IDUwMCwgLy8gNTAwIGNvbmN1cnJlbnRcbiAgICAgIHR0bDogY29uZmlnLmNhY2hlVGltZW91dCxcbiAgICB9KTtcbiAgICAvLyBJbml0aWFsaXplIHdlYnNvY2tldCBzZXJ2ZXJcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyID0gbmV3IFBhcnNlV2ViU29ja2V0U2VydmVyKFxuICAgICAgc2VydmVyLFxuICAgICAgcGFyc2VXZWJzb2NrZXQgPT4gdGhpcy5fb25Db25uZWN0KHBhcnNlV2Vic29ja2V0KSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgdGhpcy5zdWJzY3JpYmVyID0gUGFyc2VQdWJTdWIuY3JlYXRlU3Vic2NyaWJlcihjb25maWcpO1xuICAgIGlmICghdGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QpIHtcbiAgICAgIHRoaXMuY29ubmVjdCgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuc3Vic2NyaWJlci5pc09wZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLnN1YnNjcmliZXIuY29ubmVjdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc3Vic2NyaWJlci5jb25uZWN0KCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnN1YnNjcmliZXIuaXNPcGVuID0gdHJ1ZTtcbiAgICB9XG4gICAgdGhpcy5fY3JlYXRlU3Vic2NyaWJlcnMoKTtcbiAgfVxuXG4gIGFzeW5jIHNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLnN1YnNjcmliZXIuaXNPcGVuKSB7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgIC4uLlsuLi50aGlzLmNsaWVudHMudmFsdWVzKCldLm1hcChjbGllbnQgPT4gY2xpZW50LnBhcnNlV2ViU29ja2V0LndzLmNsb3NlKCkpLFxuICAgICAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyLmNsb3NlPy4oKSxcbiAgICAgICAgLi4uQXJyYXkuZnJvbSh0aGlzLnN1YnNjcmliZXIuc3Vic2NyaXB0aW9ucz8ua2V5cygpIHx8IFtdKS5tYXAoa2V5ID0+XG4gICAgICAgICAgdGhpcy5zdWJzY3JpYmVyLnVuc3Vic2NyaWJlKGtleSlcbiAgICAgICAgKSxcbiAgICAgICAgdGhpcy5zdWJzY3JpYmVyLmNsb3NlPy4oKSxcbiAgICAgIF0pO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuc3Vic2NyaWJlci5xdWl0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnN1YnNjcmliZXIucXVpdCgpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignUHViU3ViQWRhcHRlciBlcnJvciBvbiBzaHV0ZG93bicsIHsgZXJyb3I6IGVyciB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLmlzT3BlbiA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIF9jcmVhdGVTdWJzY3JpYmVycygpIHtcbiAgICBjb25zdCBtZXNzYWdlUmVjaWV2ZWQgPSAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2NsZWFyQ2FjaGUnKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyQ2FjaGVkUm9sZXMobWVzc2FnZS51c2VySWQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH07XG4gICAgdGhpcy5zdWJzY3JpYmVyLm9uKCdtZXNzYWdlJywgKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IG1lc3NhZ2VSZWNpZXZlZChjaGFubmVsLCBtZXNzYWdlU3RyKSk7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBbJ2FmdGVyU2F2ZScsICdhZnRlckRlbGV0ZScsICdjbGVhckNhY2hlJ10pIHtcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBgJHtQYXJzZS5hcHBsaWNhdGlvbklkfSR7ZmllbGR9YDtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoY2hhbm5lbCwgbWVzc2FnZVN0ciA9PiBtZXNzYWdlUmVjaWV2ZWQoY2hhbm5lbCwgbWVzc2FnZVN0cikpO1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgSlNPTiBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0IEpTT04uXG4gIF9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgLy8gSW5mbGF0ZSBtZXJnZWQgb2JqZWN0XG4gICAgY29uc3QgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbGV0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbGV0IHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgLy8gSW5mbGF0ZSBvcmlnaW5hbCBvYmplY3RcbiAgICBjb25zdCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBjbGFzc05hbWUgPSBvcmlnaW5hbFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICAgIHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlckRlbGV0ZShtZXNzYWdlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IGRlbGV0ZWRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJWogfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGRlbGV0ZWRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgbGV0IGlzU3Vic2NyaXB0aW9uTWF0Y2hlZDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlzU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oZGVsZXRlZFBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24pO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCBtYXRjaGluZyBzdWJzY3JpcHRpb24gZm9yIGNsYXNzICR7Y2xhc3NOYW1lfTogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFpc1N1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gRGVlcC1jbG9uZSBzaGFyZWQgb2JqZWN0IHNvIGVhY2ggY29uY3VycmVudCBjYWxsYmFjayB3b3JrcyBvbiBpdHMgb3duIGNvcHlcbiAgICAgICAgICBsZXQgbG9jYWxEZWxldGVkUGFyc2VPYmplY3QgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGRlbGV0ZWRQYXJzZU9iamVjdCkpO1xuICAgICAgICAgIGNvbnN0IGFjbCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgIC8vIENoZWNrIENMUFxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgbGV0IHJlczogYW55ID0ge307XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNDTFAgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlc0NMUCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpc01hdGNoZWQgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgaWYgKCFpc01hdGNoZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGxvY2FsRGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgbG9jYWxEZWxldGVkUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzLm9iamVjdCA9IGxvY2FsRGVsZXRlZFBhcnNlT2JqZWN0O1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICByZXMsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLnF1ZXJ5XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCByZXMub2JqZWN0KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJTYXZlKG1lc3NhZ2U6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBudWxsO1xuICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGxldCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVzIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBjdXJyZW50UGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBsZXQgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQ7XG4gICAgICBsZXQgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgICApO1xuICAgICAgICBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIG1hdGNoaW5nIHN1YnNjcmlwdGlvbiBmb3IgY2xhc3MgJHtjbGFzc05hbWV9OiAke2UubWVzc2FnZX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gRGVlcC1jbG9uZSBzaGFyZWQgb2JqZWN0cyBzbyBlYWNoIGNvbmN1cnJlbnQgY2FsbGJhY2sgd29ya3Mgb24gaXRzIG93biBjb3B5LlxuICAgICAgICAgIC8vIFdpdGhvdXQgY2xvbmluZywgX2ZpbHRlclNlbnNpdGl2ZURhdGEncyBpbi1wbGFjZSBmaWVsZCBkZWxldGlvbiBhbmQgYWZ0ZXJFdmVudFxuICAgICAgICAgIC8vIHRyaWdnZXIgbW9kaWZpY2F0aW9ucyBjb3JydXB0IHRoZSBzaGFyZWQgc3RhdGUgYWNyb3NzIGNvbmN1cnJlbnQgc3Vic2NyaWJlcnMuXG4gICAgICAgICAgbGV0IGxvY2FsQ3VycmVudFBhcnNlT2JqZWN0ID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShjdXJyZW50UGFyc2VPYmplY3QpKTtcbiAgICAgICAgICBsZXQgbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0ID0gb3JpZ2luYWxQYXJzZU9iamVjdFxuICAgICAgICAgICAgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9yaWdpbmFsUGFyc2VPYmplY3QpKVxuICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICAgIC8vIFNldCBvcmlnbmFsIFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgaWYgKCFpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0w7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKG9yaWdpbmFsQUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNldCBjdXJyZW50IFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBsZXQgcmVzOiBhbnkgPSB7fTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChjdXJyZW50QUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlc0NMUCA9IGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzQ0xQID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgICAgICAgICdPcmlnaW5hbCAlaiB8IEN1cnJlbnQgJWogfCBNYXRjaDogJXMsICVzLCAlcywgJXMgfCBRdWVyeTogJXMnLFxuICAgICAgICAgICAgICBsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGxvY2FsQ3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbE1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5oYXNoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gRGVjaWRlIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGxldCB0eXBlO1xuICAgICAgICAgICAgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICd1cGRhdGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiAhaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ2xlYXZlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgaWYgKGxvY2FsT3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnZW50ZXInO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY3JlYXRlJztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3YXRjaEZpZWxkc0NoYW5nZWQgPSB0aGlzLl9jaGVja1dhdGNoRmllbGRzKGNsaWVudCwgcmVxdWVzdElkLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIGlmICghd2F0Y2hGaWVsZHNDaGFuZ2VkICYmICh0eXBlID09PSAndXBkYXRlJyB8fCB0eXBlID09PSAnY3JlYXRlJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gQSBgbGVhdmVgIG9yIGBlbnRlcmAgdHJhbnNpdGlvbiBjYW4gYmUgY2F1c2VkIGVpdGhlciBieSB0aGUgb2JqZWN0J3NcbiAgICAgICAgICAgIC8vIHF1ZXJ5IG1hdGNoIGNoYW5naW5nICh0aGUgc3Vic2NyaWJlciBrZWVwcyByZWFkIGFjY2Vzcykgb3IgYnkgdGhlXG4gICAgICAgICAgICAvLyBzdWJzY3JpYmVyJ3MgQUNMIHJlYWQgYWNjZXNzIGJlaW5nIHJldm9rZWQgb3IgZ3JhbnRlZCBpbiB0aGUgc2FtZSBzYXZlLlxuICAgICAgICAgICAgLy8gSW4gdGhlIGFjY2Vzcy1jaGFuZ2UgY2FzZSB0aGUgc3Vic2NyaWJlciBpcyBub3QgYXV0aG9yaXplZCB0byByZWFkIHRoZVxuICAgICAgICAgICAgLy8gb2JqZWN0IHN0YXRlIHRoYXQgdHJpZ2dlcmVkIHRoZSB0cmFuc2l0aW9uLCBzbyB0aGF0IHN0YXRlIG11c3Qgbm90IGJlXG4gICAgICAgICAgICAvLyBzZW50IG92ZXIgdGhlIGNoYW5uZWwuIChDTFAgcmVhZCBkZW5pYWwgaXMgaGFuZGxlZCBlYXJsaWVyIGJ5XG4gICAgICAgICAgICAvLyBgX21hdGNoZXNDTFBgLCB3aGljaCBza2lwcyB0aGUgZXZlbnQgZW50aXJlbHkuKVxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdsZWF2ZScpIHtcbiAgICAgICAgICAgICAgLy8gVGhlIHBvc3QtdXBkYXRlIG9iamVjdCBpcyByZWFkYWJsZSBvbiBhIHF1ZXJ5LW1pc21hdGNoIGxlYXZlIGJ1dCBub3RcbiAgICAgICAgICAgICAgLy8gb24gYW4gQUNMLWxvc3MgbGVhdmUuIE9ubHkgc2VuZCB0aGUgcG9zdC11cGRhdGUgYm9keSB3aGVuIHRoZVxuICAgICAgICAgICAgICAvLyBzdWJzY3JpYmVyIGNhbiBzdGlsbCByZWFkIHRoZSBjdXJyZW50IG9iamVjdDsgb3RoZXJ3aXNlIGZhbGwgYmFjayB0b1xuICAgICAgICAgICAgICAvLyB0aGUgbGFzdCBhdXRob3JpemVkIChvcmlnaW5hbCkgc3RhdGUsIHdoaWNoIHN0aWxsIGNhcnJpZXMgdGhlIG9iamVjdElkLlxuICAgICAgICAgICAgICBjb25zdCBjdXJyZW50UmVhZGFibGUgPSBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkXG4gICAgICAgICAgICAgICAgPyBmYWxzZVxuICAgICAgICAgICAgICAgIDogYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKSwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoIWN1cnJlbnRSZWFkYWJsZSkge1xuICAgICAgICAgICAgICAgIGxvY2FsQ3VycmVudFBhcnNlT2JqZWN0ID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QpKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnZW50ZXInKSB7XG4gICAgICAgICAgICAgIC8vIFRoZSBwcmUtdXBkYXRlIG9iamVjdCB3YXMgcmVhZGFibGUgb24gYSBxdWVyeS1tYXRjaC1nYWluIGVudGVyIGJ1dCBub3RcbiAgICAgICAgICAgICAgLy8gb24gYW4gQUNMLWdyYW50IGVudGVyLiBPbmx5IHNlbmQgdGhlIHByZS11cGRhdGUgYm9keSBhcyBgb3JpZ2luYWxgXG4gICAgICAgICAgICAgIC8vIHdoZW4gdGhlIHN1YnNjcmliZXIgY291bGQgcmVhZCB0aGUgb3JpZ2luYWwgb2JqZWN0LlxuICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbFJlYWRhYmxlID0gaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWRcbiAgICAgICAgICAgICAgICA/IGZhbHNlXG4gICAgICAgICAgICAgICAgOiBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKSwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoIW9yaWdpbmFsUmVhZGFibGUpIHtcbiAgICAgICAgICAgICAgICBsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QgPSBudWxsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiB0eXBlLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogbG9jYWxDdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwpIHtcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9yaWdpbmFsKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgbG9jYWxDdXJyZW50UGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCAmJiB0eXBlb2YgcmVzLm9yaWdpbmFsLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwsXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLmNsYXNzTmFtZSB8fCBjbGFzc05hbWVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcy5vYmplY3QgPSBsb2NhbEN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICAgICAgICAgIHJlcy5vcmlnaW5hbCA9IGxvY2FsT3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9ICdwdXNoJyArIHJlcy5ldmVudC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHJlcy5ldmVudC5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChjbGllbnRbZnVuY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgICBjbGllbnRbZnVuY3Rpb25OYW1lXShyZXF1ZXN0SWQsIHJlcy5vYmplY3QsIHJlcy5vcmlnaW5hbCA/PyBudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSk6IHZvaWQge1xuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdtZXNzYWdlJywgcmVxdWVzdCA9PiB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UocmVxdWVzdCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSByZXF1ZXN0JywgcmVxdWVzdCwgZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsb2dnZXIudmVyYm9zZSgnUmVxdWVzdDogJWonLCByZXF1ZXN0KTtcblxuICAgICAgLy8gQ2hlY2sgd2hldGhlciB0aGlzIHJlcXVlc3QgaXMgYSB2YWxpZCByZXF1ZXN0LCByZXR1cm4gZXJyb3IgZGlyZWN0bHkgaWYgbm90XG4gICAgICBpZiAoXG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVsnZ2VuZXJhbCddKSB8fFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbcmVxdWVzdC5vcF0pXG4gICAgICApIHtcbiAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMSwgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Nvbm5lY3QgbWVzc2FnZSBlcnJvciAlcycsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHJlcXVlc3Qub3ApIHtcbiAgICAgICAgY2FzZSAnY29ubmVjdCc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXBkYXRlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1bnN1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDMsICdHZXQgdW5rbm93biBvcGVyYXRpb24nKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCB1bmtub3duIG9wZXJhdGlvbicsIHJlcXVlc3Qub3ApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbyhgQ2xpZW50IGRpc2Nvbm5lY3Q6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjb25zdCBjbGllbnRJZCA9IHBhcnNlV2Vic29ja2V0LmNsaWVudElkO1xuICAgICAgaWYgKCF0aGlzLmNsaWVudHMuaGFzKGNsaWVudElkKSkge1xuICAgICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3RfZXJyb3InLFxuICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgIGVycm9yOiBgVW5hYmxlIHRvIGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgQ2FuIG5vdCBmaW5kIGNsaWVudCAke2NsaWVudElkfSBvbiBkaXNjb25uZWN0YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRGVsZXRlIGNsaWVudFxuICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICB0aGlzLmNsaWVudHMuZGVsZXRlKGNsaWVudElkKTtcblxuICAgICAgLy8gRGVsZXRlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgIGZvciAoY29uc3QgW3JlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mb10gb2YgXy5lbnRyaWVzKGNsaWVudC5zdWJzY3JpcHRpb25JbmZvcykpIHtcbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24oY2xpZW50SWQsIHJlcXVlc3RJZCk7XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnRzICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgc3Vic2NyaXB0aW9ucyAlZCcsIHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGV2ZW50OiAnd3NfY29ubmVjdCcsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgIH0pO1xuICB9XG5cbiAgX3ZhbGlkYXRlUXVlcnlDb25zdHJhaW50cyh3aGVyZTogYW55KTogdm9pZCB7XG4gICAgaWYgKHR5cGVvZiB3aGVyZSAhPT0gJ29iamVjdCcgfHwgd2hlcmUgPT09IG51bGwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBvcCBvZiBbJyRvcicsICckYW5kJywgJyRub3InXSkge1xuICAgICAgaWYgKHdoZXJlW29wXSAhPT0gdW5kZWZpbmVkICYmICFBcnJheS5pc0FycmF5KHdoZXJlW29wXSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGAke29wfSBtdXN0IGJlIGFuIGFycmF5YCk7XG4gICAgICB9XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh3aGVyZVtvcF0pKSB7XG4gICAgICAgIHdoZXJlW29wXS5mb3JFYWNoKChzdWJRdWVyeTogYW55KSA9PiB7XG4gICAgICAgICAgdGhpcy5fdmFsaWRhdGVRdWVyeUNvbnN0cmFpbnRzKHN1YlF1ZXJ5KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHdoZXJlKSkge1xuICAgICAgY29uc3QgY29uc3RyYWludCA9IHdoZXJlW2tleV07XG4gICAgICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgPT09ICdvYmplY3QnICYmIGNvbnN0cmFpbnQgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKGNvbnN0cmFpbnQuJHJlZ2V4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCByZWdleCA9IGNvbnN0cmFpbnQuJHJlZ2V4O1xuICAgICAgICAgIGNvbnN0IGlzUmVnRXhwTGlrZSA9XG4gICAgICAgICAgICByZWdleCAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgdHlwZW9mIHJlZ2V4ID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgdHlwZW9mIHJlZ2V4LnNvdXJjZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICAgIHR5cGVvZiByZWdleC5mbGFncyA9PT0gJ3N0cmluZyc7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZWdleCAhPT0gJ3N0cmluZycgJiYgIWlzUmVnRXhwTGlrZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICAnSW52YWxpZCByZWd1bGFyIGV4cHJlc3Npb246ICRyZWdleCBtdXN0IGJlIGEgc3RyaW5nIG9yIFJlZ0V4cCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBpc1JlZ0V4cExpa2UgPyByZWdleC5zb3VyY2UgOiByZWdleDtcbiAgICAgICAgICBjb25zdCBmbGFncyA9IGlzUmVnRXhwTGlrZSA/IHJlZ2V4LmZsYWdzIDogY29uc3RyYWludC4kb3B0aW9ucyB8fCAnJztcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgbmV3IFJlZ0V4cChwYXR0ZXJuLCBmbGFncyk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgSW52YWxpZCByZWd1bGFyIGV4cHJlc3Npb246ICR7ZS5tZXNzYWdlfWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX21hdGNoZXNTdWJzY3JpcHRpb24ocGFyc2VPYmplY3Q6IGFueSwgc3Vic2NyaXB0aW9uOiBhbnkpOiBib29sZWFuIHtcbiAgICAvLyBPYmplY3QgaXMgdW5kZWZpbmVkIG9yIG51bGwsIG5vdCBtYXRjaFxuICAgIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShzdHJ1Y3R1cmVkQ2xvbmUocGFyc2VPYmplY3QpLCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgYXN5bmMgX2NsZWFyQ2FjaGVkUm9sZXModXNlcklkOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsaWRUb2tlbnMgPSBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmVxdWFsVG8oJ3VzZXInLCBQYXJzZS5Vc2VyLmNyZWF0ZVdpdGhvdXREYXRhKHVzZXJJZCkpXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIHZhbGlkVG9rZW5zLm1hcChhc3luYyB0b2tlbiA9PiB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvblRva2VuID0gdG9rZW4uZ2V0KCdzZXNzaW9uVG9rZW4nKTtcbiAgICAgICAgICBjb25zdCBhdXRoUHJvbWlzZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIGlmICghYXV0aFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgW2F1dGgxLCBhdXRoMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBhdXRoUHJvbWlzZSxcbiAgICAgICAgICAgIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oeyBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLCBzZXNzaW9uVG9rZW4gfSksXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgYXV0aDEuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBhdXRoMi5hdXRoPy5jbGVhclJvbGVDYWNoZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgQ291bGQgbm90IGNsZWFyIHJvbGUgY2FjaGUuICR7ZX1gKTtcbiAgICB9XG4gIH1cblxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbj86IHN0cmluZyk6IFByb21pc2U8eyBhdXRoPzogQXV0aCwgdXNlcklkPzogc3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0ge307XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4pIHtcbiAgICAgICAgICByZXN1bHQuZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBQcm9taXNlLnJlc29sdmUocmVzdWx0KSwgdGhpcy5jb25maWcuY2FjaGVUaW1lb3V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWxldGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSk7XG4gICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgYXV0aFByb21pc2UpO1xuICAgIHJldHVybiBhdXRoUHJvbWlzZTtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQ0xQKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucz86IGFueSxcbiAgICBvYmplY3Q/OiBhbnksXG4gICAgY2xpZW50PzogYW55LFxuICAgIHJlcXVlc3RJZD86IG51bWJlcixcbiAgICBvcD86IHN0cmluZ1xuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gWycqJ107XG4gICAgbGV0IHVzZXJJZDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgdXNlcklkID0gcmVzdWx0LnVzZXJJZDtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wXG4gICAgKTtcbiAgICAvLyBFbmZvcmNlIHBvaW50ZXIgcGVybWlzc2lvbnMgdGhhdCB2YWxpZGF0ZVBlcm1pc3Npb24gZGVmZXJzLlxuICAgIC8vIFJldHVybnMgZmFsc2UgdG8gc2lsZW50bHkgc2tpcCB0aGUgZXZlbnQgKGxpa2UgQUNMKSwgcmF0aGVyIHRoYW5cbiAgICAvLyB0aHJvd2luZyB3aGljaCB3b3VsZCBwdXNoIGVycm9ycyB0byB0aGUgY2xpZW50IGFuZCBsb2cgbm9pc2UuXG4gICAgaWYgKCFjbGllbnQuaGFzTWFzdGVyS2V5ICYmIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3ApID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG4gICAgICBjb25zdCBwb2ludGVyRmllbGRzID0gW107XG4gICAgICBpZiAoY2xhc3NMZXZlbFBlcm1pc3Npb25zW29wXT8ucG9pbnRlckZpZWxkcykge1xuICAgICAgICBwb2ludGVyRmllbGRzLnB1c2goLi4uY2xhc3NMZXZlbFBlcm1pc3Npb25zW29wXS5wb2ludGVyRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGNsYXNzTGV2ZWxQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSkge1xuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGNsYXNzTGV2ZWxQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSB7XG4gICAgICAgICAgaWYgKCFwb2ludGVyRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgICAgcG9pbnRlckZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChwb2ludGVyRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gSWYgcHVibGljIG9yIHVzZXItc3BlY2lmaWMgcGVybWlzc2lvbiBhbHJlYWR5IGdyYW50cyBhY2Nlc3MsIHNraXAgcG9pbnRlciBjaGVja1xuICAgICAgICBpZiAoXG4gICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgYWNsR3JvdXAsIG9wKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDaGVjayBpZiBhbnkgcG9pbnRlciBmaWVsZCBwb2ludHMgdG8gdGhlIGN1cnJlbnQgdXNlclxuICAgICAgICAgIGNvbnN0IGhhc0FjY2VzcyA9IHBvaW50ZXJGaWVsZHMuc29tZShmaWVsZCA9PiB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9XG4gICAgICAgICAgICAgIHR5cGVvZiBvYmplY3QuZ2V0ID09PSAnZnVuY3Rpb24nID8gb2JqZWN0LmdldChmaWVsZCkgOiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIYW5kbGUgUGFyc2UuT2JqZWN0IHBvaW50ZXIgKGhhcyAuaWQpXG4gICAgICAgICAgICBpZiAodmFsdWUuaWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLmlkID09PSB1c2VySWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIYW5kbGUgcmF3IHBvaW50ZXIgSlNPTiAoaGFzIC5vYmplY3RJZClcbiAgICAgICAgICAgIGlmICh2YWx1ZS5vYmplY3RJZCkge1xuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEhhbmRsZSBhcnJheSBvZiBwb2ludGVyc1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5zb21lKGl0ZW0gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChpdGVtLmlkKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5pZCA9PT0gdXNlcklkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5vYmplY3RJZCkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0ub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAoIWhhc0FjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucz86IGFueSxcbiAgICByZXM/OiBhbnksXG4gICAgY2xpZW50PzogYW55LFxuICAgIHJlcXVlc3RJZD86IG51bWJlcixcbiAgICBvcD86IHN0cmluZyxcbiAgICBxdWVyeT86IGFueVxuICApIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCBjbGllbnRBdXRoO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkLCBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBjbGllbnRBdXRoID0gYXV0aDtcbiAgICB9XG4gICAgY29uc3QgZmlsdGVyID0gb2JqID0+IHtcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM/LnByb3RlY3RlZEZpZWxkcyB8fCBbXTtcbiAgICAgIGlmIChjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IFtdO1xuICAgICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGdldERhdGFiYXNlQ29udHJvbGxlcih0aGlzLmNvbmZpZykuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICByZXMub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICBjbGllbnRBdXRoXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gRGF0YWJhc2VDb250cm9sbGVyLmZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgIGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGZhbHNlLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgY2xpZW50QXV0aCxcbiAgICAgICAgb3AsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgb2JqLFxuICAgICAgICBxdWVyeVxuICAgICAgKTtcbiAgICB9O1xuICAgIHJlcy5vYmplY3QgPSBmaWx0ZXIocmVzLm9iamVjdCk7XG4gICAgcmVzLm9yaWdpbmFsID0gZmlsdGVyKHJlcy5vcmlnaW5hbCk7XG4gIH1cblxuICBfZ2V0Q0xQT3BlcmF0aW9uKHF1ZXJ5OiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mIHF1ZXJ5ID09PSAnb2JqZWN0JyAmJlxuICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PSAxICYmXG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICA/ICdnZXQnXG4gICAgICA6ICdmaW5kJztcbiAgfVxuXG4gIGFzeW5jIF92ZXJpZnlBQ0woYWNsOiBhbnksIHRva2VuOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgeyBhdXRoLCB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih0b2tlbik7XG5cbiAgICAvLyBHZXR0aW5nIHRoZSBzZXNzaW9uIHRva2VuIGZhaWxlZFxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBubyBhZGRpdGlvbmFsIGF1dGggaXMgYXZhaWxhYmxlXG4gICAgLy8gQXQgdGhpcyBwb2ludCwganVzdCBiYWlsIG91dCBhcyBubyBhZGRpdGlvbmFsIHZpc2liaWxpdHkgY2FuIGJlIGluZmVycmVkLlxuICAgIGlmICghYXV0aCB8fCAhdXNlcklkKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCA9IGFjbC5nZXRSZWFkQWNjZXNzKHVzZXJJZCk7XG4gICAgaWYgKGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHVzZXIgaGFzIGFueSByb2xlcyB0aGF0IG1hdGNoIHRoZSBBQ0xcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gUmVzb2x2ZSBmYWxzZSByaWdodCBhd2F5IGlmIHRoZSBhY2wgZG9lc24ndCBoYXZlIGFueSByb2xlc1xuICAgICAgICBjb25zdCBhY2xfaGFzX3JvbGVzID0gT2JqZWN0LmtleXMoYWNsLnBlcm1pc3Npb25zQnlJZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpO1xuICAgICAgICBpZiAoIWFjbF9oYXNfcm9sZXMpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRBdXRoRnJvbUNsaWVudChjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIsIHNlc3Npb25Ub2tlbj86IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIF9jaGVja1dhdGNoRmllbGRzKGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IGFueSwgbWVzc2FnZTogYW55KSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3Qgd2F0Y2ggPSBzdWJzY3JpcHRpb25JbmZvPy53YXRjaDtcbiAgICBpZiAoIXdhdGNoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qgb2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgcmV0dXJuIHdhdGNoLnNvbWUoZmllbGQgPT4gIWlzRGVlcFN0cmljdEVxdWFsKG9iamVjdC5nZXQoZmllbGQpLCBvcmlnaW5hbD8uZ2V0KGZpZWxkKSkpO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNBQ0woYWNsOiBhbnksIGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIFJldHVybiB0cnVlIGRpcmVjdGx5IGlmIEFDTCBpc24ndCBwcmVzZW50LCBBQ0wgaXMgcHVibGljIHJlYWQsIG9yIGNsaWVudCBoYXMgbWFzdGVyIGtleVxuICAgIGlmICghYWNsIHx8IGFjbC5nZXRQdWJsaWNSZWFkQWNjZXNzKCkgfHwgY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHN1YnNjcmlwdGlvbiBzZXNzaW9uVG9rZW4gbWF0Y2hlcyBBQ0wgZmlyc3RcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uVG9rZW4gPSBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbjtcbiAgICBjb25zdCBjbGllbnRTZXNzaW9uVG9rZW4gPSBjbGllbnQuc2Vzc2lvblRva2VuO1xuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIHN1YnNjcmlwdGlvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIGNsaWVudFNlc3Npb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLl92YWxpZGF0ZUtleXMocmVxdWVzdCwgdGhpcy5rZXlQYWlycykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDQsICdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIGxvZ2dlci5lcnJvcignS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhhc01hc3RlcktleSA9IHRoaXMuX2hhc01hc3RlcktleShyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IHV1aWR2NCgpO1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoXG4gICAgICBjbGllbnRJZCxcbiAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgaGFzTWFzdGVyS2V5LFxuICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICByZXF1ZXN0Lmluc3RhbGxhdGlvbklkXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxdWVzdC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgdXNlcjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKCdAQ29ubmVjdCcsICdiZWZvcmVDb25uZWN0JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXEuc2Vzc2lvblRva2VuKTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlQ29ubmVjdC5AQ29ubmVjdGAsIHJlcSwgYXV0aCk7XG4gICAgICB9XG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCA9IGNsaWVudElkO1xuICAgICAgdGhpcy5jbGllbnRzLnNldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNsaWVudC5wdXNoQ29ubmVjdCgpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhyZXEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gICAgICAgIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVTdWJzY3JpYmUuJHtjbGFzc05hbWV9YCwgcmVxdWVzdCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0LnF1ZXJ5LnRvSlNPTigpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3QudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUudXNlciA9IHJlcXVlc3QudXNlci50b1BvaW50ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gVmFsaWRhdGUgcXVlcnkgY29uZGl0aW9uIGRlcHRoXG4gICAgICBjb25zdCBhcHBDb25maWcgPSBDb25maWcuZ2V0KHRoaXMuY29uZmlnLmFwcElkKTtcbiAgICAgIGlmICghY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgICBjb25zdCByYyA9IGFwcENvbmZpZy5yZXF1ZXN0Q29tcGxleGl0eTtcbiAgICAgICAgaWYgKHJjICYmIHJjLnF1ZXJ5RGVwdGggIT09IC0xKSB7XG4gICAgICAgICAgY29uc3QgbWF4RGVwdGggPSByYy5xdWVyeURlcHRoO1xuICAgICAgICAgIGNvbnN0IGNoZWNrRGVwdGggPSAobm9kZTogYW55LCBkZXB0aDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoZGVwdGggPiBtYXhEZXB0aCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgICBgUXVlcnkgY29uZGl0aW9uIG5lc3RpbmcgZGVwdGggZXhjZWVkcyBtYXhpbXVtIGFsbG93ZWQgZGVwdGggb2YgJHttYXhEZXB0aH1gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobm9kZSA9PT0gbnVsbCB8fCB0eXBlb2Ygbm9kZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZSkpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIG5vZGUpIHtcbiAgICAgICAgICAgICAgICBjaGVja0RlcHRoKGl0ZW0sIGRlcHRoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBEZXNjZW5kIGludG8gZXZlcnkgdmFsdWUgc28gdGhhdCBsb2dpY2FsIG9wZXJhdG9ycyAoJG9yLyRhbmQvJG5vcilcbiAgICAgICAgICAgIC8vIG5lc3RlZCB1bmRlciBmaWVsZC1sZXZlbCBvcGVyYXRvcnMgKGUuZy4gJGVsZW1NYXRjaCwgJG5vdCkgb3IgcGxhaW5cbiAgICAgICAgICAgIC8vIGZpZWxkIG5hbWVzIGFyZSBzdGlsbCBjb3VudGVkLiBPbmx5IGxvZ2ljYWwgb3BlcmF0b3JzIGluY3JlYXNlIHRoZVxuICAgICAgICAgICAgLy8gZGVwdGgsIHdoaWNoIHByZXNlcnZlcyB0aGUgZG9jdW1lbnRlZCBtZWFuaW5nIG9mIGBxdWVyeURlcHRoYC5cbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG5vZGUpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGlzTG9naWNhbCA9IGtleSA9PT0gJyRvcicgfHwga2V5ID09PSAnJGFuZCcgfHwga2V5ID09PSAnJG5vcic7XG4gICAgICAgICAgICAgIGlmIChpc0xvZ2ljYWwgJiYgIUFycmF5LmlzQXJyYXkobm9kZVtrZXldKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgJHtrZXl9IG11c3QgYmUgYW4gYXJyYXlgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjaGVja0RlcHRoKG5vZGVba2V5XSwgaXNMb2dpY2FsID8gZGVwdGggKyAxIDogZGVwdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgICAgY2hlY2tEZXB0aChyZXF1ZXN0LnF1ZXJ5LndoZXJlLCAwKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBDTFAgZm9yIHN1YnNjcmliZSBvcGVyYXRpb25cbiAgICAgIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCBhcHBDb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpO1xuICAgICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hQ29udHJvbGxlci5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHJlcXVlc3QucXVlcnkpO1xuICAgICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICAgIGlmICghYXV0aENhbGxlZCkge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChcbiAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWQsXG4gICAgICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW5cbiAgICAgICAgKTtcbiAgICAgICAgYXV0aENhbGxlZCA9IHRydWU7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICBhY2xHcm91cC5wdXNoKGF1dGgudXNlci5pZCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocmVxdWVzdC51c2VyKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2gocmVxdWVzdC51c2VyLmlkKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIG9wXG4gICAgICApO1xuXG4gICAgICAvLyBDaGVjayBwcm90ZWN0ZWQgZmllbGRzIGluIFdIRVJFIGNsYXVzZSBhbmQgV0FUQ0ggcGFyYW1ldGVyXG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IHJlcXVlc3QudXNlciA/IHsgdXNlcjogcmVxdWVzdC51c2VyLCB1c2VyUm9sZXM6IFtdIH0gOiB7fTtcbiAgICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICAgICAgICBhcHBDb25maWcuZGF0YWJhc2UuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcmVxdWVzdC5xdWVyeS53aGVyZSxcbiAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgYXV0aFxuICAgICAgICAgICkgfHwgW107XG4gICAgICAgIGlmIChwcm90ZWN0ZWRGaWVsZHMubGVuZ3RoID4gMCAmJiByZXF1ZXN0LnF1ZXJ5LndoZXJlKSB7XG4gICAgICAgICAgY29uc3QgY2hlY2tXaGVyZSA9ICh3aGVyZTogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHdoZXJlICE9PSAnb2JqZWN0JyB8fCB3aGVyZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHdoZXJlS2V5IG9mIE9iamVjdC5rZXlzKHdoZXJlKSkge1xuICAgICAgICAgICAgICBjb25zdCByb290RmllbGQgPSB3aGVyZUtleS5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgICBpZiAocHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHdoZXJlS2V5KSB8fCBwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMocm9vdEZpZWxkKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQnXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBvcCBvZiBbJyRvcicsICckYW5kJywgJyRub3InXSkge1xuICAgICAgICAgICAgICBpZiAod2hlcmVbb3BdICE9PSB1bmRlZmluZWQgJiYgIUFycmF5LmlzQXJyYXkod2hlcmVbb3BdKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgJHtvcH0gbXVzdCBiZSBhbiBhcnJheWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHdoZXJlW29wXSkpIHtcbiAgICAgICAgICAgICAgICB3aGVyZVtvcF0uZm9yRWFjaCgoc3ViUXVlcnk6IGFueSkgPT4gY2hlY2tXaGVyZShzdWJRdWVyeSkpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgICBjaGVja1doZXJlKHJlcXVlc3QucXVlcnkud2hlcmUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcm90ZWN0ZWRGaWVsZHMubGVuZ3RoID4gMCAmJiBBcnJheS5pc0FycmF5KHJlcXVlc3QucXVlcnkud2F0Y2gpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCB3YXRjaEZpZWxkIG9mIHJlcXVlc3QucXVlcnkud2F0Y2gpIHtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZCA9IHdhdGNoRmllbGQuc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgIGlmIChwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMod2F0Y2hGaWVsZCkgfHwgcHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHJvb3RGaWVsZCkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSByZWdleCBwYXR0ZXJucyBpbiB0aGUgc3Vic2NyaXB0aW9uIHF1ZXJ5XG4gICAgICB0aGlzLl92YWxpZGF0ZVF1ZXJ5Q29uc3RyYWludHMocmVxdWVzdC5xdWVyeS53aGVyZSk7XG5cbiAgICAgIC8vIEdldCBzdWJzY3JpcHRpb24gZnJvbSBzdWJzY3JpcHRpb25zLCBjcmVhdGUgb25lIGlmIG5lY2Vzc2FyeVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSGFzaCA9IHF1ZXJ5SGFzaChyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcblxuICAgICAgaWYgKCF0aGlzLnN1YnNjcmlwdGlvbnMuaGFzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uSGFzaCkpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gY2xhc3NTdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oY2xhc3NOYW1lLCByZXF1ZXN0LnF1ZXJ5LndoZXJlLCBzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb25IYXNoLCBzdWJzY3JpcHRpb24pO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgc3Vic2NyaXB0aW9uSW5mbyB0byBjbGllbnRcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm86IGFueSA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5rZXlzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ua2V5cyA9IEFycmF5LmlzQXJyYXkocmVxdWVzdC5xdWVyeS5rZXlzKVxuICAgICAgICAgID8gcmVxdWVzdC5xdWVyeS5rZXlzXG4gICAgICAgICAgOiByZXF1ZXN0LnF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LndhdGNoKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ud2F0Y2ggPSByZXF1ZXN0LnF1ZXJ5LndhdGNoO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlU3Vic2NyaWJlIG9uICR7Y2xhc3NOYW1lfSBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsR0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsS0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsYUFBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsT0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUkscUJBQUEsR0FBQUosT0FBQTtBQUVBLElBQUFLLE9BQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLGNBQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLFdBQUEsR0FBQVAsT0FBQTtBQUNBLElBQUFRLFlBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLGlCQUFBLEdBQUFWLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVSxPQUFBLEdBQUFYLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVyxLQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxTQUFBLEdBQUFaLE9BQUE7QUFPQSxJQUFBYSxLQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxZQUFBLEdBQUFkLE9BQUE7QUFDQSxJQUFBZSxPQUFBLEdBQUFoQixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQWdCLFNBQUEsR0FBQWhCLE9BQUE7QUFDQSxJQUFBaUIsWUFBQSxHQUFBbEIsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFrQixtQkFBQSxHQUFBbkIs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