"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var SchemaController = require('./Controllers/SchemaController');
var Parse = require('parse/node').Parse;
const triggers = require('./triggers');
const {
  continueWhile
} = require('parse/lib/node/promiseUtils');
const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL'];
const {
  enforceRoleSecurity
} = require('./SharedRest');

// restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   excludeKeys
//   redirectClassNameForKey
//   readPreference
//   includeReadPreference
//   subqueryReadPreference
/**
 * Use to perform a query on a class. It will run security checks and triggers.
 * @param options
 * @param options.method {RestQuery.Method} The type of query to perform
 * @param options.config {ParseServerConfiguration} The server configuration
 * @param options.auth {Auth} The auth object for the request
 * @param options.className {string} The name of the class to query
 * @param options.restWhere {object} The where object for the query
 * @param options.restOptions {object} The options object for the query
 * @param options.clientSDK {string} The client SDK that is performing the query
 * @param options.runAfterFind {boolean} Whether to run the afterFind trigger
 * @param options.runBeforeFind {boolean} Whether to run the beforeFind trigger
 * @param options.context {object} The context object for the query
 * @returns {Promise<_UnsafeRestQuery>} A promise that is resolved with the _UnsafeRestQuery object
 */
async function RestQuery({
  method,
  config,
  auth,
  className,
  restWhere = {},
  restOptions = {},
  clientSDK,
  runAfterFind = true,
  runBeforeFind = true,
  context
}) {
  if (![RestQuery.Method.find, RestQuery.Method.get].includes(method)) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'bad query type');
  }
  enforceRoleSecurity(method, className, auth);
  const result = runBeforeFind ? await triggers.maybeRunQueryTrigger(triggers.Types.beforeFind, className, restWhere, restOptions, config, auth, context, method === RestQuery.Method.get) : Promise.resolve({
    restWhere,
    restOptions
  });
  return new _UnsafeRestQuery(config, auth, className, result.restWhere || restWhere, result.restOptions || restOptions, clientSDK, runAfterFind, context);
}
RestQuery.Method = Object.freeze({
  get: 'get',
  find: 'find'
});

/**
 * _UnsafeRestQuery is meant for specific internal usage only. When you need to skip security checks or some triggers.
 * Don't use it if you don't know what you are doing.
 * @param config
 * @param auth
 * @param className
 * @param restWhere
 * @param restOptions
 * @param clientSDK
 * @param runAfterFind
 * @param context
 */
function _UnsafeRestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK, runAfterFind = true, context) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.runAfterFind = runAfterFind;
  this.response = null;
  this.findOptions = {};
  this.context = context || {};
  if (!this.auth.isMaster) {
    if (this.className == '_Session') {
      if (!this.auth.user) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      }
      this.restWhere = {
        $and: [this.restWhere, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }
  this.doCount = false;
  this.includeAll = false;

  // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]
  this.include = [];
  let keysForInclude = '';

  // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185
  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    keysForInclude = restOptions.keys;
  }

  // If we have keys, we probably want to force some includes (n-1 level)
  // in order to exclude specific keys.
  if (Object.prototype.hasOwnProperty.call(restOptions, 'excludeKeys')) {
    keysForInclude += ',' + restOptions.excludeKeys;
  }
  if (keysForInclude.length > 0) {
    keysForInclude = keysForInclude.split(',').filter(key => {
      // At least 2 components
      return key.split('.').length > 1;
    }).map(key => {
      // Slice the last component (a.b.c -> a.b)
      // Otherwise we'll include one level too much.
      return key.slice(0, key.lastIndexOf('.'));
    }).join(',');

    // Concat the possibly present include string with the one from the keys
    // Dedup / sorting is handle in 'include' case.
    if (keysForInclude.length > 0) {
      if (!restOptions.include || restOptions.include.length == 0) {
        restOptions.include = keysForInclude;
      } else {
        restOptions.include += ',' + keysForInclude;
      }
    }
  }
  for (var option in restOptions) {
    switch (option) {
      case 'keys':
        {
          const keys = restOptions.keys.split(',').filter(key => key.length > 0).concat(AlwaysSelectedKeys);
          this.keys = Array.from(new Set(keys));
          break;
        }
      case 'excludeKeys':
        {
          const exclude = restOptions.excludeKeys.split(',').filter(k => AlwaysSelectedKeys.indexOf(k) < 0);
          this.excludeKeys = Array.from(new Set(exclude));
          break;
        }
      case 'count':
        this.doCount = true;
        break;
      case 'includeAll':
        this.includeAll = true;
        break;
      case 'explain':
      case 'hint':
      case 'distinct':
      case 'pipeline':
      case 'skip':
      case 'limit':
      case 'readPreference':
      case 'comment':
        this.findOptions[option] = restOptions[option];
        break;
      case 'order':
        var fields = restOptions.order.split(',');
        this.findOptions.sort = fields.reduce((sortMap, field) => {
          field = field.trim();
          if (field === '$score' || field === '-$score') {
            sortMap.score = {
              $meta: 'textScore'
            };
          } else if (field[0] == '-') {
            sortMap[field.slice(1)] = -1;
          } else {
            sortMap[field] = 1;
          }
          return sortMap;
        }, {});
        break;
      case 'include':
        {
          const paths = restOptions.include.split(',');
          if (paths.includes('*')) {
            this.includeAll = true;
            break;
          }
          // Load the existing includes (from keys)
          const pathSet = paths.reduce((memo, path) => {
            // Split each paths on . (a.b.c -> [a,b,c])
            // reduce to create all paths
            // ([a,b,c] -> {a: true, 'a.b': true, 'a.b.c': true})
            return path.split('.').reduce((memo, path, index, parts) => {
              memo[parts.slice(0, index + 1).join('.')] = true;
              return memo;
            }, memo);
          }, {});
          this.include = Object.keys(pathSet).map(s => {
            return s.split('.');
          }).sort((a, b) => {
            return a.length - b.length; // Sort by number of components
          });
          break;
        }
      case 'redirectClassNameForKey':
        this.redirectKey = restOptions.redirectClassNameForKey;
        this.redirectClassName = null;
        break;
      case 'includeReadPreference':
      case 'subqueryReadPreference':
        break;
      default:
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad option: ' + option);
    }
  }
}

// A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions
_UnsafeRestQuery.prototype.execute = function (executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.denyProtectedFields();
  }).then(() => {
    return this.handleIncludeAll();
  }).then(() => {
    return this.handleExcludeKeys();
  }).then(() => {
    return this.runFind(executeOptions);
  }).then(() => {
    return this.runCount();
  }).then(() => {
    return this.handleInclude();
  }).then(() => {
    return this.runAfterFindTrigger();
  }).then(() => {
    return this.handleAuthAdapters();
  }).then(() => {
    return this.response;
  });
};
_UnsafeRestQuery.prototype.each = function (callback) {
  const {
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK
  } = this;
  // if the limit is set, use it
  restOptions.limit = restOptions.limit || 100;
  restOptions.order = 'objectId';
  let finished = false;
  return continueWhile(() => {
    return !finished;
  }, async () => {
    // Safe here to use _UnsafeRestQuery because the security was already
    // checked during "await RestQuery()"
    const query = new _UnsafeRestQuery(config, auth, className, restWhere, restOptions, clientSDK, this.runAfterFind, this.context);
    const {
      results
    } = await query.execute();
    results.forEach(callback);
    finished = results.length < restOptions.limit;
    if (!finished) {
      restWhere.objectId = Object.assign({}, restWhere.objectId, {
        $gt: results[results.length - 1].objectId
      });
    }
  });
};
_UnsafeRestQuery.prototype.buildRestWhere = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.redirectClassNameForKey();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.replaceSelect();
  }).then(() => {
    return this.replaceDontSelect();
  }).then(() => {
    return this.replaceInQuery();
  }).then(() => {
    return this.replaceNotInQuery();
  }).then(() => {
    return this.replaceEquality();
  });
};

