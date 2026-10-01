"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var SchemaController = require('./Controllers/SchemaController');
var Parse = require('parse/node').Parse;
var logger = require('./logger').default;
const triggers = require('./triggers');
const {
  continueWhile
} = require('parse/lib/node/promiseUtils');
const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL'];
const {
  enforceRoleSecurity
} = require('./SharedRest');
const {
  createSanitizedError
} = require('./Error');

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
  runAfterFind = true,
  runBeforeFind = true,
  context
}) {
  if (![RestQuery.Method.find, RestQuery.Method.get].includes(method)) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'bad query type');
  }
  const isGet = method === RestQuery.Method.get;
  enforceRoleSecurity(method, className, auth, config);
  const result = runBeforeFind ? await triggers.maybeRunQueryTrigger(triggers.Types.beforeFind, className, restWhere, restOptions, config, auth, context, isGet) : Promise.resolve({
    restWhere,
    restOptions
  });
  return new _UnsafeRestQuery(config, auth, className, result.restWhere || restWhere, result.restOptions || restOptions, runAfterFind, context, isGet);
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
 * @param runAfterFind
 * @param context
 */
function _UnsafeRestQuery(config, auth, className, restWhere = {}, restOptions = {}, runAfterFind = true, context, isGet) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.runAfterFind = runAfterFind;
  this.response = null;
  this.findOptions = {};
  this.context = context || {};
  this.isGet = isGet;
  if (!this.auth.isMaster) {
    if (this.className == '_Session') {
      if (!this.auth.user) {
        throw createSanitizedError(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token', config);
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
    return this.validateQueryDepth();
  }).then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.denyProtectedFields();
  }).then(() => {
    return this.handleIncludeAll();
  }).then(() => {
    return this.validateIncludeComplexity();
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
    restOptions
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
    const query = new _UnsafeRestQuery(config, auth, className, restWhere, restOptions, this.runAfterFind, this.context);
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
_UnsafeRestQuery.prototype.validateQueryDepth = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return;
  }
  const rc = this.config.requestComplexity;
  if (!rc || rc.queryDepth === -1) {
    return;
  }
  const maxDepth = rc.queryDepth;
  const checkDepth = (node, depth) => {
    if (depth > maxDepth) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, `Query condition nesting depth exceeds maximum allowed depth of ${maxDepth}`);
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        checkDepth(item, depth);
      }
      return;
    }
    // Descend into every value so that logical operators ($or/$and/$nor) nested
    // under field-level operators (e.g. $elemMatch, $not) or plain field names are
    // still counted. Only logical operators increase the depth, which preserves the
    // documented meaning of `queryDepth`.
    for (const key of Object.keys(node)) {
      const isLogical = key === '$or' || key === '$and' || key === '$nor';
      checkDepth(node[key], isLogical ? depth + 1 : depth);
    }
  };
  checkDepth(this.restWhere, 0);
};
_UnsafeRestQuery.prototype.buildRestWhere = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.redirectClassNameForKey();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.checkSubqueryDepth();
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

    // Re-apply security checks for the redirected class name, since the
    // checks in the constructor and in rest.find ran against the original
    // class name before the redirect.
    if (!this.auth.isMaster) {
      enforceRoleSecurity('find', this.className, this.auth, this.config);
      if (this.className === '_Session') {
        if (!this.auth.user) {
          throw createSanitizedError(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token', this.config);
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
  });
};

// Validates this operation against the allowClientClassCreation config.
_UnsafeRestQuery.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className, this.config);
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
_UnsafeRestQuery.prototype.checkSubqueryDepth = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return;
  }
  const rc = this.config.requestComplexity;
  if (!rc || rc.subqueryDepth === -1) {
    return;
  }
  const depth = this.context._subqueryDepth || 0;
  if (depth > rc.subqueryDepth) {
    const message = `Subquery nesting depth exceeds maximum allowed depth of ${rc.subqueryDepth}`;
    logger.warn(message);
    throw new Parse.Error(Parse.Error.INVALID_QUERY, message);
  }
};

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
  const childContext = {
    ...this.context,
    _subqueryDepth: (this.context._subqueryDepth || 0) + 1
  };
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: inQueryValue.className,
    restWhere: inQueryValue.where,
    restOptions: additionalOptions,
    context: childContext
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
  const childContext = {
    ...this.context,
    _subqueryDepth: (this.context._subqueryDepth || 0) + 1
  };
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: notInQueryValue.className,
    restWhere: notInQueryValue.where,
    restOptions: additionalOptions,
    context: childContext
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
  const childContext = {
    ...this.context,
    _subqueryDepth: (this.context._subqueryDepth || 0) + 1
  };
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: selectValue.query.className,
    restWhere: selectValue.query.where,
    restOptions: additionalOptions,
    context: childContext
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
  const childContext = {
    ...this.context,
    _subqueryDepth: (this.context._subqueryDepth || 0) + 1
  };
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: dontSelectValue.query.className,
    restWhere: dontSelectValue.query.where,
    restOptions: additionalOptions,
    context: childContext
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
  return this.config.database.find(this.className, this.restWhere, this.findOptions, this.auth).then(c => {
    this.response.count = c;
  });
};
_UnsafeRestQuery.prototype.denyProtectedFields = async function () {
  if (this.auth.isMaster) {
    return;
  }
  const schemaController = await this.config.database.loadSchema();
  const protectedFields = this.config.database.addProtectedFields(schemaController, this.className, this.restWhere, this.findOptions.acl, this.auth, this.findOptions) || [];
  const checkWhere = where => {
    if (typeof where !== 'object' || where === null) {
      return;
    }
    for (const whereKey of Object.keys(where)) {
      const rootField = whereKey.split('.')[0];
      if (protectedFields.includes(whereKey) || protectedFields.includes(rootField)) {
        throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, `This user is not allowed to query ${whereKey} on class ${this.className}`, this.config);
      }
    }
    for (const op of ['$or', '$and', '$nor']) {
      if (where[op] !== undefined && !Array.isArray(where[op])) {
        throw createSanitizedError(Parse.Error.INVALID_QUERY, `${op} must be an array`, this.config);
      }
      if (Array.isArray(where[op])) {
        where[op].forEach(subQuery => checkWhere(subQuery));
      }
    }
  };
  checkWhere(this.restWhere);

  // Check sort keys against protected fields
  if (this.findOptions.sort) {
    for (const sortKey of Object.keys(this.findOptions.sort)) {
      const rootField = sortKey.split('.')[0];
      if (protectedFields.includes(sortKey) || protectedFields.includes(rootField)) {
        throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, `This user is not allowed to sort by ${sortKey} on class ${this.className}`, this.config);
      }
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
_UnsafeRestQuery.prototype.validateIncludeComplexity = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return;
  }
  const rc = this.config.requestComplexity;
  if (!rc) {
    return;
  }
  if (rc.includeDepth !== -1 && this.include && this.include.length > 0) {
    const maxDepth = Math.max(...this.include.map(path => path.length));
    if (maxDepth > rc.includeDepth) {
      const message = `Include depth of ${maxDepth} exceeds maximum allowed depth of ${rc.includeDepth}`;
      logger.warn(message);
      throw new Parse.Error(Parse.Error.INVALID_QUERY, message);
    }
  }
  if (rc.includeCount !== -1 && this.include && this.include.length > rc.includeCount) {
    const message = `Number of include fields (${this.include.length}) exceeds maximum allowed (${rc.includeCount})`;
    logger.warn(message);
    throw new Parse.Error(Parse.Error.INVALID_QUERY, message);
  }
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
_UnsafeRestQuery.prototype.handleInclude = async function () {
  if (this.include.length == 0) {
    return;
  }
  const indexedResults = this.response.results.reduce((indexed, result, i) => {
    indexed[result.objectId] = i;
    return indexed;
  }, {});

  // Build the execution tree
  const executionTree = {};
  this.include.forEach(path => {
    let current = executionTree;
    path.forEach(node => {
      if (!current[node]) {
        current[node] = {
          path,
          children: {}
        };
      }
      current = current[node].children;
    });
  });
  const recursiveExecutionTree = async treeNode => {
    const {
      path,
      children
    } = treeNode;
    const pathResponse = includePath(this.config, this.auth, this.response, path, this.context, this.restOptions, this);
    if (pathResponse.then) {
      const newResponse = await pathResponse;
      newResponse.results.forEach(newObject => {
        // We hydrate the root of each result with sub results
        this.response.results[indexedResults[newObject.objectId]][path[0]] = newObject[path[0]];
      });
    }
    return Promise.all(Object.values(children).map(recursiveExecutionTree));
  };
  await Promise.all(Object.values(executionTree).map(recursiveExecutionTree));
  this.include = [];
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
  return triggers.maybeRunAfterFindTrigger(triggers.Types.afterFind, this.auth, this.className, this.response.results, this.config, parseQuery, this.context, this.isGet).then(results => {
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
    // Arrays are fully traversed above; returning here avoids re-walking the same
    // elements through the `for (subkey in root)` loop below, which would make this
    // function O(2^n) for nested arrays (e.g. deeply nested $or/$and/$nor).
    return;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwibG9nZ2VyIiwiZGVmYXVsdCIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsImVuZm9yY2VSb2xlU2VjdXJpdHkiLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJjb250ZXh0IiwiTWV0aG9kIiwiZmluZCIsImdldCIsImluY2x1ZGVzIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiaXNHZXQiLCJyZXN1bHQiLCJtYXliZVJ1blF1ZXJ5VHJpZ2dlciIsIlR5cGVzIiwiYmVmb3JlRmluZCIsIlByb21pc2UiLCJyZXNvbHZlIiwiX1Vuc2FmZVJlc3RRdWVyeSIsIk9iamVjdCIsImZyZWV6ZSIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImRvQ291bnQiLCJpbmNsdWRlQWxsIiwiaW5jbHVkZSIsImtleXNGb3JJbmNsdWRlIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwia2V5cyIsImV4Y2x1ZGVLZXlzIiwibGVuZ3RoIiwic3BsaXQiLCJmaWx0ZXIiLCJrZXkiLCJtYXAiLCJzbGljZSIsImxhc3RJbmRleE9mIiwiam9pbiIsIm9wdGlvbiIsImNvbmNhdCIsIkFycmF5IiwiZnJvbSIsIlNldCIsImV4Y2x1ZGUiLCJrIiwiaW5kZXhPZiIsImZpZWxkcyIsIm9yZGVyIiwic29ydCIsInJlZHVjZSIsInNvcnRNYXAiLCJmaWVsZCIsInRyaW0iLCJzY29yZSIsIiRtZXRhIiwicGF0aHMiLCJwYXRoU2V0IiwibWVtbyIsInBhdGgiLCJpbmRleCIsInBhcnRzIiwicyIsImEiLCJiIiwicmVkaXJlY3RLZXkiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInJlZGlyZWN0Q2xhc3NOYW1lIiwiSU5WQUxJRF9KU09OIiwiZXhlY3V0ZSIsImV4ZWN1dGVPcHRpb25zIiwidGhlbiIsInZhbGlkYXRlUXVlcnlEZXB0aCIsImJ1aWxkUmVzdFdoZXJlIiwiZGVueVByb3RlY3RlZEZpZWxkcyIsImhhbmRsZUluY2x1ZGVBbGwiLCJ2YWxpZGF0ZUluY2x1ZGVDb21wbGV4aXR5IiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImhhbmRsZUF1dGhBZGFwdGVycyIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiaXNNYWludGVuYW5jZSIsInJjIiwicmVxdWVzdENvbXBsZXhpdHkiLCJxdWVyeURlcHRoIiwibWF4RGVwdGgiLCJjaGVja0RlcHRoIiwibm9kZSIsImRlcHRoIiwiaXNBcnJheSIsIml0ZW0iLCJpc0xvZ2ljYWwiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsImNoZWNrU3VicXVlcnlEZXB0aCIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJwdXNoIiwic3VicXVlcnlEZXB0aCIsIl9zdWJxdWVyeURlcHRoIiwibWVzc2FnZSIsIndhcm4iLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJjaGlsZENvbnRleHQiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJjaGVja1doZXJlIiwid2hlcmVLZXkiLCJyb290RmllbGQiLCJ1bmRlZmluZWQiLCJzdWJRdWVyeSIsInNvcnRLZXkiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsImluY2x1ZGVEZXB0aCIsIk1hdGgiLCJtYXgiLCJpbmNsdWRlQ291bnQiLCJpbmRleGVkUmVzdWx0cyIsImluZGV4ZWQiLCJpIiwiZXhlY3V0aW9uVHJlZSIsImN1cnJlbnQiLCJjaGlsZHJlbiIsInJlY3Vyc2l2ZUV4ZWN1dGlvblRyZWUiLCJ0cmVlTm9kZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJuZXdPYmplY3QiLCJhbGwiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwic2l6ZSIsImV4Y2x1ZGVLZXlTZXQiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJxdWVyeVByb21pc2VzIiwib2JqZWN0SWRzIiwiJGluIiwicmVzcG9uc2VzIiwicmVwbGFjZSIsImluY2x1ZGVSZXNwb25zZSIsIm9iaiIsInNlc3Npb25Ub2tlbiIsInJlc3AiLCJyZXBsYWNlUG9pbnRlcnMiLCJ4IiwiZmxhdCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsImFuc3dlciIsInJvb3QiLCJzdWJrZXkiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1Jlc3RRdWVyeS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBbiBvYmplY3QgdGhhdCBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhICdmaW5kJ1xuLy8gb3BlcmF0aW9uLCBlbmNvZGVkIGluIHRoZSBSRVNUIEFQSSBmb3JtYXQuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG52YXIgbG9nZ2VyID0gcmVxdWlyZSgnLi9sb2dnZXInKS5kZWZhdWx0O1xuY29uc3QgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG5jb25zdCB7IGNvbnRpbnVlV2hpbGUgfSA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL3Byb21pc2VVdGlscycpO1xuY29uc3QgQWx3YXlzU2VsZWN0ZWRLZXlzID0gWydvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0JywgJ0FDTCddO1xuY29uc3QgeyBlbmZvcmNlUm9sZVNlY3VyaXR5IH0gPSByZXF1aXJlKCcuL1NoYXJlZFJlc3QnKTtcbmNvbnN0IHsgY3JlYXRlU2FuaXRpemVkRXJyb3IgfSA9IHJlcXVpcmUoJy4vRXJyb3InKTtcblxuLy8gcmVzdE9wdGlvbnMgY2FuIGluY2x1ZGU6XG4vLyAgIHNraXBcbi8vICAgbGltaXRcbi8vICAgb3JkZXJcbi8vICAgY291bnRcbi8vICAgaW5jbHVkZVxuLy8gICBrZXlzXG4vLyAgIGV4Y2x1ZGVLZXlzXG4vLyAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5XG4vLyAgIHJlYWRQcmVmZXJlbmNlXG4vLyAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZVxuLy8gICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlXG4vKipcbiAqIFVzZSB0byBwZXJmb3JtIGEgcXVlcnkgb24gYSBjbGFzcy4gSXQgd2lsbCBydW4gc2VjdXJpdHkgY2hlY2tzIGFuZCB0cmlnZ2Vycy5cbiAqIEBwYXJhbSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5tZXRob2Qge1Jlc3RRdWVyeS5NZXRob2R9IFRoZSB0eXBlIG9mIHF1ZXJ5IHRvIHBlcmZvcm1cbiAqIEBwYXJhbSBvcHRpb25zLmNvbmZpZyB7UGFyc2VTZXJ2ZXJDb25maWd1cmF0aW9ufSBUaGUgc2VydmVyIGNvbmZpZ3VyYXRpb25cbiAqIEBwYXJhbSBvcHRpb25zLmF1dGgge0F1dGh9IFRoZSBhdXRoIG9iamVjdCBmb3IgdGhlIHJlcXVlc3RcbiAqIEBwYXJhbSBvcHRpb25zLmNsYXNzTmFtZSB7c3RyaW5nfSBUaGUgbmFtZSBvZiB0aGUgY2xhc3MgdG8gcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RXaGVyZSB7b2JqZWN0fSBUaGUgd2hlcmUgb2JqZWN0IGZvciB0aGUgcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RPcHRpb25zIHtvYmplY3R9IFRoZSBvcHRpb25zIG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5ydW5BZnRlckZpbmQge2Jvb2xlYW59IFdoZXRoZXIgdG8gcnVuIHRoZSBhZnRlckZpbmQgdHJpZ2dlclxuICogQHBhcmFtIG9wdGlvbnMucnVuQmVmb3JlRmluZCB7Ym9vbGVhbn0gV2hldGhlciB0byBydW4gdGhlIGJlZm9yZUZpbmQgdHJpZ2dlclxuICogQHBhcmFtIG9wdGlvbnMuY29udGV4dCB7b2JqZWN0fSBUaGUgY29udGV4dCBvYmplY3QgZm9yIHRoZSBxdWVyeVxuICogQHJldHVybnMge1Byb21pc2U8X1Vuc2FmZVJlc3RRdWVyeT59IEEgcHJvbWlzZSB0aGF0IGlzIHJlc29sdmVkIHdpdGggdGhlIF9VbnNhZmVSZXN0UXVlcnkgb2JqZWN0XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIFJlc3RRdWVyeSh7XG4gIG1ldGhvZCxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBydW5CZWZvcmVGaW5kID0gdHJ1ZSxcbiAgY29udGV4dCxcbn0pIHtcbiAgaWYgKCFbUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLCBSZXN0UXVlcnkuTWV0aG9kLmdldF0uaW5jbHVkZXMobWV0aG9kKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnYmFkIHF1ZXJ5IHR5cGUnKTtcbiAgfVxuICBjb25zdCBpc0dldCA9IG1ldGhvZCA9PT0gUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQ7XG4gIGVuZm9yY2VSb2xlU2VjdXJpdHkobWV0aG9kLCBjbGFzc05hbWUsIGF1dGgsIGNvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdCA9IHJ1bkJlZm9yZUZpbmRcbiAgICA/IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbnRleHQsXG4gICAgICBpc0dldFxuICAgIClcbiAgICA6IFByb21pc2UucmVzb2x2ZSh7IHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMgfSk7XG5cbiAgcmV0dXJuIG5ldyBfVW5zYWZlUmVzdFF1ZXJ5KFxuICAgIGNvbmZpZyxcbiAgICBhdXRoLFxuICAgIGNsYXNzTmFtZSxcbiAgICByZXN1bHQucmVzdFdoZXJlIHx8IHJlc3RXaGVyZSxcbiAgICByZXN1bHQucmVzdE9wdGlvbnMgfHwgcmVzdE9wdGlvbnMsXG4gICAgcnVuQWZ0ZXJGaW5kLFxuICAgIGNvbnRleHQsXG4gICAgaXNHZXRcbiAgKTtcbn1cblxuUmVzdFF1ZXJ5Lk1ldGhvZCA9IE9iamVjdC5mcmVlemUoe1xuICBnZXQ6ICdnZXQnLFxuICBmaW5kOiAnZmluZCcsXG59KTtcblxuLyoqXG4gKiBfVW5zYWZlUmVzdFF1ZXJ5IGlzIG1lYW50IGZvciBzcGVjaWZpYyBpbnRlcm5hbCB1c2FnZSBvbmx5LiBXaGVuIHlvdSBuZWVkIHRvIHNraXAgc2VjdXJpdHkgY2hlY2tzIG9yIHNvbWUgdHJpZ2dlcnMuXG4gKiBEb24ndCB1c2UgaXQgaWYgeW91IGRvbid0IGtub3cgd2hhdCB5b3UgYXJlIGRvaW5nLlxuICogQHBhcmFtIGNvbmZpZ1xuICogQHBhcmFtIGF1dGhcbiAqIEBwYXJhbSBjbGFzc05hbWVcbiAqIEBwYXJhbSByZXN0V2hlcmVcbiAqIEBwYXJhbSByZXN0T3B0aW9uc1xuICogQHBhcmFtIHJ1bkFmdGVyRmluZFxuICogQHBhcmFtIGNvbnRleHRcbiAqL1xuZnVuY3Rpb24gX1Vuc2FmZVJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5yZXN0V2hlcmUgPSByZXN0V2hlcmU7XG4gIHRoaXMucmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucztcbiAgdGhpcy5ydW5BZnRlckZpbmQgPSBydW5BZnRlckZpbmQ7XG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuICB0aGlzLmZpbmRPcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG4gIHRoaXMuaXNHZXQgPSBpc0dldDtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLCBjb25maWcpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG4gIGxldCBrZXlzRm9ySW5jbHVkZSA9ICcnO1xuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIFNlZSBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzMxODVcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2tleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlID0gcmVzdE9wdGlvbnMua2V5cztcbiAgfVxuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIGluIG9yZGVyIHRvIGV4Y2x1ZGUgc3BlY2lmaWMga2V5cy5cbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2V4Y2x1ZGVLZXlzJykpIHtcbiAgICBrZXlzRm9ySW5jbHVkZSArPSAnLCcgKyByZXN0T3B0aW9ucy5leGNsdWRlS2V5cztcbiAgfVxuXG4gIGlmIChrZXlzRm9ySW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZVxuICAgICAgLnNwbGl0KCcsJylcbiAgICAgIC5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgLy8gQXQgbGVhc3QgMiBjb21wb25lbnRzXG4gICAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKS5sZW5ndGggPiAxO1xuICAgICAgfSlcbiAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gU2xpY2UgdGhlIGxhc3QgY29tcG9uZW50IChhLmIuYyAtPiBhLmIpXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSdsbCBpbmNsdWRlIG9uZSBsZXZlbCB0b28gbXVjaC5cbiAgICAgICAgcmV0dXJuIGtleS5zbGljZSgwLCBrZXkubGFzdEluZGV4T2YoJy4nKSk7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywnKTtcblxuICAgIC8vIENvbmNhdCB0aGUgcG9zc2libHkgcHJlc2VudCBpbmNsdWRlIHN0cmluZyB3aXRoIHRoZSBvbmUgZnJvbSB0aGUga2V5c1xuICAgIC8vIERlZHVwIC8gc29ydGluZyBpcyBoYW5kbGUgaW4gJ2luY2x1ZGUnIGNhc2UuXG4gICAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghcmVzdE9wdGlvbnMuaW5jbHVkZSB8fCByZXN0T3B0aW9ucy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgKz0gJywnICsga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICh2YXIgb3B0aW9uIGluIHJlc3RPcHRpb25zKSB7XG4gICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgIGNhc2UgJ2tleXMnOiB7XG4gICAgICAgIGNvbnN0IGtleXMgPSByZXN0T3B0aW9ucy5rZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkubGVuZ3RoID4gMClcbiAgICAgICAgICAuY29uY2F0KEFsd2F5c1NlbGVjdGVkS2V5cyk7XG4gICAgICAgIHRoaXMua2V5cyA9IEFycmF5LmZyb20obmV3IFNldChrZXlzKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnZXhjbHVkZUtleXMnOiB7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGUgPSByZXN0T3B0aW9ucy5leGNsdWRlS2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrID0+IEFsd2F5c1NlbGVjdGVkS2V5cy5pbmRleE9mKGspIDwgMCk7XG4gICAgICAgIHRoaXMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXhjbHVkZSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgdGhpcy5kb0NvdW50ID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlQWxsJzpcbiAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdleHBsYWluJzpcbiAgICAgIGNhc2UgJ2hpbnQnOlxuICAgICAgY2FzZSAnZGlzdGluY3QnOlxuICAgICAgY2FzZSAncGlwZWxpbmUnOlxuICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICBjYXNlICdsaW1pdCc6XG4gICAgICBjYXNlICdyZWFkUHJlZmVyZW5jZSc6XG4gICAgICBjYXNlICdjb21tZW50JzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScgfHwgZmllbGQgPT09ICctJHNjb3JlJykge1xuICAgICAgICAgICAgc29ydE1hcC5zY29yZSA9IHsgJG1ldGE6ICd0ZXh0U2NvcmUnIH07XG4gICAgICAgICAgfSBlbHNlIGlmIChmaWVsZFswXSA9PSAnLScpIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGQuc2xpY2UoMSldID0gLTE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGRdID0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHNvcnRNYXA7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlJzoge1xuICAgICAgICBjb25zdCBwYXRocyA9IHJlc3RPcHRpb25zLmluY2x1ZGUuc3BsaXQoJywnKTtcbiAgICAgICAgaWYgKHBhdGhzLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIC8vIExvYWQgdGhlIGV4aXN0aW5nIGluY2x1ZGVzIChmcm9tIGtleXMpXG4gICAgICAgIGNvbnN0IHBhdGhTZXQgPSBwYXRocy5yZWR1Y2UoKG1lbW8sIHBhdGgpID0+IHtcbiAgICAgICAgICAvLyBTcGxpdCBlYWNoIHBhdGhzIG9uIC4gKGEuYi5jIC0+IFthLGIsY10pXG4gICAgICAgICAgLy8gcmVkdWNlIHRvIGNyZWF0ZSBhbGwgcGF0aHNcbiAgICAgICAgICAvLyAoW2EsYixjXSAtPiB7YTogdHJ1ZSwgJ2EuYic6IHRydWUsICdhLmIuYyc6IHRydWV9KVxuICAgICAgICAgIHJldHVybiBwYXRoLnNwbGl0KCcuJykucmVkdWNlKChtZW1vLCBwYXRoLCBpbmRleCwgcGFydHMpID0+IHtcbiAgICAgICAgICAgIG1lbW9bcGFydHMuc2xpY2UoMCwgaW5kZXggKyAxKS5qb2luKCcuJyldID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICAgIH0sIG1lbW8pO1xuICAgICAgICB9LCB7fSk7XG5cbiAgICAgICAgdGhpcy5pbmNsdWRlID0gT2JqZWN0LmtleXMocGF0aFNldClcbiAgICAgICAgICAubWFwKHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHMuc3BsaXQoJy4nKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDsgLy8gU29ydCBieSBudW1iZXIgb2YgY29tcG9uZW50c1xuICAgICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ3JlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5JzpcbiAgICAgICAgdGhpcy5yZWRpcmVjdEtleSA9IHJlc3RPcHRpb25zLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5O1xuICAgICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbnVsbDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlUmVhZFByZWZlcmVuY2UnOlxuICAgICAgY2FzZSAnc3VicXVlcnlSZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBvcHRpb246ICcgKyBvcHRpb24pO1xuICAgIH1cbiAgfVxufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIGEgcXVlcnlcbi8vIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNwb25zZSAtIGFuIG9iamVjdCB3aXRoIG9wdGlvbmFsIGtleXNcbi8vICdyZXN1bHRzJyBhbmQgJ2NvdW50Jy5cbi8vIFRPRE86IGNvbnNvbGlkYXRlIHRoZSByZXBsYWNlWCBmdW5jdGlvbnNcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVRdWVyeURlcHRoKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVueVByb3RlY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVJbmNsdWRlQ29tcGxleGl0eSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhBZGFwdGVycygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMgfSA9IHRoaXM7XG4gIC8vIGlmIHRoZSBsaW1pdCBpcyBzZXQsIHVzZSBpdFxuICByZXN0T3B0aW9ucy5saW1pdCA9IHJlc3RPcHRpb25zLmxpbWl0IHx8IDEwMDtcbiAgcmVzdE9wdGlvbnMub3JkZXIgPSAnb2JqZWN0SWQnO1xuICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcblxuICByZXR1cm4gY29udGludWVXaGlsZShcbiAgICAoKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbmlzaGVkO1xuICAgIH0sXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2FmZSBoZXJlIHRvIHVzZSBfVW5zYWZlUmVzdFF1ZXJ5IGJlY2F1c2UgdGhlIHNlY3VyaXR5IHdhcyBhbHJlYWR5XG4gICAgICAvLyBjaGVja2VkIGR1cmluZyBcImF3YWl0IFJlc3RRdWVyeSgpXCJcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IF9VbnNhZmVSZXN0UXVlcnkoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICB0aGlzLnJ1bkFmdGVyRmluZCxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICByZXN1bHRzLmZvckVhY2goY2FsbGJhY2spO1xuICAgICAgZmluaXNoZWQgPSByZXN1bHRzLmxlbmd0aCA8IHJlc3RPcHRpb25zLmxpbWl0O1xuICAgICAgaWYgKCFmaW5pc2hlZCkge1xuICAgICAgICByZXN0V2hlcmUub2JqZWN0SWQgPSBPYmplY3QuYXNzaWduKHt9LCByZXN0V2hlcmUub2JqZWN0SWQsIHtcbiAgICAgICAgICAkZ3Q6IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXS5vYmplY3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUudmFsaWRhdGVRdWVyeURlcHRoID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJjID0gdGhpcy5jb25maWcucmVxdWVzdENvbXBsZXhpdHk7XG4gIGlmICghcmMgfHwgcmMucXVlcnlEZXB0aCA9PT0gLTEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgbWF4RGVwdGggPSByYy5xdWVyeURlcHRoO1xuICBjb25zdCBjaGVja0RlcHRoID0gKG5vZGUsIGRlcHRoKSA9PiB7XG4gICAgaWYgKGRlcHRoID4gbWF4RGVwdGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgYFF1ZXJ5IGNvbmRpdGlvbiBuZXN0aW5nIGRlcHRoIGV4Y2VlZHMgbWF4aW11bSBhbGxvd2VkIGRlcHRoIG9mICR7bWF4RGVwdGh9YFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG5vZGUgPT09IG51bGwgfHwgdHlwZW9mIG5vZGUgIT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUpKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygbm9kZSkge1xuICAgICAgICBjaGVja0RlcHRoKGl0ZW0sIGRlcHRoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gRGVzY2VuZCBpbnRvIGV2ZXJ5IHZhbHVlIHNvIHRoYXQgbG9naWNhbCBvcGVyYXRvcnMgKCRvci8kYW5kLyRub3IpIG5lc3RlZFxuICAgIC8vIHVuZGVyIGZpZWxkLWxldmVsIG9wZXJhdG9ycyAoZS5nLiAkZWxlbU1hdGNoLCAkbm90KSBvciBwbGFpbiBmaWVsZCBuYW1lcyBhcmVcbiAgICAvLyBzdGlsbCBjb3VudGVkLiBPbmx5IGxvZ2ljYWwgb3BlcmF0b3JzIGluY3JlYXNlIHRoZSBkZXB0aCwgd2hpY2ggcHJlc2VydmVzIHRoZVxuICAgIC8vIGRvY3VtZW50ZWQgbWVhbmluZyBvZiBgcXVlcnlEZXB0aGAuXG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobm9kZSkpIHtcbiAgICAgIGNvbnN0IGlzTG9naWNhbCA9IGtleSA9PT0gJyRvcicgfHwga2V5ID09PSAnJGFuZCcgfHwga2V5ID09PSAnJG5vcic7XG4gICAgICBjaGVja0RlcHRoKG5vZGVba2V5XSwgaXNMb2dpY2FsID8gZGVwdGggKyAxIDogZGVwdGgpO1xuICAgIH1cbiAgfTtcbiAgY2hlY2tEZXB0aCh0aGlzLnJlc3RXaGVyZSwgMCk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5idWlsZFJlc3RXaGVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNoZWNrU3VicXVlcnlEZXB0aCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZWRpcmVjdEtleSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBjbGFzcyBuYW1lIGJhc2VkIG9uIHRoZSBzY2hlbWFcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlZGlyZWN0S2V5KVxuICAgIC50aGVuKG5ld0NsYXNzTmFtZSA9PiB7XG4gICAgICB0aGlzLmNsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG5cbiAgICAgIC8vIFJlLWFwcGx5IHNlY3VyaXR5IGNoZWNrcyBmb3IgdGhlIHJlZGlyZWN0ZWQgY2xhc3MgbmFtZSwgc2luY2UgdGhlXG4gICAgICAvLyBjaGVja3MgaW4gdGhlIGNvbnN0cnVjdG9yIGFuZCBpbiByZXN0LmZpbmQgcmFuIGFnYWluc3QgdGhlIG9yaWdpbmFsXG4gICAgICAvLyBjbGFzcyBuYW1lIGJlZm9yZSB0aGUgcmVkaXJlY3QuXG4gICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgICBlbmZvcmNlUm9sZVNlY3VyaXR5KCdmaW5kJywgdGhpcy5jbGFzc05hbWUsIHRoaXMuYXV0aCwgdGhpcy5jb25maWcpO1xuXG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykge1xuICAgICAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAgICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdXNlcjoge1xuICAgICAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgICAgICBvYmplY3RJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoaW5RdWVyeU9iamVjdFsnJGluJ10pKSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSBpblF1ZXJ5T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5jaGVja1N1YnF1ZXJ5RGVwdGggPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgcmMgPSB0aGlzLmNvbmZpZy5yZXF1ZXN0Q29tcGxleGl0eTtcbiAgaWYgKCFyYyB8fCByYy5zdWJxdWVyeURlcHRoID09PSAtMSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBkZXB0aCA9IHRoaXMuY29udGV4dC5fc3VicXVlcnlEZXB0aCB8fCAwO1xuICBpZiAoZGVwdGggPiByYy5zdWJxdWVyeURlcHRoKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGBTdWJxdWVyeSBuZXN0aW5nIGRlcHRoIGV4Y2VlZHMgbWF4aW11bSBhbGxvd2VkIGRlcHRoIG9mICR7cmMuc3VicXVlcnlEZXB0aH1gO1xuICAgIGxvZ2dlci53YXJuKG1lc3NhZ2UpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBtZXNzYWdlKTtcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3QgY2hpbGRDb250ZXh0ID0geyAuLi50aGlzLmNvbnRleHQsIF9zdWJxdWVyeURlcHRoOiAodGhpcy5jb250ZXh0Ll9zdWJxdWVyeURlcHRoIHx8IDApICsgMSB9O1xuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogaW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiBjaGlsZENvbnRleHQsXG4gIH0pO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10pKSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gbm90SW5RdWVyeU9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRub3RJblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRub3RJblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkbm90SW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhICRuaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBjaGlsZENvbnRleHQgPSB7IC4uLnRoaXMuY29udGV4dCwgX3N1YnF1ZXJ5RGVwdGg6ICh0aGlzLmNvbnRleHQuX3N1YnF1ZXJ5RGVwdGggfHwgMCkgKyAxIH07XG4gIGNvbnN0IHN1YnF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgIGF1dGg6IHRoaXMuYXV0aCxcbiAgICBjbGFzc05hbWU6IG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgcmVzdFdoZXJlOiBub3RJblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IGNoaWxkQ29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1Ob3RJblF1ZXJ5KG5vdEluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbi8vIFVzZWQgdG8gZ2V0IHRoZSBkZWVwZXN0IG9iamVjdCBmcm9tIGpzb24gdXNpbmcgZG90IG5vdGF0aW9uLlxuY29uc3QgZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkgPSAoanNvbiwga2V5LCBpZHgsIHNyYykgPT4ge1xuICBpZiAoa2V5IGluIGpzb24pIHtcbiAgICByZXR1cm4ganNvbltrZXldO1xuICB9XG4gIHNyYy5zcGxpY2UoMSk7IC8vIEV4aXQgRWFybHlcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IChzZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdE9iamVjdFsnJGluJ10pKSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHNlbGVjdE9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkc2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJHNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJHNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRzZWxlY3QnKTtcbiAgaWYgKCFzZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgc2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBzZWxlY3RWYWx1ZSA9IHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICAvLyBpT1MgU0RLIGRvbid0IHNlbmQgd2hlcmUgaWYgbm90IHNldCwgbGV0IGl0IHBhc3NcbiAgaWYgKFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFzZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2Ygc2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKHNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkc2VsZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogc2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IGNoaWxkQ29udGV4dCA9IHsgLi4udGhpcy5jb250ZXh0LCBfc3VicXVlcnlEZXB0aDogKHRoaXMuY29udGV4dC5fc3VicXVlcnlEZXB0aCB8fCAwKSArIDEgfTtcbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IGNoaWxkQ29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBkb250U2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckZG9udFNlbGVjdCcpO1xuICBpZiAoIWRvbnRTZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgZG9udFNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgZG9udFNlbGVjdFZhbHVlID0gZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBkb250U2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhkb250U2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRkb250U2VsZWN0Jyk7XG4gIH1cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3QgY2hpbGRDb250ZXh0ID0geyAuLi50aGlzLmNvbnRleHQsIF9zdWJxdWVyeURlcHRoOiAodGhpcy5jb250ZXh0Ll9zdWJxdWVyeURlcHRoIHx8IDApICsgMSB9O1xuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiBjaGlsZENvbnRleHQsXG4gIH0pO1xuXG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtRG9udFNlbGVjdChkb250U2VsZWN0T2JqZWN0LCBkb250U2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkZG9udFNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5jbGVhblJlc3VsdEF1dGhEYXRhID0gZnVuY3Rpb24gKHJlc3VsdCkge1xuICBkZWxldGUgcmVzdWx0LnBhc3N3b3JkO1xuICBpZiAocmVzdWx0LmF1dGhEYXRhKSB7XG4gICAgT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGlmIChyZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGE7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50ID0gY29uc3RyYWludCA9PiB7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gY29uc3RyYWludDtcbiAgfVxuICBjb25zdCBlcXVhbFRvT2JqZWN0ID0ge307XG4gIGxldCBoYXNEaXJlY3RDb25zdHJhaW50ID0gZmFsc2U7XG4gIGxldCBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBrZXkgaW4gY29uc3RyYWludCkge1xuICAgIGlmIChrZXkuaW5kZXhPZignJCcpICE9PSAwKSB7XG4gICAgICBoYXNEaXJlY3RDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICAgIGVxdWFsVG9PYmplY3Rba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKGhhc0RpcmVjdENvbnN0cmFpbnQgJiYgaGFzT3BlcmF0b3JDb25zdHJhaW50KSB7XG4gICAgY29uc3RyYWludFsnJGVxJ10gPSBlcXVhbFRvT2JqZWN0O1xuICAgIE9iamVjdC5rZXlzKGVxdWFsVG9PYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGNvbnN0cmFpbnQ7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgdGhpcy5yZXN0V2hlcmUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucmVzdFdoZXJlKSB7XG4gICAgdGhpcy5yZXN0V2hlcmVba2V5XSA9IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQodGhpcy5yZXN0V2hlcmVba2V5XSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbiBvYmplY3QgdGhhdCBvbmx5IGhhcyAncmVzdWx0cycuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5GaW5kID0gYXN5bmMgZnVuY3Rpb24gKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAhZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICB0aGlzLmNsZWFuUmVzdWx0QXV0aERhdGEocmVzdWx0KTtcbiAgICB9XG4gIH1cblxuICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgcmVzdWx0cyk7XG5cbiAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICBmb3IgKHZhciByIG9mIHJlc3VsdHMpIHtcbiAgICAgIHIuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICB9XG4gIH1cbiAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogcmVzdWx0cyB9O1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZS5jb3VudCB3aXRoIHRoZSBjb3VudFxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucnVuQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kb0NvdW50KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuZmluZE9wdGlvbnMuY291bnQgPSB0cnVlO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5za2lwO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5saW1pdDtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCB0aGlzLmZpbmRPcHRpb25zLCB0aGlzLmF1dGgpLnRoZW4oYyA9PiB7XG4gICAgdGhpcy5yZXNwb25zZS5jb3VudCA9IGM7XG4gIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuZGVueVByb3RlY3RlZEZpZWxkcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzY2hlbWFDb250cm9sbGVyID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpO1xuICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPVxuICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLmZpbmRPcHRpb25zXG4gICAgKSB8fCBbXTtcbiAgY29uc3QgY2hlY2tXaGVyZSA9ICh3aGVyZSkgPT4ge1xuICAgIGlmICh0eXBlb2Ygd2hlcmUgIT09ICdvYmplY3QnIHx8IHdoZXJlID09PSBudWxsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgd2hlcmVLZXkgb2YgT2JqZWN0LmtleXMod2hlcmUpKSB7XG4gICAgICBjb25zdCByb290RmllbGQgPSB3aGVyZUtleS5zcGxpdCgnLicpWzBdO1xuICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyh3aGVyZUtleSkgfHwgcHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHJvb3RGaWVsZCkpIHtcbiAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICBgVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIHF1ZXJ5ICR7d2hlcmVLZXl9IG9uIGNsYXNzICR7dGhpcy5jbGFzc05hbWV9YCxcbiAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IG9wIG9mIFsnJG9yJywgJyRhbmQnLCAnJG5vciddKSB7XG4gICAgICBpZiAod2hlcmVbb3BdICE9PSB1bmRlZmluZWQgJiYgIUFycmF5LmlzQXJyYXkod2hlcmVbb3BdKSkge1xuICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGAke29wfSBtdXN0IGJlIGFuIGFycmF5YCxcbiAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkod2hlcmVbb3BdKSkge1xuICAgICAgICB3aGVyZVtvcF0uZm9yRWFjaChzdWJRdWVyeSA9PiBjaGVja1doZXJlKHN1YlF1ZXJ5KSk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBjaGVja1doZXJlKHRoaXMucmVzdFdoZXJlKTtcblxuICAvLyBDaGVjayBzb3J0IGtleXMgYWdhaW5zdCBwcm90ZWN0ZWQgZmllbGRzXG4gIGlmICh0aGlzLmZpbmRPcHRpb25zLnNvcnQpIHtcbiAgICBmb3IgKGNvbnN0IHNvcnRLZXkgb2YgT2JqZWN0LmtleXModGhpcy5maW5kT3B0aW9ucy5zb3J0KSkge1xuICAgICAgY29uc3Qgcm9vdEZpZWxkID0gc29ydEtleS5zcGxpdCgnLicpWzBdO1xuICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyhzb3J0S2V5KSB8fCBwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMocm9vdEZpZWxkKSkge1xuICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgIGBUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gc29ydCBieSAke3NvcnRLZXl9IG9uIGNsYXNzICR7dGhpcy5jbGFzc05hbWV9YCxcbiAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gQXVnbWVudHMgdGhpcy5yZXNwb25zZSB3aXRoIGFsbCBwb2ludGVycyBvbiBhbiBvYmplY3Rcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGVBbGwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5pbmNsdWRlQWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgaW5jbHVkZUZpZWxkcyA9IFtdO1xuICAgICAgY29uc3Qga2V5RmllbGRzID0gW107XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKVxuICAgICAgICApIHtcbiAgICAgICAgICBpbmNsdWRlRmllbGRzLnB1c2goW2ZpZWxkXSk7XG4gICAgICAgICAga2V5RmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBBZGQgZmllbGRzIHRvIGluY2x1ZGUsIGtleXMsIHJlbW92ZSBkdXBzXG4gICAgICB0aGlzLmluY2x1ZGUgPSBbLi4ubmV3IFNldChbLi4udGhpcy5pbmNsdWRlLCAuLi5pbmNsdWRlRmllbGRzXSldO1xuICAgICAgLy8gaWYgdGhpcy5rZXlzIG5vdCBzZXQsIHRoZW4gYWxsIGtleXMgYXJlIGFscmVhZHkgaW5jbHVkZWRcbiAgICAgIGlmICh0aGlzLmtleXMpIHtcbiAgICAgICAgdGhpcy5rZXlzID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMua2V5cywgLi4ua2V5RmllbGRzXSldO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUudmFsaWRhdGVJbmNsdWRlQ29tcGxleGl0eSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByYyA9IHRoaXMuY29uZmlnLnJlcXVlc3RDb21wbGV4aXR5O1xuICBpZiAoIXJjKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyYy5pbmNsdWRlRGVwdGggIT09IC0xICYmIHRoaXMuaW5jbHVkZSAmJiB0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG1heERlcHRoID0gTWF0aC5tYXgoLi4udGhpcy5pbmNsdWRlLm1hcChwYXRoID0+IHBhdGgubGVuZ3RoKSk7XG4gICAgaWYgKG1heERlcHRoID4gcmMuaW5jbHVkZURlcHRoKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYEluY2x1ZGUgZGVwdGggb2YgJHttYXhEZXB0aH0gZXhjZWVkcyBtYXhpbXVtIGFsbG93ZWQgZGVwdGggb2YgJHtyYy5pbmNsdWRlRGVwdGh9YDtcbiAgICAgIGxvZ2dlci53YXJuKG1lc3NhZ2UpO1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIG1lc3NhZ2UpO1xuICAgIH1cbiAgfVxuICBpZiAocmMuaW5jbHVkZUNvdW50ICE9PSAtMSAmJiB0aGlzLmluY2x1ZGUgJiYgdGhpcy5pbmNsdWRlLmxlbmd0aCA+IHJjLmluY2x1ZGVDb3VudCkge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBgTnVtYmVyIG9mIGluY2x1ZGUgZmllbGRzICgke3RoaXMuaW5jbHVkZS5sZW5ndGh9KSBleGNlZWRzIG1heGltdW0gYWxsb3dlZCAoJHtyYy5pbmNsdWRlQ291bnR9KWA7XG4gICAgbG9nZ2VyLndhcm4obWVzc2FnZSk7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIG1lc3NhZ2UpO1xuICB9XG59O1xuXG4vLyBVcGRhdGVzIHByb3BlcnR5IGB0aGlzLmtleXNgIHRvIGNvbnRhaW4gYWxsIGtleXMgYnV0IHRoZSBvbmVzIHVuc2VsZWN0ZWQuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgaW5kZXhlZFJlc3VsdHMgPSB0aGlzLnJlc3BvbnNlLnJlc3VsdHMucmVkdWNlKChpbmRleGVkLCByZXN1bHQsIGkpID0+IHtcbiAgICBpbmRleGVkW3Jlc3VsdC5vYmplY3RJZF0gPSBpO1xuICAgIHJldHVybiBpbmRleGVkO1xuICB9LCB7fSk7XG5cbiAgLy8gQnVpbGQgdGhlIGV4ZWN1dGlvbiB0cmVlXG4gIGNvbnN0IGV4ZWN1dGlvblRyZWUgPSB7fVxuICB0aGlzLmluY2x1ZGUuZm9yRWFjaChwYXRoID0+IHtcbiAgICBsZXQgY3VycmVudCA9IGV4ZWN1dGlvblRyZWU7XG4gICAgcGF0aC5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICBpZiAoIWN1cnJlbnRbbm9kZV0pIHtcbiAgICAgICAgY3VycmVudFtub2RlXSA9IHtcbiAgICAgICAgICBwYXRoLFxuICAgICAgICAgIGNoaWxkcmVuOiB7fVxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgY3VycmVudCA9IGN1cnJlbnRbbm9kZV0uY2hpbGRyZW5cbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgcmVjdXJzaXZlRXhlY3V0aW9uVHJlZSA9IGFzeW5jICh0cmVlTm9kZSkgPT4ge1xuICAgIGNvbnN0IHsgcGF0aCwgY2hpbGRyZW4gfSA9IHRyZWVOb2RlO1xuICAgIGNvbnN0IHBhdGhSZXNwb25zZSA9IGluY2x1ZGVQYXRoKFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLnJlc3BvbnNlLFxuICAgICAgcGF0aCxcbiAgICAgIHRoaXMuY29udGV4dCxcbiAgICAgIHRoaXMucmVzdE9wdGlvbnMsXG4gICAgICB0aGlzLFxuICAgICk7XG4gICAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgICBjb25zdCBuZXdSZXNwb25zZSA9IGF3YWl0IHBhdGhSZXNwb25zZVxuICAgICAgbmV3UmVzcG9uc2UucmVzdWx0cy5mb3JFYWNoKG5ld09iamVjdCA9PiB7XG4gICAgICAgIC8vIFdlIGh5ZHJhdGUgdGhlIHJvb3Qgb2YgZWFjaCByZXN1bHQgd2l0aCBzdWIgcmVzdWx0c1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHNbaW5kZXhlZFJlc3VsdHNbbmV3T2JqZWN0Lm9iamVjdElkXV1bcGF0aFswXV0gPSBuZXdPYmplY3RbcGF0aFswXV07XG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoT2JqZWN0LnZhbHVlcyhjaGlsZHJlbikubWFwKHJlY3Vyc2l2ZUV4ZWN1dGlvblRyZWUpKTtcbiAgfVxuXG4gIGF3YWl0IFByb21pc2UuYWxsKE9iamVjdC52YWx1ZXMoZXhlY3V0aW9uVHJlZSkubWFwKHJlY3Vyc2l2ZUV4ZWN1dGlvblRyZWUpKTtcbiAgdGhpcy5pbmNsdWRlID0gW11cbn07XG5cbi8vUmV0dXJucyBhIHByb21pc2Ugb2YgYSBwcm9jZXNzZWQgc2V0IG9mIHJlc3VsdHNcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJ1bkFmdGVyRmluZFRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXRoaXMucnVuQWZ0ZXJGaW5kKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyRmluZCcgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJGaW5kSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgaWYgKCFoYXNBZnRlckZpbmRIb29rKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFNraXAgQWdncmVnYXRlIGFuZCBEaXN0aW5jdCBRdWVyaWVzXG4gIGlmICh0aGlzLmZpbmRPcHRpb25zLnBpcGVsaW5lIHx8IHRoaXMuZmluZE9wdGlvbnMuZGlzdGluY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5yZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSB0aGlzLnJlc3RXaGVyZTtcbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeSh0aGlzLmNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG4gIC8vIFJ1biBhZnRlckZpbmQgdHJpZ2dlciBhbmQgc2V0IHRoZSBuZXcgcmVzdWx0c1xuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHBhcnNlUXVlcnksXG4gICAgICB0aGlzLmNvbnRleHQsXG4gICAgICB0aGlzLmlzR2V0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVBdXRoQWRhcHRlcnMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLmZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLm1hcChyZXN1bHQgPT5cbiAgICAgIHRoaXMuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5ydW5BZnRlckZpbmQoXG4gICAgICAgIHsgY29uZmlnOiB0aGlzLmNvbmZpZywgYXV0aDogdGhpcy5hdXRoIH0sXG4gICAgICAgIHJlc3VsdC5hdXRoRGF0YVxuICAgICAgKVxuICAgIClcbiAgKTtcbn07XG5cbi8vIEFkZHMgaW5jbHVkZWQgdmFsdWVzIHRvIHRoZSByZXNwb25zZS5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkIG5hbWVzLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIGF1Z21lbnRlZCByZXNwb25zZS5cbmZ1bmN0aW9uIGluY2x1ZGVQYXRoKGNvbmZpZywgYXV0aCwgcmVzcG9uc2UsIHBhdGgsIGNvbnRleHQsIHJlc3RPcHRpb25zID0ge30pIHtcbiAgdmFyIHBvaW50ZXJzID0gZmluZFBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgpO1xuICBpZiAocG9pbnRlcnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgcG9pbnRlcnNIYXNoID0ge307XG4gIGZvciAodmFyIHBvaW50ZXIgb2YgcG9pbnRlcnMpIHtcbiAgICBpZiAoIXBvaW50ZXIpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc05hbWUgPSBwb2ludGVyLmNsYXNzTmFtZTtcbiAgICAvLyBvbmx5IGluY2x1ZGUgdGhlIGdvb2QgcG9pbnRlcnNcbiAgICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSA9IHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdIHx8IG5ldyBTZXQoKTtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdLmFkZChwb2ludGVyLm9iamVjdElkKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgaW5jbHVkZVJlc3RPcHRpb25zID0ge307XG4gIGlmIChyZXN0T3B0aW9ucy5rZXlzKSB7XG4gICAgY29uc3Qga2V5cyA9IG5ldyBTZXQocmVzdE9wdGlvbnMua2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBrZXlTZXQgPSBBcnJheS5mcm9tKGtleXMpLnJlZHVjZSgoc2V0LCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGtleVBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGZvciAoaTsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhdGhbaV0gIT0ga2V5UGF0aFtpXSkge1xuICAgICAgICAgIHJldHVybiBzZXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpIDwga2V5UGF0aC5sZW5ndGgpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoa2V5U2V0LnNpemUgPiAwKSB7XG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnMua2V5cyA9IEFycmF5LmZyb20oa2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzKSB7XG4gICAgY29uc3QgZXhjbHVkZUtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlTZXQgPSBBcnJheS5mcm9tKGV4Y2x1ZGVLZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA9PSBrZXlQYXRoLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoZXhjbHVkZUtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0gQXJyYXkuZnJvbShleGNsdWRlS2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cbiAgY29uc3QgcXVlcnlQcm9taXNlcyA9IE9iamVjdC5rZXlzKHBvaW50ZXJzSGFzaCkubWFwKGFzeW5jIGNsYXNzTmFtZSA9PiB7XG4gICAgY29uc3Qgb2JqZWN0SWRzID0gQXJyYXkuZnJvbShwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSk7XG4gICAgbGV0IHdoZXJlO1xuICAgIGlmIChvYmplY3RJZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IG9iamVjdElkc1swXSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IHsgJGluOiBvYmplY3RJZHMgfSB9O1xuICAgIH1cbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IG9iamVjdElkcy5sZW5ndGggPT09IDEgPyBSZXN0UXVlcnkuTWV0aG9kLmdldCA6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGF1dGgsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICByZXN0V2hlcmU6IHdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnM6IGluY2x1ZGVSZXN0T3B0aW9ucyxcbiAgICAgIGNvbnRleHQ6IGNvbnRleHQsXG4gICAgfSk7XG4gICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoeyBvcDogJ2dldCcgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHRzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gR2V0IHRoZSBvYmplY3RzIGZvciBhbGwgdGhlc2Ugb2JqZWN0IGlkc1xuICByZXR1cm4gUHJvbWlzZS5hbGwocXVlcnlQcm9taXNlcykudGhlbihyZXNwb25zZXMgPT4ge1xuICAgIHZhciByZXBsYWNlID0gcmVzcG9uc2VzLnJlZHVjZSgocmVwbGFjZSwgaW5jbHVkZVJlc3BvbnNlKSA9PiB7XG4gICAgICBmb3IgKHZhciBvYmogb2YgaW5jbHVkZVJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgb2JqLl9fdHlwZSA9ICdPYmplY3QnO1xuICAgICAgICBvYmouY2xhc3NOYW1lID0gaW5jbHVkZVJlc3BvbnNlLmNsYXNzTmFtZTtcblxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSA9PSAnX1VzZXInICYmICFhdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgZGVsZXRlIG9iai5zZXNzaW9uVG9rZW47XG4gICAgICAgICAgZGVsZXRlIG9iai5hdXRoRGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXBsYWNlW29iai5vYmplY3RJZF0gPSBvYmo7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVwbGFjZTtcbiAgICB9LCB7fSk7XG4gICAgdmFyIHJlc3AgPSB7XG4gICAgICByZXN1bHRzOiByZXBsYWNlUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCwgcmVwbGFjZSksXG4gICAgfTtcbiAgICBpZiAocmVzcG9uc2UuY291bnQpIHtcbiAgICAgIHJlc3AuY291bnQgPSByZXNwb25zZS5jb3VudDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3A7XG4gIH0pO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3QgdG8gZmluZCBwb2ludGVycyBpbiwgb3Jcbi8vIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBJZiB0aGUgcGF0aCB5aWVsZHMgdGhpbmdzIHRoYXQgYXJlbid0IHBvaW50ZXJzLCB0aGlzIHRocm93cyBhbiBlcnJvci5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIFJldHVybnMgYSBsaXN0IG9mIHBvaW50ZXJzIGluIFJFU1QgZm9ybWF0LlxuZnVuY3Rpb24gZmluZFBvaW50ZXJzKG9iamVjdCwgcGF0aCkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0Lm1hcCh4ID0+IGZpbmRQb2ludGVycyh4LCBwYXRoKSkuZmxhdCgpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT0gMCkge1xuICAgIGlmIChvYmplY3QgPT09IG51bGwgfHwgb2JqZWN0Ll9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBbb2JqZWN0XTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIGZpbmRQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSkpO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3RzIHRvIHJlcGxhY2UgcG9pbnRlcnNcbi8vIGluLCBvciBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gcmVwbGFjZSBpcyBhIG1hcCBmcm9tIG9iamVjdCBpZCAtPiBvYmplY3QuXG4vLyBSZXR1cm5zIHNvbWV0aGluZyBhbmFsb2dvdXMgdG8gb2JqZWN0LCBidXQgd2l0aCB0aGUgYXBwcm9wcmlhdGVcbi8vIHBvaW50ZXJzIGluZmxhdGVkLlxuZnVuY3Rpb24gcmVwbGFjZVBvaW50ZXJzKG9iamVjdCwgcGF0aCwgcmVwbGFjZSkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0XG4gICAgICAubWFwKG9iaiA9PiByZXBsYWNlUG9pbnRlcnMob2JqLCBwYXRoLCByZXBsYWNlKSlcbiAgICAgIC5maWx0ZXIob2JqID0+IHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChvYmplY3QgJiYgb2JqZWN0Ll9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gcmVwbGFjZVtvYmplY3Qub2JqZWN0SWRdO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIHZhciBuZXdzdWIgPSByZXBsYWNlUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpLCByZXBsYWNlKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleSA9PSBwYXRoWzBdKSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG5ld3N1YjtcbiAgICB9IGVsc2Uge1xuICAgICAgYW5zd2VyW2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gRmluZHMgYSBzdWJvYmplY3QgdGhhdCBoYXMgdGhlIGdpdmVuIGtleSwgaWYgdGhlcmUgaXMgb25lLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZmluZE9iamVjdFdpdGhLZXkocm9vdCwga2V5KSB7XG4gIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGZvciAodmFyIGl0ZW0gb2Ygcm9vdCkge1xuICAgICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkoaXRlbSwga2V5KTtcbiAgICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gQXJyYXlzIGFyZSBmdWxseSB0cmF2ZXJzZWQgYWJvdmU7IHJldHVybmluZyBoZXJlIGF2b2lkcyByZS13YWxraW5nIHRoZSBzYW1lXG4gICAgLy8gZWxlbWVudHMgdGhyb3VnaCB0aGUgYGZvciAoc3Via2V5IGluIHJvb3QpYCBsb29wIGJlbG93LCB3aGljaCB3b3VsZCBtYWtlIHRoaXNcbiAgICAvLyBmdW5jdGlvbiBPKDJebikgZm9yIG5lc3RlZCBhcnJheXMgKGUuZy4gZGVlcGx5IG5lc3RlZCAkb3IvJGFuZC8kbm9yKS5cbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgJiYgcm9vdFtrZXldKSB7XG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cbiAgZm9yICh2YXIgc3Via2V5IGluIHJvb3QpIHtcbiAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShyb290W3N1YmtleV0sIGtleSk7XG4gICAgaWYgKGFuc3dlcikge1xuICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXN0UXVlcnk7XG4vLyBGb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl9VbnNhZmVSZXN0UXVlcnkgPSBfVW5zYWZlUmVzdFF1ZXJ5O1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7O0FBRUEsSUFBSUEsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQyxnQ0FBZ0MsQ0FBQztBQUNoRSxJQUFJQyxLQUFLLEdBQUdELE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQ0MsS0FBSztBQUN2QyxJQUFJQyxNQUFNLEdBQUdGLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQ0csT0FBTztBQUN4QyxNQUFNQyxRQUFRLEdBQUdKLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDdEMsTUFBTTtFQUFFSztBQUFjLENBQUMsR0FBR0wsT0FBTyxDQUFDLDZCQUE2QixDQUFDO0FBQ2hFLE1BQU1NLGtCQUFrQixHQUFHLENBQUMsVUFBVSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDO0FBQ3hFLE1BQU07RUFBRUM7QUFBb0IsQ0FBQyxHQUFHUCxPQUFPLENBQUMsY0FBYyxDQUFDO0FBQ3ZELE1BQU07RUFBRVE7QUFBcUIsQ0FBQyxHQUFHUixPQUFPLENBQUMsU0FBUyxDQUFDOztBQUVuRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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