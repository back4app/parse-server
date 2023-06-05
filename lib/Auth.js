"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _logger = require("./logger");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
    const query = new RestQuery(config, master(config), '_Session', {
      sessionToken
    }, restOptions);
    results = (await query.execute()).results;
  } else {
    results = (await new Parse.Query(Parse.Session).limit(1).include('user').equalTo('sessionToken', sessionToken).find({
      useMasterKey: true
    })).map(obj => obj.toJSON());
  }
  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }
  const now = new Date(),
    expiresAt = results[0].expiresAt ? new Date(results[0].expiresAt.iso) : undefined;
  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }
  const obj = results[0]['user'];
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;
  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }
  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject
  });
};
var getAuthForLegacySessionToken = function ({
  config,
  sessionToken,
  installationId
}) {
  var restOptions = {
    limit: 1
  };
  const RestQuery = require('./RestQuery');
  var query = new RestQuery(config, master(config), '_User', {
    sessionToken
  }, restOptions);
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
    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result => results.push(result));
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
    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result => results.push(result));
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
  if (!userAuthData) return {
    hasMutatedAuthData: true,
    mutatedAuthData: authData
  };
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') return;
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
const checkIfUserHasProvidedConfiguredProvidersForLogin = (authData = {}, userAuthData = {}, config) => {
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
    if (provider && provider.adapter && provider.adapter.policy === 'additional') {
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
    originalObject,
    updatedObject
  } = req.buildParseObjects();
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, originalObject || user, req.config);
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
      if (authProvider.enabled == null) {
        _Deprecator.default.logRuntimeDeprecation({
          usage: `Using the authentication adapter "${provider}" without explicitly enabling it`,
          solution: `Enable the authentication adapter by setting the Parse Server option "auth.${provider}.enabled: true".`
        });
      }
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
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfRGVwcmVjYXRvciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIlBhcnNlIiwiQXV0aCIsImNvbmZpZyIsImNhY2hlQ29udHJvbGxlciIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwibWFpbnRlbmFuY2UiLCJyZWFkT25seSIsIm5vYm9keSIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJzZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImdldCIsImNhY2hlZFVzZXIiLCJmcm9tSlNPTiIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVzdWx0cyIsInJlc3RPcHRpb25zIiwibGltaXQiLCJpbmNsdWRlIiwiUmVzdFF1ZXJ5IiwicXVlcnkiLCJleGVjdXRlIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsImZpbmQiLCJ1c2VNYXN0ZXJLZXkiLCJtYXAiLCJ0b0pTT04iLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsIkRhdGUiLCJleHBpcmVzQXQiLCJpc28iLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiY2xhc3NOYW1lIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInJlc3RXaGVyZSIsInVzZXJzIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJSb2xlIiwiY2FjaGVkUm9sZXMiLCJyb2xlIiwiY2FjaGVSb2xlcyIsInJvbGVzTWFwIiwicmVkdWNlIiwibSIsInIiLCJuYW1lcyIsIm5hbWUiLCJpZHMiLCJyb2xlTmFtZXMiLCJfZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMiLCJBcnJheSIsImNsZWFyUm9sZUNhY2hlIiwiZGVsIiwiZ2V0Um9sZXNCeUlkcyIsImlucyIsImNvbnRhaW5lZEluIiwicm9sZXMiLCIkaW4iLCJyb2xlSURzIiwicXVlcmllZFJvbGVzIiwicm9sZUlEIiwid2FzUXVlcmllZCIsIlNldCIsInJlc3VsdE1hcCIsIm1lbW8iLCJjb25jYXQiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJhdXRoRGF0YSIsInByb3ZpZGVycyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJwcm92aWRlckRhdGEiLCJ1c2VyUHJvdmlkZXJBdXRoRGF0YSIsImlzRGVlcFN0cmljdEVxdWFsIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsInNhdmVkVXNlclByb3ZpZGVycyIsImFkYXB0ZXIiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciIsInNvbWUiLCJwb2xpY3kiLCJhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kIiwiaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIiwiT1RIRVJfQ0FVU0UiLCJqb2luIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwicmVxIiwiZm91bmRVc2VyIiwiVXNlciIsImF1dGgiLCJnZXRVc2VySWQiLCJmZXRjaCIsIm9yaWdpbmFsT2JqZWN0IiwidXBkYXRlZE9iamVjdCIsImJ1aWxkUGFyc2VPYmplY3RzIiwicmVxdWVzdE9iamVjdCIsImdldFJlcXVlc3RPYmplY3QiLCJhY2MiLCJhdXRoRGF0YVJlc3BvbnNlIiwiYXV0aEtleXMiLCJzb3J0IiwibWV0aG9kIiwidmFsaWRhdG9yIiwiYXV0aFByb3ZpZGVyIiwiZW5hYmxlZCIsIkRlcHJlY2F0b3IiLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJ1c2FnZSIsInNvbHV0aW9uIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInZhbGlkYXRpb25SZXN1bHQiLCJ0cmlnZ2VyTmFtZSIsImRvTm90U2F2ZSIsInNhdmUiLCJlcnIiLCJlIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwidXNlclN0cmluZyIsImRhdGEiLCJsb2dnZXIiLCJlcnJvciIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0F1dGguanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCwgcmVzb2x2ZUVycm9yIH0gZnJvbSAnLi90cmlnZ2Vycyc7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbi8vIEFuIEF1dGggb2JqZWN0IHRlbGxzIHlvdSB3aG8gaXMgcmVxdWVzdGluZyBzb21ldGhpbmcgYW5kIHdoZXRoZXJcbi8vIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuLy8gdXNlck9iamVjdCBpcyBhIFBhcnNlLlVzZXIgYW5kIGNhbiBiZSBudWxsIGlmIHRoZXJlJ3Mgbm8gdXNlci5cbmZ1bmN0aW9uIEF1dGgoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlciA9IHVuZGVmaW5lZCxcbiAgaXNNYXN0ZXIgPSBmYWxzZSxcbiAgaXNNYWludGVuYW5jZSA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMuaXNNYWludGVuYW5jZSA9IGlzTWFpbnRlbmFuY2U7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3Rlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1hc3Rlcihjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFpbnRlbmFuY2UtbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1haW50ZW5hbmNlKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFpbnRlbmFuY2U6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gcmVhZE9ubHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGlzUmVhZE9ubHk6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG5vYm9keS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbm9ib2R5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiBmYWxzZSB9KTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBBdXRoIG9iamVjdFxuY29uc3QgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyLFxuICBzZXNzaW9uVG9rZW4sXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICBjYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IHVzZXJKU09OID0gYXdhaXQgY2FjaGVDb250cm9sbGVyLnVzZXIuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKHVzZXJKU09OKSB7XG4gICAgICBjb25zdCBjYWNoZWRVc2VyID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHVzZXJKU09OKTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gICAgcmVzdWx0cyA9IChhd2FpdCBxdWVyeS5leGVjdXRlKCkpLnJlc3VsdHM7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cyA9IChcbiAgICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmluY2x1ZGUoJ3VzZXInKVxuICAgICAgICAuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KVxuICAgICkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gIH1cbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSByZXN1bHRzWzBdLmV4cGlyZXNBdCA/IG5ldyBEYXRlKHJlc3VsdHNbMF0uZXhwaXJlc0F0LmlzbykgOiB1bmRlZmluZWQ7XG4gIGlmIChleHBpcmVzQXQgPCBub3cpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiBpcyBleHBpcmVkLicpO1xuICB9XG4gIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF1bJ3VzZXInXTtcbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfVXNlcicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCB0aGlzLmlzTWFpbnRlbmFuY2UgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBhd2FpdCBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBtYXN0ZXIodGhpcy5jb25maWcpLCAnX1JvbGUnLCByZXN0V2hlcmUsIHt9KS5lYWNoKHJlc3VsdCA9PlxuICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdClcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSAoY29uZmlnLCBhdXRoRGF0YSkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdIHx8IChhdXRoRGF0YSAmJiAhYXV0aERhdGFbcHJvdmlkZXJdLmlkKSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgcmV0dXJuIHF1ZXJ5Lmxlbmd0aCA+IDBcbiAgICA/IGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiBxdWVyeSB9LCB7IGxpbWl0OiAyIH0pXG4gICAgOiBQcm9taXNlLnJlc29sdmUoW10pO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YTogdHJ1ZSwgbXV0YXRlZEF1dGhEYXRhOiBhdXRoRGF0YSB9O1xuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHJldHVybjtcbiAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgY29uc3QgdXNlclByb3ZpZGVyQXV0aERhdGEgPSB1c2VyQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGlmICghaXNEZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyUHJvdmlkZXJBdXRoRGF0YSkpIHtcbiAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gIHJldHVybiB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH07XG59O1xuXG5jb25zdCBjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luID0gKFxuICBhdXRoRGF0YSA9IHt9LFxuICB1c2VyQXV0aERhdGEgPSB7fSxcbiAgY29uZmlnXG4pID0+IHtcbiAgY29uc3Qgc2F2ZWRVc2VyUHJvdmlkZXJzID0gT2JqZWN0LmtleXModXNlckF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4gKHtcbiAgICBuYW1lOiBwcm92aWRlcixcbiAgICBhZGFwdGVyOiBjb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKS5hZGFwdGVyLFxuICB9KSk7XG5cbiAgY29uc3QgaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUoXG4gICAgcHJvdmlkZXIgPT5cbiAgICAgIHByb3ZpZGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIgJiYgcHJvdmlkZXIuYWRhcHRlci5wb2xpY3kgPT09ICdzb2xvJyAmJiBhdXRoRGF0YVtwcm92aWRlci5uYW1lXVxuICApO1xuXG4gIC8vIFNvbG8gcHJvdmlkZXJzIGNhbiBiZSBjb25zaWRlcmVkIGFzIHNhZmUsIHNvIHdlIGRvIG5vdCBoYXZlIHRvIGNoZWNrIGlmIHRoZSB1c2VyIG5lZWRzXG4gIC8vIHRvIHByb3ZpZGUgYW4gYWRkaXRpb25hbCBwcm92aWRlciB0byBsb2dpbi4gQW4gYXV0aCBhZGFwdGVyIHdpdGggXCJzb2xvXCIgKGxpa2Ugd2ViYXV0aG4pIG1lYW5zXG4gIC8vIG5vIFwiYWRkaXRpb25hbFwiIGF1dGggbmVlZHMgdG8gYmUgcHJvdmlkZWQgdG8gbG9naW4gKGxpa2UgT1RQLCBNRkEpXG4gIGlmIChoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kID0gW107XG4gIGNvbnN0IGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICBpZiAocHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAtYnktc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdElkOyBvbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IHVzZXIgb3IgbWFzdGVyIGtleSBpcyBwcm92aWRlZFxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSByZXEuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgdW5kZWZpbmVkLFxuICAgIHJlcS5hdXRoLFxuICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgb3JpZ2luYWxPYmplY3QgfHwgdXNlcixcbiAgICByZXEuY29uZmlnXG4gICk7XG4gIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBhcyBzdGVwLWJ5LXN0ZXAgcGlwZWxpbmUgZm9yIGJldHRlciBlcnJvciBjb25zaXN0ZW5jeVxuICAvLyBhbmQgYWxzbyB0byBhdm9pZCB0byB0cmlnZ2VyIGEgcHJvdmlkZXIgKGxpa2UgT1RQIFNNUykgaWYgYW5vdGhlciBvbmUgZmFpbHNcbiAgY29uc3QgYWNjID0geyBhdXRoRGF0YToge30sIGF1dGhEYXRhUmVzcG9uc2U6IHt9IH07XG4gIGNvbnN0IGF1dGhLZXlzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvcnQoKTtcbiAgZm9yIChjb25zdCBwcm92aWRlciBvZiBhdXRoS2V5cykge1xuICAgIGxldCBtZXRob2QgPSAnJztcbiAgICB0cnkge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gbnVsbDtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgY29uc3QgYXV0aFByb3ZpZGVyID0gKHJlcS5jb25maWcuYXV0aCB8fCB7fSlbcHJvdmlkZXJdIHx8IHt9O1xuICAgICAgaWYgKGF1dGhQcm92aWRlci5lbmFibGVkID09IG51bGwpIHtcbiAgICAgICAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgICAgICAgIHVzYWdlOiBgVXNpbmcgdGhlIGF1dGhlbnRpY2F0aW9uIGFkYXB0ZXIgXCIke3Byb3ZpZGVyfVwiIHdpdGhvdXQgZXhwbGljaXRseSBlbmFibGluZyBpdGAsXG4gICAgICAgICAgc29sdXRpb246IGBFbmFibGUgdGhlIGF1dGhlbnRpY2F0aW9uIGFkYXB0ZXIgYnkgc2V0dGluZyB0aGUgUGFyc2UgU2VydmVyIG9wdGlvbiBcImF1dGguJHtwcm92aWRlcn0uZW5hYmxlZDogdHJ1ZVwiLmAsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0b3IgfHwgYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgdXNlciwgcmVxdWVzdE9iamVjdCk7XG4gICAgICBtZXRob2QgPSB2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQubWV0aG9kO1xuICAgICAgcmVxdWVzdE9iamVjdC50cmlnZ2VyTmFtZSA9IG1ldGhvZDtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKSB7XG4gICAgICAgIHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcigpO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3Qua2V5cyh2YWxpZGF0aW9uUmVzdWx0KS5sZW5ndGgpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVJlc3BvbnNlW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2U7XG4gICAgICB9XG4gICAgICAvLyBTb21lIGF1dGggcHJvdmlkZXJzIGFmdGVyIGluaXRpYWxpemF0aW9uIHdpbGwgYXZvaWQgdG8gcmVwbGFjZSBhdXRoRGF0YSBhbHJlYWR5IHN0b3JlZFxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LmRvTm90U2F2ZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5zYXZlIHx8IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdBdXRoIGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICBjb25zdCB1c2VyU3RyaW5nID1cbiAgICAgICAgcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiByZXEuZGF0YS5vYmplY3RJZCB8fCB1bmRlZmluZWQ7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgJHttZXRob2R9IGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICB7XG4gICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiBtZXRob2QsXG4gICAgICAgICAgZXJyb3I6IGUsXG4gICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG4gIHJldHVybiBhY2M7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQXV0aCxcbiAgbWFzdGVyLFxuICBtYWludGVuYW5jZSxcbiAgbm9ib2R5LFxuICByZWFkT25seSxcbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbixcbiAgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbixcbiAgZmluZFVzZXJzV2l0aEF1dGhEYXRhLFxuICBoYXNNdXRhdGVkQXV0aERhdGEsXG4gIGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4sXG4gIGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbixcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBRCxPQUFB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