// Uses the Auth object to get the list of roles, adds the user id
_UnsafeRestQuery.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }
  this.findOptions.acl = ['*'];
  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.findOptions.acl = this.findOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Changes the className if redirectClassNameForKey is set.
// Returns a promise.
_UnsafeRestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  }

  // We need to change the class name based on the schema
  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
};

// Validates this operation against the allowClientClassCreation config.
_UnsafeRestQuery.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};
function transformInQuery(inQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete inQueryObject['$inQuery'];
  if (Array.isArray(inQueryObject['$in'])) {
    inQueryObject['$in'] = inQueryObject['$in'].concat(values);
  } else {
    inQueryObject['$in'] = values;
  }
}

// Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.
_UnsafeRestQuery.prototype.replaceInQuery = async function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');
  if (!inQueryObject) {
    return;
  }

  // The inQuery value must have precisely two keys - where and className
  var inQueryValue = inQueryObject['$inQuery'];
  if (!inQueryValue.where || !inQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $inQuery');
  }
  const additionalOptions = {
    redirectClassNameForKey: inQueryValue.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: inQueryValue.className,
    restWhere: inQueryValue.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformInQuery(inQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceInQuery();
  });
};
function transformNotInQuery(notInQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete notInQueryObject['$notInQuery'];
  if (Array.isArray(notInQueryObject['$nin'])) {
    notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
  } else {
    notInQueryObject['$nin'] = values;
  }
}

// Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.
_UnsafeRestQuery.prototype.replaceNotInQuery = async function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');
  if (!notInQueryObject) {
    return;
  }

  // The notInQuery value must have precisely two keys - where and className
  var notInQueryValue = notInQueryObject['$notInQuery'];
  if (!notInQueryValue.where || !notInQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $notInQuery');
  }
  const additionalOptions = {
    redirectClassNameForKey: notInQueryValue.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: notInQueryValue.className,
    restWhere: notInQueryValue.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceNotInQuery();
  });
};

// Used to get the deepest object from json using dot notation.
const getDeepestObjectFromKey = (json, key, idx, src) => {
  if (key in json) {
    return json[key];
  }
  src.splice(1); // Exit Early
};
const transformSelect = (selectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete selectObject['$select'];
  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
};

// Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.
_UnsafeRestQuery.prototype.replaceSelect = async function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');
  if (!selectObject) {
    return;
  }

  // The select value must have precisely two keys - query and key
  var selectValue = selectObject['$select'];
  // iOS SDK don't send where if not set, let it pass
  if (!selectValue.query || !selectValue.key || typeof selectValue.query !== 'object' || !selectValue.query.className || Object.keys(selectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $select');
  }
  const additionalOptions = {
    redirectClassNameForKey: selectValue.query.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: selectValue.query.className,
    restWhere: selectValue.query.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformSelect(selectObject, selectValue.key, response.results);
    // Keep replacing $select clauses
    return this.replaceSelect();
  });
};
const transformDontSelect = (dontSelectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete dontSelectObject['$dontSelect'];
  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
};

// Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.
_UnsafeRestQuery.prototype.replaceDontSelect = async function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');
  if (!dontSelectObject) {
    return;
  }

  // The dontSelect value must have precisely two keys - query and key
  var dontSelectValue = dontSelectObject['$dontSelect'];
  if (!dontSelectValue.query || !dontSelectValue.key || typeof dontSelectValue.query !== 'object' || !dontSelectValue.query.className || Object.keys(dontSelectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $dontSelect');
  }
  const additionalOptions = {
    redirectClassNameForKey: dontSelectValue.query.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: dontSelectValue.query.className,
    restWhere: dontSelectValue.query.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results);
    // Keep replacing $dontSelect clauses
    return this.replaceDontSelect();
  });
};
_UnsafeRestQuery.prototype.cleanResultAuthData = function (result) {
  delete result.password;
  if (result.authData) {
    Object.keys(result.authData).forEach(provider => {
      if (result.authData[provider] === null) {
        delete result.authData[provider];
      }
    });
    if (Object.keys(result.authData).length == 0) {
      delete result.authData;
    }
  }
};
const replaceEqualityConstraint = constraint => {
  if (typeof constraint !== 'object') {
    return constraint;
  }
  const equalToObject = {};
  let hasDirectConstraint = false;
  let hasOperatorConstraint = false;
  for (const key in constraint) {
    if (key.indexOf('$') !== 0) {
      hasDirectConstraint = true;
      equalToObject[key] = constraint[key];
    } else {
      hasOperatorConstraint = true;
    }
  }
  if (hasDirectConstraint && hasOperatorConstraint) {
    constraint['$eq'] = equalToObject;
    Object.keys(equalToObject).forEach(key => {
      delete constraint[key];
    });
  }
  return constraint;
};
_UnsafeRestQuery.prototype.replaceEquality = function () {
  if (typeof this.restWhere !== 'object') {
    return;
  }
  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
};

// Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.
_UnsafeRestQuery.prototype.runFind = async function (options = {}) {
  if (this.findOptions.limit === 0) {
    this.response = {
      results: []
    };
    return Promise.resolve();
  }
  const findOptions = Object.assign({}, this.findOptions);
  if (this.keys) {
    findOptions.keys = this.keys.map(key => {
      return key.split('.')[0];
    });
  }
  if (options.op) {
    findOptions.op = options.op;
  }
  const results = await this.config.database.find(this.className, this.restWhere, findOptions, this.auth);
  if (this.className === '_User' && !findOptions.explain) {
    for (var result of results) {
      this.cleanResultAuthData(result);
    }
  }
  await this.config.filesController.expandFilesInObject(this.config, results);
  if (this.redirectClassName) {
    for (var r of results) {
      r.className = this.redirectClassName;
    }
  }
  this.response = {
    results: results
  };
};

// Returns a promise for whether it was successful.
// Populates this.response.count with the count
_UnsafeRestQuery.prototype.runCount = function () {
  if (!this.doCount) {
    return;
  }
  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database.find(this.className, this.restWhere, this.findOptions).then(c => {
    this.response.count = c;
  });
};
_UnsafeRestQuery.prototype.denyProtectedFields = async function () {
  if (this.auth.isMaster) {
    return;
  }
  const schemaController = await this.config.database.loadSchema();
  const protectedFields = this.config.database.addProtectedFields(schemaController, this.className, this.restWhere, this.findOptions.acl, this.auth, this.findOptions) || [];
  for (const key of protectedFields) {
    if (this.restWhere[key]) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `This user is not allowed to query ${key} on class ${this.className}`);
    }
  }
};

// Augments this.response with all pointers on an object
_UnsafeRestQuery.prototype.handleIncludeAll = function () {
  if (!this.includeAll) {
    return;
  }
  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const includeFields = [];
    const keyFields = [];
    for (const field in schema.fields) {
      if (schema.fields[field].type && schema.fields[field].type === 'Pointer' || schema.fields[field].type && schema.fields[field].type === 'Array') {
        includeFields.push([field]);
        keyFields.push(field);
      }
    }
    // Add fields to include, keys, remove dups
    this.include = [...new Set([...this.include, ...includeFields])];
    // if this.keys not set, then all keys are already included
    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
};

// Updates property `this.keys` to contain all keys but the ones unselected.
_UnsafeRestQuery.prototype.handleExcludeKeys = function () {
  if (!this.excludeKeys) {
    return;
  }
  if (this.keys) {
    this.keys = this.keys.filter(k => !this.excludeKeys.includes(k));
    return;
  }
  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const fields = Object.keys(schema.fields);
    this.keys = fields.filter(k => !this.excludeKeys.includes(k));
  });
};

