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

var _uuid = _interopRequireDefault(require("uuid"));

var _triggers = require("../triggers");

var _Auth = require("../Auth");

var _Controllers = require("../Controllers");

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseLiveQueryServer {
  // className -> (queryHash -> subscription)
  // The subscriber we use to get object update from publisher
  constructor(server, config = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();
    config.appId = config.appId || _node.default.applicationId;
    config.masterKey = config.masterKey || _node.default.masterKey; // Store keys, convert obj to map

    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();

    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }

    _logger.default.verbose('Support key pairs', this.keyPairs); // Initialize Parse


    _node.default.Object.disableSingleInstance();

    const serverURL = config.serverURL || _node.default.serverURL;
    _node.default.serverURL = serverURL;

    _node.default.initialize(config.appId, _node.default.javaScriptKey, config.masterKey); // The cache controller is a proper cache controller
    // with access to User and Roles


    this.cacheController = (0, _Controllers.getCacheController)(config); // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.

    this.authCache = new _lruCache.default({
      max: 500,
      // 500 concurrent
      maxAge: 60 * 60 * 1000 // 1h

    }); // Initialize websocket server

    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config); // Initialize subscriber

    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node.default.applicationId + 'afterDelete'); // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.

    this.subscriber.on('message', (channel, messageStr) => {
      _logger.default.verbose('Subscribe messsage %j', messageStr);

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
  } // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.


  _inflateParseObject(message) {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;

    _UsersRouter.default.removeHiddenProperties(currentParseObject);

    let className = currentParseObject.className;
    let parseObject = new _node.default.Object(className);

    parseObject._finishFetch(currentParseObject);

    message.currentParseObject = parseObject; // Inflate original object

    const originalParseObject = message.originalParseObject;

    if (originalParseObject) {
      _UsersRouter.default.removeHiddenProperties(originalParseObject);

      className = originalParseObject.className;
      parseObject = new _node.default.Object(className);

      parseObject._finishFetch(originalParseObject);

      message.originalParseObject = parseObject;
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.


  _onAfterDelete(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterDelete is triggered');

    const deletedParseObject = message.currentParseObject.toJSON();
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

        for (const requestId of requestIds) {
          const acl = message.currentParseObject.getACL(); // Check CLP

          const op = this._getCLPOperation(subscription.query);

          this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op).then(() => {
            // Check ACL
            return this._matchesACL(acl, client, requestId);
          }).then(isMatched => {
            if (!isMatched) {
              return null;
            }

            client.pushDelete(requestId, deletedParseObject);
          }).catch(error => {
            _logger.default.error('Matching ACL error : ', error);
          });
        }
      }
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.


  _onAfterSave(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterSave is triggered');

    let originalParseObject = null;

    if (message.originalParseObject) {
      originalParseObject = message.originalParseObject.toJSON();
    }

    const classLevelPermissions = message.classLevelPermissions;
    const currentParseObject = message.currentParseObject.toJSON();
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

        for (const requestId of requestIds) {
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
          } // Set current ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL


          let currentACLCheckingPromise;

          if (!isCurrentSubscriptionMatched) {
            currentACLCheckingPromise = Promise.resolve(false);
          } else {
            const currentACL = message.currentParseObject.getACL();
            currentACLCheckingPromise = this._matchesACL(currentACL, client, requestId);
          }

          const op = this._getCLPOperation(subscription.query);

          this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op).then(() => {
            return Promise.all([originalACLCheckingPromise, currentACLCheckingPromise]);
          }).then(([isOriginalMatched, isCurrentMatched]) => {
            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash); // Decide event type


            let type;

            if (isOriginalMatched && isCurrentMatched) {
              type = 'Update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'Leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (originalParseObject) {
                type = 'Enter';
              } else {
                type = 'Create';
              }
            } else {
              return null;
            }

            const functionName = 'push' + type;
            client[functionName](requestId, currentParseObject, originalParseObject);
          }, error => {
            _logger.default.error('Matching ACL error : ', error);
          });
        }
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

      _logger.default.verbose('Request: %j', request); // Check whether this request is a valid request, return error directly if not


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
      } // Delete client


      const client = this.clients.get(clientId);
      this.clients.delete(clientId); // Delete client from subscriptions

      for (const [requestId, subscriptionInfo] of _lodash.default.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

        const classSubscriptions = this.subscriptions.get(subscription.className);

        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        } // If there is no subscriptions under this class, remove it from subscriptions


        if (classSubscriptions.size === 0) {
          this.subscriptions.delete(subscription.className);
        }
      }

      _logger.default.verbose('Current clients %d', this.clients.size);

      _logger.default.verbose('Current subscriptions %d', this.subscriptions.size);

      (0, _triggers.runLiveQueryEventHandlers)({
        event: 'ws_disconnect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size
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
        // Store a resolved promise with the error for 10 minutes
        result.error = error;
        this.authCache.set(sessionToken, Promise.resolve(result), 60 * 10 * 1000);
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
    } // TODO: handle roles permissions
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
    } = await this.getAuthForSessionToken(token); // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.

    if (!auth || !userId) {
      return false;
    }

    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);

    if (isSubscriptionSessionTokenMatched) {
      return true;
    } // Check if the user has any roles that match the ACL


    return Promise.resolve().then(async () => {
      // Resolve false right away if the acl doesn't have any roles
      const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));

      if (!acl_has_roles) {
        return false;
      }

      const roleNames = await auth.getUserRoles(); // Finally, see if any of the user's roles allow them read access

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

  async _matchesACL(acl, client, requestId) {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    } // Check subscription sessionToken matches ACL first


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

  _handleConnect(parseWebsocket, request) {
    if (!this._validateKeys(request, this.keyPairs)) {
      _Client.Client.pushError(parseWebsocket, 4, 'Key in request is not valid');

      _logger.default.error('Key in request is not valid');

      return;
    }

    const hasMasterKey = this._hasMasterKey(request, this.keyPairs);

    const clientId = (0, _uuid.default)();
    const client = new _Client.Client(clientId, parseWebsocket, hasMasterKey, request.sessionToken);
    parseWebsocket.clientId = clientId;
    this.clients.set(parseWebsocket.clientId, client);

    _logger.default.info(`Create new client: ${parseWebsocket.clientId}`);

    client.pushConnect();
    (0, _triggers.runLiveQueryEventHandlers)({
      client,
      event: 'connect',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
      sessionToken: request.sessionToken,
      useMasterKey: client.hasMasterKey,
      installationId: request.installationId
    });
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

  _handleSubscribe(parseWebsocket, request) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before subscribing');

      _logger.default.error('Can not find this client, make sure you connect to server before subscribing');

      return;
    }

    const client = this.clients.get(parseWebsocket.clientId); // Get subscription from subscriptions, create one if necessary

    const subscriptionHash = (0, _QueryTools.queryHash)(request.query); // Add className to subscriptions if necessary

    const className = request.query.className;

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
    } // Add subscriptionInfo to client


    const subscriptionInfo = {
      subscription: subscription
    }; // Add selected fields, sessionToken and installationId for this subscription if necessary

    if (request.query.fields) {
      subscriptionInfo.fields = request.query.fields;
    }

    if (request.sessionToken) {
      subscriptionInfo.sessionToken = request.sessionToken;
    }

    if (request.installationId) {
      subscriptionInfo.installationId = request.installationId;
    }

    client.addSubscriptionInfo(request.requestId, subscriptionInfo); // Add clientId to subscription

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
      installationId: request.installationId
    });
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
    } // Remove subscription from client


    client.deleteSubscriptionInfo(requestId); // Remove client from subscription

    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

    const classSubscriptions = this.subscriptions.get(className);

    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    } // If there is no subscriptions under this class, remove it from subscriptions


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
      installationId: subscriptionInfo.installationId
    });

    if (!notifyClient) {
      return;
    }

    client.pushUnsubscribe(request.requestId);

    _logger.default.verbose(`Delete client: ${parseWebsocket.clientId} | subscription: ${request.requestId}`);
  }

}

