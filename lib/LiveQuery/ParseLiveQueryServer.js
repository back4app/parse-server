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
var _lruCache = require("lru-cache");
var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
var _util = require("util");
var _deepcopy = _interopRequireDefault(require("deepcopy"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
      var _this$subscriber$clos, _this$subscriber;
      await Promise.all([...[...this.clients.values()].map(client => client.parseWebSocket.ws.close()), this.parseWebSocketServer.close(), ...Array.from(this.subscriber.subscriptions.keys()).map(key => this.subscriber.unsubscribe(key)), (_this$subscriber$clos = (_this$subscriber = this.subscriber).close) === null || _this$subscriber$clos === void 0 ? void 0 : _this$subscriber$clos.call(_this$subscriber)]);
    }
    this.subscriber.isOpen = false;
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
      const isSubscriptionMatched = this._matchesSubscription(deletedParseObject, subscription);
      if (!isSubscriptionMatched) {
        continue;
      }
      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
          const acl = message.currentParseObject.getACL();
          // Check CLP
          const op = this._getCLPOperation(subscription.query);
          let res = {};
          try {
            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const isMatched = await this._matchesACL(acl, client, requestId);
            if (!isMatched) {
              return null;
            }
            res = {
              event: 'delete',
              sessionToken: client.sessionToken,
              object: deletedParseObject,
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
              deletedParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            client.pushDelete(requestId, deletedParseObject);
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
      const isOriginalSubscriptionMatched = this._matchesSubscription(originalParseObject, subscription);
      const isCurrentSubscriptionMatched = this._matchesSubscription(currentParseObject, subscription);
      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
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
            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const [isOriginalMatched, isCurrentMatched] = await Promise.all([originalACLCheckingPromise, currentACLCheckingPromise]);
            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash);
            // Decide event type
            let type;
            if (isOriginalMatched && isCurrentMatched) {
              type = 'update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (originalParseObject) {
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
            res = {
              event: type,
              sessionToken: client.sessionToken,
              object: currentParseObject,
              original: originalParseObject,
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
              currentParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }
            if (res.original && typeof res.original.toJSON === 'function') {
              originalParseObject = (0, _triggers.toJSONwithObjects)(res.original, res.original.className || className);
            }
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            const functionName = 'push' + res.event.charAt(0).toUpperCase() + res.event.slice(1);
            if (client[functionName]) {
              client[functionName](requestId, currentParseObject, originalParseObject);
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
  _matchesSubscription(parseObject, subscription) {
    // Object is undefined or null, not match
    if (!parseObject) {
      return false;
    }
    return (0, _QueryTools.matchesQuery)((0, _deepcopy.default)(parseObject), subscription.query);
  }
  async _clearCachedRoles(userId) {
    try {
      const validTokens = await new _node.default.Query(_node.default.Session).equalTo('user', _node.default.User.createWithoutData(userId)).find({
        useMasterKey: true
      });
      await Promise.all(validTokens.map(async token => {
        var _auth1$auth, _auth2$auth;
        const sessionToken = token.get('sessionToken');
        const authPromise = this.authCache.get(sessionToken);
        if (!authPromise) {
          return;
        }
        const [auth1, auth2] = await Promise.all([authPromise, (0, _Auth.getAuthForSessionToken)({
          cacheController: this.cacheController,
          sessionToken
        })]);
        (_auth1$auth = auth1.auth) === null || _auth1$auth === void 0 || _auth1$auth.clearRoleCache(sessionToken);
        (_auth2$auth = auth2.auth) === null || _auth2$auth === void 0 || _auth2$auth.clearRoleCache(sessionToken);
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
    // try to match on user first, less expensive than with roles
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let userId;
    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);
      if (userId) {
        aclGroup.push(userId);
      }
    }
    try {
      await _SchemaController.default.validatePermission(classLevelPermissions, object.className, aclGroup, op);
      return true;
    } catch (e) {
      _logger.default.verbose(`Failed matching CLP for ${object.id} ${userId} ${e}`);
      return false;
    }
    // TODO: handle roles permissions
    // Object.keys(classLevelPermissions).forEach((key) => {
    //   const perm = classLevelPermissions[key];
    //   Object.keys(perm).forEach((key) => {
    //     if (key.indexOf('role'))
    //   });
    // })
    // // it's rejected here, check the roles
    // var rolesQuery = new Parse.Query(Parse.Role);
    // rolesQuery.equalTo("users", user);
    // return rolesQuery.find({useMasterKey:true});
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
      let protectedFields = (classLevelPermissions === null || classLevelPermissions === void 0 ? void 0 : classLevelPermissions.protectedFields) || [];
      if (!client.hasMasterKey && !Array.isArray(protectedFields)) {
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
    const watch = subscriptionInfo === null || subscriptionInfo === void 0 ? void 0 : subscriptionInfo.watch;
    if (!watch) {
      return true;
    }
    const object = message.currentParseObject;
    const original = message.originalParseObject;
    return watch.some(field => !(0, _util.isDeepStrictEqual)(object.get(field), original === null || original === void 0 ? void 0 : original.get(field)));
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
        installationId: request.installationId
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfbHJ1Q2FjaGUiLCJfVXNlcnNSb3V0ZXIiLCJfRGF0YWJhc2VDb250cm9sbGVyIiwiX3V0aWwiLCJfZGVlcGNvcHkiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwidHRsIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJjb25uZWN0IiwiaXNPcGVuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfY3JlYXRlU3Vic2NyaWJlcnMiLCJzaHV0ZG93biIsIl90aGlzJHN1YnNjcmliZXIkY2xvcyIsIl90aGlzJHN1YnNjcmliZXIiLCJhbGwiLCJ2YWx1ZXMiLCJtYXAiLCJjbGllbnQiLCJwYXJzZVdlYlNvY2tldCIsIndzIiwiY2xvc2UiLCJBcnJheSIsImZyb20iLCJ1bnN1YnNjcmliZSIsImNhbGwiLCJtZXNzYWdlUmVjaWV2ZWQiLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlcnJvciIsIl9jbGVhckNhY2hlZFJvbGVzIiwidXNlcklkIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwib24iLCJmaWVsZCIsInN1YnNjcmliZSIsImN1cnJlbnRQYXJzZU9iamVjdCIsIlVzZXJSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiY2xhc3NOYW1lIiwicGFyc2VPYmplY3QiLCJfZmluaXNoRmV0Y2giLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiZGVsZXRlZFBhcnNlT2JqZWN0IiwidG9KU09OIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaWQiLCJzaXplIiwiY2xhc3NTdWJzY3JpcHRpb25zIiwiZ2V0IiwiZGVidWciLCJzdWJzY3JpcHRpb24iLCJpc1N1YnNjcmlwdGlvbk1hdGNoZWQiLCJfbWF0Y2hlc1N1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkcyIsIl8iLCJlbnRyaWVzIiwiY2xpZW50UmVxdWVzdElkcyIsImZvckVhY2giLCJyZXF1ZXN0SWQiLCJhY2wiLCJnZXRBQ0wiLCJvcCIsIl9nZXRDTFBPcGVyYXRpb24iLCJxdWVyeSIsInJlcyIsIl9tYXRjaGVzQ0xQIiwiaXNNYXRjaGVkIiwiX21hdGNoZXNBQ0wiLCJldmVudCIsInNlc3Npb25Ub2tlbiIsIm9iamVjdCIsInVzZU1hc3RlcktleSIsImhhc01hc3RlcktleSIsImluc3RhbGxhdGlvbklkIiwic2VuZEV2ZW50IiwidHJpZ2dlciIsImdldFRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJydW5UcmlnZ2VyIiwidG9KU09Od2l0aE9iamVjdHMiLCJfZmlsdGVyU2Vuc2l0aXZlRGF0YSIsInB1c2hEZWxldGUiLCJyZXNvbHZlRXJyb3IiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJjb2RlIiwic3RyaW5naWZ5IiwiaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkIiwib3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiaGFzaCIsInR5cGUiLCJ3YXRjaEZpZWxkc0NoYW5nZWQiLCJfY2hlY2tXYXRjaEZpZWxkcyIsIm9yaWdpbmFsIiwiZnVuY3Rpb25OYW1lIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJzbGljZSIsInJlcXVlc3QiLCJ0djQiLCJ2YWxpZGF0ZSIsIlJlcXVlc3RTY2hlbWEiLCJfaGFuZGxlQ29ubmVjdCIsIl9oYW5kbGVTdWJzY3JpYmUiLCJfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uIiwiX2hhbmRsZVVuc3Vic2NyaWJlIiwiaW5mbyIsImhhcyIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsIm1hdGNoZXNRdWVyeSIsImRlZXBjb3B5IiwidmFsaWRUb2tlbnMiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiVXNlciIsImNyZWF0ZVdpdGhvdXREYXRhIiwiZmluZCIsInRva2VuIiwiX2F1dGgxJGF1dGgiLCJfYXV0aDIkYXV0aCIsImF1dGhQcm9taXNlIiwiYXV0aDEiLCJhdXRoMiIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJjbGVhclJvbGVDYWNoZSIsImZyb21DYWNoZSIsInRoZW4iLCJjYXRjaCIsInJlc3VsdCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImFjbEdyb3VwIiwicHVzaCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjbGllbnRBdXRoIiwiZmlsdGVyIiwib2JqIiwicHJvdGVjdGVkRmllbGRzIiwiaXNBcnJheSIsImdldERhdGFiYXNlQ29udHJvbGxlciIsImFkZFByb3RlY3RlZEZpZWxkcyIsIkRhdGFiYXNlQ29udHJvbGxlciIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJsZW5ndGgiLCJvYmplY3RJZCIsIl92ZXJpZnlBQ0wiLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50Iiwid2F0Y2giLCJpc0RlZXBTdHJpY3RFcXVhbCIsImdldFB1YmxpY1JlYWRBY2Nlc3MiLCJzdWJzY3JpcHRpb25Ub2tlbiIsImNsaWVudFNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZUtleXMiLCJfaGFzTWFzdGVyS2V5IiwidXVpZHY0IiwicmVxIiwicHVzaENvbm5lY3QiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJpc1ZhbGlkIiwic2VjcmV0IiwiYXV0aENhbGxlZCIsInBhcnNlUXVlcnkiLCJ3aXRoSlNPTiIsIndoZXJlIiwidG9Qb2ludGVyIiwibWFzdGVyIiwic3Vic2NyaXB0aW9uSGFzaCIsInF1ZXJ5SGFzaCIsIlN1YnNjcmlwdGlvbiIsInNwbGl0IiwiYWRkU3Vic2NyaXB0aW9uSW5mbyIsImFkZENsaWVudFN1YnNjcmlwdGlvbiIsInB1c2hTdWJzY3JpYmUiLCJub3RpZnlDbGllbnQiLCJkZWxldGVTdWJzY3JpcHRpb25JbmZvIiwicHVzaFVuc3Vic2NyaWJlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR2NCBmcm9tICd0djQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi9TdWJzY3JpcHRpb24nO1xuaW1wb3J0IHsgQ2xpZW50IH0gZnJvbSAnLi9DbGllbnQnO1xuaW1wb3J0IHsgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIgfSBmcm9tICcuL1BhcnNlV2ViU29ja2V0U2VydmVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBSZXF1ZXN0U2NoZW1hIGZyb20gJy4vUmVxdWVzdFNjaGVtYSc7XG5pbXBvcnQgeyBtYXRjaGVzUXVlcnksIHF1ZXJ5SGFzaCB9IGZyb20gJy4vUXVlcnlUb29scyc7XG5pbXBvcnQgeyBQYXJzZVB1YlN1YiB9IGZyb20gJy4vUGFyc2VQdWJTdWInO1xuaW1wb3J0IFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQge1xuICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzLFxuICBnZXRUcmlnZ2VyLFxuICBydW5UcmlnZ2VyLFxuICByZXNvbHZlRXJyb3IsXG4gIHRvSlNPTndpdGhPYmplY3RzLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIsIGdldERhdGFiYXNlQ29udHJvbGxlciB9IGZyb20gJy4uL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IExSVUNhY2hlIGFzIExSVSB9IGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuXG5jbGFzcyBQYXJzZUxpdmVRdWVyeVNlcnZlciB7XG4gIGNsaWVudHM6IE1hcDtcbiAgLy8gY2xhc3NOYW1lIC0+IChxdWVyeUhhc2ggLT4gc3Vic2NyaXB0aW9uKVxuICBzdWJzY3JpcHRpb25zOiBPYmplY3Q7XG4gIHBhcnNlV2ViU29ja2V0U2VydmVyOiBPYmplY3Q7XG4gIGtleVBhaXJzOiBhbnk7XG4gIC8vIFRoZSBzdWJzY3JpYmVyIHdlIHVzZSB0byBnZXQgb2JqZWN0IHVwZGF0ZSBmcm9tIHB1Ymxpc2hlclxuICBzdWJzY3JpYmVyOiBPYmplY3Q7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIGNvbmZpZzogYW55ID0ge30sIHBhcnNlU2VydmVyQ29uZmlnOiBhbnkgPSB7fSkge1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuICAgIHRoaXMuY2xpZW50cyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICBjb25maWcuYXBwSWQgPSBjb25maWcuYXBwSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICBjb25maWcubWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleSB8fCBQYXJzZS5tYXN0ZXJLZXk7XG5cbiAgICAvLyBTdG9yZSBrZXlzLCBjb252ZXJ0IG9iaiB0byBtYXBcbiAgICBjb25zdCBrZXlQYWlycyA9IGNvbmZpZy5rZXlQYWlycyB8fCB7fTtcbiAgICB0aGlzLmtleVBhaXJzID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGtleVBhaXJzKSkge1xuICAgICAgdGhpcy5rZXlQYWlycy5zZXQoa2V5LCBrZXlQYWlyc1trZXldKTtcbiAgICB9XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ1N1cHBvcnQga2V5IHBhaXJzJywgdGhpcy5rZXlQYWlycyk7XG5cbiAgICAvLyBJbml0aWFsaXplIFBhcnNlXG4gICAgUGFyc2UuT2JqZWN0LmRpc2FibGVTaW5nbGVJbnN0YW5jZSgpO1xuICAgIGNvbnN0IHNlcnZlclVSTCA9IGNvbmZpZy5zZXJ2ZXJVUkwgfHwgUGFyc2Uuc2VydmVyVVJMO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBQYXJzZS5pbml0aWFsaXplKGNvbmZpZy5hcHBJZCwgUGFyc2UuamF2YVNjcmlwdEtleSwgY29uZmlnLm1hc3RlcktleSk7XG5cbiAgICAvLyBUaGUgY2FjaGUgY29udHJvbGxlciBpcyBhIHByb3BlciBjYWNoZSBjb250cm9sbGVyXG4gICAgLy8gd2l0aCBhY2Nlc3MgdG8gVXNlciBhbmQgUm9sZXNcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGdldENhY2hlQ29udHJvbGxlcihwYXJzZVNlcnZlckNvbmZpZyk7XG5cbiAgICBjb25maWcuY2FjaGVUaW1lb3V0ID0gY29uZmlnLmNhY2hlVGltZW91dCB8fCA1ICogMTAwMDsgLy8gNXNcblxuICAgIC8vIFRoaXMgYXV0aCBjYWNoZSBzdG9yZXMgdGhlIHByb21pc2VzIGZvciBlYWNoIGF1dGggcmVzb2x1dGlvbi5cbiAgICAvLyBUaGUgbWFpbiBiZW5lZml0IGlzIHRvIGJlIGFibGUgdG8gcmV1c2UgdGhlIHNhbWUgdXNlciAvIHNlc3Npb24gdG9rZW4gcmVzb2x1dGlvbi5cbiAgICB0aGlzLmF1dGhDYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiA1MDAsIC8vIDUwMCBjb25jdXJyZW50XG4gICAgICB0dGw6IGNvbmZpZy5jYWNoZVRpbWVvdXQsXG4gICAgfSk7XG4gICAgLy8gSW5pdGlhbGl6ZSB3ZWJzb2NrZXQgc2VydmVyXG4gICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlciA9IG5ldyBQYXJzZVdlYlNvY2tldFNlcnZlcihcbiAgICAgIHNlcnZlcixcbiAgICAgIHBhcnNlV2Vic29ja2V0ID0+IHRoaXMuX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldCksXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICBpZiAoIXRoaXMuc3Vic2NyaWJlci5jb25uZWN0KSB7XG4gICAgICB0aGlzLmNvbm5lY3QoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLnN1YnNjcmliZXIuaXNPcGVuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnN1YnNjcmliZXIuY29ubmVjdCgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLmlzT3BlbiA9IHRydWU7XG4gICAgfVxuICAgIHRoaXMuX2NyZWF0ZVN1YnNjcmliZXJzKCk7XG4gIH1cblxuICBhc3luYyBzaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5zdWJzY3JpYmVyLmlzT3Blbikge1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAuLi5bLi4udGhpcy5jbGllbnRzLnZhbHVlcygpXS5tYXAoY2xpZW50ID0+IGNsaWVudC5wYXJzZVdlYlNvY2tldC53cy5jbG9zZSgpKSxcbiAgICAgICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlci5jbG9zZSgpLFxuICAgICAgICAuLi5BcnJheS5mcm9tKHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpcHRpb25zLmtleXMoKSkubWFwKGtleSA9PlxuICAgICAgICAgIHRoaXMuc3Vic2NyaWJlci51bnN1YnNjcmliZShrZXkpXG4gICAgICAgICksXG4gICAgICAgIHRoaXMuc3Vic2NyaWJlci5jbG9zZT8uKCksXG4gICAgICBdKTtcbiAgICB9XG4gICAgdGhpcy5zdWJzY3JpYmVyLmlzT3BlbiA9IGZhbHNlO1xuICB9XG5cbiAgX2NyZWF0ZVN1YnNjcmliZXJzKCkge1xuICAgIGNvbnN0IG1lc3NhZ2VSZWNpZXZlZCA9IChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiB7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnU3Vic2NyaWJlIG1lc3NhZ2UgJWonLCBtZXNzYWdlU3RyKTtcbiAgICAgIGxldCBtZXNzYWdlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZVN0cik7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIG1lc3NhZ2UnLCBtZXNzYWdlU3RyLCBlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnY2xlYXJDYWNoZScpIHtcbiAgICAgICAgdGhpcy5fY2xlYXJDYWNoZWRSb2xlcyhtZXNzYWdlLnVzZXJJZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfTtcbiAgICB0aGlzLnN1YnNjcmliZXIub24oJ21lc3NhZ2UnLCAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4gbWVzc2FnZVJlY2lldmVkKGNoYW5uZWwsIG1lc3NhZ2VTdHIpKTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIFsnYWZ0ZXJTYXZlJywgJ2FmdGVyRGVsZXRlJywgJ2NsZWFyQ2FjaGUnXSkge1xuICAgICAgY29uc3QgY2hhbm5lbCA9IGAke1BhcnNlLmFwcGxpY2F0aW9uSWR9JHtmaWVsZH1gO1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShjaGFubmVsLCBtZXNzYWdlU3RyID0+IG1lc3NhZ2VSZWNpZXZlZChjaGFubmVsLCBtZXNzYWdlU3RyKSk7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBKU09OIGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QgSlNPTi5cbiAgX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAvLyBJbmZsYXRlIG1lcmdlZCBvYmplY3RcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMoY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBsZXQgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsZXQgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICAvLyBJbmZsYXRlIG9yaWdpbmFsIG9iamVjdFxuICAgIGNvbnN0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIGNsYXNzTmFtZSA9IG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgICAgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2gob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyRGVsZXRlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgZGVsZXRlZFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlaiB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgZGVsZXRlZFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc1N1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKGRlbGV0ZWRQYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIGlmICghaXNTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIGNvbnN0IGFjbCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgIC8vIENoZWNrIENMUFxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBpc01hdGNoZWQgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgaWYgKCFpc01hdGNoZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGRlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjbGllbnQucHVzaERlbGV0ZShyZXF1ZXN0SWQsIGRlbGV0ZWRQYXJzZU9iamVjdCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBjb25zdCBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gU2V0IG9yaWduYWwgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbEFDTDtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0wgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0wob3JpZ2luYWxBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2V0IGN1cnJlbnQgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChjdXJyZW50QUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbE1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5oYXNoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gRGVjaWRlIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGxldCB0eXBlO1xuICAgICAgICAgICAgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICd1cGRhdGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiAhaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ2xlYXZlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2VudGVyJztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NyZWF0ZSc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2F0Y2hGaWVsZHNDaGFuZ2VkID0gdGhpcy5fY2hlY2tXYXRjaEZpZWxkcyhjbGllbnQsIHJlcXVlc3RJZCwgbWVzc2FnZSk7XG4gICAgICAgICAgICBpZiAoIXdhdGNoRmllbGRzQ2hhbmdlZCAmJiAodHlwZSA9PT0gJ3VwZGF0ZScgfHwgdHlwZSA9PT0gJ2NyZWF0ZScpKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6IHR5cGUsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vcmlnaW5hbCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsICYmIHR5cGVvZiByZXMub3JpZ2luYWwudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwsXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLmNsYXNzTmFtZSB8fCBjbGFzc05hbWVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9ICdwdXNoJyArIHJlcy5ldmVudC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHJlcy5ldmVudC5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChjbGllbnRbZnVuY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgICBjbGllbnRbZnVuY3Rpb25OYW1lXShyZXF1ZXN0SWQsIGN1cnJlbnRQYXJzZU9iamVjdCwgb3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfb25Db25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnkpOiB2b2lkIHtcbiAgICBwYXJzZVdlYnNvY2tldC5vbignbWVzc2FnZScsIHJlcXVlc3QgPT4ge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKHJlcXVlc3QpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgcmVxdWVzdCcsIHJlcXVlc3QsIGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1JlcXVlc3Q6ICVqJywgcmVxdWVzdCk7XG5cbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGEgdmFsaWQgcmVxdWVzdCwgcmV0dXJuIGVycm9yIGRpcmVjdGx5IGlmIG5vdFxuICAgICAgaWYgKFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbJ2dlbmVyYWwnXSkgfHxcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hW3JlcXVlc3Qub3BdKVxuICAgICAgKSB7XG4gICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDEsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25uZWN0IG1lc3NhZ2UgZXJyb3IgJXMnLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChyZXF1ZXN0Lm9wKSB7XG4gICAgICAgIGNhc2UgJ2Nvbm5lY3QnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdzdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VwZGF0ZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndW5zdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAzLCAnR2V0IHVua25vd24gb3BlcmF0aW9uJyk7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgdW5rbm93biBvcGVyYXRpb24nLCByZXF1ZXN0Lm9wKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oYENsaWVudCBkaXNjb25uZWN0OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY29uc3QgY2xpZW50SWQgPSBwYXJzZVdlYnNvY2tldC5jbGllbnRJZDtcbiAgICAgIGlmICghdGhpcy5jbGllbnRzLmhhcyhjbGllbnRJZCkpIHtcbiAgICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0X2Vycm9yJyxcbiAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICBlcnJvcjogYFVuYWJsZSB0byBmaW5kIGNsaWVudCAke2NsaWVudElkfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYENhbiBub3QgZmluZCBjbGllbnQgJHtjbGllbnRJZH0gb24gZGlzY29ubmVjdGApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnRcbiAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICBmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm9dIG9mIF8uZW50cmllcyhjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3MpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgICAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkLCByZXF1ZXN0SWQpO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBldmVudDogJ3dzX2Nvbm5lY3QnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICB9KTtcbiAgfVxuXG4gIF9tYXRjaGVzU3Vic2NyaXB0aW9uKHBhcnNlT2JqZWN0OiBhbnksIHN1YnNjcmlwdGlvbjogYW55KTogYm9vbGVhbiB7XG4gICAgLy8gT2JqZWN0IGlzIHVuZGVmaW5lZCBvciBudWxsLCBub3QgbWF0Y2hcbiAgICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzUXVlcnkoZGVlcGNvcHkocGFyc2VPYmplY3QpLCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgYXN5bmMgX2NsZWFyQ2FjaGVkUm9sZXModXNlcklkOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsaWRUb2tlbnMgPSBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmVxdWFsVG8oJ3VzZXInLCBQYXJzZS5Vc2VyLmNyZWF0ZVdpdGhvdXREYXRhKHVzZXJJZCkpXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIHZhbGlkVG9rZW5zLm1hcChhc3luYyB0b2tlbiA9PiB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvblRva2VuID0gdG9rZW4uZ2V0KCdzZXNzaW9uVG9rZW4nKTtcbiAgICAgICAgICBjb25zdCBhdXRoUHJvbWlzZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIGlmICghYXV0aFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgW2F1dGgxLCBhdXRoMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBhdXRoUHJvbWlzZSxcbiAgICAgICAgICAgIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oeyBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLCBzZXNzaW9uVG9rZW4gfSksXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgYXV0aDEuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBhdXRoMi5hdXRoPy5jbGVhclJvbGVDYWNoZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgQ291bGQgbm90IGNsZWFyIHJvbGUgY2FjaGUuICR7ZX1gKTtcbiAgICB9XG4gIH1cblxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbjogP3N0cmluZyk6IFByb21pc2U8eyBhdXRoOiA/QXV0aCwgdXNlcklkOiA/c3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgb2JqZWN0OiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZ1xuICApOiBhbnkge1xuICAgIC8vIHRyeSB0byBtYXRjaCBvbiB1c2VyIGZpcnN0LCBsZXNzIGV4cGVuc2l2ZSB0aGFuIHdpdGggcm9sZXNcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbik7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBvcFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBGYWlsZWQgbWF0Y2hpbmcgQ0xQIGZvciAke29iamVjdC5pZH0gJHt1c2VySWR9ICR7ZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gVE9ETzogaGFuZGxlIHJvbGVzIHBlcm1pc3Npb25zXG4gICAgLy8gT2JqZWN0LmtleXMoY2xhc3NMZXZlbFBlcm1pc3Npb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgIGNvbnN0IHBlcm0gPSBjbGFzc0xldmVsUGVybWlzc2lvbnNba2V5XTtcbiAgICAvLyAgIE9iamVjdC5rZXlzKHBlcm0pLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgICBpZiAoa2V5LmluZGV4T2YoJ3JvbGUnKSlcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0pXG4gICAgLy8gLy8gaXQncyByZWplY3RlZCBoZXJlLCBjaGVjayB0aGUgcm9sZXNcbiAgICAvLyB2YXIgcm9sZXNRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKTtcbiAgICAvLyByb2xlc1F1ZXJ5LmVxdWFsVG8oXCJ1c2Vyc1wiLCB1c2VyKTtcbiAgICAvLyByZXR1cm4gcm9sZXNRdWVyeS5maW5kKHt1c2VNYXN0ZXJLZXk6dHJ1ZX0pO1xuICB9XG5cbiAgYXN5bmMgX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIHJlczogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueVxuICApIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCBjbGllbnRBdXRoO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkLCBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBjbGllbnRBdXRoID0gYXV0aDtcbiAgICB9XG4gICAgY29uc3QgZmlsdGVyID0gb2JqID0+IHtcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM/LnByb3RlY3RlZEZpZWxkcyB8fCBbXTtcbiAgICAgIGlmICghY2xpZW50Lmhhc01hc3RlcktleSAmJiAhQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGdldERhdGFiYXNlQ29udHJvbGxlcih0aGlzLmNvbmZpZykuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICByZXMub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICBjbGllbnRBdXRoXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gRGF0YWJhc2VDb250cm9sbGVyLmZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgIGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGZhbHNlLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgY2xpZW50QXV0aCxcbiAgICAgICAgb3AsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgb2JqLFxuICAgICAgICBxdWVyeVxuICAgICAgKTtcbiAgICB9O1xuICAgIHJlcy5vYmplY3QgPSBmaWx0ZXIocmVzLm9iamVjdCk7XG4gICAgcmVzLm9yaWdpbmFsID0gZmlsdGVyKHJlcy5vcmlnaW5hbCk7XG4gIH1cblxuICBfZ2V0Q0xQT3BlcmF0aW9uKHF1ZXJ5OiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mIHF1ZXJ5ID09PSAnb2JqZWN0JyAmJlxuICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PSAxICYmXG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICA/ICdnZXQnXG4gICAgICA6ICdmaW5kJztcbiAgfVxuXG4gIGFzeW5jIF92ZXJpZnlBQ0woYWNsOiBhbnksIHRva2VuOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgeyBhdXRoLCB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih0b2tlbik7XG5cbiAgICAvLyBHZXR0aW5nIHRoZSBzZXNzaW9uIHRva2VuIGZhaWxlZFxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBubyBhZGRpdGlvbmFsIGF1dGggaXMgYXZhaWxhYmxlXG4gICAgLy8gQXQgdGhpcyBwb2ludCwganVzdCBiYWlsIG91dCBhcyBubyBhZGRpdGlvbmFsIHZpc2liaWxpdHkgY2FuIGJlIGluZmVycmVkLlxuICAgIGlmICghYXV0aCB8fCAhdXNlcklkKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCA9IGFjbC5nZXRSZWFkQWNjZXNzKHVzZXJJZCk7XG4gICAgaWYgKGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHVzZXIgaGFzIGFueSByb2xlcyB0aGF0IG1hdGNoIHRoZSBBQ0xcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gUmVzb2x2ZSBmYWxzZSByaWdodCBhd2F5IGlmIHRoZSBhY2wgZG9lc24ndCBoYXZlIGFueSByb2xlc1xuICAgICAgICBjb25zdCBhY2xfaGFzX3JvbGVzID0gT2JqZWN0LmtleXMoYWNsLnBlcm1pc3Npb25zQnlJZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpO1xuICAgICAgICBpZiAoIWFjbF9oYXNfcm9sZXMpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRBdXRoRnJvbUNsaWVudChjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIsIHNlc3Npb25Ub2tlbjogc3RyaW5nKSB7XG4gICAgY29uc3QgZ2V0U2Vzc2lvbkZyb21DbGllbnQgPSAoKSA9PiB7XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICByZXR1cm4gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gfHwgY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICB9O1xuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICBzZXNzaW9uVG9rZW4gPSBnZXRTZXNzaW9uRnJvbUNsaWVudCgpO1xuICAgIH1cbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IGF1dGggfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW4pO1xuICAgIHJldHVybiBhdXRoO1xuICB9XG5cbiAgX2NoZWNrV2F0Y2hGaWVsZHMoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogYW55LCBtZXNzYWdlOiBhbnkpIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCB3YXRjaCA9IHN1YnNjcmlwdGlvbkluZm8/LndhdGNoO1xuICAgIGlmICghd2F0Y2gpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBvYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBjb25zdCBvcmlnaW5hbCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICByZXR1cm4gd2F0Y2guc29tZShmaWVsZCA9PiAhaXNEZWVwU3RyaWN0RXF1YWwob2JqZWN0LmdldChmaWVsZCksIG9yaWdpbmFsPy5nZXQoZmllbGQpKSk7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0FDTChhY2w6IGFueSwgY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgLy8gUmV0dXJuIHRydWUgZGlyZWN0bHkgaWYgQUNMIGlzbid0IHByZXNlbnQsIEFDTCBpcyBwdWJsaWMgcmVhZCwgb3IgY2xpZW50IGhhcyBtYXN0ZXIga2V5XG4gICAgaWYgKCFhY2wgfHwgYWNsLmdldFB1YmxpY1JlYWRBY2Nlc3MoKSB8fCBjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgc3Vic2NyaXB0aW9uIHNlc3Npb25Ub2tlbiBtYXRjaGVzIEFDTCBmaXJzdFxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25Ub2tlbiA9IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuO1xuICAgIGNvbnN0IGNsaWVudFNlc3Npb25Ub2tlbiA9IGNsaWVudC5zZXNzaW9uVG9rZW47XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgc3Vic2NyaXB0aW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgY2xpZW50U2Vzc2lvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICBpZiAoIXRoaXMuX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgNCwgJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgbG9nZ2VyLmVycm9yKCdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFzTWFzdGVyS2V5ID0gdGhpcy5faGFzTWFzdGVyS2V5KHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpO1xuICAgIGNvbnN0IGNsaWVudElkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudChcbiAgICAgIGNsaWVudElkLFxuICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICBoYXNNYXN0ZXJLZXksXG4gICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgIHJlcXVlc3QuaW5zdGFsbGF0aW9uSWRcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXEgPSB7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiByZXF1ZXN0Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKCdAQ29ubmVjdCcsICdiZWZvcmVDb25uZWN0JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXEuc2Vzc2lvblRva2VuKTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlQ29ubmVjdC5AQ29ubmVjdGAsIHJlcSwgYXV0aCk7XG4gICAgICB9XG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCA9IGNsaWVudElkO1xuICAgICAgdGhpcy5jbGllbnRzLnNldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNsaWVudC5wdXNoQ29ubmVjdCgpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhyZXEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gICAgICAgIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVTdWJzY3JpYmUuJHtjbGFzc05hbWV9YCwgcmVxdWVzdCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0LnF1ZXJ5LnRvSlNPTigpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3QudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUudXNlciA9IHJlcXVlc3QudXNlci50b1BvaW50ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gR2V0IHN1YnNjcmlwdGlvbiBmcm9tIHN1YnNjcmlwdGlvbnMsIGNyZWF0ZSBvbmUgaWYgbmVjZXNzYXJ5XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgICAgLy8gQWRkIGNsYXNzTmFtZSB0byBzdWJzY3JpcHRpb25zIGlmIG5lY2Vzc2FyeVxuXG4gICAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzTmFtZSwgbmV3IE1hcCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICAgIGxldCBzdWJzY3JpcHRpb247XG4gICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb25IYXNoKSkge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gbmV3IFN1YnNjcmlwdGlvbihjbGFzc05hbWUsIHJlcXVlc3QucXVlcnkud2hlcmUsIHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBzdWJzY3JpcHRpb25JbmZvIHRvIGNsaWVudFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5rZXlzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ua2V5cyA9IEFycmF5LmlzQXJyYXkocmVxdWVzdC5xdWVyeS5rZXlzKVxuICAgICAgICAgID8gcmVxdWVzdC5xdWVyeS5rZXlzXG4gICAgICAgICAgOiByZXF1ZXN0LnF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LndhdGNoKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ud2F0Y2ggPSByZXF1ZXN0LnF1ZXJ5LndhdGNoO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlU3Vic2NyaWJlIG9uICR7Y2xhc3NOYW1lfSBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsR0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsS0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsYUFBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsT0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUkscUJBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLGNBQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLFdBQUEsR0FBQVAsT0FBQTtBQUNBLElBQUFRLFlBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLGlCQUFBLEdBQUFWLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVSxPQUFBLEdBQUFYLHNC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