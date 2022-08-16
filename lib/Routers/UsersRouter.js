"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UsersRouter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _Config = _interopRequireDefault(require("../Config"));

var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var _Auth = _interopRequireDefault(require("../Auth"));

var _password = _interopRequireDefault(require("../password"));

var _triggers = require("../triggers");

var _middlewares = require("../middlewares");

var _RestWrite = _interopRequireDefault(require("../RestWrite"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class UsersRouter extends _ClassesRouter.default {
  className() {
    return '_User';
  }
  /**
   * Removes all "_" prefixed properties from an object, except "__type"
   * @param {Object} obj An object.
   */


  static removeHiddenProperties(obj) {
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Regexp comes from Parse.Object.prototype.validate
        if (key !== '__type' && !/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
          delete obj[key];
        }
      }
    }
  }
  /**
   * After retrieving a user directly from the database, we need to remove the
   * password from the object (for security), and fix an issue some SDKs have
   * with null values
   */


  _sanitizeAuthData(user) {
    delete user.password; // Sometimes the authData still has null on that keys
    // https://github.com/parse-community/parse-server/issues/935

    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });

      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }
  /**
   * Validates a password request in login and verifyPassword
   * @param {Object} req The request
   * @returns {Object} User object
   * @private
   */


  _authenticateUserFromRequest(req) {
    return new Promise((resolve, reject) => {
      // Use query parameters instead if provided in url
      let payload = req.body;

      if (!payload.username && req.query && req.query.username || !payload.email && req.query && req.query.email) {
        payload = req.query;
      }

      const {
        username,
        email,
        password
      } = payload; // TODO: use the right error codes / descriptions.

      if (!username && !email) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'username/email is required.');
      }

      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'password is required.');
      }

      if (typeof password !== 'string' || email && typeof email !== 'string' || username && typeof username !== 'string') {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
      }

      let user;
      let isValidPassword = false;
      let query;

      if (email && username) {
        query = {
          email,
          username
        };
      } else if (email) {
        query = {
          email
        };
      } else {
        query = {
          $or: [{
            username
          }, {
            email: username
          }]
        };
      }

      return req.config.database.find('_User', query).then(results => {
        if (!results.length) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        if (results.length > 1) {
          // corner case where user1 has username == user2 email
          req.config.loggerController.warn("There is a user which email is the same as another user's username, logging in based on username");
          user = results.filter(user => user.username === username)[0];
        } else {
          user = results[0];
        }

        return _password.default.compare(password, user.password);
      }).then(correct => {
        isValidPassword = correct;
        const accountLockoutPolicy = new _AccountLockout.default(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      }).then(() => {
        if (!isValidPassword) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        } // Ensure the user isn't locked out
        // A locked out user won't be able to login
        // To lock a user out, just set the ACL to `masterKey` only  ({}).
        // Empty ACL is OK


        if (!req.auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        if (req.config.verifyUserEmails && req.config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
          throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
        }

        this._sanitizeAuthData(user);

        return resolve(user);
      }).catch(error => {
        return reject(error);
      });
    });
  }

  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }

    const sessionToken = req.info.sessionToken;
    return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
      sessionToken
    }, {
      include: 'user'
    }, req.info.clientSDK, req.info.context).then(response => {
      if (!response.results || response.results.length == 0 || !response.results[0].user) {
        throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      } else {
        const user = response.results[0].user; // Send token back on the login, because SDKs expect that.

        user.sessionToken = sessionToken; // Remove hidden properties.

        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }

  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req); // handle password expiry policy

    if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
      let changedAt = user._password_changed_at;

      if (!changedAt) {
        // password was created before expiry policy was enabled.
        // simply update _User object so that it will start enforcing from now
        changedAt = new Date();
        req.config.database.update('_User', {
          username: user.username
        }, {
          _password_changed_at: _node.default._encode(changedAt)
        });
      } else {
        // check whether the password has expired
        if (changedAt.__type == 'Date') {
          changedAt = new Date(changedAt.iso);
        } // Calculate the expiry time.


        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date()) // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    } // Remove hidden properties.


    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user); // Before login trigger; throws if failure

    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config);

    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId: user.objectId,
      createdWith: {
        action: 'login',
        authProvider: 'password'
      },
      installationId: req.info.installationId
    });

    user.sessionToken = sessionData.sessionToken;
    await createSession();

    const afterLoginUser = _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user));

    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);
    return {
      response: user
    };
  }
  /**
   * This allows master-key clients to create user sessions without access to
   * user credentials. This enables systems that can authenticate access another
   * way (API key, app administrators) to act on a user's behalf.
   *
   * We create a new session rather than looking for an existing session; we
   * want this to work in situations where the user is logged out on all
   * devices, since this can be used by automated systems acting on the user's
   * behalf.
   *
   * For the moment, we're omitting event hooks and lockout checks, since
   * immediate use cases suggest /loginAs could be used for semantically
   * different reasons from /login
   */


  async handleLogInAs(req) {
    if (!req.auth.isMaster) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'master key is required');
    }

    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      throw new _node.default.Error(_node.default.Error.INVALID_VALUE, 'userId must not be empty, null, or undefined');
    }

    const queryResults = await req.config.database.find('_User', {
      objectId: userId
    });
    const user = queryResults[0];

    if (!user) {
      throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'user not found');
    }

    this._sanitizeAuthData(user);

    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId,
      createdWith: {
        action: 'login',
        authProvider: 'masterkey'
      },
      installationId: req.info.installationId
    });

    user.sessionToken = sessionData.sessionToken;
    await createSession();
    return {
      response: user
    };
  }

  handleVerifyPassword(req) {
    return this._authenticateUserFromRequest(req).then(user => {
      // Remove hidden properties.
      UsersRouter.removeHiddenProperties(user);
      return {
        response: user
      };
    }).catch(error => {
      throw error;
    });
  }

  handleLogOut(req) {
    const success = {
      response: {}
    };

    if (req.info && req.info.sessionToken) {
      return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context).then(records => {
        if (records.results && records.results.length) {
          return _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context).then(() => {
            this._runAfterLogoutTrigger(req, records.results[0]);

            return Promise.resolve(success);
          });
        }

        return Promise.resolve(success);
      });
    }

    return Promise.resolve(success);
  }

  _runAfterLogoutTrigger(req, session) {
    // After logout trigger
    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
      className: '_Session'
    }, session)), null, req.config);
  }

  _throwOnBadEmailConfig(req) {
    try {
      _Config.default.validateEmailConfiguration({
        emailAdapter: req.config.userController.adapter,
        appName: req.config.appName,
        publicServerURL: req.config.publicServerURL,
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid: req.config.emailVerifyTokenReuseIfValid
      });
    } catch (e) {
      if (typeof e === 'string') {
        // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
        throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.');
      } else {
        throw e;
      }
    }
  }

  handleResetRequest(req) {
    this._throwOnBadEmailConfig(req);

    const {
      email
    } = req.body;

    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }

    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }

    const userController = req.config.userController;
    return userController.sendPasswordResetEmail(email).then(() => {
      return Promise.resolve({
        response: {}
      });
    }, err => {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        // Return success so that this endpoint can't
        // be used to enumerate valid emails
        return Promise.resolve({
          response: {}
        });
      } else {
        throw err;
      }
    });
  }

  handleVerificationEmailRequest(req) {
    this._throwOnBadEmailConfig(req);

    const {
      email
    } = req.body;

    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }

    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }

    return req.config.database.find('_User', {
      email: email
    }).then(results => {
      if (!results.length || results.length < 1) {
        throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
      }

      const user = results[0]; // remove password field, messes with saving on postgres

      delete user.password;

      if (user.emailVerified) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }

      const userController = req.config.userController;
      return userController.regenerateEmailVerifyToken(user).then(() => {
        userController.sendVerificationEmail(user);
        return {
          response: {}
        };
      });
    });
  }

  mountRoutes() {
    this.route('GET', '/users', req => {
      return this.handleFind(req);
    });
    this.route('POST', '/users', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleCreate(req);
    });
    this.route('GET', '/users/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/users/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('PUT', '/users/:objectId', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/users/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('GET', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/loginAs', req => {
      return this.handleLogInAs(req);
    });
    this.route('POST', '/logout', req => {
      return this.handleLogOut(req);
    });
    this.route('POST', '/requestPasswordReset', req => {
      return this.handleResetRequest(req);
    });
    this.route('POST', '/verificationEmailRequest', req => {
      return this.handleVerificationEmailRequest(req);
    });
    this.route('GET', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVc2Vyc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwib2JqIiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidGVzdCIsIl9zYW5pdGl6ZUF1dGhEYXRhIiwidXNlciIsInBhc3N3b3JkIiwiYXV0aERhdGEiLCJrZXlzIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwibGVuZ3RoIiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiUmVzdFdyaXRlIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9Vc2Vyc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7IG1heWJlUnVuVHJpZ2dlciwgVHlwZXMgYXMgVHJpZ2dlclR5cGVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuLi9SZXN0V3JpdGUnO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3VzZXJuYW1lL2VtYWlsIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnkpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzICYmXG4gICAgICAgICAgICByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiZcbiAgICAgICAgICAgICF1c2VyLmVtYWlsVmVyaWZpZWRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBhbGxvd3MgbWFzdGVyLWtleSBjbGllbnRzIHRvIGNyZWF0ZSB1c2VyIHNlc3Npb25zIHdpdGhvdXQgYWNjZXNzIHRvXG4gICAqIHVzZXIgY3JlZGVudGlhbHMuIFRoaXMgZW5hYmxlcyBzeXN0ZW1zIHRoYXQgY2FuIGF1dGhlbnRpY2F0ZSBhY2Nlc3MgYW5vdGhlclxuICAgKiB3YXkgKEFQSSBrZXksIGFwcCBhZG1pbmlzdHJhdG9ycykgdG8gYWN0IG9uIGEgdXNlcidzIGJlaGFsZi5cbiAgICpcbiAgICogV2UgY3JlYXRlIGEgbmV3IHNlc3Npb24gcmF0aGVyIHRoYW4gbG9va2luZyBmb3IgYW4gZXhpc3Rpbmcgc2Vzc2lvbjsgd2VcbiAgICogd2FudCB0aGlzIHRvIHdvcmsgaW4gc2l0dWF0aW9ucyB3aGVyZSB0aGUgdXNlciBpcyBsb2dnZWQgb3V0IG9uIGFsbFxuICAgKiBkZXZpY2VzLCBzaW5jZSB0aGlzIGNhbiBiZSB1c2VkIGJ5IGF1dG9tYXRlZCBzeXN0ZW1zIGFjdGluZyBvbiB0aGUgdXNlcidzXG4gICAqIGJlaGFsZi5cbiAgICpcbiAgICogRm9yIHRoZSBtb21lbnQsIHdlJ3JlIG9taXR0aW5nIGV2ZW50IGhvb2tzIGFuZCBsb2Nrb3V0IGNoZWNrcywgc2luY2VcbiAgICogaW1tZWRpYXRlIHVzZSBjYXNlcyBzdWdnZXN0IC9sb2dpbkFzIGNvdWxkIGJlIHVzZWQgZm9yIHNlbWFudGljYWxseVxuICAgKiBkaWZmZXJlbnQgcmVhc29ucyBmcm9tIC9sb2dpblxuICAgKi9cbiAgYXN5bmMgaGFuZGxlTG9nSW5BcyhyZXEpIHtcbiAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgJ21hc3RlciBrZXkgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VySWQgPSByZXEuYm9keS51c2VySWQgfHwgcmVxLnF1ZXJ5LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLFxuICAgICAgICAndXNlcklkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsLCBvciB1bmRlZmluZWQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5UmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB1c2VySWQgfSk7XG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0c1swXTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAndXNlciBub3QgZm91bmQnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdtYXN0ZXJrZXknLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbkFzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luQXMocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sTUFBTUEsV0FBTixTQUEwQkMsc0JBQTFCLENBQXdDO0VBQzdDQyxTQUFTLEdBQUc7SUFDVixPQUFPLE9BQVA7RUFDRDtFQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7RUFDK0IsT0FBdEJDLHNCQUFzQixDQUFDQyxHQUFELEVBQU07SUFDakMsS0FBSyxJQUFJQyxHQUFULElBQWdCRCxHQUFoQixFQUFxQjtNQUNuQixJQUFJRSxNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0wsR0FBckMsRUFBMENDLEdBQTFDLENBQUosRUFBb0Q7UUFDbEQ7UUFDQSxJQUFJQSxHQUFHLEtBQUssUUFBUixJQUFvQixDQUFDLDBCQUEwQkssSUFBMUIsQ0FBK0JMLEdBQS9CLENBQXpCLEVBQThEO1VBQzVELE9BQU9ELEdBQUcsQ0FBQ0MsR0FBRCxDQUFWO1FBQ0Q7TUFDRjtJQUNGO0VBQ0Y7RUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBOzs7RUFDRU0saUJBQWlCLENBQUNDLElBQUQsRUFBTztJQUN0QixPQUFPQSxJQUFJLENBQUNDLFFBQVosQ0FEc0IsQ0FHdEI7SUFDQTs7SUFDQSxJQUFJRCxJQUFJLENBQUNFLFFBQVQsRUFBbUI7TUFDakJSLE1BQU0sQ0FBQ1MsSUFBUCxDQUFZSCxJQUFJLENBQUNFLFFBQWpCLEVBQTJCRSxPQUEzQixDQUFtQ0MsUUFBUSxJQUFJO1FBQzdDLElBQUlM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