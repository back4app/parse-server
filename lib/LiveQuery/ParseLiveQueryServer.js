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
var _lruCache = _interopRequireDefault(require("lru-cache"));
var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
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
    this.authCache = new _lruCache.default({
      max: 500,
      // 500 concurrent
      maxAge: config.cacheTimeout
    });
    // Initialize websocket server
    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config);

    // Initialize subscriber
    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node.default.applicationId + 'afterDelete');
    // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.
    this.subscriber.on('message', (channel, messageStr) => {
      _logger.default.verbose('Subscribe message %j', messageStr);
      let message;
      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        _logger.default.error('unable to parse message', messageStr, e);
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
    });
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
            if ((deletedParseObject.className === '_User' || deletedParseObject.className === '_Session') && !client.hasMasterKey) {
              delete deletedParseObject.sessionToken;
              delete deletedParseObject.authData;
            }
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
            if ((currentParseObject.className === '_User' || currentParseObject.className === '_Session') && !client.hasMasterKey) {
              var _originalParseObject, _originalParseObject2;
              delete currentParseObject.sessionToken;
              (_originalParseObject = originalParseObject) === null || _originalParseObject === void 0 ? true : delete _originalParseObject.sessionToken;
              delete currentParseObject.authData;
              (_originalParseObject2 = originalParseObject) === null || _originalParseObject2 === void 0 ? true : delete _originalParseObject2.authData;
            }
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
    return (0, _QueryTools.matchesQuery)(parseObject, subscription.query);
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
        this.authCache.del(sessionToken);
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
        if (query.keys) {
          query.fields = query.keys.split(',');
        }
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
      if (request.query.fields) {
        subscriptionInfo.fields = request.query.fields;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfbHJ1Q2FjaGUiLCJfVXNlcnNSb3V0ZXIiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwiY29uc3RydWN0b3IiLCJzZXJ2ZXIiLCJjb25maWciLCJwYXJzZVNlcnZlckNvbmZpZyIsImNsaWVudHMiLCJNYXAiLCJzdWJzY3JpcHRpb25zIiwiYXBwSWQiLCJQYXJzZSIsImFwcGxpY2F0aW9uSWQiLCJtYXN0ZXJLZXkiLCJrZXlQYWlycyIsImtleSIsIk9iamVjdCIsImtleXMiLCJzZXQiLCJsb2dnZXIiLCJ2ZXJib3NlIiwiZGlzYWJsZVNpbmdsZUluc3RhbmNlIiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsImphdmFTY3JpcHRLZXkiLCJjYWNoZUNvbnRyb2xsZXIiLCJnZXRDYWNoZUNvbnRyb2xsZXIiLCJjYWNoZVRpbWVvdXQiLCJhdXRoQ2FjaGUiLCJMUlUiLCJtYXgiLCJtYXhBZ2UiLCJwYXJzZVdlYlNvY2tldFNlcnZlciIsIlBhcnNlV2ViU29ja2V0U2VydmVyIiwicGFyc2VXZWJzb2NrZXQiLCJfb25Db25uZWN0Iiwic3Vic2NyaWJlciIsIlBhcnNlUHViU3ViIiwiY3JlYXRlU3Vic2NyaWJlciIsInN1YnNjcmliZSIsIm9uIiwiY2hhbm5lbCIsIm1lc3NhZ2VTdHIiLCJtZXNzYWdlIiwiSlNPTiIsInBhcnNlIiwiZSIsImVycm9yIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwiY3VycmVudFBhcnNlT2JqZWN0IiwiVXNlclJvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJjbGFzc05hbWUiLCJwYXJzZU9iamVjdCIsIl9maW5pc2hGZXRjaCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJkZWxldGVkUGFyc2VPYmplY3QiLCJ0b0pTT04iLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpZCIsInNpemUiLCJjbGFzc1N1YnNjcmlwdGlvbnMiLCJnZXQiLCJkZWJ1ZyIsInN1YnNjcmlwdGlvbiIsInZhbHVlcyIsImlzU3Vic2NyaXB0aW9uTWF0Y2hlZCIsIl9tYXRjaGVzU3Vic2NyaXB0aW9uIiwiY2xpZW50SWQiLCJyZXF1ZXN0SWRzIiwiXyIsImVudHJpZXMiLCJjbGllbnRSZXF1ZXN0SWRzIiwiY2xpZW50IiwiZm9yRWFjaCIsInJlcXVlc3RJZCIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwiX21hdGNoZXNDTFAiLCJpc01hdGNoZWQiLCJfbWF0Y2hlc0FDTCIsImV2ZW50Iiwic2Vzc2lvblRva2VuIiwib2JqZWN0IiwidXNlTWFzdGVyS2V5IiwiaGFzTWFzdGVyS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJzZW5kRXZlbnQiLCJ0cmlnZ2VyIiwiZ2V0VHJpZ2dlciIsImF1dGgiLCJnZXRBdXRoRnJvbUNsaWVudCIsInVzZXIiLCJmcm9tSlNPTiIsInJ1blRyaWdnZXIiLCJ0b0pTT053aXRoT2JqZWN0cyIsImF1dGhEYXRhIiwicHVzaERlbGV0ZSIsInJlc29sdmVFcnJvciIsIkNsaWVudCIsInB1c2hFcnJvciIsInBhcnNlV2ViU29ja2V0IiwiY29kZSIsInN0cmluZ2lmeSIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiYWxsIiwiaGFzaCIsInR5cGUiLCJvcmlnaW5hbCIsIl9vcmlnaW5hbFBhcnNlT2JqZWN0IiwiX29yaWdpbmFsUGFyc2VPYmplY3QyIiwiZnVuY3Rpb25OYW1lIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJzbGljZSIsInJlcXVlc3QiLCJ0djQiLCJ2YWxpZGF0ZSIsIlJlcXVlc3RTY2hlbWEiLCJfaGFuZGxlQ29ubmVjdCIsIl9oYW5kbGVTdWJzY3JpYmUiLCJfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uIiwiX2hhbmRsZVVuc3Vic2NyaWJlIiwiaW5mbyIsImhhcyIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJkZWxldGUiLCJzdWJzY3JpcHRpb25JbmZvIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJoYXNTdWJzY3JpYmluZ0NsaWVudCIsIm1hdGNoZXNRdWVyeSIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJmcm9tQ2FjaGUiLCJhdXRoUHJvbWlzZSIsInRoZW4iLCJ1c2VySWQiLCJjYXRjaCIsInJlc3VsdCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiZGVsIiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImFjbEdyb3VwIiwicHVzaCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJsZW5ndGgiLCJvYmplY3RJZCIsIl92ZXJpZnlBQ0wiLCJ0b2tlbiIsImlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCIsImdldFJlYWRBY2Nlc3MiLCJhY2xfaGFzX3JvbGVzIiwicGVybWlzc2lvbnNCeUlkIiwic29tZSIsInN0YXJ0c1dpdGgiLCJyb2xlTmFtZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlIiwiZ2V0U2Vzc2lvbkZyb21DbGllbnQiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInV1aWR2NCIsInJlcSIsInB1c2hDb25uZWN0IiwidmFsaWRLZXlQYWlycyIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzVmFsaWQiLCJzZWNyZXQiLCJhdXRoQ2FsbGVkIiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJmaWVsZHMiLCJzcGxpdCIsIndoZXJlIiwidG9Qb2ludGVyIiwibWFzdGVyIiwic3Vic2NyaXB0aW9uSGFzaCIsInF1ZXJ5SGFzaCIsIlN1YnNjcmlwdGlvbiIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHsgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycywgZ2V0VHJpZ2dlciwgcnVuVHJpZ2dlciwgcmVzb2x2ZUVycm9yLCB0b0pTT053aXRoT2JqZWN0cyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sIEF1dGggfSBmcm9tICcuLi9BdXRoJztcbmltcG9ydCB7IGdldENhY2hlQ29udHJvbGxlciB9IGZyb20gJy4uL0NvbnRyb2xsZXJzJztcbmltcG9ydCBMUlUgZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBVc2VyUm91dGVyIGZyb20gJy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuXG5jbGFzcyBQYXJzZUxpdmVRdWVyeVNlcnZlciB7XG4gIGNsaWVudHM6IE1hcDtcbiAgLy8gY2xhc3NOYW1lIC0+IChxdWVyeUhhc2ggLT4gc3Vic2NyaXB0aW9uKVxuICBzdWJzY3JpcHRpb25zOiBPYmplY3Q7XG4gIHBhcnNlV2ViU29ja2V0U2VydmVyOiBPYmplY3Q7XG4gIGtleVBhaXJzOiBhbnk7XG4gIC8vIFRoZSBzdWJzY3JpYmVyIHdlIHVzZSB0byBnZXQgb2JqZWN0IHVwZGF0ZSBmcm9tIHB1Ymxpc2hlclxuICBzdWJzY3JpYmVyOiBPYmplY3Q7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIGNvbmZpZzogYW55ID0ge30sIHBhcnNlU2VydmVyQ29uZmlnOiBhbnkgPSB7fSkge1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuICAgIHRoaXMuY2xpZW50cyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICBjb25maWcuYXBwSWQgPSBjb25maWcuYXBwSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICBjb25maWcubWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleSB8fCBQYXJzZS5tYXN0ZXJLZXk7XG5cbiAgICAvLyBTdG9yZSBrZXlzLCBjb252ZXJ0IG9iaiB0byBtYXBcbiAgICBjb25zdCBrZXlQYWlycyA9IGNvbmZpZy5rZXlQYWlycyB8fCB7fTtcbiAgICB0aGlzLmtleVBhaXJzID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGtleVBhaXJzKSkge1xuICAgICAgdGhpcy5rZXlQYWlycy5zZXQoa2V5LCBrZXlQYWlyc1trZXldKTtcbiAgICB9XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ1N1cHBvcnQga2V5IHBhaXJzJywgdGhpcy5rZXlQYWlycyk7XG5cbiAgICAvLyBJbml0aWFsaXplIFBhcnNlXG4gICAgUGFyc2UuT2JqZWN0LmRpc2FibGVTaW5nbGVJbnN0YW5jZSgpO1xuICAgIGNvbnN0IHNlcnZlclVSTCA9IGNvbmZpZy5zZXJ2ZXJVUkwgfHwgUGFyc2Uuc2VydmVyVVJMO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBQYXJzZS5pbml0aWFsaXplKGNvbmZpZy5hcHBJZCwgUGFyc2UuamF2YVNjcmlwdEtleSwgY29uZmlnLm1hc3RlcktleSk7XG5cbiAgICAvLyBUaGUgY2FjaGUgY29udHJvbGxlciBpcyBhIHByb3BlciBjYWNoZSBjb250cm9sbGVyXG4gICAgLy8gd2l0aCBhY2Nlc3MgdG8gVXNlciBhbmQgUm9sZXNcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGdldENhY2hlQ29udHJvbGxlcihwYXJzZVNlcnZlckNvbmZpZyk7XG5cbiAgICBjb25maWcuY2FjaGVUaW1lb3V0ID0gY29uZmlnLmNhY2hlVGltZW91dCB8fCA1ICogMTAwMDsgLy8gNXNcblxuICAgIC8vIFRoaXMgYXV0aCBjYWNoZSBzdG9yZXMgdGhlIHByb21pc2VzIGZvciBlYWNoIGF1dGggcmVzb2x1dGlvbi5cbiAgICAvLyBUaGUgbWFpbiBiZW5lZml0IGlzIHRvIGJlIGFibGUgdG8gcmV1c2UgdGhlIHNhbWUgdXNlciAvIHNlc3Npb24gdG9rZW4gcmVzb2x1dGlvbi5cbiAgICB0aGlzLmF1dGhDYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiA1MDAsIC8vIDUwMCBjb25jdXJyZW50XG4gICAgICBtYXhBZ2U6IGNvbmZpZy5jYWNoZVRpbWVvdXQsXG4gICAgfSk7XG4gICAgLy8gSW5pdGlhbGl6ZSB3ZWJzb2NrZXQgc2VydmVyXG4gICAgdGhpcy5wYXJzZVdlYlNvY2tldFNlcnZlciA9IG5ldyBQYXJzZVdlYlNvY2tldFNlcnZlcihcbiAgICAgIHNlcnZlcixcbiAgICAgIHBhcnNlV2Vic29ja2V0ID0+IHRoaXMuX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldCksXG4gICAgICBjb25maWdcbiAgICApO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBzdWJzY3JpYmVyXG4gICAgdGhpcy5zdWJzY3JpYmVyID0gUGFyc2VQdWJTdWIuY3JlYXRlU3Vic2NyaWJlcihjb25maWcpO1xuICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKTtcbiAgICAvLyBSZWdpc3RlciBtZXNzYWdlIGhhbmRsZXIgZm9yIHN1YnNjcmliZXIuIFdoZW4gcHVibGlzaGVyIGdldCBtZXNzYWdlcywgaXQgd2lsbCBwdWJsaXNoIG1lc3NhZ2VcbiAgICAvLyB0byB0aGUgc3Vic2NyaWJlcnMgYW5kIHRoZSBoYW5kbGVyIHdpbGwgYmUgY2FsbGVkLlxuICAgIHRoaXMuc3Vic2NyaWJlci5vbignbWVzc2FnZScsIChjaGFubmVsLCBtZXNzYWdlU3RyKSA9PiB7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnU3Vic2NyaWJlIG1lc3NhZ2UgJWonLCBtZXNzYWdlU3RyKTtcbiAgICAgIGxldCBtZXNzYWdlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZVN0cik7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIG1lc3NhZ2UnLCBtZXNzYWdlU3RyLCBlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhpcy5faW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2UpO1xuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyU2F2ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlckRlbGV0ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignR2V0IG1lc3NhZ2UgJXMgZnJvbSB1bmtub3duIGNoYW5uZWwgJWonLCBtZXNzYWdlLCBjaGFubmVsKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgSlNPTiBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0IEpTT04uXG4gIF9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgLy8gSW5mbGF0ZSBtZXJnZWQgb2JqZWN0XG4gICAgY29uc3QgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbGV0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbGV0IHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgLy8gSW5mbGF0ZSBvcmlnaW5hbCBvYmplY3RcbiAgICBjb25zdCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBjbGFzc05hbWUgPSBvcmlnaW5hbFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICAgIHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlckRlbGV0ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IGRlbGV0ZWRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJWogfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGRlbGV0ZWRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihkZWxldGVkUGFyc2VPYmplY3QsIHN1YnNjcmlwdGlvbik7XG4gICAgICBpZiAoIWlzU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICBjb25zdCBhY2wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAvLyBDaGVjayBDTFBcbiAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgaXNNYXRjaGVkID0gYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChhY2wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGlmICghaXNNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogJ2RlbGV0ZScsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBkZWxldGVkUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAoZGVsZXRlZFBhcnNlT2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyB8fFxuICAgICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpICYmXG4gICAgICAgICAgICAgICFjbGllbnQuaGFzTWFzdGVyS2V5XG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgZGVsZXRlIGRlbGV0ZWRQYXJzZU9iamVjdC5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgICAgIGRlbGV0ZSBkZWxldGVkUGFyc2VPYmplY3QuYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjbGllbnQucHVzaERlbGV0ZShyZXF1ZXN0SWQsIGRlbGV0ZWRQYXJzZU9iamVjdCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBjb25zdCBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gU2V0IG9yaWduYWwgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbEFDTDtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0wgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0wob3JpZ2luYWxBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2V0IGN1cnJlbnQgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChjdXJyZW50QUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgW2lzT3JpZ2luYWxNYXRjaGVkLCBpc0N1cnJlbnRNYXRjaGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbE1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5oYXNoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gRGVjaWRlIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGxldCB0eXBlO1xuICAgICAgICAgICAgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICd1cGRhdGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiAhaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ2xlYXZlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzT3JpZ2luYWxNYXRjaGVkICYmIGlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2VudGVyJztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NyZWF0ZSc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwpIHtcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9yaWdpbmFsKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCxcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAoY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyB8fFxuICAgICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpICYmXG4gICAgICAgICAgICAgICFjbGllbnQuaGFzTWFzdGVyS2V5XG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgZGVsZXRlIGN1cnJlbnRQYXJzZU9iamVjdC5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgICAgIGRlbGV0ZSBvcmlnaW5hbFBhcnNlT2JqZWN0Py5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgICAgIGRlbGV0ZSBjdXJyZW50UGFyc2VPYmplY3QuYXV0aERhdGE7XG4gICAgICAgICAgICAgIGRlbGV0ZSBvcmlnaW5hbFBhcnNlT2JqZWN0Py5hdXRoRGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9ICdwdXNoJyArIHJlcy5ldmVudC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHJlcy5ldmVudC5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChjbGllbnRbZnVuY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgICBjbGllbnRbZnVuY3Rpb25OYW1lXShyZXF1ZXN0SWQsIGN1cnJlbnRQYXJzZU9iamVjdCwgb3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfb25Db25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnkpOiB2b2lkIHtcbiAgICBwYXJzZVdlYnNvY2tldC5vbignbWVzc2FnZScsIHJlcXVlc3QgPT4ge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKHJlcXVlc3QpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gcGFyc2UgcmVxdWVzdCcsIHJlcXVlc3QsIGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1JlcXVlc3Q6ICVqJywgcmVxdWVzdCk7XG5cbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGEgdmFsaWQgcmVxdWVzdCwgcmV0dXJuIGVycm9yIGRpcmVjdGx5IGlmIG5vdFxuICAgICAgaWYgKFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbJ2dlbmVyYWwnXSkgfHxcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hW3JlcXVlc3Qub3BdKVxuICAgICAgKSB7XG4gICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDEsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25uZWN0IG1lc3NhZ2UgZXJyb3IgJXMnLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChyZXF1ZXN0Lm9wKSB7XG4gICAgICAgIGNhc2UgJ2Nvbm5lY3QnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdzdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VwZGF0ZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndW5zdWJzY3JpYmUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAzLCAnR2V0IHVua25vd24gb3BlcmF0aW9uJyk7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgdW5rbm93biBvcGVyYXRpb24nLCByZXF1ZXN0Lm9wKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oYENsaWVudCBkaXNjb25uZWN0OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY29uc3QgY2xpZW50SWQgPSBwYXJzZVdlYnNvY2tldC5jbGllbnRJZDtcbiAgICAgIGlmICghdGhpcy5jbGllbnRzLmhhcyhjbGllbnRJZCkpIHtcbiAgICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0X2Vycm9yJyxcbiAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICBlcnJvcjogYFVuYWJsZSB0byBmaW5kIGNsaWVudCAke2NsaWVudElkfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYENhbiBub3QgZmluZCBjbGllbnQgJHtjbGllbnRJZH0gb24gZGlzY29ubmVjdGApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnRcbiAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgdGhpcy5jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cbiAgICAgIC8vIERlbGV0ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICBmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm9dIG9mIF8uZW50cmllcyhjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3MpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgICAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkLCByZXF1ZXN0SWQpO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBldmVudDogJ3dzX2Nvbm5lY3QnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICB9KTtcbiAgfVxuXG4gIF9tYXRjaGVzU3Vic2NyaXB0aW9uKHBhcnNlT2JqZWN0OiBhbnksIHN1YnNjcmlwdGlvbjogYW55KTogYm9vbGVhbiB7XG4gICAgLy8gT2JqZWN0IGlzIHVuZGVmaW5lZCBvciBudWxsLCBub3QgbWF0Y2hcbiAgICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzUXVlcnkocGFyc2VPYmplY3QsIHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gIH1cblxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbjogP3N0cmluZyk6IFByb21pc2U8eyBhdXRoOiA/QXV0aCwgdXNlcklkOiA/c3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KHNlc3Npb25Ub2tlbiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksIHRoaXMuY29uZmlnLmNhY2hlVGltZW91dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgb2JqZWN0OiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZ1xuICApOiBhbnkge1xuICAgIC8vIHRyeSB0byBtYXRjaCBvbiB1c2VyIGZpcnN0LCBsZXNzIGV4cGVuc2l2ZSB0aGFuIHdpdGggcm9sZXNcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbik7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBvcFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBGYWlsZWQgbWF0Y2hpbmcgQ0xQIGZvciAke29iamVjdC5pZH0gJHt1c2VySWR9ICR7ZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gVE9ETzogaGFuZGxlIHJvbGVzIHBlcm1pc3Npb25zXG4gICAgLy8gT2JqZWN0LmtleXMoY2xhc3NMZXZlbFBlcm1pc3Npb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgIGNvbnN0IHBlcm0gPSBjbGFzc0xldmVsUGVybWlzc2lvbnNba2V5XTtcbiAgICAvLyAgIE9iamVjdC5rZXlzKHBlcm0pLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgICBpZiAoa2V5LmluZGV4T2YoJ3JvbGUnKSlcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0pXG4gICAgLy8gLy8gaXQncyByZWplY3RlZCBoZXJlLCBjaGVjayB0aGUgcm9sZXNcbiAgICAvLyB2YXIgcm9sZXNRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKTtcbiAgICAvLyByb2xlc1F1ZXJ5LmVxdWFsVG8oXCJ1c2Vyc1wiLCB1c2VyKTtcbiAgICAvLyByZXR1cm4gcm9sZXNRdWVyeS5maW5kKHt1c2VNYXN0ZXJLZXk6dHJ1ZX0pO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRBdXRoRnJvbUNsaWVudChjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIsIHNlc3Npb25Ub2tlbjogc3RyaW5nKSB7XG4gICAgY29uc3QgZ2V0U2Vzc2lvbkZyb21DbGllbnQgPSAoKSA9PiB7XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICByZXR1cm4gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gfHwgY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICB9O1xuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICBzZXNzaW9uVG9rZW4gPSBnZXRTZXNzaW9uRnJvbUNsaWVudCgpO1xuICAgIH1cbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IGF1dGggfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW4pO1xuICAgIHJldHVybiBhdXRoO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNBQ0woYWNsOiBhbnksIGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIFJldHVybiB0cnVlIGRpcmVjdGx5IGlmIEFDTCBpc24ndCBwcmVzZW50LCBBQ0wgaXMgcHVibGljIHJlYWQsIG9yIGNsaWVudCBoYXMgbWFzdGVyIGtleVxuICAgIGlmICghYWNsIHx8IGFjbC5nZXRQdWJsaWNSZWFkQWNjZXNzKCkgfHwgY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHN1YnNjcmlwdGlvbiBzZXNzaW9uVG9rZW4gbWF0Y2hlcyBBQ0wgZmlyc3RcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uVG9rZW4gPSBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbjtcbiAgICBjb25zdCBjbGllbnRTZXNzaW9uVG9rZW4gPSBjbGllbnQuc2Vzc2lvblRva2VuO1xuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIHN1YnNjcmlwdGlvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIGNsaWVudFNlc3Npb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgaWYgKCF0aGlzLl92YWxpZGF0ZUtleXMocmVxdWVzdCwgdGhpcy5rZXlQYWlycykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDQsICdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIGxvZ2dlci5lcnJvcignS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhhc01hc3RlcktleSA9IHRoaXMuX2hhc01hc3RlcktleShyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IHV1aWR2NCgpO1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoXG4gICAgICBjbGllbnRJZCxcbiAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgaGFzTWFzdGVyS2V5LFxuICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICByZXF1ZXN0Lmluc3RhbGxhdGlvbklkXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxdWVzdC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH07XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcignQENvbm5lY3QnLCAnYmVmb3JlQ29ubmVjdCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxLnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcS51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZUNvbm5lY3QuQENvbm5lY3RgLCByZXEsIGF1dGgpO1xuICAgICAgfVxuICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICAgIHRoaXMuY2xpZW50cy5zZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIGNsaWVudCk7XG4gICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlIG5ldyBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMocmVxKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZUNvbm5lY3QgZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFzTWFzdGVyS2V5KHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwIHx8ICF2YWxpZEtleVBhaXJzLmhhcygnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0IHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVxdWVzdCwgJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0Lm1hc3RlcktleSA9PT0gdmFsaWRLZXlQYWlycy5nZXQoJ21hc3RlcktleScpO1xuICB9XG5cbiAgX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldCBpc1ZhbGlkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBba2V5LCBzZWNyZXRdIG9mIHZhbGlkS2V5UGFpcnMpIHtcbiAgICAgIGlmICghcmVxdWVzdFtrZXldIHx8IHJlcXVlc3Rba2V5XSAhPT0gc2VjcmV0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHJlcXVlc3QucXVlcnkuY2xhc3NOYW1lO1xuICAgIGxldCBhdXRoQ2FsbGVkID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2JlZm9yZVN1YnNjcmliZScsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxdWVzdC5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBhdXRoQ2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICAgICAgICBwYXJzZVF1ZXJ5LndpdGhKU09OKHJlcXVlc3QucXVlcnkpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlU3Vic2NyaWJlLiR7Y2xhc3NOYW1lfWAsIHJlcXVlc3QsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVxdWVzdC5xdWVyeS50b0pTT04oKTtcbiAgICAgICAgaWYgKHF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICBxdWVyeS5maWVsZHMgPSBxdWVyeS5rZXlzLnNwbGl0KCcsJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgICAgfVxuXG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSB7XG4gICAgICAgIGlmICghYXV0aENhbGxlZCkge1xuICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KFxuICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWQsXG4gICAgICAgICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0LnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnF1ZXJ5LndoZXJlLnVzZXIgPSByZXF1ZXN0LnVzZXIudG9Qb2ludGVyKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEdldCBzdWJzY3JpcHRpb24gZnJvbSBzdWJzY3JpcHRpb25zLCBjcmVhdGUgb25lIGlmIG5lY2Vzc2FyeVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSGFzaCA9IHF1ZXJ5SGFzaChyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcblxuICAgICAgaWYgKCF0aGlzLnN1YnNjcmlwdGlvbnMuaGFzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uSGFzaCkpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gY2xhc3NTdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oY2xhc3NOYW1lLCByZXF1ZXN0LnF1ZXJ5LndoZXJlLCBzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb25IYXNoLCBzdWJzY3JpcHRpb24pO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgc3Vic2NyaXB0aW9uSW5mbyB0byBjbGllbnRcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbjogc3Vic2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICAgIC8vIEFkZCBzZWxlY3RlZCBmaWVsZHMsIHNlc3Npb25Ub2tlbiBhbmQgaW5zdGFsbGF0aW9uSWQgZm9yIHRoaXMgc3Vic2NyaXB0aW9uIGlmIG5lY2Vzc2FyeVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkuZmllbGRzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uZmllbGRzID0gcmVxdWVzdC5xdWVyeS5maWVsZHM7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4gPSByZXF1ZXN0LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGNsaWVudC5hZGRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3QucmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvKTtcblxuICAgICAgLy8gQWRkIGNsaWVudElkIHRvIHN1YnNjcmlwdGlvblxuICAgICAgc3Vic2NyaXB0aW9uLmFkZENsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBjbGllbnQucHVzaFN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgICBgQ3JlYXRlIGNsaWVudCAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSBuZXcgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICAgICk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnc3Vic2NyaWJlJyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVTdWJzY3JpYmUgb24gJHtjbGFzc05hbWV9IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIHRoaXMuX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0LCBmYWxzZSk7XG4gICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgfVxuXG4gIF9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnksIG5vdGlmeUNsaWVudDogYm9vbGVhbiA9IHRydWUpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdElkID0gcmVxdWVzdC5yZXF1ZXN0SWQ7XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIGNsaWVudCB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50ICcgKyBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3Ugc3Vic2NyaWJlIHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzdWJzY3JpcHRpb24gZnJvbSBjbGllbnRcbiAgICBjbGllbnQuZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIC8vIFJlbW92ZSBjbGllbnQgZnJvbSBzdWJzY3JpcHRpb25cbiAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBzdWJzY3JpcHRpb24uY2xhc3NOYW1lO1xuICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3RJZCk7XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgIH1cbiAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoY2xhc3NOYW1lKTtcbiAgICB9XG4gICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICBjbGllbnQsXG4gICAgICBldmVudDogJ3Vuc3Vic2NyaWJlJyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICBzZXNzaW9uVG9rZW46IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIGlmICghbm90aWZ5Q2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2xpZW50LnB1c2hVbnN1YnNjcmliZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgIGBEZWxldGUgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfSB8IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxHQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxhQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxxQkFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sY0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8sV0FBQSxHQUFBUCxPQUFBO0FBQ0EsSUFBQVEs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