"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _logger = require("./logger");
var _lruCache = require("lru-cache");
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _RestWrite = _interopRequireDefault(require("./RestWrite"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
const throttle = new _lruCache.LRUCache({
  max: 10000,
  ttl: 500
});
/**
 * Checks whether session should be updated based on last update time & session length.
 */
function shouldUpdateSessionExpiry(config, session) {
  const resetAfter = config.sessionLength / 2;
  const lastUpdated = new Date(session?.updatedAt);
  const skipRange = new Date();
  skipRange.setTime(skipRange.getTime() - resetAfter * 1000);
  return lastUpdated <= skipRange;
}
const renewSessionIfNeeded = async ({
  config,
  session,
  sessionToken
}) => {
  if (!config?.extendSessionOnUse) {
    return;
  }
  if (throttle.get(sessionToken)) {
    return;
  }
  throttle.set(sessionToken, true);
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
    if (e?.code !== Parse.Error.OBJECT_NOT_FOUND) {
      _logger.logger.error('Could not update session expiry: ', e);
    }
  }
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
    const providerAuthData = authData[provider];
    const validatorConfig = config.authDataManager.getValidatorForProvider(provider);
    // Skip database query for unconfigured providers to avoid unindexed collection scans;
    // the provider will be rejected later in handleAuthDataValidation with UNSUPPORTED_SERVICE
    if (!validatorConfig?.validator) {
      return null;
    }
    const adapter = validatorConfig.adapter;
    if (beforeFind && typeof adapter?.beforeFind === 'function') {
      await adapter.beforeFind(providerAuthData);
    }
    if (!providerAuthData?.id) {
      return null;
    }
    if (typeof providerAuthData.id !== 'string') {
      throw new Parse.Error(Parse.Error.INVALID_VALUE, `Invalid authData id for provider '${provider}'.`);
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
    user = Parse.User.fromJSON({
      className: '_User',
      ...foundUser
    });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX2xydUNhY2hlIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2UiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJtYWludGVuYW5jZSIsInJlYWRPbmx5Iiwibm9ib2R5IiwidGhyb3R0bGUiLCJMUlUiLCJtYXgiLCJ0dGwiLCJzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5Iiwic2Vzc2lvbiIsInJlc2V0QWZ0ZXIiLCJzZXNzaW9uTGVuZ3RoIiwibGFzdFVwZGF0ZWQiLCJEYXRlIiwidXBkYXRlZEF0Iiwic2tpcFJhbmdlIiwic2V0VGltZSIsImdldFRpbWUiLCJyZW5ld1Nlc3Npb25JZk5lZWRlZCIsInNlc3Npb25Ub2tlbiIsImV4dGVuZFNlc3Npb25PblVzZSIsImdldCIsInNldCIsInF1ZXJ5IiwiUmVzdFF1ZXJ5IiwibWV0aG9kIiwiTWV0aG9kIiwiYXV0aCIsInJ1bkJlZm9yZUZpbmQiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImxpbWl0IiwicmVzdWx0cyIsImV4ZWN1dGUiLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJSZXN0V3JpdGUiLCJvYmplY3RJZCIsIl9lbmNvZGUiLCJjb2RlIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwibG9nZ2VyIiwiZXJyb3IiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJQcm9taXNlIiwicmVzb2x2ZSIsImluY2x1ZGUiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsImlzbyIsInN0YXJ0c1dpdGgiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwiX3Nlc3Npb25fdG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwidXNlcnMiLCJfX3R5cGUiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJiZWZvcmVGaW5kIiwicHJvdmlkZXJzIiwia2V5cyIsInF1ZXJpZXMiLCJhbGwiLCJwcm92aWRlciIsInByb3ZpZGVyQXV0aERhdGEiLCJ2YWxpZGF0b3JDb25maWciLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsInZhbGlkYXRvciIsImFkYXB0ZXIiLCJJTlZBTElEX1ZBTFVFIiwidmFsaWRRdWVyaWVzIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXEiLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsInJlcXVlc3RPYmplY3QiLCJpcCIsImNhbGwiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsImF1dGhLZXlzIiwic29ydCIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsInRyaWdnZXJOYW1lIiwiZG9Ob3RTYXZlIiwic2F2ZSIsImVyciIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwidXNlclN0cmluZyIsImRhdGEiLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGdldFJlcXVlc3RPYmplY3QsIHJlc29sdmVFcnJvciB9IGZyb20gJy4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgTFJVQ2FjaGUgYXMgTFJVIH0gZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuL1Jlc3RXcml0ZSc7XG5cbi8vIEFuIEF1dGggb2JqZWN0IHRlbGxzIHlvdSB3aG8gaXMgcmVxdWVzdGluZyBzb21ldGhpbmcgYW5kIHdoZXRoZXJcbi8vIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuLy8gdXNlck9iamVjdCBpcyBhIFBhcnNlLlVzZXIgYW5kIGNhbiBiZSBudWxsIGlmIHRoZXJlJ3Mgbm8gdXNlci5cbmZ1bmN0aW9uIEF1dGgoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlciA9IHVuZGVmaW5lZCxcbiAgaXNNYXN0ZXIgPSBmYWxzZSxcbiAgaXNNYWludGVuYW5jZSA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMuaXNNYWludGVuYW5jZSA9IGlzTWFpbnRlbmFuY2U7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3Rlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1hc3Rlcihjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFpbnRlbmFuY2UtbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1haW50ZW5hbmNlKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFpbnRlbmFuY2U6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gcmVhZE9ubHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGlzUmVhZE9ubHk6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG5vYm9keS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbm9ib2R5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiBmYWxzZSB9KTtcbn1cblxuY29uc3QgdGhyb3R0bGUgPSBuZXcgTFJVKHtcbiAgbWF4OiAxMDAwMCxcbiAgdHRsOiA1MDAsXG59KTtcbi8qKlxuICogQ2hlY2tzIHdoZXRoZXIgc2Vzc2lvbiBzaG91bGQgYmUgdXBkYXRlZCBiYXNlZCBvbiBsYXN0IHVwZGF0ZSB0aW1lICYgc2Vzc2lvbiBsZW5ndGguXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkoY29uZmlnLCBzZXNzaW9uKSB7XG4gIGNvbnN0IHJlc2V0QWZ0ZXIgPSBjb25maWcuc2Vzc2lvbkxlbmd0aCAvIDI7XG4gIGNvbnN0IGxhc3RVcGRhdGVkID0gbmV3IERhdGUoc2Vzc2lvbj8udXBkYXRlZEF0KTtcbiAgY29uc3Qgc2tpcFJhbmdlID0gbmV3IERhdGUoKTtcbiAgc2tpcFJhbmdlLnNldFRpbWUoc2tpcFJhbmdlLmdldFRpbWUoKSAtIHJlc2V0QWZ0ZXIgKiAxMDAwKTtcbiAgcmV0dXJuIGxhc3RVcGRhdGVkIDw9IHNraXBSYW5nZTtcbn1cblxuY29uc3QgcmVuZXdTZXNzaW9uSWZOZWVkZWQgPSBhc3luYyAoeyBjb25maWcsIHNlc3Npb24sIHNlc3Npb25Ub2tlbiB9KSA9PiB7XG4gIGlmICghY29uZmlnPy5leHRlbmRTZXNzaW9uT25Vc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHRocm90dGxlLmdldChzZXNzaW9uVG9rZW4pKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRocm90dGxlLnNldChzZXNzaW9uVG9rZW4sIHRydWUpO1xuICB0cnkge1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1Nlc3Npb24nLFxuICAgICAgICByZXN0V2hlcmU6IHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHJlc3RPcHRpb25zOiB7IGxpbWl0OiAxIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gICAgfVxuXG4gICAgaWYgKCFzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5KGNvbmZpZywgc2Vzc2lvbikgfHwgIXNlc3Npb24pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpO1xuICAgIGF3YWl0IG5ldyBSZXN0V3JpdGUoXG4gICAgICBjb25maWcsXG4gICAgICBtYXN0ZXIoY29uZmlnKSxcbiAgICAgICdfU2Vzc2lvbicsXG4gICAgICB7IG9iamVjdElkOiBzZXNzaW9uLm9iamVjdElkIH0sXG4gICAgICB7IGV4cGlyZXNBdDogUGFyc2UuX2VuY29kZShleHBpcmVzQXQpIH1cbiAgICApLmV4ZWN1dGUoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmIChlPy5jb2RlICE9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NvdWxkIG5vdCB1cGRhdGUgc2Vzc2lvbiBleHBpcnk6ICcsIGUpO1xuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBBdXRoIG9iamVjdFxuY29uc3QgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyLFxuICBzZXNzaW9uVG9rZW4sXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICBjYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IHVzZXJKU09OID0gYXdhaXQgY2FjaGVDb250cm9sbGVyLnVzZXIuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKHVzZXJKU09OKSB7XG4gICAgICBjb25zdCBjYWNoZWRVc2VyID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHVzZXJKU09OKTtcbiAgICAgIHJlbmV3U2Vzc2lvbklmTmVlZGVkKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4gfSk7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICBuZXcgQXV0aCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICAgICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgdXNlcjogY2FjaGVkVXNlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgbGV0IHJlc3VsdHM7XG4gIGlmIChjb25maWcpIHtcbiAgICBjb25zdCByZXN0T3B0aW9ucyA9IHtcbiAgICAgIGxpbWl0OiAxLFxuICAgICAgaW5jbHVkZTogJ3VzZXInLFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBtYXN0ZXIoY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19TZXNzaW9uJyxcbiAgICAgIHJlc3RXaGVyZTogeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoXG4gICAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgICAgLmVxdWFsVG8oJ3Nlc3Npb25Ub2tlbicsIHNlc3Npb25Ub2tlbilcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSlcbiAgICApLm1hcChvYmogPT4gb2JqLnRvSlNPTigpKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSB8fCAhcmVzdWx0c1swXVsndXNlciddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICB9XG4gIGNvbnN0IHNlc3Npb24gPSByZXN1bHRzWzBdO1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLFxuICAgIGV4cGlyZXNBdCA9IHNlc3Npb24uZXhwaXJlc0F0ID8gbmV3IERhdGUoc2Vzc2lvbi5leHBpcmVzQXQuaXNvKSA6IHVuZGVmaW5lZDtcbiAgaWYgKGV4cGlyZXNBdCA8IG5vdykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIGlzIGV4cGlyZWQuJyk7XG4gIH1cbiAgY29uc3Qgb2JqID0gc2Vzc2lvbi51c2VyO1xuXG4gIGlmICh0eXBlb2Ygb2JqWydvYmplY3RJZCddID09PSAnc3RyaW5nJyAmJiBvYmpbJ29iamVjdElkJ10uc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdJbnZhbGlkIG9iamVjdCBJRC4nKTtcbiAgfVxuXG4gIGRlbGV0ZSBvYmoucGFzc3dvcmQ7XG4gIG9ialsnY2xhc3NOYW1lJ10gPSAnX1VzZXInO1xuICBvYmpbJ3Nlc3Npb25Ub2tlbiddID0gc2Vzc2lvblRva2VuO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY2FjaGVDb250cm9sbGVyLnVzZXIucHV0KHNlc3Npb25Ub2tlbiwgb2JqKTtcbiAgfVxuICByZW5ld1Nlc3Npb25JZk5lZWRlZCh7IGNvbmZpZywgc2Vzc2lvbiwgc2Vzc2lvblRva2VuIH0pO1xuICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gIHJldHVybiBuZXcgQXV0aCh7XG4gICAgY29uZmlnLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgdXNlcjogdXNlck9iamVjdCxcbiAgfSk7XG59O1xuXG52YXIgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7IGNvbmZpZywgc2Vzc2lvblRva2VuLCBpbnN0YWxsYXRpb25JZCB9KSB7XG4gIHZhciByZXN0T3B0aW9ucyA9IHtcbiAgICBsaW1pdDogMSxcbiAgfTtcbiAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgdmFyIHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgIGNvbmZpZyxcbiAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICBhdXRoOiBtYXN0ZXIoY29uZmlnKSxcbiAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgcmVzdFdoZXJlOiB7IF9zZXNzaW9uX3Rva2VuOiBzZXNzaW9uVG9rZW4gfSxcbiAgICByZXN0T3B0aW9ucyxcbiAgfSk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdmFyIHJlc3VsdHMgPSByZXNwb25zZS5yZXN1bHRzO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgb2JqID0gcmVzdWx0c1swXTtcbiAgICBvYmouY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gICAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICAgIGNvbmZpZyxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgdXNlcjogdXNlck9iamVjdCxcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJvbGUgbmFtZXNcbkF1dGgucHJvdG90eXBlLmdldFVzZXJSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIgfHwgdGhpcy5pc01haW50ZW5hbmNlIHx8ICF0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgfVxuICBpZiAodGhpcy5mZXRjaGVkUm9sZXMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMudXNlclJvbGVzKTtcbiAgfVxuICBpZiAodGhpcy5yb2xlUHJvbWlzZSkge1xuICAgIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xuICB9XG4gIHRoaXMucm9sZVByb21pc2UgPSB0aGlzLl9sb2FkUm9sZXMoKTtcbiAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0ZvclVzZXIgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vU3RhY2sgYWxsIFBhcnNlLlJvbGVcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICBpZiAodGhpcy5jb25maWcpIHtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7XG4gICAgICB1c2Vyczoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy51c2VyLmlkLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBtYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgcmVzdFdoZXJlLFxuICAgIH0pO1xuICAgIGF3YWl0IHF1ZXJ5LmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQpKTtcbiAgfSBlbHNlIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5lcXVhbFRvKCd1c2VycycsIHRoaXMudXNlcilcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBJdGVyYXRlcyB0aHJvdWdoIHRoZSByb2xlIHRyZWUgYW5kIGNvbXBpbGVzIGEgdXNlcidzIHJvbGVzXG5BdXRoLnByb3RvdHlwZS5fbG9hZFJvbGVzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCBjYWNoZWRSb2xlcyA9IGF3YWl0IHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZ2V0KHRoaXMudXNlci5pZCk7XG4gICAgaWYgKGNhY2hlZFJvbGVzICE9IG51bGwpIHtcbiAgICAgIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgICAgIHRoaXMudXNlclJvbGVzID0gY2FjaGVkUm9sZXM7XG4gICAgICByZXR1cm4gY2FjaGVkUm9sZXM7XG4gICAgfVxuICB9XG5cbiAgLy8gRmlyc3QgZ2V0IHRoZSByb2xlIGlkcyB0aGlzIHVzZXIgaXMgZGlyZWN0bHkgYSBtZW1iZXIgb2ZcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZ2V0Um9sZXNGb3JVc2VyKCk7XG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICAgIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcblxuICAgIHRoaXMuY2FjaGVSb2xlcygpO1xuICAgIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbiAgfVxuXG4gIGNvbnN0IHJvbGVzTWFwID0gcmVzdWx0cy5yZWR1Y2UoXG4gICAgKG0sIHIpID0+IHtcbiAgICAgIG0ubmFtZXMucHVzaChyLm5hbWUpO1xuICAgICAgbS5pZHMucHVzaChyLm9iamVjdElkKTtcbiAgICAgIHJldHVybiBtO1xuICAgIH0sXG4gICAgeyBpZHM6IFtdLCBuYW1lczogW10gfVxuICApO1xuXG4gIC8vIHJ1biB0aGUgcmVjdXJzaXZlIGZpbmRpbmdcbiAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMocm9sZXNNYXAuaWRzLCByb2xlc01hcC5uYW1lcyk7XG4gIHRoaXMudXNlclJvbGVzID0gcm9sZU5hbWVzLm1hcChyID0+IHtcbiAgICByZXR1cm4gJ3JvbGU6JyArIHI7XG4gIH0pO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xufTtcblxuQXV0aC5wcm90b3R5cGUuY2FjaGVSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLnB1dCh0aGlzLnVzZXIuaWQsIEFycmF5KC4uLnRoaXMudXNlclJvbGVzKSk7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuY2xlYXJSb2xlQ2FjaGUgPSBmdW5jdGlvbiAoc2Vzc2lvblRva2VuKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5kZWwodGhpcy51c2VyLmlkKTtcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvblRva2VuKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0J5SWRzID0gYXN5bmMgZnVuY3Rpb24gKGlucykge1xuICBjb25zdCByZXN1bHRzID0gW107XG4gIC8vIEJ1aWxkIGFuIE9SIHF1ZXJ5IGFjcm9zcyBhbGwgcGFyZW50Um9sZXNcbiAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmNvbnRhaW5lZEluKFxuICAgICAgICAncm9sZXMnLFxuICAgICAgICBpbnMubWFwKGlkID0+IHtcbiAgICAgICAgICBjb25zdCByb2xlID0gbmV3IFBhcnNlLk9iamVjdChQYXJzZS5Sb2xlKTtcbiAgICAgICAgICByb2xlLmlkID0gaWQ7XG4gICAgICAgICAgcmV0dXJuIHJvbGU7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHJvbGVzID0gaW5zLm1hcChpZCA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICB9O1xuICAgIH0pO1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHsgcm9sZXM6IHsgJGluOiByb2xlcyB9IH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IG1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgfSk7XG4gICAgYXdhaXQgcXVlcnkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gR2l2ZW4gYSBsaXN0IG9mIHJvbGVJZHMsIGZpbmQgYWxsIHRoZSBwYXJlbnQgcm9sZXMsIHJldHVybnMgYSBwcm9taXNlIHdpdGggYWxsIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5fZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMgPSBmdW5jdGlvbiAocm9sZUlEcywgbmFtZXMgPSBbXSwgcXVlcmllZFJvbGVzID0ge30pIHtcbiAgY29uc3QgaW5zID0gcm9sZUlEcy5maWx0ZXIocm9sZUlEID0+IHtcbiAgICBjb25zdCB3YXNRdWVyaWVkID0gcXVlcmllZFJvbGVzW3JvbGVJRF0gIT09IHRydWU7XG4gICAgcXVlcmllZFJvbGVzW3JvbGVJRF0gPSB0cnVlO1xuICAgIHJldHVybiB3YXNRdWVyaWVkO1xuICB9KTtcblxuICAvLyBhbGwgcm9sZXMgYXJlIGFjY291bnRlZCBmb3IsIHJldHVybiB0aGUgbmFtZXNcbiAgaWYgKGlucy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gIH1cblxuICByZXR1cm4gdGhpcy5nZXRSb2xlc0J5SWRzKGlucylcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIE5vdGhpbmcgZm91bmRcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShuYW1lcyk7XG4gICAgICB9XG4gICAgICAvLyBNYXAgdGhlIHJlc3VsdHMgd2l0aCBhbGwgSWRzIGFuZCBuYW1lc1xuICAgICAgY29uc3QgcmVzdWx0TWFwID0gcmVzdWx0cy5yZWR1Y2UoXG4gICAgICAgIChtZW1vLCByb2xlKSA9PiB7XG4gICAgICAgICAgbWVtby5uYW1lcy5wdXNoKHJvbGUubmFtZSk7XG4gICAgICAgICAgbWVtby5pZHMucHVzaChyb2xlLm9iamVjdElkKTtcbiAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgfSxcbiAgICAgICAgeyBpZHM6IFtdLCBuYW1lczogW10gfVxuICAgICAgKTtcbiAgICAgIC8vIHN0b3JlIHRoZSBuZXcgZm91bmQgbmFtZXNcbiAgICAgIG5hbWVzID0gbmFtZXMuY29uY2F0KHJlc3VsdE1hcC5uYW1lcyk7XG4gICAgICAvLyBmaW5kIHRoZSBuZXh0IG9uZXMsIGNpcmN1bGFyIHJvbGVzIHdpbGwgYmUgY3V0XG4gICAgICByZXR1cm4gdGhpcy5fZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMocmVzdWx0TWFwLmlkcywgbmFtZXMsIHF1ZXJpZWRSb2xlcyk7XG4gICAgfSlcbiAgICAudGhlbihuYW1lcyA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgZmluZFVzZXJzV2l0aEF1dGhEYXRhID0gYXN5bmMgKGNvbmZpZywgYXV0aERhdGEsIGJlZm9yZUZpbmQpID0+IHtcbiAgY29uc3QgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuXG4gIGNvbnN0IHF1ZXJpZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICBwcm92aWRlcnMubWFwKGFzeW5jIHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG5cbiAgICAgIGNvbnN0IHZhbGlkYXRvckNvbmZpZyA9IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgLy8gU2tpcCBkYXRhYmFzZSBxdWVyeSBmb3IgdW5jb25maWd1cmVkIHByb3ZpZGVycyB0byBhdm9pZCB1bmluZGV4ZWQgY29sbGVjdGlvbiBzY2FucztcbiAgICAgIC8vIHRoZSBwcm92aWRlciB3aWxsIGJlIHJlamVjdGVkIGxhdGVyIGluIGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiB3aXRoIFVOU1VQUE9SVEVEX1NFUlZJQ0VcbiAgICAgIGlmICghdmFsaWRhdG9yQ29uZmlnPy52YWxpZGF0b3IpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBjb25zdCBhZGFwdGVyID0gdmFsaWRhdG9yQ29uZmlnLmFkYXB0ZXI7XG4gICAgICBpZiAoYmVmb3JlRmluZCAmJiB0eXBlb2YgYWRhcHRlcj8uYmVmb3JlRmluZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBhd2FpdCBhZGFwdGVyLmJlZm9yZUZpbmQocHJvdmlkZXJBdXRoRGF0YSk7XG4gICAgICB9XG5cbiAgICAgIGlmICghcHJvdmlkZXJBdXRoRGF0YT8uaWQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgcHJvdmlkZXJBdXRoRGF0YS5pZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfVkFMVUUsIGBJbnZhbGlkIGF1dGhEYXRhIGlkIGZvciBwcm92aWRlciAnJHtwcm92aWRlcn0nLmApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBbYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYF06IHByb3ZpZGVyQXV0aERhdGEuaWQgfTtcbiAgICB9KVxuICApO1xuXG4gIC8vIEZpbHRlciBvdXQgbnVsbCBxdWVyaWVzXG4gIGNvbnN0IHZhbGlkUXVlcmllcyA9IHF1ZXJpZXMuZmlsdGVyKHF1ZXJ5ID0+IHF1ZXJ5ICE9PSBudWxsKTtcblxuICBpZiAoIXZhbGlkUXVlcmllcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICAvLyBQZXJmb3JtIGRhdGFiYXNlIHF1ZXJ5XG4gIHJldHVybiBjb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7ICRvcjogdmFsaWRRdWVyaWVzIH0sIHsgbGltaXQ6IDIgfSk7XG59O1xuXG5jb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSAoYXV0aERhdGEsIHVzZXJBdXRoRGF0YSkgPT4ge1xuICBpZiAoIXVzZXJBdXRoRGF0YSkgeyByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGE6IHRydWUsIG11dGF0ZWRBdXRoRGF0YTogYXV0aERhdGEgfTsgfVxuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHsgcmV0dXJuOyB9XG4gICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGNvbnN0IHVzZXJQcm92aWRlckF1dGhEYXRhID0gdXNlckF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBpZiAoIWlzRGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyRGF0YSwgdXNlclByb3ZpZGVyQXV0aERhdGEpKSB7XG4gICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgIH1cbiAgfSk7XG4gIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9O1xufTtcblxuY29uc3QgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiA9IChcbiAgcmVxID0ge30sXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZSwgc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZHNcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luLiBBbiBhdXRoIGFkYXB0ZXIgd2l0aCBcInNvbG9cIiAobGlrZSB3ZWJhdXRobikgbWVhbnNcbiAgLy8gbm8gXCJhZGRpdGlvbmFsXCIgYXV0aCBuZWVkcyB0byBiZSBwcm92aWRlZCB0byBsb2dpbiAobGlrZSBPVFAsIE1GQSlcbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGxldCBwb2xpY3kgPSBwcm92aWRlci5hZGFwdGVyLnBvbGljeTtcbiAgICBpZiAodHlwZW9mIHBvbGljeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgcmVxdWVzdE9iamVjdCA9IHtcbiAgICAgICAgaXA6IHJlcS5jb25maWcuaXAsXG4gICAgICAgIHVzZXI6IHJlcS5hdXRoLnVzZXIsXG4gICAgICAgIG1hc3RlcjogcmVxLmF1dGguaXNNYXN0ZXIsXG4gICAgICB9O1xuICAgICAgcG9saWN5ID0gcG9saWN5LmNhbGwocHJvdmlkZXIuYWRhcHRlciwgcmVxdWVzdE9iamVjdCwgdXNlckF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdKTtcbiAgICB9XG4gICAgaWYgKHBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAtYnktc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdElkOyBvbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IHVzZXIgb3IgbWFzdGVyIGtleSBpcyBwcm92aWRlZFxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCB7IHVwZGF0ZWRPYmplY3QgfSA9IHJlcS5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCB1cGRhdGVkT2JqZWN0LCB1c2VyLCByZXEuY29uZmlnKTtcbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAtYnktc3RlcCBwaXBlbGluZSBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5XG4gIC8vIGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKSBpZiBhbm90aGVyIG9uZSBmYWlsc1xuICBjb25zdCBhY2MgPSB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfTtcbiAgY29uc3QgYXV0aEtleXMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuc29ydCgpO1xuICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGF1dGhLZXlzKSB7XG4gICAgbGV0IG1ldGhvZCA9ICcnO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcikgfHwge307XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoIXZhbGlkYXRvciB8fCBhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCB1c2VyLCByZXF1ZXN0T2JqZWN0KTtcbiAgICAgIG1ldGhvZCA9IHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC5tZXRob2Q7XG4gICAgICByZXF1ZXN0T2JqZWN0LnRyaWdnZXJOYW1lID0gbWV0aG9kO1xuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IpIHtcbiAgICAgICAgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKCk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2UpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIC8vIFNvbWUgYXV0aCBwcm92aWRlcnMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gd2lsbCBhdm9pZCB0byByZXBsYWNlIGF1dGhEYXRhIGFscmVhZHkgc3RvcmVkXG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ0F1dGggZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPVxuICAgICAgICByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHJlcS5kYXRhLm9iamVjdElkIHx8IHVuZGVmaW5lZDtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCAke21ldGhvZH0gZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgIHtcbiAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6IG1ldGhvZCxcbiAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBBdXRoLFxuICBtYXN0ZXIsXG4gIG1haW50ZW5hbmNlLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFDQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxPQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxTQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxVQUFBLEdBQUFDLHNCQUFBLENBQUFMLE9BQUE7QUFDQSxJQUFBTSxVQUFBLEdBQUFELHNCQUFBLENBQUFMLE9BQUE7QUFBb0MsU0FBQUssdUJBQUFFLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFOcEMsTUFBTUcsS0FBSyxHQUFHVixPQUFPLENBQUMsWUFBWSxDQUFDO0FBUW5DO0FBQ0E7QUFDQTtBQUNBLFNBQVNXLElBQUlBLENBQUM7RUFDWkMsTUFBTTtFQUNOQyxlQUFlLEdBQUdDLFNBQVM7RUFDM0JDLFFBQVEsR0FBRyxLQUFLO0VBQ2hCQyxhQUFhLEdBQUcsS0FBSztFQUNyQkMsVUFBVSxHQUFHLEtBQUs7RUFDbEJDLElBQUk7RUFDSkM7QUFDRixDQUFDLEVBQUU7RUFDRCxJQUFJLENBQUNQLE1BQU0sR0FBR0Es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