// Augments this.response with data at the paths provided in this.include.
_UnsafeRestQuery.prototype.handleInclude = function () {
  if (this.include.length == 0) {
    return;
  }
  var pathResponse = includePath(this.config, this.auth, this.response, this.include[0], this.context, this.restOptions);
  if (pathResponse.then) {
    return pathResponse.then(newResponse => {
      this.response = newResponse;
      this.include = this.include.slice(1);
      return this.handleInclude();
    });
  } else if (this.include.length > 0) {
    this.include = this.include.slice(1);
    return this.handleInclude();
  }
  return pathResponse;
};

//Returns a promise of a processed set of results
_UnsafeRestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  }
  if (!this.runAfterFind) {
    return;
  }
  // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.
  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);
  if (!hasAfterFindHook) {
    return Promise.resolve();
  }
  // Skip Aggregate and Distinct Queries
  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  }
  const json = Object.assign({}, this.restOptions);
  json.where = this.restWhere;
  const parseQuery = new Parse.Query(this.className);
  parseQuery.withJSON(json);
  // Run afterFind trigger and set the new results
  return triggers.maybeRunAfterFindTrigger(triggers.Types.afterFind, this.auth, this.className, this.response.results, this.config, parseQuery, this.context).then(results => {
    // Ensure we properly set the className back
    if (this.redirectClassName) {
      this.response.results = results.map(object => {
        if (object instanceof Parse.Object) {
          object = object.toJSON();
        }
        object.className = this.redirectClassName;
        return object;
      });
    } else {
      this.response.results = results;
    }
  });
};
_UnsafeRestQuery.prototype.handleAuthAdapters = async function () {
  if (this.className !== '_User' || this.findOptions.explain) {
    return;
  }
  await Promise.all(this.response.results.map(result => this.config.authDataManager.runAfterFind({
    config: this.config,
    auth: this.auth
  }, result.authData)));
};

// Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.
function includePath(config, auth, response, path, context, restOptions = {}) {
  var pointers = findPointers(response.results, path);
  if (pointers.length == 0) {
    return response;
  }
  const pointersHash = {};
  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }
    const className = pointer.className;
    // only include the good pointers
    if (className) {
      pointersHash[className] = pointersHash[className] || new Set();
      pointersHash[className].add(pointer.objectId);
    }
  }
  const includeRestOptions = {};
  if (restOptions.keys) {
    const keys = new Set(restOptions.keys.split(','));
    const keySet = Array.from(keys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;
      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      if (i < keyPath.length) {
        set.add(keyPath[i]);
      }
      return set;
    }, new Set());
    if (keySet.size > 0) {
      includeRestOptions.keys = Array.from(keySet).join(',');
    }
  }
  if (restOptions.excludeKeys) {
    const excludeKeys = new Set(restOptions.excludeKeys.split(','));
    const excludeKeySet = Array.from(excludeKeys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;
      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      if (i == keyPath.length - 1) {
        set.add(keyPath[i]);
      }
      return set;
    }, new Set());
    if (excludeKeySet.size > 0) {
      includeRestOptions.excludeKeys = Array.from(excludeKeySet).join(',');
    }
  }
  if (restOptions.includeReadPreference) {
    includeRestOptions.readPreference = restOptions.includeReadPreference;
    includeRestOptions.includeReadPreference = restOptions.includeReadPreference;
  } else if (restOptions.readPreference) {
    includeRestOptions.readPreference = restOptions.readPreference;
  }
  const queryPromises = Object.keys(pointersHash).map(async className => {
    const objectIds = Array.from(pointersHash[className]);
    let where;
    if (objectIds.length === 1) {
      where = {
        objectId: objectIds[0]
      };
    } else {
      where = {
        objectId: {
          $in: objectIds
        }
      };
    }
    const query = await RestQuery({
      method: objectIds.length === 1 ? RestQuery.Method.get : RestQuery.Method.find,
      config,
      auth,
      className,
      restWhere: where,
      restOptions: includeRestOptions,
      context: context
    });
    return query.execute({
      op: 'get'
    }).then(results => {
      results.className = className;
      return Promise.resolve(results);
    });
  });

  // Get the objects for all these object ids
  return Promise.all(queryPromises).then(responses => {
    var replace = responses.reduce((replace, includeResponse) => {
      for (var obj of includeResponse.results) {
        obj.__type = 'Object';
        obj.className = includeResponse.className;
        if (obj.className == '_User' && !auth.isMaster) {
          delete obj.sessionToken;
          delete obj.authData;
        }
        replace[obj.objectId] = obj;
      }
      return replace;
    }, {});
    var resp = {
      results: replacePointers(response.results, path, replace)
    };
    if (response.count) {
      resp.count = response.count;
    }
    return resp;
  });
}

// Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// If the path yields things that aren't pointers, this throws an error.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.
function findPointers(object, path) {
  if (object instanceof Array) {
    return object.map(x => findPointers(x, path)).flat();
  }
  if (typeof object !== 'object' || !object) {
    return [];
  }
  if (path.length == 0) {
    if (object === null || object.__type == 'Pointer') {
      return [object];
    }
    return [];
  }
  var subobject = object[path[0]];
  if (!subobject) {
    return [];
  }
  return findPointers(subobject, path.slice(1));
}

// Object may be a list of REST-format objects to replace pointers
// in, or it may be a single object.
// Path is a list of fields to search into.
// replace is a map from object id -> object.
// Returns something analogous to object, but with the appropriate
// pointers inflated.
function replacePointers(object, path, replace) {
  if (object instanceof Array) {
    return object.map(obj => replacePointers(obj, path, replace)).filter(obj => typeof obj !== 'undefined');
  }
  if (typeof object !== 'object' || !object) {
    return object;
  }
  if (path.length === 0) {
    if (object && object.__type === 'Pointer') {
      return replace[object.objectId];
    }
    return object;
  }
  var subobject = object[path[0]];
  if (!subobject) {
    return object;
  }
  var newsub = replacePointers(subobject, path.slice(1), replace);
  var answer = {};
  for (var key in object) {
    if (key == path[0]) {
      answer[key] = newsub;
    } else {
      answer[key] = object[key];
    }
  }
  return answer;
}

