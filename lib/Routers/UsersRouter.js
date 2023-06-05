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
var _logger = require("../logger");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } // These methods handle the User-related routes.
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
    delete user.password;

    // Sometimes the authData still has null on that keys
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
      } = payload;

      // TODO: use the right error codes / descriptions.
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
      return req.config.database.find('_User', query, {}, _Auth.default.maintenance(req.config)).then(results => {
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
        }
        // Ensure the user isn't locked out
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
        const user = response.results[0].user;
        // Send token back on the login, because SDKs expect that.
        user.sessionToken = sessionToken;

        // Remove hidden properties.
        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }
  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req);
    const authData = req.body && req.body.authData;
    // Check if user has provided their required auth providers
    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, user.authData, req.config);
    let authDataResponse;
    let validatedAuthData;
    if (authData) {
      const res = await _Auth.default.handleAuthDataValidation(authData, new _RestWrite.default(req.config, req.auth, '_User', {
        objectId: user.objectId
      }, req.body, user, req.info.clientSDK, req.info.context), user);
      authDataResponse = res.authDataResponse;
      validatedAuthData = res.authData;
    }

    // handle password expiry policy
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
        }
        // Calculate the expiry time.
        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date())
          // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    }

    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user);

    // Before login trigger; throws if failure
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config);

    // If we have some new validated authData update directly
    if (validatedAuthData && Object.keys(validatedAuthData).length) {
      await req.config.database.update('_User', {
        objectId: user.objectId
      }, {
        authData: validatedAuthData
      }, {});
    }
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
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);
    if (authDataResponse) {
      user.authDataResponse = authDataResponse;
    }
    await req.config.authDataManager.runAfterFind(req, user.authData);
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
  async handleLogOut(req) {
    const success = {
      response: {}
    };
    if (req.info && req.info.sessionToken) {
      const records = await _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context);
      if (records.results && records.results.length) {
        await _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context);
        await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
          className: '_Session'
        }, records.results[0])), null, req.config);
      }
    }
    return success;
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
  async handleResetRequest(req) {
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
    try {
      await userController.sendPasswordResetEmail(email);
      return {
        response: {}
      };
    } catch (err) {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        var _req$config$passwordP;
        if (((_req$config$passwordP = req.config.passwordPolicy) === null || _req$config$passwordP === void 0 ? void 0 : _req$config$passwordP.resetPasswordSuccessOnInvalidEmail) ?? true) {
          return {
            response: {}
          };
        }
        err.message = `A user with that email does not exist.`;
      }
      throw err;
    }
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
      const user = results[0];

      // remove password field, messes with saving on postgres
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
  async handleChallenge(req) {
    const {
      username,
      email,
      password,
      authData,
      challengeData
    } = req.body;

    // if username or email provided with password try to authenticate the user by username
    let user;
    if (username || email) {
      if (!password) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You provided username or email, you need to also provide password.');
      }
      user = await this._authenticateUserFromRequest(req);
    }
    if (!challengeData) {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Nothing to challenge.');
    }
    if (typeof challengeData !== 'object') {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'challengeData should be an object.');
    }
    let request;
    let parseUser;

    // Try to find user by authData
    if (authData) {
      if (typeof authData !== 'object') {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'authData should be an object.');
      }
      if (user) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cannot provide username/email and authData, only use one identification method.');
      }
      if (Object.keys(authData).filter(key => authData[key].id).length > 1) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cannot provide more than one authData provider with an id.');
      }
      const results = await _Auth.default.findUsersWithAuthData(req.config, authData);
      try {
        if (!results[0] || results.length > 1) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'User not found.');
        }
        // Find the provider used to find the user
        const provider = Object.keys(authData).find(key => authData[key].id);
        parseUser = _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, results[0]));
        request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
        request.isChallenge = true;
        // Validate authData used to identify the user to avoid brute-force attack on `id`
        const {
          validator
        } = req.config.authDataManager.getValidatorForProvider(provider);
        const validatorResponse = await validator(authData[provider], req, parseUser, request);
        if (validatorResponse && validatorResponse.validator) {
          await validatorResponse.validator();
        }
      } catch (e) {
        // Rewrite the error to avoid guess id attack
        _logger.logger.error(e);
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'User not found.');
      }
    }
    if (!parseUser) {
      parseUser = user ? _node.default.User.fromJSON(_objectSpread({
        className: '_User'
      }, user)) : undefined;
    }
    if (!request) {
      request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
      request.isChallenge = true;
    }
    const acc = {};
    // Execute challenge step-by-step with consistent order for better error feedback
    // and to avoid to trigger others challenges if one of them fails
    for (const provider of Object.keys(challengeData).sort()) {
      try {
        const authAdapter = req.config.authDataManager.getValidatorForProvider(provider);
        if (!authAdapter) {
          continue;
        }
        const {
          adapter: {
            challenge
          }
        } = authAdapter;
        if (typeof challenge === 'function') {
          const providerChallengeResponse = await challenge(challengeData[provider], authData && authData[provider], req.config.auth[provider], request);
          acc[provider] = providerChallengeResponse || true;
        }
      } catch (err) {
        const e = (0, _triggers.resolveError)(err, {
          code: _node.default.Error.SCRIPT_FAILED,
          message: 'Challenge failed. Unknown error.'
        });
        const userString = req.auth && req.auth.user ? req.auth.user.id : undefined;
        _logger.logger.error(`Failed running auth step challenge for ${provider} for user ${userString} with Error: ` + JSON.stringify(e), {
          authenticationStep: 'challenge',
          error: e,
          user: userString,
          provider
        });
        throw e;
      }
    }
    return {
      response: {
        challengeData: acc
      }
    };
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
    this.route('POST', '/challenge', req => {
      return this.handleChallenge(req);
    });
  }
}
exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInRlc3QiLCJfc2FuaXRpemVBdXRoRGF0YSIsInVzZXIiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJpc1ZhbGlkUGFzc3dvcmQiLCIkb3IiLCJjb25maWciLCJkYXRhYmFzZSIsImZpbmQiLCJBdXRoIiwibWFpbnRlbmFuY2UiLCJ0aGVuIiwicmVzdWx0cyIsImxvZ2dlckNvbnRyb2xsZXIiLCJ3YXJuIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiY29ycmVjdCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJoYW5kbGVMb2dpbkF0dGVtcHQiLCJhdXRoIiwiaXNNYXN0ZXIiLCJBQ0wiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJFTUFJTF9OT1RfRk9VTkQiLCJjYXRjaCIsImVycm9yIiwiaGFuZGxlTWUiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwicmVzdCIsIm1hc3RlciIsImluY2x1ZGUiLCJjbGllbnRTREsiLCJjb250ZXh0IiwicmVzcG9uc2UiLCJoYW5kbGVMb2dJbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJhdXRoRGF0YVJlc3BvbnNlIiwidmFsaWRhdGVkQXV0aERhdGEiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJSZXN0V3JpdGUiLCJvYmplY3RJZCIsInBhc3N3b3JkUG9saWN5IiwibWF4UGFzc3dvcmRBZ2UiLCJjaGFuZ2VkQXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIkRhdGUiLCJ1cGRhdGUiLCJfZW5jb2RlIiwiX190eXBlIiwiaXNvIiwiZXhwaXJlc0F0IiwiZ2V0VGltZSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJtYXliZVJ1blRyaWdnZXIiLCJUcmlnZ2VyVHlwZXMiLCJiZWZvcmVMb2dpbiIsIlVzZXIiLCJmcm9tSlNPTiIsImFzc2lnbiIsInNlc3Npb25EYXRhIiwiY3JlYXRlU2Vzc2lvbiIsInVzZXJJZCIsImNyZWF0ZWRXaXRoIiwiYWN0aW9uIiwiYXV0aFByb3ZpZGVyIiwiaW5zdGFsbGF0aW9uSWQiLCJhZnRlckxvZ2luVXNlciIsImFmdGVyTG9naW4iLCJhdXRoRGF0YU1hbmFnZXIiLCJydW5BZnRlckZpbmQiLCJoYW5kbGVMb2dJbkFzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsIklOVkFMSURfVkFMVUUiLCJxdWVyeVJlc3VsdHMiLCJoYW5kbGVWZXJpZnlQYXNzd29yZCIsImhhbmRsZUxvZ091dCIsInN1Y2Nlc3MiLCJyZWNvcmRzIiwiZGVsIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJfcmVxJGNvbmZpZyRwYXNzd29yZFAiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwibWVzc2FnZSIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsIk9USEVSX0NBVVNFIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJoYW5kbGVDaGFsbGVuZ2UiLCJjaGFsbGVuZ2VEYXRhIiwicmVxdWVzdCIsInBhcnNlVXNlciIsImlkIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiZ2V0UmVxdWVzdE9iamVjdCIsImlzQ2hhbGxlbmdlIiwidmFsaWRhdG9yIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJ2YWxpZGF0b3JSZXNwb25zZSIsImxvZ2dlciIsImFjYyIsInNvcnQiLCJhdXRoQWRhcHRlciIsImNoYWxsZW5nZSIsInByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UiLCJyZXNvbHZlRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwidXNlclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiaGFuZGxlRmluZCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZUdldCIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSIsImV4cG9ydHMiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHtcbiAgbWF5YmVSdW5UcmlnZ2VyLFxuICBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMsXG4gIGdldFJlcXVlc3RPYmplY3QsXG4gIHJlc29sdmVFcnJvcixcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuLi9SZXN0V3JpdGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFmdGVyIHJldHJpZXZpbmcgYSB1c2VyIGRpcmVjdGx5IGZyb20gdGhlIGRhdGFiYXNlLCB3ZSBuZWVkIHRvIHJlbW92ZSB0aGVcbiAgICogcGFzc3dvcmQgZnJvbSB0aGUgb2JqZWN0IChmb3Igc2VjdXJpdHkpLCBhbmQgZml4IGFuIGlzc3VlIHNvbWUgU0RLcyBoYXZlXG4gICAqIHdpdGggbnVsbCB2YWx1ZXNcbiAgICovXG4gIF9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpIHtcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIC8vIFNvbWV0aW1lcyB0aGUgYXV0aERhdGEgc3RpbGwgaGFzIG51bGwgb24gdGhhdCBrZXlzXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzkzNVxuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHk7XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5LCB7fSwgQXV0aC5tYWludGVuYW5jZShyZXEuY29uZmlnKSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgJiZcbiAgICAgICAgICAgIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJlxuICAgICAgICAgICAgIXVzZXIuZW1haWxWZXJpZmllZFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgY29uc3QgYXV0aERhdGEgPSByZXEuYm9keSAmJiByZXEuYm9keS5hdXRoRGF0YTtcbiAgICAvLyBDaGVjayBpZiB1c2VyIGhhcyBwcm92aWRlZCB0aGVpciByZXF1aXJlZCBhdXRoIHByb3ZpZGVyc1xuICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihhdXRoRGF0YSwgdXNlci5hdXRoRGF0YSwgcmVxLmNvbmZpZyk7XG5cbiAgICBsZXQgYXV0aERhdGFSZXNwb25zZTtcbiAgICBsZXQgdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgYXV0aERhdGEsXG4gICAgICAgIG5ldyBSZXN0V3JpdGUoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgICByZXEuYm9keSxcbiAgICAgICAgICB1c2VyLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICksXG4gICAgICAgIHVzZXJcbiAgICAgICk7XG4gICAgICBhdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB2YWxpZGF0ZWRBdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNvbWUgbmV3IHZhbGlkYXRlZCBhdXRoRGF0YSB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBpZiAoYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgdXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICB9XG4gICAgYXdhaXQgcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIucnVuQWZ0ZXJGaW5kKHJlcSwgdXNlci5hdXRoRGF0YSk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgYWxsb3dzIG1hc3Rlci1rZXkgY2xpZW50cyB0byBjcmVhdGUgdXNlciBzZXNzaW9ucyB3aXRob3V0IGFjY2VzcyB0b1xuICAgKiB1c2VyIGNyZWRlbnRpYWxzLiBUaGlzIGVuYWJsZXMgc3lzdGVtcyB0aGF0IGNhbiBhdXRoZW50aWNhdGUgYWNjZXNzIGFub3RoZXJcbiAgICogd2F5IChBUEkga2V5LCBhcHAgYWRtaW5pc3RyYXRvcnMpIHRvIGFjdCBvbiBhIHVzZXIncyBiZWhhbGYuXG4gICAqXG4gICAqIFdlIGNyZWF0ZSBhIG5ldyBzZXNzaW9uIHJhdGhlciB0aGFuIGxvb2tpbmcgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb247IHdlXG4gICAqIHdhbnQgdGhpcyB0byB3b3JrIGluIHNpdHVhdGlvbnMgd2hlcmUgdGhlIHVzZXIgaXMgbG9nZ2VkIG91dCBvbiBhbGxcbiAgICogZGV2aWNlcywgc2luY2UgdGhpcyBjYW4gYmUgdXNlZCBieSBhdXRvbWF0ZWQgc3lzdGVtcyBhY3Rpbmcgb24gdGhlIHVzZXInc1xuICAgKiBiZWhhbGYuXG4gICAqXG4gICAqIEZvciB0aGUgbW9tZW50LCB3ZSdyZSBvbWl0dGluZyBldmVudCBob29rcyBhbmQgbG9ja291dCBjaGVja3MsIHNpbmNlXG4gICAqIGltbWVkaWF0ZSB1c2UgY2FzZXMgc3VnZ2VzdCAvbG9naW5BcyBjb3VsZCBiZSB1c2VkIGZvciBzZW1hbnRpY2FsbHlcbiAgICogZGlmZmVyZW50IHJlYXNvbnMgZnJvbSAvbG9naW5cbiAgICovXG4gIGFzeW5jIGhhbmRsZUxvZ0luQXMocmVxKSB7XG4gICAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlcklkID0gcmVxLmJvZHkudXNlcklkIHx8IHJlcS5xdWVyeS51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSxcbiAgICAgICAgJ3VzZXJJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCwgb3IgdW5kZWZpbmVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdXNlcklkIH0pO1xuICAgIGNvbnN0IHVzZXIgPSBxdWVyeVJlc3VsdHNbMF07XG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3VzZXIgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAnbWFzdGVya2V5JyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIGNvbnN0IHJlY29yZHMgPSBhd2FpdCByZXN0LmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApO1xuICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IHJlc3QuZGVsKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApO1xuICAgICAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCByZWNvcmRzLnJlc3VsdHNbMF0pKSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIHJlcS5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1Y2Nlc3M7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB1c2VyQ29udHJvbGxlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3k/LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgPz8gdHJ1ZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBlcnIubWVzc2FnZSA9IGBBIHVzZXIgd2l0aCB0aGF0IGVtYWlsIGRvZXMgbm90IGV4aXN0LmA7XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpLnRoZW4oKCkgPT4ge1xuICAgICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcik7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVDaGFsbGVuZ2UocmVxKSB7XG4gICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkLCBhdXRoRGF0YSwgY2hhbGxlbmdlRGF0YSB9ID0gcmVxLmJvZHk7XG5cbiAgICAvLyBpZiB1c2VybmFtZSBvciBlbWFpbCBwcm92aWRlZCB3aXRoIHBhc3N3b3JkIHRyeSB0byBhdXRoZW50aWNhdGUgdGhlIHVzZXIgYnkgdXNlcm5hbWVcbiAgICBsZXQgdXNlcjtcbiAgICBpZiAodXNlcm5hbWUgfHwgZW1haWwpIHtcbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgcHJvdmlkZWQgdXNlcm5hbWUgb3IgZW1haWwsIHlvdSBuZWVkIHRvIGFsc28gcHJvdmlkZSBwYXNzd29yZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgfVxuXG4gICAgaWYgKCFjaGFsbGVuZ2VEYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdOb3RoaW5nIHRvIGNoYWxsZW5nZS4nKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGNoYWxsZW5nZURhdGEgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdjaGFsbGVuZ2VEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgfVxuXG4gICAgbGV0IHJlcXVlc3Q7XG4gICAgbGV0IHBhcnNlVXNlcjtcblxuICAgIC8vIFRyeSB0byBmaW5kIHVzZXIgYnkgYXV0aERhdGFcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGlmICh0eXBlb2YgYXV0aERhdGEgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgICB9XG4gICAgICBpZiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcHJvdmlkZSB1c2VybmFtZS9lbWFpbCBhbmQgYXV0aERhdGEsIG9ubHkgdXNlIG9uZSBpZGVudGlmaWNhdGlvbiBtZXRob2QuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbHRlcihrZXkgPT4gYXV0aERhdGFba2V5XS5pZCkubGVuZ3RoID4gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcHJvdmlkZSBtb3JlIHRoYW4gb25lIGF1dGhEYXRhIHByb3ZpZGVyIHdpdGggYW4gaWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEocmVxLmNvbmZpZywgYXV0aERhdGEpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBpZiAoIXJlc3VsdHNbMF0gfHwgcmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBGaW5kIHRoZSBwcm92aWRlciB1c2VkIHRvIGZpbmQgdGhlIHVzZXJcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmluZChrZXkgPT4gYXV0aERhdGFba2V5XS5pZCk7XG5cbiAgICAgICAgcGFyc2VVc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4ucmVzdWx0c1swXSB9KTtcbiAgICAgICAgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgcGFyc2VVc2VyLCBwYXJzZVVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICAgICAgLy8gVmFsaWRhdGUgYXV0aERhdGEgdXNlZCB0byBpZGVudGlmeSB0aGUgdXNlciB0byBhdm9pZCBicnV0ZS1mb3JjZSBhdHRhY2sgb24gYGlkYFxuICAgICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBjb25zdCB2YWxpZGF0b3JSZXNwb25zZSA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgcGFyc2VVc2VyLCByZXF1ZXN0KTtcbiAgICAgICAgaWYgKHZhbGlkYXRvclJlc3BvbnNlICYmIHZhbGlkYXRvclJlc3BvbnNlLnZhbGlkYXRvcikge1xuICAgICAgICAgIGF3YWl0IHZhbGlkYXRvclJlc3BvbnNlLnZhbGlkYXRvcigpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIFJld3JpdGUgdGhlIGVycm9yIHRvIGF2b2lkIGd1ZXNzIGlkIGF0dGFja1xuICAgICAgICBsb2dnZXIuZXJyb3IoZSk7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFwYXJzZVVzZXIpIHtcbiAgICAgIHBhcnNlVXNlciA9IHVzZXIgPyBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi51c2VyIH0pIDogdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGlmICghcmVxdWVzdCkge1xuICAgICAgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgcGFyc2VVc2VyLCBwYXJzZVVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgcmVxdWVzdC5pc0NoYWxsZW5nZSA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IGFjYyA9IHt9O1xuICAgIC8vIEV4ZWN1dGUgY2hhbGxlbmdlIHN0ZXAtYnktc3RlcCB3aXRoIGNvbnNpc3RlbnQgb3JkZXIgZm9yIGJldHRlciBlcnJvciBmZWVkYmFja1xuICAgIC8vIGFuZCB0byBhdm9pZCB0byB0cmlnZ2VyIG90aGVycyBjaGFsbGVuZ2VzIGlmIG9uZSBvZiB0aGVtIGZhaWxzXG4gICAgZm9yIChjb25zdCBwcm92aWRlciBvZiBPYmplY3Qua2V5cyhjaGFsbGVuZ2VEYXRhKS5zb3J0KCkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGF1dGhBZGFwdGVyID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBpZiAoIWF1dGhBZGFwdGVyKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgIGFkYXB0ZXI6IHsgY2hhbGxlbmdlIH0sXG4gICAgICAgIH0gPSBhdXRoQWRhcHRlcjtcbiAgICAgICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBjb25zdCBwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlID0gYXdhaXQgY2hhbGxlbmdlKFxuICAgICAgICAgICAgY2hhbGxlbmdlRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICBhdXRoRGF0YSAmJiBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXEuY29uZmlnLmF1dGhbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcmVxdWVzdFxuICAgICAgICAgICk7XG4gICAgICAgICAgYWNjW3Byb3ZpZGVyXSA9IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgfHwgdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnQ2hhbGxlbmdlIGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgdXNlclN0cmluZyA9IHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xuICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCBjaGFsbGVuZ2UgZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6ICdjaGFsbGVuZ2UnLFxuICAgICAgICAgICAgZXJyb3I6IGUsXG4gICAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgICAgcHJvdmlkZXIsXG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4geyByZXNwb25zZTogeyBjaGFsbGVuZ2VEYXRhOiBhY2MgfSB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbkFzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luQXMocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9jaGFsbGVuZ2UnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ2hhbGxlbmdlKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlcnNSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUVBLElBQUFBLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLGVBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLGNBQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLEtBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLEtBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLFNBQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLFNBQUEsR0FBQVAsT0FBQTtBQU1BLElBQUFRLFlBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLFVBQUEsR0FBQVYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFVLE9BQUEsR0FB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