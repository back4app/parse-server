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
      // Run the adapters' `beforeFind` (the credential check for code-based adapters) as the
      // signup/link path does, and reject an identity already linked to another user
      const linkedUsers = await _Auth.default.findUsersWithAuthData(req.config, authData, true);
      if (linkedUsers.some(linkedUser => linkedUser.objectId !== user.objectId)) {
        throw new _node.default.Error(_node.default.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
      }
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
      try {
        // Run `beforeFind` so a bare client-supplied provider id cannot select the user
        const results = await _Auth.default.findUsersWithAuthData(req.config, authData, true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwiX0Vycm9yIiwiX0F1dGhEYXRhTG9jayIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX3Nhbml0aXplQXV0aERhdGEiLCJ1c2VyIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsImtleXMiLCJmb3JFYWNoIiwicHJvdmlkZXIiLCJsZW5ndGgiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsImlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiT0JKRUNUX05PVF9GT1VORCIsImlzVmFsaWRQYXNzd29yZCIsIiRvciIsImNvbmZpZyIsImRhdGFiYXNlIiwiZmluZCIsIkF1dGgiLCJtYWludGVuYW5jZSIsInRoZW4iLCJyZXN1bHRzIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiZHVtbXlIYXNoIiwibG9nZ2VyQ29udHJvbGxlciIsIndhcm4iLCJmaWx0ZXIiLCJjb3JyZWN0IiwiYWNjb3VudExvY2tvdXRQb2xpY3kiLCJBY2NvdW50TG9ja291dCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImF1dGgiLCJpc01hc3RlciIsIkFDTCIsInJlcXVlc3QiLCJtYXN0ZXIiLCJpcCIsImluc3RhbGxhdGlvbklkIiwib2JqZWN0IiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwiaXNNYWludGVuYW5jZSIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImNhdGNoIiwiZXJyb3IiLCJoYW5kbGVNZSIsImluZm8iLCJzZXNzaW9uVG9rZW4iLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInNlc3Npb25SZXNwb25zZSIsInJlc3QiLCJjb250ZXh0IiwidXNlcklkIiwib2JqZWN0SWQiLCJ1c2VyUmVzcG9uc2UiLCJnZXQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsImxpbmtlZFVzZXJzIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwic29tZSIsImxpbmtlZFVzZXIiLCJBQ0NPVU5UX0FMUkVBRFlfTElOS0VEIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiUmVzdFdyaXRlIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYXBwbHlBdXRoRGF0YU9wdGltaXN0aWNMb2NrIiwiY29kZSIsIlNDUklQVF9GQUlMRUQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImFmdGVyTG9naW5Vc2VyIiwiYWZ0ZXJMb2dpbiIsImF1dGhEYXRhTWFuYWdlciIsInJ1bkFmdGVyRmluZCIsImhhbmRsZUxvZ0luQXMiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiaXNSZWFkT25seSIsIklOVkFMSURfVkFMVUUiLCJxdWVyeVJlc3VsdHMiLCJoYW5kbGVWZXJpZnlQYXNzd29yZCIsImhhbmRsZUxvZ091dCIsInN1Y2Nlc3MiLCJyZWNvcmRzIiwidW5kZWZpbmVkIiwiZGVsIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsIl9wdWJsaWNTZXJ2ZXJVUkwiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJ0b2tlbiIsIkVNQUlMX01JU1NJTkciLCJ1c2VyUmVzdWx0cyIsInVzZXJEYXRhIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiJGx0IiwiJGV4aXN0cyIsImxpbWl0IiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwiaW5mbGF0ZSIsImJlZm9yZVBhc3N3b3JkUmVzZXRSZXF1ZXN0Iiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsInJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJtZXNzYWdlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwidmVyaWZ5RW1haWxTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJlbWFpbFZlcmlmeVN1Y2Nlc3NPbkludmFsaWRFbWFpbCIsIk9USEVSX0NBVVNFIiwic2VuZCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlQ2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsInBhcnNlVXNlciIsImlkIiwiZ2V0UmVxdWVzdE9iamVjdCIsImlzQ2hhbGxlbmdlIiwidmFsaWRhdG9yIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJ2YWxpZGF0b3JSZXNwb25zZSIsImxvZ2dlciIsImFjYyIsInNvcnQiLCJhdXRoQWRhcHRlciIsImNoYWxsZW5nZSIsInByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UiLCJyZXNvbHZlRXJyb3IiLCJ1c2VyU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImF1dGhlbnRpY2F0aW9uU3RlcCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIiwiZXhwb3J0cyIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvVXNlcnNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQge1xuICBtYXliZVJ1blRyaWdnZXIsXG4gIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyxcbiAgZ2V0UmVxdWVzdE9iamVjdCxcbiAgcmVzb2x2ZUVycm9yLFxuICBpbmZsYXRlLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IHsgY3JlYXRlU2FuaXRpemVkRXJyb3IgfSBmcm9tICcuLi9FcnJvcic7XG5pbXBvcnQgeyBhcHBseUF1dGhEYXRhT3B0aW1pc3RpY0xvY2sgfSBmcm9tICcuLi9BdXRoRGF0YUxvY2snO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keSB8fCB7fTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5LCB7fSwgQXV0aC5tYWludGVuYW5jZShyZXEuY29uZmlnKSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgLy8gUGVyZm9ybSBhIGR1bW15IGJjcnlwdCBjb21wYXJlIHRvIG5vcm1hbGl6ZSByZXNwb25zZSB0aW1pbmcsXG4gICAgICAgICAgICAvLyBwcmV2ZW50aW5nIHVzZXIgZW51bWVyYXRpb24gdmlhIHRpbWluZyBzaWRlLWNoYW5uZWxcbiAgICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0b1xuICAgICAgICAgICAgICAuY29tcGFyZShwYXNzd29yZCwgcGFzc3dvcmRDcnlwdG8uZHVtbXlIYXNoKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodHlwZW9mIHVzZXIucGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8IHVzZXIucGFzc3dvcmQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAvLyBQYXNzd29yZGxlc3MgYWNjb3VudCAoZS5nLiBPQXV0aC1vbmx5KTogcnVuIGR1bW15IGNvbXBhcmUgZm9yXG4gICAgICAgICAgICAvLyB0aW1pbmcgbm9ybWFsaXphdGlvbiwgZGlzY2FyZCByZXN1bHQsIGFsd2F5cyByZWplY3RcbiAgICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCBwYXNzd29yZENyeXB0by5kdW1teUhhc2gpLnRoZW4oKCkgPT4gZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ3JlYXRlIHJlcXVlc3Qgb2JqZWN0IGZvciB2ZXJpZmljYXRpb24gZnVuY3Rpb25zXG4gICAgICAgICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgICAgICAgIG1hc3RlcjogcmVxLmF1dGguaXNNYXN0ZXIsXG4gICAgICAgICAgICBpcDogcmVxLmNvbmZpZy5pcCxcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIG9iamVjdDogUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gSWYgcmVxdWVzdCBkb2Vzbid0IHVzZSBtYXN0ZXIgb3IgbWFpbnRlbmFuY2Uga2V5IHdpdGggaWdub3JpbmcgZW1haWwgdmVyaWZpY2F0aW9uXG4gICAgICAgICAgaWYgKCEoKHJlcS5hdXRoLmlzTWFzdGVyIHx8IHJlcS5hdXRoLmlzTWFpbnRlbmFuY2UpICYmIGlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uKSkge1xuXG4gICAgICAgICAgICAvLyBHZXQgdmVyaWZpY2F0aW9uIGNvbmRpdGlvbnMgd2hpY2ggY2FuIGJlIGJvb2xlYW5zIG9yIGZ1bmN0aW9uczsgdGhlIHB1cnBvc2Ugb2YgdGhpcyBhc3luYy9hd2FpdFxuICAgICAgICAgICAgLy8gc3RydWN0dXJlIGlzIHRvIGF2b2lkIHVubmVjZXNzYXJpbHkgZXhlY3V0aW5nIHN1YnNlcXVlbnQgZnVuY3Rpb25zIGlmIHByZXZpb3VzIG9uZXMgZmFpbCBpbiB0aGVcbiAgICAgICAgICAgIC8vIGNvbmRpdGlvbmFsIHN0YXRlbWVudCBiZWxvdywgYXMgYSBkZXZlbG9wZXIgbWF5IGRlY2lkZSB0byBleGVjdXRlIGV4cGVuc2l2ZSBvcGVyYXRpb25zIGluIHRoZW1cbiAgICAgICAgICAgIGNvbnN0IHZlcmlmeVVzZXJFbWFpbHMgPSBhc3luYyAoKSA9PiByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09IHRydWUgfHwgKHR5cGVvZiByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyhyZXF1ZXN0KSkgPT09IHRydWUpO1xuICAgICAgICAgICAgY29uc3QgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9IGFzeW5jICgpID0+IHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9PT0gdHJ1ZSB8fCAodHlwZW9mIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9PT0gJ2Z1bmN0aW9uJyAmJiBhd2FpdCBQcm9taXNlLnJlc29sdmUocmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgICAgICAgICBpZiAoYXdhaXQgdmVyaWZ5VXNlckVtYWlscygpICYmIGF3YWl0IHByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwoKSAmJiAhdXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLCByZXEuY29uZmlnKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIC8vIFF1ZXJ5IHRoZSBzZXNzaW9uIHdpdGggbWFzdGVyIGtleSB0byB2YWxpZGF0ZSB0aGUgc2Vzc2lvbiB0b2tlbixcbiAgICAvLyBidXQgZG8gTk9UIGluY2x1ZGUgJ3VzZXInIHRvIGF2b2lkIGxlYWtpbmcgdXNlciBkYXRhIHZpYSBtYXN0ZXIgY29udGV4dFxuICAgIGNvbnN0IHNlc3Npb25SZXNwb25zZSA9IGF3YWl0IHJlc3QuZmluZChcbiAgICAgIHJlcS5jb25maWcsXG4gICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICdfU2Vzc2lvbicsXG4gICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAge30sXG4gICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgKTtcbiAgICBpZiAoXG4gICAgICAhc2Vzc2lvblJlc3BvbnNlLnJlc3VsdHMgfHxcbiAgICAgIHNlc3Npb25SZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8XG4gICAgICAhc2Vzc2lvblJlc3BvbnNlLnJlc3VsdHNbMF0udXNlclxuICAgICkge1xuICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJywgcmVxLmNvbmZpZyk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJJZCA9IHNlc3Npb25SZXNwb25zZS5yZXN1bHRzWzBdLnVzZXIub2JqZWN0SWQ7XG4gICAgLy8gUmUtZmV0Y2ggdGhlIHVzZXIgd2l0aCB0aGUgY2FsbGVyJ3MgYXV0aCBjb250ZXh0IHNvIHRoYXRcbiAgICAvLyBwcm90ZWN0ZWRGaWVsZHMsIENMUCwgYW5kIGF1dGggYWRhcHRlciBhZnRlckZpbmQgYXBwbHkgY29ycmVjdGx5XG4gICAgY29uc3QgdXNlclJlc3BvbnNlID0gYXdhaXQgcmVzdC5nZXQoXG4gICAgICByZXEuY29uZmlnLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICAnX1VzZXInLFxuICAgICAgdXNlcklkLFxuICAgICAge30sXG4gICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgKTtcbiAgICBpZiAoIXVzZXJSZXNwb25zZS5yZXN1bHRzIHx8IHVzZXJSZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLCByZXEuY29uZmlnKTtcbiAgICB9XG4gICAgY29uc3QgdXNlciA9IHVzZXJSZXNwb25zZS5yZXN1bHRzWzBdO1xuICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGF1dGhEYXRhID0gcmVxLmJvZHkgJiYgcmVxLmJvZHkuYXV0aERhdGE7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBoYXMgcHJvdmlkZWQgdGhlaXIgcmVxdWlyZWQgYXV0aCBwcm92aWRlcnNcbiAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICByZXEsXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXIuYXV0aERhdGEsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGxldCBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIGxldCB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIC8vIFJ1biB0aGUgYWRhcHRlcnMnIGBiZWZvcmVGaW5kYCAodGhlIGNyZWRlbnRpYWwgY2hlY2sgZm9yIGNvZGUtYmFzZWQgYWRhcHRlcnMpIGFzIHRoZVxuICAgICAgLy8gc2lnbnVwL2xpbmsgcGF0aCBkb2VzLCBhbmQgcmVqZWN0IGFuIGlkZW50aXR5IGFscmVhZHkgbGlua2VkIHRvIGFub3RoZXIgdXNlclxuICAgICAgY29uc3QgbGlua2VkVXNlcnMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSwgdHJ1ZSk7XG4gICAgICBpZiAobGlua2VkVXNlcnMuc29tZShsaW5rZWRVc2VyID0+IGxpbmtlZFVzZXIub2JqZWN0SWQgIT09IHVzZXIub2JqZWN0SWQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICAgIGF1dGhEYXRhLFxuICAgICAgICBuZXcgUmVzdFdyaXRlKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgICAgcmVxLmJvZHkgfHwge30sXG4gICAgICAgICAgdXNlcixcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICksXG4gICAgICAgIHVzZXJcbiAgICAgICk7XG4gICAgICBhdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB2YWxpZGF0ZWRBdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICB7IHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICk7IH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIGF3YWl0IHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZyxcbiAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICApO1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBzb21lIG5ldyB2YWxpZGF0ZWQgYXV0aERhdGEgdXBkYXRlIGRpcmVjdGx5XG4gICAgaWYgKHZhbGlkYXRlZEF1dGhEYXRhICYmIE9iamVjdC5rZXlzKHZhbGlkYXRlZEF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0geyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9O1xuICAgICAgLy8gUHJldmVudCBjb25jdXJyZW50IHJlcXVlc3RzIGZyb20gYm90aCBzdWNjZWVkaW5nIHdoZW4gY29uc3VtaW5nIHNpbmdsZS11c2VcbiAgICAgIC8vIHRva2VucyAoZS5nLiBNRkEgcmVjb3ZlcnkgY29kZXMgb3IgU01TIE9UUCB0b2tlbnMpIGJ5IGV4dGVuZGluZyB0aGUgdXBkYXRlXG4gICAgICAvLyBXSEVSRSBjbGF1c2Ugd2l0aCB0aGUgb3JpZ2luYWwgdmFsdWVzIG9mIGNoYW5nZWQgcHJpbWl0aXZlL2FycmF5IGZpZWxkcy5cbiAgICAgIGFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayhxdWVyeSwgdXNlci5hdXRoRGF0YSwgdmFsaWRhdGVkQXV0aERhdGEpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoJ19Vc2VyJywgcXVlcnksIHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhIH0sIHt9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsICdJbnZhbGlkIGF1dGggZGF0YScpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWcsXG4gICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgKTtcblxuICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICB1c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIH1cbiAgICBhd2FpdCByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5ydW5BZnRlckZpbmQocmVxLCB1c2VyLmF1dGhEYXRhKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBhbGxvd3MgbWFzdGVyLWtleSBjbGllbnRzIHRvIGNyZWF0ZSB1c2VyIHNlc3Npb25zIHdpdGhvdXQgYWNjZXNzIHRvXG4gICAqIHVzZXIgY3JlZGVudGlhbHMuIFRoaXMgZW5hYmxlcyBzeXN0ZW1zIHRoYXQgY2FuIGF1dGhlbnRpY2F0ZSBhY2Nlc3MgYW5vdGhlclxuICAgKiB3YXkgKEFQSSBrZXksIGFwcCBhZG1pbmlzdHJhdG9ycykgdG8gYWN0IG9uIGEgdXNlcidzIGJlaGFsZi5cbiAgICpcbiAgICogV2UgY3JlYXRlIGEgbmV3IHNlc3Npb24gcmF0aGVyIHRoYW4gbG9va2luZyBmb3IgYW4gZXhpc3Rpbmcgc2Vzc2lvbjsgd2VcbiAgICogd2FudCB0aGlzIHRvIHdvcmsgaW4gc2l0dWF0aW9ucyB3aGVyZSB0aGUgdXNlciBpcyBsb2dnZWQgb3V0IG9uIGFsbFxuICAgKiBkZXZpY2VzLCBzaW5jZSB0aGlzIGNhbiBiZSB1c2VkIGJ5IGF1dG9tYXRlZCBzeXN0ZW1zIGFjdGluZyBvbiB0aGUgdXNlcidzXG4gICAqIGJlaGFsZi5cbiAgICpcbiAgICogRm9yIHRoZSBtb21lbnQsIHdlJ3JlIG9taXR0aW5nIGV2ZW50IGhvb2tzIGFuZCBsb2Nrb3V0IGNoZWNrcywgc2luY2VcbiAgICogaW1tZWRpYXRlIHVzZSBjYXNlcyBzdWdnZXN0IC9sb2dpbkFzIGNvdWxkIGJlIHVzZWQgZm9yIHNlbWFudGljYWxseVxuICAgKiBkaWZmZXJlbnQgcmVhc29ucyBmcm9tIC9sb2dpblxuICAgKi9cbiAgYXN5bmMgaGFuZGxlTG9nSW5BcyhyZXEpIHtcbiAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgJ21hc3RlciBrZXkgaXMgcmVxdWlyZWQnLFxuICAgICAgICByZXEuY29uZmlnXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocmVxLmF1dGguaXNSZWFkT25seSkge1xuICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIGxvZ2luIGFzIGFub3RoZXIgdXNlci5cIixcbiAgICAgICAgcmVxLmNvbmZpZ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VySWQgPSByZXEuYm9keT8udXNlcklkIHx8IHJlcS5xdWVyeS51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSxcbiAgICAgICAgJ3VzZXJJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCwgb3IgdW5kZWZpbmVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdXNlcklkIH0pO1xuICAgIGNvbnN0IHVzZXIgPSBxdWVyeVJlc3VsdHNbMF07XG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3VzZXIgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAnbWFzdGVya2V5JyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKGFzeW5jIHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG4gICAgICAgIGF3YWl0IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLnJ1bkFmdGVyRmluZChyZXEsIHVzZXIuYXV0aERhdGEpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgY29uc3QgcmVjb3JkcyA9IGF3YWl0IHJlc3QuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApO1xuICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IHJlc3QuZGVsKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApO1xuICAgICAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCByZWNvcmRzLnJlc3VsdHNbMF0pKSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIHJlcS5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1Y2Nlc3M7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMIHx8IHJlcS5jb25maWcuX3B1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb246IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQ6IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBsZXQgZW1haWwgPSByZXEuYm9keT8uZW1haWw7XG4gICAgY29uc3QgdG9rZW4gPSByZXEuYm9keT8udG9rZW47XG5cbiAgICBpZiAoIWVtYWlsICYmICF0b2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuXG4gICAgaWYgKHRva2VuICYmIHR5cGVvZiB0b2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLCAndG9rZW4gbXVzdCBiZSBhIHN0cmluZycpO1xuICAgIH1cblxuICAgIGxldCB1c2VyUmVzdWx0cyA9IG51bGw7XG4gICAgbGV0IHVzZXJEYXRhID0gbnVsbDtcblxuICAgIC8vIFdlIGNhbiBmaW5kIHRoZSB1c2VyIHVzaW5nIHRva2VuXG4gICAgaWYgKHRva2VuKSB7XG4gICAgICB1c2VyUmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7XG4gICAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB0b2tlbixcbiAgICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyAkbHQ6IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHVzZXJSZXN1bHRzPy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHVzZXJEYXRhID0gdXNlclJlc3VsdHNbMF07XG4gICAgICAgIGlmICh1c2VyRGF0YS5lbWFpbCkge1xuICAgICAgICAgIGVtYWlsID0gdXNlckRhdGEuZW1haWw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAvLyBPciB1c2luZyBlbWFpbCBpZiBubyB0b2tlbiBwcm92aWRlZFxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGVtYWlsID09PSAnc3RyaW5nJykge1xuICAgICAgdXNlclJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgJG9yOiBbeyBlbWFpbCB9LCB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSB9XSB9LFxuICAgICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICAgIEF1dGgubWFpbnRlbmFuY2UocmVxLmNvbmZpZylcbiAgICAgICk7XG4gICAgICBpZiAodXNlclJlc3VsdHM/Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgdXNlckRhdGEgPSB1c2VyUmVzdWx0c1swXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodXNlckRhdGEpIHtcbiAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlckRhdGEpO1xuICAgICAgLy8gR2V0IGZpbGVzIGF0dGFjaGVkIHRvIHVzZXJcbiAgICAgIGF3YWl0IHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlckRhdGEpO1xuXG4gICAgICBjb25zdCB1c2VyID0gaW5mbGF0ZSgnX1VzZXInLCB1c2VyRGF0YSk7XG5cbiAgICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZVBhc3N3b3JkUmVzZXRSZXF1ZXN0LFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgdXNlcixcbiAgICAgICAgbnVsbCxcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeT8ucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCA/PyB0cnVlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGVyci5tZXNzYWdlID0gYEEgdXNlciB3aXRoIHRoYXQgZW1haWwgZG9lcyBub3QgZXhpc3QuYDtcbiAgICAgIH1cbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH1cblxuICBhc3luYyBoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keSB8fCB7fTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgdmVyaWZ5RW1haWxTdWNjZXNzT25JbnZhbGlkRW1haWwgPSByZXEuY29uZmlnLmVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsID8/IHRydWU7XG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0sIHt9LCBBdXRoLm1haW50ZW5hbmNlKHJlcS5jb25maWcpKTtcbiAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgaWYgKHZlcmlmeUVtYWlsU3VjY2Vzc09uSW52YWxpZEVtYWlsKSB7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgYE5vIHVzZXIgZm91bmQgd2l0aCBlbWFpbCAke2VtYWlsfWApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgIC8vIHJlbW92ZSBwYXNzd29yZCBmaWVsZCwgbWVzc2VzIHdpdGggc2F2aW5nIG9uIHBvc3RncmVzXG4gICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICBpZiAodmVyaWZ5RW1haWxTdWNjZXNzT25JbnZhbGlkRW1haWwpIHtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICB9XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGBFbWFpbCAke2VtYWlsfSBpcyBhbHJlYWR5IHZlcmlmaWVkLmApO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICBjb25zdCBzZW5kID0gYXdhaXQgdXNlckNvbnRyb2xsZXIucmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4odXNlciwgcmVxLmF1dGguaXNNYXN0ZXIsIHJlcS5hdXRoLmluc3RhbGxhdGlvbklkLCByZXEuaXApO1xuICAgIGlmIChzZW5kKSB7XG4gICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlciwgcmVxKTtcbiAgICB9XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gIH1cblxuICBhc3luYyBoYW5kbGVDaGFsbGVuZ2UocmVxKSB7XG4gICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkLCBhdXRoRGF0YSwgY2hhbGxlbmdlRGF0YSB9ID0gcmVxLmJvZHkgfHwge307XG5cbiAgICAvLyBpZiB1c2VybmFtZSBvciBlbWFpbCBwcm92aWRlZCB3aXRoIHBhc3N3b3JkIHRyeSB0byBhdXRoZW50aWNhdGUgdGhlIHVzZXIgYnkgdXNlcm5hbWVcbiAgICBsZXQgdXNlcjtcbiAgICBpZiAodXNlcm5hbWUgfHwgZW1haWwpIHtcbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgcHJvdmlkZWQgdXNlcm5hbWUgb3IgZW1haWwsIHlvdSBuZWVkIHRvIGFsc28gcHJvdmlkZSBwYXNzd29yZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgfVxuXG4gICAgaWYgKCFjaGFsbGVuZ2VEYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdOb3RoaW5nIHRvIGNoYWxsZW5nZS4nKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGNoYWxsZW5nZURhdGEgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdjaGFsbGVuZ2VEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgfVxuXG4gICAgbGV0IHJlcXVlc3Q7XG4gICAgbGV0IHBhcnNlVXNlcjtcblxuICAgIC8vIFRyeSB0byBmaW5kIHVzZXIgYnkgYXV0aERhdGFcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGlmICh0eXBlb2YgYXV0aERhdGEgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgICB9XG4gICAgICBpZiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcHJvdmlkZSB1c2VybmFtZS9lbWFpbCBhbmQgYXV0aERhdGEsIG9ubHkgdXNlIG9uZSBpZGVudGlmaWNhdGlvbiBtZXRob2QuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbHRlcihrZXkgPT4gYXV0aERhdGFba2V5XS5pZCkubGVuZ3RoID4gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcHJvdmlkZSBtb3JlIHRoYW4gb25lIGF1dGhEYXRhIHByb3ZpZGVyIHdpdGggYW4gaWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBSdW4gYGJlZm9yZUZpbmRgIHNvIGEgYmFyZSBjbGllbnQtc3VwcGxpZWQgcHJvdmlkZXIgaWQgY2Fubm90IHNlbGVjdCB0aGUgdXNlclxuICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEocmVxLmNvbmZpZywgYXV0aERhdGEsIHRydWUpO1xuICAgICAgICBpZiAoIXJlc3VsdHNbMF0gfHwgcmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBGaW5kIHRoZSBwcm92aWRlciB1c2VkIHRvIGZpbmQgdGhlIHVzZXJcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmluZChrZXkgPT4gYXV0aERhdGFba2V5XS5pZCk7XG5cbiAgICAgICAgcGFyc2VVc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4ucmVzdWx0c1swXSB9KTtcbiAgICAgICAgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgcGFyc2VVc2VyLCBwYXJzZVVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICAgICAgLy8gVmFsaWRhdGUgYXV0aERhdGEgdXNlZCB0byBpZGVudGlmeSB0aGUgdXNlciB0byBhdm9pZCBicnV0ZS1mb3JjZSBhdHRhY2sgb24gYGlkYFxuICAgICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBjb25zdCB2YWxpZGF0b3JSZXNwb25zZSA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgcGFyc2VVc2VyLCByZXF1ZXN0KTtcbiAgICAgICAgaWYgKHZhbGlkYXRvclJlc3BvbnNlICYmIHZhbGlkYXRvclJlc3BvbnNlLnZhbGlkYXRvcikge1xuICAgICAgICAgIGF3YWl0IHZhbGlkYXRvclJlc3BvbnNlLnZhbGlkYXRvcigpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIFJld3JpdGUgdGhlIGVycm9yIHRvIGF2b2lkIGd1ZXNzIGlkIGF0dGFja1xuICAgICAgICBsb2dnZXIuZXJyb3IoZSk7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFwYXJzZVVzZXIpIHtcbiAgICAgIHBhcnNlVXNlciA9IHVzZXIgPyBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi51c2VyIH0pIDogdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGlmICghcmVxdWVzdCkge1xuICAgICAgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgcGFyc2VVc2VyLCBwYXJzZVVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgcmVxdWVzdC5pc0NoYWxsZW5nZSA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IGFjYyA9IHt9O1xuICAgIC8vIEV4ZWN1dGUgY2hhbGxlbmdlIHN0ZXAtYnktc3RlcCB3aXRoIGNvbnNpc3RlbnQgb3JkZXIgZm9yIGJldHRlciBlcnJvciBmZWVkYmFja1xuICAgIC8vIGFuZCB0byBhdm9pZCB0byB0cmlnZ2VyIG90aGVycyBjaGFsbGVuZ2VzIGlmIG9uZSBvZiB0aGVtIGZhaWxzXG4gICAgZm9yIChjb25zdCBwcm92aWRlciBvZiBPYmplY3Qua2V5cyhjaGFsbGVuZ2VEYXRhKS5zb3J0KCkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGF1dGhBZGFwdGVyID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBpZiAoIWF1dGhBZGFwdGVyKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgIGFkYXB0ZXI6IHsgY2hhbGxlbmdlIH0sXG4gICAgICAgIH0gPSBhdXRoQWRhcHRlcjtcbiAgICAgICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBjb25zdCBwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlID0gYXdhaXQgY2hhbGxlbmdlKFxuICAgICAgICAgICAgY2hhbGxlbmdlRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICBhdXRoRGF0YSAmJiBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXEuY29uZmlnLmF1dGhbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcmVxdWVzdFxuICAgICAgICAgICk7XG4gICAgICAgICAgYWNjW3Byb3ZpZGVyXSA9IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgfHwgdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnQ2hhbGxlbmdlIGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgdXNlclN0cmluZyA9IHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xuICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCBjaGFsbGVuZ2UgZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6ICdjaGFsbGVuZ2UnLFxuICAgICAgICAgICAgZXJyb3I6IGUsXG4gICAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgICAgcHJvdmlkZXIsXG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4geyByZXNwb25zZTogeyBjaGFsbGVuZ2VEYXRhOiBhY2MgfSB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbkFzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luQXMocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2NoYWxsZW5nZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDaGFsbGVuZ2UocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBRUEsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsZUFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUcsY0FBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksS0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssS0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sU0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8sU0FBQSxHQUFBUCxPQUFBO0FBT0EsSUFBQVEsWUFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsVUFBQSxHQUFBVixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVUsT0FBQSxHQUFBVixPQUFBO0FBQ0EsSUFBQVcsTUFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksYUFBQSxHQUFBWixPQUFBO0FBQThE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