// Finds a subobject that has the given key, if there is one.
// Returns undefined otherwise.
function findObjectWithKey(root, key) {
  if (typeof root !== 'object') {
    return;
  }
  if (root instanceof Array) {
    for (var item of root) {
      const answer = findObjectWithKey(item, key);
      if (answer) {
        return answer;
      }
    }
  }
  if (root && root[key]) {
    return root;
  }
  for (var subkey in root) {
    const answer = findObjectWithKey(root[subkey], key);
    if (answer) {
      return answer;
    }
  }
}
module.exports = RestQuery;
// For tests
module.exports._UnsafeRestQuery = _UnsafeRestQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiZW5mb3JjZVJvbGVTZWN1cml0eSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJjb250ZXh0IiwiTWV0aG9kIiwiZmluZCIsImdldCIsImluY2x1ZGVzIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwicmVzdWx0IiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZUZpbmQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9VbnNhZmVSZXN0UXVlcnkiLCJPYmplY3QiLCJmcmVlemUiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiJGFuZCIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJkb0NvdW50IiwiaW5jbHVkZUFsbCIsImluY2x1ZGUiLCJrZXlzRm9ySW5jbHVkZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImtleXMiLCJleGNsdWRlS2V5cyIsImxlbmd0aCIsInNwbGl0IiwiZmlsdGVyIiwia2V5IiwibWFwIiwic2xpY2UiLCJsYXN0SW5kZXhPZiIsImpvaW4iLCJvcHRpb24iLCJjb25jYXQiLCJBcnJheSIsImZyb20iLCJTZXQiLCJleGNsdWRlIiwiayIsImluZGV4T2YiLCJmaWVsZHMiLCJvcmRlciIsInNvcnQiLCJyZWR1Y2UiLCJzb3J0TWFwIiwiZmllbGQiLCJ0cmltIiwic2NvcmUiLCIkbWV0YSIsInBhdGhzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImRlbnlQcm90ZWN0ZWRGaWVsZHMiLCJoYW5kbGVJbmNsdWRlQWxsIiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImhhbmRsZUF1dGhBZGFwdGVycyIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJyZXBsYWNlU2VsZWN0IiwicmVwbGFjZURvbnRTZWxlY3QiLCJyZXBsYWNlSW5RdWVyeSIsInJlcGxhY2VOb3RJblF1ZXJ5IiwicmVwbGFjZUVxdWFsaXR5IiwiYWNsIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJkYXRhYmFzZSIsIm5ld0NsYXNzTmFtZSIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJsb2FkU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsImhhc0NsYXNzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInRyYW5zZm9ybUluUXVlcnkiLCJpblF1ZXJ5T2JqZWN0IiwidmFsdWVzIiwicHVzaCIsImlzQXJyYXkiLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhbGwiLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwieCIsImZsYXQiLCJzdWJvYmplY3QiLCJuZXdzdWIiLCJhbnN3ZXIiLCJyb290IiwiaXRlbSIsInN1YmtleSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvUmVzdFF1ZXJ5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEFuIG9iamVjdCB0aGF0IGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGEgJ2ZpbmQnXG4vLyBvcGVyYXRpb24sIGVuY29kZWQgaW4gdGhlIFJFU1QgQVBJIGZvcm1hdC5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xuY29uc3QgeyBjb250aW51ZVdoaWxlIH0gPSByZXF1aXJlKCdwYXJzZS9saWIvbm9kZS9wcm9taXNlVXRpbHMnKTtcbmNvbnN0IEFsd2F5c1NlbGVjdGVkS2V5cyA9IFsnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCcsICdBQ0wnXTtcbmNvbnN0IHsgZW5mb3JjZVJvbGVTZWN1cml0eSB9ID0gcmVxdWlyZSgnLi9TaGFyZWRSZXN0Jyk7XG5cbi8vIHJlc3RPcHRpb25zIGNhbiBpbmNsdWRlOlxuLy8gICBza2lwXG4vLyAgIGxpbWl0XG4vLyAgIG9yZGVyXG4vLyAgIGNvdW50XG4vLyAgIGluY2x1ZGVcbi8vICAga2V5c1xuLy8gICBleGNsdWRlS2V5c1xuLy8gICByZWRpcmVjdENsYXNzTmFtZUZvcktleVxuLy8gICByZWFkUHJlZmVyZW5jZVxuLy8gICBpbmNsdWRlUmVhZFByZWZlcmVuY2Vcbi8vICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZVxuLyoqXG4gKiBVc2UgdG8gcGVyZm9ybSBhIHF1ZXJ5IG9uIGEgY2xhc3MuIEl0IHdpbGwgcnVuIHNlY3VyaXR5IGNoZWNrcyBhbmQgdHJpZ2dlcnMuXG4gKiBAcGFyYW0gb3B0aW9uc1xuICogQHBhcmFtIG9wdGlvbnMubWV0aG9kIHtSZXN0UXVlcnkuTWV0aG9kfSBUaGUgdHlwZSBvZiBxdWVyeSB0byBwZXJmb3JtXG4gKiBAcGFyYW0gb3B0aW9ucy5jb25maWcge1BhcnNlU2VydmVyQ29uZmlndXJhdGlvbn0gVGhlIHNlcnZlciBjb25maWd1cmF0aW9uXG4gKiBAcGFyYW0gb3B0aW9ucy5hdXRoIHtBdXRofSBUaGUgYXV0aCBvYmplY3QgZm9yIHRoZSByZXF1ZXN0XG4gKiBAcGFyYW0gb3B0aW9ucy5jbGFzc05hbWUge3N0cmluZ30gVGhlIG5hbWUgb2YgdGhlIGNsYXNzIHRvIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5yZXN0V2hlcmUge29iamVjdH0gVGhlIHdoZXJlIG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5yZXN0T3B0aW9ucyB7b2JqZWN0fSBUaGUgb3B0aW9ucyBvYmplY3QgZm9yIHRoZSBxdWVyeVxuICogQHBhcmFtIG9wdGlvbnMuY2xpZW50U0RLIHtzdHJpbmd9IFRoZSBjbGllbnQgU0RLIHRoYXQgaXMgcGVyZm9ybWluZyB0aGUgcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJ1bkFmdGVyRmluZCB7Ym9vbGVhbn0gV2hldGhlciB0byBydW4gdGhlIGFmdGVyRmluZCB0cmlnZ2VyXG4gKiBAcGFyYW0gb3B0aW9ucy5ydW5CZWZvcmVGaW5kIHtib29sZWFufSBXaGV0aGVyIHRvIHJ1biB0aGUgYmVmb3JlRmluZCB0cmlnZ2VyXG4gKiBAcGFyYW0gb3B0aW9ucy5jb250ZXh0IHtvYmplY3R9IFRoZSBjb250ZXh0IG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcmV0dXJucyB7UHJvbWlzZTxfVW5zYWZlUmVzdFF1ZXJ5Pn0gQSBwcm9taXNlIHRoYXQgaXMgcmVzb2x2ZWQgd2l0aCB0aGUgX1Vuc2FmZVJlc3RRdWVyeSBvYmplY3RcbiAqL1xuYXN5bmMgZnVuY3Rpb24gUmVzdFF1ZXJ5KHtcbiAgbWV0aG9kLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlID0ge30sXG4gIHJlc3RPcHRpb25zID0ge30sXG4gIGNsaWVudFNESyxcbiAgcnVuQWZ0ZXJGaW5kID0gdHJ1ZSxcbiAgcnVuQmVmb3JlRmluZCA9IHRydWUsXG4gIGNvbnRleHQsXG59KSB7XG4gIGlmICghW1Jlc3RRdWVyeS5NZXRob2QuZmluZCwgUmVzdFF1ZXJ5Lk1ldGhvZC5nZXRdLmluY2x1ZGVzKG1ldGhvZCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2JhZCBxdWVyeSB0eXBlJyk7XG4gIH1cbiAgZW5mb3JjZVJvbGVTZWN1cml0eShtZXRob2QsIGNsYXNzTmFtZSwgYXV0aCk7XG4gIGNvbnN0IHJlc3VsdCA9IHJ1bkJlZm9yZUZpbmRcbiAgICA/IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbnRleHQsXG4gICAgICBtZXRob2QgPT09IFJlc3RRdWVyeS5NZXRob2QuZ2V0XG4gICAgKVxuICAgIDogUHJvbWlzZS5yZXNvbHZlKHsgcmVzdFdoZXJlLCByZXN0T3B0aW9ucyB9KTtcblxuICByZXR1cm4gbmV3IF9VbnNhZmVSZXN0UXVlcnkoXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgY2xhc3NOYW1lLFxuICAgIHJlc3VsdC5yZXN0V2hlcmUgfHwgcmVzdFdoZXJlLFxuICAgIHJlc3VsdC5yZXN0T3B0aW9ucyB8fCByZXN0T3B0aW9ucyxcbiAgICBjbGllbnRTREssXG4gICAgcnVuQWZ0ZXJGaW5kLFxuICAgIGNvbnRleHRcbiAgKTtcbn1cblxuUmVzdFF1ZXJ5Lk1ldGhvZCA9IE9iamVjdC5mcmVlemUoe1xuICBnZXQ6ICdnZXQnLFxuICBmaW5kOiAnZmluZCcsXG59KTtcblxuLyoqXG4gKiBfVW5zYWZlUmVzdFF1ZXJ5IGlzIG1lYW50IGZvciBzcGVjaWZpYyBpbnRlcm5hbCB1c2FnZSBvbmx5LiBXaGVuIHlvdSBuZWVkIHRvIHNraXAgc2VjdXJpdHkgY2hlY2tzIG9yIHNvbWUgdHJpZ2dlcnMuXG4gKiBEb24ndCB1c2UgaXQgaWYgeW91IGRvbid0IGtub3cgd2hhdCB5b3UgYXJlIGRvaW5nLlxuICogQHBhcmFtIGNvbmZpZ1xuICogQHBhcmFtIGF1dGhcbiAqIEBwYXJhbSBjbGFzc05hbWVcbiAqIEBwYXJhbSByZXN0V2hlcmVcbiAqIEBwYXJhbSByZXN0T3B0aW9uc1xuICogQHBhcmFtIGNsaWVudFNES1xuICogQHBhcmFtIHJ1bkFmdGVyRmluZFxuICogQHBhcmFtIGNvbnRleHRcbiAqL1xuZnVuY3Rpb24gX1Vuc2FmZVJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREssXG4gIHJ1bkFmdGVyRmluZCA9IHRydWUsXG4gIGNvbnRleHRcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJ1bkFmdGVyRmluZCA9IHJ1bkFmdGVyRmluZDtcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG4gIHRoaXMuZmluZE9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3RXaGVyZSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB0aGlzLmRvQ291bnQgPSBmYWxzZTtcbiAgdGhpcy5pbmNsdWRlQWxsID0gZmFsc2U7XG5cbiAgLy8gVGhlIGZvcm1hdCBmb3IgdGhpcy5pbmNsdWRlIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgZm9ybWF0IGZvciB0aGVcbiAgLy8gaW5jbHVkZSBvcHRpb24gLSBpdCdzIHRoZSBwYXRocyB3ZSBzaG91bGQgaW5jbHVkZSwgaW4gb3JkZXIsXG4gIC8vIHN0b3JlZCBhcyBhcnJheXMsIHRha2luZyBpbnRvIGFjY291bnQgdGhhdCB3ZSBuZWVkIHRvIGluY2x1ZGUgZm9vXG4gIC8vIGJlZm9yZSBpbmNsdWRpbmcgZm9vLmJhci4gQWxzbyBpdCBzaG91bGQgZGVkdXBlLlxuICAvLyBGb3IgZXhhbXBsZSwgcGFzc2luZyBhbiBhcmcgb2YgaW5jbHVkZT1mb28uYmFyLGZvby5iYXogY291bGQgbGVhZCB0b1xuICAvLyB0aGlzLmluY2x1ZGUgPSBbWydmb28nXSwgWydmb28nLCAnYmF6J10sIFsnZm9vJywgJ2JhciddXVxuICB0aGlzLmluY2x1ZGUgPSBbXTtcbiAgbGV0IGtleXNGb3JJbmNsdWRlID0gJyc7XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzO1xuICB9XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gaW4gb3JkZXIgdG8gZXhjbHVkZSBzcGVjaWZpYyBrZXlzLlxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAnZXhjbHVkZUtleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlICs9ICcsJyArIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzO1xuICB9XG5cbiAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ2NvbW1lbnQnOlxuICAgICAgICB0aGlzLmZpbmRPcHRpb25zW29wdGlvbl0gPSByZXN0T3B0aW9uc1tvcHRpb25dO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ29yZGVyJzpcbiAgICAgICAgdmFyIGZpZWxkcyA9IHJlc3RPcHRpb25zLm9yZGVyLnNwbGl0KCcsJyk7XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnMuc29ydCA9IGZpZWxkcy5yZWR1Y2UoKHNvcnRNYXAsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgZmllbGQgPSBmaWVsZC50cmltKCk7XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnJHNjb3JlJyB8fCBmaWVsZCA9PT0gJy0kc2NvcmUnKSB7XG4gICAgICAgICAgICBzb3J0TWFwLnNjb3JlID0geyAkbWV0YTogJ3RleHRTY29yZScgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpZWxkWzBdID09ICctJykge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZC5zbGljZSgxKV0gPSAtMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZF0gPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gc29ydE1hcDtcbiAgICAgICAgfSwge30pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGUnOiB7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gcmVzdE9wdGlvbnMuaW5jbHVkZS5zcGxpdCgnLCcpO1xuICAgICAgICBpZiAocGF0aHMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIHRoaXMuaW5jbHVkZUFsbCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTG9hZCB0aGUgZXhpc3RpbmcgaW5jbHVkZXMgKGZyb20ga2V5cylcbiAgICAgICAgY29uc3QgcGF0aFNldCA9IHBhdGhzLnJlZHVjZSgobWVtbywgcGF0aCkgPT4ge1xuICAgICAgICAgIC8vIFNwbGl0IGVhY2ggcGF0aHMgb24gLiAoYS5iLmMgLT4gW2EsYixjXSlcbiAgICAgICAgICAvLyByZWR1Y2UgdG8gY3JlYXRlIGFsbCBwYXRoc1xuICAgICAgICAgIC8vIChbYSxiLGNdIC0+IHthOiB0cnVlLCAnYS5iJzogdHJ1ZSwgJ2EuYi5jJzogdHJ1ZX0pXG4gICAgICAgICAgcmV0dXJuIHBhdGguc3BsaXQoJy4nKS5yZWR1Y2UoKG1lbW8sIHBhdGgsIGluZGV4LCBwYXJ0cykgPT4ge1xuICAgICAgICAgICAgbWVtb1twYXJ0cy5zbGljZSgwLCBpbmRleCArIDEpLmpvaW4oJy4nKV0gPSB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgICAgfSwgbWVtbyk7XG4gICAgICAgIH0sIHt9KTtcblxuICAgICAgICB0aGlzLmluY2x1ZGUgPSBPYmplY3Qua2V5cyhwYXRoU2V0KVxuICAgICAgICAgIC5tYXAocyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcy5zcGxpdCgnLicpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBhLmxlbmd0aCAtIGIubGVuZ3RoOyAvLyBTb3J0IGJ5IG51bWJlciBvZiBjb21wb25lbnRzXG4gICAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAncmVkaXJlY3RDbGFzc05hbWVGb3JLZXknOlxuICAgICAgICB0aGlzLnJlZGlyZWN0S2V5ID0gcmVzdE9wdGlvbnMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXk7XG4gICAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBudWxsO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVSZWFkUHJlZmVyZW5jZSc6XG4gICAgICBjYXNlICdzdWJxdWVyeVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIG9wdGlvbjogJyArIG9wdGlvbik7XG4gICAgfVxuICB9XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgYSBxdWVyeVxuLy8gaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJlc3BvbnNlIC0gYW4gb2JqZWN0IHdpdGggb3B0aW9uYWwga2V5c1xuLy8gJ3Jlc3VsdHMnIGFuZCAnY291bnQnLlxuLy8gVE9ETzogY29uc29saWRhdGUgdGhlIHJlcGxhY2VYIGZ1bmN0aW9uc1xuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uIChleGVjdXRlT3B0aW9ucykge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVueVByb3RlY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhBZGFwdGVycygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMsIGNsaWVudFNESyB9ID0gdGhpcztcbiAgLy8gaWYgdGhlIGxpbWl0IGlzIHNldCwgdXNlIGl0XG4gIHJlc3RPcHRpb25zLmxpbWl0ID0gcmVzdE9wdGlvbnMubGltaXQgfHwgMTAwO1xuICByZXN0T3B0aW9ucy5vcmRlciA9ICdvYmplY3RJZCc7XG4gIGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXG4gIHJldHVybiBjb250aW51ZVdoaWxlKFxuICAgICgpID0+IHtcbiAgICAgIHJldHVybiAhZmluaXNoZWQ7XG4gICAgfSxcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBTYWZlIGhlcmUgdG8gdXNlIF9VbnNhZmVSZXN0UXVlcnkgYmVjYXVzZSB0aGUgc2VjdXJpdHkgd2FzIGFscmVhZHlcbiAgICAgIC8vIGNoZWNrZWQgZHVyaW5nIFwiYXdhaXQgUmVzdFF1ZXJ5KClcIlxuICAgICAgY29uc3QgcXVlcnkgPSBuZXcgX1Vuc2FmZVJlc3RRdWVyeShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIGNsaWVudFNESyxcbiAgICAgICAgdGhpcy5ydW5BZnRlckZpbmQsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKGNhbGxiYWNrKTtcbiAgICAgIGZpbmlzaGVkID0gcmVzdWx0cy5sZW5ndGggPCByZXN0T3B0aW9ucy5saW1pdDtcbiAgICAgIGlmICghZmluaXNoZWQpIHtcbiAgICAgICAgcmVzdFdoZXJlLm9iamVjdElkID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdFdoZXJlLm9iamVjdElkLCB7XG4gICAgICAgICAgJGd0OiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV0ub2JqZWN0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmJ1aWxkUmVzdFdoZXJlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZWRpcmVjdEtleSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBjbGFzcyBuYW1lIGJhc2VkIG9uIHRoZSBzY2hlbWFcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlZGlyZWN0S2V5KVxuICAgIC50aGVuKG5ld0NsYXNzTmFtZSA9PiB7XG4gICAgICB0aGlzLmNsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgfSk7XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KGluUXVlcnlPYmplY3RbJyRpbiddKSkge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gaW5RdWVyeU9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IGluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICB9KTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VOb3RJblF1ZXJ5ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgbm90SW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJG5vdEluUXVlcnknKTtcbiAgaWYgKCFub3RJblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIG5vdEluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIG5vdEluUXVlcnlWYWx1ZSA9IG5vdEluUXVlcnlPYmplY3RbJyRub3RJblF1ZXJ5J107XG4gIGlmICghbm90SW5RdWVyeVZhbHVlLndoZXJlIHx8ICFub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkbm90SW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IG5vdEluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IG5vdEluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICB9KTtcblxuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuLy8gVXNlZCB0byBnZXQgdGhlIGRlZXBlc3Qgb2JqZWN0IGZyb20ganNvbiB1c2luZyBkb3Qgbm90YXRpb24uXG5jb25zdCBnZXREZWVwZXN0T2JqZWN0RnJvbUtleSA9IChqc29uLCBrZXksIGlkeCwgc3JjKSA9PiB7XG4gIGlmIChrZXkgaW4ganNvbikge1xuICAgIHJldHVybiBqc29uW2tleV07XG4gIH1cbiAgc3JjLnNwbGljZSgxKTsgLy8gRXhpdCBFYXJseVxufTtcblxuY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gKHNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0T2JqZWN0WyckaW4nXSkpIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gc2VsZWN0T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRzZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkc2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkc2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZVNlbGVjdCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJHNlbGVjdCcpO1xuICBpZiAoIXNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBzZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIHNlbGVjdFZhbHVlID0gc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIC8vIGlPUyBTREsgZG9uJ3Qgc2VuZCB3aGVyZSBpZiBub3Qgc2V0LCBsZXQgaXQgcGFzc1xuICBpZiAoXG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIXNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBzZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoc2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRzZWxlY3QnKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBzZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IHRoaXMuY29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBkb250U2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckZG9udFNlbGVjdCcpO1xuICBpZiAoIWRvbnRTZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgZG9udFNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgZG9udFNlbGVjdFZhbHVlID0gZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBkb250U2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhkb250U2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRkb250U2VsZWN0Jyk7XG4gIH1cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICB9KTtcblxuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoZG9udFNlbGVjdE9iamVjdCwgZG9udFNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJGRvbnRTZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuY2xlYW5SZXN1bHRBdXRoRGF0YSA9IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgZGVsZXRlIHJlc3VsdC5wYXNzd29yZDtcbiAgaWYgKHJlc3VsdC5hdXRoRGF0YSkge1xuICAgIE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBpZiAocmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCA9IGNvbnN0cmFpbnQgPT4ge1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGNvbnN0cmFpbnQ7XG4gIH1cbiAgY29uc3QgZXF1YWxUb09iamVjdCA9IHt9O1xuICBsZXQgaGFzRGlyZWN0Q29uc3RyYWludCA9IGZhbHNlO1xuICBsZXQgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gZmFsc2U7XG4gIGZvciAoY29uc3Qga2V5IGluIGNvbnN0cmFpbnQpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJyQnKSAhPT0gMCkge1xuICAgICAgaGFzRGlyZWN0Q29uc3RyYWludCA9IHRydWU7XG4gICAgICBlcXVhbFRvT2JqZWN0W2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhc09wZXJhdG9yQ29uc3RyYWludCA9IHRydWU7XG4gICAgfVxuICB9XG4gIGlmIChoYXNEaXJlY3RDb25zdHJhaW50ICYmIGhhc09wZXJhdG9yQ29uc3RyYWludCkge1xuICAgIGNvbnN0cmFpbnRbJyRlcSddID0gZXF1YWxUb09iamVjdDtcbiAgICBPYmplY3Qua2V5cyhlcXVhbFRvT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBkZWxldGUgY29uc3RyYWludFtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBjb25zdHJhaW50O1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUVxdWFsaXR5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIHRoaXMucmVzdFdoZXJlICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnJlc3RXaGVyZSkge1xuICAgIHRoaXMucmVzdFdoZXJlW2tleV0gPSByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50KHRoaXMucmVzdFdoZXJlW2tleV0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlIHdpdGggYW4gb2JqZWN0IHRoYXQgb25seSBoYXMgJ3Jlc3VsdHMnLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucnVuRmluZCA9IGFzeW5jIGZ1bmN0aW9uIChvcHRpb25zID0ge30pIHtcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMubGltaXQgPT09IDApIHtcbiAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiBbXSB9O1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICBjb25zdCBmaW5kT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZmluZE9wdGlvbnMpO1xuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgZmluZE9wdGlvbnMua2V5cyA9IHRoaXMua2V5cy5tYXAoa2V5ID0+IHtcbiAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKVswXTtcbiAgICB9KTtcbiAgfVxuICBpZiAob3B0aW9ucy5vcCkge1xuICAgIGZpbmRPcHRpb25zLm9wID0gb3B0aW9ucy5vcDtcbiAgfVxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZXN0V2hlcmUsIGZpbmRPcHRpb25zLCB0aGlzLmF1dGgpO1xuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgIWZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgdGhpcy5jbGVhblJlc3VsdEF1dGhEYXRhKHJlc3VsdCk7XG4gICAgfVxuICB9XG5cbiAgYXdhaXQgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHJlc3VsdHMpO1xuXG4gIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgZm9yICh2YXIgciBvZiByZXN1bHRzKSB7XG4gICAgICByLmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgfVxuICB9XG4gIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IHJlc3VsdHMgfTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2UuY291bnQgd2l0aCB0aGUgY291bnRcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJ1bkNvdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucykudGhlbihjID0+IHtcbiAgICB0aGlzLnJlc3BvbnNlLmNvdW50ID0gYztcbiAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5kZW55UHJvdGVjdGVkRmllbGRzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9XG4gICAgdGhpcy5jb25maWcuZGF0YWJhc2UuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXN0V2hlcmUsXG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnNcbiAgICApIHx8IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICBpZiAodGhpcy5yZXN0V2hlcmVba2V5XSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIHF1ZXJ5ICR7a2V5fSBvbiBjbGFzcyAke3RoaXMuY2xhc3NOYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggYWxsIHBvaW50ZXJzIG9uIGFuIG9iamVjdFxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlSW5jbHVkZUFsbCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmluY2x1ZGVBbGwpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBpbmNsdWRlRmllbGRzID0gW107XG4gICAgICBjb25zdCBrZXlGaWVsZHMgPSBbXTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc2NoZW1hLmZpZWxkcykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpXG4gICAgICAgICkge1xuICAgICAgICAgIGluY2x1ZGVGaWVsZHMucHVzaChbZmllbGRdKTtcbiAgICAgICAgICBrZXlGaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEFkZCBmaWVsZHMgdG8gaW5jbHVkZSwga2V5cywgcmVtb3ZlIGR1cHNcbiAgICAgIHRoaXMuaW5jbHVkZSA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmluY2x1ZGUsIC4uLmluY2x1ZGVGaWVsZHNdKV07XG4gICAgICAvLyBpZiB0aGlzLmtleXMgbm90IHNldCwgdGhlbiBhbGwga2V5cyBhcmUgYWxyZWFkeSBpbmNsdWRlZFxuICAgICAgaWYgKHRoaXMua2V5cykge1xuICAgICAgICB0aGlzLmtleXMgPSBbLi4ubmV3IFNldChbLi4udGhpcy5rZXlzLCAuLi5rZXlGaWVsZHNdKV07XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBVcGRhdGVzIHByb3BlcnR5IGB0aGlzLmtleXNgIHRvIGNvbnRhaW4gYWxsIGtleXMgYnV0IHRoZSBvbmVzIHVuc2VsZWN0ZWQuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHBhdGhSZXNwb25zZSA9IGluY2x1ZGVQYXRoKFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICB0aGlzLnJlc3BvbnNlLFxuICAgIHRoaXMuaW5jbHVkZVswXSxcbiAgICB0aGlzLmNvbnRleHQsXG4gICAgdGhpcy5yZXN0T3B0aW9uc1xuICApO1xuICBpZiAocGF0aFJlc3BvbnNlLnRoZW4pIHtcbiAgICByZXR1cm4gcGF0aFJlc3BvbnNlLnRoZW4obmV3UmVzcG9uc2UgPT4ge1xuICAgICAgdGhpcy5yZXNwb25zZSA9IG5ld1Jlc3BvbnNlO1xuICAgICAgdGhpcy5pbmNsdWRlID0gdGhpcy5pbmNsdWRlLnNsaWNlKDEpO1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICAgIH0pO1xuICB9IGVsc2UgaWYgKHRoaXMuaW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAgdGhpcy5pbmNsdWRlID0gdGhpcy5pbmNsdWRlLnNsaWNlKDEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgfVxuXG4gIHJldHVybiBwYXRoUmVzcG9uc2U7XG59O1xuXG4vL1JldHVybnMgYSBwcm9taXNlIG9mIGEgcHJvY2Vzc2VkIHNldCBvZiByZXN1bHRzXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVBdXRoQWRhcHRlcnMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLmZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLm1hcChyZXN1bHQgPT5cbiAgICAgIHRoaXMuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5ydW5BZnRlckZpbmQoXG4gICAgICAgIHsgY29uZmlnOiB0aGlzLmNvbmZpZywgYXV0aDogdGhpcy5hdXRoIH0sXG4gICAgICAgIHJlc3VsdC5hdXRoRGF0YVxuICAgICAgKVxuICAgIClcbiAgKTtcbn07XG5cbi8vIEFkZHMgaW5jbHVkZWQgdmFsdWVzIHRvIHRoZSByZXNwb25zZS5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkIG5hbWVzLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIGF1Z21lbnRlZCByZXNwb25zZS5cbmZ1bmN0aW9uIGluY2x1ZGVQYXRoKGNvbmZpZywgYXV0aCwgcmVzcG9uc2UsIHBhdGgsIGNvbnRleHQsIHJlc3RPcHRpb25zID0ge30pIHtcbiAgdmFyIHBvaW50ZXJzID0gZmluZFBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgpO1xuICBpZiAocG9pbnRlcnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgcG9pbnRlcnNIYXNoID0ge307XG4gIGZvciAodmFyIHBvaW50ZXIgb2YgcG9pbnRlcnMpIHtcbiAgICBpZiAoIXBvaW50ZXIpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc05hbWUgPSBwb2ludGVyLmNsYXNzTmFtZTtcbiAgICAvLyBvbmx5IGluY2x1ZGUgdGhlIGdvb2QgcG9pbnRlcnNcbiAgICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSA9IHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdIHx8IG5ldyBTZXQoKTtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdLmFkZChwb2ludGVyLm9iamVjdElkKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgaW5jbHVkZVJlc3RPcHRpb25zID0ge307XG4gIGlmIChyZXN0T3B0aW9ucy5rZXlzKSB7XG4gICAgY29uc3Qga2V5cyA9IG5ldyBTZXQocmVzdE9wdGlvbnMua2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBrZXlTZXQgPSBBcnJheS5mcm9tKGtleXMpLnJlZHVjZSgoc2V0LCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGtleVBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGZvciAoaTsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhdGhbaV0gIT0ga2V5UGF0aFtpXSkge1xuICAgICAgICAgIHJldHVybiBzZXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpIDwga2V5UGF0aC5sZW5ndGgpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoa2V5U2V0LnNpemUgPiAwKSB7XG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnMua2V5cyA9IEFycmF5LmZyb20oa2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzKSB7XG4gICAgY29uc3QgZXhjbHVkZUtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlTZXQgPSBBcnJheS5mcm9tKGV4Y2x1ZGVLZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA9PSBrZXlQYXRoLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoZXhjbHVkZUtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0gQXJyYXkuZnJvbShleGNsdWRlS2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBxdWVyeVByb21pc2VzID0gT2JqZWN0LmtleXMocG9pbnRlcnNIYXNoKS5tYXAoYXN5bmMgY2xhc3NOYW1lID0+IHtcbiAgICBjb25zdCBvYmplY3RJZHMgPSBBcnJheS5mcm9tKHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdKTtcbiAgICBsZXQgd2hlcmU7XG4gICAgaWYgKG9iamVjdElkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogb2JqZWN0SWRzWzBdIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogeyAkaW46IG9iamVjdElkcyB9IH07XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogb2JqZWN0SWRzLmxlbmd0aCA9PT0gMSA/IFJlc3RRdWVyeS5NZXRob2QuZ2V0IDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZTogd2hlcmUsXG4gICAgICByZXN0T3B0aW9uczogaW5jbHVkZVJlc3RPcHRpb25zLFxuICAgICAgY29udGV4dDogY29udGV4dCxcbiAgICB9KTtcbiAgICByZXR1cm4gcXVlcnkuZXhlY3V0ZSh7IG9wOiAnZ2V0JyB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBHZXQgdGhlIG9iamVjdHMgZm9yIGFsbCB0aGVzZSBvYmplY3QgaWRzXG4gIHJldHVybiBQcm9taXNlLmFsbChxdWVyeVByb21pc2VzKS50aGVuKHJlc3BvbnNlcyA9PiB7XG4gICAgdmFyIHJlcGxhY2UgPSByZXNwb25zZXMucmVkdWNlKChyZXBsYWNlLCBpbmNsdWRlUmVzcG9uc2UpID0+IHtcbiAgICAgIGZvciAodmFyIG9iaiBvZiBpbmNsdWRlUmVzcG9uc2UucmVzdWx0cykge1xuICAgICAgICBvYmouX190eXBlID0gJ09iamVjdCc7XG4gICAgICAgIG9iai5jbGFzc05hbWUgPSBpbmNsdWRlUmVzcG9uc2UuY2xhc3NOYW1lO1xuXG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lID09ICdfVXNlcicgJiYgIWF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICBkZWxldGUgb2JqLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICBkZWxldGUgb2JqLmF1dGhEYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJlcGxhY2Vbb2JqLm9iamVjdElkXSA9IG9iajtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXBsYWNlO1xuICAgIH0sIHt9KTtcblxuICAgIHZhciByZXNwID0ge1xuICAgICAgcmVzdWx0czogcmVwbGFjZVBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgsIHJlcGxhY2UpLFxuICAgIH07XG4gICAgaWYgKHJlc3BvbnNlLmNvdW50KSB7XG4gICAgICByZXNwLmNvdW50ID0gcmVzcG9uc2UuY291bnQ7XG4gICAgfVxuICAgIHJldHVybiByZXNwO1xuICB9KTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGZpbmQgcG9pbnRlcnMgaW4sIG9yXG4vLyBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gSWYgdGhlIHBhdGggeWllbGRzIHRoaW5ncyB0aGF0IGFyZW4ndCBwb2ludGVycywgdGhpcyB0aHJvd3MgYW4gZXJyb3IuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyBSZXR1cm5zIGEgbGlzdCBvZiBwb2ludGVycyBpbiBSRVNUIGZvcm1hdC5cbmZ1bmN0aW9uIGZpbmRQb2ludGVycyhvYmplY3QsIHBhdGgpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdC5tYXAoeCA9PiBmaW5kUG9pbnRlcnMoeCwgcGF0aCkpLmZsYXQoKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09IDApIHtcbiAgICBpZiAob2JqZWN0ID09PSBudWxsIHx8IG9iamVjdC5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gW29iamVjdF07XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBmaW5kUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpKTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cyB0byByZXBsYWNlIHBvaW50ZXJzXG4vLyBpbiwgb3IgaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIHJlcGxhY2UgaXMgYSBtYXAgZnJvbSBvYmplY3QgaWQgLT4gb2JqZWN0LlxuLy8gUmV0dXJucyBzb21ldGhpbmcgYW5hbG9nb3VzIHRvIG9iamVjdCwgYnV0IHdpdGggdGhlIGFwcHJvcHJpYXRlXG4vLyBwb2ludGVycyBpbmZsYXRlZC5cbmZ1bmN0aW9uIHJlcGxhY2VQb2ludGVycyhvYmplY3QsIHBhdGgsIHJlcGxhY2UpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdFxuICAgICAgLm1hcChvYmogPT4gcmVwbGFjZVBvaW50ZXJzKG9iaiwgcGF0aCwgcmVwbGFjZSkpXG4gICAgICAuZmlsdGVyKG9iaiA9PiB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBpZiAob2JqZWN0ICYmIG9iamVjdC5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIHJlcGxhY2Vbb2JqZWN0Lm9iamVjdElkXTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICB2YXIgbmV3c3ViID0gcmVwbGFjZVBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSwgcmVwbGFjZSk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkgPT0gcGF0aFswXSkge1xuICAgICAgYW5zd2VyW2tleV0gPSBuZXdzdWI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFuc3dlcltrZXldID0gb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIEZpbmRzIGEgc3Vib2JqZWN0IHRoYXQgaGFzIHRoZSBnaXZlbiBrZXksIGlmIHRoZXJlIGlzIG9uZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGZpbmRPYmplY3RXaXRoS2V5KHJvb3QsIGtleSkge1xuICBpZiAodHlwZW9mIHJvb3QgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBmb3IgKHZhciBpdGVtIG9mIHJvb3QpIHtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KGl0ZW0sIGtleSk7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChyb290ICYmIHJvb3Rba2V5XSkge1xuICAgIHJldHVybiByb290O1xuICB9XG4gIGZvciAodmFyIHN1YmtleSBpbiByb290KSB7XG4gICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkocm9vdFtzdWJrZXldLCBrZXkpO1xuICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzdFF1ZXJ5O1xuLy8gRm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fVW5zYWZlUmVzdFF1ZXJ5ID0gX1Vuc2FmZVJlc3RRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFDaEUsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsTUFBTUMsUUFBUSxHQUFHRixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3RDLE1BQU07RUFBRUc7QUFBYyxDQUFDLEdBQUdILE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQztBQUNoRSxNQUFNSSxrQkFBa0IsR0FBRyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQztBQUN4RSxNQUFNO0VBQUVDO0FBQW9CLENBQUMsR0FBR0wsT0FBTyxDQUFDLGNBQWMsQ0FBQzs7QUFFdkQ7QUFDQTtBQUNBO0FBQ0E7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STZCLFNBQVMsR0FBRzdCLE1BQU0sQ0FBQ2xILElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUMvQixJQUFJLENBQUMrSSxTQUFTLEVBQUU7SUFDZCxPQUFPN0IsTUFBTTtFQUNmO0VBQ0EsSUFBSThCLE1BQU0sR0FBR0osZUFBZSxDQUFDRyxTQUFTLEVBQUUvSSxJQUFJLENBQUN2QixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU4SixPQUFPLENBQUM7RUFDL0QsSUFBSVUsTUFBTSxHQUFHLENBQUMsQ0FBQztFQUNmLEtBQUssSUFBSTFLLEdBQUcsSUFBSTJJLE1BQU0sRUFBRTtJQUN0QixJQUFJM0ksR0FBRyxJQUFJeUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFO01BQ2xCaUosTUFBTSxDQUFDMUssR0FBRyxDQUFDLEdBQUd5SyxNQUFNO0lBQ3RCLENBQUMsTUFBTTtNQUNMQyxNQUFNLENBQUMxSyxHQUFHLENBQUMsR0FBRzJJLE1BQU0sQ0FBQzNJLEdBQUcsQ0FBQztJQUMzQjtFQUNGO0VBQ0EsT0FBTzBLLE1BQU07QUFDZjs7QUFFQTtBQUNBO0FBQ0EsU0FBUzNGLGlCQUFpQkEsQ0FBQzRGLElBQUksRUFBRTNLLEdBQUcsRUFBRTtFQUNwQyxJQUFJLE9BQU8ySyxJQUFJLEtBQUssUUFBUSxFQUFFO0lBQzVCO0VBQ0Y7RUFDQSxJQUFJQSxJQUFJLFlBQVlwSyxLQUFLLEVBQUU7SUFDekIsS0FBSyxJQUFJcUssSUFBSSxJQUFJRCxJQUFJLEVBQUU7TUFDckIsTUFBTUQsTUFBTSxHQUFHM0YsaUJBQWlCLENBQUM2RixJQUFJLEVBQUU1SyxHQUFHLENBQUM7TUFDM0MsSUFBSTBLLE1BQU0sRUFBRTtRQUNWLE9BQU9BLE1BQU07TUFDZjtJQUNGO0VBQ0Y7RUFDQSxJQUFJQyxJQUFJLElBQUlBLElBQUksQ0FBQzNLLEdBQUcsQ0FBQyxFQUFFO0lBQ3JCLE9BQU8ySyxJQUFJO0VBQ2I7RUFDQSxLQUFLLElBQUlFLE1BQU0sSUFBSUYsSUFBSSxFQUFFO0lBQ3ZCLE1BQU1ELE1BQU0sR0FBRzNGLGlCQUFpQixDQUFDNEYsSUFBSSxDQUFDRSxNQUFNLENBQUMsRUFBRTdLLEdBQUcsQ0FBQztJQUNuRCxJQUFJMEssTUFBTSxFQUFFO01BQ1YsT0FBT0EsTUFBTTtJQUNmO0VBQ0Y7QUFDRjtBQUVBSSxNQUFNLENBQUNDLE9BQU8sR0FBRzlOLFNBQVM7QUFDMUI7QUFDQTZOLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDdk0sZ0JBQWdCLEdBQUdBLGdCQUFnQiIsImlnbm9yZUxpc3QiOltdfQ==