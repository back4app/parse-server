"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _logger = require("./logger");
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _RestWrite = _interopRequireDefault(require("./RestWrite"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const Parse = require('parse/node');
// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isMaintenance = false,
  isReadOnly = false,
  user,
  installationId
}) {
  this.config = config;
  this.cacheController = cacheController || config && config.cacheController;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.isMaintenance = isMaintenance;
  this.user = user;
  this.isReadOnly = isReadOnly;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.isUnauthenticated = function () {
  if (this.isMaster) {
    return false;
  }
  if (this.isMaintenance) {
    return false;
  }
  if (this.user) {
    return false;
  }
  return true;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth({
    config,
    isMaster: true
  });
}

// A helper to get a maintenance-level Auth object
function maintenance(config) {
  return new Auth({
    config,
    isMaintenance: true
  });
}

// A helper to get a master-level Auth object
function readOnly(config) {
  return new Auth({
    config,
    isMaster: true,
    isReadOnly: true
  });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({
    config,
    isMaster: false
  });
}

/**
 * Checks whether session should be updated based on last update time & session length.
 */
function shouldUpdateSessionExpiry(config, session) {
  const resetAfter = config.sessionLength / 2;
  const lastUpdated = new Date(session === null || session === void 0 ? void 0 : session.updatedAt);
  const skipRange = new Date();
  skipRange.setTime(skipRange.getTime() - resetAfter * 1000);
  return lastUpdated <= skipRange;
}
const throttle = {};
const renewSessionIfNeeded = async ({
  config,
  session,
  sessionToken
}) => {
  if (!(config !== null && config !== void 0 && config.extendSessionOnUse)) {
    return;
  }
  clearTimeout(throttle[sessionToken]);
  throttle[sessionToken] = setTimeout(async () => {
    try {
      if (!session) {
        const query = await (0, _RestQuery.default)({
          method: _RestQuery.default.Method.get,
          config,
          auth: master(config),
          runBeforeFind: false,
          className: '_Session',
          restWhere: {
            sessionToken
          },
          restOptions: {
            limit: 1
          }
        });
        const {
          results
        } = await query.execute();
        session = results[0];
      }
      if (!shouldUpdateSessionExpiry(config, session) || !session) {
        return;
      }
      const expiresAt = config.generateSessionExpiresAt();
      await new _RestWrite.default(config, master(config), '_Session', {
        objectId: session.objectId
      }, {
        expiresAt: Parse._encode(expiresAt)
      }).execute();
    } catch (e) {
      if ((e === null || e === void 0 ? void 0 : e.code) !== Parse.Error.OBJECT_NOT_FOUND) {
        _logger.logger.error('Could not update session expiry: ', e);
      }
    }
  }, 500);
};

// Returns a promise that resolves to an Auth object
const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId
}) {
  cacheController = cacheController || config && config.cacheController;
  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      renewSessionIfNeeded({
        config,
        sessionToken
      });
      return Promise.resolve(new Auth({
        config,
        cacheController,
        isMaster: false,
        installationId,
        user: cachedUser
      }));
    }
  }
  let results;
  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user'
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.get,
      config,
      runBeforeFind: false,
      auth: master(config),
      className: '_Session',
      restWhere: {
        sessionToken
      },
      restOptions
    });
    results = (await query.execute()).results;
  } else {
    results = (await new Parse.Query(Parse.Session).limit(1).include('user').equalTo('sessionToken', sessionToken).find({
      useMasterKey: true
    })).map(obj => obj.toJSON());
  }
  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }
  const session = results[0];
  const now = new Date(),
    expiresAt = session.expiresAt ? new Date(session.expiresAt.iso) : undefined;
  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }
  const obj = session.user;
  if (typeof obj['objectId'] === 'string' && obj['objectId'].startsWith('role:')) {
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Invalid object ID.');
  }
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;
  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }
  renewSessionIfNeeded({
    config,
    session,
    sessionToken
  });
  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject
  });
};
var getAuthForLegacySessionToken = async function ({
  config,
  sessionToken,
  installationId
}) {
  var restOptions = {
    limit: 1
  };
  const RestQuery = require('./RestQuery');
  var query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    runBeforeFind: false,
    auth: master(config),
    className: '_User',
    restWhere: {
      _session_token: sessionToken
    },
    restOptions
  });
  return query.execute().then(response => {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    const obj = results[0];
    obj.className = '_User';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({
      config,
      isMaster: false,
      installationId,
      user: userObject
    });
  });
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || this.isMaintenance || !this.user) {
    return Promise.resolve([]);
  }
  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }
  if (this.rolePromise) {
    return this.rolePromise;
  }
  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};
