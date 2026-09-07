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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwibG9nZ2VyIiwiZGVmYXVsdCIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsImVuZm9yY2VSb2xlU2VjdXJpdHkiLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJjb250ZXh0IiwiTWV0aG9kIiwiZmluZCIsImdldCIsImluY2x1ZGVzIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiaXNHZXQiLCJyZXN1bHQiLCJtYXliZVJ1blF1ZXJ5VHJpZ2dlciIsIlR5cGVzIiwiYmVmb3JlRmluZCIsIlByb21pc2UiLCJyZXNvbHZlIiwiX1Vuc2FmZVJlc3RRdWVyeSIsIk9iamVjdCIsImZyZWV6ZSIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImRvQ291bnQiLCJpbmNsdWRlQWxsIiwiaW5jbHVkZSIsImtleXNGb3JJbmNsdWRlIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwia2V5cyIsImV4Y2x1ZGVLZXlzIiwibGVuZ3RoIiwic3BsaXQiLCJmaWx0ZXIiLCJrZXkiLCJtYXAiLCJzbGljZSIsImxhc3RJbmRleE9mIiwiam9pbiIsIm9wdGlvbiIsImNvbmNhdCIsIkFycmF5IiwiZnJvbSIsIlNldCIsImV4Y2x1ZGUiLCJrIiwiaW5kZXhPZiIsImZpZWxkcyIsIm9yZGVyIiwic29ydCIsInJlZHVjZSIsInNvcnRNYXAiLCJmaWVsZCIsInRyaW0iLCJzY29yZSIsIiRtZXRhIiwicGF0aHMiLCJwYXRoU2V0IiwibWVtbyIsInBhdGgiLCJpbmRleCIsInBhcnRzIiwicyIsImEiLCJiIiwicmVkaXJlY3RLZXkiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInJlZGlyZWN0Q2xhc3NOYW1lIiwiSU5WQUxJRF9KU09OIiwiZXhlY3V0ZSIsImV4ZWN1dGVPcHRpb25zIiwidGhlbiIsInZhbGlkYXRlUXVlcnlEZXB0aCIsImJ1aWxkUmVzdFdoZXJlIiwiZGVueVByb3RlY3RlZEZpZWxkcyIsImhhbmRsZUluY2x1ZGVBbGwiLCJ2YWxpZGF0ZUluY2x1ZGVDb21wbGV4aXR5IiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImhhbmRsZUF1dGhBZGFwdGVycyIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiaXNNYWludGVuYW5jZSIsInJjIiwicmVxdWVzdENvbXBsZXhpdHkiLCJxdWVyeURlcHRoIiwibWF4RGVwdGgiLCJjaGVja0RlcHRoIiwibm9kZSIsImRlcHRoIiwiaXNBcnJheSIsIml0ZW0iLCJpc0xvZ2ljYWwiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsImNoZWNrU3VicXVlcnlEZXB0aCIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJwdXNoIiwic3VicXVlcnlEZXB0aCIsIl9zdWJxdWVyeURlcHRoIiwibWVzc2FnZSIsIndhcm4iLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJjaGlsZENvbnRleHQiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJjaGVja1doZXJlIiwid2hlcmVLZXkiLCJyb290RmllbGQiLCJ1bmRlZmluZWQiLCJzdWJRdWVyeSIsInNvcnRLZXkiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsImluY2x1ZGVEZXB0aCIsIk1hdGgiLCJtYXgiLCJpbmNsdWRlQ291bnQiLCJpbmRleGVkUmVzdWx0cyIsImluZGV4ZWQiLCJpIiwiZXhlY3V0aW9uVHJlZSIsImN1cnJlbnQiLCJjaGlsZHJlbiIsInJlY3Vyc2l2ZUV4ZWN1dGlvblRyZWUiLCJ0cmVlTm9kZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJuZXdPYmplY3QiLCJhbGwiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwic2l6ZSIsImV4Y2x1ZGVLZXlTZXQiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJxdWVyeVByb21pc2VzIiwib2JqZWN0SWRzIiwiJGluIiwicmVzcG9uc2VzIiwicmVwbGFjZSIsImluY2x1ZGVSZXNwb25zZSIsIm9iaiIsInNlc3Npb25Ub2tlbiIsInJlc3AiLCJyZXBsYWNlUG9pbnRlcnMiLCJ4IiwiZmxhdCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsImFuc3dlciIsInJvb3QiLCJzdWJrZXkiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1Jlc3RRdWVyeS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBbiBvYmplY3QgdGhhdCBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhICdmaW5kJ1xuLy8gb3BlcmF0aW9uLCBlbmNvZGVkIGluIHRoZSBSRVNUIEFQSSBmb3JtYXQuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG52YXIgbG9nZ2VyID0gcmVxdWlyZSgnLi9sb2dnZXInKS5kZWZhdWx0O1xuY29uc3QgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG5jb25zdCB7IGNvbnRpbnVlV2hpbGUgfSA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL3Byb21pc2VVdGlscycpO1xuY29uc3QgQWx3YXlzU2VsZWN0ZWRLZXlzID0gWydvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0JywgJ0FDTCddO1xuY29uc3QgeyBlbmZvcmNlUm9sZVNlY3VyaXR5IH0gPSByZXF1aXJlKCcuL1NoYXJlZFJlc3QnKTtcbmNvbnN0IHsgY3JlYXRlU2FuaXRpemVkRXJyb3IgfSA9IHJlcXVpcmUoJy4vRXJyb3InKTtcblxuLy8gcmVzdE9wdGlvbnMgY2FuIGluY2x1ZGU6XG4vLyAgIHNraXBcbi8vICAgbGltaXRcbi8vICAgb3JkZXJcbi8vICAgY291bnRcbi8vICAgaW5jbHVkZVxuLy8gICBrZXlzXG4vLyAgIGV4Y2x1ZGVLZXlzXG4vLyAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5XG4vLyAgIHJlYWRQcmVmZXJlbmNlXG4vLyAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZVxuLy8gICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlXG4vKipcbiAqIFVzZSB0byBwZXJmb3JtIGEgcXVlcnkgb24gYSBjbGFzcy4gSXQgd2lsbCBydW4gc2VjdXJpdHkgY2hlY2tzIGFuZCB0cmlnZ2Vycy5cbiAqIEBwYXJhbSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5tZXRob2Qge1Jlc3RRdWVyeS5NZXRob2R9IFRoZSB0eXBlIG9mIHF1ZXJ5IHRvIHBlcmZvcm1cbiAqIEBwYXJhbSBvcHRpb25zLmNvbmZpZyB7UGFyc2VTZXJ2ZXJDb25maWd1cmF0aW9ufSBUaGUgc2VydmVyIGNvbmZpZ3VyYXRpb25cbiAqIEBwYXJhbSBvcHRpb25zLmF1dGgge0F1dGh9IFRoZSBhdXRoIG9iamVjdCBmb3IgdGhlIHJlcXVlc3RcbiAqIEBwYXJhbSBvcHRpb25zLmNsYXNzTmFtZSB7c3RyaW5nfSBUaGUgbmFtZSBvZiB0aGUgY2xhc3MgdG8gcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RXaGVyZSB7b2JqZWN0fSBUaGUgd2hlcmUgb2JqZWN0IGZvciB0aGUgcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RPcHRpb25zIHtvYmplY3R9IFRoZSBvcHRpb25zIG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5ydW5BZnRlckZpbmQge2Jvb2xlYW59IFdoZXRoZXIgdG8gcnVuIHRoZSBhZnRlckZpbmQgdHJpZ2dlclxuICogQHBhcmFtIG9wdGlvbnMucnVuQmVmb3JlRmluZCB7Ym9vbGVhbn0gV2hldGhlciB0byBydW4gdGhlIGJlZm9yZUZpbmQgdHJpZ2dlclxuICogQHBhcmFtIG9wdGlvbnMuY29udGV4dCB7b2JqZWN0fSBUaGUgY29udGV4dCBvYmplY3QgZm9yIHRoZSBxdWVyeVxuICogQHJldHVybnMge1Byb21pc2U8X1Vuc2FmZVJlc3RRdWVyeT59IEEgcHJvbWlzZSB0aGF0IGlzIHJlc29sdmVkIHdpdGggdGhlIF9VbnNhZmVSZXN0UXVlcnkgb2JqZWN0XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIFJlc3RRdWVyeSh7XG4gIG1ldGhvZCxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBydW5CZWZvcmVGaW5kID0gdHJ1ZSxcbiAgY29udGV4dCxcbn0pIHtcbiAgaWYgKCFbUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLCBSZXN0UXVlcnkuTWV0aG9kLmdldF0uaW5jbHVkZXMobWV0aG9kKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnYmFkIHF1ZXJ5IHR5cGUnKTtcbiAgfVxuICBjb25zdCBpc0dldCA9IG1ldGhvZCA9PT0gUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQ7XG4gIGVuZm9yY2VSb2xlU2VjdXJpdHkobWV0aG9kLCBjbGFzc05hbWUsIGF1dGgsIGNvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdCA9IHJ1bkJlZm9yZUZpbmRcbiAgICA/IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbnRleHQsXG4gICAgICBpc0dldFxuICAgIClcbiAgICA6IFByb21pc2UucmVzb2x2ZSh7IHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMgfSk7XG5cbiAgcmV0dXJuIG5ldyBfVW5zYWZlUmVzdFF1ZXJ5KFxuICAgIGNvbmZpZyxcbiAgICBhdXRoLFxuICAgIGNsYXNzTmFtZSxcbiAgICByZXN1bHQucmVzdFdoZXJlIHx8IHJlc3RXaGVyZSxcbiAgICByZXN1bHQucmVzdE9wdGlvbnMgfHwgcmVzdE9wdGlvbnMsXG4gICAgcnVuQWZ0ZXJGaW5kLFxuICAgIGNvbnRleHQsXG4gICAgaXNHZXRcbiAgKTtcbn1cblxuUmVzdFF1ZXJ5Lk1ldGhvZCA9IE9iamVjdC5mcmVlemUoe1xuICBnZXQ6ICdnZXQnLFxuICBmaW5kOiAnZmluZCcsXG59KTtcblxuLyoqXG4gKiBfVW5zYWZlUmVzdFF1ZXJ5IGlzIG1lYW50IGZvciBzcGVjaWZpYyBpbnRlcm5hbCB1c2FnZSBvbmx5LiBXaGVuIHlvdSBuZWVkIHRvIHNraXAgc2VjdXJpdHkgY2hlY2tzIG9yIHNvbWUgdHJpZ2dlcnMuXG4gKiBEb24ndCB1c2UgaXQgaWYgeW91IGRvbid0IGtub3cgd2hhdCB5b3UgYXJlIGRvaW5nLlxuICogQHBhcmFtIGNvbmZpZ1xuICogQHBhcmFtIGF1dGhcbiAqIEBwYXJhbSBjbGFzc05hbWVcbiAqIEBwYXJhbSByZXN0V2hlcmVcbiAqIEBwYXJhbSByZXN0T3B0aW9uc1xuICogQHBhcmFtIHJ1bkFmdGVyRmluZFxuICogQHBhcmFtIGNvbnRleHRcbiAqL1xuZnVuY3Rpb24gX1Vuc2FmZVJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5yZXN0V2hlcmUgPSByZXN0V2hlcmU7XG4gIHRoaXMucmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucztcbiAgdGhpcy5ydW5BZnRlckZpbmQgPSBydW5BZnRlckZpbmQ7XG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuICB0aGlzLmZpbmRPcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG4gIHRoaXMuaXNHZXQgPSBpc0dldDtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLCBjb25maWcpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG4gIGxldCBrZXlzRm9ySW5jbHVkZSA9ICcnO1xuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIFNlZSBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzMxODVcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2tleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlID0gcmVzdE9wdGlvbnMua2V5cztcbiAgfVxuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIGluIG9yZGVyIHRvIGV4Y2x1ZGUgc3BlY2lmaWMga2V5cy5cbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2V4Y2x1ZGVLZXlzJykpIHtcbiAgICBrZXlzRm9ySW5jbHVkZSArPSAnLCcgKyByZXN0T3B0aW9ucy5leGNsdWRlS2V5cztcbiAgfVxuXG4gIGlmIChrZXlzRm9ySW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZVxuICAgICAgLnNwbGl0KCcsJylcbiAgICAgIC5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgLy8gQXQgbGVhc3QgMiBjb21wb25lbnRzXG4gICAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKS5sZW5ndGggPiAxO1xuICAgICAgfSlcbiAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gU2xpY2UgdGhlIGxhc3QgY29tcG9uZW50IChhLmIuYyAtPiBhLmIpXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSdsbCBpbmNsdWRlIG9uZSBsZXZlbCB0b28gbXVjaC5cbiAgICAgICAgcmV0dXJuIGtleS5zbGljZSgwLCBrZXkubGFzdEluZGV4T2YoJy4nKSk7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywnKTtcblxuICAgIC8vIENvbmNhdCB0aGUgcG9zc2libHkgcHJlc2VudCBpbmNsdWRlIHN0cmluZyB3aXRoIHRoZSBvbmUgZnJvbSB0aGUga2V5c1xuICAgIC8vIERlZHVwIC8gc29ydGluZyBpcyBoYW5kbGUgaW4gJ2luY2x1ZGUnIGNhc2UuXG4gICAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghcmVzdE9wdGlvbnMuaW5jbHVkZSB8fCByZXN0T3B0aW9ucy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgKz0gJywnICsga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICh2YXIgb3B0aW9uIGluIHJlc3RPcHRpb25zKSB7XG4gICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgIGNhc2UgJ2tleXMnOiB7XG4gICAgICAgIGNvbnN0IGtleXMgPSByZXN0T3B0aW9ucy5rZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkubGVuZ3RoID4gMClcbiAgICAgICAgICAuY29uY2F0KEFsd2F5c1NlbGVjdGVkS2V5cyk7XG4gICAgICAgIHRoaXMua2V5cyA9IEFycmF5LmZyb20obmV3IFNldChrZXlzKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnZXhjbHVkZUtleXMnOiB7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGUgPSByZXN0T3B0aW9ucy5leGNsdWRlS2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrID0+IEFsd2F5c1NlbGVjdGVkS2V5cy5pbmRleE9mKGspIDwgMCk7XG4gICAgICAgIHRoaXMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXhjbHVkZSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgdGhpcy5kb0NvdW50ID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlQWxsJzpcbiAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdleHBsYWluJzpcbiAgICAgIGNhc2UgJ2hpbnQnOlxuICAgICAgY2FzZSAnZGlzdGluY3QnOlxuICAgICAgY2FzZSAncGlwZWxpbmUnOlxuICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICBjYXNlICdsaW1pdCc6XG4gICAgICBjYXNlICdyZWFkUHJlZmVyZW5jZSc6XG4gICAgICBjYXNlICdjb21tZW50JzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScgfHwgZmllbGQgPT09ICctJHNjb3JlJykge1xuICAgICAgICAgICAgc29ydE1hcC5zY29yZSA9IHsgJG1ldGE6ICd0ZXh0U2NvcmUnIH07XG4gICAgICAgICAgfSBlbHNlIGlmIChmaWVsZFswXSA9PSAnLScpIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGQuc2xpY2UoMSldID0gLTE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGRdID0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHNvcnRNYXA7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlJzoge1xuICAgICAgICBjb25zdCBwYXRocyA9IHJlc3RPcHRpb25zLmluY2x1ZGUuc3BsaXQoJywnKTtcbiAgICAgICAgaWYgKHBhdGhzLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIC8vIExvYWQgdGhlIGV4aXN0aW5nIGluY2x1ZGVzIChmcm9tIGtleXMpXG4gICAgICAgIGNvbnN0IHBhdGhTZXQgPSBwYXRocy5yZWR1Y2UoKG1lbW8sIHBhdGgpID0+IHtcbiAgICAgICAgICAvLyBTcGxpdCBlYWNoIHBhdGhzIG9uIC4gKGEuYi5jIC0+IFthLGIsY10pXG4gICAgICAgICAgLy8gcmVkdWNlIHRvIGNyZWF0ZSBhbGwgcGF0aHNcbiAgICAgICAgICAvLyAoW2EsYixjXSAtPiB7YTogdHJ1ZSwgJ2EuYic6IHRydWUsICdhLmIuYyc6IHRydWV9KVxuICAgICAgICAgIHJldHVybiBwYXRoLnNwbGl0KCcuJykucmVkdWNlKChtZW1vLCBwYXRoLCBpbmRleCwgcGFydHMpID0+IHtcbiAgICAgICAgICAgIG1lbW9bcGFydHMuc2xpY2UoMCwgaW5kZXggKyAxKS5qb2luKCcuJyldID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICAgIH0sIG1lbW8pO1xuICAgICAgICB9LCB7fSk7XG5cbiAgICAgICAgdGhpcy5pbmNsdWRlID0gT2JqZWN0LmtleXMocGF0aFNldClcbiAgICAgICAgICAubWFwKHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHMuc3BsaXQoJy4nKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDsgLy8gU29ydCBieSBudW1iZXIgb2YgY29tcG9uZW50c1xuICAgICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ3JlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5JzpcbiAgICAgICAgdGhpcy5yZWRpcmVjdEtleSA9IHJlc3RPcHRpb25zLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5O1xuICAgICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbnVsbDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlUmVhZFByZWZlcmVuY2UnOlxuICAgICAgY2FzZSAnc3VicXVlcnlSZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBvcHRpb246ICcgKyBvcHRpb24pO1xuICAgIH1cbiAgfVxufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIGEgcXVlcnlcbi8vIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNwb25zZSAtIGFuIG9iamVjdCB3aXRoIG9wdGlvbmFsIGtleXNcbi8vICdyZXN1bHRzJyBhbmQgJ2NvdW50Jy5cbi8vIFRPRE86IGNvbnNvbGlkYXRlIHRoZSByZXBsYWNlWCBmdW5jdGlvbnNcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVRdWVyeURlcHRoKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVueVByb3RlY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVJbmNsdWRlQ29tcGxleGl0eSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhBZGFwdGVycygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMgfSA9IHRoaXM7XG4gIC8vIGlmIHRoZSBsaW1pdCBpcyBzZXQsIHVzZSBpdFxuICByZXN0T3B0aW9ucy5saW1pdCA9IHJlc3RPcHRpb25zLmxpbWl0IHx8IDEwMDtcbiAgcmVzdE9wdGlvbnMub3JkZXIgPSAnb2JqZWN0SWQnO1xuICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcblxuICByZXR1cm4gY29udGludWVXaGlsZShcbiAgICAoKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbmlzaGVkO1xuICAgIH0sXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2FmZSBoZXJlIHRvIHVzZSBfVW5zYWZlUmVzdFF1ZXJ5IGJlY2F1c2UgdGhlIHNlY3VyaXR5IHdhcyBhbHJlYWR5XG4gICAgICAvLyBjaGVja2VkIGR1cmluZyBcImF3YWl0IFJlc3RRdWVyeSgpXCJcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IF9VbnNhZmVSZXN0UXVlcnkoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICB0aGlzLnJ1bkFmdGVyRmluZCxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICByZXN1bHRzLmZvckVhY2goY2FsbGJhY2spO1xuICAgICAgZmluaXNoZWQgPSByZXN1bHRzLmxlbmd0aCA8IHJlc3RPcHRpb25zLmxpbWl0O1xuICAgICAgaWYgKCFmaW5pc2hlZCkge1xuICAgICAgICByZXN0V2hlcmUub2JqZWN0SWQgPSBPYmplY3QuYXNzaWduKHt9LCByZXN0V2hlcmUub2JqZWN0SWQsIHtcbiAgICAgICAgICAkZ3Q6IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXS5vYmplY3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUudmFsaWRhdGVRdWVyeURlcHRoID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJjID0gdGhpcy5jb25maWcucmVxdWVzdENvbXBsZXhpdHk7XG4gIGlmICghcmMgfHwgcmMucXVlcnlEZXB0aCA9PT0gLTEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgbWF4RGVwdGggPSByYy5xdWVyeURlcHRoO1xuICBjb25zdCBjaGVja0RlcHRoID0gKG5vZGUsIGRlcHRoKSA9PiB7XG4gICAgaWYgKGRlcHRoID4gbWF4RGVwdGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgYFF1ZXJ5IGNvbmRpdGlvbiBuZXN0aW5nIGRlcHRoIGV4Y2VlZHMgbWF4aW11bSBhbGxvd2VkIGRlcHRoIG9mICR7bWF4RGVwdGh9YFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG5vZGUgPT09IG51bGwgfHwgdHlwZW9mIG5vZGUgIT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUpKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygbm9kZSkge1xuICAgICAgICBjaGVja0RlcHRoKGl0ZW0sIGRlcHRoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gRGVzY2VuZCBpbnRvIGV2ZXJ5IHZhbHVlIHNvIHRoYXQgbG9naWNhbCBvcGVyYXRvcnMgKCRvci8kYW5kLyRub3IpIG5lc3RlZFxuICAgIC8vIHVuZGVyIGZpZWxkLWxldmVsIG9wZXJhdG9ycyAoZS5nLiAkZWxlbU1hdGNoLCAkbm90KSBvciBwbGFpbiBmaWVsZCBuYW1lcyBhcmVcbiAgICAvLyBzdGlsbCBjb3VudGVkLiBPbmx5IGxvZ2ljYWwgb3BlcmF0b3JzIGluY3JlYXNlIHRoZSBkZXB0aCwgd2hpY2ggcHJlc2VydmVzIHRoZVxuICAgIC8vIGRvY3VtZW50ZWQgbWVhbmluZyBvZiBgcXVlcnlEZXB0aGAuXG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobm9kZSkpIHtcbiAgICAgIGNvbnN0IGlzTG9naWNhbCA9IGtleSA9PT0gJyRvcicgfHwga2V5ID09PSAnJGFuZCcgfHwga2V5ID09PSAnJG5vcic7XG4gICAgICBjaGVja0RlcHRoKG5vZGVba2V5XSwgaXNMb2dpY2FsID8gZGVwdGggKyAxIDogZGVwdGgpO1xuICAgIH1cbiAgfTtcbiAgY2hlY2tEZXB0aCh0aGlzLnJlc3RXaGVyZSwgMCk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5idWlsZFJlc3RXaGVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNoZWNrU3VicXVlcnlEZXB0aCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZWRpcmVjdEtleSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBjbGFzcyBuYW1lIGJhc2VkIG9uIHRoZSBzY2hlbWFcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlZGlyZWN0S2V5KVxuICAgIC50aGVuKG5ld0NsYXNzTmFtZSA9PiB7XG4gICAgICB0aGlzLmNsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG5cbiAgICAgIC8vIFJlLWFwcGx5IHNlY3VyaXR5IGNoZWNrcyBmb3IgdGhlIHJlZGlyZWN0ZWQgY2xhc3MgbmFtZSwgc2luY2UgdGhlXG4gICAgICAvLyBjaGVja3MgaW4gdGhlIGNvbnN0cnVjdG9yIGFuZCBpbiByZXN0LmZpbmQgcmFuIGFnYWluc3QgdGhlIG9yaWdpbmFsXG4gICAgICAvLyBjbGFzcyBuYW1lIGJlZm9yZSB0aGUgcmVkaXJlY3QuXG4gICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgICBlbmZvcmNlUm9sZVNlY3VyaXR5KCdmaW5kJywgdGhpcy5jbGFzc05hbWUsIHRoaXMuYXV0aCwgdGhpcy5jb25maWcpO1xuXG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykge1xuICAgICAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAgICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdXNlcjoge1xuICAgICAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgICAgICBvYmplY3RJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoaW5RdWVyeU9iamVjdFsnJGluJ10pKSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSBpblF1ZXJ5T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5jaGVja1N1YnF1ZXJ5RGVwdGggPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgcmMgPSB0aGlzLmNvbmZpZy5yZXF1ZXN0Q29tcGxleGl0eTtcbiAgaWYgKCFyYyB8fCByYy5zdWJxdWVyeURlcHRoID09PSAtMSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBkZXB0aCA9IHRoaXMuY29udGV4dC5fc3VicXVlcnlEZXB0aCB8fCAwO1xuICBpZiAoZGVwdGggPiByYy5zdWJxdWVyeURlcHRoKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGBTdWJxdWVyeSBuZXN0aW5nIGRlcHRoIGV4Y2VlZHMgbWF4aW11bSBhbGxvd2VkIGRlcHRoIG9mICR7cmMuc3VicXVlcnlEZXB0aH1gO1xuICAgIGxvZ2dlci53YXJuKG1lc3NhZ2UpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBtZXNzYWdlKTtcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3QgY2hpbGRDb250ZXh0ID0geyAuLi50aGlzLmNvbnRleHQsIF9zdWJxdWVyeURlcHRoOiAodGhpcy5jb250ZXh0Ll9zdWJxdWVyeURlcHRoIHx8IDApICsgMSB9O1xuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogaW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiBjaGlsZENvbnRleHQsXG4gIH0pO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10pKSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gbm90SW5RdWVyeU9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRub3RJblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRub3RJblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkbm90SW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhICRuaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBjaGlsZENvbnRleHQgPSB7IC4uLnRoaXMuY29udGV4dCwgX3N1YnF1ZXJ5RGVwdGg6ICh0aGlzLmNvbnRleHQuX3N1YnF1ZXJ5RGVwdGggfHwgMCkgKyAxIH07XG4gIGNvbnN0IHN1YnF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgIGF1dGg6IHRoaXMuYXV0aCxcbiAgICBjbGFzc05hbWU6IG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgcmVzdFdoZXJlOiBub3RJblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IGNoaWxkQ29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1Ob3RJblF1ZXJ5KG5vdEluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbi8vIFVzZWQgdG8gZ2V0IHRoZSBkZWVwZXN0IG9iamVjdCBmcm9tIGpzb24gdXNpbmcgZG90IG5vdGF0aW9uLlxuY29uc3QgZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkgPSAoanNvbiwga2V5LCBpZHgsIHNyYykgPT4ge1xuICBpZiAoa2V5IGluIGpzb24pIHtcbiAgICByZXR1cm4ganNvbltrZXldO1xuICB9XG4gIHNyYy5zcGxpY2UoMSk7IC8vIEV4aXQgRWFybHlcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IChzZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdE9iamVjdFsnJGluJ10pKSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHNlbGVjdE9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgc2VsZWN0T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkc2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJHNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJHNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRzZWxlY3QnKTtcbiAgaWYgKCFzZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgc2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBzZWxlY3RWYWx1ZSA9IHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICAvLyBpT1MgU0RLIGRvbid0IHNlbmQgd2hlcmUgaWYgbm90IHNldCwgbGV0IGl0IHBhc3NcbiAgaWYgKFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFzZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2Ygc2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKHNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkc2VsZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogc2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IGNoaWxkQ29udGV4dCA9IHsgLi4udGhpcy5jb250ZXh0LCBfc3VicXVlcnlEZXB0aDogKHRoaXMuY29udGV4dC5fc3VicXVlcnlEZXB0aCB8fCAwKSArIDEgfTtcbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IGNoaWxkQ29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBkb250U2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckZG9udFNlbGVjdCcpO1xuICBpZiAoIWRvbnRTZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgZG9udFNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgZG9udFNlbGVjdFZhbHVlID0gZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBkb250U2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhkb250U2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRkb250U2VsZWN0Jyk7XG4gIH1cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3QgY2hpbGRDb250ZXh0ID0geyAuLi50aGlzLmNvbnRleHQsIF9zdWJxdWVyeURlcHRoOiAodGhpcy5jb250ZXh0Ll9zdWJxdWVyeURlcHRoIHx8IDApICsgMSB9O1xuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiBjaGlsZENvbnRleHQsXG4gIH0pO1xuXG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtRG9udFNlbGVjdChkb250U2VsZWN0T2JqZWN0LCBkb250U2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkZG9udFNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5jbGVhblJlc3VsdEF1dGhEYXRhID0gZnVuY3Rpb24gKHJlc3VsdCkge1xuICBkZWxldGUgcmVzdWx0LnBhc3N3b3JkO1xuICBpZiAocmVzdWx0LmF1dGhEYXRhKSB7XG4gICAgT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGlmIChyZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGE7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50ID0gY29uc3RyYWludCA9PiB7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gY29uc3RyYWludDtcbiAgfVxuICBjb25zdCBlcXVhbFRvT2JqZWN0ID0ge307XG4gIGxldCBoYXNEaXJlY3RDb25zdHJhaW50ID0gZmFsc2U7XG4gIGxldCBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBrZXkgaW4gY29uc3RyYWludCkge1xuICAgIGlmIChrZXkuaW5kZXhPZignJCcpICE9PSAwKSB7XG4gICAgICBoYXNEaXJlY3RDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICAgIGVxdWFsVG9PYmplY3Rba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKGhhc0RpcmVjdENvbnN0cmFpbnQgJiYgaGFzT3BlcmF0b3JDb25zdHJhaW50KSB7XG4gICAgY29uc3RyYWludFsnJGVxJ10gPSBlcXVhbFRvT2JqZWN0O1xuICAgIE9iamVjdC5rZXlzKGVxdWFsVG9PYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGNvbnN0cmFpbnQ7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgdGhpcy5yZXN0V2hlcmUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucmVzdFdoZXJlKSB7XG4gICAgdGhpcy5yZXN0V2hlcmVba2V5XSA9IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQodGhpcy5yZXN0V2hlcmVba2V5XSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbiBvYmplY3QgdGhhdCBvbmx5IGhhcyAncmVzdWx0cycuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5GaW5kID0gYXN5bmMgZnVuY3Rpb24gKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAhZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICB0aGlzLmNsZWFuUmVzdWx0QXV0aERhdGEocmVzdWx0KTtcbiAgICB9XG4gIH1cblxuICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgcmVzdWx0cyk7XG5cbiAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICBmb3IgKHZhciByIG9mIHJlc3VsdHMpIHtcbiAgICAgIHIuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICB9XG4gIH1cbiAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogcmVzdWx0cyB9O1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZS5jb3VudCB3aXRoIHRoZSBjb3VudFxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucnVuQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kb0NvdW50KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuZmluZE9wdGlvbnMuY291bnQgPSB0cnVlO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5za2lwO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5saW1pdDtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCB0aGlzLmZpbmRPcHRpb25zKS50aGVuKGMgPT4ge1xuICAgIHRoaXMucmVzcG9uc2UuY291bnQgPSBjO1xuICB9KTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmRlbnlQcm90ZWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5maW5kT3B0aW9uc1xuICAgICkgfHwgW107XG4gIGNvbnN0IGNoZWNrV2hlcmUgPSAod2hlcmUpID0+IHtcbiAgICBpZiAodHlwZW9mIHdoZXJlICE9PSAnb2JqZWN0JyB8fCB3aGVyZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHdoZXJlS2V5IG9mIE9iamVjdC5rZXlzKHdoZXJlKSkge1xuICAgICAgY29uc3Qgcm9vdEZpZWxkID0gd2hlcmVLZXkuc3BsaXQoJy4nKVswXTtcbiAgICAgIGlmIChwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMod2hlcmVLZXkpIHx8IHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyhyb290RmllbGQpKSB7XG4gICAgICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgYFRoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBxdWVyeSAke3doZXJlS2V5fSBvbiBjbGFzcyAke3RoaXMuY2xhc3NOYW1lfWAsXG4gICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBvcCBvZiBbJyRvcicsICckYW5kJywgJyRub3InXSkge1xuICAgICAgaWYgKHdoZXJlW29wXSAhPT0gdW5kZWZpbmVkICYmICFBcnJheS5pc0FycmF5KHdoZXJlW29wXSkpIHtcbiAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgJHtvcH0gbXVzdCBiZSBhbiBhcnJheWAsXG4gICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHdoZXJlW29wXSkpIHtcbiAgICAgICAgd2hlcmVbb3BdLmZvckVhY2goc3ViUXVlcnkgPT4gY2hlY2tXaGVyZShzdWJRdWVyeSkpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgY2hlY2tXaGVyZSh0aGlzLnJlc3RXaGVyZSk7XG5cbiAgLy8gQ2hlY2sgc29ydCBrZXlzIGFnYWluc3QgcHJvdGVjdGVkIGZpZWxkc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5zb3J0KSB7XG4gICAgZm9yIChjb25zdCBzb3J0S2V5IG9mIE9iamVjdC5rZXlzKHRoaXMuZmluZE9wdGlvbnMuc29ydCkpIHtcbiAgICAgIGNvbnN0IHJvb3RGaWVsZCA9IHNvcnRLZXkuc3BsaXQoJy4nKVswXTtcbiAgICAgIGlmIChwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMoc29ydEtleSkgfHwgcHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHJvb3RGaWVsZCkpIHtcbiAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICBgVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIHNvcnQgYnkgJHtzb3J0S2V5fSBvbiBjbGFzcyAke3RoaXMuY2xhc3NOYW1lfWAsXG4gICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlQWxsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5JylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaW5jbHVkZUZpZWxkcy5wdXNoKFtmaWVsZF0pO1xuICAgICAgICAgIGtleUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gQWRkIGZpZWxkcyB0byBpbmNsdWRlLCBrZXlzLCByZW1vdmUgZHVwc1xuICAgICAgdGhpcy5pbmNsdWRlID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMuaW5jbHVkZSwgLi4uaW5jbHVkZUZpZWxkc10pXTtcbiAgICAgIC8vIGlmIHRoaXMua2V5cyBub3Qgc2V0LCB0aGVuIGFsbCBrZXlzIGFyZSBhbHJlYWR5IGluY2x1ZGVkXG4gICAgICBpZiAodGhpcy5rZXlzKSB7XG4gICAgICAgIHRoaXMua2V5cyA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmtleXMsIC4uLmtleUZpZWxkc10pXTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlSW5jbHVkZUNvbXBsZXhpdHkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgcmMgPSB0aGlzLmNvbmZpZy5yZXF1ZXN0Q29tcGxleGl0eTtcbiAgaWYgKCFyYykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocmMuaW5jbHVkZURlcHRoICE9PSAtMSAmJiB0aGlzLmluY2x1ZGUgJiYgdGhpcy5pbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtYXhEZXB0aCA9IE1hdGgubWF4KC4uLnRoaXMuaW5jbHVkZS5tYXAocGF0aCA9PiBwYXRoLmxlbmd0aCkpO1xuICAgIGlmIChtYXhEZXB0aCA+IHJjLmluY2x1ZGVEZXB0aCkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBJbmNsdWRlIGRlcHRoIG9mICR7bWF4RGVwdGh9IGV4Y2VlZHMgbWF4aW11bSBhbGxvd2VkIGRlcHRoIG9mICR7cmMuaW5jbHVkZURlcHRofWA7XG4gICAgICBsb2dnZXIud2FybihtZXNzYWdlKTtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBtZXNzYWdlKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJjLmluY2x1ZGVDb3VudCAhPT0gLTEgJiYgdGhpcy5pbmNsdWRlICYmIHRoaXMuaW5jbHVkZS5sZW5ndGggPiByYy5pbmNsdWRlQ291bnQpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gYE51bWJlciBvZiBpbmNsdWRlIGZpZWxkcyAoJHt0aGlzLmluY2x1ZGUubGVuZ3RofSkgZXhjZWVkcyBtYXhpbXVtIGFsbG93ZWQgKCR7cmMuaW5jbHVkZUNvdW50fSlgO1xuICAgIGxvZ2dlci53YXJuKG1lc3NhZ2UpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBtZXNzYWdlKTtcbiAgfVxufTtcblxuLy8gVXBkYXRlcyBwcm9wZXJ0eSBgdGhpcy5rZXlzYCB0byBjb250YWluIGFsbCBrZXlzIGJ1dCB0aGUgb25lcyB1bnNlbGVjdGVkLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlRXhjbHVkZUtleXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5leGNsdWRlS2V5cykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgdGhpcy5rZXlzID0gdGhpcy5rZXlzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKTtcbiAgICAgIHRoaXMua2V5cyA9IGZpZWxkcy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggZGF0YSBhdCB0aGUgcGF0aHMgcHJvdmlkZWQgaW4gdGhpcy5pbmNsdWRlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlSW5jbHVkZSA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaW5jbHVkZS5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGluZGV4ZWRSZXN1bHRzID0gdGhpcy5yZXNwb25zZS5yZXN1bHRzLnJlZHVjZSgoaW5kZXhlZCwgcmVzdWx0LCBpKSA9PiB7XG4gICAgaW5kZXhlZFtyZXN1bHQub2JqZWN0SWRdID0gaTtcbiAgICByZXR1cm4gaW5kZXhlZDtcbiAgfSwge30pO1xuXG4gIC8vIEJ1aWxkIHRoZSBleGVjdXRpb24gdHJlZVxuICBjb25zdCBleGVjdXRpb25UcmVlID0ge31cbiAgdGhpcy5pbmNsdWRlLmZvckVhY2gocGF0aCA9PiB7XG4gICAgbGV0IGN1cnJlbnQgPSBleGVjdXRpb25UcmVlO1xuICAgIHBhdGguZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgaWYgKCFjdXJyZW50W25vZGVdKSB7XG4gICAgICAgIGN1cnJlbnRbbm9kZV0gPSB7XG4gICAgICAgICAgcGF0aCxcbiAgICAgICAgICBjaGlsZHJlbjoge31cbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50W25vZGVdLmNoaWxkcmVuXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IHJlY3Vyc2l2ZUV4ZWN1dGlvblRyZWUgPSBhc3luYyAodHJlZU5vZGUpID0+IHtcbiAgICBjb25zdCB7IHBhdGgsIGNoaWxkcmVuIH0gPSB0cmVlTm9kZTtcbiAgICBjb25zdCBwYXRoUmVzcG9uc2UgPSBpbmNsdWRlUGF0aChcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5yZXNwb25zZSxcbiAgICAgIHBhdGgsXG4gICAgICB0aGlzLmNvbnRleHQsXG4gICAgICB0aGlzLnJlc3RPcHRpb25zLFxuICAgICAgdGhpcyxcbiAgICApO1xuICAgIGlmIChwYXRoUmVzcG9uc2UudGhlbikge1xuICAgICAgY29uc3QgbmV3UmVzcG9uc2UgPSBhd2FpdCBwYXRoUmVzcG9uc2VcbiAgICAgIG5ld1Jlc3BvbnNlLnJlc3VsdHMuZm9yRWFjaChuZXdPYmplY3QgPT4ge1xuICAgICAgICAvLyBXZSBoeWRyYXRlIHRoZSByb290IG9mIGVhY2ggcmVzdWx0IHdpdGggc3ViIHJlc3VsdHNcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzW2luZGV4ZWRSZXN1bHRzW25ld09iamVjdC5vYmplY3RJZF1dW3BhdGhbMF1dID0gbmV3T2JqZWN0W3BhdGhbMF1dO1xuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKE9iamVjdC52YWx1ZXMoY2hpbGRyZW4pLm1hcChyZWN1cnNpdmVFeGVjdXRpb25UcmVlKSk7XG4gIH1cblxuICBhd2FpdCBQcm9taXNlLmFsbChPYmplY3QudmFsdWVzKGV4ZWN1dGlvblRyZWUpLm1hcChyZWN1cnNpdmVFeGVjdXRpb25UcmVlKSk7XG4gIHRoaXMuaW5jbHVkZSA9IFtdXG59O1xuXG4vL1JldHVybnMgYSBwcm9taXNlIG9mIGEgcHJvY2Vzc2VkIHNldCBvZiByZXN1bHRzXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0LFxuICAgICAgdGhpcy5pc0dldFxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIEVuc3VyZSB3ZSBwcm9wZXJseSBzZXQgdGhlIGNsYXNzTmFtZSBiYWNrXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QpIHtcbiAgICAgICAgICAgIG9iamVjdCA9IG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlQXV0aEFkYXB0ZXJzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5maW5kT3B0aW9ucy5leHBsYWluKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IFByb21pc2UuYWxsKFxuICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cy5tYXAocmVzdWx0ID0+XG4gICAgICB0aGlzLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIucnVuQWZ0ZXJGaW5kKFxuICAgICAgICB7IGNvbmZpZzogdGhpcy5jb25maWcsIGF1dGg6IHRoaXMuYXV0aCB9LFxuICAgICAgICByZXN1bHQuYXV0aERhdGFcbiAgICAgIClcbiAgICApXG4gICk7XG59O1xuXG4vLyBBZGRzIGluY2x1ZGVkIHZhbHVlcyB0byB0aGUgcmVzcG9uc2UuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZCBuYW1lcy5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhdWdtZW50ZWQgcmVzcG9uc2UuXG5mdW5jdGlvbiBpbmNsdWRlUGF0aChjb25maWcsIGF1dGgsIHJlc3BvbnNlLCBwYXRoLCBjb250ZXh0LCByZXN0T3B0aW9ucyA9IHt9KSB7XG4gIHZhciBwb2ludGVycyA9IGZpbmRQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoKTtcbiAgaWYgKHBvaW50ZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IHBvaW50ZXJzSGFzaCA9IHt9O1xuICBmb3IgKHZhciBwb2ludGVyIG9mIHBvaW50ZXJzKSB7XG4gICAgaWYgKCFwb2ludGVyKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcG9pbnRlci5jbGFzc05hbWU7XG4gICAgLy8gb25seSBpbmNsdWRlIHRoZSBnb29kIHBvaW50ZXJzXG4gICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gPSBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSB8fCBuZXcgU2V0KCk7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXS5hZGQocG9pbnRlci5vYmplY3RJZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluY2x1ZGVSZXN0T3B0aW9ucyA9IHt9O1xuICBpZiAocmVzdE9wdGlvbnMua2V5cykge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3Qga2V5U2V0ID0gQXJyYXkuZnJvbShrZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA8IGtleVBhdGgubGVuZ3RoKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmtleXMgPSBBcnJheS5mcm9tKGtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cykge1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBleGNsdWRlS2V5U2V0ID0gQXJyYXkuZnJvbShleGNsdWRlS2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPT0ga2V5UGF0aC5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGV4Y2x1ZGVLZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20oZXhjbHVkZUtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmIChyZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChhc3luYyBjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBvYmplY3RJZHMubGVuZ3RoID09PSAxID8gUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQgOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBjb25maWcsXG4gICAgICBhdXRoLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdFdoZXJlOiB3aGVyZSxcbiAgICAgIHJlc3RPcHRpb25zOiBpbmNsdWRlUmVzdE9wdGlvbnMsXG4gICAgICBjb250ZXh0OiBjb250ZXh0LFxuICAgIH0pO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKHsgb3A6ICdnZXQnIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0cyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIEdldCB0aGUgb2JqZWN0cyBmb3IgYWxsIHRoZXNlIG9iamVjdCBpZHNcbiAgcmV0dXJuIFByb21pc2UuYWxsKHF1ZXJ5UHJvbWlzZXMpLnRoZW4ocmVzcG9uc2VzID0+IHtcbiAgICB2YXIgcmVwbGFjZSA9IHJlc3BvbnNlcy5yZWR1Y2UoKHJlcGxhY2UsIGluY2x1ZGVSZXNwb25zZSkgPT4ge1xuICAgICAgZm9yICh2YXIgb2JqIG9mIGluY2x1ZGVSZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgIG9iai5fX3R5cGUgPSAnT2JqZWN0JztcbiAgICAgICAgb2JqLmNsYXNzTmFtZSA9IGluY2x1ZGVSZXNwb25zZS5jbGFzc05hbWU7XG5cbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUgPT0gJ19Vc2VyJyAmJiAhYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIGRlbGV0ZSBvYmouc2Vzc2lvblRva2VuO1xuICAgICAgICAgIGRlbGV0ZSBvYmouYXV0aERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGFjZVtvYmoub2JqZWN0SWRdID0gb2JqO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcGxhY2U7XG4gICAgfSwge30pO1xuICAgIHZhciByZXNwID0ge1xuICAgICAgcmVzdWx0czogcmVwbGFjZVBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgsIHJlcGxhY2UpLFxuICAgIH07XG4gICAgaWYgKHJlc3BvbnNlLmNvdW50KSB7XG4gICAgICByZXNwLmNvdW50ID0gcmVzcG9uc2UuY291bnQ7XG4gICAgfVxuICAgIHJldHVybiByZXNwO1xuICB9KTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGZpbmQgcG9pbnRlcnMgaW4sIG9yXG4vLyBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gSWYgdGhlIHBhdGggeWllbGRzIHRoaW5ncyB0aGF0IGFyZW4ndCBwb2ludGVycywgdGhpcyB0aHJvd3MgYW4gZXJyb3IuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyBSZXR1cm5zIGEgbGlzdCBvZiBwb2ludGVycyBpbiBSRVNUIGZvcm1hdC5cbmZ1bmN0aW9uIGZpbmRQb2ludGVycyhvYmplY3QsIHBhdGgpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdC5tYXAoeCA9PiBmaW5kUG9pbnRlcnMoeCwgcGF0aCkpLmZsYXQoKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09IDApIHtcbiAgICBpZiAob2JqZWN0ID09PSBudWxsIHx8IG9iamVjdC5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gW29iamVjdF07XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBmaW5kUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpKTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cyB0byByZXBsYWNlIHBvaW50ZXJzXG4vLyBpbiwgb3IgaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIHJlcGxhY2UgaXMgYSBtYXAgZnJvbSBvYmplY3QgaWQgLT4gb2JqZWN0LlxuLy8gUmV0dXJucyBzb21ldGhpbmcgYW5hbG9nb3VzIHRvIG9iamVjdCwgYnV0IHdpdGggdGhlIGFwcHJvcHJpYXRlXG4vLyBwb2ludGVycyBpbmZsYXRlZC5cbmZ1bmN0aW9uIHJlcGxhY2VQb2ludGVycyhvYmplY3QsIHBhdGgsIHJlcGxhY2UpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdFxuICAgICAgLm1hcChvYmogPT4gcmVwbGFjZVBvaW50ZXJzKG9iaiwgcGF0aCwgcmVwbGFjZSkpXG4gICAgICAuZmlsdGVyKG9iaiA9PiB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBpZiAob2JqZWN0ICYmIG9iamVjdC5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIHJlcGxhY2Vbb2JqZWN0Lm9iamVjdElkXTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICB2YXIgbmV3c3ViID0gcmVwbGFjZVBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSwgcmVwbGFjZSk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkgPT0gcGF0aFswXSkge1xuICAgICAgYW5zd2VyW2tleV0gPSBuZXdzdWI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFuc3dlcltrZXldID0gb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIEZpbmRzIGEgc3Vib2JqZWN0IHRoYXQgaGFzIHRoZSBnaXZlbiBrZXksIGlmIHRoZXJlIGlzIG9uZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGZpbmRPYmplY3RXaXRoS2V5KHJvb3QsIGtleSkge1xuICBpZiAodHlwZW9mIHJvb3QgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBmb3IgKHZhciBpdGVtIG9mIHJvb3QpIHtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KGl0ZW0sIGtleSk7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIEFycmF5cyBhcmUgZnVsbHkgdHJhdmVyc2VkIGFib3ZlOyByZXR1cm5pbmcgaGVyZSBhdm9pZHMgcmUtd2Fsa2luZyB0aGUgc2FtZVxuICAgIC8vIGVsZW1lbnRzIHRocm91Z2ggdGhlIGBmb3IgKHN1YmtleSBpbiByb290KWAgbG9vcCBiZWxvdywgd2hpY2ggd291bGQgbWFrZSB0aGlzXG4gICAgLy8gZnVuY3Rpb24gTygyXm4pIGZvciBuZXN0ZWQgYXJyYXlzIChlLmcuIGRlZXBseSBuZXN0ZWQgJG9yLyRhbmQvJG5vcikuXG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290ICYmIHJvb3Rba2V5XSkge1xuICAgIHJldHVybiByb290O1xuICB9XG4gIGZvciAodmFyIHN1YmtleSBpbiByb290KSB7XG4gICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkocm9vdFtzdWJrZXldLCBrZXkpO1xuICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzdFF1ZXJ5O1xuLy8gRm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fVW5zYWZlUmVzdFF1ZXJ5ID0gX1Vuc2FmZVJlc3RRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFDaEUsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsSUFBSUMsTUFBTSxHQUFHRixPQUFPLENBQUMsVUFBVSxDQUFDLENBQUNHLE9BQU87QUFDeEMsTUFBTUMsUUFBUSxHQUFHSixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3RDLE1BQU07RUFBRUs7QUFBYyxDQUFDLEdBQUdMLE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQztBQUNoRSxNQUFNTSxrQkFBa0IsR0FBRyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQztBQUN4RSxNQUFNO0VBQUVDO0FBQW9CLENBQUMsR0FBR1AsT0FBTyxDQUFDLGNBQWMsQ0FBQztBQUN2RCxNQUFNO0VBQUVRO0FBQXFCLENBQUMsR0FBR1IsT0FBTyxDQUFDLFNBQVMsQ0FBQzs7QUFFbkQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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