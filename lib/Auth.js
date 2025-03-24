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
const findUsersWithAuthData = async (config, authData, beforeFind) => {
  const providers = Object.keys(authData);
  const queries = await Promise.all(providers.map(async provider => {
    var _config$authDataManag;
    const providerAuthData = authData[provider];
    const adapter = (_config$authDataManag = config.authDataManager.getValidatorForProvider(provider)) === null || _config$authDataManag === void 0 ? void 0 : _config$authDataManag.adapter;
    if (beforeFind && typeof (adapter === null || adapter === void 0 ? void 0 : adapter.beforeFind) === 'function') {
      await adapter.beforeFind(providerAuthData);
    }
    if (!(providerAuthData !== null && providerAuthData !== void 0 && providerAuthData.id)) {
      return null;
    }
    return {
      [`authData.${provider}.id`]: providerAuthData.id
    };
  }));

  // Filter out null queries
  const validQueries = queries.filter(query => query !== null);
  if (!validQueries.length) {
    return [];
  }

  // Perform database query
  return config.database.find('_User', {
    $or: validQueries
  }, {
    limit: 2
  });
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
      } = req.config.authDataManager.getValidatorForProvider(provider) || {};
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIlBhcnNlIiwiQXV0aCIsImNvbmZpZyIsImNhY2hlQ29udHJvbGxlciIsInVuZGVmaW5lZCIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwibWFpbnRlbmFuY2UiLCJyZWFkT25seSIsIm5vYm9keSIsInNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkiLCJzZXNzaW9uIiwicmVzZXRBZnRlciIsInNlc3Npb25MZW5ndGgiLCJsYXN0VXBkYXRlZCIsIkRhdGUiLCJ1cGRhdGVkQXQiLCJza2lwUmFuZ2UiLCJzZXRUaW1lIiwiZ2V0VGltZSIsInRocm90dGxlIiwicmVuZXdTZXNzaW9uSWZOZWVkZWQiLCJzZXNzaW9uVG9rZW4iLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJjbGVhclRpbWVvdXQiLCJzZXRUaW1lb3V0IiwicXVlcnkiLCJSZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJnZXQiLCJhdXRoIiwicnVuQmVmb3JlRmluZCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwibGltaXQiLCJyZXN1bHRzIiwiZXhlY3V0ZSIsImV4cGlyZXNBdCIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsIlJlc3RXcml0ZSIsIm9iamVjdElkIiwiX2VuY29kZSIsImNvZGUiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJsb2dnZXIiLCJlcnJvciIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImNhY2hlZFVzZXIiLCJmcm9tSlNPTiIsIlByb21pc2UiLCJyZXNvbHZlIiwiaW5jbHVkZSIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJmaW5kIiwidXNlTWFzdGVyS2V5IiwibWFwIiwib2JqIiwidG9KU09OIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiaXNvIiwic3RhcnRzV2l0aCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInBhc3N3b3JkIiwicHV0IiwidXNlck9iamVjdCIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJfc2Vzc2lvbl90b2tlbiIsInRoZW4iLCJyZXNwb25zZSIsImdldFVzZXJSb2xlcyIsIl9sb2FkUm9sZXMiLCJnZXRSb2xlc0ZvclVzZXIiLCJ1c2VycyIsIl9fdHlwZSIsImlkIiwiZWFjaCIsInJlc3VsdCIsIlJvbGUiLCJjYWNoZWRSb2xlcyIsInJvbGUiLCJjYWNoZVJvbGVzIiwicm9sZXNNYXAiLCJyZWR1Y2UiLCJtIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJiZWZvcmVGaW5kIiwicHJvdmlkZXJzIiwicXVlcmllcyIsImFsbCIsInByb3ZpZGVyIiwiX2NvbmZpZyRhdXRoRGF0YU1hbmFnIiwicHJvdmlkZXJBdXRoRGF0YSIsImFkYXB0ZXIiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsInZhbGlkUXVlcmllcyIsImRhdGFiYXNlIiwiJG9yIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwidXNlckF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXEiLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsInJlcXVlc3RPYmplY3QiLCJpcCIsIk9USEVSX0NBVVNFIiwiam9pbiIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsImZvdW5kVXNlciIsIlVzZXIiLCJnZXRVc2VySWQiLCJmZXRjaCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsImdldFJlcXVlc3RPYmplY3QiLCJhY2MiLCJhdXRoRGF0YVJlc3BvbnNlIiwiYXV0aEtleXMiLCJzb3J0IiwidmFsaWRhdG9yIiwiYXV0aFByb3ZpZGVyIiwiZW5hYmxlZCIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJ2YWxpZGF0aW9uUmVzdWx0IiwidHJpZ2dlck5hbWUiLCJkb05vdFNhdmUiLCJzYXZlIiwiZXJyIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VyU3RyaW5nIiwiZGF0YSIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0F1dGguanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCwgcmVzb2x2ZUVycm9yIH0gZnJvbSAnLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi9SZXN0V3JpdGUnO1xuXG4vLyBBbiBBdXRoIG9iamVjdCB0ZWxscyB5b3Ugd2hvIGlzIHJlcXVlc3Rpbmcgc29tZXRoaW5nIGFuZCB3aGV0aGVyXG4vLyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbi8vIHVzZXJPYmplY3QgaXMgYSBQYXJzZS5Vc2VyIGFuZCBjYW4gYmUgbnVsbCBpZiB0aGVyZSdzIG5vIHVzZXIuXG5mdW5jdGlvbiBBdXRoKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIgPSB1bmRlZmluZWQsXG4gIGlzTWFzdGVyID0gZmFsc2UsXG4gIGlzTWFpbnRlbmFuY2UgPSBmYWxzZSxcbiAgaXNSZWFkT25seSA9IGZhbHNlLFxuICB1c2VyLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgdGhpcy5pc01hc3RlciA9IGlzTWFzdGVyO1xuICB0aGlzLmlzTWFpbnRlbmFuY2UgPSBpc01haW50ZW5hbmNlO1xuICB0aGlzLnVzZXIgPSB1c2VyO1xuICB0aGlzLmlzUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXG4gIC8vIEFzc3VtaW5nIGEgdXNlcnMgcm9sZXMgd29uJ3QgY2hhbmdlIGR1cmluZyBhIHNpbmdsZSByZXF1ZXN0LCB3ZSdsbFxuICAvLyBvbmx5IGxvYWQgdGhlbSBvbmNlLlxuICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IGZhbHNlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbn1cblxuLy8gV2hldGhlciB0aGlzIGF1dGggY291bGQgcG9zc2libHkgbW9kaWZ5IHRoZSBnaXZlbiB1c2VyIGlkLlxuLy8gSXQgc3RpbGwgY291bGQgYmUgZm9yYmlkZGVuIHZpYSBBQ0xzIGV2ZW4gaWYgdGhpcyByZXR1cm5zIHRydWUuXG5BdXRoLnByb3RvdHlwZS5pc1VuYXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMuaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1haW50ZW5hbmNlLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYWludGVuYW5jZShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01haW50ZW5hbmNlOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIHJlYWRPbmx5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlLCBpc1JlYWRPbmx5OiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBub2JvZHktbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG5vYm9keShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogZmFsc2UgfSk7XG59XG5cbi8qKlxuICogQ2hlY2tzIHdoZXRoZXIgc2Vzc2lvbiBzaG91bGQgYmUgdXBkYXRlZCBiYXNlZCBvbiBsYXN0IHVwZGF0ZSB0aW1lICYgc2Vzc2lvbiBsZW5ndGguXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkoY29uZmlnLCBzZXNzaW9uKSB7XG4gIGNvbnN0IHJlc2V0QWZ0ZXIgPSBjb25maWcuc2Vzc2lvbkxlbmd0aCAvIDI7XG4gIGNvbnN0IGxhc3RVcGRhdGVkID0gbmV3IERhdGUoc2Vzc2lvbj8udXBkYXRlZEF0KTtcbiAgY29uc3Qgc2tpcFJhbmdlID0gbmV3IERhdGUoKTtcbiAgc2tpcFJhbmdlLnNldFRpbWUoc2tpcFJhbmdlLmdldFRpbWUoKSAtIHJlc2V0QWZ0ZXIgKiAxMDAwKTtcbiAgcmV0dXJuIGxhc3RVcGRhdGVkIDw9IHNraXBSYW5nZTtcbn1cblxuY29uc3QgdGhyb3R0bGUgPSB7fTtcbmNvbnN0IHJlbmV3U2Vzc2lvbklmTmVlZGVkID0gYXN5bmMgKHsgY29uZmlnLCBzZXNzaW9uLCBzZXNzaW9uVG9rZW4gfSkgPT4ge1xuICBpZiAoIWNvbmZpZz8uZXh0ZW5kU2Vzc2lvbk9uVXNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNsZWFyVGltZW91dCh0aHJvdHRsZVtzZXNzaW9uVG9rZW5dKTtcbiAgdGhyb3R0bGVbc2Vzc2lvblRva2VuXSA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgICAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgICAgIGNsYXNzTmFtZTogJ19TZXNzaW9uJyxcbiAgICAgICAgICByZXN0V2hlcmU6IHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgICAgcmVzdE9wdGlvbnM6IHsgbGltaXQ6IDEgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgICBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgICAgIH1cbiAgICAgIGlmICghc2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeShjb25maWcsIHNlc3Npb24pIHx8ICFzZXNzaW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgICAgIGF3YWl0IG5ldyBSZXN0V3JpdGUoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgbWFzdGVyKGNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHNlc3Npb24ub2JqZWN0SWQgfSxcbiAgICAgICAgeyBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSB9XG4gICAgICApLmV4ZWN1dGUoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZT8uY29kZSAhPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0NvdWxkIG5vdCB1cGRhdGUgc2Vzc2lvbiBleHBpcnk6ICcsIGUpO1xuICAgICAgfVxuICAgIH1cbiAgfSwgNTAwKTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gQXV0aCBvYmplY3RcbmNvbnN0IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlcixcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCB1c2VySlNPTiA9IGF3YWl0IGNhY2hlQ29udHJvbGxlci51c2VyLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmICh1c2VySlNPTikge1xuICAgICAgY29uc3QgY2FjaGVkVXNlciA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTih1c2VySlNPTik7XG4gICAgICByZW5ld1Nlc3Npb25JZk5lZWRlZCh7IGNvbmZpZywgc2Vzc2lvblRva2VuIH0pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICByZXN0V2hlcmU6IHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgICByZXN1bHRzID0gKGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKSkucmVzdWx0cztcbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzID0gKFxuICAgICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5saW1pdCgxKVxuICAgICAgICAuaW5jbHVkZSgndXNlcicpXG4gICAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAgIC5maW5kKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pXG4gICAgKS5tYXAob2JqID0+IG9iai50b0pTT04oKSk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEgfHwgIXJlc3VsdHNbMF1bJ3VzZXInXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgfVxuICBjb25zdCBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSBzZXNzaW9uLmV4cGlyZXNBdCA/IG5ldyBEYXRlKHNlc3Npb24uZXhwaXJlc0F0LmlzbykgOiB1bmRlZmluZWQ7XG4gIGlmIChleHBpcmVzQXQgPCBub3cpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiBpcyBleHBpcmVkLicpO1xuICB9XG4gIGNvbnN0IG9iaiA9IHNlc3Npb24udXNlcjtcblxuICBpZiAodHlwZW9mIG9ialsnb2JqZWN0SWQnXSA9PT0gJ3N0cmluZycgJiYgb2JqWydvYmplY3RJZCddLnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnSW52YWxpZCBvYmplY3QgSUQuJyk7XG4gIH1cblxuICBkZWxldGUgb2JqLnBhc3N3b3JkO1xuICBvYmpbJ2NsYXNzTmFtZSddID0gJ19Vc2VyJztcbiAgb2JqWydzZXNzaW9uVG9rZW4nXSA9IHNlc3Npb25Ub2tlbjtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNhY2hlQ29udHJvbGxlci51c2VyLnB1dChzZXNzaW9uVG9rZW4sIG9iaik7XG4gIH1cbiAgcmVuZXdTZXNzaW9uSWZOZWVkZWQoeyBjb25maWcsIHNlc3Npb24sIHNlc3Npb25Ub2tlbiB9KTtcbiAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICByZXR1cm4gbmV3IEF1dGgoe1xuICAgIGNvbmZpZyxcbiAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIGluc3RhbGxhdGlvbklkLFxuICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gIH0pO1xufTtcblxudmFyIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoeyBjb25maWcsIHNlc3Npb25Ub2tlbiwgaW5zdGFsbGF0aW9uSWQgfSkge1xuICB2YXIgcmVzdE9wdGlvbnMgPSB7XG4gICAgbGltaXQ6IDEsXG4gIH07XG4gIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gIHZhciBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICBjb25maWcsXG4gICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgIHJlc3RXaGVyZTogeyBfc2Vzc2lvbl90b2tlbjogc2Vzc2lvblRva2VuIH0sXG4gICAgcmVzdE9wdGlvbnMsXG4gIH0pO1xuICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHZhciByZXN1bHRzID0gcmVzcG9uc2UucmVzdWx0cztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdpbnZhbGlkIGxlZ2FjeSBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF07XG4gICAgb2JqLmNsYXNzTmFtZSA9ICdfVXNlcic7XG4gICAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICAgIHJldHVybiBuZXcgQXV0aCh7XG4gICAgICBjb25maWcsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiByb2xlIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5nZXRVc2VyUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyIHx8IHRoaXMuaXNNYWludGVuYW5jZSB8fCAhdGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG4gIH1cbiAgaWYgKHRoaXMuZmV0Y2hlZFJvbGVzKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnVzZXJSb2xlcyk7XG4gIH1cbiAgaWYgKHRoaXMucm9sZVByb21pc2UpIHtcbiAgICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbiAgfVxuICB0aGlzLnJvbGVQcm9taXNlID0gdGhpcy5fbG9hZFJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNGb3JVc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvL1N0YWNrIGFsbCBQYXJzZS5Sb2xlXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgaWYgKHRoaXMuY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdFdoZXJlID0ge1xuICAgICAgdXNlcnM6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMudXNlci5pZCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgYXV0aDogbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICB9KTtcbiAgICBhd2FpdCBxdWVyeS5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0KSk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmNsZWFyUm9sZUNhY2hlID0gZnVuY3Rpb24gKHNlc3Npb25Ub2tlbikge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZGVsKHRoaXMudXNlci5pZCk7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb25Ub2tlbik7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNCeUlkcyA9IGFzeW5jIGZ1bmN0aW9uIChpbnMpIHtcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAvLyBCdWlsZCBhbiBPUiBxdWVyeSBhY3Jvc3MgYWxsIHBhcmVudFJvbGVzXG4gIGlmICghdGhpcy5jb25maWcpIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5jb250YWluZWRJbihcbiAgICAgICAgJ3JvbGVzJyxcbiAgICAgICAgaW5zLm1hcChpZCA9PiB7XG4gICAgICAgICAgY29uc3Qgcm9sZSA9IG5ldyBQYXJzZS5PYmplY3QoUGFyc2UuUm9sZSk7XG4gICAgICAgICAgcm9sZS5pZCA9IGlkO1xuICAgICAgICAgIHJldHVybiByb2xlO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByb2xlcyA9IGlucy5tYXAoaWQgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgfTtcbiAgICB9KTtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7IHJvbGVzOiB7ICRpbjogcm9sZXMgfSB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBtYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgcmVzdFdoZXJlLFxuICAgIH0pO1xuICAgIGF3YWl0IHF1ZXJ5LmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQpKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IGFzeW5jIChjb25maWcsIGF1dGhEYXRhLCBiZWZvcmVGaW5kKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcblxuICBjb25zdCBxdWVyaWVzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgcHJvdmlkZXJzLm1hcChhc3luYyBwcm92aWRlciA9PiB7XG4gICAgICBjb25zdCBwcm92aWRlckF1dGhEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuXG4gICAgICBjb25zdCBhZGFwdGVyID0gY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik/LmFkYXB0ZXI7XG4gICAgICBpZiAoYmVmb3JlRmluZCAmJiB0eXBlb2YgYWRhcHRlcj8uYmVmb3JlRmluZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBhd2FpdCBhZGFwdGVyLmJlZm9yZUZpbmQocHJvdmlkZXJBdXRoRGF0YSk7XG4gICAgICB9XG5cbiAgICAgIGlmICghcHJvdmlkZXJBdXRoRGF0YT8uaWQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IFtgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgXTogcHJvdmlkZXJBdXRoRGF0YS5pZCB9O1xuICAgIH0pXG4gICk7XG5cbiAgLy8gRmlsdGVyIG91dCBudWxsIHF1ZXJpZXNcbiAgY29uc3QgdmFsaWRRdWVyaWVzID0gcXVlcmllcy5maWx0ZXIocXVlcnkgPT4gcXVlcnkgIT09IG51bGwpO1xuXG4gIGlmICghdmFsaWRRdWVyaWVzLmxlbmd0aCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIC8vIFBlcmZvcm0gZGF0YWJhc2UgcXVlcnlcbiAgcmV0dXJuIGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiB2YWxpZFF1ZXJpZXMgfSwgeyBsaW1pdDogMiB9KTtcbn07XG5cbmNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IChhdXRoRGF0YSwgdXNlckF1dGhEYXRhKSA9PiB7XG4gIGlmICghdXNlckF1dGhEYXRhKSB7IHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9OyB9XG4gIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgLy8gQW5vbnltb3VzIHByb3ZpZGVyIGlzIG5vdCBoYW5kbGVkIHRoaXMgd2F5XG4gICAgaWYgKHByb3ZpZGVyID09PSAnYW5vbnltb3VzJykgeyByZXR1cm47IH1cbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICByZXEgPSB7fSxcbiAgYXV0aERhdGEgPSB7fSxcbiAgdXNlckF1dGhEYXRhID0ge30sXG4gIGNvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IHNhdmVkVXNlclByb3ZpZGVycyA9IE9iamVjdC5rZXlzKHVzZXJBdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+ICh7XG4gICAgbmFtZTogcHJvdmlkZXIsXG4gICAgYWRhcHRlcjogY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcikuYWRhcHRlcixcbiAgfSkpO1xuXG4gIGNvbnN0IGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKFxuICAgIHByb3ZpZGVyID0+XG4gICAgICBwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnc29sbycgJiYgYXV0aERhdGFbcHJvdmlkZXIubmFtZV1cbiAgKTtcblxuICAvLyBTb2xvIHByb3ZpZGVycyBjYW4gYmUgY29uc2lkZXJlZCBhcyBzYWZlLCBzbyB3ZSBkbyBub3QgaGF2ZSB0byBjaGVjayBpZiB0aGUgdXNlciBuZWVkc1xuICAvLyB0byBwcm92aWRlIGFuIGFkZGl0aW9uYWwgcHJvdmlkZXIgdG8gbG9naW4uIEFuIGF1dGggYWRhcHRlciB3aXRoIFwic29sb1wiIChsaWtlIHdlYmF1dGhuKSBtZWFuc1xuICAvLyBubyBcImFkZGl0aW9uYWxcIiBhdXRoIG5lZWRzIHRvIGJlIHByb3ZpZGVkIHRvIGxvZ2luIChsaWtlIE9UUCwgTUZBKVxuICBpZiAoaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCA9IFtdO1xuICBjb25zdCBoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgbGV0IHBvbGljeSA9IHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5O1xuICAgIGlmICh0eXBlb2YgcG9saWN5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXF1ZXN0T2JqZWN0ID0ge1xuICAgICAgICBpcDogcmVxLmNvbmZpZy5pcCxcbiAgICAgICAgdXNlcjogcmVxLmF1dGgudXNlcixcbiAgICAgICAgbWFzdGVyOiByZXEuYXV0aC5pc01hc3RlcixcbiAgICAgIH07XG4gICAgICBwb2xpY3kgPSBwb2xpY3kuY2FsbChwcm92aWRlci5hZGFwdGVyLCByZXF1ZXN0T2JqZWN0LCB1c2VyQXV0aERhdGFbcHJvdmlkZXIubmFtZV0pO1xuICAgIH1cbiAgICBpZiAocG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgZXJyb3IgbWVzc2FnZVxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcC1ieS1zdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0SWQ7IG9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgdXNlciBvciBtYXN0ZXIga2V5IGlzIHByb3ZpZGVkXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHsgdXBkYXRlZE9iamVjdCB9ID0gcmVxLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHVwZGF0ZWRPYmplY3QsIHVzZXIsIHJlcS5jb25maWcpO1xuICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gYXMgc3RlcC1ieS1zdGVwIHBpcGVsaW5lIGZvciBiZXR0ZXIgZXJyb3IgY29uc2lzdGVuY3lcbiAgLy8gYW5kIGFsc28gdG8gYXZvaWQgdG8gdHJpZ2dlciBhIHByb3ZpZGVyIChsaWtlIE9UUCBTTVMpIGlmIGFub3RoZXIgb25lIGZhaWxzXG4gIGNvbnN0IGFjYyA9IHsgYXV0aERhdGE6IHt9LCBhdXRoRGF0YVJlc3BvbnNlOiB7fSB9O1xuICBjb25zdCBhdXRoS2V5cyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb3J0KCk7XG4gIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgYXV0aEtleXMpIHtcbiAgICBsZXQgbWV0aG9kID0gJyc7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG51bGw7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKSB8fCB7fTtcbiAgICAgIGNvbnN0IGF1dGhQcm92aWRlciA9IChyZXEuY29uZmlnLmF1dGggfHwge30pW3Byb3ZpZGVyXSB8fCB7fTtcbiAgICAgIGlmICghdmFsaWRhdG9yIHx8IGF1dGhQcm92aWRlci5lbmFibGVkID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHVzZXIsIHJlcXVlc3RPYmplY3QpO1xuICAgICAgbWV0aG9kID0gdmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0Lm1ldGhvZDtcbiAgICAgIHJlcXVlc3RPYmplY3QudHJpZ2dlck5hbWUgPSBtZXRob2Q7XG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcikge1xuICAgICAgICB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IoKTtcbiAgICAgIH1cbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LmtleXModmFsaWRhdGlvblJlc3VsdCkubGVuZ3RoKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFSZXNwb25zZVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgLy8gU29tZSBhdXRoIHByb3ZpZGVycyBhZnRlciBpbml0aWFsaXphdGlvbiB3aWxsIGF2b2lkIHRvIHJlcGxhY2UgYXV0aERhdGEgYWxyZWFkeSBzdG9yZWRcbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC5kb05vdFNhdmUpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQuc2F2ZSB8fCBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnQXV0aCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdXNlclN0cmluZyA9XG4gICAgICAgIHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogcmVxLmRhdGEub2JqZWN0SWQgfHwgdW5kZWZpbmVkO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwICR7bWV0aG9kfSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKSxcbiAgICAgICAge1xuICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogbWV0aG9kLFxuICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgcHJvdmlkZXIsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbWFpbnRlbmFuY2UsXG4gIG5vYm9keSxcbiAgcmVhZE9ubHksXG4gIHNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnksXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sXG4gIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4sXG4gIGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSxcbiAgaGFzTXV0YXRlZEF1dGhEYXRhLFxuICBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luLFxuICBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24sXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUNBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFNBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLE9BQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLFVBQUEsR0FBQUMsc0JBQUEsQ0FBQUosT0FBQTtBQUNBLElBQUFLLFVBQUEsR0FBQUQsc0JBQUEsQ0FBQUosT0FBQTtBQUFvQyxTQUFBSSx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUFBLFNBQUFHLFFBQUFILENBQUEsRUFBQUksQ0FBQSxRQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsSUFBQSxDQUFBUCxDQUFBLE9BQUFNLE1BQUEsQ0FBQUUscUJBQUEsUUFBQUMsQ0FBQSxHQUFBSCxNQUFBLENBQUFFLHFCQUFBLENBQUFSLENBQUEsR0FBQUksQ0FBQSxLQUFBSyxDQUFBLEdBQUFBLENBQUEsQ0FBQUMsTUFBQSxXQUFBTixDQUFBLFdBQUFFLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVgsQ0FBQSxFQUFBSSxDQUFBLEVBQUFRLFVBQUEsT0FBQVAsQ0FBQSxDQUFBUSxJQUFBLENBQUFDLEtBQUEsQ0FBQVQsQ0FBQSxFQUFBSSxDQUFBLFlBQUFKLENBQUE7QUFBQSxTQUFBVSxjQUFBZixDQUFBLGFBQUFJLENBQUEsTUFBQUEsQ0FBQSxHQUFBWSxTQUFBLENBQUFDLE1BQUEsRUFBQWIsQ0FBQSxVQUFBQyxDQUFBLFdBQUFXLFNBQUEsQ0FBQVosQ0FBQSxJQUFBWSxTQUFBLENBQUFaLENBQUEsUUFBQUEsQ0FB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