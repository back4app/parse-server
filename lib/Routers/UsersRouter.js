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
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // These methods handle the User-related routes.
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
        password,
        ignoreEmailVerification
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
      }).then(async () => {
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
        // Create request object for verification functions
        const request = {
          master: req.auth.isMaster,
          ip: req.config.ip,
          installationId: req.auth.installationId,
          object: _node.default.User.fromJSON(Object.assign({
            className: '_User'
          }, user))
        };

        // If request doesn't use master or maintenance key with ignoring email verification
        if (!((req.auth.isMaster || req.auth.isMaintenance) && ignoreEmailVerification)) {
          // Get verification conditions which can be booleans or functions; the purpose of this async/await
          // structure is to avoid unnecessarily executing subsequent functions if previous ones fail in the
          // conditional statement below, as a developer may decide to execute expensive operations in them
          const verifyUserEmails = async () => req.config.verifyUserEmails === true || typeof req.config.verifyUserEmails === 'function' && (await Promise.resolve(req.config.verifyUserEmails(request))) === true;
          const preventLoginWithUnverifiedEmail = async () => req.config.preventLoginWithUnverifiedEmail === true || typeof req.config.preventLoginWithUnverifiedEmail === 'function' && (await Promise.resolve(req.config.preventLoginWithUnverifiedEmail(request))) === true;
          if ((await verifyUserEmails()) && (await preventLoginWithUnverifiedEmail()) && !user.emailVerified) {
            throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
          }
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
    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(req, authData, user.authData, req.config);
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
          {
            throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
          }
      }
    }

    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);
    await req.config.filesController.expandFilesInObject(req.config, user);

    // Before login trigger; throws if failure
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config, req.info.context);

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
    }), afterLoginUser, null, req.config, req.info.context);
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
  async handleVerificationEmailRequest(req) {
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
    const results = await req.config.database.find('_User', {
      email: email
    }, {}, _Auth.default.maintenance(req.config));
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
    const send = await userController.regenerateEmailVerifyToken(user, req.auth.isMaster, req.auth.installationId, req.ip);
    if (send) {
      userController.sendVerificationEmail(user, req);
    }
    return {
      response: {}
    };
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
    this.route('POST', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
    this.route('POST', '/challenge', req => {
      return this.handleChallenge(req);
    });
  }
}
exports.UsersRouter = UsersRouter;
var _default = exports.default = UsersRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInRlc3QiLCJfc2FuaXRpemVBdXRoRGF0YSIsInVzZXIiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsImlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiT0JKRUNUX05PVF9GT1VORCIsImlzVmFsaWRQYXNzd29yZCIsIiRvciIsImNvbmZpZyIsImRhdGFiYXNlIiwiZmluZCIsIkF1dGgiLCJtYWludGVuYW5jZSIsInRoZW4iLCJyZXN1bHRzIiwibG9nZ2VyQ29udHJvbGxlciIsIndhcm4iLCJwYXNzd29yZENyeXB0byIsImNvbXBhcmUiLCJjb3JyZWN0IiwiYWNjb3VudExvY2tvdXRQb2xpY3kiLCJBY2NvdW50TG9ja291dCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImF1dGgiLCJpc01hc3RlciIsIkFDTCIsInJlcXVlc3QiLCJtYXN0ZXIiLCJpcCIsImluc3RhbGxhdGlvbklkIiwib2JqZWN0IiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwiaXNNYWludGVuYW5jZSIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImNhdGNoIiwiZXJyb3IiLCJoYW5kbGVNZSIsImluZm8iLCJzZXNzaW9uVG9rZW4iLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJyZXN0IiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInJlcyIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsIlJlc3RXcml0ZSIsIm9iamVjdElkIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwiY3JlYXRlZFdpdGgiLCJhY3Rpb24iLCJhdXRoUHJvdmlkZXIiLCJhZnRlckxvZ2luVXNlciIsImFmdGVyTG9naW4iLCJhdXRoRGF0YU1hbmFnZXIiLCJydW5BZnRlckZpbmQiLCJoYW5kbGVMb2dJbkFzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsIklOVkFMSURfVkFMVUUiLCJxdWVyeVJlc3VsdHMiLCJoYW5kbGVWZXJpZnlQYXNzd29yZCIsImhhbmRsZUxvZ091dCIsInN1Y2Nlc3MiLCJyZWNvcmRzIiwidW5kZWZpbmVkIiwiZGVsIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImhhbmRsZVJlc2V0UmVxdWVzdCIsIkVNQUlMX01JU1NJTkciLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwiZXJyIiwiY29kZSIsIl9yZXEkY29uZmlnJHBhc3N3b3JkUCIsInJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJtZXNzYWdlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiT1RIRVJfQ0FVU0UiLCJzZW5kIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJoYW5kbGVDaGFsbGVuZ2UiLCJjaGFsbGVuZ2VEYXRhIiwicGFyc2VVc2VyIiwiaWQiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiaXNDaGFsbGVuZ2UiLCJ2YWxpZGF0b3IiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsInZhbGlkYXRvclJlc3BvbnNlIiwibG9nZ2VyIiwiYWNjIiwic29ydCIsImF1dGhBZGFwdGVyIiwiY2hhbGxlbmdlIiwicHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJ1c2VyU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImF1dGhlbnRpY2F0aW9uU3RlcCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIiwiZXhwb3J0cyIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvVXNlcnNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQge1xuICBtYXliZVJ1blRyaWdnZXIsXG4gIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyxcbiAgZ2V0UmVxdWVzdE9iamVjdCxcbiAgcmVzb2x2ZUVycm9yLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5LCB7fSwgQXV0aC5tYWludGVuYW5jZShyZXEuY29uZmlnKSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDcmVhdGUgcmVxdWVzdCBvYmplY3QgZm9yIHZlcmlmaWNhdGlvbiBmdW5jdGlvbnNcbiAgICAgICAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgICAgICAgbWFzdGVyOiByZXEuYXV0aC5pc01hc3RlcixcbiAgICAgICAgICAgIGlwOiByZXEuY29uZmlnLmlwLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5hdXRoLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgb2JqZWN0OiBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICAvLyBJZiByZXF1ZXN0IGRvZXNuJ3QgdXNlIG1hc3RlciBvciBtYWludGVuYW5jZSBrZXkgd2l0aCBpZ25vcmluZyBlbWFpbCB2ZXJpZmljYXRpb25cbiAgICAgICAgICBpZiAoISgocmVxLmF1dGguaXNNYXN0ZXIgfHwgcmVxLmF1dGguaXNNYWludGVuYW5jZSkgJiYgaWdub3JlRW1haWxWZXJpZmljYXRpb24pKSB7XG5cbiAgICAgICAgICAgIC8vIEdldCB2ZXJpZmljYXRpb24gY29uZGl0aW9ucyB3aGljaCBjYW4gYmUgYm9vbGVhbnMgb3IgZnVuY3Rpb25zOyB0aGUgcHVycG9zZSBvZiB0aGlzIGFzeW5jL2F3YWl0XG4gICAgICAgICAgICAvLyBzdHJ1Y3R1cmUgaXMgdG8gYXZvaWQgdW5uZWNlc3NhcmlseSBleGVjdXRpbmcgc3Vic2VxdWVudCBmdW5jdGlvbnMgaWYgcHJldmlvdXMgb25lcyBmYWlsIGluIHRoZVxuICAgICAgICAgICAgLy8gY29uZGl0aW9uYWwgc3RhdGVtZW50IGJlbG93LCBhcyBhIGRldmVsb3BlciBtYXkgZGVjaWRlIHRvIGV4ZWN1dGUgZXhwZW5zaXZlIG9wZXJhdGlvbnMgaW4gdGhlbVxuICAgICAgICAgICAgY29uc3QgdmVyaWZ5VXNlckVtYWlscyA9IGFzeW5jICgpID0+IHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyA9PT0gdHJ1ZSB8fCAodHlwZW9mIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJiBhd2FpdCBQcm9taXNlLnJlc29sdmUocmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgICAgICAgICBjb25zdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID0gYXN5bmMgKCkgPT4gcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSB0cnVlIHx8ICh0eXBlb2YgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZShyZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICAgICAgICAgIGlmIChhd2FpdCB2ZXJpZnlVc2VyRW1haWxzKCkgJiYgYXdhaXQgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCgpICYmICF1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgY29uc3QgYXV0aERhdGEgPSByZXEuYm9keSAmJiByZXEuYm9keS5hdXRoRGF0YTtcbiAgICAvLyBDaGVjayBpZiB1c2VyIGhhcyBwcm92aWRlZCB0aGVpciByZXF1aXJlZCBhdXRoIHByb3ZpZGVyc1xuICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihcbiAgICAgIHJlcSxcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdXNlci5hdXRoRGF0YSxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgbGV0IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgbGV0IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICAgIGF1dGhEYXRhLFxuICAgICAgICBuZXcgUmVzdFdyaXRlKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgICAgcmVxLmJvZHksXG4gICAgICAgICAgdXNlcixcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApLFxuICAgICAgICB1c2VyXG4gICAgICApO1xuICAgICAgYXV0aERhdGFSZXNwb25zZSA9IHJlcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgdmFsaWRhdGVkQXV0aERhdGEgPSByZXMuYXV0aERhdGE7XG4gICAgfVxuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgeyB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICApOyB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICBhd2FpdCByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWcsXG4gICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgKTtcblxuICAgIC8vIElmIHdlIGhhdmUgc29tZSBuZXcgdmFsaWRhdGVkIGF1dGhEYXRhIHVwZGF0ZSBkaXJlY3RseVxuICAgIGlmICh2YWxpZGF0ZWRBdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh2YWxpZGF0ZWRBdXRoRGF0YSkubGVuZ3RoKSB7XG4gICAgICBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAgICB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnLFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICk7XG5cbiAgICBpZiAoYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgdXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICB9XG4gICAgYXdhaXQgcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIucnVuQWZ0ZXJGaW5kKHJlcSwgdXNlci5hdXRoRGF0YSk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgYWxsb3dzIG1hc3Rlci1rZXkgY2xpZW50cyB0byBjcmVhdGUgdXNlciBzZXNzaW9ucyB3aXRob3V0IGFjY2VzcyB0b1xuICAgKiB1c2VyIGNyZWRlbnRpYWxzLiBUaGlzIGVuYWJsZXMgc3lzdGVtcyB0aGF0IGNhbiBhdXRoZW50aWNhdGUgYWNjZXNzIGFub3RoZXJcbiAgICogd2F5IChBUEkga2V5LCBhcHAgYWRtaW5pc3RyYXRvcnMpIHRvIGFjdCBvbiBhIHVzZXIncyBiZWhhbGYuXG4gICAqXG4gICAqIFdlIGNyZWF0ZSBhIG5ldyBzZXNzaW9uIHJhdGhlciB0aGFuIGxvb2tpbmcgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb247IHdlXG4gICAqIHdhbnQgdGhpcyB0byB3b3JrIGluIHNpdHVhdGlvbnMgd2hlcmUgdGhlIHVzZXIgaXMgbG9nZ2VkIG91dCBvbiBhbGxcbiAgICogZGV2aWNlcywgc2luY2UgdGhpcyBjYW4gYmUgdXNlZCBieSBhdXRvbWF0ZWQgc3lzdGVtcyBhY3Rpbmcgb24gdGhlIHVzZXInc1xuICAgKiBiZWhhbGYuXG4gICAqXG4gICAqIEZvciB0aGUgbW9tZW50LCB3ZSdyZSBvbWl0dGluZyBldmVudCBob29rcyBhbmQgbG9ja291dCBjaGVja3MsIHNpbmNlXG4gICAqIGltbWVkaWF0ZSB1c2UgY2FzZXMgc3VnZ2VzdCAvbG9naW5BcyBjb3VsZCBiZSB1c2VkIGZvciBzZW1hbnRpY2FsbHlcbiAgICogZGlmZmVyZW50IHJlYXNvbnMgZnJvbSAvbG9naW5cbiAgICovXG4gIGFzeW5jIGhhbmRsZUxvZ0luQXMocmVxKSB7XG4gICAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlcklkID0gcmVxLmJvZHkudXNlcklkIHx8IHJlcS5xdWVyeS51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSxcbiAgICAgICAgJ3VzZXJJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCwgb3IgdW5kZWZpbmVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdXNlcklkIH0pO1xuICAgIGNvbnN0IHVzZXIgPSBxdWVyeVJlc3VsdHNbMF07XG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3VzZXIgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAnbWFzdGVya2V5JyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIGNvbnN0IHJlY29yZHMgPSBhd2FpdCByZXN0LmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApO1xuICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IHJlc3QuZGVsKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApO1xuICAgICAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCByZWNvcmRzLnJlc3VsdHNbMF0pKSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIHJlcS5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1Y2Nlc3M7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB1c2VyQ29udHJvbGxlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3k/LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgPz8gdHJ1ZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBlcnIubWVzc2FnZSA9IGBBIHVzZXIgd2l0aCB0aGF0IGVtYWlsIGRvZXMgbm90IGV4aXN0LmA7XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSwge30sIEF1dGgubWFpbnRlbmFuY2UocmVxLmNvbmZpZykpO1xuICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIGNvbnN0IHNlbmQgPSBhd2FpdCB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEuYXV0aC5pc01hc3RlciwgcmVxLmF1dGguaW5zdGFsbGF0aW9uSWQsIHJlcS5pcCk7XG4gICAgaWYgKHNlbmQpIHtcbiAgICAgIHVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyLCByZXEpO1xuICAgIH1cbiAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUNoYWxsZW5nZShyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGF1dGhEYXRhLCBjaGFsbGVuZ2VEYXRhIH0gPSByZXEuYm9keTtcblxuICAgIC8vIGlmIHVzZXJuYW1lIG9yIGVtYWlsIHByb3ZpZGVkIHdpdGggcGFzc3dvcmQgdHJ5IHRvIGF1dGhlbnRpY2F0ZSB0aGUgdXNlciBieSB1c2VybmFtZVxuICAgIGxldCB1c2VyO1xuICAgIGlmICh1c2VybmFtZSB8fCBlbWFpbCkge1xuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBwcm92aWRlZCB1c2VybmFtZSBvciBlbWFpbCwgeW91IG5lZWQgdG8gYWxzbyBwcm92aWRlIHBhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIWNoYWxsZW5nZURhdGEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ05vdGhpbmcgdG8gY2hhbGxlbmdlLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2NoYWxsZW5nZURhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG5cbiAgICBsZXQgcmVxdWVzdDtcbiAgICBsZXQgcGFyc2VVc2VyO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnYXV0aERhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIHVzZXJuYW1lL2VtYWlsIGFuZCBhdXRoRGF0YSwgb25seSB1c2Ugb25lIGlkZW50aWZpY2F0aW9uIG1ldGhvZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmlsdGVyKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpbmQgdGhlIHByb3ZpZGVyIHVzZWQgdG8gZmluZCB0aGUgdXNlclxuICAgICAgICBjb25zdCBwcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maW5kKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKTtcblxuICAgICAgICBwYXJzZVVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5yZXN1bHRzWzBdIH0pO1xuICAgICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgICAgICAvLyBWYWxpZGF0ZSBhdXRoRGF0YSB1c2VkIHRvIGlkZW50aWZ5IHRoZSB1c2VyIHRvIGF2b2lkIGJydXRlLWZvcmNlIGF0dGFjayBvbiBgaWRgXG4gICAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRvclJlc3BvbnNlID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCBwYXJzZVVzZXIsIHJlcXVlc3QpO1xuICAgICAgICBpZiAodmFsaWRhdG9yUmVzcG9uc2UgJiYgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gUmV3cml0ZSB0aGUgZXJyb3IgdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGxvZ2dlci5lcnJvcihlKTtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBhcnNlVXNlcikge1xuICAgICAgcGFyc2VVc2VyID0gdXNlciA/IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnVzZXIgfSkgOiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0KSB7XG4gICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgYWNjID0ge307XG4gICAgLy8gRXhlY3V0ZSBjaGFsbGVuZ2Ugc3RlcC1ieS1zdGVwIHdpdGggY29uc2lzdGVudCBvcmRlciBmb3IgYmV0dGVyIGVycm9yIGZlZWRiYWNrXG4gICAgLy8gYW5kIHRvIGF2b2lkIHRvIHRyaWdnZXIgb3RoZXJzIGNoYWxsZW5nZXMgaWYgb25lIG9mIHRoZW0gZmFpbHNcbiAgICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXV0aEFkYXB0ZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGlmICghYXV0aEFkYXB0ZXIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgYWRhcHRlcjogeyBjaGFsbGVuZ2UgfSxcbiAgICAgICAgfSA9IGF1dGhBZGFwdGVyO1xuICAgICAgICBpZiAodHlwZW9mIGNoYWxsZW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgPSBhd2FpdCBjaGFsbGVuZ2UoXG4gICAgICAgICAgICBjaGFsbGVuZ2VEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIGF1dGhEYXRhICYmIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcS5jb25maWcuYXV0aFtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXF1ZXN0XG4gICAgICAgICAgKTtcbiAgICAgICAgICBhY2NbcHJvdmlkZXJdID0gcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSB8fCB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdDaGFsbGVuZ2UgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB1c2VyU3RyaW5nID0gcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG4gICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwIGNoYWxsZW5nZSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogJ2NoYWxsZW5nZScsXG4gICAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IGNoYWxsZW5nZURhdGE6IGFjYyB9IH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luQXMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW5BcyhyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFFQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxlQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxjQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxLQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxTQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxTQUFBLEdBQUFQLE9BQUE7QUFNQSxJQUFBUSxZQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxVQUFBLEdBQUFWLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVSxPQUFBLEdBQUFWLE9BQUE7QUFBbUMsU0FBQUQsdUJBQUFZLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFBQSxTQUFBRyxRQUFBSCxDQUFBLEVBQUFJLENBQUEsUUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLElBQUEsQ0FBQVAsQ0FBQSxPQUFBTSxNQUFBLENBQUFFLHFCQUFBLFFBQUFDLENBQUEsR0FBQUgsTUFBQSxDQUFBRSxxQkFBQSxDQUFBUixDQUFBLEdBQUFJLENBQUEsS0FBQUssQ0FBQSxHQUFBQSxDQUFBLENBQUFDLE1BQUEsV0FBQU4sQ0FBQSxXQUFBRSxNQUFBLENBQUFLLHdCQUFBLENBQUFYLENBQUEsRUFBQUksQ0FBQSxFQUFBUSxVQUFBLE9BQUFQLENBQUEsQ0FBQVEsSUFBQSxDQUFBQyxLQUFBLENBQUFULENBQUEsRUFBQUksQ0FBQSxZQUFBSixDQUFBO0FBQUEsU0FBQVUsY0FBQWYsQ0FBQSxhQUFBSSxDQUFBLE1BQUFBLENBQUEsR0FBQVksU0FBQSxDQUFBQyxNQUFBLEVBQUFiLENBQUEsVUFBQUMsQ0FBQSxXQUFBVyxTQUFBLENBQUFaLENBQUEsSUFBQVksU0FBQSxDQUFBWixDQUFBLFFBQUFBLENBQUEsT0FBQUQsT0FBQSxDQUFBRyxNQUFBLENBQUFELENBQUEsT0FBQWEsT0FBQSxXQUFBZCxDQUFBLElBQUFlLGVBQUEsQ0FBQW5CLENBQUEsRUFBQUksQ0FBQSxFQUFBQyxDQUFBLENBQUFELENBQUEsU0FBQUUsTUFBQSxDQUFBYyx5QkFBQSxHQUFBZCxNQUFBLENBQUFlLGdCQUFBLENBQUFyQixDQUFBLEVBQUFNLE1BQUEsQ0FBQWMseUJBQUEsQ0FBQWYsQ0FBQSxLQUFBRixPQUFBLENBQUFHLE1BQUEsQ0FBQUQsQ0FBQSxHQUFBYSxPQUFBLFdBQUFkLENBQUEsSUFBQUUsTUFBQSxDQUFBZ0IsY0FBQSxDQUFBdEIsQ0FBQSxFQUFBSSxDQUFBLEVBQUFFLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQU4sQ0FBQSxFQUFBRCxDQUFBLGlCQUFBSixDQUFBO0FBQUEsU0FBQW1CLGdCQUFBbkIsQ0FBQSxFQUFBSSxDQUFBLEVBQUFDLENBQUEsWUFBQUQsQ0FBQSxHQUFBbUIsY0FBQSxDQUFBbkIsQ0FBQSxNQUFBSixDQUFBLEdBQUFNLE1BQUEsQ0FBQWdCLGNBQUEsQ0FBQXRCLENBQUEsRUFBQUksQ0FBQSxJQUFBb0IsS0FBQSxFQUFBbkIsQ0FBQSxFQUFBTyxVQUFBLE1BQUFhLFlBQUEsTUFBQUMsUUFBQSxVQUFBMUIsQ0FBQSxDQUFBSSxDQUFBLElBQUFDLENBQUEsRUFBQUwsQ0FBQTtBQUFBLFNBQUF1QixlQUFBbEIsQ0FBQSxRQUFBc0IsQ0FBQSxHQUFBQyxZQUFBLENBQUF2QixDQUFBLHVDQUFBc0IsQ0FBQSxHQUFBQSxDQUFBLEdBQUFBLENBQUE7QUFBQSxTQUFBQyxhQUFBdkIsQ0FBQSxFQUFBRCxDQUFBLDJCQUFBQyxDQUFBLEtBQUFBLENBQUEsU0FBQUEsQ0FBQSxNQUFBTCxDQUFBLEdBQUFLLENBQUEsQ0FBQXdCLE1BQUEsQ0FBQUMsV0FBQSxrQkFBQTlCLENBQUEsUUFBQTJCLENBQUEsR0FBQTNCLENBQUEsQ0FBQStCLElBQUEsQ0FBQTFCLENBQUEsRUFBQUQsQ0FBQSx1Q0FBQXVCLENBQUEsU0FBQUEsQ0FBQSxZQUFBSyxTQUFBLHlFQUFBNUIsQ0FBQSxHQUFBNkIsTUFBQSxHQUFBQyxNQUFBLEVBQUE3QixDQUFBLEtBakJuQztBQW1CTyxNQUFNOEIsV0FBVyxTQUFTQyxzQkFBYSxDQUFDO0VBQzdDQyxTQUFTQSxDQUFBLEVBQUc7SUFDVixPQUFPLE9BQU87RUFDaEI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7RUFDRSxPQUFPQyxzQkFBc0JBLENBQUNDLEdBQUcsRUFBRTtJQUNqQyxLQUFLLElBQUlDLEdBQUcsSUFBSUQsR0FBRyxFQUFFO01BQ25CLElBQUlqQyxNQUFNLENBQUNtQyxTQUFTLENBQUNDLGNBQWMsQ0FBQ1gsSUFBSSxDQUFDUSxHQUFHLEVBQUVDLEdBQUcsQ0FBQyxFQUFFO1FBQ2xEO1FBQ0EsSUFBSUEsR0FBRyxLQUFLLFFBQVEsSUFBSSxDQUFDLHlCQUF5QixDQUFDRyxJQUFJLENBQUNILEdBQUcsQ0FBQyxFQUFFO1VBQzVELE9BQU9ELEdBQUcsQ0FBQ0MsR0FBRyxDQUFDO1FBQ2pCO01BQ0Y7SUFDRjtFQUNGOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7RUFDRUksaUJBQWlCQSxDQUFDQyxJQUFJLEVBQUU7SUFDdEIsT0FBT0EsSUFBSSxDQUFDQyxRQUFROztJQUVwQjtJQUNBO0lBQ0EsSUFBSUQsSUFBSSxDQUFDRSxRQUFRLEVBQUU7TUFDakJ6QyxNQUFNLENBQUNDLElBQUksQ0FBQ3NDLElBQUksQ0FBQ0UsUUFBUSxDQUFDLENBQUM3QixPQUFPLENBQUM4QixRQUFRLElBQUk7UUFDN0MsSUFBSUgsSUFBSSxDQUFDRSxRQUFRLENBQUNDLFFBQVEsQ0FBQyxLQUFLLElBQUksRUFBRTtVQUNwQyxPQUFPSCxJQUFJLENBQUNFLFFBQVEsQ0FBQ0MsUUFBUSxDQUFDO1FBQ2hDO01BQ0YsQ0FBQyxDQUFDO01BQ0YsSUFBSTFDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDc0MsSUFBSSxDQUFDRSxRQUFRLENBQUMsQ0FBQzlCLE1BQU0sSUFBSSxDQUFDLEVBQUU7UUFDMUMsT0FBTzRCLElBQUksQ0FBQ0UsUUFBUTtNQUN0QjtJQUNGO0VBQ0Y7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VFLDRCQUE0QkEsQ0FBQ0MsR0FBRyxFQUFFO0lBQ2hDLE9BQU8sSUFBSUMsT0FBTyxDQUFDLENBQUNDLE9BQU8sRUFBRUMsTUFBTSxLQUFLO01BQ3RDO01BQ0EsSUFBSUMsT0FBTyxHQUFHSixHQUFHLENBQUNLLElBQUk7TUFDdEIsSUFDRyxDQUFDRCxPQUFPLENBQUNFLFFBQVEsSUFBSU4sR0FBRyxDQUFDTyxLQUFLLElBQUlQLEdBQUcsQ0FBQ08sS0FBSyxDQUFDRCxRQUFRLElBQ3BELENBQUNGLE9BQU8sQ0FBQ0ksS0FBSyxJQUFJUixHQUFHLENBQUNPLEtBQUssSUFBSVAsR0FBRyxDQUFDTyxLQUFLLENBQUNDLEtBQU0sRUFDaEQ7UUFDQUosT0FBTyxHQUFHSixHQUFHLENBQUNPLEtBQUs7TUFDckI7TUFDQSxNQUFNO1FBQUVELFFBQVE7UUFBRUUsS0FBSztRQUFFWixRQUFRO1FBQUVhO01BQXdCLENBQUMsR0FBR0wsT0FBTzs7TUFFdEU7TUFDQSxJQUFJLENBQUNFLFFBQVEsSUFBSSxDQUFDRSxLQUFLLEVBQUU7UUFDdkIsTUFBTSxJQUFJRSxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUFFLDZCQUE2QixDQUFDO01BQ3BGO01BQ0EsSUFBSSxDQUFDaEIsUUFBUSxFQUFFO1FBQ2IsTUFBTSxJQUFJYyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNFLGdCQUFnQixFQUFFLHVCQUF1QixDQUFDO01BQzlFO01BQ0EsSUFDRSxPQUFPakIsUUFBUSxLQUFLLFFBQVEsSUFDM0JZLEtBQUssSUFBSSxPQUFPQSxLQUFLLEtBQUssUUFBUyxJQUNuQ0YsUUFBUSxJQUFJLE9BQU9BLFFBQVEsS0FBSyxRQUFTLEVBQzFDO1FBQ0EsTUFBTSxJQUFJSSxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNHLGdCQUFnQixFQUFFLDRCQUE0QixDQUFDO01BQ25GO01BRUEsSUFBSW5CLElBQUk7TUFDUixJQUFJb0IsZUFBZSxHQUFHLEtBQUs7TUFDM0IsSUFBSVIsS0FBSztNQUNULElBQUlDLEtBQUssSUFBSUYsUUFBUSxFQUFFO1FBQ3JCQyxLQUFLLEdBQUc7VUFBRUMsS0FBSztVQUFFRjtRQUFTLENBQUM7TUFDN0IsQ0FBQyxNQUFNLElBQUlFLEtBQUssRUFBRTtRQUNoQkQsS0FBSyxHQUFHO1VBQUVDO1FBQU0sQ0FBQztNQUNuQixDQUFDLE1BQU07UUFDTEQsS0FBSyxHQUFHO1VBQUVTLEdBQUcsRUFBRSxDQUFDO1lBQUVWO1VBQVMsQ0FBQyxFQUFFO1lBQUVFLEtBQUssRUFBRUY7VUFBUyxDQUFDO1FBQUUsQ0FBQztNQUN0RDtNQUNBLE9BQU9OLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQ0MsUUFBUSxDQUN2QkMsSUFBSSxDQUFDLE9BQU8sRUFBRVosS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFYSxhQUFJLENBQUNDLFdBQVcsQ0FBQ3JCLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQyxDQUFDLENBQ3RESyxJQUFJLENBQUNDLE9BQU8sSUFBSTtRQUNmLElBQUksQ0FBQ0EsT0FBTyxDQUFDeEQsTUFBTSxFQUFFO1VBQ25CLE1BQU0sSUFBSTJDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0csZ0JBQWdCLEVBQUUsNEJBQTRCLENBQUM7UUFDbkY7UUFFQSxJQUFJUyxPQUFPLENBQUN4RCxNQUFNLEdBQUcsQ0FBQyxFQUFFO1VBQ3RCO1VBQ0FpQyxHQUFHLENBQUNpQixNQUFNLENBQUNPLGdCQUFnQixDQUFDQyxJQUFJLENBQzlCLGtHQUNGLENBQUM7VUFDRDlCLElBQUksR0FBRzRCLE9BQU8sQ0FBQy9ELE1BQU0sQ0FBQ21DLElBQUksSUFBSUEsSUFBSSxDQUFDVyxRQUFRLEtBQUtBLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RCxDQUFDLE1BQU07VUFDTFgsSUFBSSxHQUFHNEIsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNuQjtRQUVBLE9BQU9HLGlCQUFjLENBQUNDLE9BQU8sQ0FBQy9CLFFBQVEsRUFBRUQsSUFBSSxDQUFDQyxRQUFRLENBQUM7TUFDeEQsQ0FBQyxDQUFDLENBQ0QwQixJQUFJLENBQUNNLE9BQU8sSUFBSTtRQUNmYixlQUFlLEdBQUdhLE9BQU87UUFDekIsTUFBTUMsb0JBQW9CLEdBQUcsSUFBSUMsdUJBQWMsQ0FBQ25DLElBQUksRUFBRUssR0FBRyxDQUFDaUIsTUFBTSxDQUFDO1FBQ2pFLE9BQU9ZLG9CQUFvQixDQUFDRSxrQkFBa0IsQ0FBQ2hCLGVBQWUsQ0FBQztNQUNqRSxDQUFDLENBQUMsQ0FDRE8sSUFBSSxDQUFDLFlBQVk7UUFDaEIsSUFBSSxDQUFDUCxlQUFlLEVBQUU7VUFDcEIsTUFBTSxJQUFJTCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNHLGdCQUFnQixFQUFFLDRCQUE0QixDQUFDO1FBQ25GO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQSxJQUFJLENBQUNkLEdBQUcsQ0FBQ2dDLElBQUksQ0FBQ0MsUUFBUSxJQUFJdEMsSUFBSSxDQUFDdUMsR0FBRyxJQUFJOUUsTUFBTSxDQUFDQyxJQUFJLENBQUNzQyxJQUFJLENBQUN1QyxHQUFHLENBQUMsQ0FBQ25FLE1BQU0sSUFBSSxDQUFDLEVBQUU7VUFDdkUsTUFBTSxJQUFJMkMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRyxnQkFBZ0IsRUFBRSw0QkFBNEIsQ0FBQztRQUNuRjtRQUNBO1FBQ0EsTUFBTXFCLE9BQU8sR0FBRztVQUNkQyxNQUFNLEVBQUVwQyxHQUFHLENBQUNnQyxJQUFJLENBQUNDLFFBQVE7VUFDekJJLEVBQUUsRUFBRXJDLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQ29CLEVBQUU7VUFDakJDLGNBQWMsRUFBRXRDLEdBQUcsQ0FBQ2dDLElBQUksQ0FBQ00sY0FBYztVQUN2Q0MsTUFBTSxFQUFFN0IsYUFBSyxDQUFDOEIsSUFBSSxDQUFDQyxRQUFRLENBQUNyRixNQUFNLENBQUNzRixNQUFNLENBQUM7WUFBRXZELFNBQVMsRUFBRTtVQUFRLENBQUMsRUFBRVEsSUFBSSxDQUFDO1FBQ3pFLENBQUM7O1FBRUQ7UUFDQSxJQUFJLEVBQUUsQ0FBQ0ssR0FBRyxDQUFDZ0MsSUFBSSxDQUFDQyxRQUFRLElBQUlqQyxHQUFHLENBQUNnQyxJQUFJLENBQUNXLGFBQWEsS0FBS2xDLHVCQUF1QixDQUFDLEVBQUU7VUFFL0U7VUFDQTtVQUNBO1VBQ0EsTUFBTW1DLGdCQUFnQixHQUFHLE1BQUFBLENBQUEsS0FBWTVDLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQzJCLGdCQUFnQixLQUFLLElBQUksSUFBSyxPQUFPNUMsR0FBRyxDQUFDaUIsTUFBTSxDQUFDMkIsZ0JBQWdCLEtBQUssVUFBVSxJQUFJLE9BQU0zQyxPQUFPLENBQUNDLE9BQU8sQ0FBQ0YsR0FBRyxDQUFDaUIsTUFBTSxDQUFDMkIsZ0JBQWdCLENBQUNULE9BQU8sQ0FBQyxDQUFDLE1BQUssSUFBSztVQUN4TSxNQUFNVSwrQkFBK0IsR0FBRyxNQUFBQSxDQUFBLEtBQVk3QyxHQUFHLENBQUNpQixNQUFNLENBQUM0QiwrQkFBK0IsS0FBSyxJQUFJLElBQUssT0FBTzdDLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQzRCLCtCQUErQixLQUFLLFVBQVUsSUFBSSxPQUFNNUMsT0FBTyxDQUFDQyxPQUFPLENBQUNGLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQzRCLCtCQUErQixDQUFDVixPQUFPLENBQUMsQ0FBQyxNQUFLLElBQUs7VUFDcFEsSUFBSSxPQUFNUyxnQkFBZ0IsQ0FBQyxDQUFDLE1BQUksTUFBTUMsK0JBQStCLENBQUMsQ0FBQyxLQUFJLENBQUNsRCxJQUFJLENBQUNtRCxhQUFhLEVBQUU7WUFDOUYsTUFBTSxJQUFJcEMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDb0MsZUFBZSxFQUFFLDZCQUE2QixDQUFDO1VBQ25GO1FBQ0Y7UUFFQSxJQUFJLENBQUNyRCxpQkFBaUIsQ0FBQ0MsSUFBSSxDQUFDO1FBRTVCLE9BQU9PLE9BQU8sQ0FBQ1AsSUFBSSxDQUFDO01BQ3RCLENBQUMsQ0FBQyxDQUNEcUQsS0FBSyxDQUFDQyxLQUFLLElBQUk7UUFDZCxPQUFPOUMsTUFBTSxDQUFDOEMsS0FBSyxDQUFDO01BQ3RCLENBQUMsQ0FBQztJQUNOLENBQUMsQ0FBQztFQUNKO0VBRUFDLFFBQVFBLENBQUNsRCxHQUFHLEVBQUU7SUFDWixJQUFJLENBQUNBLEdBQUcsQ0FBQ21ELElBQUksSUFBSSxDQUFDbkQsR0FBRyxDQUFDbUQsSUFBSSxDQUFDQyxZQUFZLEVBQUU7TUFDdkMsTUFBTSxJQUFJMUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEMscUJBQXFCLEVBQUUsdUJBQXVCLENBQUM7SUFDbkY7SUFDQSxNQUFNRCxZQUFZLEdBQUdwRCxHQUFHLENBQUNtRCxJQUFJLENBQUNDLFlBQVk7SUFDMUMsT0FBT0UsYUFBSSxDQUNSbkMsSUFBSSxDQUNIbkIsR0FBRyxDQUFDaUIsTUFBTSxFQUNWRyxhQUFJLENBQUNnQixNQUFNLENBQUNwQyxHQUFHLENBQUNpQixNQUFNLENBQUMsRUFDdkIsVUFBVSxFQUNWO01BQUVtQztJQUFhLENBQUMsRUFDaEI7TUFBRUcsT0FBTyxFQUFFO0lBQU8sQ0FBQyxFQUNuQnZELEdBQUcsQ0FBQ21ELElBQUksQ0FBQ0ssU0FBUyxFQUNsQnhELEdBQUcsQ0FBQ21ELElBQUksQ0FBQ00sT0FDWCxDQUFDLENBQ0FuQyxJQUFJLENBQUNvQyxRQUFRLElBQUk7TUFDaEIsSUFBSSxDQUFDQSxRQUFRLENBQUNuQyxPQUFPLElBQUltQyxRQUFRLENBQUNuQyxPQUFPLENBQUN4RCxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMyRixRQUFRLENBQUNuQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM1QixJQUFJLEVBQUU7UUFDbEYsTUFBTSxJQUFJZSxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMwQyxxQkFBcUIsRUFBRSx1QkFBdUIsQ0FBQztNQUNuRixDQUFDLE1BQU07UUFDTCxNQUFNMUQsSUFBSSxHQUFHK0QsUUFBUSxDQUFDbkMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDNUIsSUFBSTtRQUNyQztRQUNBQSxJQUFJLENBQUN5RCxZQUFZLEdBQUdBLFlBQVk7O1FBRWhDO1FBQ0FuRSxXQUFXLENBQUNHLHNCQUFzQixDQUFDTyxJQUFJLENBQUM7UUFDeEMsT0FBTztVQUFFK0QsUUFBUSxFQUFFL0Q7UUFBSyxDQUFDO01BQzNCO0lBQ0YsQ0FBQyxDQUFDO0VBQ047RUFFQSxNQUFNZ0UsV0FBV0EsQ0FBQzNELEdBQUcsRUFBRTtJQUNyQixNQUFNTCxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUNJLDRCQUE0QixDQUFDQyxHQUFHLENBQUM7SUFDekQsTUFBTUgsUUFBUSxHQUFHRyxHQUFHLENBQUNLLElBQUksSUFBSUwsR0FBRyxDQUFDSyxJQUFJLENBQUNSLFFBQVE7SUFDOUM7SUFDQXVCLGFBQUksQ0FBQ3dDLGlEQUFpRCxDQUNwRDVELEdBQUcsRUFDSEgsUUFBUSxFQUNSRixJQUFJLENBQUNFLFFBQVEsRUFDYkcsR0FBRyxDQUFDaUIsTUFDTixDQUFDO0lBRUQsSUFBSTRDLGdCQUFnQjtJQUNwQixJQUFJQyxpQkFBaUI7SUFDckIsSUFBSWpFLFFBQVEsRUFBRTtNQUNaLE1BQU1rRSxHQUFHLEdBQUcsTUFBTTNDLGFBQUksQ0FBQzRDLHdCQUF3QixDQUM3Q25FLFFBQVEsRUFDUixJQUFJb0Usa0JBQVMsQ0FDWGpFLEdBQUcsQ0FBQ2lCLE1BQU0sRUFDVmpCLEdBQUcsQ0FBQ2dDLElBQUksRUFDUixPQUFPLEVBQ1A7UUFBRWtDLFFBQVEsRUFBRXZFLElBQUksQ0FBQ3VFO01BQVMsQ0FBQyxFQUMzQmxFLEdBQUcsQ0FBQ0ssSUFBSSxFQUNSVixJQUFJLEVBQ0pLLEdBQUcsQ0FBQ21ELElBQUksQ0FBQ0ssU0FBUyxFQUNsQnhELEdBQUcsQ0FBQ21ELElBQUksQ0FBQ00sT0FDWCxDQUFDLEVBQ0Q5RCxJQUNGLENBQUM7TUFDRGtFLGdCQUFnQixHQUFHRSxHQUFHLENBQUNGLGdCQUFnQjtNQUN2Q0MsaUJBQWlCLEdBQUdDLEdBQUcsQ0FBQ2xFLFFBQVE7SUFDbEM7O0lBRUE7SUFDQSxJQUFJRyxHQUFHLENBQUNpQixNQUFNLENBQUNrRCxjQUFjLElBQUluRSxHQUFHLENBQUNpQixNQUFNLENBQUNrRCxjQUFjLENBQUNDLGNBQWMsRUFBRTtNQUN6RSxJQUFJQyxTQUFTLEdBQUcxRSxJQUFJLENBQUMyRSxvQkFBb0I7TUFFekMsSUFBSSxDQUFDRCxTQUFTLEVBQUU7UUFDZDtRQUNBO1FBQ0FBLFNBQVMsR0FBRyxJQUFJRSxJQUFJLENBQUMsQ0FBQztRQUN0QnZFLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQ0MsUUFBUSxDQUFDc0QsTUFBTSxDQUN4QixPQUFPLEVBQ1A7VUFBRWxFLFFBQVEsRUFBRVgsSUFBSSxDQUFDVztRQUFTLENBQUMsRUFDM0I7VUFBRWdFLG9CQUFvQixFQUFFNUQsYUFBSyxDQUFDK0QsT0FBTyxDQUFDSixTQUFTO1FBQUUsQ0FDbkQsQ0FBQztNQUNILENBQUMsTUFBTTtRQUNMO1FBQ0EsSUFBSUEsU0FBUyxDQUFDSyxNQUFNLElBQUksTUFBTSxFQUFFO1VBQzlCTCxTQUFTLEdBQUcsSUFBSUUsSUFBSSxDQUFDRixTQUFTLENBQUNNLEdBQUcsQ0FBQztRQUNyQztRQUNBO1FBQ0EsTUFBTUMsU0FBUyxHQUFHLElBQUlMLElBQUksQ0FDeEJGLFNBQVMsQ0FBQ1EsT0FBTyxDQUFDLENBQUMsR0FBRyxRQUFRLEdBQUc3RSxHQUFHLENBQUNpQixNQUFNLENBQUNrRCxjQUFjLENBQUNDLGNBQzdELENBQUM7UUFDRCxJQUFJUSxTQUFTLEdBQUcsSUFBSUwsSUFBSSxDQUFDLENBQUM7VUFDMUI7VUFDQTtZQUFFLE1BQU0sSUFBSTdELGFBQUssQ0FBQ0MsS0FBSyxDQUNyQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNHLGdCQUFnQixFQUM1Qix3REFDRixDQUFDO1VBQUU7TUFDTDtJQUNGOztJQUVBO0lBQ0E3QixXQUFXLENBQUNHLHNCQUFzQixDQUFDTyxJQUFJLENBQUM7SUFFeEMsTUFBTUssR0FBRyxDQUFDaUIsTUFBTSxDQUFDNkQsZUFBZSxDQUFDQyxtQkFBbUIsQ0FBQy9FLEdBQUcsQ0FBQ2lCLE1BQU0sRUFBRXRCLElBQUksQ0FBQzs7SUFFdEU7SUFDQSxNQUFNLElBQUFxRix5QkFBZSxFQUNuQkMsZUFBWSxDQUFDQyxXQUFXLEVBQ3hCbEYsR0FBRyxDQUFDZ0MsSUFBSSxFQUNSdEIsYUFBSyxDQUFDOEIsSUFBSSxDQUFDQyxRQUFRLENBQUNyRixNQUFNLENBQUNzRixNQUFNLENBQUM7TUFBRXZELFNBQVMsRUFBRTtJQUFRLENBQUMsRUFBRVEsSUFBSSxDQUFDLENBQUMsRUFDaEUsSUFBSSxFQUNKSyxHQUFHLENBQUNpQixNQUFNLEVBQ1ZqQixHQUFHLENBQUNtRCxJQUFJLENBQUNNLE9BQ1gsQ0FBQzs7SUFFRDtJQUNBLElBQUlLLGlCQUFpQixJQUFJMUcsTUFBTSxDQUFDQyxJQUFJLENBQUN5RyxpQkFBaUIsQ0FBQyxDQUFDL0YsTUFBTSxFQUFFO01BQzlELE1BQU1pQyxHQUFHLENBQUNpQixNQUFNLENBQUNDLFFBQVEsQ0FBQ3NELE1BQU0sQ0FDOUIsT0FBTyxFQUNQO1FBQUVOLFFBQVEsRUFBRXZFLElBQUksQ0FBQ3VFO01BQVMsQ0FBQyxFQUMzQjtRQUFFckUsUUFBUSxFQUFFaUU7TUFBa0IsQ0FBQyxFQUMvQixDQUFDLENBQ0gsQ0FBQztJQUNIO0lBRUEsTUFBTTtNQUFFcUIsV0FBVztNQUFFQztJQUFjLENBQUMsR0FBR25CLGtCQUFTLENBQUNtQixhQUFhLENBQUNwRixHQUFHLENBQUNpQixNQUFNLEVBQUU7TUFDekVvRSxNQUFNLEVBQUUxRixJQUFJLENBQUN1RSxRQUFRO01BQ3JCb0IsV0FBVyxFQUFFO1FBQ1hDLE1BQU0sRUFBRSxPQUFPO1FBQ2ZDLFlBQVksRUFBRTtNQUNoQixDQUFDO01BQ0RsRCxjQUFjLEVBQUV0QyxHQUFHLENBQUNtRCxJQUFJLENBQUNiO0lBQzNCLENBQUMsQ0FBQztJQUVGM0MsSUFBSSxDQUFDeUQsWUFBWSxHQUFHK0IsV0FBVyxDQUFDL0IsWUFBWTtJQUU1QyxNQUFNZ0MsYUFBYSxDQUFDLENBQUM7SUFFckIsTUFBTUssY0FBYyxHQUFHL0UsYUFBSyxDQUFDOEIsSUFBSSxDQUFDQyxRQUFRLENBQUNyRixNQUFNLENBQUNzRixNQUFNLENBQUM7TUFBRXZELFNBQVMsRUFBRTtJQUFRLENBQUMsRUFBRVEsSUFBSSxDQUFDLENBQUM7SUFDdkYsTUFBTSxJQUFBcUYseUJBQWUsRUFDbkJDLGVBQVksQ0FBQ1MsVUFBVSxFQUFBN0gsYUFBQSxDQUFBQSxhQUFBLEtBQ2xCbUMsR0FBRyxDQUFDZ0MsSUFBSTtNQUFFckMsSUFBSSxFQUFFOEY7SUFBYyxJQUNuQ0EsY0FBYyxFQUNkLElBQUksRUFDSnpGLEdBQUcsQ0FBQ2lCLE1BQU0sRUFDVmpCLEdBQUcsQ0FBQ21ELElBQUksQ0FBQ00sT0FDWCxDQUFDO0lBRUQsSUFBSUksZ0JBQWdCLEVBQUU7TUFDcEJsRSxJQUFJLENBQUNrRSxnQkFBZ0IsR0FBR0EsZ0JBQWdCO0lBQzFDO0lBQ0EsTUFBTTdELEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQzBFLGVBQWUsQ0FBQ0MsWUFBWSxDQUFDNUYsR0FBRyxFQUFFTCxJQUFJLENBQUNFLFFBQVEsQ0FBQztJQUVqRSxPQUFPO01BQUU2RCxRQUFRLEVBQUUvRDtJQUFLLENBQUM7RUFDM0I7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFLE1BQU1rRyxhQUFhQSxDQUFDN0YsR0FBRyxFQUFFO0lBQ3ZCLElBQUksQ0FBQ0EsR0FBRyxDQUFDZ0MsSUFBSSxDQUFDQyxRQUFRLEVBQUU7TUFDdEIsTUFBTSxJQUFJdkIsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDbUYsbUJBQW1CLEVBQUUsd0JBQXdCLENBQUM7SUFDbEY7SUFFQSxNQUFNVCxNQUFNLEdBQUdyRixHQUFHLENBQUNLLElBQUksQ0FBQ2dGLE1BQU0sSUFBSXJGLEdBQUcsQ0FBQ08sS0FBSyxDQUFDOEUsTUFBTTtJQUNsRCxJQUFJLENBQUNBLE1BQU0sRUFBRTtNQUNYLE1BQU0sSUFBSTNFLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNvRixhQUFhLEVBQ3pCLDhDQUNGLENBQUM7SUFDSDtJQUVBLE1BQU1DLFlBQVksR0FBRyxNQUFNaEcsR0FBRyxDQUFDaUIsTUFBTSxDQUFDQyxRQUFRLENBQUNDLElBQUksQ0FBQyxPQUFPLEVBQUU7TUFBRStDLFFBQVEsRUFBRW1CO0lBQU8sQ0FBQyxDQUFDO0lBQ2xGLE1BQU0xRixJQUFJLEdBQUdxRyxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBQzVCLElBQUksQ0FBQ3JHLElBQUksRUFBRTtNQUNULE1BQU0sSUFBSWUsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRyxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQztJQUN2RTtJQUVBLElBQUksQ0FBQ3BCLGlCQUFpQixDQUFDQyxJQUFJLENBQUM7SUFFNUIsTUFBTTtNQUFFd0YsV0FBVztNQUFFQztJQUFjLENBQUMsR0FBR25CLGtCQUFTLENBQUNtQixhQUFhLENBQUNwRixHQUFHLENBQUNpQixNQUFNLEVBQUU7TUFDekVvRSxNQUFNO01BQ05DLFdBQVcsRUFBRTtRQUNYQyxNQUFNLEVBQUUsT0FBTztRQUNmQyxZQUFZLEVBQUU7TUFDaEIsQ0FBQztNQUNEbEQsY0FBYyxFQUFFdEMsR0FBRyxDQUFDbUQsSUFBSSxDQUFDYjtJQUMzQixDQUFDLENBQUM7SUFFRjNDLElBQUksQ0FBQ3lELFlBQVksR0FBRytCLFdBQVcsQ0FBQy9CLFlBQVk7SUFFNUMsTUFBTWdDLGFBQWEsQ0FBQyxDQUFDO0lBRXJCLE9BQU87TUFBRTFCLFFBQVEsRUFBRS9EO0lBQUssQ0FBQztFQUMzQjtFQUVBc0csb0JBQW9CQSxDQUFDakcsR0FBRyxFQUFFO0lBQ3hCLE9BQU8sSUFBSSxDQUFDRCw0QkFBNEIsQ0FBQ0MsR0FBRyxDQUFDLENBQzFDc0IsSUFBSSxDQUFDM0IsSUFBSSxJQUFJO01BQ1o7TUFDQVYsV0FBVyxDQUFDRyxzQkFBc0IsQ0FBQ08sSUFBSSxDQUFDO01BRXhDLE9BQU87UUFBRStELFFBQVEsRUFBRS9EO01BQUssQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FDRHFELEtBQUssQ0FBQ0MsS0FBSyxJQUFJO01BQ2QsTUFBTUEsS0FBSztJQUNiLENBQUMsQ0FBQztFQUNOO0VBRUEsTUFBTWlELFlBQVlBLENBQUNsRyxHQUFHLEVBQUU7SUFDdEIsTUFBTW1HLE9BQU8sR0FBRztNQUFFekMsUUFBUSxFQUFFLENBQUM7SUFBRSxDQUFDO0lBQ2hDLElBQUkxRCxHQUFHLENBQUNtRCxJQUFJLElBQUluRCxHQUFHLENBQUNtRCxJQUFJLENBQUNDLFlBQVksRUFBRTtNQUNyQyxNQUFNZ0QsT0FBTyxHQUFHLE1BQU05QyxhQUFJLENBQUNuQyxJQUFJLENBQzdCbkIsR0FBRyxDQUFDaUIsTUFBTSxFQUNWRyxhQUFJLENBQUNnQixNQUFNLENBQUNwQyxHQUFHLENBQUNpQixNQUFNLENBQUMsRUFDdkIsVUFBVSxFQUNWO1FBQUVtQyxZQUFZLEVBQUVwRCxHQUFHLENBQUNtRCxJQUFJLENBQUNDO01BQWEsQ0FBQyxFQUN2Q2lELFNBQVMsRUFDVHJHLEdBQUcsQ0FBQ21ELElBQUksQ0FBQ0ssU0FBUyxFQUNsQnhELEdBQUcsQ0FBQ21ELElBQUksQ0FBQ00sT0FDWCxDQUFDO01BQ0QsSUFBSTJDLE9BQU8sQ0FBQzdFLE9BQU8sSUFBSTZFLE9BQU8sQ0FBQzdFLE9BQU8sQ0FBQ3hELE1BQU0sRUFBRTtRQUM3QyxNQUFNdUYsYUFBSSxDQUFDZ0QsR0FBRyxDQUNadEcsR0FBRyxDQUFDaUIsTUFBTSxFQUNWRyxhQUFJLENBQUNnQixNQUFNLENBQUNwQyxHQUFHLENBQUNpQixNQUFNLENBQUMsRUFDdkIsVUFBVSxFQUNWbUYsT0FBTyxDQUFDN0UsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDMkMsUUFBUSxFQUMzQmxFLEdBQUcsQ0FBQ21ELElBQUksQ0FBQ00sT0FDWCxDQUFDO1FBQ0QsTUFBTSxJQUFBdUIseUJBQWUsRUFDbkJDLGVBQVksQ0FBQ3NCLFdBQVcsRUFDeEJ2RyxHQUFHLENBQUNnQyxJQUFJLEVBQ1J0QixhQUFLLENBQUM4RixPQUFPLENBQUMvRCxRQUFRLENBQUNyRixNQUFNLENBQUNzRixNQUFNLENBQUM7VUFBRXZELFNBQVMsRUFBRTtRQUFXLENBQUMsRUFBRWlILE9BQU8sQ0FBQzdFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ3BGLElBQUksRUFDSnZCLEdBQUcsQ0FBQ2lCLE1BQ04sQ0FBQztNQUNIO0lBQ0Y7SUFDQSxPQUFPa0YsT0FBTztFQUNoQjtFQUVBTSxzQkFBc0JBLENBQUN6RyxHQUFHLEVBQUU7SUFDMUIsSUFBSTtNQUNGMEcsZUFBTSxDQUFDQywwQkFBMEIsQ0FBQztRQUNoQ0MsWUFBWSxFQUFFNUcsR0FBRyxDQUFDaUIsTUFBTSxDQUFDNEYsY0FBYyxDQUFDQyxPQUFPO1FBQy9DQyxPQUFPLEVBQUUvRyxHQUFHLENBQUNpQixNQUFNLENBQUM4RixPQUFPO1FBQzNCQyxlQUFlLEVBQUVoSCxHQUFHLENBQUNpQixNQUFNLENBQUMrRixlQUFlO1FBQzNDQyxnQ0FBZ0MsRUFBRWpILEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQ2dHLGdDQUFnQztRQUM3RUMsNEJBQTRCLEVBQUVsSCxHQUFHLENBQUNpQixNQUFNLENBQUNpRztNQUMzQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsT0FBT3BLLENBQUMsRUFBRTtNQUNWLElBQUksT0FBT0EsQ0FBQyxLQUFLLFFBQVEsRUFBRTtRQUN6QjtRQUNBLE1BQU0sSUFBSTRELGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUN3RyxxQkFBcUIsRUFDakMscUhBQ0YsQ0FBQztNQUNILENBQUMsTUFBTTtRQUNMLE1BQU1ySyxDQUFDO01BQ1Q7SUFDRjtFQUNGO0VBRUEsTUFBTXNLLGtCQUFrQkEsQ0FBQ3BILEdBQUcsRUFBRTtJQUM1QixJQUFJLENBQUN5RyxzQkFBc0IsQ0FBQ3pHLEdBQUcsQ0FBQztJQUVoQyxNQUFNO01BQUVRO0lBQU0sQ0FBQyxHQUFHUixHQUFHLENBQUNLLElBQUk7SUFDMUIsSUFBSSxDQUFDRyxLQUFLLEVBQUU7TUFDVixNQUFNLElBQUlFLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQzBHLGFBQWEsRUFBRSwyQkFBMkIsQ0FBQztJQUMvRTtJQUNBLElBQUksT0FBTzdHLEtBQUssS0FBSyxRQUFRLEVBQUU7TUFDN0IsTUFBTSxJQUFJRSxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMkcscUJBQXFCLEVBQ2pDLHVDQUNGLENBQUM7SUFDSDtJQUNBLE1BQU1ULGNBQWMsR0FBRzdHLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQzRGLGNBQWM7SUFDaEQsSUFBSTtNQUNGLE1BQU1BLGNBQWMsQ0FBQ1Usc0JBQXNCLENBQUMvRyxLQUFLLENBQUM7TUFDbEQsT0FBTztRQUNMa0QsUUFBUSxFQUFFLENBQUM7TUFDYixDQUFDO0lBQ0gsQ0FBQyxDQUFDLE9BQU84RCxHQUFHLEVBQUU7TUFDWixJQUFJQSxHQUFHLENBQUNDLElBQUksS0FBSy9HLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRyxnQkFBZ0IsRUFBRTtRQUFBLElBQUE0RyxxQkFBQTtRQUM3QyxJQUFJLEVBQUFBLHFCQUFBLEdBQUExSCxHQUFHLENBQUNpQixNQUFNLENBQUNrRCxjQUFjLGNBQUF1RCxxQkFBQSx1QkFBekJBLHFCQUFBLENBQTJCQyxrQ0FBa0MsS0FBSSxJQUFJLEVBQUU7VUFDekUsT0FBTztZQUNMakUsUUFBUSxFQUFFLENBQUM7VUFDYixDQUFDO1FBQ0g7UUFDQThELEdBQUcsQ0FBQ0ksT0FBTyxHQUFHLHdDQUF3QztNQUN4RDtNQUNBLE1BQU1KLEdBQUc7SUFDWDtFQUNGO0VBRUEsTUFBTUssOEJBQThCQSxDQUFDN0gsR0FBRyxFQUFFO0lBQ3hDLElBQUksQ0FBQ3lHLHNCQUFzQixDQUFDekcsR0FBRyxDQUFDO0lBRWhDLE1BQU07TUFBRVE7SUFBTSxDQUFDLEdBQUdSLEdBQUcsQ0FBQ0ssSUFBSTtJQUMxQixJQUFJLENBQUNHLEtBQUssRUFBRTtNQUNWLE1BQU0sSUFBSUUsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEcsYUFBYSxFQUFFLDJCQUEyQixDQUFDO0lBQy9FO0lBQ0EsSUFBSSxPQUFPN0csS0FBSyxLQUFLLFFBQVEsRUFBRTtNQUM3QixNQUFNLElBQUlFLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUMyRyxxQkFBcUIsRUFDakMsdUNBQ0YsQ0FBQztJQUNIO0lBRUEsTUFBTS9GLE9BQU8sR0FBRyxNQUFNdkIsR0FBRyxDQUFDaUIsTUFBTSxDQUFDQyxRQUFRLENBQUNDLElBQUksQ0FBQyxPQUFPLEVBQUU7TUFBRVgsS0FBSyxFQUFFQTtJQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRVksYUFBSSxDQUFDQyxXQUFXLENBQUNyQixHQUFHLENBQUNpQixNQUFNLENBQUMsQ0FBQztJQUMzRyxJQUFJLENBQUNNLE9BQU8sQ0FBQ3hELE1BQU0sSUFBSXdELE9BQU8sQ0FBQ3hELE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDekMsTUFBTSxJQUFJMkMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDb0MsZUFBZSxFQUFFLDRCQUE0QnZDLEtBQUssRUFBRSxDQUFDO0lBQ3pGO0lBQ0EsTUFBTWIsSUFBSSxHQUFHNEIsT0FBTyxDQUFDLENBQUMsQ0FBQzs7SUFFdkI7SUFDQSxPQUFPNUIsSUFBSSxDQUFDQyxRQUFRO0lBRXBCLElBQUlELElBQUksQ0FBQ21ELGFBQWEsRUFBRTtNQUN0QixNQUFNLElBQUlwQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNtSCxXQUFXLEVBQUUsU0FBU3RILEtBQUssdUJBQXVCLENBQUM7SUFDdkY7SUFFQSxNQUFNcUcsY0FBYyxHQUFHN0csR0FBRyxDQUFDaUIsTUFBTSxDQUFDNEYsY0FBYztJQUNoRCxNQUFNa0IsSUFBSSxHQUFHLE1BQU1sQixjQUFjLENBQUNtQiwwQkFBMEIsQ0FBQ3JJLElBQUksRUFBRUssR0FBRyxDQUFDZ0MsSUFBSSxDQUFDQyxRQUFRLEVBQUVqQyxHQUFHLENBQUNnQyxJQUFJLENBQUNNLGNBQWMsRUFBRXRDLEdBQUcsQ0FBQ3FDLEVBQUUsQ0FBQztJQUN0SCxJQUFJMEYsSUFBSSxFQUFFO01BQ1JsQixjQUFjLENBQUNvQixxQkFBcUIsQ0FBQ3RJLElBQUksRUFBRUssR0FBRyxDQUFDO0lBQ2pEO0lBQ0EsT0FBTztNQUFFMEQsUUFBUSxFQUFFLENBQUM7SUFBRSxDQUFDO0VBQ3pCO0VBRUEsTUFBTXdFLGVBQWVBLENBQUNsSSxHQUFHLEVBQUU7SUFDekIsTUFBTTtNQUFFTSxRQUFRO01BQUVFLEtBQUs7TUFBRVosUUFBUTtNQUFFQyxRQUFRO01BQUVzSTtJQUFjLENBQUMsR0FBR25JLEdBQUcsQ0FBQ0ssSUFBSTs7SUFFdkU7SUFDQSxJQUFJVixJQUFJO0lBQ1IsSUFBSVcsUUFBUSxJQUFJRSxLQUFLLEVBQUU7TUFDckIsSUFBSSxDQUFDWixRQUFRLEVBQUU7UUFDYixNQUFNLElBQUljLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNtSCxXQUFXLEVBQ3ZCLG9FQUNGLENBQUM7TUFDSDtNQUNBbkksSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDSSw0QkFBNEIsQ0FBQ0MsR0FBRyxDQUFDO0lBQ3JEO0lBRUEsSUFBSSxDQUFDbUksYUFBYSxFQUFFO01BQ2xCLE1BQU0sSUFBSXpILGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ21ILFdBQVcsRUFBRSx1QkFBdUIsQ0FBQztJQUN6RTtJQUVBLElBQUksT0FBT0ssYUFBYSxLQUFLLFFBQVEsRUFBRTtNQUNyQyxNQUFNLElBQUl6SCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNtSCxXQUFXLEVBQUUsb0NBQW9DLENBQUM7SUFDdEY7SUFFQSxJQUFJM0YsT0FBTztJQUNYLElBQUlpRyxTQUFTOztJQUViO0lBQ0EsSUFBSXZJLFFBQVEsRUFBRTtNQUNaLElBQUksT0FBT0EsUUFBUSxLQUFLLFFBQVEsRUFBRTtRQUNoQyxNQUFNLElBQUlhLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ21ILFdBQVcsRUFBRSwrQkFBK0IsQ0FBQztNQUNqRjtNQUNBLElBQUluSSxJQUFJLEVBQUU7UUFDUixNQUFNLElBQUllLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNtSCxXQUFXLEVBQ3ZCLHFGQUNGLENBQUM7TUFDSDtNQUVBLElBQUkxSyxNQUFNLENBQUNDLElBQUksQ0FBQ3dDLFFBQVEsQ0FBQyxDQUFDckMsTUFBTSxDQUFDOEIsR0FBRyxJQUFJTyxRQUFRLENBQUNQLEdBQUcsQ0FBQyxDQUFDK0ksRUFBRSxDQUFDLENBQUN0SyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQ3BFLE1BQU0sSUFBSTJDLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUNtSCxXQUFXLEVBQ3ZCLGdFQUNGLENBQUM7TUFDSDtNQUVBLE1BQU12RyxPQUFPLEdBQUcsTUFBTUgsYUFBSSxDQUFDa0gscUJBQXFCLENBQUN0SSxHQUFHLENBQUNpQixNQUFNLEVBQUVwQixRQUFRLENBQUM7TUFFdEUsSUFBSTtRQUNGLElBQUksQ0FBQzBCLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSUEsT0FBTyxDQUFDeEQsTUFBTSxHQUFHLENBQUMsRUFBRTtVQUNyQyxNQUFNLElBQUkyQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNHLGdCQUFnQixFQUFFLGlCQUFpQixDQUFDO1FBQ3hFO1FBQ0E7UUFDQSxNQUFNaEIsUUFBUSxHQUFHMUMsTUFBTSxDQUFDQyxJQUFJLENBQUN3QyxRQUFRLENBQUMsQ0FBQ3NCLElBQUksQ0FBQzdCLEdBQUcsSUFBSU8sUUFBUSxDQUFDUCxHQUFHLENBQUMsQ0FBQytJLEVBQUUsQ0FBQztRQUVwRUQsU0FBUyxHQUFHMUgsYUFBSyxDQUFDOEIsSUFBSSxDQUFDQyxRQUFRLENBQUE1RSxhQUFBO1VBQUdzQixTQUFTLEVBQUU7UUFBTyxHQUFLb0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7UUFDdEVZLE9BQU8sR0FBRyxJQUFBb0csMEJBQWdCLEVBQUNsQyxTQUFTLEVBQUVyRyxHQUFHLENBQUNnQyxJQUFJLEVBQUVvRyxTQUFTLEVBQUVBLFNBQVMsRUFBRXBJLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQztRQUNqRmtCLE9BQU8sQ0FBQ3FHLFdBQVcsR0FBRyxJQUFJO1FBQzFCO1FBQ0EsTUFBTTtVQUFFQztRQUFVLENBQUMsR0FBR3pJLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQzBFLGVBQWUsQ0FBQytDLHVCQUF1QixDQUFDNUksUUFBUSxDQUFDO1FBQ2xGLE1BQU02SSxpQkFBaUIsR0FBRyxNQUFNRixTQUFTLENBQUM1SSxRQUFRLENBQUNDLFFBQVEsQ0FBQyxFQUFFRSxHQUFHLEVBQUVvSSxTQUFTLEVBQUVqRyxPQUFPLENBQUM7UUFDdEYsSUFBSXdHLGlCQUFpQixJQUFJQSxpQkFBaUIsQ0FBQ0YsU0FBUyxFQUFFO1VBQ3BELE1BQU1FLGlCQUFpQixDQUFDRixTQUFTLENBQUMsQ0FBQztRQUNyQztNQUNGLENBQUMsQ0FBQyxPQUFPM0wsQ0FBQyxFQUFFO1FBQ1Y7UUFDQThMLGNBQU0sQ0FBQzNGLEtBQUssQ0FBQ25HLENBQUMsQ0FBQztRQUNmLE1BQU0sSUFBSTRELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0csZ0JBQWdCLEVBQUUsaUJBQWlCLENBQUM7TUFDeEU7SUFDRjtJQUVBLElBQUksQ0FBQ3NILFNBQVMsRUFBRTtNQUNkQSxTQUFTLEdBQUd6SSxJQUFJLEdBQUdlLGFBQUssQ0FBQzhCLElBQUksQ0FBQ0MsUUFBUSxDQUFBNUUsYUFBQTtRQUFHc0IsU0FBUyxFQUFFO01BQU8sR0FBS1EsSUFBSSxDQUFFLENBQUMsR0FBRzBHLFNBQVM7SUFDckY7SUFFQSxJQUFJLENBQUNsRSxPQUFPLEVBQUU7TUFDWkEsT0FBTyxHQUFHLElBQUFvRywwQkFBZ0IsRUFBQ2xDLFNBQVMsRUFBRXJHLEdBQUcsQ0FBQ2dDLElBQUksRUFBRW9HLFNBQVMsRUFBRUEsU0FBUyxFQUFFcEksR0FBRyxDQUFDaUIsTUFBTSxDQUFDO01BQ2pGa0IsT0FBTyxDQUFDcUcsV0FBVyxHQUFHLElBQUk7SUFDNUI7SUFDQSxNQUFNSyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ2Q7SUFDQTtJQUNBLEtBQUssTUFBTS9JLFFBQVEsSUFBSTFDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDOEssYUFBYSxDQUFDLENBQUNXLElBQUksQ0FBQyxDQUFDLEVBQUU7TUFDeEQsSUFBSTtRQUNGLE1BQU1DLFdBQVcsR0FBRy9JLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQzBFLGVBQWUsQ0FBQytDLHVCQUF1QixDQUFDNUksUUFBUSxDQUFDO1FBQ2hGLElBQUksQ0FBQ2lKLFdBQVcsRUFBRTtVQUNoQjtRQUNGO1FBQ0EsTUFBTTtVQUNKakMsT0FBTyxFQUFFO1lBQUVrQztVQUFVO1FBQ3ZCLENBQUMsR0FBR0QsV0FBVztRQUNmLElBQUksT0FBT0MsU0FBUyxLQUFLLFVBQVUsRUFBRTtVQUNuQyxNQUFNQyx5QkFBeUIsR0FBRyxNQUFNRCxTQUFTLENBQy9DYixhQUFhLENBQUNySSxRQUFRLENBQUMsRUFDdkJELFFBQVEsSUFBSUEsUUFBUSxDQUFDQyxRQUFRLENBQUMsRUFDOUJFLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQ2UsSUFBSSxDQUFDbEMsUUFBUSxDQUFDLEVBQ3pCcUMsT0FDRixDQUFDO1VBQ0QwRyxHQUFHLENBQUMvSSxRQUFRLENBQUMsR0FBR21KLHlCQUF5QixJQUFJLElBQUk7UUFDbkQ7TUFDRixDQUFDLENBQUMsT0FBT3pCLEdBQUcsRUFBRTtRQUNaLE1BQU0xSyxDQUFDLEdBQUcsSUFBQW9NLHNCQUFZLEVBQUMxQixHQUFHLEVBQUU7VUFDMUJDLElBQUksRUFBRS9HLGFBQUssQ0FBQ0MsS0FBSyxDQUFDd0ksYUFBYTtVQUMvQnZCLE9BQU8sRUFBRTtRQUNYLENBQUMsQ0FBQztRQUNGLE1BQU13QixVQUFVLEdBQUdwSixHQUFHLENBQUNnQyxJQUFJLElBQUloQyxHQUFHLENBQUNnQyxJQUFJLENBQUNyQyxJQUFJLEdBQUdLLEdBQUcsQ0FBQ2dDLElBQUksQ0FBQ3JDLElBQUksQ0FBQzBJLEVBQUUsR0FBR2hDLFNBQVM7UUFDM0V1QyxjQUFNLENBQUMzRixLQUFLLENBQ1YsMENBQTBDbkQsUUFBUSxhQUFhc0osVUFBVSxlQUFlLEdBQ3RGQyxJQUFJLENBQUNDLFNBQVMsQ0FBQ3hNLENBQUMsQ0FBQyxFQUNuQjtVQUNFeU0sa0JBQWtCLEVBQUUsV0FBVztVQUMvQnRHLEtBQUssRUFBRW5HLENBQUM7VUFDUjZDLElBQUksRUFBRXlKLFVBQVU7VUFDaEJ0SjtRQUNGLENBQ0YsQ0FBQztRQUNELE1BQU1oRCxDQUFDO01BQ1Q7SUFDRjtJQUNBLE9BQU87TUFBRTRHLFFBQVEsRUFBRTtRQUFFeUUsYUFBYSxFQUFFVTtNQUFJO0lBQUUsQ0FBQztFQUM3QztFQUVBVyxXQUFXQSxDQUFBLEVBQUc7SUFDWixJQUFJLENBQUNDLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFekosR0FBRyxJQUFJO01BQ2pDLE9BQU8sSUFBSSxDQUFDMEosVUFBVSxDQUFDMUosR0FBRyxDQUFDO0lBQzdCLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFRSxxQ0FBd0IsRUFBRTNKLEdBQUcsSUFBSTtNQUM1RCxPQUFPLElBQUksQ0FBQzRKLFlBQVksQ0FBQzVKLEdBQUcsQ0FBQztJQUMvQixDQUFDLENBQUM7SUFDRixJQUFJLENBQUN5SixLQUFLLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRXpKLEdBQUcsSUFBSTtNQUNwQyxPQUFPLElBQUksQ0FBQ2tELFFBQVEsQ0FBQ2xELEdBQUcsQ0FBQztJQUMzQixDQUFDLENBQUM7SUFDRixJQUFJLENBQUN5SixLQUFLLENBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFekosR0FBRyxJQUFJO01BQzNDLE9BQU8sSUFBSSxDQUFDNkosU0FBUyxDQUFDN0osR0FBRyxDQUFDO0lBQzVCLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLEVBQUVFLHFDQUF3QixFQUFFM0osR0FBRyxJQUFJO01BQ3JFLE9BQU8sSUFBSSxDQUFDOEosWUFBWSxDQUFDOUosR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxRQUFRLEVBQUUsa0JBQWtCLEVBQUV6SixHQUFHLElBQUk7TUFDOUMsT0FBTyxJQUFJLENBQUMrSixZQUFZLENBQUMvSixHQUFHLENBQUM7SUFDL0IsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUosS0FBSyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUV6SixHQUFHLElBQUk7TUFDakMsT0FBTyxJQUFJLENBQUMyRCxXQUFXLENBQUMzRCxHQUFHLENBQUM7SUFDOUIsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUosS0FBSyxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUV6SixHQUFHLElBQUk7TUFDbEMsT0FBTyxJQUFJLENBQUMyRCxXQUFXLENBQUMzRCxHQUFHLENBQUM7SUFDOUIsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUosS0FBSyxDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUV6SixHQUFHLElBQUk7TUFDcEMsT0FBTyxJQUFJLENBQUM2RixhQUFhLENBQUM3RixHQUFHLENBQUM7SUFDaEMsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUosS0FBSyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUV6SixHQUFHLElBQUk7TUFDbkMsT0FBTyxJQUFJLENBQUNrRyxZQUFZLENBQUNsRyxHQUFHLENBQUM7SUFDL0IsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUosS0FBSyxDQUFDLE1BQU0sRUFBRSx1QkFBdUIsRUFBRXpKLEdBQUcsSUFBSTtNQUNqRCxPQUFPLElBQUksQ0FBQ29ILGtCQUFrQixDQUFDcEgsR0FBRyxDQUFDO0lBQ3JDLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxNQUFNLEVBQUUsMkJBQTJCLEVBQUV6SixHQUFHLElBQUk7TUFDckQsT0FBTyxJQUFJLENBQUM2SCw4QkFBOEIsQ0FBQzdILEdBQUcsQ0FBQztJQUNqRCxDQUFDLENBQUM7SUFDRixJQUFJLENBQUN5SixLQUFLLENBQUMsS0FBSyxFQUFFLGlCQUFpQixFQUFFekosR0FBRyxJQUFJO01BQzFDLE9BQU8sSUFBSSxDQUFDaUcsb0JBQW9CLENBQUNqRyxHQUFHLENBQUM7SUFDdkMsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUosS0FBSyxDQUFDLE1BQU0sRUFBRSxpQkFBaUIsRUFBRXpKLEdBQUcsSUFBSTtNQUMzQyxPQUFPLElBQUksQ0FBQ2lHLG9CQUFvQixDQUFDakcsR0FBRyxDQUFDO0lBQ3ZDLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFekosR0FBRyxJQUFJO01BQ3RDLE9BQU8sSUFBSSxDQUFDa0ksZUFBZSxDQUFDbEksR0FBRyxDQUFDO0lBQ2xDLENBQUMsQ0FBQztFQUNKO0FBQ0Y7QUFBQ2dLLE9BQUEsQ0FBQS9LLFdBQUEsR0FBQUEsV0FBQTtBQUFBLElBQUFnTCxRQUFBLEdBQUFELE9BQUEsQ0FBQWhOLE9BQUEsR0FFY2lDLFdBQVciLCJpZ25vcmVMaXN0IjpbXX0=