Auth.prototype.getRolesForUser = async function () {
  //Stack all Parse.Role
  const results = [];
  if (this.config) {
    const restWhere = {
      users: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.user.id
      }
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      runBeforeFind: false,
      config: this.config,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
  } else {
    await new Parse.Query(Parse.Role).equalTo('users', this.user).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  }
  return results;
};

// Iterates through the role tree and compiles a user's roles
Auth.prototype._loadRoles = async function () {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);
    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  }

  // First get the role ids this user is directly a member of
  const results = await this.getRolesForUser();
  if (!results.length) {
    this.userRoles = [];
    this.fetchedRoles = true;
    this.rolePromise = null;
    this.cacheRoles();
    return this.userRoles;
  }
  const rolesMap = results.reduce((m, r) => {
    m.names.push(r.name);
    m.ids.push(r.objectId);
    return m;
  }, {
    ids: [],
    names: []
  });

  // run the recursive finding
  const roleNames = await this._getAllRolesNamesForRoleIds(rolesMap.ids, rolesMap.names);
  this.userRoles = roleNames.map(r => {
    return 'role:' + r;
  });
  this.fetchedRoles = true;
  this.rolePromise = null;
  this.cacheRoles();
  return this.userRoles;
};
Auth.prototype.cacheRoles = function () {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.put(this.user.id, Array(...this.userRoles));
  return true;
};
Auth.prototype.clearRoleCache = function (sessionToken) {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.del(this.user.id);
  this.cacheController.user.del(sessionToken);
  return true;
};
Auth.prototype.getRolesByIds = async function (ins) {
  const results = [];
  // Build an OR query across all parentRoles
  if (!this.config) {
    await new Parse.Query(Parse.Role).containedIn('roles', ins.map(id => {
      const role = new Parse.Object(Parse.Role);
      role.id = id;
      return role;
    })).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id
      };
    });
    const restWhere = {
      roles: {
        $in: roles
      }
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      config: this.config,
      runBeforeFind: false,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
  }
  return results;
};

