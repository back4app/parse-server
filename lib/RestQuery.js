"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.
var SchemaController = require('./Controllers/SchemaController');

var Parse = require('parse/node').Parse;

const triggers = require('./triggers');

const {
  continueWhile
} = require('parse/lib/node/promiseUtils');

const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL']; // restOptions can include:
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

function RestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK, runAfterFind = true, context) {
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
  this.includeAll = false; // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]

  this.include = [];
  let keysForInclude = ''; // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185

  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    keysForInclude = restOptions.keys;
  } // If we have keys, we probably want to force some includes (n-1 level)
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
    }).join(','); // Concat the possibly present include string with the one from the keys
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
          } // Load the existing includes (from keys)


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
} // A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions


RestQuery.prototype.execute = function (executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
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
    return this.response;
  });
};

RestQuery.prototype.each = function (callback) {
  const {
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK
  } = this; // if the limit is set, use it

  restOptions.limit = restOptions.limit || 100;
  restOptions.order = 'objectId';
  let finished = false;
  return continueWhile(() => {
    return !finished;
  }, async () => {
    const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK, this.runAfterFind, this.context);
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

RestQuery.prototype.buildRestWhere = function () {
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
}; // Uses the Auth object to get the list of roles, adds the user id


RestQuery.prototype.getUserAndRoleACL = function () {
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
}; // Changes the className if redirectClassNameForKey is set.
// Returns a promise.


RestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  } // We need to change the class name based on the schema


  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
}; // Validates this operation against the allowClientClassCreation config.


RestQuery.prototype.validateClientClassCreation = function () {
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
} // Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceInQuery = function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');

  if (!inQueryObject) {
    return;
  } // The inQuery value must have precisely two keys - where and className


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

  var subquery = new RestQuery(this.config, this.auth, inQueryValue.className, inQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformInQuery(inQueryObject, subquery.className, response.results); // Recurse to repeat

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
} // Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceNotInQuery = function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');

  if (!notInQueryObject) {
    return;
  } // The notInQuery value must have precisely two keys - where and className


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

  var subquery = new RestQuery(this.config, this.auth, notInQueryValue.className, notInQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results); // Recurse to repeat

    return this.replaceNotInQuery();
  });
}; // Used to get the deepest object from json using dot notation.


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
}; // Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceSelect = function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');

  if (!selectObject) {
    return;
  } // The select value must have precisely two keys - query and key


  var selectValue = selectObject['$select']; // iOS SDK don't send where if not set, let it pass

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

  var subquery = new RestQuery(this.config, this.auth, selectValue.query.className, selectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformSelect(selectObject, selectValue.key, response.results); // Keep replacing $select clauses

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
}; // Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceDontSelect = function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');

  if (!dontSelectObject) {
    return;
  } // The dontSelect value must have precisely two keys - query and key


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

  var subquery = new RestQuery(this.config, this.auth, dontSelectValue.query.className, dontSelectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results); // Keep replacing $dontSelect clauses

    return this.replaceDontSelect();
  });
};

const cleanResultAuthData = function (result) {
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

RestQuery.prototype.replaceEquality = function () {
  if (typeof this.restWhere !== 'object') {
    return;
  }

  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
}; // Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.


RestQuery.prototype.runFind = function (options = {}) {
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

  return this.config.database.find(this.className, this.restWhere, findOptions, this.auth).then(results => {
    if (this.className === '_User' && !findOptions.explain) {
      for (var result of results) {
        cleanResultAuthData(result);
      }
    }

    this.config.filesController.expandFilesInObject(this.config, results);

    if (this.redirectClassName) {
      for (var r of results) {
        r.className = this.redirectClassName;
      }
    }

    this.response = {
      results: results
    };
  });
}; // Returns a promise for whether it was successful.
// Populates this.response.count with the count


RestQuery.prototype.runCount = function () {
  if (!this.doCount) {
    return;
  }

  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database.find(this.className, this.restWhere, this.findOptions).then(c => {
    this.response.count = c;
  });
}; // Augments this.response with all pointers on an object


RestQuery.prototype.handleIncludeAll = function () {
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
    } // Add fields to include, keys, remove dups


    this.include = [...new Set([...this.include, ...includeFields])]; // if this.keys not set, then all keys are already included

    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
}; // Updates property `this.keys` to contain all keys but the ones unselected.


RestQuery.prototype.handleExcludeKeys = function () {
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
}; // Augments this.response with data at the paths provided in this.include.


RestQuery.prototype.handleInclude = function () {
  if (this.include.length == 0) {
    return;
  }

  var pathResponse = includePath(this.config, this.auth, this.response, this.include[0], this.restOptions);

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
}; //Returns a promise of a processed set of results


RestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  }

  if (!this.runAfterFind) {
    return;
  } // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.


  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);

  if (!hasAfterFindHook) {
    return Promise.resolve();
  } // Skip Aggregate and Distinct Queries


  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  }

  const json = Object.assign({}, this.restOptions);
  json.where = this.restWhere;
  const parseQuery = new Parse.Query(this.className);
  parseQuery.withJSON(json); // Run afterFind trigger and set the new results

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
}; // Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.


function includePath(config, auth, response, path, restOptions = {}) {
  var pointers = findPointers(response.results, path);

  if (pointers.length == 0) {
    return response;
  }

  const pointersHash = {};

  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }

    const className = pointer.className; // only include the good pointers

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

  const queryPromises = Object.keys(pointersHash).map(className => {
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

    var query = new RestQuery(config, auth, className, where, includeRestOptions);
    return query.execute({
      op: 'get'
    }).then(results => {
      results.className = className;
      return Promise.resolve(results);
    });
  }); // Get the objects for all these object ids

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
} // Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// If the path yields things that aren't pointers, this throws an error.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.


function findPointers(object, path) {
  if (object instanceof Array) {
    var answer = [];

    for (var x of object) {
      answer = answer.concat(findPointers(x, path));
    }

    return answer;
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
} // Object may be a list of REST-format objects to replace pointers
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
} // Finds a subobject that has the given key, if there is one.
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiUmVzdFF1ZXJ5IiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwiY2xpZW50U0RLIiwicnVuQWZ0ZXJGaW5kIiwiY29udGV4dCIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZG9Db3VudCIsImluY2x1ZGVBbGwiLCJpbmNsdWRlIiwia2V5c0ZvckluY2x1ZGUiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJrZXlzIiwiZXhjbHVkZUtleXMiLCJsZW5ndGgiLCJzcGxpdCIsImZpbHRlciIsImtleSIsIm1hcCIsInNsaWNlIiwibGFzdEluZGV4T2YiLCJqb2luIiwib3B0aW9uIiwiY29uY2F0IiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwiZXhjbHVkZSIsImsiLCJpbmRleE9mIiwiZmllbGRzIiwib3JkZXIiLCJzb3J0IiwicmVkdWNlIiwic29ydE1hcCIsImZpZWxkIiwidHJpbSIsInNjb3JlIiwiJG1ldGEiLCJwYXRocyIsImluY2x1ZGVzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImJ1aWxkUmVzdFdoZXJlIiwiaGFuZGxlSW5jbHVkZUFsbCIsImhhbmRsZUV4Y2x1ZGVLZXlzIiwicnVuRmluZCIsInJ1bkNvdW50IiwiaGFuZGxlSW5jbHVkZSIsInJ1bkFmdGVyRmluZFRyaWdnZXIiLCJlYWNoIiwiY2FsbGJhY2siLCJsaW1pdCIsImZpbmlzaGVkIiwicXVlcnkiLCJyZXN1bHRzIiwiZm9yRWFjaCIsImFzc2lnbiIsIiRndCIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwicmVwbGFjZVNlbGVjdCIsInJlcGxhY2VEb250U2VsZWN0IiwicmVwbGFjZUluUXVlcnkiLCJyZXBsYWNlTm90SW5RdWVyeSIsInJlcGxhY2VFcXVhbGl0eSIsImFjbCIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiZGF0YWJhc2UiLCJuZXdDbGFzc05hbWUiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwibG9hZFNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJoYXNDbGFzcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJ0cmFuc2Zvcm1JblF1ZXJ5IiwiaW5RdWVyeU9iamVjdCIsInZhbHVlcyIsInJlc3VsdCIsInB1c2giLCJpc0FycmF5IiwiZmluZE9iamVjdFdpdGhLZXkiLCJpblF1ZXJ5VmFsdWUiLCJ3aGVyZSIsIklOVkFMSURfUVVFUlkiLCJhZGRpdGlvbmFsT3B0aW9ucyIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJyZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5IiwidHJhbnNmb3JtTm90SW5RdWVyeSIsIm5vdEluUXVlcnlPYmplY3QiLCJub3RJblF1ZXJ5VmFsdWUiLCJnZXREZWVwZXN0T2JqZWN0RnJvbUtleSIsImpzb24iLCJpZHgiLCJzcmMiLCJzcGxpY2UiLCJ0cmFuc2Zvcm1TZWxlY3QiLCJzZWxlY3RPYmplY3QiLCJvYmplY3RzIiwic2VsZWN0VmFsdWUiLCJ0cmFuc2Zvcm1Eb250U2VsZWN0IiwiZG9udFNlbGVjdE9iamVjdCIsImRvbnRTZWxlY3RWYWx1ZSIsImNsZWFuUmVzdWx0QXV0aERhdGEiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJyZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50IiwiY29uc3RyYWludCIsImVxdWFsVG9PYmplY3QiLCJoYXNEaXJlY3RDb25zdHJhaW50IiwiaGFzT3BlcmF0b3JDb25zdHJhaW50Iiwib3B0aW9ucyIsIm9wIiwiZmluZCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYWZ0ZXJGaW5kIiwiYXBwbGljYXRpb25JZCIsInBpcGVsaW5lIiwiZGlzdGluY3QiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIm9iamVjdCIsInRvSlNPTiIsInBvaW50ZXJzIiwiZmluZFBvaW50ZXJzIiwicG9pbnRlcnNIYXNoIiwicG9pbnRlciIsImFkZCIsImluY2x1ZGVSZXN0T3B0aW9ucyIsImtleVNldCIsInNldCIsImtleVBhdGgiLCJpIiwic2l6ZSIsImV4Y2x1ZGVLZXlTZXQiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJxdWVyeVByb21pc2VzIiwib2JqZWN0SWRzIiwiJGluIiwiYWxsIiwicmVzcG9uc2VzIiwicmVwbGFjZSIsImluY2x1ZGVSZXNwb25zZSIsIm9iaiIsInNlc3Npb25Ub2tlbiIsInJlc3AiLCJyZXBsYWNlUG9pbnRlcnMiLCJhbnN3ZXIiLCJ4Iiwic3Vib2JqZWN0IiwibmV3c3ViIiwicm9vdCIsIml0ZW0iLCJzdWJrZXkiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1Jlc3RRdWVyeS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBbiBvYmplY3QgdGhhdCBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhICdmaW5kJ1xuLy8gb3BlcmF0aW9uLCBlbmNvZGVkIGluIHRoZSBSRVNUIEFQSSBmb3JtYXQuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHsgY29udGludWVXaGlsZSB9ID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvcHJvbWlzZVV0aWxzJyk7XG5jb25zdCBBbHdheXNTZWxlY3RlZEtleXMgPSBbJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnLCAnQUNMJ107XG4vLyByZXN0T3B0aW9ucyBjYW4gaW5jbHVkZTpcbi8vICAgc2tpcFxuLy8gICBsaW1pdFxuLy8gICBvcmRlclxuLy8gICBjb3VudFxuLy8gICBpbmNsdWRlXG4vLyAgIGtleXNcbi8vICAgZXhjbHVkZUtleXNcbi8vICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXlcbi8vICAgcmVhZFByZWZlcmVuY2Vcbi8vICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlXG4vLyAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2VcbmZ1bmN0aW9uIFJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREssXG4gIHJ1bkFmdGVyRmluZCA9IHRydWUsXG4gIGNvbnRleHRcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJ1bkFmdGVyRmluZCA9IHJ1bkFmdGVyRmluZDtcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG4gIHRoaXMuZmluZE9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3RXaGVyZSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB0aGlzLmRvQ291bnQgPSBmYWxzZTtcbiAgdGhpcy5pbmNsdWRlQWxsID0gZmFsc2U7XG5cbiAgLy8gVGhlIGZvcm1hdCBmb3IgdGhpcy5pbmNsdWRlIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgZm9ybWF0IGZvciB0aGVcbiAgLy8gaW5jbHVkZSBvcHRpb24gLSBpdCdzIHRoZSBwYXRocyB3ZSBzaG91bGQgaW5jbHVkZSwgaW4gb3JkZXIsXG4gIC8vIHN0b3JlZCBhcyBhcnJheXMsIHRha2luZyBpbnRvIGFjY291bnQgdGhhdCB3ZSBuZWVkIHRvIGluY2x1ZGUgZm9vXG4gIC8vIGJlZm9yZSBpbmNsdWRpbmcgZm9vLmJhci4gQWxzbyBpdCBzaG91bGQgZGVkdXBlLlxuICAvLyBGb3IgZXhhbXBsZSwgcGFzc2luZyBhbiBhcmcgb2YgaW5jbHVkZT1mb28uYmFyLGZvby5iYXogY291bGQgbGVhZCB0b1xuICAvLyB0aGlzLmluY2x1ZGUgPSBbWydmb28nXSwgWydmb28nLCAnYmF6J10sIFsnZm9vJywgJ2JhciddXVxuICB0aGlzLmluY2x1ZGUgPSBbXTtcbiAgbGV0IGtleXNGb3JJbmNsdWRlID0gJyc7XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzO1xuICB9XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gaW4gb3JkZXIgdG8gZXhjbHVkZSBzcGVjaWZpYyBrZXlzLlxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAnZXhjbHVkZUtleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlICs9ICcsJyArIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzO1xuICB9XG5cbiAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScgfHwgZmllbGQgPT09ICctJHNjb3JlJykge1xuICAgICAgICAgICAgc29ydE1hcC5zY29yZSA9IHsgJG1ldGE6ICd0ZXh0U2NvcmUnIH07XG4gICAgICAgICAgfSBlbHNlIGlmIChmaWVsZFswXSA9PSAnLScpIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGQuc2xpY2UoMSldID0gLTE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNvcnRNYXBbZmllbGRdID0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHNvcnRNYXA7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlJzoge1xuICAgICAgICBjb25zdCBwYXRocyA9IHJlc3RPcHRpb25zLmluY2x1ZGUuc3BsaXQoJywnKTtcbiAgICAgICAgaWYgKHBhdGhzLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIC8vIExvYWQgdGhlIGV4aXN0aW5nIGluY2x1ZGVzIChmcm9tIGtleXMpXG4gICAgICAgIGNvbnN0IHBhdGhTZXQgPSBwYXRocy5yZWR1Y2UoKG1lbW8sIHBhdGgpID0+IHtcbiAgICAgICAgICAvLyBTcGxpdCBlYWNoIHBhdGhzIG9uIC4gKGEuYi5jIC0+IFthLGIsY10pXG4gICAgICAgICAgLy8gcmVkdWNlIHRvIGNyZWF0ZSBhbGwgcGF0aHNcbiAgICAgICAgICAvLyAoW2EsYixjXSAtPiB7YTogdHJ1ZSwgJ2EuYic6IHRydWUsICdhLmIuYyc6IHRydWV9KVxuICAgICAgICAgIHJldHVybiBwYXRoLnNwbGl0KCcuJykucmVkdWNlKChtZW1vLCBwYXRoLCBpbmRleCwgcGFydHMpID0+IHtcbiAgICAgICAgICAgIG1lbW9bcGFydHMuc2xpY2UoMCwgaW5kZXggKyAxKS5qb2luKCcuJyldID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICAgIH0sIG1lbW8pO1xuICAgICAgICB9LCB7fSk7XG5cbiAgICAgICAgdGhpcy5pbmNsdWRlID0gT2JqZWN0LmtleXMocGF0aFNldClcbiAgICAgICAgICAubWFwKHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHMuc3BsaXQoJy4nKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDsgLy8gU29ydCBieSBudW1iZXIgb2YgY29tcG9uZW50c1xuICAgICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ3JlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5JzpcbiAgICAgICAgdGhpcy5yZWRpcmVjdEtleSA9IHJlc3RPcHRpb25zLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5O1xuICAgICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbnVsbDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlUmVhZFByZWZlcmVuY2UnOlxuICAgICAgY2FzZSAnc3VicXVlcnlSZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBvcHRpb246ICcgKyBvcHRpb24pO1xuICAgIH1cbiAgfVxufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIGEgcXVlcnlcbi8vIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNwb25zZSAtIGFuIG9iamVjdCB3aXRoIG9wdGlvbmFsIGtleXNcbi8vICdyZXN1bHRzJyBhbmQgJ2NvdW50Jy5cbi8vIFRPRE86IGNvbnNvbGlkYXRlIHRoZSByZXBsYWNlWCBmdW5jdGlvbnNcblJlc3RRdWVyeS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uIChleGVjdXRlT3B0aW9ucykge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMsIGNsaWVudFNESyB9ID0gdGhpcztcbiAgLy8gaWYgdGhlIGxpbWl0IGlzIHNldCwgdXNlIGl0XG4gIHJlc3RPcHRpb25zLmxpbWl0ID0gcmVzdE9wdGlvbnMubGltaXQgfHwgMTAwO1xuICByZXN0T3B0aW9ucy5vcmRlciA9ICdvYmplY3RJZCc7XG4gIGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXG4gIHJldHVybiBjb250aW51ZVdoaWxlKFxuICAgICgpID0+IHtcbiAgICAgIHJldHVybiAhZmluaXNoZWQ7XG4gICAgfSxcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICBjbGllbnRTREssXG4gICAgICAgIHRoaXMucnVuQWZ0ZXJGaW5kLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgICBjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChjYWxsYmFjayk7XG4gICAgICBmaW5pc2hlZCA9IHJlc3VsdHMubGVuZ3RoIDwgcmVzdE9wdGlvbnMubGltaXQ7XG4gICAgICBpZiAoIWZpbmlzaGVkKSB7XG4gICAgICAgIHJlc3RXaGVyZS5vYmplY3RJZCA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RXaGVyZS5vYmplY3RJZCwge1xuICAgICAgICAgICRndDogcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdLm9iamVjdElkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmJ1aWxkUmVzdFdoZXJlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RRdWVyeS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IHRoaXMuZmluZE9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBDaGFuZ2VzIHRoZSBjbGFzc05hbWUgaWYgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgaXMgc2V0LlxuLy8gUmV0dXJucyBhIHByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVkaXJlY3RLZXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXZSBuZWVkIHRvIGNoYW5nZSB0aGUgY2xhc3MgbmFtZSBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5yZWRpcmVjdENsYXNzTmFtZUZvcktleSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZWRpcmVjdEtleSlcbiAgICAudGhlbihuZXdDbGFzc05hbWUgPT4ge1xuICAgICAgdGhpcy5jbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KGluUXVlcnlPYmplY3RbJyRpbiddKSkge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gaW5RdWVyeU9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUluUXVlcnkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBpblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckaW5RdWVyeScpO1xuICBpZiAoIWluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgaW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgaW5RdWVyeVZhbHVlID0gaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKCFpblF1ZXJ5VmFsdWUud2hlcmUgfHwgIWluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRpblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogaW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIGluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10pKSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gbm90SW5RdWVyeU9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRub3RJblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRub3RJblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkbm90SW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhICRuaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlTm90SW5RdWVyeSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG5vdEluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRub3RJblF1ZXJ5Jyk7XG4gIGlmICghbm90SW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBub3RJblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBub3RJblF1ZXJ5VmFsdWUgPSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoIW5vdEluUXVlcnlWYWx1ZS53aGVyZSB8fCAhbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJG5vdEluUXVlcnknKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBub3RJblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgbm90SW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG4vLyBVc2VkIHRvIGdldCB0aGUgZGVlcGVzdCBvYmplY3QgZnJvbSBqc29uIHVzaW5nIGRvdCBub3RhdGlvbi5cbmNvbnN0IGdldERlZXBlc3RPYmplY3RGcm9tS2V5ID0gKGpzb24sIGtleSwgaWR4LCBzcmMpID0+IHtcbiAgaWYgKGtleSBpbiBqc29uKSB7XG4gICAgcmV0dXJuIGpzb25ba2V5XTtcbiAgfVxuICBzcmMuc3BsaWNlKDEpOyAvLyBFeGl0IEVhcmx5XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSAoc2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RPYmplY3RbJyRpbiddKSkge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSBzZWxlY3RPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJHNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRzZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRzZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRzZWxlY3QnKTtcbiAgaWYgKCFzZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgc2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBzZWxlY3RWYWx1ZSA9IHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICAvLyBpT1MgU0RLIGRvbid0IHNlbmQgd2hlcmUgaWYgbm90IHNldCwgbGV0IGl0IHBhc3NcbiAgaWYgKFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFzZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2Ygc2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKHNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkc2VsZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogc2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICBzZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybVNlbGVjdChzZWxlY3RPYmplY3QsIHNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJHNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvbnRTZWxlY3QgPSAoZG9udFNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShkb250U2VsZWN0T2JqZWN0WyckbmluJ10pKSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gZG9udFNlbGVjdE9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkZG9udFNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRkb250U2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkZG9udFNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkbmluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VEb250U2VsZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgZG9udFNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGRvbnRTZWxlY3QnKTtcbiAgaWYgKCFkb250U2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGRvbnRTZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIGRvbnRTZWxlY3RWYWx1ZSA9IGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5rZXkgfHxcbiAgICB0eXBlb2YgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoZG9udFNlbGVjdFZhbHVlKS5sZW5ndGggIT09IDJcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkZG9udFNlbGVjdCcpO1xuICB9XG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBkb250U2VsZWN0VmFsdWUucXVlcnkucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtRG9udFNlbGVjdChkb250U2VsZWN0T2JqZWN0LCBkb250U2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkZG9udFNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCBjbGVhblJlc3VsdEF1dGhEYXRhID0gZnVuY3Rpb24gKHJlc3VsdCkge1xuICBkZWxldGUgcmVzdWx0LnBhc3N3b3JkO1xuICBpZiAocmVzdWx0LmF1dGhEYXRhKSB7XG4gICAgT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGlmIChyZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGE7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50ID0gY29uc3RyYWludCA9PiB7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gY29uc3RyYWludDtcbiAgfVxuICBjb25zdCBlcXVhbFRvT2JqZWN0ID0ge307XG4gIGxldCBoYXNEaXJlY3RDb25zdHJhaW50ID0gZmFsc2U7XG4gIGxldCBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBrZXkgaW4gY29uc3RyYWludCkge1xuICAgIGlmIChrZXkuaW5kZXhPZignJCcpICE9PSAwKSB7XG4gICAgICBoYXNEaXJlY3RDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICAgIGVxdWFsVG9PYmplY3Rba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKGhhc0RpcmVjdENvbnN0cmFpbnQgJiYgaGFzT3BlcmF0b3JDb25zdHJhaW50KSB7XG4gICAgY29uc3RyYWludFsnJGVxJ10gPSBlcXVhbFRvT2JqZWN0O1xuICAgIE9iamVjdC5rZXlzKGVxdWFsVG9PYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGNvbnN0cmFpbnQ7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VFcXVhbGl0eSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiB0aGlzLnJlc3RXaGVyZSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5yZXN0V2hlcmUpIHtcbiAgICB0aGlzLnJlc3RXaGVyZVtrZXldID0gcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCh0aGlzLnJlc3RXaGVyZVtrZXldKTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZSB3aXRoIGFuIG9iamVjdCB0aGF0IG9ubHkgaGFzICdyZXN1bHRzJy5cblJlc3RRdWVyeS5wcm90b3R5cGUucnVuRmluZCA9IGZ1bmN0aW9uIChvcHRpb25zID0ge30pIHtcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMubGltaXQgPT09IDApIHtcbiAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiBbXSB9O1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICBjb25zdCBmaW5kT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZmluZE9wdGlvbnMpO1xuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgZmluZE9wdGlvbnMua2V5cyA9IHRoaXMua2V5cy5tYXAoa2V5ID0+IHtcbiAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKVswXTtcbiAgICB9KTtcbiAgfVxuICBpZiAob3B0aW9ucy5vcCkge1xuICAgIGZpbmRPcHRpb25zLm9wID0gb3B0aW9ucy5vcDtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZCh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZXN0V2hlcmUsIGZpbmRPcHRpb25zLCB0aGlzLmF1dGgpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgIWZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICAgICAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICBjbGVhblJlc3VsdEF1dGhEYXRhKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHJlc3VsdHMpO1xuXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICBmb3IgKHZhciByIG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICByLmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IHJlc3VsdHMgfTtcbiAgICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2UuY291bnQgd2l0aCB0aGUgY291bnRcblJlc3RRdWVyeS5wcm90b3R5cGUucnVuQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kb0NvdW50KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuZmluZE9wdGlvbnMuY291bnQgPSB0cnVlO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5za2lwO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5saW1pdDtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCB0aGlzLmZpbmRPcHRpb25zKS50aGVuKGMgPT4ge1xuICAgIHRoaXMucmVzcG9uc2UuY291bnQgPSBjO1xuICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGVBbGwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5pbmNsdWRlQWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgaW5jbHVkZUZpZWxkcyA9IFtdO1xuICAgICAgY29uc3Qga2V5RmllbGRzID0gW107XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKVxuICAgICAgICApIHtcbiAgICAgICAgICBpbmNsdWRlRmllbGRzLnB1c2goW2ZpZWxkXSk7XG4gICAgICAgICAga2V5RmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBBZGQgZmllbGRzIHRvIGluY2x1ZGUsIGtleXMsIHJlbW92ZSBkdXBzXG4gICAgICB0aGlzLmluY2x1ZGUgPSBbLi4ubmV3IFNldChbLi4udGhpcy5pbmNsdWRlLCAuLi5pbmNsdWRlRmllbGRzXSldO1xuICAgICAgLy8gaWYgdGhpcy5rZXlzIG5vdCBzZXQsIHRoZW4gYWxsIGtleXMgYXJlIGFscmVhZHkgaW5jbHVkZWRcbiAgICAgIGlmICh0aGlzLmtleXMpIHtcbiAgICAgICAgdGhpcy5rZXlzID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMua2V5cywgLi4ua2V5RmllbGRzXSldO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVXBkYXRlcyBwcm9wZXJ0eSBgdGhpcy5rZXlzYCB0byBjb250YWluIGFsbCBrZXlzIGJ1dCB0aGUgb25lcyB1bnNlbGVjdGVkLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMucmVzdE9wdGlvbnNcbiAgKTtcbiAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgcmV0dXJuIHBhdGhSZXNwb25zZS50aGVuKG5ld1Jlc3BvbnNlID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSBuZXdSZXNwb25zZTtcbiAgICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KTtcbiAgfSBlbHNlIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gIH1cblxuICByZXR1cm4gcGF0aFJlc3BvbnNlO1xufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBBZGRzIGluY2x1ZGVkIHZhbHVlcyB0byB0aGUgcmVzcG9uc2UuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZCBuYW1lcy5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhdWdtZW50ZWQgcmVzcG9uc2UuXG5mdW5jdGlvbiBpbmNsdWRlUGF0aChjb25maWcsIGF1dGgsIHJlc3BvbnNlLCBwYXRoLCByZXN0T3B0aW9ucyA9IHt9KSB7XG4gIHZhciBwb2ludGVycyA9IGZpbmRQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoKTtcbiAgaWYgKHBvaW50ZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IHBvaW50ZXJzSGFzaCA9IHt9O1xuICBmb3IgKHZhciBwb2ludGVyIG9mIHBvaW50ZXJzKSB7XG4gICAgaWYgKCFwb2ludGVyKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcG9pbnRlci5jbGFzc05hbWU7XG4gICAgLy8gb25seSBpbmNsdWRlIHRoZSBnb29kIHBvaW50ZXJzXG4gICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gPSBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSB8fCBuZXcgU2V0KCk7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXS5hZGQocG9pbnRlci5vYmplY3RJZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluY2x1ZGVSZXN0T3B0aW9ucyA9IHt9O1xuICBpZiAocmVzdE9wdGlvbnMua2V5cykge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3Qga2V5U2V0ID0gQXJyYXkuZnJvbShrZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA8IGtleVBhdGgubGVuZ3RoKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmtleXMgPSBBcnJheS5mcm9tKGtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cykge1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBleGNsdWRlS2V5U2V0ID0gQXJyYXkuZnJvbShleGNsdWRlS2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPT0ga2V5UGF0aC5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGV4Y2x1ZGVLZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20oZXhjbHVkZUtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmIChyZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3QgcXVlcnlQcm9taXNlcyA9IE9iamVjdC5rZXlzKHBvaW50ZXJzSGFzaCkubWFwKGNsYXNzTmFtZSA9PiB7XG4gICAgY29uc3Qgb2JqZWN0SWRzID0gQXJyYXkuZnJvbShwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSk7XG4gICAgbGV0IHdoZXJlO1xuICAgIGlmIChvYmplY3RJZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IG9iamVjdElkc1swXSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IHsgJGluOiBvYmplY3RJZHMgfSB9O1xuICAgIH1cbiAgICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCB3aGVyZSwgaW5jbHVkZVJlc3RPcHRpb25zKTtcbiAgICByZXR1cm4gcXVlcnkuZXhlY3V0ZSh7IG9wOiAnZ2V0JyB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBHZXQgdGhlIG9iamVjdHMgZm9yIGFsbCB0aGVzZSBvYmplY3QgaWRzXG4gIHJldHVybiBQcm9taXNlLmFsbChxdWVyeVByb21pc2VzKS50aGVuKHJlc3BvbnNlcyA9PiB7XG4gICAgdmFyIHJlcGxhY2UgPSByZXNwb25zZXMucmVkdWNlKChyZXBsYWNlLCBpbmNsdWRlUmVzcG9uc2UpID0+IHtcbiAgICAgIGZvciAodmFyIG9iaiBvZiBpbmNsdWRlUmVzcG9uc2UucmVzdWx0cykge1xuICAgICAgICBvYmouX190eXBlID0gJ09iamVjdCc7XG4gICAgICAgIG9iai5jbGFzc05hbWUgPSBpbmNsdWRlUmVzcG9uc2UuY2xhc3NOYW1lO1xuXG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lID09ICdfVXNlcicgJiYgIWF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICBkZWxldGUgb2JqLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICBkZWxldGUgb2JqLmF1dGhEYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJlcGxhY2Vbb2JqLm9iamVjdElkXSA9IG9iajtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXBsYWNlO1xuICAgIH0sIHt9KTtcblxuICAgIHZhciByZXNwID0ge1xuICAgICAgcmVzdWx0czogcmVwbGFjZVBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgsIHJlcGxhY2UpLFxuICAgIH07XG4gICAgaWYgKHJlc3BvbnNlLmNvdW50KSB7XG4gICAgICByZXNwLmNvdW50ID0gcmVzcG9uc2UuY291bnQ7XG4gICAgfVxuICAgIHJldHVybiByZXNwO1xuICB9KTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGZpbmQgcG9pbnRlcnMgaW4sIG9yXG4vLyBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gSWYgdGhlIHBhdGggeWllbGRzIHRoaW5ncyB0aGF0IGFyZW4ndCBwb2ludGVycywgdGhpcyB0aHJvd3MgYW4gZXJyb3IuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyBSZXR1cm5zIGEgbGlzdCBvZiBwb2ludGVycyBpbiBSRVNUIGZvcm1hdC5cbmZ1bmN0aW9uIGZpbmRQb2ludGVycyhvYmplY3QsIHBhdGgpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdmFyIGFuc3dlciA9IFtdO1xuICAgIGZvciAodmFyIHggb2Ygb2JqZWN0KSB7XG4gICAgICBhbnN3ZXIgPSBhbnN3ZXIuY29uY2F0KGZpbmRQb2ludGVycyh4LCBwYXRoKSk7XG4gICAgfVxuICAgIHJldHVybiBhbnN3ZXI7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PSAwKSB7XG4gICAgaWYgKG9iamVjdCA9PT0gbnVsbCB8fCBvYmplY3QuX190eXBlID09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIFtvYmplY3RdO1xuICAgIH1cbiAgICByZXR1cm4gW107XG4gIH1cblxuICB2YXIgc3Vib2JqZWN0ID0gb2JqZWN0W3BhdGhbMF1dO1xuICBpZiAoIXN1Ym9iamVjdCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICByZXR1cm4gZmluZFBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdHMgdG8gcmVwbGFjZSBwb2ludGVyc1xuLy8gaW4sIG9yIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyByZXBsYWNlIGlzIGEgbWFwIGZyb20gb2JqZWN0IGlkIC0+IG9iamVjdC5cbi8vIFJldHVybnMgc29tZXRoaW5nIGFuYWxvZ291cyB0byBvYmplY3QsIGJ1dCB3aXRoIHRoZSBhcHByb3ByaWF0ZVxuLy8gcG9pbnRlcnMgaW5mbGF0ZWQuXG5mdW5jdGlvbiByZXBsYWNlUG9pbnRlcnMob2JqZWN0LCBwYXRoLCByZXBsYWNlKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiBvYmplY3RcbiAgICAgIC5tYXAob2JqID0+IHJlcGxhY2VQb2ludGVycyhvYmosIHBhdGgsIHJlcGxhY2UpKVxuICAgICAgLmZpbHRlcihvYmogPT4gdHlwZW9mIG9iaiAhPT0gJ3VuZGVmaW5lZCcpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKG9iamVjdCAmJiBvYmplY3QuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiByZXBsYWNlW29iamVjdC5vYmplY3RJZF07XG4gICAgfVxuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICB2YXIgc3Vib2JqZWN0ID0gb2JqZWN0W3BhdGhbMF1dO1xuICBpZiAoIXN1Ym9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgdmFyIG5ld3N1YiA9IHJlcGxhY2VQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSksIHJlcGxhY2UpO1xuICB2YXIgYW5zd2VyID0ge307XG4gIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5ID09IHBhdGhbMF0pIHtcbiAgICAgIGFuc3dlcltrZXldID0gbmV3c3ViO1xuICAgIH0gZWxzZSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYW5zd2VyO1xufVxuXG4vLyBGaW5kcyBhIHN1Ym9iamVjdCB0aGF0IGhhcyB0aGUgZ2l2ZW4ga2V5LCBpZiB0aGVyZSBpcyBvbmUuXG4vLyBSZXR1cm5zIHVuZGVmaW5lZCBvdGhlcndpc2UuXG5mdW5jdGlvbiBmaW5kT2JqZWN0V2l0aEtleShyb290LCBrZXkpIHtcbiAgaWYgKHR5cGVvZiByb290ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocm9vdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgZm9yICh2YXIgaXRlbSBvZiByb290KSB7XG4gICAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShpdGVtLCBrZXkpO1xuICAgICAgaWYgKGFuc3dlcikge1xuICAgICAgICByZXR1cm4gYW5zd2VyO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAocm9vdCAmJiByb290W2tleV0pIHtcbiAgICByZXR1cm4gcm9vdDtcbiAgfVxuICBmb3IgKHZhciBzdWJrZXkgaW4gcm9vdCkge1xuICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KHJvb3Rbc3Via2V5XSwga2V5KTtcbiAgICBpZiAoYW5zd2VyKSB7XG4gICAgICByZXR1cm4gYW5zd2VyO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBRUEsSUFBSUEsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQyxnQ0FBRCxDQUE5Qjs7QUFDQSxJQUFJQyxLQUFLLEdBQUdELE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JDLEtBQWxDOztBQUNBLE1BQU1DLFFBQVEsR0FBR0YsT0FBTyxDQUFDLFlBQUQsQ0FBeEI7O0FBQ0EsTUFBTTtFQUFFRztBQUFGLElBQW9CSCxPQUFPLENBQUMsNkJBQUQsQ0FBakM7O0FBQ0EsTUFBTUksa0JBQWtCLEdBQUcsQ0FBQyxVQUFELEVBQWEsV0FBYixFQUEwQixXQUExQixFQUF1QyxLQUF2QyxDQUEzQixDLENBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNBLFNBQVNDLFNBQVQsQ0FDRUMsTUFERixFQUVFQyxJQUZGLEVBR0VDLFNBSEYsRUFJRUMsU0FBUyxHQUFHLEVBSmQsRUFLRUMsV0FBVyxHQUFHLEVBTGhCLEVBTUVDLFNBTkYsRUFPRUMsWUFBWSxHQUFHLElBUGpCLEVBUUVDLE9BUkYsRUFTRTtFQUNBLEtBQUtQLE1BQUwsR0FBY0EsTUFBZDtFQUNBLEtBQUtDLElBQUwsR0FBWUEsSUFBWjtFQUNBLEtBQUtDLFNBQUwsR0FBaUJBLFNBQWpCO0VB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