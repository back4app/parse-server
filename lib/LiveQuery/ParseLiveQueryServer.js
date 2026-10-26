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
    if (!client.hasMasterKey && !_SchemaController.default.testPointerPermissions(classLevelPermissions, aclGroup, op, userId, field => typeof object.get === 'function' ? object.get(field) : object[field])) {
      return false;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfQ29uZmlnIiwiX2xydUNhY2hlIiwiX1VzZXJzUm91dGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl91dGlsIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImdldENhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsInR0bCIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwiY29ubmVjdCIsImlzT3BlbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2NyZWF0ZVN1YnNjcmliZXJzIiwic2h1dGRvd24iLCJhbGwiLCJ2YWx1ZXMiLCJtYXAiLCJjbGllbnQiLCJwYXJzZVdlYlNvY2tldCIsIndzIiwiY2xvc2UiLCJBcnJheSIsImZyb20iLCJ1bnN1YnNjcmliZSIsInF1aXQiLCJlcnIiLCJlcnJvciIsIm1lc3NhZ2VSZWNpZXZlZCIsImNoYW5uZWwiLCJtZXNzYWdlU3RyIiwibWVzc2FnZSIsIkpTT04iLCJwYXJzZSIsIl9jbGVhckNhY2hlZFJvbGVzIiwidXNlcklkIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwib24iLCJmaWVsZCIsInN1YnNjcmliZSIsImN1cnJlbnRQYXJzZU9iamVjdCIsIlVzZXJSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiY2xhc3NOYW1lIiwicGFyc2VPYmplY3QiLCJfZmluaXNoRmV0Y2giLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiZGVsZXRlZFBhcnNlT2JqZWN0IiwidG9KU09OIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaWQiLCJzaXplIiwiY2xhc3NTdWJzY3JpcHRpb25zIiwiZ2V0IiwiZGVidWciLCJzdWJzY3JpcHRpb24iLCJpc1N1YnNjcmlwdGlvbk1hdGNoZWQiLCJfbWF0Y2hlc1N1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkcyIsIl8iLCJlbnRyaWVzIiwiY2xpZW50UmVxdWVzdElkcyIsImZvckVhY2giLCJyZXF1ZXN0SWQiLCJsb2NhbERlbGV0ZWRQYXJzZU9iamVjdCIsInN0cmluZ2lmeSIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwibWF0Y2hlc0NMUCIsIl9tYXRjaGVzQ0xQIiwiaXNNYXRjaGVkIiwiX21hdGNoZXNBQ0wiLCJldmVudCIsInNlc3Npb25Ub2tlbiIsIm9iamVjdCIsInVzZU1hc3RlcktleSIsImhhc01hc3RlcktleSIsImluc3RhbGxhdGlvbklkIiwic2VuZEV2ZW50IiwidHJpZ2dlciIsImdldFRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJydW5UcmlnZ2VyIiwidG9KU09Od2l0aE9iamVjdHMiLCJfZmlsdGVyU2Vuc2l0aXZlRGF0YSIsInB1c2hEZWxldGUiLCJyZXNvbHZlRXJyb3IiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJjb2RlIiwiaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkIiwibG9jYWxDdXJyZW50UGFyc2VPYmplY3QiLCJsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIm9yaWdpbmFsQUNMIiwiY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSIsImN1cnJlbnRBQ0wiLCJpc09yaWdpbmFsTWF0Y2hlZCIsImlzQ3VycmVudE1hdGNoZWQiLCJoYXNoIiwidHlwZSIsIndhdGNoRmllbGRzQ2hhbmdlZCIsIl9jaGVja1dhdGNoRmllbGRzIiwiY3VycmVudFJlYWRhYmxlIiwib3JpZ2luYWxSZWFkYWJsZSIsIm9yaWdpbmFsIiwiZnVuY3Rpb25OYW1lIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJzbGljZSIsInJlcXVlc3QiLCJ0djQiLCJ2YWxpZGF0ZSIsIlJlcXVlc3RTY2hlbWEiLCJfaGFuZGxlQ29ubmVjdCIsIl9oYW5kbGVTdWJzY3JpYmUiLCJfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uIiwiX2hhbmRsZVVuc3Vic2NyaWJlIiwiaW5mbyIsImhhcyIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsIl92YWxpZGF0ZVF1ZXJ5Q29uc3RyYWludHMiLCJ3aGVyZSIsInVuZGVmaW5lZCIsImlzQXJyYXkiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJzdWJRdWVyeSIsImNvbnN0cmFpbnQiLCIkcmVnZXgiLCJyZWdleCIsImlzUmVnRXhwTGlrZSIsInNvdXJjZSIsImZsYWdzIiwicGF0dGVybiIsIiRvcHRpb25zIiwiUmVnRXhwIiwibWF0Y2hlc1F1ZXJ5Iiwic3RydWN0dXJlZENsb25lIiwidmFsaWRUb2tlbnMiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiVXNlciIsImNyZWF0ZVdpdGhvdXREYXRhIiwiZmluZCIsInRva2VuIiwiYXV0aFByb21pc2UiLCJhdXRoMSIsImF1dGgyIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImNsZWFyUm9sZUNhY2hlIiwiZnJvbUNhY2hlIiwidGhlbiIsImNhdGNoIiwicmVzdWx0IiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImFjbEdyb3VwIiwicHVzaCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJ0ZXN0UG9pbnRlclBlcm1pc3Npb25zIiwiX2xvYWRSb2xlc0ZvclByb3RlY3RlZEZpZWxkcyIsImNsaWVudEF1dGgiLCJnZXRVc2VyUm9sZXMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJzb21lIiwic3RhcnRzV2l0aCIsImZpbHRlciIsIm9iaiIsImdldERhdGFiYXNlQ29udHJvbGxlciIsImFkZFByb3RlY3RlZEZpZWxkcyIsIkRhdGFiYXNlQ29udHJvbGxlciIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJsZW5ndGgiLCJvYmplY3RJZCIsIl92ZXJpZnlBQ0wiLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInJvbGVOYW1lcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsIndhdGNoIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInV1aWR2NCIsInJlcSIsInB1c2hDb25uZWN0IiwidmFsaWRLZXlQYWlycyIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzVmFsaWQiLCJzZWNyZXQiLCJhdXRoQ2FsbGVkIiwicGFyc2VRdWVyeSIsIndpdGhKU09OIiwidG9Qb2ludGVyIiwibWFzdGVyIiwiYXBwQ29uZmlnIiwiQ29uZmlnIiwicmMiLCJyZXF1ZXN0Q29tcGxleGl0eSIsInF1ZXJ5RGVwdGgiLCJtYXhEZXB0aCIsImNoZWNrRGVwdGgiLCJub2RlIiwiZGVwdGgiLCJpdGVtIiwiaXNMb2dpY2FsIiwic2NoZW1hQ29udHJvbGxlciIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsInVzZXJSb2xlcyIsImNoZWNrV2hlcmUiLCJ3aGVyZUtleSIsInJvb3RGaWVsZCIsInNwbGl0IiwiaW5jbHVkZXMiLCJPUEVSQVRJT05fRk9SQklEREVOIiwid2F0Y2hGaWVsZCIsInN1YnNjcmlwdGlvbkhhc2giLCJxdWVyeUhhc2giLCJTdWJzY3JpcHRpb24iLCJhZGRTdWJzY3JpcHRpb25JbmZvIiwiYWRkQ2xpZW50U3Vic2NyaXB0aW9uIiwicHVzaFN1YnNjcmliZSIsIm5vdGlmeUNsaWVudCIsImRlbGV0ZVN1YnNjcmlwdGlvbkluZm8iLCJwdXNoVW5zdWJzY3JpYmUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHY0IGZyb20gJ3R2NCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICcuL0NsaWVudCc7XG5pbXBvcnQgeyBQYXJzZVdlYlNvY2tldFNlcnZlciB9IGZyb20gJy4vUGFyc2VXZWJTb2NrZXRTZXJ2ZXInO1xuLy8gQHRzLWlnbm9yZVxuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFJlcXVlc3RTY2hlbWEgZnJvbSAnLi9SZXF1ZXN0U2NoZW1hJztcbmltcG9ydCB7IG1hdGNoZXNRdWVyeSwgcXVlcnlIYXNoIH0gZnJvbSAnLi9RdWVyeVRvb2xzJztcbmltcG9ydCB7IFBhcnNlUHViU3ViIH0gZnJvbSAnLi9QYXJzZVB1YlN1Yic7XG5pbXBvcnQgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCB7XG4gIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMsXG4gIGdldFRyaWdnZXIsXG4gIHJ1blRyaWdnZXIsXG4gIHJlc29sdmVFcnJvcixcbiAgdG9KU09Od2l0aE9iamVjdHMsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sIEF1dGggfSBmcm9tICcuLi9BdXRoJztcbmltcG9ydCB7IGdldENhY2hlQ29udHJvbGxlciwgZ2V0RGF0YWJhc2VDb250cm9sbGVyIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgYXMgTFJVIH0gZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBVc2VyUm91dGVyIGZyb20gJy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcblxuXG5jbGFzcyBQYXJzZUxpdmVRdWVyeVNlcnZlciB7XG4gIHNlcnZlcjogYW55O1xuICBjb25maWc6IGFueTtcbiAgY2xpZW50czogTWFwPHN0cmluZywgYW55PjtcbiAgLy8gY2xhc3NOYW1lIC0+IChxdWVyeUhhc2ggLT4gc3Vic2NyaXB0aW9uKVxuICBzdWJzY3JpcHRpb25zOiBNYXA8c3RyaW5nLCBhbnk+O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogYW55O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogYW55O1xuICBhdXRoQ2FjaGU6IGFueTtcbiAgY2FjaGVDb250cm9sbGVyOiBhbnk7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIGNvbmZpZzogYW55ID0ge30sIHBhcnNlU2VydmVyQ29uZmlnOiBhbnkgPSB7fSkge1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuICAgIHRoaXMuY2xpZW50cyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICBjb25maWcuYXBwSWQgPSBjb25maWcuYXBwSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICBjb25maWcubWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleSB8fCBQYXJzZS5tYXN0ZXJLZXk7XG5cbiAgICAvLyBTdG9yZSBrZXlzLCBjb252ZXJ0IG9iaiB0byBtYXBcbiAgICBjb25zdCBrZXlQYWlycyA9IGNvbmZpZy5rZXlQYWlycyB8fCB7fTtcbiAgICB0aGlzLmtleVBhaXJzID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGtleVBhaXJzKSkge1xuICAgICAgdGhpcy5rZXlQYWlycy5zZXQoa2V5LCBrZXlQYWlyc1trZXldKTtcbiAgICB9XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ1N1cHBvcnQga2V5IHBhaXJzJywgdGhpcy5rZXlQYWlycyk7XG5cbiAgICAvLyBJbml0aWFsaXplIFBhcnNlXG4gICAgUGFyc2UuT2JqZWN0LmRpc2FibGVTaW5nbGVJbnN0YW5jZSgpO1xuICAgIGNvbnN0IHNlcnZlclVSTCA9IGNvbmZpZy5zZXJ2ZXJVUkwgfHwgUGFyc2Uuc2VydmVyVVJMO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBQYXJzZS5pbml0aWFsaXplKGNvbmZpZy5hcHBJZCwgUGFyc2UuamF2YVNjcmlwdEtleSwgY29uZmlnLm1hc3RlcktleSk7XG5cbiAgICAvLyBUaGUgY2FjaGUgY29udHJvbGxlciBpcyBhIHByb3BlciBjYWNoZSBjb250cm9sbGVyXG4gICAgLy8gd2l0aCBhY2Nlc3MgdG8gVXNlciBhbmQgUm9sZXNcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGdldENhY2hlQ29udHJvbGxlcihwYXJzZVNlcnZlckNvbmZpZyk7XG5cbiAgICBjb25maWcuY2FjaGVUaW1lb3V0ID0gY29uZmlnLmNhY2hlVGltZW91dCB8fCA1ICogMTAwMDsgLy8gNXNcblxuICAgIC8vIFRoaXMgYXV0aCBjYWNoZSBzdG9yZXMgdGhlIHByb21pc2VzIGZvciBlYWNoIGF1dGggcmVzb2x1dGlvbi5cbiAgICAvLyBUaGUgbWFpbiBiZW5lZml0IGlzIHRvIGJlIGFibGUgdG8gcmV1c2UgdGhlIHNhbWUgdXNlciAvIHNlc3Npb24gdG9rZW4gcmVzb2x1dGlvbi5cbiAgICB0aGlzLmF1dGhDYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiA1MDAsIC8vIDUwMCBjb25jdXJyZW50XG4gICAgICB0dGw6IGNvbmZpZy5jYWNoZVRpbWVvdXQsXG4gICAgfSk7XG4gICAgLy8gSW5pdGlhbGl6ZSB3ZWJzb2NrZXQgc2VydmVyXG4gICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlciA9IG5ldyBQYXJzZVdlYlNvY2tldFNlcnZlcihcbiAgICAgIHNlcnZlcixcbiAgICAgIHBhcnNlV2Vic29ja2V0ID0+IHRoaXMuX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldCksXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICBpZiAoIXRoaXMuc3Vic2NyaWJlci5jb25uZWN0KSB7XG4gICAgICB0aGlzLmNvbm5lY3QoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLnN1YnNjcmliZXIuaXNPcGVuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnN1YnNjcmliZXIuY29ubmVjdCgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLmlzT3BlbiA9IHRydWU7XG4gICAgfVxuICAgIHRoaXMuX2NyZWF0ZVN1YnNjcmliZXJzKCk7XG4gIH1cblxuICBhc3luYyBzaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5zdWJzY3JpYmVyLmlzT3Blbikge1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAuLi5bLi4udGhpcy5jbGllbnRzLnZhbHVlcygpXS5tYXAoY2xpZW50ID0+IGNsaWVudC5wYXJzZVdlYlNvY2tldC53cy5jbG9zZSgpKSxcbiAgICAgICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlci5jbG9zZT8uKCksXG4gICAgICAgIC4uLkFycmF5LmZyb20odGhpcy5zdWJzY3JpYmVyLnN1YnNjcmlwdGlvbnM/LmtleXMoKSB8fCBbXSkubWFwKGtleSA9PlxuICAgICAgICAgIHRoaXMuc3Vic2NyaWJlci51bnN1YnNjcmliZShrZXkpXG4gICAgICAgICksXG4gICAgICAgIHRoaXMuc3Vic2NyaWJlci5jbG9zZT8uKCksXG4gICAgICBdKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLnN1YnNjcmliZXIucXVpdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zdWJzY3JpYmVyLnF1aXQoKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ1B1YlN1YkFkYXB0ZXIgZXJyb3Igb24gc2h1dGRvd24nLCB7IGVycm9yOiBlcnIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5pc09wZW4gPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBfY3JlYXRlU3Vic2NyaWJlcnMoKSB7XG4gICAgY29uc3QgbWVzc2FnZVJlY2lldmVkID0gKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdTdWJzY3JpYmUgbWVzc2FnZSAlaicsIG1lc3NhZ2VTdHIpO1xuICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICB0cnkge1xuICAgICAgICBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlU3RyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgbWVzc2FnZScsIG1lc3NhZ2VTdHIsIGUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdjbGVhckNhY2hlJykge1xuICAgICAgICB0aGlzLl9jbGVhckNhY2hlZFJvbGVzKG1lc3NhZ2UudXNlcklkKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhpcy5faW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2UpO1xuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyU2F2ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlckRlbGV0ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignR2V0IG1lc3NhZ2UgJXMgZnJvbSB1bmtub3duIGNoYW5uZWwgJWonLCBtZXNzYWdlLCBjaGFubmVsKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHRoaXMuc3Vic2NyaWJlci5vbignbWVzc2FnZScsIChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiBtZXNzYWdlUmVjaWV2ZWQoY2hhbm5lbCwgbWVzc2FnZVN0cikpO1xuICAgIGZvciAoY29uc3QgZmllbGQgb2YgWydhZnRlclNhdmUnLCAnYWZ0ZXJEZWxldGUnLCAnY2xlYXJDYWNoZSddKSB7XG4gICAgICBjb25zdCBjaGFubmVsID0gYCR7UGFyc2UuYXBwbGljYXRpb25JZH0ke2ZpZWxkfWA7XG4gICAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKGNoYW5uZWwsIG1lc3NhZ2VTdHIgPT4gbWVzc2FnZVJlY2lldmVkKGNoYW5uZWwsIG1lc3NhZ2VTdHIpKTtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGxldCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQ7XG4gICAgICB0cnkge1xuICAgICAgICBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgbWF0Y2hpbmcgc3Vic2NyaXB0aW9uIGZvciBjbGFzcyAke2NsYXNzTmFtZX06ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIERlZXAtY2xvbmUgc2hhcmVkIG9iamVjdCBzbyBlYWNoIGNvbmN1cnJlbnQgY2FsbGJhY2sgd29ya3Mgb24gaXRzIG93biBjb3B5XG4gICAgICAgICAgbGV0IGxvY2FsRGVsZXRlZFBhcnNlT2JqZWN0ID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShkZWxldGVkUGFyc2VPYmplY3QpKTtcbiAgICAgICAgICBjb25zdCBhY2wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAvLyBDaGVjayBDTFBcbiAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgIGxldCByZXM6IGFueSA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzQ0xQID0gYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXNDTFAgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaXNNYXRjaGVkID0gYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChhY2wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGlmICghaXNNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogJ2RlbGV0ZScsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBsb2NhbERlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGxvY2FsRGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcy5vYmplY3QgPSBsb2NhbERlbGV0ZWRQYXJzZU9iamVjdDtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgcmVzLm9iamVjdCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgbGV0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkO1xuICAgICAgbGV0IGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQ7XG4gICAgICB0cnkge1xuICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICAgKTtcbiAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCBtYXRjaGluZyBzdWJzY3JpcHRpb24gZm9yIGNsYXNzICR7Y2xhc3NOYW1lfTogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIERlZXAtY2xvbmUgc2hhcmVkIG9iamVjdHMgc28gZWFjaCBjb25jdXJyZW50IGNhbGxiYWNrIHdvcmtzIG9uIGl0cyBvd24gY29weS5cbiAgICAgICAgICAvLyBXaXRob3V0IGNsb25pbmcsIF9maWx0ZXJTZW5zaXRpdmVEYXRhJ3MgaW4tcGxhY2UgZmllbGQgZGVsZXRpb24gYW5kIGFmdGVyRXZlbnRcbiAgICAgICAgICAvLyB0cmlnZ2VyIG1vZGlmaWNhdGlvbnMgY29ycnVwdCB0aGUgc2hhcmVkIHN0YXRlIGFjcm9zcyBjb25jdXJyZW50IHN1YnNjcmliZXJzLlxuICAgICAgICAgIGxldCBsb2NhbEN1cnJlbnRQYXJzZU9iamVjdCA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoY3VycmVudFBhcnNlT2JqZWN0KSk7XG4gICAgICAgICAgbGV0IGxvY2FsT3JpZ2luYWxQYXJzZU9iamVjdCA9IG9yaWdpbmFsUGFyc2VPYmplY3RcbiAgICAgICAgICAgID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcmlnaW5hbFBhcnNlT2JqZWN0KSlcbiAgICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgICAvLyBTZXQgb3JpZ25hbCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGlmICghaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG9yaWdpbmFsQUNMO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChvcmlnaW5hbEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTZXQgY3VycmVudCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgbGV0IHJlczogYW55ID0ge307XG4gICAgICAgICAgaWYgKCFpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFDTCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0woY3VycmVudEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNDTFAgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlc0NMUCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBsb2NhbEN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRNYXRjaGVkLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIERlY2lkZSBldmVudCB0eXBlXG4gICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAndXBkYXRlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIGlmIChsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2VudGVyJztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NyZWF0ZSc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2F0Y2hGaWVsZHNDaGFuZ2VkID0gdGhpcy5fY2hlY2tXYXRjaEZpZWxkcyhjbGllbnQsIHJlcXVlc3RJZCwgbWVzc2FnZSk7XG4gICAgICAgICAgICBpZiAoIXdhdGNoRmllbGRzQ2hhbmdlZCAmJiAodHlwZSA9PT0gJ3VwZGF0ZScgfHwgdHlwZSA9PT0gJ2NyZWF0ZScpKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEEgYGxlYXZlYCBvciBgZW50ZXJgIHRyYW5zaXRpb24gY2FuIGJlIGNhdXNlZCBlaXRoZXIgYnkgdGhlIG9iamVjdCdzXG4gICAgICAgICAgICAvLyBxdWVyeSBtYXRjaCBjaGFuZ2luZyAodGhlIHN1YnNjcmliZXIga2VlcHMgcmVhZCBhY2Nlc3MpIG9yIGJ5IHRoZVxuICAgICAgICAgICAgLy8gc3Vic2NyaWJlcidzIEFDTCByZWFkIGFjY2VzcyBiZWluZyByZXZva2VkIG9yIGdyYW50ZWQgaW4gdGhlIHNhbWUgc2F2ZS5cbiAgICAgICAgICAgIC8vIEluIHRoZSBhY2Nlc3MtY2hhbmdlIGNhc2UgdGhlIHN1YnNjcmliZXIgaXMgbm90IGF1dGhvcml6ZWQgdG8gcmVhZCB0aGVcbiAgICAgICAgICAgIC8vIG9iamVjdCBzdGF0ZSB0aGF0IHRyaWdnZXJlZCB0aGUgdHJhbnNpdGlvbiwgc28gdGhhdCBzdGF0ZSBtdXN0IG5vdCBiZVxuICAgICAgICAgICAgLy8gc2VudCBvdmVyIHRoZSBjaGFubmVsLiAoQ0xQIHJlYWQgZGVuaWFsIGlzIGhhbmRsZWQgZWFybGllciBieVxuICAgICAgICAgICAgLy8gYF9tYXRjaGVzQ0xQYCwgd2hpY2ggc2tpcHMgdGhlIGV2ZW50IGVudGlyZWx5LilcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnbGVhdmUnKSB7XG4gICAgICAgICAgICAgIC8vIFRoZSBwb3N0LXVwZGF0ZSBvYmplY3QgaXMgcmVhZGFibGUgb24gYSBxdWVyeS1taXNtYXRjaCBsZWF2ZSBidXQgbm90XG4gICAgICAgICAgICAgIC8vIG9uIGFuIEFDTC1sb3NzIGxlYXZlLiBPbmx5IHNlbmQgdGhlIHBvc3QtdXBkYXRlIGJvZHkgd2hlbiB0aGVcbiAgICAgICAgICAgICAgLy8gc3Vic2NyaWJlciBjYW4gc3RpbGwgcmVhZCB0aGUgY3VycmVudCBvYmplY3Q7IG90aGVyd2lzZSBmYWxsIGJhY2sgdG9cbiAgICAgICAgICAgICAgLy8gdGhlIGxhc3QgYXV0aG9yaXplZCAob3JpZ2luYWwpIHN0YXRlLCB3aGljaCBzdGlsbCBjYXJyaWVzIHRoZSBvYmplY3RJZC5cbiAgICAgICAgICAgICAgY29uc3QgY3VycmVudFJlYWRhYmxlID0gaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZFxuICAgICAgICAgICAgICAgID8gZmFsc2VcbiAgICAgICAgICAgICAgICA6IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0wobWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCksIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKCFjdXJyZW50UmVhZGFibGUpIHtcbiAgICAgICAgICAgICAgICBsb2NhbEN1cnJlbnRQYXJzZU9iamVjdCA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkobG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0KSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2VudGVyJykge1xuICAgICAgICAgICAgICAvLyBUaGUgcHJlLXVwZGF0ZSBvYmplY3Qgd2FzIHJlYWRhYmxlIG9uIGEgcXVlcnktbWF0Y2gtZ2FpbiBlbnRlciBidXQgbm90XG4gICAgICAgICAgICAgIC8vIG9uIGFuIEFDTC1ncmFudCBlbnRlci4gT25seSBzZW5kIHRoZSBwcmUtdXBkYXRlIGJvZHkgYXMgYG9yaWdpbmFsYFxuICAgICAgICAgICAgICAvLyB3aGVuIHRoZSBzdWJzY3JpYmVyIGNvdWxkIHJlYWQgdGhlIG9yaWdpbmFsIG9iamVjdC5cbiAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxSZWFkYWJsZSA9IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkXG4gICAgICAgICAgICAgICAgPyBmYWxzZVxuICAgICAgICAgICAgICAgIDogYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCksIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKCFvcmlnaW5hbFJlYWRhYmxlKSB7XG4gICAgICAgICAgICAgICAgbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGxvY2FsQ3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBvcmlnaW5hbDogbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vcmlnaW5hbCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGxvY2FsQ3VycmVudFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgbG9jYWxPcmlnaW5hbFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMoXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMub2JqZWN0ID0gbG9jYWxDdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgICAgICAgICByZXMub3JpZ2luYWwgPSBsb2NhbE9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCByZXMub2JqZWN0LCByZXMub3JpZ2luYWwgPz8gbnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfb25Db25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnkpOiB2b2lkIHtcbiAgICBwYXJzZVdlYnNvY2tldC5vbignbWVzc2FnZScsIHJlcXVlc3QgPT4ge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKHJlcXVlc3QpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgcmVxdWVzdCcsIHJlcXVlc3QsIGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1JlcXVlc3Q6ICVqJywgcmVxdWVzdCk7XG5cbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGEgdmFsaWQgcmVxdWVzdCwgcmV0dXJuIGVycm9yIGRpcmVjdGx5IGlmIG5vdFxuICAgICAgaWYgKFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbJ2dlbmVyYWwnXSkgfHxcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hW3JlcXVlc3Qub3BdKVxuICAgICAgKSB7XG4gICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDEsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25uZWN0IG1lc3NhZ2UgZXJyb3IgJXMnLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChyZXF1ZXN0Lm9wKSB7XG4gICAgICAgIGNhc2UgJ2Nvbm5lY3QnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdzdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VwZGF0ZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndW5zdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAzLCAnR2V0IHVua25vd24gb3BlcmF0aW9uJyk7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgdW5rbm93biBvcGVyYXRpb24nLCByZXF1ZXN0Lm9wKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oYENsaWVudCBkaXNjb25uZWN0OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY29uc3QgY2xpZW50SWQgPSBwYXJzZVdlYnNvY2tldC5jbGllbnRJZDtcbiAgICAgIGlmICghdGhpcy5jbGllbnRzLmhhcyhjbGllbnRJZCkpIHtcbiAgICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0X2Vycm9yJyxcbiAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICBlcnJvcjogYFVuYWJsZSB0byBmaW5kIGNsaWVudCAke2NsaWVudElkfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYENhbiBub3QgZmluZCBjbGllbnQgJHtjbGllbnRJZH0gb24gZGlzY29ubmVjdGApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnRcbiAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICBmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm9dIG9mIF8uZW50cmllcyhjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3MpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgICAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkLCByZXF1ZXN0SWQpO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBldmVudDogJ3dzX2Nvbm5lY3QnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICB9KTtcbiAgfVxuXG4gIF92YWxpZGF0ZVF1ZXJ5Q29uc3RyYWludHMod2hlcmU6IGFueSk6IHZvaWQge1xuICAgIGlmICh0eXBlb2Ygd2hlcmUgIT09ICdvYmplY3QnIHx8IHdoZXJlID09PSBudWxsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgb3Agb2YgWyckb3InLCAnJGFuZCcsICckbm9yJ10pIHtcbiAgICAgIGlmICh3aGVyZVtvcF0gIT09IHVuZGVmaW5lZCAmJiAhQXJyYXkuaXNBcnJheSh3aGVyZVtvcF0pKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgJHtvcH0gbXVzdCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkod2hlcmVbb3BdKSkge1xuICAgICAgICB3aGVyZVtvcF0uZm9yRWFjaCgoc3ViUXVlcnk6IGFueSkgPT4ge1xuICAgICAgICAgIHRoaXMuX3ZhbGlkYXRlUXVlcnlDb25zdHJhaW50cyhzdWJRdWVyeSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh3aGVyZSkpIHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnQgPSB3aGVyZVtrZXldO1xuICAgICAgaWYgKHR5cGVvZiBjb25zdHJhaW50ID09PSAnb2JqZWN0JyAmJiBjb25zdHJhaW50ICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChjb25zdHJhaW50LiRyZWdleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgY29uc3QgcmVnZXggPSBjb25zdHJhaW50LiRyZWdleDtcbiAgICAgICAgICBjb25zdCBpc1JlZ0V4cExpa2UgPVxuICAgICAgICAgICAgcmVnZXggIT09IG51bGwgJiZcbiAgICAgICAgICAgIHR5cGVvZiByZWdleCA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIHR5cGVvZiByZWdleC5zb3VyY2UgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgICB0eXBlb2YgcmVnZXguZmxhZ3MgPT09ICdzdHJpbmcnO1xuICAgICAgICAgIGlmICh0eXBlb2YgcmVnZXggIT09ICdzdHJpbmcnICYmICFpc1JlZ0V4cExpa2UpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgJ0ludmFsaWQgcmVndWxhciBleHByZXNzaW9uOiAkcmVnZXggbXVzdCBiZSBhIHN0cmluZyBvciBSZWdFeHAnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gaXNSZWdFeHBMaWtlID8gcmVnZXguc291cmNlIDogcmVnZXg7XG4gICAgICAgICAgY29uc3QgZmxhZ3MgPSBpc1JlZ0V4cExpa2UgPyByZWdleC5mbGFncyA6IGNvbnN0cmFpbnQuJG9wdGlvbnMgfHwgJyc7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG5ldyBSZWdFeHAocGF0dGVybiwgZmxhZ3MpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEludmFsaWQgcmVndWxhciBleHByZXNzaW9uOiAke2UubWVzc2FnZX1gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9tYXRjaGVzU3Vic2NyaXB0aW9uKHBhcnNlT2JqZWN0OiBhbnksIHN1YnNjcmlwdGlvbjogYW55KTogYm9vbGVhbiB7XG4gICAgLy8gT2JqZWN0IGlzIHVuZGVmaW5lZCBvciBudWxsLCBub3QgbWF0Y2hcbiAgICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzUXVlcnkoc3RydWN0dXJlZENsb25lKHBhcnNlT2JqZWN0KSwgc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgfVxuXG4gIGFzeW5jIF9jbGVhckNhY2hlZFJvbGVzKHVzZXJJZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHZhbGlkVG9rZW5zID0gYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5lcXVhbFRvKCd1c2VyJywgUGFyc2UuVXNlci5jcmVhdGVXaXRob3V0RGF0YSh1c2VySWQpKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICB2YWxpZFRva2Vucy5tYXAoYXN5bmMgdG9rZW4gPT4ge1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHRva2VuLmdldCgnc2Vzc2lvblRva2VuJyk7XG4gICAgICAgICAgY29uc3QgYXV0aFByb21pc2UgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBpZiAoIWF1dGhQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IFthdXRoMSwgYXV0aDJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgYXV0aFByb21pc2UsXG4gICAgICAgICAgICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHsgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlciwgc2Vzc2lvblRva2VuIH0pLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGF1dGgxLmF1dGg/LmNsZWFyUm9sZUNhY2hlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgYXV0aDIuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWxldGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYENvdWxkIG5vdCBjbGVhciByb2xlIGNhY2hlLiAke2V9YCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW4/OiBzdHJpbmcpOiBQcm9taXNlPHsgYXV0aD86IEF1dGgsIHVzZXJJZD86IHN0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM/OiBhbnksXG4gICAgb2JqZWN0PzogYW55LFxuICAgIGNsaWVudD86IGFueSxcbiAgICByZXF1ZXN0SWQ/OiBudW1iZXIsXG4gICAgb3A/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIHVzZXJJZCA9IHJlc3VsdC51c2VySWQ7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcFxuICAgICk7XG4gICAgLy8gRW5mb3JjZSBwb2ludGVyIHBlcm1pc3Npb25zIHRoYXQgdmFsaWRhdGVQZXJtaXNzaW9uIGRlZmVycy5cbiAgICAvLyBSZXR1cm5zIGZhbHNlIHRvIHNpbGVudGx5IHNraXAgdGhlIGV2ZW50IChsaWtlIEFDTCksIHJhdGhlciB0aGFuXG4gICAgLy8gdGhyb3dpbmcgd2hpY2ggd291bGQgcHVzaCBlcnJvcnMgdG8gdGhlIGNsaWVudCBhbmQgbG9nIG5vaXNlLlxuICAgIGlmIChcbiAgICAgICFjbGllbnQuaGFzTWFzdGVyS2V5ICYmXG4gICAgICAhU2NoZW1hQ29udHJvbGxlci50ZXN0UG9pbnRlclBlcm1pc3Npb25zKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgYWNsR3JvdXAsIG9wLCB1c2VySWQsIGZpZWxkID0+XG4gICAgICAgIHR5cGVvZiBvYmplY3QuZ2V0ID09PSAnZnVuY3Rpb24nID8gb2JqZWN0LmdldChmaWVsZCkgOiBvYmplY3RbZmllbGRdXG4gICAgICApXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLy8gYGFkZFByb3RlY3RlZEZpZWxkc2AgcmVhZHMgcm9sZS1zY29wZWQgYHByb3RlY3RlZEZpZWxkc2AgZ3JvdXBzIGZyb21cbiAgLy8gYEF1dGgudXNlclJvbGVzYCwgd2hpY2ggc3RheXMgZW1wdHkgdW5sZXNzIHRoZSByb2xlcyBhcmUgZXhwbGljaXRseSBsb2FkZWQuXG4gIC8vIFdpdGhvdXQgdGhpcywgZXZlcnkgYHJvbGU6YCBncm91cCBpcyBzaWxlbnRseSBza2lwcGVkIGFuZCBMaXZlUXVlcnkgd291bGRcbiAgLy8gZGlzY2xvc2UgZmllbGRzIHRoYXQgdGhlIFJFU1QgcGF0aCBzdHJpcHMgZm9yIHRoZSBzYW1lIGNhbGxlci4gVGhlIHJvbGVzIGFyZVxuICAvLyBvbmx5IGZldGNoZWQgd2hlbiB0aGUgY2xhc3MgYWN0dWFsbHkgZGVjbGFyZXMgYSBgcm9sZTpgIGdyb3VwLCBzbyBjbGFzc2VzXG4gIC8vIHdpdGhvdXQgb25lIGtlZXAgc3Vic2NyaWJpbmcgYW5kIHJlY2VpdmluZyBldmVudHMgd2l0aG91dCBhIHJvbGUgbG9va3VwLlxuICBhc3luYyBfbG9hZFJvbGVzRm9yUHJvdGVjdGVkRmllbGRzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucz86IGFueSwgY2xpZW50QXV0aD86IGFueSkge1xuICAgIGlmICh0eXBlb2YgY2xpZW50QXV0aD8uZ2V0VXNlclJvbGVzICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucz8ucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzIHx8IEFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIU9iamVjdC5rZXlzKHByb3RlY3RlZEZpZWxkcykuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IGNsaWVudEF1dGguZ2V0VXNlclJvbGVzKCk7XG4gIH1cblxuICBhc3luYyBfZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM/OiBhbnksXG4gICAgcmVzPzogYW55LFxuICAgIGNsaWVudD86IGFueSxcbiAgICByZXF1ZXN0SWQ/OiBudW1iZXIsXG4gICAgb3A/OiBzdHJpbmcsXG4gICAgcXVlcnk/OiBhbnlcbiAgKSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgY2xpZW50QXV0aDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAvLyBGYWxsIGJhY2sgdG8gdGhlIGNvbm5lY3QtZnJhbWUgdG9rZW4sIHRoZSBzYW1lIHdheSBgX21hdGNoZXNBQ0xgIGFuZFxuICAgICAgLy8gYGdldEF1dGhGcm9tQ2xpZW50YCBhbHJlYWR5IGRvLiBUaGUgc3Vic2NyaWJlIGZyYW1lJ3Mgc2Vzc2lvbiB0b2tlbiBpc1xuICAgICAgLy8gb3B0aW9uYWwsIHNvIHJlc29sdmluZyBvbmx5IGl0IHdvdWxkIHJlZGFjdCBhZ2FpbnN0IGFuIGFub255bW91cyBpZGVudGl0eVxuICAgICAgLy8gd2hpbGUgdGhlIEFDTCBjaGVjayBhdXRob3JpemVkIHRoZSByZWFkIGFnYWluc3QgdGhlIGNvbm5lY3RlZCB1c2VyLiBUaGF0XG4gICAgICAvLyBtaXNtYXRjaCBza2lwcyBldmVyeSBpZGVudGl0eS1kZXJpdmVkIGBwcm90ZWN0ZWRGaWVsZHNgIGdyb3VwXG4gICAgICAvLyAoYHJvbGU6YCwgYGF1dGhlbnRpY2F0ZWRgIGFuZCBgPG9iamVjdElkPmApLlxuICAgICAgY29uc3QgeyB1c2VySWQsIGF1dGggfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gfHwgY2xpZW50LnNlc3Npb25Ub2tlblxuICAgICAgKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgfVxuICAgIGlmICghY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgYXdhaXQgdGhpcy5fbG9hZFJvbGVzRm9yUHJvdGVjdGVkRmllbGRzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgY2xpZW50QXV0aCk7XG4gICAgfVxuICAgIGNvbnN0IGZpbHRlciA9IG9iaiA9PiB7XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgcHJvdGVjdGVkRmllbGRzID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5wcm90ZWN0ZWRGaWVsZHMgfHwgW107XG4gICAgICBpZiAoY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBbXTtcbiAgICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBnZXREYXRhYmFzZUNvbnRyb2xsZXIodGhpcy5jb25maWcpLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcXVlcnksXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgY2xpZW50QXV0aFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIERhdGFiYXNlQ29udHJvbGxlci5maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBmYWxzZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIGNsaWVudEF1dGgsXG4gICAgICAgIG9wLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIHJlcy5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgIG9iaixcbiAgICAgICAgcXVlcnlcbiAgICAgICk7XG4gICAgfTtcbiAgICByZXMub2JqZWN0ID0gZmlsdGVyKHJlcy5vYmplY3QpO1xuICAgIHJlcy5vcmlnaW5hbCA9IGZpbHRlcihyZXMub3JpZ2luYWwpO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW4/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBnZXRTZXNzaW9uRnJvbUNsaWVudCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiB8fCBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgIH07XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHNlc3Npb25Ub2tlbiA9IGdldFNlc3Npb25Gcm9tQ2xpZW50KCk7XG4gICAgfVxuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbik7XG4gICAgcmV0dXJuIGF1dGg7XG4gIH1cblxuICBfY2hlY2tXYXRjaEZpZWxkcyhjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBhbnksIG1lc3NhZ2U6IGFueSkge1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IHdhdGNoID0gc3Vic2NyaXB0aW9uSW5mbz8ud2F0Y2g7XG4gICAgaWYgKCF3YXRjaCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IG9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIGNvbnN0IG9yaWdpbmFsID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIHJldHVybiB3YXRjaC5zb21lKGZpZWxkID0+ICFpc0RlZXBTdHJpY3RFcXVhbChvYmplY3QuZ2V0KGZpZWxkKSwgb3JpZ2luYWw/LmdldChmaWVsZCkpKTtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQUNMKGFjbDogYW55LCBjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KFxuICAgICAgY2xpZW50SWQsXG4gICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgIGhhc01hc3RlcktleSxcbiAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgcmVxdWVzdC5pbnN0YWxsYXRpb25JZFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcSA9IHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHVzZXI6IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcignQENvbm5lY3QnLCAnYmVmb3JlQ29ubmVjdCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxLnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcS51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZUNvbm5lY3QuQENvbm5lY3RgLCByZXEsIGF1dGgpO1xuICAgICAgfVxuICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICAgIHRoaXMuY2xpZW50cy5zZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIGNsaWVudCk7XG4gICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlIG5ldyBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMocmVxKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZUNvbm5lY3QgZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFzTWFzdGVyS2V5KHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwIHx8ICF2YWxpZEtleVBhaXJzLmhhcygnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0IHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVxdWVzdCwgJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0Lm1hc3RlcktleSA9PT0gdmFsaWRLZXlQYWlycy5nZXQoJ21hc3RlcktleScpO1xuICB9XG5cbiAgX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldCBpc1ZhbGlkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBba2V5LCBzZWNyZXRdIG9mIHZhbGlkS2V5UGFpcnMpIHtcbiAgICAgIGlmICghcmVxdWVzdFtrZXldIHx8IHJlcXVlc3Rba2V5XSAhPT0gc2VjcmV0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHJlcXVlc3QucXVlcnkuY2xhc3NOYW1lO1xuICAgIGxldCBhdXRoQ2FsbGVkID0gZmFsc2U7XG4gICAgbGV0IGNsaWVudEF1dGg7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2JlZm9yZVN1YnNjcmliZScsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxdWVzdC5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBhdXRoQ2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgICAgICAgcGFyc2VRdWVyeS53aXRoSlNPTihyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZVN1YnNjcmliZS4ke2NsYXNzTmFtZX1gLCByZXF1ZXN0LCBhdXRoKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlcXVlc3QucXVlcnkudG9KU09OKCk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykge1xuICAgICAgICBpZiAoIWF1dGhDYWxsZWQpIHtcbiAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChcbiAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkLFxuICAgICAgICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW5cbiAgICAgICAgICApO1xuICAgICAgICAgIGNsaWVudEF1dGggPSBhdXRoO1xuICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC5xdWVyeS53aGVyZS51c2VyID0gcmVxdWVzdC51c2VyLnRvUG9pbnRlcigpO1xuICAgICAgICB9IGVsc2UgaWYgKCFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgICAgICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBWYWxpZGF0ZSBxdWVyeSBjb25kaXRpb24gZGVwdGhcbiAgICAgIGNvbnN0IGFwcENvbmZpZyA9IENvbmZpZy5nZXQodGhpcy5jb25maWcuYXBwSWQpO1xuICAgICAgaWYgKCFjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICAgIGNvbnN0IHJjID0gYXBwQ29uZmlnLnJlcXVlc3RDb21wbGV4aXR5O1xuICAgICAgICBpZiAocmMgJiYgcmMucXVlcnlEZXB0aCAhPT0gLTEpIHtcbiAgICAgICAgICBjb25zdCBtYXhEZXB0aCA9IHJjLnF1ZXJ5RGVwdGg7XG4gICAgICAgICAgY29uc3QgY2hlY2tEZXB0aCA9IChub2RlOiBhbnksIGRlcHRoOiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChkZXB0aCA+IG1heERlcHRoKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICAgIGBRdWVyeSBjb25kaXRpb24gbmVzdGluZyBkZXB0aCBleGNlZWRzIG1heGltdW0gYWxsb3dlZCBkZXB0aCBvZiAke21heERlcHRofWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChub2RlID09PSBudWxsIHx8IHR5cGVvZiBub2RlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShub2RlKSkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygbm9kZSkge1xuICAgICAgICAgICAgICAgIGNoZWNrRGVwdGgoaXRlbSwgZGVwdGgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIERlc2NlbmQgaW50byBldmVyeSB2YWx1ZSBzbyB0aGF0IGxvZ2ljYWwgb3BlcmF0b3JzICgkb3IvJGFuZC8kbm9yKVxuICAgICAgICAgICAgLy8gbmVzdGVkIHVuZGVyIGZpZWxkLWxldmVsIG9wZXJhdG9ycyAoZS5nLiAkZWxlbU1hdGNoLCAkbm90KSBvciBwbGFpblxuICAgICAgICAgICAgLy8gZmllbGQgbmFtZXMgYXJlIHN0aWxsIGNvdW50ZWQuIE9ubHkgbG9naWNhbCBvcGVyYXRvcnMgaW5jcmVhc2UgdGhlXG4gICAgICAgICAgICAvLyBkZXB0aCwgd2hpY2ggcHJlc2VydmVzIHRoZSBkb2N1bWVudGVkIG1lYW5pbmcgb2YgYHF1ZXJ5RGVwdGhgLlxuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobm9kZSkpIHtcbiAgICAgICAgICAgICAgY29uc3QgaXNMb2dpY2FsID0ga2V5ID09PSAnJG9yJyB8fCBrZXkgPT09ICckYW5kJyB8fCBrZXkgPT09ICckbm9yJztcbiAgICAgICAgICAgICAgaWYgKGlzTG9naWNhbCAmJiAhQXJyYXkuaXNBcnJheShub2RlW2tleV0pKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGAke2tleX0gbXVzdCBiZSBhbiBhcnJheWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNoZWNrRGVwdGgobm9kZVtrZXldLCBpc0xvZ2ljYWwgPyBkZXB0aCArIDEgOiBkZXB0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgICBjaGVja0RlcHRoKHJlcXVlc3QucXVlcnkud2hlcmUsIDApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIENMUCBmb3Igc3Vic2NyaWJlIG9wZXJhdGlvblxuICAgICAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IGFwcENvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gICAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24ocmVxdWVzdC5xdWVyeSk7XG4gICAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KFxuICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICAgICApO1xuICAgICAgICBhdXRoQ2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICBhY2xHcm91cC5wdXNoKGF1dGgudXNlci5pZCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocmVxdWVzdC51c2VyKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2gocmVxdWVzdC51c2VyLmlkKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIG9wXG4gICAgICApO1xuXG4gICAgICAvLyBDaGVjayBwcm90ZWN0ZWQgZmllbGRzIGluIFdIRVJFIGNsYXVzZSBhbmQgV0FUQ0ggcGFyYW1ldGVyXG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5fbG9hZFJvbGVzRm9yUHJvdGVjdGVkRmllbGRzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgY2xpZW50QXV0aCk7XG4gICAgICAgIC8vIGBjbGllbnRBdXRoYCBpcyB1bmRlZmluZWQgb25seSB3aGVuIG5vIHNlc3Npb24gdG9rZW4gd2FzIHN1cHBsaWVkIG9uXG4gICAgICAgIC8vIGVpdGhlciBmcmFtZSwgaW4gd2hpY2ggY2FzZSBhIGBiZWZvcmVTdWJzY3JpYmVgIHRyaWdnZXIgaXMgdGhlIG9ubHkgd2F5XG4gICAgICAgIC8vIGByZXF1ZXN0LnVzZXJgIGNhbiBiZSBzZXQuIFRoZXJlIGlzIG5vIHNlc3Npb24gdG8gcmVzb2x2ZSByb2xlcyBmcm9tIGZvclxuICAgICAgICAvLyBzdWNoIGEgdHJpZ2dlci1hc3NpZ25lZCB1c2VyLCBzbyBgcm9sZTpgIGdyb3VwcyBjYW5ub3QgYmUgYXBwbGllZCB0byBpdC5cbiAgICAgICAgY29uc3QgYXV0aCA9IHJlcXVlc3QudXNlciA/IGNsaWVudEF1dGggfHwgeyB1c2VyOiByZXF1ZXN0LnVzZXIsIHVzZXJSb2xlczogW10gfSA6IHt9O1xuICAgICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPVxuICAgICAgICAgIGFwcENvbmZpZy5kYXRhYmFzZS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICByZXF1ZXN0LnF1ZXJ5LndoZXJlLFxuICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICBhdXRoXG4gICAgICAgICAgKSB8fCBbXTtcbiAgICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5sZW5ndGggPiAwICYmIHJlcXVlc3QucXVlcnkud2hlcmUpIHtcbiAgICAgICAgICBjb25zdCBjaGVja1doZXJlID0gKHdoZXJlOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygd2hlcmUgIT09ICdvYmplY3QnIHx8IHdoZXJlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3Qgd2hlcmVLZXkgb2YgT2JqZWN0LmtleXMod2hlcmUpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZCA9IHdoZXJlS2V5LnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgICAgIGlmIChwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMod2hlcmVLZXkpIHx8IHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyhyb290RmllbGQpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCdcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG9wIG9mIFsnJG9yJywgJyRhbmQnLCAnJG5vciddKSB7XG4gICAgICAgICAgICAgIGlmICh3aGVyZVtvcF0gIT09IHVuZGVmaW5lZCAmJiAhQXJyYXkuaXNBcnJheSh3aGVyZVtvcF0pKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGAke29wfSBtdXN0IGJlIGFuIGFycmF5YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkod2hlcmVbb3BdKSkge1xuICAgICAgICAgICAgICAgIHdoZXJlW29wXS5mb3JFYWNoKChzdWJRdWVyeTogYW55KSA9PiBjaGVja1doZXJlKHN1YlF1ZXJ5KSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICAgIGNoZWNrV2hlcmUocmVxdWVzdC5xdWVyeS53aGVyZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5sZW5ndGggPiAwICYmIEFycmF5LmlzQXJyYXkocmVxdWVzdC5xdWVyeS53YXRjaCkpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHdhdGNoRmllbGQgb2YgcmVxdWVzdC5xdWVyeS53YXRjaCkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkID0gd2F0Y2hGaWVsZC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyh3YXRjaEZpZWxkKSB8fCBwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMocm9vdEZpZWxkKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFZhbGlkYXRlIHJlZ2V4IHBhdHRlcm5zIGluIHRoZSBzdWJzY3JpcHRpb24gcXVlcnlcbiAgICAgIHRoaXMuX3ZhbGlkYXRlUXVlcnlDb25zdHJhaW50cyhyZXF1ZXN0LnF1ZXJ5LndoZXJlKTtcblxuICAgICAgLy8gR2V0IHN1YnNjcmlwdGlvbiBmcm9tIHN1YnNjcmlwdGlvbnMsIGNyZWF0ZSBvbmUgaWYgbmVjZXNzYXJ5XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgICAgLy8gQWRkIGNsYXNzTmFtZSB0byBzdWJzY3JpcHRpb25zIGlmIG5lY2Vzc2FyeVxuXG4gICAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzTmFtZSwgbmV3IE1hcCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICAgIGxldCBzdWJzY3JpcHRpb247XG4gICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb25IYXNoKSkge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gbmV3IFN1YnNjcmlwdGlvbihjbGFzc05hbWUsIHJlcXVlc3QucXVlcnkud2hlcmUsIHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBzdWJzY3JpcHRpb25JbmZvIHRvIGNsaWVudFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbzogYW55ID0ge1xuICAgICAgICBzdWJzY3JpcHRpb246IHN1YnNjcmlwdGlvbixcbiAgICAgIH07XG4gICAgICAvLyBBZGQgc2VsZWN0ZWQgZmllbGRzLCBzZXNzaW9uVG9rZW4gYW5kIGluc3RhbGxhdGlvbklkIGZvciB0aGlzIHN1YnNjcmlwdGlvbiBpZiBuZWNlc3NhcnlcbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LmtleXMpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5rZXlzID0gQXJyYXkuaXNBcnJheShyZXF1ZXN0LnF1ZXJ5LmtleXMpXG4gICAgICAgICAgPyByZXF1ZXN0LnF1ZXJ5LmtleXNcbiAgICAgICAgICA6IHJlcXVlc3QucXVlcnkua2V5cy5zcGxpdCgnLCcpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkud2F0Y2gpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby53YXRjaCA9IHJlcXVlc3QucXVlcnkud2F0Y2g7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gPSByZXF1ZXN0LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGNsaWVudC5hZGRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3QucmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvKTtcblxuICAgICAgLy8gQWRkIGNsaWVudElkIHRvIHN1YnNjcmlwdGlvblxuICAgICAgc3Vic2NyaXB0aW9uLmFkZENsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBjbGllbnQucHVzaFN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICBgQ3JlYXRlIGNsaWVudCAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSBuZXcgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICAgICk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnc3Vic2NyaWJlJyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVTdWJzY3JpYmUgb24gJHtjbGFzc05hbWV9IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0LCBmYWxzZSk7XG4gICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgfVxuXG4gIF9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnksIG5vdGlmeUNsaWVudDogYm9vbGVhbiA9IHRydWUpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdElkID0gcmVxdWVzdC5yZXF1ZXN0SWQ7XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIGNsaWVudCB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50ICcgKyBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3Ugc3Vic2NyaWJlIHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzdWJzY3JpcHRpb24gZnJvbSBjbGllbnRcbiAgICBjbGllbnQuZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIC8vIFJlbW92ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25cbiAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBzdWJzY3JpcHRpb24uY2xhc3NOYW1lO1xuICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3RJZCk7XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgIH1cbiAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoY2xhc3NOYW1lKTtcbiAgICB9XG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBjbGllbnQsXG4gICAgICBldmVudDogJ3Vuc3Vic2NyaWJlJyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICBzZXNzaW9uVG9rZW46IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIGlmICghbm90aWZ5Q2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2xpZW50LnB1c2hVbnN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgIGBEZWxldGUgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSB8IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxHQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxhQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxxQkFBQSxHQUFBSixPQUFBO0FBRUEsSUFBQUssT0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sY0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8sV0FBQSxHQUFBUCxPQUFBO0FBQ0EsSUFBQVEsWUFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsaUJBQUEsR0FBQVYsc0JBQUEsQ0FB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