exports.ParseLiveQueryServer = ParseLiveQueryServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsImNsaWVudHMiLCJNYXAiLCJzdWJzY3JpcHRpb25zIiwiYXBwSWQiLCJQYXJzZSIsImFwcGxpY2F0aW9uSWQiLCJtYXN0ZXJLZXkiLCJrZXlQYWlycyIsImtleSIsIk9iamVjdCIsImtleXMiLCJzZXQiLCJsb2dnZXIiLCJ2ZXJib3NlIiwiZGlzYWJsZVNpbmdsZUluc3RhbmNlIiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsImphdmFTY3JpcHRLZXkiLCJjYWNoZUNvbnRyb2xsZXIiLCJhdXRoQ2FjaGUiLCJMUlUiLCJtYXgiLCJtYXhBZ2UiLCJwYXJzZVdlYlNvY2tldFNlcnZlciIsIlBhcnNlV2ViU29ja2V0U2VydmVyIiwicGFyc2VXZWJzb2NrZXQiLCJfb25Db25uZWN0Iiwic3Vic2NyaWJlciIsIlBhcnNlUHViU3ViIiwiY3JlYXRlU3Vic2NyaWJlciIsInN1YnNjcmliZSIsIm9uIiwiY2hhbm5lbCIsIm1lc3NhZ2VTdHIiLCJtZXNzYWdlIiwiSlNPTiIsInBhcnNlIiwiZSIsImVycm9yIiwiX2luZmxhdGVQYXJzZU9iamVjdCIsIl9vbkFmdGVyU2F2ZSIsIl9vbkFmdGVyRGVsZXRlIiwiY3VycmVudFBhcnNlT2JqZWN0IiwiVXNlclJvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJjbGFzc05hbWUiLCJwYXJzZU9iamVjdCIsIl9maW5pc2hGZXRjaCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJkZWxldGVkUGFyc2VPYmplY3QiLCJ0b0pTT04iLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpZCIsInNpemUiLCJjbGFzc1N1YnNjcmlwdGlvbnMiLCJnZXQiLCJkZWJ1ZyIsInN1YnNjcmlwdGlvbiIsInZhbHVlcyIsImlzU3Vic2NyaXB0aW9uTWF0Y2hlZCIsIl9tYXRjaGVzU3Vic2NyaXB0aW9uIiwiY2xpZW50SWQiLCJyZXF1ZXN0SWRzIiwiXyIsImVudHJpZXMiLCJjbGllbnRSZXF1ZXN0SWRzIiwiY2xpZW50IiwicmVxdWVzdElkIiwiYWNsIiwiZ2V0QUNMIiwib3AiLCJfZ2V0Q0xQT3BlcmF0aW9uIiwicXVlcnkiLCJfbWF0Y2hlc0NMUCIsInRoZW4iLCJfbWF0Y2hlc0FDTCIsImlzTWF0Y2hlZCIsInB1c2hEZWxldGUiLCJjYXRjaCIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJvcmlnaW5hbEFDTCIsImN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UiLCJjdXJyZW50QUNMIiwiYWxsIiwiaXNPcmlnaW5hbE1hdGNoZWQiLCJpc0N1cnJlbnRNYXRjaGVkIiwiaGFzaCIsInR5cGUiLCJmdW5jdGlvbk5hbWUiLCJyZXF1ZXN0IiwidHY0IiwidmFsaWRhdGUiLCJSZXF1ZXN0U2NoZW1hIiwiQ2xpZW50IiwicHVzaEVycm9yIiwiX2hhbmRsZUNvbm5lY3QiLCJfaGFuZGxlU3Vic2NyaWJlIiwiX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbiIsIl9oYW5kbGVVbnN1YnNjcmliZSIsImluZm8iLCJoYXMiLCJldmVudCIsImRlbGV0ZSIsInN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvcyIsImRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbiIsImhhc1N1YnNjcmliaW5nQ2xpZW50IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsInNlc3Npb25Ub2tlbiIsImZyb21DYWNoZSIsImF1dGhQcm9taXNlIiwiYXV0aCIsInVzZXJJZCIsInVzZXIiLCJyZXN1bHQiLCJjb2RlIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJkZWwiLCJvYmplY3QiLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImxlbmd0aCIsIm9iamVjdElkIiwiX3ZlcmlmeUFDTCIsInRva2VuIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwiaGFzTWFzdGVyS2V5Iiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInB1c2hDb25uZWN0IiwidXNlTWFzdGVyS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaXNWYWxpZCIsInNlY3JldCIsInN1YnNjcmlwdGlvbkhhc2giLCJTdWJzY3JpcHRpb24iLCJ3aGVyZSIsImZpZWxkcyIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRUEsTUFBTUEsb0JBQU4sQ0FBMkI7QUFFekI7QUFJQTtBQUdBQyxFQUFBQSxXQUFXLENBQUNDLE1BQUQsRUFBY0MsTUFBVyxHQUFHLEVBQTVCLEVBQWdDO0FBQ3pDLFNBQUtELE1BQUwsR0FBY0EsTUFBZDtBQUNBLFNBQUtFLE9B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WyJpbXBvcnQgdHY0IGZyb20gJ3R2NCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICcuL0NsaWVudCc7XG5pbXBvcnQgeyBQYXJzZVdlYlNvY2tldFNlcnZlciB9IGZyb20gJy4vUGFyc2VXZWJTb2NrZXRTZXJ2ZXInO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFJlcXVlc3RTY2hlbWEgZnJvbSAnLi9SZXF1ZXN0U2NoZW1hJztcbmltcG9ydCB7IG1hdGNoZXNRdWVyeSwgcXVlcnlIYXNoIH0gZnJvbSAnLi9RdWVyeVRvb2xzJztcbmltcG9ydCB7IFBhcnNlUHViU3ViIH0gZnJvbSAnLi9QYXJzZVB1YlN1Yic7XG5pbXBvcnQgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgdXVpZCBmcm9tICd1dWlkJztcbmltcG9ydCB7IHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9KSB7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgdGhpcy5jbGllbnRzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXAoKTtcblxuICAgIGNvbmZpZy5hcHBJZCA9IGNvbmZpZy5hcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIGNvbmZpZy5tYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5IHx8IFBhcnNlLm1hc3RlcktleTtcblxuICAgIC8vIFN0b3JlIGtleXMsIGNvbnZlcnQgb2JqIHRvIG1hcFxuICAgIGNvbnN0IGtleVBhaXJzID0gY29uZmlnLmtleVBhaXJzIHx8IHt9O1xuICAgIHRoaXMua2V5UGFpcnMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5UGFpcnMpKSB7XG4gICAgICB0aGlzLmtleVBhaXJzLnNldChrZXksIGtleVBhaXJzW2tleV0pO1xuICAgIH1cbiAgICBsb2dnZXIudmVyYm9zZSgnU3VwcG9ydCBrZXkgcGFpcnMnLCB0aGlzLmtleVBhaXJzKTtcblxuICAgIC8vIEluaXRpYWxpemUgUGFyc2VcbiAgICBQYXJzZS5PYmplY3QuZGlzYWJsZVNpbmdsZUluc3RhbmNlKCk7XG4gICAgY29uc3Qgc2VydmVyVVJMID0gY29uZmlnLnNlcnZlclVSTCB8fCBQYXJzZS5zZXJ2ZXJVUkw7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIFBhcnNlLmluaXRpYWxpemUoY29uZmlnLmFwcElkLCBQYXJzZS5qYXZhU2NyaXB0S2V5LCBjb25maWcubWFzdGVyS2V5KTtcblxuICAgIC8vIFRoZSBjYWNoZSBjb250cm9sbGVyIGlzIGEgcHJvcGVyIGNhY2hlIGNvbnRyb2xsZXJcbiAgICAvLyB3aXRoIGFjY2VzcyB0byBVc2VyIGFuZCBSb2xlc1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gZ2V0Q2FjaGVDb250cm9sbGVyKGNvbmZpZyk7XG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgbWF4QWdlOiA2MCAqIDYwICogMTAwMCwgLy8gMWhcbiAgICB9KTtcbiAgICAvLyBJbml0aWFsaXplIHdlYnNvY2tldCBzZXJ2ZXJcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyID0gbmV3IFBhcnNlV2ViU29ja2V0U2VydmVyKFxuICAgICAgc2VydmVyLFxuICAgICAgcGFyc2VXZWJzb2NrZXQgPT4gdGhpcy5fb25Db25uZWN0KHBhcnNlV2Vic29ja2V0KSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJbml0aWFsaXplIHN1YnNjcmliZXJcbiAgICB0aGlzLnN1YnNjcmliZXIgPSBQYXJzZVB1YlN1Yi5jcmVhdGVTdWJzY3JpYmVyKGNvbmZpZyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpO1xuICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpO1xuICAgIC8vIFJlZ2lzdGVyIG1lc3NhZ2UgaGFuZGxlciBmb3Igc3Vic2NyaWJlci4gV2hlbiBwdWJsaXNoZXIgZ2V0IG1lc3NhZ2VzLCBpdCB3aWxsIHB1Ymxpc2ggbWVzc2FnZVxuICAgIC8vIHRvIHRoZSBzdWJzY3JpYmVycyBhbmQgdGhlIGhhbmRsZXIgd2lsbCBiZSBjYWxsZWQuXG4gICAgdGhpcy5zdWJzY3JpYmVyLm9uKCdtZXNzYWdlJywgKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdTdWJzY3JpYmUgbWVzc3NhZ2UgJWonLCBtZXNzYWdlU3RyKTtcbiAgICAgIGxldCBtZXNzYWdlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZVN0cik7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIG1lc3NhZ2UnLCBtZXNzYWdlU3RyLCBlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhpcy5faW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2UpO1xuICAgICAgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyU2F2ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlckRlbGV0ZShtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAnR2V0IG1lc3NhZ2UgJXMgZnJvbSB1bmtub3duIGNoYW5uZWwgJWonLFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgY2hhbm5lbFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBKU09OIGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QgSlNPTi5cbiAgX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAvLyBJbmZsYXRlIG1lcmdlZCBvYmplY3RcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdDtcbiAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMoY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBsZXQgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsZXQgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICAvLyBJbmZsYXRlIG9yaWdpbmFsIG9iamVjdFxuICAgIGNvbnN0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIGNsYXNzTmFtZSA9IG9yaWdpbmFsUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgICAgcGFyc2VPYmplY3QgPSBuZXcgUGFyc2UuT2JqZWN0KGNsYXNzTmFtZSk7XG4gICAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2gob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgPSBwYXJzZU9iamVjdDtcbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIF9vbkFmdGVyRGVsZXRlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBjb25zdCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgJ0NsYXNzTmFtZTogJWogfCBPYmplY3RJZDogJXMnLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0LmlkXG4gICAgKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBpZiAoIWlzU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoXG4gICAgICAgIHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzXG4gICAgICApKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IHJlcXVlc3RJZCBvZiByZXF1ZXN0SWRzKSB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICBvcFxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgLy8gQ2hlY2sgQUNMXG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGlzTWF0Y2hlZCA9PiB7XG4gICAgICAgICAgICAgIGlmICghaXNNYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCBkZWxldGVkUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIGxvZ2dlci5lcnJvcignTWF0Y2hpbmcgQUNMIGVycm9yIDogJywgZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgJ0NsYXNzTmFtZTogJXMgfCBPYmplY3RJZDogJXMnLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgY3VycmVudFBhcnNlT2JqZWN0LmlkXG4gICAgKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBjb25zdCBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKFxuICAgICAgICBzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkc1xuICAgICAgKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCByZXF1ZXN0SWQgb2YgcmVxdWVzdElkcykge1xuICAgICAgICAgIC8vIFNldCBvcmlnbmFsIFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgaWYgKCFpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0w7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKFxuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNldCBjdXJyZW50IFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QUNMID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChcbiAgICAgICAgICAgICAgY3VycmVudEFDTCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgb3BcbiAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UsXG4gICAgICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICAgIChbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgICAgICAgICAgICAnT3JpZ2luYWwgJWogfCBDdXJyZW50ICVqIHwgTWF0Y2g6ICVzLCAlcywgJXMsICVzIHwgUXVlcnk6ICVzJyxcbiAgICAgICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgICAgICBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCxcbiAgICAgICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgICAgICBpc09yaWdpbmFsTWF0Y2hlZCxcbiAgICAgICAgICAgICAgICAgIGlzQ3VycmVudE1hdGNoZWQsXG4gICAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAvLyBEZWNpZGUgZXZlbnQgdHlwZVxuICAgICAgICAgICAgICAgIGxldCB0eXBlO1xuICAgICAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgICB0eXBlID0gJ1VwZGF0ZSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiAhaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICAgICAgdHlwZSA9ICdMZWF2ZSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICghaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSA9ICdFbnRlcic7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ0NyZWF0ZSc7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyB0eXBlO1xuICAgICAgICAgICAgICAgIGNsaWVudFtmdW5jdGlvbk5hbWVdKFxuICAgICAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ01hdGNoaW5nIEFDTCBlcnJvciA6ICcsIGVycm9yKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSk6IHZvaWQge1xuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdtZXNzYWdlJywgcmVxdWVzdCA9PiB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UocmVxdWVzdCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSByZXF1ZXN0JywgcmVxdWVzdCwgZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsb2dnZXIudmVyYm9zZSgnUmVxdWVzdDogJWonLCByZXF1ZXN0KTtcblxuICAgICAgLy8gQ2hlY2sgd2hldGhlciB0aGlzIHJlcXVlc3QgaXMgYSB2YWxpZCByZXF1ZXN0LCByZXR1cm4gZXJyb3IgZGlyZWN0bHkgaWYgbm90XG4gICAgICBpZiAoXG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVsnZ2VuZXJhbCddKSB8fFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbcmVxdWVzdC5vcF0pXG4gICAgICApIHtcbiAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMSwgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Nvbm5lY3QgbWVzc2FnZSBlcnJvciAlcycsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHJlcXVlc3Qub3ApIHtcbiAgICAgICAgY2FzZSAnY29ubmVjdCc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXBkYXRlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1bnN1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDMsICdHZXQgdW5rbm93biBvcGVyYXRpb24nKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCB1bmtub3duIG9wZXJhdGlvbicsIHJlcXVlc3Qub3ApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbyhgQ2xpZW50IGRpc2Nvbm5lY3Q6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjb25zdCBjbGllbnRJZCA9IHBhcnNlV2Vic29ja2V0LmNsaWVudElkO1xuICAgICAgaWYgKCF0aGlzLmNsaWVudHMuaGFzKGNsaWVudElkKSkge1xuICAgICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3RfZXJyb3InLFxuICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgIGVycm9yOiBgVW5hYmxlIHRvIGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgQ2FuIG5vdCBmaW5kIGNsaWVudCAke2NsaWVudElkfSBvbiBkaXNjb25uZWN0YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRGVsZXRlIGNsaWVudFxuICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICB0aGlzLmNsaWVudHMuZGVsZXRlKGNsaWVudElkKTtcblxuICAgICAgLy8gRGVsZXRlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgIGZvciAoY29uc3QgW3JlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mb10gb2YgXy5lbnRyaWVzKFxuICAgICAgICBjbGllbnQuc3Vic2NyaXB0aW9uSW5mb3NcbiAgICAgICkpIHtcbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24oY2xpZW50SWQsIHJlcXVlc3RJZCk7XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoXG4gICAgICAgICAgc3Vic2NyaXB0aW9uLmNsYXNzTmFtZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50cyAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IHN1YnNjcmlwdGlvbnMgJWQnLCB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgZXZlbnQ6ICd3c19kaXNjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGV2ZW50OiAnd3NfY29ubmVjdCcsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgIH0pO1xuICB9XG5cbiAgX21hdGNoZXNTdWJzY3JpcHRpb24ocGFyc2VPYmplY3Q6IGFueSwgc3Vic2NyaXB0aW9uOiBhbnkpOiBib29sZWFuIHtcbiAgICAvLyBPYmplY3QgaXMgdW5kZWZpbmVkIG9yIG51bGwsIG5vdCBtYXRjaFxuICAgIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShwYXJzZU9iamVjdCwgc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgfVxuXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oXG4gICAgc2Vzc2lvblRva2VuOiA/c3RyaW5nXG4gICk6IFByb21pc2U8eyBhdXRoOiA/QXV0aCwgdXNlcklkOiA/c3RyaW5nIH0+IHtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfVxuICAgIGNvbnN0IGZyb21DYWNoZSA9IHRoaXMuYXV0aENhY2hlLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmIChmcm9tQ2FjaGUpIHtcbiAgICAgIHJldHVybiBmcm9tQ2FjaGU7XG4gICAgfVxuICAgIGNvbnN0IGF1dGhQcm9taXNlID0gZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IHRoaXMuY2FjaGVDb250cm9sbGVyLFxuICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgfSlcbiAgICAgIC50aGVuKGF1dGggPT4ge1xuICAgICAgICByZXR1cm4geyBhdXRoLCB1c2VySWQ6IGF1dGggJiYgYXV0aC51c2VyICYmIGF1dGgudXNlci5pZCB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlcnJvciB3aXRoIHRoZSBzZXNzaW9uIHRva2VuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOKSB7XG4gICAgICAgICAgLy8gU3RvcmUgYSByZXNvbHZlZCBwcm9taXNlIHdpdGggdGhlIGVycm9yIGZvciAxMCBtaW51dGVzXG4gICAgICAgICAgcmVzdWx0LmVycm9yID0gZXJyb3I7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuc2V0KFxuICAgICAgICAgICAgc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCksXG4gICAgICAgICAgICA2MCAqIDEwICogMTAwMFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0pO1xuICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIGF1dGhQcm9taXNlKTtcbiAgICByZXR1cm4gYXV0aFByb21pc2U7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0NMUChcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6ID9hbnksXG4gICAgb2JqZWN0OiBhbnksXG4gICAgY2xpZW50OiBhbnksXG4gICAgcmVxdWVzdElkOiBudW1iZXIsXG4gICAgb3A6IHN0cmluZ1xuICApOiBhbnkge1xuICAgIC8vIHRyeSB0byBtYXRjaCBvbiB1c2VyIGZpcnN0LCBsZXNzIGV4cGVuc2l2ZSB0aGFuIHdpdGggcm9sZXNcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBjb25zdCBhY2xHcm91cCA9IFsnKiddO1xuICAgIGxldCB1c2VySWQ7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW5cbiAgICAgICk7XG4gICAgICBpZiAodXNlcklkKSB7XG4gICAgICAgIGFjbEdyb3VwLnB1c2godXNlcklkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIG9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIGFjbEdyb3VwLFxuICAgICAgICBvcFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBGYWlsZWQgbWF0Y2hpbmcgQ0xQIGZvciAke29iamVjdC5pZH0gJHt1c2VySWR9ICR7ZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gVE9ETzogaGFuZGxlIHJvbGVzIHBlcm1pc3Npb25zXG4gICAgLy8gT2JqZWN0LmtleXMoY2xhc3NMZXZlbFBlcm1pc3Npb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgIGNvbnN0IHBlcm0gPSBjbGFzc0xldmVsUGVybWlzc2lvbnNba2V5XTtcbiAgICAvLyAgIE9iamVjdC5rZXlzKHBlcm0pLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgICBpZiAoa2V5LmluZGV4T2YoJ3JvbGUnKSlcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0pXG4gICAgLy8gLy8gaXQncyByZWplY3RlZCBoZXJlLCBjaGVjayB0aGUgcm9sZXNcbiAgICAvLyB2YXIgcm9sZXNRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKTtcbiAgICAvLyByb2xlc1F1ZXJ5LmVxdWFsVG8oXCJ1c2Vyc1wiLCB1c2VyKTtcbiAgICAvLyByZXR1cm4gcm9sZXNRdWVyeS5maW5kKHt1c2VNYXN0ZXJLZXk6dHJ1ZX0pO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+XG4gICAgICAgICAga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JylcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgICAgICAgLy8gRmluYWxseSwgc2VlIGlmIGFueSBvZiB0aGUgdXNlcidzIHJvbGVzIGFsbG93IHRoZW0gcmVhZCBhY2Nlc3NcbiAgICAgICAgZm9yIChjb25zdCByb2xlIG9mIHJvbGVOYW1lcykge1xuICAgICAgICAgIC8vIFdlIHVzZSBnZXRSZWFkQWNjZXNzIGFzIGByb2xlYCBpcyBpbiB0aGUgZm9ybSBgcm9sZTpyb2xlTmFtZWBcbiAgICAgICAgICBpZiAoYWNsLmdldFJlYWRBY2Nlc3Mocm9sZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0FDTChcbiAgICBhY2w6IGFueSxcbiAgICBjbGllbnQ6IGFueSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlclxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkKCk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudChcbiAgICAgIGNsaWVudElkLFxuICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICBoYXNNYXN0ZXJLZXksXG4gICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICk7XG4gICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICB0aGlzLmNsaWVudHMuc2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCBjbGllbnQpO1xuICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXF1ZXN0Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuICB9XG5cbiAgX2hhc01hc3RlcktleShyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmIChcbiAgICAgICF2YWxpZEtleVBhaXJzIHx8XG4gICAgICB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCB8fFxuICAgICAgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICAhcmVxdWVzdCB8fFxuICAgICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JylcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG5cbiAgICAvLyBHZXQgc3Vic2NyaXB0aW9uIGZyb20gc3Vic2NyaXB0aW9ucywgY3JlYXRlIG9uZSBpZiBuZWNlc3NhcnlcbiAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcbiAgICBjb25zdCBjbGFzc05hbWUgPSByZXF1ZXN0LnF1ZXJ5LmNsYXNzTmFtZTtcbiAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuaGFzKHN1YnNjcmlwdGlvbkhhc2gpKSB7XG4gICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUsXG4gICAgICAgIHN1YnNjcmlwdGlvbkhhc2hcbiAgICAgICk7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgfVxuXG4gICAgLy8gQWRkIHN1YnNjcmlwdGlvbkluZm8gdG8gY2xpZW50XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IHtcbiAgICAgIHN1YnNjcmlwdGlvbjogc3Vic2NyaXB0aW9uLFxuICAgIH07XG4gICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgaWYgKHJlcXVlc3QucXVlcnkuZmllbGRzKSB7XG4gICAgICBzdWJzY3JpcHRpb25JbmZvLmZpZWxkcyA9IHJlcXVlc3QucXVlcnkuZmllbGRzO1xuICAgIH1cbiAgICBpZiAocmVxdWVzdC5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgfVxuICAgIGlmIChyZXF1ZXN0Lmluc3RhbGxhdGlvbklkKSB7XG4gICAgICBzdWJzY3JpcHRpb25JbmZvLmluc3RhbGxhdGlvbklkID0gcmVxdWVzdC5pbnN0YWxsYXRpb25JZDtcbiAgICB9XG4gICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgLy8gQWRkIGNsaWVudElkIHRvIHN1YnNjcmlwdGlvblxuICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24oXG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCxcbiAgICAgIHJlcXVlc3QucmVxdWVzdElkXG4gICAgKTtcblxuICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAnc3Vic2NyaWJlJyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKFxuICAgIHBhcnNlV2Vic29ja2V0OiBhbnksXG4gICAgcmVxdWVzdDogYW55LFxuICAgIG5vdGlmeUNsaWVudDogYm9vbGVhbiA9IHRydWVcbiAgKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBzdWJzY3JpcHRpb25JbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXX0=