// Given a list of roleIds, find all the parent roles, returns a promise with all names
Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  });

  // all roles are accounted for, return the names
  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }
  return this.getRolesByIds(ins).then(results => {
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    }
    // Map the results with all Ids and names
    const resultMap = results.reduce((memo, role) => {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, {
      ids: [],
      names: []
    });
    // store the new found names
    names = names.concat(resultMap.names);
    // find the next ones, circular roles will be cut
    return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
  }).then(names => {
    return Promise.resolve([...new Set(names)]);
  });
};
const findUsersWithAuthData = (config, authData) => {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider] || authData && !authData[provider].id) {
      return memo;
    }
    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  return query.length > 0 ? config.database.find('_User', {
    $or: query
  }, {
    limit: 2
  }) : Promise.resolve([]);
};
const hasMutatedAuthData = (authData, userAuthData) => {
  if (!userAuthData) {
    return {
      hasMutatedAuthData: true,
      mutatedAuthData: authData
    };
  }
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') {
      return;
    }
    const providerData = authData[provider];
    const userProviderAuthData = userAuthData[provider];
    if (!(0, _util.isDeepStrictEqual)(providerData, userProviderAuthData)) {
      mutatedAuthData[provider] = providerData;
    }
  });
  const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
  return {
    hasMutatedAuthData,
    mutatedAuthData
  };
};
const checkIfUserHasProvidedConfiguredProvidersForLogin = (req = {}, authData = {}, userAuthData = {}, config) => {
  const savedUserProviders = Object.keys(userAuthData).map(provider => ({
    name: provider,
    adapter: config.authDataManager.getValidatorForProvider(provider).adapter
  }));
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]);

  // Solo providers can be considered as safe, so we do not have to check if the user needs
  // to provide an additional provider to login. An auth adapter with "solo" (like webauthn) means
  // no "additional" auth needs to be provided to login (like OTP, MFA)
  if (hasProvidedASoloProvider) {
    return;
  }
  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    let policy = provider.adapter.policy;
    if (typeof policy === 'function') {
      const requestObject = {
        ip: req.config.ip,
        user: req.auth.user,
        master: req.auth.isMaster
      };
      policy = policy.call(provider.adapter, requestObject, userAuthData[provider.name]);
    }
    if (policy === 'additional') {
      if (authData[provider.name]) {
        return true;
      } else {
        // Push missing provider for error message
        additionProvidersNotFound.push(provider.name);
      }
    }
  });
  if (hasProvidedAtLeastOneAdditionalProvider || !additionProvidersNotFound.length) {
    return;
  }
  throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Missing additional authData ${additionProvidersNotFound.join(',')}`);
};

// Validate each authData step-by-step and return the provider responses
const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;
  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser));
    // Find user by session and current objectId; only pass user if it's the current user or master key is provided
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId()) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({
      useMasterKey: true
    });
  }
  const {
    updatedObject
  } = req.buildParseObjects();
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, user, req.config);
  // Perform validation as step-by-step pipeline for better error consistency
  // and also to avoid to trigger a provider (like OTP SMS) if another one fails
  const acc = {
    authData: {},
    authDataResponse: {}
  };
  const authKeys = Object.keys(authData).sort();
  for (const provider of authKeys) {
    let method = '';
    try {
      if (authData[provider] === null) {
        acc.authData[provider] = null;
        continue;
      }
      const {
        validator
      } = req.config.authDataManager.getValidatorForProvider(provider);
      const authProvider = (req.config.auth || {})[provider] || {};
      if (!validator || authProvider.enabled === false) {
        throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
      }
      let validationResult = await validator(authData[provider], req, user, requestObject);
      method = validationResult && validationResult.method;
      requestObject.triggerName = method;
      if (validationResult && validationResult.validator) {
        validationResult = await validationResult.validator();
      }
      if (!validationResult) {
        acc.authData[provider] = authData[provider];
        continue;
      }
      if (!Object.keys(validationResult).length) {
        acc.authData[provider] = authData[provider];
        continue;
      }
      if (validationResult.response) {
        acc.authDataResponse[provider] = validationResult.response;
      }
      // Some auth providers after initialization will avoid to replace authData already stored
      if (!validationResult.doNotSave) {
        acc.authData[provider] = validationResult.save || authData[provider];
      }
    } catch (err) {
      const e = (0, _triggers.resolveError)(err, {
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Auth failed. Unknown error.'
      });
      const userString = req.auth && req.auth.user ? req.auth.user.id : req.data.objectId || undefined;
      _logger.logger.error(`Failed running auth step ${method} for ${provider} for user ${userString} with Error: ` + JSON.stringify(e), {
        authenticationStep: method,
        error: e,
        user: userString,
        provider
      });
      throw e;
    }
  }
  return acc;
};
module.exports = {
  Auth,
  master,
  maintenance,
  nobody,
  readOnly,
  shouldUpdateSessionExpiry,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIlBhcnNlIiwiQXV0aCIsImNvbmZpZyIsImNhY2hlQ29udHJvbGxlciIsInVuZGVmaW5lZCIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwibWFpbnRlbmFuY2UiLCJyZWFkT25seSIsIm5vYm9keSIsInNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkiLCJzZXNzaW9uIiwicmVzZXRBZnRlciIsInNlc3Npb25MZW5ndGgiLCJsYXN0VXBkYXRlZCIsIkRhdGUiLCJ1cGRhdGVkQXQiLCJza2lwUmFuZ2UiLCJzZXRUaW1lIiwiZ2V0VGltZSIsInRocm90dGxlIiwicmVuZXdTZXNzaW9uSWZOZWVkZWQiLCJzZXNzaW9uVG9rZW4iLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJjbGVhclRpbWVvdXQiLCJzZXRUaW1lb3V0IiwicXVlcnkiLCJSZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJnZXQiLCJhdXRoIiwicnVuQmVmb3JlRmluZCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwibGltaXQiLCJyZXN1bHRzIiwiZXhlY3V0ZSIsImV4cGlyZXNBdCIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsIlJlc3RXcml0ZSIsIm9iamVjdElkIiwiX2VuY29kZSIsImNvZGUiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJsb2dnZXIiLCJlcnJvciIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImNhY2hlZFVzZXIiLCJmcm9tSlNPTiIsIlByb21pc2UiLCJyZXNvbHZlIiwiaW5jbHVkZSIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJmaW5kIiwidXNlTWFzdGVyS2V5IiwibWFwIiwib2JqIiwidG9KU09OIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiaXNvIiwic3RhcnRzV2l0aCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInBhc3N3b3JkIiwicHV0IiwidXNlck9iamVjdCIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJfc2Vzc2lvbl90b2tlbiIsInRoZW4iLCJyZXNwb25zZSIsImdldFVzZXJSb2xlcyIsIl9sb2FkUm9sZXMiLCJnZXRSb2xlc0ZvclVzZXIiLCJ1c2VycyIsIl9fdHlwZSIsImlkIiwiZWFjaCIsInJlc3VsdCIsIlJvbGUiLCJjYWNoZWRSb2xlcyIsInJvbGUiLCJjYWNoZVJvbGVzIiwicm9sZXNNYXAiLCJyZWR1Y2UiLCJtIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJwcm92aWRlcnMiLCJwcm92aWRlciIsInF1ZXJ5S2V5IiwicSIsImRhdGFiYXNlIiwiJG9yIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwidXNlckF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXEiLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsInJlcXVlc3RPYmplY3QiLCJpcCIsIk9USEVSX0NBVVNFIiwiam9pbiIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsImZvdW5kVXNlciIsIlVzZXIiLCJnZXRVc2VySWQiLCJmZXRjaCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsImdldFJlcXVlc3RPYmplY3QiLCJhY2MiLCJhdXRoRGF0YVJlc3BvbnNlIiwiYXV0aEtleXMiLCJzb3J0IiwidmFsaWRhdG9yIiwiYXV0aFByb3ZpZGVyIiwiZW5hYmxlZCIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJ2YWxpZGF0aW9uUmVzdWx0IiwidHJpZ2dlck5hbWUiLCJkb05vdFNhdmUiLCJzYXZlIiwiZXJyIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VyU3RyaW5nIiwiZGF0YSIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0F1dGguanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCwgcmVzb2x2ZUVycm9yIH0gZnJvbSAnLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi9SZXN0V3JpdGUnO1xuXG4vLyBBbiBBdXRoIG9iamVjdCB0ZWxscyB5b3Ugd2hvIGlzIHJlcXVlc3Rpbmcgc29tZXRoaW5nIGFuZCB3aGV0aGVyXG4vLyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbi8vIHVzZXJPYmplY3QgaXMgYSBQYXJzZS5Vc2VyIGFuZCBjYW4gYmUgbnVsbCBpZiB0aGVyZSdzIG5vIHVzZXIuXG5mdW5jdGlvbiBBdXRoKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIgPSB1bmRlZmluZWQsXG4gIGlzTWFzdGVyID0gZmFsc2UsXG4gIGlzTWFpbnRlbmFuY2UgPSBmYWxzZSxcbiAgaXNSZWFkT25seSA9IGZhbHNlLFxuICB1c2VyLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgdGhpcy5pc01hc3RlciA9IGlzTWFzdGVyO1xuICB0aGlzLmlzTWFpbnRlbmFuY2UgPSBpc01haW50ZW5hbmNlO1xuICB0aGlzLnVzZXIgPSB1c2VyO1xuICB0aGlzLmlzUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXG4gIC8vIEFzc3VtaW5nIGEgdXNlcnMgcm9sZXMgd29uJ3QgY2hhbmdlIGR1cmluZyBhIHNpbmdsZSByZXF1ZXN0LCB3ZSdsbFxuICAvLyBvbmx5IGxvYWQgdGhlbSBvbmNlLlxuICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IGZhbHNlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbn1cblxuLy8gV2hldGhlciB0aGlzIGF1dGggY291bGQgcG9zc2libHkgbW9kaWZ5IHRoZSBnaXZlbiB1c2VyIGlkLlxuLy8gSXQgc3RpbGwgY291bGQgYmUgZm9yYmlkZGVuIHZpYSBBQ0xzIGV2ZW4gaWYgdGhpcyByZXR1cm5zIHRydWUuXG5BdXRoLnByb3RvdHlwZS5pc1VuYXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMuaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1haW50ZW5hbmNlLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYWludGVuYW5jZShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01haW50ZW5hbmNlOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIHJlYWRPbmx5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlLCBpc1JlYWRPbmx5OiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBub2JvZHktbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG5vYm9keShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogZmFsc2UgfSk7XG59XG5cbi8qKlxuICogQ2hlY2tzIHdoZXRoZXIgc2Vzc2lvbiBzaG91bGQgYmUgdXBkYXRlZCBiYXNlZCBvbiBsYXN0IHVwZGF0ZSB0aW1lICYgc2Vzc2lvbiBsZW5ndGguXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkoY29uZmlnLCBzZXNzaW9uKSB7XG4gIGNvbnN0IHJlc2V0QWZ0ZXIgPSBjb25maWcuc2Vzc2lvbkxlbmd0aCAvIDI7XG4gIGNvbnN0IGxhc3RVcGRhdGVkID0gbmV3IERhdGUoc2Vzc2lvbj8udXBkYXRlZEF0KTtcbiAgY29uc3Qgc2tpcFJhbmdlID0gbmV3IERhdGUoKTtcbiAgc2tpcFJhbmdlLnNldFRpbWUoc2tpcFJhbmdlLmdldFRpbWUoKSAtIHJlc2V0QWZ0ZXIgKiAxMDAwKTtcbiAgcmV0dXJuIGxhc3RVcGRhdGVkIDw9IHNraXBSYW5nZTtcbn1cblxuY29uc3QgdGhyb3R0bGUgPSB7fTtcbmNvbnN0IHJlbmV3U2Vzc2lvbklmTmVlZGVkID0gYXN5bmMgKHsgY29uZmlnLCBzZXNzaW9uLCBzZXNzaW9uVG9rZW4gfSkgPT4ge1xuICBpZiAoIWNvbmZpZz8uZXh0ZW5kU2Vzc2lvbk9uVXNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNsZWFyVGltZW91dCh0aHJvdHRsZVtzZXNzaW9uVG9rZW5dKTtcbiAgdGhyb3R0bGVbc2Vzc2lvblRva2VuXSA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgICAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgICAgIGNsYXNzTmFtZTogJ19TZXNzaW9uJyxcbiAgICAgICAgICByZXN0V2hlcmU6IHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgICAgcmVzdE9wdGlvbnM6IHsgbGltaXQ6IDEgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgICBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgICAgIH1cbiAgICAgIGlmICghc2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeShjb25maWcsIHNlc3Npb24pIHx8ICFzZXNzaW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgICAgIGF3YWl0IG5ldyBSZXN0V3JpdGUoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgbWFzdGVyKGNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHNlc3Npb24ub2JqZWN0SWQgfSxcbiAgICAgICAgeyBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSB9XG4gICAgICApLmV4ZWN1dGUoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZT8uY29kZSAhPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0NvdWxkIG5vdCB1cGRhdGUgc2Vzc2lvbiBleHBpcnk6ICcsIGUpO1xuICAgICAgfVxuICAgIH1cbiAgfSwgNTAwKTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gQXV0aCBvYmplY3RcbmNvbnN0IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlcixcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCB1c2VySlNPTiA9IGF3YWl0IGNhY2hlQ29udHJvbGxlci51c2VyLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmICh1c2VySlNPTikge1xuICAgICAgY29uc3QgY2FjaGVkVXNlciA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTih1c2VySlNPTik7XG4gICAgICByZW5ld1Nlc3Npb25JZk5lZWRlZCh7IGNvbmZpZywgc2Vzc2lvblRva2VuIH0pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICByZXN0V2hlcmU6IHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgICByZXN1bHRzID0gKGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKSkucmVzdWx0cztcbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzID0gKFxuICAgICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5saW1pdCgxKVxuICAgICAgICAuaW5jbHVkZSgndXNlcicpXG4gICAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pXG4gICAgKS5tYXAob2JqID0+IG9iai50b0pTT04oKSk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEgfHwgIXJlc3VsdHNbMF1bJ3VzZXInXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgfVxuICBjb25zdCBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSBzZXNzaW9uLmV4cGlyZXNBdCA/IG5ldyBEYXRlKHNlc3Npb24uZXhwaXJlc0F0LmlzbykgOiB1bmRlZmluZWQ7XG4gIGlmIChleHBpcmVzQXQgPCBub3cpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiBpcyBleHBpcmVkLicpO1xuICB9XG4gIGNvbnN0IG9iaiA9IHNlc3Npb24udXNlcjtcblxuICBpZiAodHlwZW9mIG9ialsnb2JqZWN0SWQnXSA9PT0gJ3N0cmluZycgJiYgb2JqWydvYmplY3RJZCddLnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnSW52YWxpZCBvYmplY3QgSUQuJyk7XG4gIH1cblxuICBkZWxldGUgb2JqLnBhc3N3b3JkO1xuICBvYmpbJ2NsYXNzTmFtZSddID0gJ19Vc2VyJztcbiAgb2JqWydzZXNzaW9uVG9rZW4nXSA9IHNlc3Npb25Ub2tlbjtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNhY2hlQ29udHJvbGxlci51c2VyLnB1dChzZXNzaW9uVG9rZW4sIG9iaik7XG4gIH1cbiAgcmVuZXdTZXNzaW9uSWZOZWVkZWQoeyBjb25maWcsIHNlc3Npb24sIHNlc3Npb25Ub2tlbiB9KTtcbiAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICByZXR1cm4gbmV3IEF1dGgoe1xuICAgIGNvbmZpZyxcbiAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIGluc3RhbGxhdGlvbklkLFxuICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gIH0pO1xufTtcblxudmFyIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoeyBjb25maWcsIHNlc3Npb25Ub2tlbiwgaW5zdGFsbGF0aW9uSWQgfSkge1xuICB2YXIgcmVzdE9wdGlvbnMgPSB7XG4gICAgbGltaXQ6IDEsXG4gIH07XG4gIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gIHZhciBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICBjb25maWcsXG4gICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgIHJlc3RXaGVyZTogeyBfc2Vzc2lvbl90b2tlbjogc2Vzc2lvblRva2VuIH0sXG4gICAgcmVzdE9wdGlvbnMsXG4gIH0pO1xuICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHZhciByZXN1bHRzID0gcmVzcG9uc2UucmVzdWx0cztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdpbnZhbGlkIGxlZ2FjeSBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF07XG4gICAgb2JqLmNsYXNzTmFtZSA9ICdfVXNlcic7XG4gICAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICAgIHJldHVybiBuZXcgQXV0aCh7XG4gICAgICBjb25maWcsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiByb2xlIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5nZXRVc2VyUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyIHx8IHRoaXMuaXNNYWludGVuYW5jZSB8fCAhdGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG4gIH1cbiAgaWYgKHRoaXMuZmV0Y2hlZFJvbGVzKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnVzZXJSb2xlcyk7XG4gIH1cbiAgaWYgKHRoaXMucm9sZVByb21pc2UpIHtcbiAgICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbiAgfVxuICB0aGlzLnJvbGVQcm9taXNlID0gdGhpcy5fbG9hZFJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNGb3JVc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvL1N0YWNrIGFsbCBQYXJzZS5Sb2xlXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgaWYgKHRoaXMuY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdFdoZXJlID0ge1xuICAgICAgdXNlcnM6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMudXNlci5pZCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgYXV0aDogbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICB9KTtcbiAgICBhd2FpdCBxdWVyeS5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0KSk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmNsZWFyUm9sZUNhY2hlID0gZnVuY3Rpb24gKHNlc3Npb25Ub2tlbikge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZGVsKHRoaXMudXNlci5pZCk7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb25Ub2tlbik7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNCeUlkcyA9IGFzeW5jIGZ1bmN0aW9uIChpbnMpIHtcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAvLyBCdWlsZCBhbiBPUiBxdWVyeSBhY3Jvc3MgYWxsIHBhcmVudFJvbGVzXG4gIGlmICghdGhpcy5jb25maWcpIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5jb250YWluZWRJbihcbiAgICAgICAgJ3JvbGVzJyxcbiAgICAgICAgaW5zLm1hcChpZCA9PiB7XG4gICAgICAgICAgY29uc3Qgcm9sZSA9IG5ldyBQYXJzZS5PYmplY3QoUGFyc2UuUm9sZSk7XG4gICAgICAgICAgcm9sZS5pZCA9IGlkO1xuICAgICAgICAgIHJldHVybiByb2xlO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByb2xlcyA9IGlucy5tYXAoaWQgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgfTtcbiAgICB9KTtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7IHJvbGVzOiB7ICRpbjogcm9sZXMgfSB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBtYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgcmVzdFdoZXJlLFxuICAgIH0pO1xuICAgIGF3YWl0IHF1ZXJ5LmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQpKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IChjb25maWcsIGF1dGhEYXRhKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0gfHwgKGF1dGhEYXRhICYmICFhdXRoRGF0YVtwcm92aWRlcl0uaWQpKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICByZXR1cm4gcXVlcnkubGVuZ3RoID4gMFxuICAgID8gY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyAkb3I6IHF1ZXJ5IH0sIHsgbGltaXQ6IDIgfSlcbiAgICA6IFByb21pc2UucmVzb2x2ZShbXSk7XG59O1xuXG5jb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSAoYXV0aERhdGEsIHVzZXJBdXRoRGF0YSkgPT4ge1xuICBpZiAoIXVzZXJBdXRoRGF0YSkgeyByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGE6IHRydWUsIG11dGF0ZWRBdXRoRGF0YTogYXV0aERhdGEgfTsgfVxuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHsgcmV0dXJuOyB9XG4gICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGNvbnN0IHVzZXJQcm92aWRlckF1dGhEYXRhID0gdXNlckF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBpZiAoIWlzRGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyRGF0YSwgdXNlclByb3ZpZGVyQXV0aERhdGEpKSB7XG4gICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgIH1cbiAgfSk7XG4gIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9O1xufTtcblxuY29uc3QgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiA9IChcbiAgcmVxID0ge30sXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZSwgc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZHNcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luLiBBbiBhdXRoIGFkYXB0ZXIgd2l0aCBcInNvbG9cIiAobGlrZSB3ZWJhdXRobikgbWVhbnNcbiAgLy8gbm8gXCJhZGRpdGlvbmFsXCIgYXV0aCBuZWVkcyB0byBiZSBwcm92aWRlZCB0byBsb2dpbiAobGlrZSBPVFAsIE1GQSlcbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGxldCBwb2xpY3kgPSBwcm92aWRlci5hZGFwdGVyLnBvbGljeTtcbiAgICBpZiAodHlwZW9mIHBvbGljeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgcmVxdWVzdE9iamVjdCA9IHtcbiAgICAgICAgaXA6IHJlcS5jb25maWcuaXAsXG4gICAgICAgIHVzZXI6IHJlcS5hdXRoLnVzZXIsXG4gICAgICAgIG1hc3RlcjogcmVxLmF1dGguaXNNYXN0ZXIsXG4gICAgICB9O1xuICAgICAgcG9saWN5ID0gcG9saWN5LmNhbGwocHJvdmlkZXIuYWRhcHRlciwgcmVxdWVzdE9iamVjdCwgdXNlckF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdKTtcbiAgICB9XG4gICAgaWYgKHBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAtYnktc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdElkOyBvbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IHVzZXIgb3IgbWFzdGVyIGtleSBpcyBwcm92aWRlZFxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCB7IHVwZGF0ZWRPYmplY3QgfSA9IHJlcS5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCB1cGRhdGVkT2JqZWN0LCB1c2VyLCByZXEuY29uZmlnKTtcbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAtYnktc3RlcCBwaXBlbGluZSBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5XG4gIC8vIGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKSBpZiBhbm90aGVyIG9uZSBmYWlsc1xuICBjb25zdCBhY2MgPSB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfTtcbiAgY29uc3QgYXV0aEtleXMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuc29ydCgpO1xuICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGF1dGhLZXlzKSB7XG4gICAgbGV0IG1ldGhvZCA9ICcnO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoIXZhbGlkYXRvciB8fCBhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCB1c2VyLCByZXF1ZXN0T2JqZWN0KTtcbiAgICAgIG1ldGhvZCA9IHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC5tZXRob2Q7XG4gICAgICByZXF1ZXN0T2JqZWN0LnRyaWdnZXJOYW1lID0gbWV0aG9kO1xuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IpIHtcbiAgICAgICAgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKCk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2UpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIC8vIFNvbWUgYXV0aCBwcm92aWRlcnMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gd2lsbCBhdm9pZCB0byByZXBsYWNlIGF1dGhEYXRhIGFscmVhZHkgc3RvcmVkXG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ0F1dGggZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPVxuICAgICAgICByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHJlcS5kYXRhLm9iamVjdElkIHx8IHVuZGVmaW5lZDtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCAke21ldGhvZH0gZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgIHtcbiAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6IG1ldGhvZCxcbiAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBBdXRoLFxuICBtYXN0ZXIsXG4gIG1haW50ZW5hbmNlLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFDQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxPQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxVQUFBLEdBQUFDLHNCQUFBLENBQUFKLE9BQUE7QUFDQSxJQUFBSyxVQUFB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