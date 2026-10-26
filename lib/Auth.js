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
  isLegacySession = false,
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
  this.isLegacySession = isLegacySession;

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
      isLegacySession: true,
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

    // Skip providers being unlinked (null value)
    if (providerAuthData === null) {
      return null;
    }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX2xydUNhY2hlIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2UiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiaXNSZWFkT25seSIsImlzTGVnYWN5U2Vzc2lvbiIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJtYWludGVuYW5jZSIsInJlYWRPbmx5Iiwibm9ib2R5IiwidGhyb3R0bGUiLCJMUlUiLCJtYXgiLCJ0dGwiLCJzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5Iiwic2Vzc2lvbiIsInJlc2V0QWZ0ZXIiLCJzZXNzaW9uTGVuZ3RoIiwibGFzdFVwZGF0ZWQiLCJEYXRlIiwidXBkYXRlZEF0Iiwic2tpcFJhbmdlIiwic2V0VGltZSIsImdldFRpbWUiLCJyZW5ld1Nlc3Npb25JZk5lZWRlZCIsInNlc3Npb25Ub2tlbiIsImV4dGVuZFNlc3Npb25PblVzZSIsImdldCIsInNldCIsInF1ZXJ5IiwiUmVzdFF1ZXJ5IiwibWV0aG9kIiwiTWV0aG9kIiwiYXV0aCIsInJ1bkJlZm9yZUZpbmQiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImxpbWl0IiwicmVzdWx0cyIsImV4ZWN1dGUiLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJSZXN0V3JpdGUiLCJvYmplY3RJZCIsIl9lbmNvZGUiLCJjb2RlIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwibG9nZ2VyIiwiZXJyb3IiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJQcm9taXNlIiwicmVzb2x2ZSIsImluY2x1ZGUiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsImlzbyIsInN0YXJ0c1dpdGgiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwiX3Nlc3Npb25fdG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwidXNlcnMiLCJfX3R5cGUiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJiZWZvcmVGaW5kIiwicHJvdmlkZXJzIiwia2V5cyIsInF1ZXJpZXMiLCJhbGwiLCJwcm92aWRlciIsInByb3ZpZGVyQXV0aERhdGEiLCJ2YWxpZGF0b3JDb25maWciLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsInZhbGlkYXRvciIsImFkYXB0ZXIiLCJJTlZBTElEX1ZBTFVFIiwidmFsaWRRdWVyaWVzIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXEiLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsInJlcXVlc3RPYmplY3QiLCJpcCIsImNhbGwiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsImF1dGhLZXlzIiwic29ydCIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsInRyaWdnZXJOYW1lIiwiZG9Ob3RTYXZlIiwic2F2ZSIsImVyciIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwidXNlclN0cmluZyIsImRhdGEiLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGdldFJlcXVlc3RPYmplY3QsIHJlc29sdmVFcnJvciB9IGZyb20gJy4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgTFJVQ2FjaGUgYXMgTFJVIH0gZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuL1Jlc3RXcml0ZSc7XG5cbi8vIEFuIEF1dGggb2JqZWN0IHRlbGxzIHlvdSB3aG8gaXMgcmVxdWVzdGluZyBzb21ldGhpbmcgYW5kIHdoZXRoZXJcbi8vIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuLy8gdXNlck9iamVjdCBpcyBhIFBhcnNlLlVzZXIgYW5kIGNhbiBiZSBudWxsIGlmIHRoZXJlJ3Mgbm8gdXNlci5cbmZ1bmN0aW9uIEF1dGgoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlciA9IHVuZGVmaW5lZCxcbiAgaXNNYXN0ZXIgPSBmYWxzZSxcbiAgaXNNYWludGVuYW5jZSA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIGlzTGVnYWN5U2Vzc2lvbiA9IGZhbHNlLFxuICB1c2VyLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgdGhpcy5pc01hc3RlciA9IGlzTWFzdGVyO1xuICB0aGlzLmlzTWFpbnRlbmFuY2UgPSBpc01haW50ZW5hbmNlO1xuICB0aGlzLnVzZXIgPSB1c2VyO1xuICB0aGlzLmlzUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuICB0aGlzLmlzTGVnYWN5U2Vzc2lvbiA9IGlzTGVnYWN5U2Vzc2lvbjtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMudXNlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFzdGVyKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYWludGVuYW5jZS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFpbnRlbmFuY2UoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYWludGVuYW5jZTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG5jb25zdCB0aHJvdHRsZSA9IG5ldyBMUlUoe1xuICBtYXg6IDEwMDAwLFxuICB0dGw6IDUwMCxcbn0pO1xuLyoqXG4gKiBDaGVja3Mgd2hldGhlciBzZXNzaW9uIHNob3VsZCBiZSB1cGRhdGVkIGJhc2VkIG9uIGxhc3QgdXBkYXRlIHRpbWUgJiBzZXNzaW9uIGxlbmd0aC5cbiAqL1xuZnVuY3Rpb24gc2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeShjb25maWcsIHNlc3Npb24pIHtcbiAgY29uc3QgcmVzZXRBZnRlciA9IGNvbmZpZy5zZXNzaW9uTGVuZ3RoIC8gMjtcbiAgY29uc3QgbGFzdFVwZGF0ZWQgPSBuZXcgRGF0ZShzZXNzaW9uPy51cGRhdGVkQXQpO1xuICBjb25zdCBza2lwUmFuZ2UgPSBuZXcgRGF0ZSgpO1xuICBza2lwUmFuZ2Uuc2V0VGltZShza2lwUmFuZ2UuZ2V0VGltZSgpIC0gcmVzZXRBZnRlciAqIDEwMDApO1xuICByZXR1cm4gbGFzdFVwZGF0ZWQgPD0gc2tpcFJhbmdlO1xufVxuXG5jb25zdCByZW5ld1Nlc3Npb25JZk5lZWRlZCA9IGFzeW5jICh7IGNvbmZpZywgc2Vzc2lvbiwgc2Vzc2lvblRva2VuIH0pID0+IHtcbiAgaWYgKCFjb25maWc/LmV4dGVuZFNlc3Npb25PblVzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhyb3R0bGUuZ2V0KHNlc3Npb25Ub2tlbikpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhyb3R0bGUuc2V0KHNlc3Npb25Ub2tlbiwgdHJ1ZSk7XG4gIHRyeSB7XG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICAgIHJlc3RXaGVyZTogeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgcmVzdE9wdGlvbnM6IHsgbGltaXQ6IDEgfSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgICB9XG5cbiAgICBpZiAoIXNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkoY29uZmlnLCBzZXNzaW9uKSB8fCAhc2Vzc2lvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gICAgYXdhaXQgbmV3IFJlc3RXcml0ZShcbiAgICAgIGNvbmZpZyxcbiAgICAgIG1hc3Rlcihjb25maWcpLFxuICAgICAgJ19TZXNzaW9uJyxcbiAgICAgIHsgb2JqZWN0SWQ6IHNlc3Npb24ub2JqZWN0SWQgfSxcbiAgICAgIHsgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCkgfVxuICAgICkuZXhlY3V0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGU/LmNvZGUgIT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignQ291bGQgbm90IHVwZGF0ZSBzZXNzaW9uIGV4cGlyeTogJywgZSk7XG4gICAgfVxuICB9XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmVuZXdTZXNzaW9uSWZOZWVkZWQoeyBjb25maWcsIHNlc3Npb25Ub2tlbiB9KTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1Nlc3Npb24nLFxuICAgICAgcmVzdFdoZXJlOiB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gICAgcmVzdWx0cyA9IChhd2FpdCBxdWVyeS5leGVjdXRlKCkpLnJlc3VsdHM7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cyA9IChcbiAgICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmluY2x1ZGUoJ3VzZXInKVxuICAgICAgICAuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KVxuICAgICkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gIH1cbiAgY29uc3Qgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gc2Vzc2lvbi5leHBpcmVzQXQgPyBuZXcgRGF0ZShzZXNzaW9uLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSBzZXNzaW9uLnVzZXI7XG5cbiAgaWYgKHR5cGVvZiBvYmpbJ29iamVjdElkJ10gPT09ICdzdHJpbmcnICYmIG9ialsnb2JqZWN0SWQnXS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0ludmFsaWQgb2JqZWN0IElELicpO1xuICB9XG5cbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIHJlbmV3U2Vzc2lvbklmTmVlZGVkKHsgY29uZmlnLCBzZXNzaW9uLCBzZXNzaW9uVG9rZW4gfSk7XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgY29uZmlnLFxuICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICByZXN0V2hlcmU6IHsgX3Nlc3Npb25fdG9rZW46IHNlc3Npb25Ub2tlbiB9LFxuICAgIHJlc3RPcHRpb25zLFxuICB9KTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaXNMZWdhY3lTZXNzaW9uOiB0cnVlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCB0aGlzLmlzTWFpbnRlbmFuY2UgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgfSk7XG4gICAgYXdhaXQgcXVlcnkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICB9KTtcbiAgICBhd2FpdCBxdWVyeS5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0KSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSBhc3luYyAoY29uZmlnLCBhdXRoRGF0YSwgYmVmb3JlRmluZCkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG5cbiAgY29uc3QgcXVlcmllcyA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIHByb3ZpZGVycy5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcblxuICAgICAgLy8gU2tpcCBwcm92aWRlcnMgYmVpbmcgdW5saW5rZWQgKG51bGwgdmFsdWUpXG4gICAgICBpZiAocHJvdmlkZXJBdXRoRGF0YSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdmFsaWRhdG9yQ29uZmlnID0gY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAvLyBTa2lwIGRhdGFiYXNlIHF1ZXJ5IGZvciB1bmNvbmZpZ3VyZWQgcHJvdmlkZXJzIHRvIGF2b2lkIHVuaW5kZXhlZCBjb2xsZWN0aW9uIHNjYW5zO1xuICAgICAgLy8gdGhlIHByb3ZpZGVyIHdpbGwgYmUgcmVqZWN0ZWQgbGF0ZXIgaW4gaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIHdpdGggVU5TVVBQT1JURURfU0VSVklDRVxuICAgICAgaWYgKCF2YWxpZGF0b3JDb25maWc/LnZhbGlkYXRvcikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFkYXB0ZXIgPSB2YWxpZGF0b3JDb25maWcuYWRhcHRlcjtcbiAgICAgIGlmIChiZWZvcmVGaW5kICYmIHR5cGVvZiBhZGFwdGVyPy5iZWZvcmVGaW5kID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGF3YWl0IGFkYXB0ZXIuYmVmb3JlRmluZChwcm92aWRlckF1dGhEYXRhKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFwcm92aWRlckF1dGhEYXRhPy5pZCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBwcm92aWRlckF1dGhEYXRhLmlkICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSwgYEludmFsaWQgYXV0aERhdGEgaWQgZm9yIHByb3ZpZGVyICcke3Byb3ZpZGVyfScuYCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IFtgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgXTogcHJvdmlkZXJBdXRoRGF0YS5pZCB9O1xuICAgIH0pXG4gICk7XG5cbiAgLy8gRmlsdGVyIG91dCBudWxsIHF1ZXJpZXNcbiAgY29uc3QgdmFsaWRRdWVyaWVzID0gcXVlcmllcy5maWx0ZXIocXVlcnkgPT4gcXVlcnkgIT09IG51bGwpO1xuXG4gIGlmICghdmFsaWRRdWVyaWVzLmxlbmd0aCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIC8vIFBlcmZvcm0gZGF0YWJhc2UgcXVlcnlcbiAgcmV0dXJuIGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiB2YWxpZFF1ZXJpZXMgfSwgeyBsaW1pdDogMiB9KTtcbn07XG5cbmNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IChhdXRoRGF0YSwgdXNlckF1dGhEYXRhKSA9PiB7XG4gIGlmICghdXNlckF1dGhEYXRhKSB7IHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9OyB9XG4gIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgLy8gQW5vbnltb3VzIHByb3ZpZGVyIGlzIG5vdCBoYW5kbGVkIHRoaXMgd2F5XG4gICAgaWYgKHByb3ZpZGVyID09PSAnYW5vbnltb3VzJykgeyByZXR1cm47IH1cbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICByZXEgPSB7fSxcbiAgYXV0aERhdGEgPSB7fSxcbiAgdXNlckF1dGhEYXRhID0ge30sXG4gIGNvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IHNhdmVkVXNlclByb3ZpZGVycyA9IE9iamVjdC5rZXlzKHVzZXJBdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+ICh7XG4gICAgbmFtZTogcHJvdmlkZXIsXG4gICAgYWRhcHRlcjogY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcikuYWRhcHRlcixcbiAgfSkpO1xuXG4gIGNvbnN0IGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKFxuICAgIHByb3ZpZGVyID0+XG4gICAgICBwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnc29sbycgJiYgYXV0aERhdGFbcHJvdmlkZXIubmFtZV1cbiAgKTtcblxuICAvLyBTb2xvIHByb3ZpZGVycyBjYW4gYmUgY29uc2lkZXJlZCBhcyBzYWZlLCBzbyB3ZSBkbyBub3QgaGF2ZSB0byBjaGVjayBpZiB0aGUgdXNlciBuZWVkc1xuICAvLyB0byBwcm92aWRlIGFuIGFkZGl0aW9uYWwgcHJvdmlkZXIgdG8gbG9naW4uIEFuIGF1dGggYWRhcHRlciB3aXRoIFwic29sb1wiIChsaWtlIHdlYmF1dGhuKSBtZWFuc1xuICAvLyBubyBcImFkZGl0aW9uYWxcIiBhdXRoIG5lZWRzIHRvIGJlIHByb3ZpZGVkIHRvIGxvZ2luIChsaWtlIE9UUCwgTUZBKVxuICBpZiAoaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCA9IFtdO1xuICBjb25zdCBoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgbGV0IHBvbGljeSA9IHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5O1xuICAgIGlmICh0eXBlb2YgcG9saWN5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXF1ZXN0T2JqZWN0ID0ge1xuICAgICAgICBpcDogcmVxLmNvbmZpZy5pcCxcbiAgICAgICAgdXNlcjogcmVxLmF1dGgudXNlcixcbiAgICAgICAgbWFzdGVyOiByZXEuYXV0aC5pc01hc3RlcixcbiAgICAgIH07XG4gICAgICBwb2xpY3kgPSBwb2xpY3kuY2FsbChwcm92aWRlci5hZGFwdGVyLCByZXF1ZXN0T2JqZWN0LCB1c2VyQXV0aERhdGFbcHJvdmlkZXIubmFtZV0pO1xuICAgIH1cbiAgICBpZiAocG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgZXJyb3IgbWVzc2FnZVxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcC1ieS1zdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0SWQ7IG9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgdXNlciBvciBtYXN0ZXIga2V5IGlzIHByb3ZpZGVkXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHsgdXBkYXRlZE9iamVjdCB9ID0gcmVxLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHVwZGF0ZWRPYmplY3QsIHVzZXIsIHJlcS5jb25maWcpO1xuICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gYXMgc3RlcC1ieS1zdGVwIHBpcGVsaW5lIGZvciBiZXR0ZXIgZXJyb3IgY29uc2lzdGVuY3lcbiAgLy8gYW5kIGFsc28gdG8gYXZvaWQgdG8gdHJpZ2dlciBhIHByb3ZpZGVyIChsaWtlIE9UUCBTTVMpIGlmIGFub3RoZXIgb25lIGZhaWxzXG4gIGNvbnN0IGFjYyA9IHsgYXV0aERhdGE6IHt9LCBhdXRoRGF0YVJlc3BvbnNlOiB7fSB9O1xuICBjb25zdCBhdXRoS2V5cyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb3J0KCk7XG4gIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgYXV0aEtleXMpIHtcbiAgICBsZXQgbWV0aG9kID0gJyc7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG51bGw7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKSB8fCB7fTtcbiAgICAgIGNvbnN0IGF1dGhQcm92aWRlciA9IChyZXEuY29uZmlnLmF1dGggfHwge30pW3Byb3ZpZGVyXSB8fCB7fTtcbiAgICAgIGlmICghdmFsaWRhdG9yIHx8IGF1dGhQcm92aWRlci5lbmFibGVkID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHVzZXIsIHJlcXVlc3RPYmplY3QpO1xuICAgICAgbWV0aG9kID0gdmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0Lm1ldGhvZDtcbiAgICAgIHJlcXVlc3RPYmplY3QudHJpZ2dlck5hbWUgPSBtZXRob2Q7XG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdCAmJiB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcikge1xuICAgICAgICB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IoKTtcbiAgICAgIH1cbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LmtleXModmFsaWRhdGlvblJlc3VsdCkubGVuZ3RoKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFSZXNwb25zZVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgLy8gU29tZSBhdXRoIHByb3ZpZGVycyBhZnRlciBpbml0aWFsaXphdGlvbiB3aWxsIGF2b2lkIHRvIHJlcGxhY2UgYXV0aERhdGEgYWxyZWFkeSBzdG9yZWRcbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC5kb05vdFNhdmUpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQuc2F2ZSB8fCBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnQXV0aCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdXNlclN0cmluZyA9XG4gICAgICAgIHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogcmVxLmRhdGEub2JqZWN0SWQgfHwgdW5kZWZpbmVkO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwICR7bWV0aG9kfSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKSxcbiAgICAgICAge1xuICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogbWV0aG9kLFxuICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgcHJvdmlkZXIsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbWFpbnRlbmFuY2UsXG4gIG5vYm9keSxcbiAgcmVhZE9ubHksXG4gIHNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnksXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sXG4gIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4sXG4gIGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSxcbiAgaGFzTXV0YXRlZEF1dGhEYXRhLFxuICBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luLFxuICBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24sXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUNBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFNBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLE9BQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLFNBQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLFVBQUEsR0FBQUMsc0JBQUEsQ0FBQUwsT0FBQTtBQUNBLElBQUFNLFVBQUEsR0FBQUQsc0JBQUEsQ0FBQUwsT0FBQTtBQUFvQyxTQUFBSyx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYs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