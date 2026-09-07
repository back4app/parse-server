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
var _Error = require("../Error");
var _AuthDataLock = require("../AuthDataLock");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// These methods handle the User-related routes.

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
      let payload = req.body || {};
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
          // Perform a dummy bcrypt compare to normalize response timing,
          // preventing user enumeration via timing side-channel
          return _password.default.compare(password, _password.default.dummyHash).then(() => {
            throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
          });
        }
        if (results.length > 1) {
          // corner case where user1 has username == user2 email
          req.config.loggerController.warn("There is a user which email is the same as another user's username, logging in based on username");
          user = results.filter(user => user.username === username)[0];
        } else {
          user = results[0];
        }
        if (typeof user.password !== 'string' || user.password.length === 0) {
          // Passwordless account (e.g. OAuth-only): run dummy compare for
          // timing normalization, discard result, always reject
          return _password.default.compare(password, _password.default.dummyHash).then(() => false);
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
  async handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw (0, _Error.createSanitizedError)(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token', req.config);
    }
    const sessionToken = req.info.sessionToken;
    // Query the session with master key to validate the session token,
    // but do NOT include 'user' to avoid leaking user data via master context
    const sessionResponse = await _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
      sessionToken
    }, {}, req.info.context);
    if (!sessionResponse.results || sessionResponse.results.length == 0 || !sessionResponse.results[0].user) {
      throw (0, _Error.createSanitizedError)(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token', req.config);
    }
    const userId = sessionResponse.results[0].user.objectId;
    // Re-fetch the user with the caller's auth context so that
    // protectedFields, CLP, and auth adapter afterFind apply correctly
    const userResponse = await _rest.default.get(req.config, req.auth, '_User', userId, {}, req.info.context);
    if (!userResponse.results || userResponse.results.length == 0) {
      throw (0, _Error.createSanitizedError)(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token', req.config);
    }
    const user = userResponse.results[0];
    // Send token back on the login, because SDKs expect that.
    user.sessionToken = sessionToken;
    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);
    return {
      response: user
    };
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
      }, req.body || {}, user, req.info.context), user);
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
      const query = {
        objectId: user.objectId
      };
      // Prevent concurrent requests from both succeeding when consuming single-use
      // tokens (e.g. MFA recovery codes or SMS OTP tokens) by extending the update
      // WHERE clause with the original values of changed primitive/array fields.
      (0, _AuthDataLock.applyAuthDataOptimisticLock)(query, user.authData, validatedAuthData);
      try {
        await req.config.database.update('_User', query, {
          authData: validatedAuthData
        }, {});
      } catch (error) {
        if (error.code === _node.default.Error.OBJECT_NOT_FOUND) {
          throw new _node.default.Error(_node.default.Error.SCRIPT_FAILED, 'Invalid auth data');
        }
        throw error;
      }
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
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, {
      ...req.auth,
      user: afterLoginUser
    }, afterLoginUser, null, req.config, req.info.context);
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
      throw (0, _Error.createSanitizedError)(_node.default.Error.OPERATION_FORBIDDEN, 'master key is required', req.config);
    }
    if (req.auth.isReadOnly) {
      throw (0, _Error.createSanitizedError)(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to login as another user.", req.config);
    }
    const userId = req.body?.userId || req.query.userId;
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
    return this._authenticateUserFromRequest(req).then(async user => {
      // Remove hidden properties.
      UsersRouter.removeHiddenProperties(user);
      await req.config.authDataManager.runAfterFind(req, user.authData);
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
      }, undefined, req.info.context);
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
        publicServerURL: req.config.publicServerURL || req.config._publicServerURL,
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
    let email = req.body?.email;
    const token = req.body?.token;
    if (!email && !token) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (token && typeof token !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_VALUE, 'token must be a string');
    }
    let userResults = null;
    let userData = null;

    // We can find the user using token
    if (token) {
      userResults = await req.config.database.find('_User', {
        _perishable_token: token,
        _perishable_token_expires_at: {
          $lt: _node.default._encode(new Date())
        }
      });
      if (userResults?.length > 0) {
        userData = userResults[0];
        if (userData.email) {
          email = userData.email;
        }
      }
      // Or using email if no token provided
    } else if (typeof email === 'string') {
      userResults = await req.config.database.find('_User', {
        $or: [{
          email
        }, {
          username: email,
          email: {
            $exists: false
          }
        }]
      }, {
        limit: 1
      }, _Auth.default.maintenance(req.config));
      if (userResults?.length > 0) {
        userData = userResults[0];
      }
    }
    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    if (userData) {
      this._sanitizeAuthData(userData);
      // Get files attached to user
      await req.config.filesController.expandFilesInObject(req.config, userData);
      const user = (0, _triggers.inflate)('_User', userData);
      await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforePasswordResetRequest, req.auth, user, null, req.config, req.info.context);
    }
    const userController = req.config.userController;
    try {
      await userController.sendPasswordResetEmail(email);
      return {
        response: {}
      };
    } catch (err) {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        if (req.config.passwordPolicy?.resetPasswordSuccessOnInvalidEmail ?? true) {
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
    } = req.body || {};
    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    const verifyEmailSuccessOnInvalidEmail = req.config.emailVerifySuccessOnInvalidEmail ?? true;
    const results = await req.config.database.find('_User', {
      email: email
    }, {}, _Auth.default.maintenance(req.config));
    if (!results.length || results.length < 1) {
      if (verifyEmailSuccessOnInvalidEmail) {
        return {
          response: {}
        };
      }
      throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
    }
    const user = results[0];

    // remove password field, messes with saving on postgres
    delete user.password;
    if (user.emailVerified) {
      if (verifyEmailSuccessOnInvalidEmail) {
        return {
          response: {}
        };
      }
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
    } = req.body || {};

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
        parseUser = _node.default.User.fromJSON({
          className: '_User',
          ...results[0]
        });
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
      parseUser = user ? _node.default.User.fromJSON({
        className: '_User',
        ...user
      }) : undefined;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwiX0Vycm9yIiwiX0F1dGhEYXRhTG9jayIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX3Nhbml0aXplQXV0aERhdGEiLCJ1c2VyIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsImtleXMiLCJmb3JFYWNoIiwicHJvdmlkZXIiLCJsZW5ndGgiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsImlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiT0JKRUNUX05PVF9GT1VORCIsImlzVmFsaWRQYXNzd29yZCIsIiRvciIsImNvbmZpZyIsImRhdGFiYXNlIiwiZmluZCIsIkF1dGgiLCJtYWludGVuYW5jZSIsInRoZW4iLCJyZXN1bHRzIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiZHVtbXlIYXNoIiwibG9nZ2VyQ29udHJvbGxlciIsIndhcm4iLCJmaWx0ZXIiLCJjb3JyZWN0IiwiYWNjb3VudExvY2tvdXRQb2xpY3kiLCJBY2NvdW50TG9ja291dCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImF1dGgiLCJpc01hc3RlciIsIkFDTCIsInJlcXVlc3QiLCJtYXN0ZXIiLCJpcCIsImluc3RhbGxhdGlvbklkIiwib2JqZWN0IiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwiaXNNYWludGVuYW5jZSIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImNhdGNoIiwiZXJyb3IiLCJoYW5kbGVNZSIsImluZm8iLCJzZXNzaW9uVG9rZW4iLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInNlc3Npb25SZXNwb25zZSIsInJlc3QiLCJjb250ZXh0IiwidXNlcklkIiwib2JqZWN0SWQiLCJ1c2VyUmVzcG9uc2UiLCJnZXQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInJlcyIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsIlJlc3RXcml0ZSIsInBhc3N3b3JkUG9saWN5IiwibWF4UGFzc3dvcmRBZ2UiLCJjaGFuZ2VkQXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIkRhdGUiLCJ1cGRhdGUiLCJfZW5jb2RlIiwiX190eXBlIiwiaXNvIiwiZXhwaXJlc0F0IiwiZ2V0VGltZSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJtYXliZVJ1blRyaWdnZXIiLCJUcmlnZ2VyVHlwZXMiLCJiZWZvcmVMb2dpbiIsImFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayIsImNvZGUiLCJTQ1JJUFRfRkFJTEVEIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhY3Rpb24iLCJhdXRoUHJvdmlkZXIiLCJhZnRlckxvZ2luVXNlciIsImFmdGVyTG9naW4iLCJhdXRoRGF0YU1hbmFnZXIiLCJydW5BZnRlckZpbmQiLCJoYW5kbGVMb2dJbkFzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImlzUmVhZE9ubHkiLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwicmVjb3JkcyIsInVuZGVmaW5lZCIsImRlbCIsImFmdGVyTG9nb3V0IiwiU2Vzc2lvbiIsIl90aHJvd09uQmFkRW1haWxDb25maWciLCJDb25maWciLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJfcHVibGljU2VydmVyVVJMIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwidG9rZW4iLCJFTUFJTF9NSVNTSU5HIiwidXNlclJlc3VsdHMiLCJ1c2VyRGF0YSIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsIiRsdCIsIiRleGlzdHMiLCJsaW1pdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsImluZmxhdGUiLCJiZWZvcmVQYXNzd29yZFJlc2V0UmVxdWVzdCIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwibWVzc2FnZSIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsInZlcmlmeUVtYWlsU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwiZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJPVEhFUl9DQVVTRSIsInNlbmQiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImhhbmRsZUNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJwYXJzZVVzZXIiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImdldFJlcXVlc3RPYmplY3QiLCJpc0NoYWxsZW5nZSIsInZhbGlkYXRvciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwidmFsaWRhdG9yUmVzcG9uc2UiLCJsb2dnZXIiLCJhY2MiLCJzb3J0IiwiYXV0aEFkYXB0ZXIiLCJjaGFsbGVuZ2UiLCJwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIiwicmVzb2x2ZUVycm9yIiwidXNlclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiaGFuZGxlRmluZCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZUdldCIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSIsImV4cG9ydHMiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHtcbiAgbWF5YmVSdW5UcmlnZ2VyLFxuICBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMsXG4gIGdldFJlcXVlc3RPYmplY3QsXG4gIHJlc29sdmVFcnJvcixcbiAgaW5mbGF0ZSxcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuLi9SZXN0V3JpdGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCB7IGNyZWF0ZVNhbml0aXplZEVycm9yIH0gZnJvbSAnLi4vRXJyb3InO1xuaW1wb3J0IHsgYXBwbHlBdXRoRGF0YU9wdGltaXN0aWNMb2NrIH0gZnJvbSAnLi4vQXV0aERhdGFMb2NrJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFmdGVyIHJldHJpZXZpbmcgYSB1c2VyIGRpcmVjdGx5IGZyb20gdGhlIGRhdGFiYXNlLCB3ZSBuZWVkIHRvIHJlbW92ZSB0aGVcbiAgICogcGFzc3dvcmQgZnJvbSB0aGUgb2JqZWN0IChmb3Igc2VjdXJpdHkpLCBhbmQgZml4IGFuIGlzc3VlIHNvbWUgU0RLcyBoYXZlXG4gICAqIHdpdGggbnVsbCB2YWx1ZXNcbiAgICovXG4gIF9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpIHtcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIC8vIFNvbWV0aW1lcyB0aGUgYXV0aERhdGEgc3RpbGwgaGFzIG51bGwgb24gdGhhdCBrZXlzXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzkzNVxuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHkgfHwge307XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkLCBpZ25vcmVFbWFpbFZlcmlmaWNhdGlvbiB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSwge30sIEF1dGgubWFpbnRlbmFuY2UocmVxLmNvbmZpZykpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIC8vIFBlcmZvcm0gYSBkdW1teSBiY3J5cHQgY29tcGFyZSB0byBub3JtYWxpemUgcmVzcG9uc2UgdGltaW5nLFxuICAgICAgICAgICAgLy8gcHJldmVudGluZyB1c2VyIGVudW1lcmF0aW9uIHZpYSB0aW1pbmcgc2lkZS1jaGFubmVsXG4gICAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG9cbiAgICAgICAgICAgICAgLmNvbXBhcmUocGFzc3dvcmQsIHBhc3N3b3JkQ3J5cHRvLmR1bW15SGFzaClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHR5cGVvZiB1c2VyLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCB1c2VyLnBhc3N3b3JkLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgLy8gUGFzc3dvcmRsZXNzIGFjY291bnQgKGUuZy4gT0F1dGgtb25seSk6IHJ1biBkdW1teSBjb21wYXJlIGZvclxuICAgICAgICAgICAgLy8gdGltaW5nIG5vcm1hbGl6YXRpb24sIGRpc2NhcmQgcmVzdWx0LCBhbHdheXMgcmVqZWN0XG4gICAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgcGFzc3dvcmRDcnlwdG8uZHVtbXlIYXNoKS50aGVuKCgpID0+IGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENyZWF0ZSByZXF1ZXN0IG9iamVjdCBmb3IgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uc1xuICAgICAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoLmlzTWFzdGVyLFxuICAgICAgICAgICAgaXA6IHJlcS5jb25maWcuaXAsXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICBvYmplY3Q6IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIElmIHJlcXVlc3QgZG9lc24ndCB1c2UgbWFzdGVyIG9yIG1haW50ZW5hbmNlIGtleSB3aXRoIGlnbm9yaW5nIGVtYWlsIHZlcmlmaWNhdGlvblxuICAgICAgICAgIGlmICghKChyZXEuYXV0aC5pc01hc3RlciB8fCByZXEuYXV0aC5pc01haW50ZW5hbmNlKSAmJiBpZ25vcmVFbWFpbFZlcmlmaWNhdGlvbikpIHtcblxuICAgICAgICAgICAgLy8gR2V0IHZlcmlmaWNhdGlvbiBjb25kaXRpb25zIHdoaWNoIGNhbiBiZSBib29sZWFucyBvciBmdW5jdGlvbnM7IHRoZSBwdXJwb3NlIG9mIHRoaXMgYXN5bmMvYXdhaXRcbiAgICAgICAgICAgIC8vIHN0cnVjdHVyZSBpcyB0byBhdm9pZCB1bm5lY2Vzc2FyaWx5IGV4ZWN1dGluZyBzdWJzZXF1ZW50IGZ1bmN0aW9ucyBpZiBwcmV2aW91cyBvbmVzIGZhaWwgaW4gdGhlXG4gICAgICAgICAgICAvLyBjb25kaXRpb25hbCBzdGF0ZW1lbnQgYmVsb3csIGFzIGEgZGV2ZWxvcGVyIG1heSBkZWNpZGUgdG8gZXhlY3V0ZSBleHBlbnNpdmUgb3BlcmF0aW9ucyBpbiB0aGVtXG4gICAgICAgICAgICBjb25zdCB2ZXJpZnlVc2VyRW1haWxzID0gYXN5bmMgKCkgPT4gcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSB0cnVlIHx8ICh0eXBlb2YgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZShyZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPSBhc3luYyAoKSA9PiByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09IHRydWUgfHwgKHR5cGVvZiByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbChyZXF1ZXN0KSkgPT09IHRydWUpO1xuICAgICAgICAgICAgaWYgKGF3YWl0IHZlcmlmeVVzZXJFbWFpbHMoKSAmJiBhd2FpdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKCkgJiYgIXVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiByZXNvbHZlKHVzZXIpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZU1lKHJlcSkge1xuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJywgcmVxLmNvbmZpZyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICAvLyBRdWVyeSB0aGUgc2Vzc2lvbiB3aXRoIG1hc3RlciBrZXkgdG8gdmFsaWRhdGUgdGhlIHNlc3Npb24gdG9rZW4sXG4gICAgLy8gYnV0IGRvIE5PVCBpbmNsdWRlICd1c2VyJyB0byBhdm9pZCBsZWFraW5nIHVzZXIgZGF0YSB2aWEgbWFzdGVyIGNvbnRleHRcbiAgICBjb25zdCBzZXNzaW9uUmVzcG9uc2UgPSBhd2FpdCByZXN0LmZpbmQoXG4gICAgICByZXEuY29uZmlnLFxuICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAnX1Nlc3Npb24nLFxuICAgICAgeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgIHt9LFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICk7XG4gICAgaWYgKFxuICAgICAgIXNlc3Npb25SZXNwb25zZS5yZXN1bHRzIHx8XG4gICAgICBzZXNzaW9uUmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fFxuICAgICAgIXNlc3Npb25SZXNwb25zZS5yZXN1bHRzWzBdLnVzZXJcbiAgICApIHtcbiAgICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicsIHJlcS5jb25maWcpO1xuICAgIH1cbiAgICBjb25zdCB1c2VySWQgPSBzZXNzaW9uUmVzcG9uc2UucmVzdWx0c1swXS51c2VyLm9iamVjdElkO1xuICAgIC8vIFJlLWZldGNoIHRoZSB1c2VyIHdpdGggdGhlIGNhbGxlcidzIGF1dGggY29udGV4dCBzbyB0aGF0XG4gICAgLy8gcHJvdGVjdGVkRmllbGRzLCBDTFAsIGFuZCBhdXRoIGFkYXB0ZXIgYWZ0ZXJGaW5kIGFwcGx5IGNvcnJlY3RseVxuICAgIGNvbnN0IHVzZXJSZXNwb25zZSA9IGF3YWl0IHJlc3QuZ2V0KFxuICAgICAgcmVxLmNvbmZpZyxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHt9LFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICk7XG4gICAgaWYgKCF1c2VyUmVzcG9uc2UucmVzdWx0cyB8fCB1c2VyUmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCkge1xuICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJywgcmVxLmNvbmZpZyk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXIgPSB1c2VyUmVzcG9uc2UucmVzdWx0c1swXTtcbiAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICBjb25zdCBhdXRoRGF0YSA9IHJlcS5ib2R5ICYmIHJlcS5ib2R5LmF1dGhEYXRhO1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaGFzIHByb3ZpZGVkIHRoZWlyIHJlcXVpcmVkIGF1dGggcHJvdmlkZXJzXG4gICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKFxuICAgICAgcmVxLFxuICAgICAgYXV0aERhdGEsXG4gICAgICB1c2VyLmF1dGhEYXRhLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBsZXQgYXV0aERhdGFSZXNwb25zZTtcbiAgICBsZXQgdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgYXV0aERhdGEsXG4gICAgICAgIG5ldyBSZXN0V3JpdGUoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgICByZXEuYm9keSB8fCB7fSxcbiAgICAgICAgICB1c2VyLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKSxcbiAgICAgICAgdXNlclxuICAgICAgKTtcbiAgICAgIGF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIHZhbGlkYXRlZEF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgIH1cblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgIHsgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgKTsgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgYXdhaXQgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnLFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNvbWUgbmV3IHZhbGlkYXRlZCBhdXRoRGF0YSB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgY29uc3QgcXVlcnkgPSB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH07XG4gICAgICAvLyBQcmV2ZW50IGNvbmN1cnJlbnQgcmVxdWVzdHMgZnJvbSBib3RoIHN1Y2NlZWRpbmcgd2hlbiBjb25zdW1pbmcgc2luZ2xlLXVzZVxuICAgICAgLy8gdG9rZW5zIChlLmcuIE1GQSByZWNvdmVyeSBjb2RlcyBvciBTTVMgT1RQIHRva2VucykgYnkgZXh0ZW5kaW5nIHRoZSB1cGRhdGVcbiAgICAgIC8vIFdIRVJFIGNsYXVzZSB3aXRoIHRoZSBvcmlnaW5hbCB2YWx1ZXMgb2YgY2hhbmdlZCBwcmltaXRpdmUvYXJyYXkgZmllbGRzLlxuICAgICAgYXBwbHlBdXRoRGF0YU9wdGltaXN0aWNMb2NrKHF1ZXJ5LCB1c2VyLmF1dGhEYXRhLCB2YWxpZGF0ZWRBdXRoRGF0YSk7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCBxdWVyeSwgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSwge30pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCwgJ0ludmFsaWQgYXV0aCBkYXRhJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZyxcbiAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICApO1xuXG4gICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgIHVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgfVxuICAgIGF3YWl0IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLnJ1bkFmdGVyRmluZChyZXEsIHVzZXIuYXV0aERhdGEpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGFsbG93cyBtYXN0ZXIta2V5IGNsaWVudHMgdG8gY3JlYXRlIHVzZXIgc2Vzc2lvbnMgd2l0aG91dCBhY2Nlc3MgdG9cbiAgICogdXNlciBjcmVkZW50aWFscy4gVGhpcyBlbmFibGVzIHN5c3RlbXMgdGhhdCBjYW4gYXV0aGVudGljYXRlIGFjY2VzcyBhbm90aGVyXG4gICAqIHdheSAoQVBJIGtleSwgYXBwIGFkbWluaXN0cmF0b3JzKSB0byBhY3Qgb24gYSB1c2VyJ3MgYmVoYWxmLlxuICAgKlxuICAgKiBXZSBjcmVhdGUgYSBuZXcgc2Vzc2lvbiByYXRoZXIgdGhhbiBsb29raW5nIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyB3ZVxuICAgKiB3YW50IHRoaXMgdG8gd29yayBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSB1c2VyIGlzIGxvZ2dlZCBvdXQgb24gYWxsXG4gICAqIGRldmljZXMsIHNpbmNlIHRoaXMgY2FuIGJlIHVzZWQgYnkgYXV0b21hdGVkIHN5c3RlbXMgYWN0aW5nIG9uIHRoZSB1c2VyJ3NcbiAgICogYmVoYWxmLlxuICAgKlxuICAgKiBGb3IgdGhlIG1vbWVudCwgd2UncmUgb21pdHRpbmcgZXZlbnQgaG9va3MgYW5kIGxvY2tvdXQgY2hlY2tzLCBzaW5jZVxuICAgKiBpbW1lZGlhdGUgdXNlIGNhc2VzIHN1Z2dlc3QgL2xvZ2luQXMgY291bGQgYmUgdXNlZCBmb3Igc2VtYW50aWNhbGx5XG4gICAqIGRpZmZlcmVudCByZWFzb25zIGZyb20gL2xvZ2luXG4gICAqL1xuICBhc3luYyBoYW5kbGVMb2dJbkFzKHJlcSkge1xuICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAnbWFzdGVyIGtleSBpcyByZXF1aXJlZCcsXG4gICAgICAgIHJlcS5jb25maWdcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gbG9naW4gYXMgYW5vdGhlciB1c2VyLlwiLFxuICAgICAgICByZXEuY29uZmlnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJJZCA9IHJlcS5ib2R5Py51c2VySWQgfHwgcmVxLnF1ZXJ5LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLFxuICAgICAgICAndXNlcklkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsLCBvciB1bmRlZmluZWQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5UmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB1c2VySWQgfSk7XG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0c1swXTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAndXNlciBub3QgZm91bmQnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdtYXN0ZXJrZXknLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4oYXN5bmMgdXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcbiAgICAgICAgYXdhaXQgcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIucnVuQWZ0ZXJGaW5kKHJlcSwgdXNlci5hdXRoRGF0YSk7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ091dChyZXEpIHtcbiAgICBjb25zdCBzdWNjZXNzID0geyByZXNwb25zZToge30gfTtcbiAgICBpZiAocmVxLmluZm8gJiYgcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICBjb25zdCByZWNvcmRzID0gYXdhaXQgcmVzdC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICk7XG4gICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgYXdhaXQgcmVzdC5kZWwoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dvdXQsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHJlY29yZHMucmVzdWx0c1swXSkpLFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgcmVxLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3VjY2VzcztcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwgfHwgcmVxLmNvbmZpZy5fcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGxldCBlbWFpbCA9IHJlcS5ib2R5Py5lbWFpbDtcbiAgICBjb25zdCB0b2tlbiA9IHJlcS5ib2R5Py50b2tlbjtcblxuICAgIGlmICghZW1haWwgJiYgIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG5cbiAgICBpZiAodG9rZW4gJiYgdHlwZW9mIHRva2VuICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfVkFMVUUsICd0b2tlbiBtdXN0IGJlIGEgc3RyaW5nJyk7XG4gICAgfVxuXG4gICAgbGV0IHVzZXJSZXN1bHRzID0gbnVsbDtcbiAgICBsZXQgdXNlckRhdGEgPSBudWxsO1xuXG4gICAgLy8gV2UgY2FuIGZpbmQgdGhlIHVzZXIgdXNpbmcgdG9rZW5cbiAgICBpZiAodG9rZW4pIHtcbiAgICAgIHVzZXJSZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHtcbiAgICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHRva2VuLFxuICAgICAgICBfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0OiB7ICRsdDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9LFxuICAgICAgfSk7XG4gICAgICBpZiAodXNlclJlc3VsdHM/Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgdXNlckRhdGEgPSB1c2VyUmVzdWx0c1swXTtcbiAgICAgICAgaWYgKHVzZXJEYXRhLmVtYWlsKSB7XG4gICAgICAgICAgZW1haWwgPSB1c2VyRGF0YS5lbWFpbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIC8vIE9yIHVzaW5nIGVtYWlsIGlmIG5vIHRva2VuIHByb3ZpZGVkXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZW1haWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICB1c2VyUmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyAkb3I6IFt7IGVtYWlsIH0sIHsgdXNlcm5hbWU6IGVtYWlsLCBlbWFpbDogeyAkZXhpc3RzOiBmYWxzZSB9IH1dIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZShyZXEuY29uZmlnKVxuICAgICAgKTtcbiAgICAgIGlmICh1c2VyUmVzdWx0cz8ubGVuZ3RoID4gMCkge1xuICAgICAgICB1c2VyRGF0YSA9IHVzZXJSZXN1bHRzWzBdO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh1c2VyRGF0YSkge1xuICAgICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyRGF0YSk7XG4gICAgICAvLyBHZXQgZmlsZXMgYXR0YWNoZWQgdG8gdXNlclxuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyRGF0YSk7XG5cbiAgICAgIGNvbnN0IHVzZXIgPSBpbmZsYXRlKCdfVXNlcicsIHVzZXJEYXRhKTtcblxuICAgICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QsXG4gICAgICAgIHJlcS5hdXRoLFxuICAgICAgICB1c2VyLFxuICAgICAgICBudWxsLFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICByZXNwb25zZToge30sXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Py5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsID8/IHRydWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgZXJyLm1lc3NhZ2UgPSBgQSB1c2VyIHdpdGggdGhhdCBlbWFpbCBkb2VzIG5vdCBleGlzdC5gO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5IHx8IHt9O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB2ZXJpZnlFbWFpbFN1Y2Nlc3NPbkludmFsaWRFbWFpbCA9IHJlcS5jb25maWcuZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwgPz8gdHJ1ZTtcblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSwge30sIEF1dGgubWFpbnRlbmFuY2UocmVxLmNvbmZpZykpO1xuICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICBpZiAodmVyaWZ5RW1haWxTdWNjZXNzT25JbnZhbGlkRW1haWwpIHtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICB9XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIGlmICh2ZXJpZnlFbWFpbFN1Y2Nlc3NPbkludmFsaWRFbWFpbCkge1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH1cbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIGNvbnN0IHNlbmQgPSBhd2FpdCB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEuYXV0aC5pc01hc3RlciwgcmVxLmF1dGguaW5zdGFsbGF0aW9uSWQsIHJlcS5pcCk7XG4gICAgaWYgKHNlbmQpIHtcbiAgICAgIHVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyLCByZXEpO1xuICAgIH1cbiAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUNoYWxsZW5nZShyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGF1dGhEYXRhLCBjaGFsbGVuZ2VEYXRhIH0gPSByZXEuYm9keSB8fCB7fTtcblxuICAgIC8vIGlmIHVzZXJuYW1lIG9yIGVtYWlsIHByb3ZpZGVkIHdpdGggcGFzc3dvcmQgdHJ5IHRvIGF1dGhlbnRpY2F0ZSB0aGUgdXNlciBieSB1c2VybmFtZVxuICAgIGxldCB1c2VyO1xuICAgIGlmICh1c2VybmFtZSB8fCBlbWFpbCkge1xuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBwcm92aWRlZCB1c2VybmFtZSBvciBlbWFpbCwgeW91IG5lZWQgdG8gYWxzbyBwcm92aWRlIHBhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIWNoYWxsZW5nZURhdGEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ05vdGhpbmcgdG8gY2hhbGxlbmdlLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2NoYWxsZW5nZURhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG5cbiAgICBsZXQgcmVxdWVzdDtcbiAgICBsZXQgcGFyc2VVc2VyO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnYXV0aERhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIHVzZXJuYW1lL2VtYWlsIGFuZCBhdXRoRGF0YSwgb25seSB1c2Ugb25lIGlkZW50aWZpY2F0aW9uIG1ldGhvZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmlsdGVyKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpbmQgdGhlIHByb3ZpZGVyIHVzZWQgdG8gZmluZCB0aGUgdXNlclxuICAgICAgICBjb25zdCBwcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maW5kKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKTtcblxuICAgICAgICBwYXJzZVVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5yZXN1bHRzWzBdIH0pO1xuICAgICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgICAgICAvLyBWYWxpZGF0ZSBhdXRoRGF0YSB1c2VkIHRvIGlkZW50aWZ5IHRoZSB1c2VyIHRvIGF2b2lkIGJydXRlLWZvcmNlIGF0dGFjayBvbiBgaWRgXG4gICAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRvclJlc3BvbnNlID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCBwYXJzZVVzZXIsIHJlcXVlc3QpO1xuICAgICAgICBpZiAodmFsaWRhdG9yUmVzcG9uc2UgJiYgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gUmV3cml0ZSB0aGUgZXJyb3IgdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGxvZ2dlci5lcnJvcihlKTtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBhcnNlVXNlcikge1xuICAgICAgcGFyc2VVc2VyID0gdXNlciA/IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnVzZXIgfSkgOiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0KSB7XG4gICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgYWNjID0ge307XG4gICAgLy8gRXhlY3V0ZSBjaGFsbGVuZ2Ugc3RlcC1ieS1zdGVwIHdpdGggY29uc2lzdGVudCBvcmRlciBmb3IgYmV0dGVyIGVycm9yIGZlZWRiYWNrXG4gICAgLy8gYW5kIHRvIGF2b2lkIHRvIHRyaWdnZXIgb3RoZXJzIGNoYWxsZW5nZXMgaWYgb25lIG9mIHRoZW0gZmFpbHNcbiAgICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXV0aEFkYXB0ZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGlmICghYXV0aEFkYXB0ZXIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgYWRhcHRlcjogeyBjaGFsbGVuZ2UgfSxcbiAgICAgICAgfSA9IGF1dGhBZGFwdGVyO1xuICAgICAgICBpZiAodHlwZW9mIGNoYWxsZW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgPSBhd2FpdCBjaGFsbGVuZ2UoXG4gICAgICAgICAgICBjaGFsbGVuZ2VEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIGF1dGhEYXRhICYmIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcS5jb25maWcuYXV0aFtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXF1ZXN0XG4gICAgICAgICAgKTtcbiAgICAgICAgICBhY2NbcHJvdmlkZXJdID0gcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSB8fCB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdDaGFsbGVuZ2UgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB1c2VyU3RyaW5nID0gcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG4gICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwIGNoYWxsZW5nZSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogJ2NoYWxsZW5nZScsXG4gICAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IGNoYWxsZW5nZURhdGE6IGFjYyB9IH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luQXMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW5BcyhyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFFQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxlQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxjQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxL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