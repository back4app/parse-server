"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and


  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and


  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
} // Transforms a REST API formatted ACL object to our two-field mongo format.


const transformObjectACL = (_ref) => {
  let {
    ACL
  } = _ref,
      result = _objectWithoutProperties(_ref, ["ACL"]);

  if (!ACL) {
    return result;
  }

  result._wperm = [];
  result._rperm = [];

  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }

    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }

  return result;
};

const specialQuerykeys = ['$and', '$or', '$nor', '_rperm', '_wperm', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count'];

const isSpecialQueryKey = key => {
  return specialQuerykeys.indexOf(key) >= 0;
};

const validateQuery = (query, skipMongoDBServer13732Workaround) => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));

      if (!skipMongoDBServer13732Workaround) {
        /* In MongoDB 3.2 & 3.4, $or queries which are not alone at the top
         * level of the query can not make efficient use of indexes due to a
         * long standing bug known as SERVER-13732.
         *
         * This bug was fixed in MongoDB version 3.6.
         *
         * For versions pre-3.6, the below logic produces a substantial
         * performance improvement inside the database by avoiding the bug.
         *
         * For versions 3.6 and above, there is no performance improvement and
         * the logic is unnecessary. Some query patterns are even slowed by
         * the below logic, due to the bug having been fixed and better
         * query plans being chosen.
         *
         * When versions before 3.4 are no longer supported by this project,
         * this logic, and the accompanying `skipMongoDBServer13732Workaround`
         * flag, can be removed.
         *
         * This block restructures queries in which $or is not the sole top
         * level element by moving all other top-level predicates inside every
         * subdocument of the $or predicate, allowing MongoDB's query planner
         * to make full use of the most relevant indexes.
         *
         * EG:      {$or: [{a: 1}, {a: 2}], b: 2}
         * Becomes: {$or: [{a: 1, b: 2}, {a: 2, b: 2}]}
         *
         * The only exceptions are $near and $nearSphere operators, which are
         * constrained to only 1 operator per query. As a result, these ops
         * remain at the top level
         *
         * https://jira.mongodb.org/browse/SERVER-13732
         * https://github.com/parse-community/parse-server/issues/3767
         */
        Object.keys(query).forEach(key => {
          const noCollisions = !query.$or.some(subq => subq.hasOwnProperty(key));
          let hasNears = false;

          if (query[key] != null && typeof query[key] == 'object') {
            hasNears = '$near' in query[key] || '$nearSphere' in query[key];
          }

          if (key != '$or' && noCollisions && !hasNears) {
            query.$or.forEach(subquery => {
              subquery[key] = query[key];
            });
            delete query[key];
          }
        });
        query.$or.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
      }
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }

  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }

    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, className, protectedFields, object) => {
  protectedFields && protectedFields.forEach(k => delete object[k]);

  if (className !== '_User') {
    return object;
  }

  object.password = object._hashed_password;
  delete object._hashed_password;
  delete object.sessionToken;

  if (isMaster) {
    return object;
  }

  delete object._email_verify_token;
  delete object._perishable_token;
  delete object._perishable_token_expires_at;
  delete object._tombstone;
  delete object._email_verify_token_expires_at;
  delete object._failed_login_count;
  delete object._account_lockout_expires_at;
  delete object._password_changed_at;
  delete object._password_history;

  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }

  delete object.authData;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
const specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];

const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};

function expandResultOnKeyPath(object, key, value) {
  if (key.indexOf('.') < 0) {
    object[key] = value[key];
    return object;
  }

  const path = key.split('.');
  const firstKey = path[0];
  const nextPath = path.slice(1).join('.');
  object[firstKey] = expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
  delete object[key];
  return object;
}

function sanitizeDatabaseResult(originalObject, result) {
  const response = {};

  if (!result) {
    return Promise.resolve(response);
  }

  Object.keys(originalObject).forEach(key => {
    const keyUpdate = originalObject[key]; // determine if that was an op

    if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
      // only valid ops that produce an actionable result
      // the op may have happend on a keypath
      expandResultOnKeyPath(response, key, result);
    }
  });
  return Promise.resolve(response);
}

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].amount;
          break;

        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = [];
          break;

        case 'Delete':
          delete object[key];
          break;

        default:
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
};

const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;

      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = {
          type: 'Object'
        };
      }
    });
    delete object.authData;
  }
}; // Transforms a Database format ACL to a REST API format ACL


const untransformObjectACL = (_ref2) => {
  let {
    _rperm,
    _wperm
  } = _ref2,
      output = _objectWithoutProperties(_ref2, ["_rperm", "_wperm"]);

  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          write: true
        };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }

  return output;
};
/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */


const getRootFieldName = fieldName => {
  return fieldName.split('.')[0];
};

const relationSchema = {
  fields: {
    relatedId: {
      type: 'String'
    },
    owningId: {
      type: 'String'
    }
  }
};

class DatabaseController {
  constructor(adapter, schemaCache, skipMongoDBServer13732Workaround) {
    this.adapter = adapter;
    this.schemaCache = schemaCache; // We don't want a mutable this.schema, because then you could have
    // one request that uses different schemas for different parts of
    // it. Instead, use loadSchema to get a schema.

    this.schemaPromise = null;
    this.skipMongoDBServer13732Workaround = skipMongoDBServer13732Workaround;
  }

  collectionExists(className) {
    return this.adapter.classExists(className);
  }

  purgeCollection(className) {
    return this.loadSchema().then(schemaController => schemaController.getOneSchema(className)).then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }

  validateClassName(className) {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
    }

    return Promise.resolve();
  } // Returns a promise for a schemaController.


  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }

    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }

  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  } // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface


  redirectClassNameForKey(className, key) {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);

      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }

      return className;
    });
  } // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.


  validateObject(className, object, query, {
    acl
  }) {
    let schema;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;

      if (isMaster) {
        return Promise.resolve();
      }

      return this.canAddField(schema, className, object, aclGroup);
    }).then(() => {
      return schema.validateObject(className, object, query);
    });
  }

  update(className, query, update, {
    acl,
    many,
    upsert
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update; // Make a copy of the object, so we don't mutate the incoming data.

    update = (0, _deepcopy.default)(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);

        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
        }

        if (!query) {
          return Promise.resolve();
        }

        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query, this.skipMongoDBServer13732Workaround);
        return schemaController.getOneSchema(className, true).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(schema => {
          Object.keys(update).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }

            const rootFieldName = getRootFieldName(fieldName);

            if (!SchemaController.fieldNameIsValid(rootFieldName) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });

          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }

          update = transformObjectACL(update);
          transformAuthData(className, update, schema);

          if (validateOnly) {
            return this.adapter.find(className, schema, query, {}).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }

              return {};
            });
          }

          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update);
          }
        });
      }).then(result => {
        if (!result) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }

        if (validateOnly) {
          return result;
        }

        return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
          return result;
        });
      }).then(result => {
        if (skipSanitization) {
          return Promise.resolve(result);
        }

        return sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  } // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.


  collectRelationUpdates(className, objectId, update) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;

    var process = (op, key) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'RemoveRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };

    for (const key in update) {
      process(update[key], key);
    }

    for (const key of deleteMe) {
      delete update[key];
    }

    return ops;
  } // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed


  handleRelationUpdates(className, objectId, update, ops) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({
      key,
      op
    }) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }

      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });
    return Promise.all(pending);
  } // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.


  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc);
  } // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.


  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }

      throw error;
    });
  } // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.


  destroy(className, query, {
    acl
  } = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);

          if (!query) {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        } // delete by query


        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query, this.skipMongoDBServer13732Workaround);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }

          throw error;
        });
      });
    });
  } // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.


  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    object.createdAt = {
      iso: object.createdAt,
      __type: 'Date'
    };
    object.updatedAt = {
      iso: object.updatedAt,
      __type: 'Date'
    };
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);
    return this.validateClassName(className).then(() => this.loadSchemaIfNeeded(validSchemaController)).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(() => schemaController.enforceClassExists(className)).then(() => schemaController.getOneSchema(className, true)).then(schema => {
        transformAuthData(className, object, schema);
        flattenUpdateOperatorsForCreate(object);

        if (validateOnly) {
          return {};
        }

        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }

        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }

  canAddField(schema, className, object, aclGroup) {
    const classSchema = schema.schemaData[className];

    if (!classSchema) {
      return Promise.resolve();
    }

    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }

      return schemaFields.indexOf(field) < 0;
    });

    if (newKeys.length > 0) {
      return schema.validatePermission(className, aclGroup, 'addField');
    }

    return Promise.resolve();
  } // Won't delete collections in the system namespace

  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */


  deleteEverything(fast = false) {
    this.schemaPromise = null;
    return Promise.all([this.adapter.deleteAllClasses(fast), this.schemaCache.clear()]);
  } // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.


  relatedIds(className, key, owningId, queryOptions) {
    const {
      skip,
      limit,
      sort
    } = queryOptions;
    const findOptions = {};

    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = {
        _id: sort.createdAt
      };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }

    return this.adapter.find(joinTableName(className, key), relationSchema, {
      owningId
    }, findOptions).then(results => results.map(result => result.relatedId));
  } // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.


  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {}).then(results => results.map(result => result.owningId));
  } // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated


  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    if (query['$or']) {
      const ors = query['$or'];
      return Promise.all(ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      })).then(() => {
        return Promise.resolve(query);
      });
    }

    const promises = Object.keys(query).map(key => {
      const t = schema.getExpectedType(className, key);

      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }

      let queries = null;

      if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;

          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }

          return {
            isNegation,
            relatedIds
          };
        });
      } else {
        queries = [{
          isNegation: false,
          relatedIds: []
        }];
      } // remove the current queryKey as we don,t need it anymore


      delete query[key]; // execute each query independently to build the list of
      // $in / $nin

      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }

        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }

          return Promise.resolve();
        });
      });
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });
    return Promise.all(promises).then(() => {
      return Promise.resolve(query);
    });
  } // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated


  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }

    var relatedTo = query['$relatedTo'];

    if (relatedTo) {
      return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query, queryOptions);
      }).then(() => {});
    }
  }

  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null; // -disable-next

    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];

    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    } // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.


    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$in'] = idsIntersection;
    return query;
  }

  addNotInObjectIdsIds(ids = [], query) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null); // make a set and spread to remove duplicates

    allIds = [...new Set(allIds)]; // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.

    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$nin'] = allIds;
    return query;
  } // Runs a query on the database.
  // Returns a promise that resolves to a list of items.
  // Options:
  //   skip    number of results to skip.
  //   limit   limit to this number of results.
  //   sort    an object where keys are the fields to sort by.
  //           the value is +1 for ascending, -1 for descending.
  //   count   run a count instead of returning results.
  //   acl     restrict this operation with an ACL for the provided array
  //           of user objectIds and roles. acl: null means no user.
  //           when this field is not present, don't do anything regarding ACLs.
  // TODO: make userIds not needed here. The db adapter shouldn't know
  // anything about users, ideally. Then, improve the format of the ACL
  // arg to work like the others.


  find(className, query, {
    skip,
    limit,
    acl,
    sort = {},
    count,
    keys,
    op,
    distinct,
    pipeline,
    readPreference
  } = {}, auth = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find'); // Count operation if counting

    op = count === true ? 'count' : op;
    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster).catch(error => {
        // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
        // For now, pretend the class exists but has no objects,
        if (error === undefined) {
          classExists = false;
          return {
            fields: {}
          };
        }

        throw error;
      }).then(schema => {
        // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
        // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
        // use the one that appears first in the sort list.
        if (sort._created_at) {
          sort.createdAt = sort._created_at;
          delete sort._created_at;
        }

        if (sort._updated_at) {
          sort.updatedAt = sort._updated_at;
          delete sort._updated_at;
        }

        const queryOptions = {
          skip,
          limit,
          sort,
          keys,
          readPreference
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }

          const rootFieldName = getRootFieldName(fieldName);

          if (!SchemaController.fieldNameIsValid(rootFieldName)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;

          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup); // ProtectedFields is generated before executing the query so we
            // can optimize the query using Mongo Projection at a later stage.

            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth);
          }

          if (!query) {
            if (op === 'get') {
              throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            } else {
              return [];
            }
          }

          if (!isMaster) {
            if (op === 'update' || op === 'delete') {
              query = addWriteACL(query, aclGroup);
            } else {
              query = addReadACL(query, aclGroup);
            }
          }

          validateQuery(query, this.skipMongoDBServer13732Workaround);

          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference);
            }
          } else if (distinct) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.distinct(className, schema, query, distinct);
            }
          } else if (pipeline) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.aggregate(className, schema, pipeline, readPreference);
            }
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, aclGroup, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
            });
          }
        });
      });
    });
  }

  deleteSchema(className) {
    return this.loadSchema({
      clearCache: true
    }).then(schemaController => schemaController.getOneSchema(className, true)).catch(error => {
      if (error === undefined) {
        return {
          fields: {}
        };
      } else {
        throw error;
      }
    }).then(schema => {
      return this.collectionExists(className).then(() => this.adapter.count(className, {
        fields: {}
      }, null, '', false)).then(count => {
        if (count > 0) {
          throw new _node.Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
        }

        return this.adapter.deleteClass(className);
      }).then(wasParseCollection => {
        if (wasParseCollection) {
          const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
          return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name)))).then(() => {
            return;
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  }

  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }

    const perms = schema.getClassLevelPermissions(className);
    const field = ['get', 'find'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    }); // the ACL should have exactly 1 user

    if (perms && perms[field] && perms[field].length > 0) {
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }

      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId
      };
      const permFields = perms[field];
      const ors = permFields.map(key => {
        const q = {
          [key]: userPointer
        }; // if we already have a constraint on the key, use the $and

        if (query.hasOwnProperty(key)) {
          return {
            $and: [q, query]
          };
        } // otherwise just add the constaint


        return Object.assign({}, query, {
          [`${key}`]: userPointer
        });
      });

      if (ors.length > 1) {
        return {
          $or: ors
        };
      }

      return ors[0];
    } else {
      return query;
    }
  }

  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}) {
    const perms = schema.getClassLevelPermissions(className);
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null;
    if (Object.keys(query).length === 0 && auth && auth.user && aclGroup.indexOf(auth.user.id) > -1) return null;
    let protectedKeys = Object.values(protectedFields).reduce((acc, val) => acc.concat(val), []); //.flat();

    [...(auth.userRoles || [])].forEach(role => {
      const fields = protectedFields[role];

      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  } // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.


  performInitialization() {
    const requiredUserFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, SchemaController.defaultColumns._Role)
    };
    const userClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    const roleClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    const usernameUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['username'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    const emailUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    const roleUniqueness = roleClassPromise.then(() => this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });
    const indexPromise = this.adapter.updateSchemaWithIndexes(); // Create tables for volatile classes

    const adapterInit = this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    return Promise.all([usernameUniqueness, emailUniqueness, roleUniqueness, adapterInit, indexPromise]);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsInNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJlbCIsIk9iamVjdCIsImtleXMiLCJub0NvbGxpc2lvbnMiLCJzb21lIiwic3VicSIsImhhc093blByb3BlcnR5IiwiaGFzTmVhcnMiLCJzdWJxdWVyeSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsImsiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5Iiwib2JqZWN0SWQiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5IiwiZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwidmFsdWUiLCJwYXRoIiwic3BsaXQiLCJmaXJzdEtleSIsIm5leHRQYXRoIiwic2xpY2UiLCJqb2luIiwic2FuaXRpemVEYXRhYmFzZVJlc3VsdCIsIm9yaWdpbmFsT2JqZWN0IiwicmVzcG9uc2UiLCJQcm9taXNlIiwicmVzb2x2ZSIsImtleVVwZGF0ZSIsIl9fb3AiLCJqb2luVGFibGVOYW1lIiwiZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJzY2hlbWEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsImZpZWxkcyIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwic2NoZW1hQ2FjaGUiLCJzY2hlbWFQcm9taXNlIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwicmVqZWN0IiwiSU5WQUxJRF9DTEFTU19OQU1FIiwib3B0aW9ucyIsImNsZWFyQ2FjaGUiLCJsb2FkIiwibG9hZFNjaGVtYUlmTmVlZGVkIiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJ0IiwiZ2V0RXhwZWN0ZWRUeXBlIiwidGFyZ2V0Q2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsInVwZGF0ZSIsIm1hbnkiLCJ1cHNlcnQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwiZXJyb3IiLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiaW5jbHVkZXMiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIm9wcyIsImRlbGV0ZU1lIiwicHJvY2VzcyIsIm9wIiwieCIsInBlbmRpbmciLCJhZGRSZWxhdGlvbiIsInJlbW92ZVJlbGF0aW9uIiwiYWxsIiwiZnJvbUNsYXNzTmFtZSIsImZyb21JZCIsInRvSWQiLCJkb2MiLCJjb2RlIiwiZGVzdHJveSIsInBhcnNlRm9ybWF0U2NoZW1hIiwiY3JlYXRlIiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWx0ZXIiLCJmaWVsZCIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiZGVsZXRlQWxsQ2xhc3NlcyIsImNsZWFyIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwibWFwIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsIm9ycyIsImFRdWVyeSIsImluZGV4IiwicHJvbWlzZXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJhdXRoIiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsIm9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwidXNlckFDTCIsInVzZXJJZCIsInVzZXJQb2ludGVyIiwicGVybUZpZWxkcyIsImFzc2lnbiIsInVzZXIiLCJpZCIsInByb3RlY3RlZEtleXMiLCJ2YWx1ZXMiLCJhY2MiLCJ2YWwiLCJjb25jYXQiLCJ1c2VyUm9sZXMiLCJyb2xlIiwidiIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwidXNlckNsYXNzUHJvbWlzZSIsInJvbGVDbGFzc1Byb21pc2UiLCJ1c2VybmFtZVVuaXF1ZW5lc3MiLCJlbnN1cmVVbmlxdWVuZXNzIiwibG9nZ2VyIiwid2FybiIsImVtYWlsVW5pcXVlbmVzcyIsInJvbGVVbmlxdWVuZXNzIiwiaW5kZXhQcm9taXNlIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJhZGFwdGVySW5pdCIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwibWFwcGluZ3MiOiI7O0FBS0E7O0FBRUE7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBTUEsU0FBU0EsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEJDLEdBQTVCLEVBQWlDO0FBQy9CLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQrQixDQUUvQjs7O0FBQ0FFLEVBQUFBLFFBQVEsQ0FBQ0csTUFBVCxHQUFrQjtBQUFFQyxJQUFBQSxHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBR0wsR0FBVjtBQUFQLEdBQWxCO0FBQ0EsU0FBT0MsUUFBUDtBQUNEOztBQUVELFNBQVNLLFVBQVQsQ0FBb0JQLEtBQXBCLEVBQTJCQyxHQUEzQixFQUFnQztBQUM5QixRQUFNQyxRQUFRLEdBQUdDLGdCQUFFQyxTQUFGLENBQVlKLEtBQVosQ0FBakIsQ0FEOEIsQ0FFOUI7OztBQUNBRSxFQUFBQSxRQUFRLENBQUNNLE1BQVQsR0FBa0I7QUFBRUYsSUFBQUEsR0FBRyxFQUFFLENBQUMsSUFBRCxFQUFPLEdBQVAsRUFBWSxHQUFHTCxHQUFmO0FBQVAsR0FBbEI7QUFDQSxTQUFPQyxRQUFQO0FBQ0QsQyxDQUVEOzs7QUFDQSxNQUFNTyxrQkFB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TCxDQUFhbUsscUJBQWIsQ0FBbUM7QUFDckRrQixNQUFBQSxzQkFBc0IsRUFBRXpLLGdCQUFnQixDQUFDeUs7QUFEWSxLQUFuQyxDQUFwQjtBQUdBLFdBQU85TSxPQUFPLENBQUN1RixHQUFSLENBQVksQ0FDakI4RyxrQkFEaUIsRUFFakJJLGVBRmlCLEVBR2pCQyxjQUhpQixFQUlqQkcsV0FKaUIsRUFLakJGLFlBTGlCLENBQVosQ0FBUDtBQU9EOztBQXZxQ3NCOztBQTRxQ3pCSSxNQUFNLENBQUNDLE9BQVAsR0FBaUJ6TCxrQkFBakIsQyxDQUNBOztBQUNBd0wsTUFBTSxDQUFDQyxPQUFQLENBQWVDLGNBQWYsR0FBZ0MzUSxhQUFoQyIsInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUge1xuICBRdWVyeU9wdGlvbnMsXG4gIEZ1bGxRdWVyeU9wdGlvbnMsXG59IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuXG5mdW5jdGlvbiBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3dwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll93cGVybSA9IHsgJGluOiBbbnVsbCwgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbmZ1bmN0aW9uIGFkZFJlYWRBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ19ycGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fcnBlcm0gPSB7ICRpbjogW251bGwsICcqJywgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBSRVNUIEFQSSBmb3JtYXR0ZWQgQUNMIG9iamVjdCB0byBvdXIgdHdvLWZpZWxkIG1vbmdvIGZvcm1hdC5cbmNvbnN0IHRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IEFDTCwgLi4ucmVzdWx0IH0pID0+IHtcbiAgaWYgKCFBQ0wpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmVzdWx0Ll93cGVybSA9IFtdO1xuICByZXN1bHQuX3JwZXJtID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBpbiBBQ0wpIHtcbiAgICBpZiAoQUNMW2VudHJ5XS5yZWFkKSB7XG4gICAgICByZXN1bHQuX3JwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBpZiAoQUNMW2VudHJ5XS53cml0ZSkge1xuICAgICAgcmVzdWx0Ll93cGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNwZWNpYWxRdWVyeWtleXMgPSBbXG4gICckYW5kJyxcbiAgJyRvcicsXG4gICckbm9yJyxcbiAgJ19ycGVybScsXG4gICdfd3Blcm0nLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsUXVlcnlLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbFF1ZXJ5a2V5cy5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAoXG4gIHF1ZXJ5OiBhbnksXG4gIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kOiBib29sZWFuXG4pOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKGVsID0+XG4gICAgICAgIHZhbGlkYXRlUXVlcnkoZWwsIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKVxuICAgICAgKTtcblxuICAgICAgaWYgKCFza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCkge1xuICAgICAgICAvKiBJbiBNb25nb0RCIDMuMiAmIDMuNCwgJG9yIHF1ZXJpZXMgd2hpY2ggYXJlIG5vdCBhbG9uZSBhdCB0aGUgdG9wXG4gICAgICAgICAqIGxldmVsIG9mIHRoZSBxdWVyeSBjYW4gbm90IG1ha2UgZWZmaWNpZW50IHVzZSBvZiBpbmRleGVzIGR1ZSB0byBhXG4gICAgICAgICAqIGxvbmcgc3RhbmRpbmcgYnVnIGtub3duIGFzIFNFUlZFUi0xMzczMi5cbiAgICAgICAgICpcbiAgICAgICAgICogVGhpcyBidWcgd2FzIGZpeGVkIGluIE1vbmdvREIgdmVyc2lvbiAzLjYuXG4gICAgICAgICAqXG4gICAgICAgICAqIEZvciB2ZXJzaW9ucyBwcmUtMy42LCB0aGUgYmVsb3cgbG9naWMgcHJvZHVjZXMgYSBzdWJzdGFudGlhbFxuICAgICAgICAgKiBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudCBpbnNpZGUgdGhlIGRhdGFiYXNlIGJ5IGF2b2lkaW5nIHRoZSBidWcuXG4gICAgICAgICAqXG4gICAgICAgICAqIEZvciB2ZXJzaW9ucyAzLjYgYW5kIGFib3ZlLCB0aGVyZSBpcyBubyBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudCBhbmRcbiAgICAgICAgICogdGhlIGxvZ2ljIGlzIHVubmVjZXNzYXJ5LiBTb21lIHF1ZXJ5IHBhdHRlcm5zIGFyZSBldmVuIHNsb3dlZCBieVxuICAgICAgICAgKiB0aGUgYmVsb3cgbG9naWMsIGR1ZSB0byB0aGUgYnVnIGhhdmluZyBiZWVuIGZpeGVkIGFuZCBiZXR0ZXJcbiAgICAgICAgICogcXVlcnkgcGxhbnMgYmVpbmcgY2hvc2VuLlxuICAgICAgICAgKlxuICAgICAgICAgKiBXaGVuIHZlcnNpb25zIGJlZm9yZSAzLjQgYXJlIG5vIGxvbmdlciBzdXBwb3J0ZWQgYnkgdGhpcyBwcm9qZWN0LFxuICAgICAgICAgKiB0aGlzIGxvZ2ljLCBhbmQgdGhlIGFjY29tcGFueWluZyBgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmRgXG4gICAgICAgICAqIGZsYWcsIGNhbiBiZSByZW1vdmVkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGlzIGJsb2NrIHJlc3RydWN0dXJlcyBxdWVyaWVzIGluIHdoaWNoICRvciBpcyBub3QgdGhlIHNvbGUgdG9wXG4gICAgICAgICAqIGxldmVsIGVsZW1lbnQgYnkgbW92aW5nIGFsbCBvdGhlciB0b3AtbGV2ZWwgcHJlZGljYXRlcyBpbnNpZGUgZXZlcnlcbiAgICAgICAgICogc3ViZG9jdW1lbnQgb2YgdGhlICRvciBwcmVkaWNhdGUsIGFsbG93aW5nIE1vbmdvREIncyBxdWVyeSBwbGFubmVyXG4gICAgICAgICAqIHRvIG1ha2UgZnVsbCB1c2Ugb2YgdGhlIG1vc3QgcmVsZXZhbnQgaW5kZXhlcy5cbiAgICAgICAgICpcbiAgICAgICAgICogRUc6ICAgICAgeyRvcjogW3thOiAxfSwge2E6IDJ9XSwgYjogMn1cbiAgICAgICAgICogQmVjb21lczogeyRvcjogW3thOiAxLCBiOiAyfSwge2E6IDIsIGI6IDJ9XX1cbiAgICAgICAgICpcbiAgICAgICAgICogVGhlIG9ubHkgZXhjZXB0aW9ucyBhcmUgJG5lYXIgYW5kICRuZWFyU3BoZXJlIG9wZXJhdG9ycywgd2hpY2ggYXJlXG4gICAgICAgICAqIGNvbnN0cmFpbmVkIHRvIG9ubHkgMSBvcGVyYXRvciBwZXIgcXVlcnkuIEFzIGEgcmVzdWx0LCB0aGVzZSBvcHNcbiAgICAgICAgICogcmVtYWluIGF0IHRoZSB0b3AgbGV2ZWxcbiAgICAgICAgICpcbiAgICAgICAgICogaHR0cHM6Ly9qaXJhLm1vbmdvZGIub3JnL2Jyb3dzZS9TRVJWRVItMTM3MzJcbiAgICAgICAgICogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzM3NjdcbiAgICAgICAgICovXG4gICAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgY29uc3Qgbm9Db2xsaXNpb25zID0gIXF1ZXJ5LiRvci5zb21lKHN1YnEgPT5cbiAgICAgICAgICAgIHN1YnEuaGFzT3duUHJvcGVydHkoa2V5KVxuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IGhhc05lYXJzID0gZmFsc2U7XG4gICAgICAgICAgaWYgKHF1ZXJ5W2tleV0gIT0gbnVsbCAmJiB0eXBlb2YgcXVlcnlba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaGFzTmVhcnMgPSAnJG5lYXInIGluIHF1ZXJ5W2tleV0gfHwgJyRuZWFyU3BoZXJlJyBpbiBxdWVyeVtrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoa2V5ICE9ICckb3InICYmIG5vQ29sbGlzaW9ucyAmJiAhaGFzTmVhcnMpIHtcbiAgICAgICAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHN1YnF1ZXJ5ID0+IHtcbiAgICAgICAgICAgICAgc3VicXVlcnlba2V5XSA9IHF1ZXJ5W2tleV07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKGVsID0+XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShlbCwgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRhbmQpIHtcbiAgICBpZiAocXVlcnkuJGFuZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kYW5kLmZvckVhY2goZWwgPT5cbiAgICAgICAgdmFsaWRhdGVRdWVyeShlbCwgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2goZWwgPT5cbiAgICAgICAgdmFsaWRhdGVRdWVyeShlbCwgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG5vciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgb2YgYXQgbGVhc3QgMSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5W2tleV0gJiYgcXVlcnlba2V5XS4kcmVnZXgpIHtcbiAgICAgIGlmICh0eXBlb2YgcXVlcnlba2V5XS4kb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFxdWVyeVtrZXldLiRvcHRpb25zLm1hdGNoKC9eW2lteHNdKyQvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICBgQmFkICRvcHRpb25zIHZhbHVlIGZvciBxdWVyeTogJHtxdWVyeVtrZXldLiRvcHRpb25zfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghaXNTcGVjaWFsUXVlcnlLZXkoa2V5KSAmJiAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgIGBJbnZhbGlkIGtleSBuYW1lOiAke2tleX1gXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyLFxuICBhY2xHcm91cCxcbiAgY2xhc3NOYW1lLFxuICBwcm90ZWN0ZWRGaWVsZHMsXG4gIG9iamVjdFxuKSA9PiB7XG4gIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gIGlmIChjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcblxuICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll90b21ic3RvbmU7XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9mYWlsZWRfbG9naW5fY291bnQ7XG4gIGRlbGV0ZSBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9oaXN0b3J5O1xuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmltcG9ydCB0eXBlIHsgTG9hZFNjaGVtYU9wdGlvbnMgfSBmcm9tICcuL3R5cGVzJztcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBleHBhbmRSZXN1bHRPbktleVBhdGgob2JqZWN0LCBrZXksIHZhbHVlKSB7XG4gIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgIG9iamVjdFtrZXldID0gdmFsdWVba2V5XTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgY29uc3QgZmlyc3RLZXkgPSBwYXRoWzBdO1xuICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuICBvYmplY3RbZmlyc3RLZXldID0gZXhwYW5kUmVzdWx0T25LZXlQYXRoKFxuICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgbmV4dFBhdGgsXG4gICAgdmFsdWVbZmlyc3RLZXldXG4gICk7XG4gIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgcmV0dXJuIG9iamVjdDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0KTogUHJvbWlzZTxhbnk+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgaWYgKCFyZXN1bHQpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuICBPYmplY3Qua2V5cyhvcmlnaW5hbE9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGNvbnN0IGtleVVwZGF0ZSA9IG9yaWdpbmFsT2JqZWN0W2tleV07XG4gICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgaWYgKFxuICAgICAga2V5VXBkYXRlICYmXG4gICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAga2V5VXBkYXRlLl9fb3AgJiZcbiAgICAgIFsnQWRkJywgJ0FkZFVuaXF1ZScsICdSZW1vdmUnLCAnSW5jcmVtZW50J10uaW5kZXhPZihrZXlVcGRhdGUuX19vcCkgPiAtMVxuICAgICkge1xuICAgICAgLy8gb25seSB2YWxpZCBvcHMgdGhhdCBwcm9kdWNlIGFuIGFjdGlvbmFibGUgcmVzdWx0XG4gICAgICAvLyB0aGUgb3AgbWF5IGhhdmUgaGFwcGVuZCBvbiBhIGtleXBhdGhcbiAgICAgIGV4cGFuZFJlc3VsdE9uS2V5UGF0aChyZXNwb25zZSwga2V5LCByZXN1bHQpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xufVxuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gW107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgICBgVGhlICR7b2JqZWN0W2tleV0uX19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BdXRoRGF0YSA9IChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSA9PiB7XG4gIGlmIChvYmplY3QuYXV0aERhdGEgJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IG9iamVjdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfWA7XG4gICAgICBpZiAocHJvdmlkZXJEYXRhID09IG51bGwpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX19vcDogJ0RlbGV0ZScsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdID0geyB0eXBlOiAnT2JqZWN0JyB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIH1cbn07XG4vLyBUcmFuc2Zvcm1zIGEgRGF0YWJhc2UgZm9ybWF0IEFDTCB0byBhIFJFU1QgQVBJIGZvcm1hdCBBQ0xcbmNvbnN0IHVudHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgX3JwZXJtLCBfd3Blcm0sIC4uLm91dHB1dCB9KSA9PiB7XG4gIGlmIChfcnBlcm0gfHwgX3dwZXJtKSB7XG4gICAgb3V0cHV0LkFDTCA9IHt9O1xuXG4gICAgKF9ycGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyByZWFkOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsncmVhZCddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIChfd3Blcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgd3JpdGU6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWyd3cml0ZSddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxuLyoqXG4gKiBXaGVuIHF1ZXJ5aW5nLCB0aGUgZmllbGROYW1lIG1heSBiZSBjb21wb3VuZCwgZXh0cmFjdCB0aGUgcm9vdCBmaWVsZE5hbWVcbiAqICAgICBgdGVtcGVyYXR1cmUuY2Vsc2l1c2AgYmVjb21lcyBgdGVtcGVyYXR1cmVgXG4gKiBAcGFyYW0ge3N0cmluZ30gZmllbGROYW1lIHRoYXQgbWF5IGJlIGEgY29tcG91bmQgZmllbGQgbmFtZVxuICogQHJldHVybnMge3N0cmluZ30gdGhlIHJvb3QgbmFtZSBvZiB0aGUgZmllbGRcbiAqL1xuY29uc3QgZ2V0Um9vdEZpZWxkTmFtZSA9IChmaWVsZE5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbn07XG5cbmNvbnN0IHJlbGF0aW9uU2NoZW1hID0ge1xuICBmaWVsZHM6IHsgcmVsYXRlZElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIG93bmluZ0lkOiB7IHR5cGU6ICdTdHJpbmcnIH0gfSxcbn07XG5cbmNsYXNzIERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZDogYm9vbGVhbjtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcixcbiAgICBzY2hlbWFDYWNoZTogYW55LFxuICAgIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kOiBib29sZWFuXG4gICkge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IHNjaGVtYUNhY2hlO1xuICAgIC8vIFdlIGRvbid0IHdhbnQgYSBtdXRhYmxlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIHRoZW4geW91IGNvdWxkIGhhdmVcbiAgICAvLyBvbmUgcmVxdWVzdCB0aGF0IHVzZXMgZGlmZmVyZW50IHNjaGVtYXMgZm9yIGRpZmZlcmVudCBwYXJ0cyBvZlxuICAgIC8vIGl0LiBJbnN0ZWFkLCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLnNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kID0gc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQ7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZChcbiAgICAgIHRoaXMuYWRhcHRlcixcbiAgICAgIHRoaXMuc2NoZW1hQ2FjaGUsXG4gICAgICBvcHRpb25zXG4gICAgKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKVxuICAgICAgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKFxuICAgICAgc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1cGRhdGVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgdGhpcy5za2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCk7XG4gICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUpICYmXG4gICAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gJiZcbiAgICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgICBpbm5lcktleSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkuaW5jbHVkZXMoJyQnKSB8fCBpbm5lcktleS5pbmNsdWRlcygnLicpXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB1cGRhdGUgPSB0cmFuc2Zvcm1PYmplY3RBQ0wodXBkYXRlKTtcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHNraXBTYW5pdGl6YXRpb24pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxVcGRhdGUsIHJlc3VsdCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdElkOiBzdHJpbmcsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgb3BzOiBhbnlcbiAgKSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKFxuICAgICAgICAgICAgdGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZClcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaChcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHBlbmRpbmcpO1xuICB9XG5cbiAgLy8gQWRkcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIGFkZCB3YXMgc3VjY2Vzc2Z1bC5cbiAgYWRkUmVsYXRpb24oXG4gICAga2V5OiBzdHJpbmcsXG4gICAgZnJvbUNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZyb21JZDogc3RyaW5nLFxuICAgIHRvSWQ6IHN0cmluZ1xuICApIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2NcbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oXG4gICAga2V5OiBzdHJpbmcsXG4gICAgZnJvbUNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZyb21JZDogc3RyaW5nLFxuICAgIHRvSWQ6IHN0cmluZ1xuICApIHtcbiAgICB2YXIgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIGRvY1xuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihcbiAgICAgIHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIHRoaXMuc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICAgIHF1ZXJ5XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmXG4gICAgICAgICAgICAgICAgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORFxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG5cbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIG51bGwsXG4gICAgICBvYmplY3RcbiAgICApO1xuXG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW11cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAoXG4gICAgICAgIG9iamVjdFtmaWVsZF0gJiZcbiAgICAgICAgb2JqZWN0W2ZpZWxkXS5fX29wICYmXG4gICAgICAgIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSdcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZmllbGQpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCksXG4gICAgICB0aGlzLnNjaGVtYUNhY2hlLmNsZWFyKCksXG4gICAgXSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IG93bmluZ0lkIH0sXG4gICAgICAgIGZpbmRPcHRpb25zXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICByZWxhdGVkSWRzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAge31cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oXG4gICAgICAgICAgICBhUXVlcnkgPT4ge1xuICAgICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2VzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcXVlcnlPcHRpb25zOiBhbnlcbiAgKTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW1xuICAgICAgaWRzRnJvbVN0cmluZyxcbiAgICAgIGlkc0Zyb21FcSxcbiAgICAgIGlkc0Zyb21JbixcbiAgICAgIGlkcyxcbiAgICBdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICBvcCA9XG4gICAgICBvcCB8fFxuICAgICAgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxXG4gICAgICAgID8gJ2dldCdcbiAgICAgICAgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIHJlYWRQcmVmZXJlbmNlIH07XG4gICAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgIGBDYW5ub3Qgc29ydCBieSAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgICAgdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgICAgdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgLy8gUHJvdGVjdGVkRmllbGRzIGlzIGdlbmVyYXRlZCBiZWZvcmUgZXhlY3V0aW5nIHRoZSBxdWVyeSBzbyB3ZVxuICAgICAgICAgICAgICAgICAgLy8gY2FuIG9wdGltaXplIHRoZSBxdWVyeSB1c2luZyBNb25nbyBQcm9qZWN0aW9uIGF0IGEgbGF0ZXIgc3RhZ2UuXG4gICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgIGF1dGhcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgdGhpcy5za2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCk7XG4gICAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgZGlzdGluY3RcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2VcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgIHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpXG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgZmllbGQgPVxuICAgICAgWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xXG4gICAgICAgID8gJ3JlYWRVc2VyRmllbGRzJ1xuICAgICAgICA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtcyAmJiBwZXJtc1tmaWVsZF0gJiYgcGVybXNbZmllbGRdLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcGVybUZpZWxkcyA9IHBlcm1zW2ZpZWxkXTtcbiAgICAgIGNvbnN0IG9ycyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IHEgPSB7XG4gICAgICAgICAgW2tleV06IHVzZXJQb2ludGVyLFxuICAgICAgICB9O1xuICAgICAgICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBjb25zdHJhaW50IG9uIHRoZSBrZXksIHVzZSB0aGUgJGFuZFxuICAgICAgICBpZiAocXVlcnkuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIHJldHVybiB7ICRhbmQ6IFtxLCBxdWVyeV0gfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHtcbiAgICAgICAgICBbYCR7a2V5fWBdOiB1c2VyUG9pbnRlcixcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICAgIGlmIChvcnMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4geyAkb3I6IG9ycyB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9yc1swXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge31cbiAgKSB7XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgaWYgKCFwZXJtcykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBwZXJtcy5wcm90ZWN0ZWRGaWVsZHM7XG4gICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHJldHVybiBudWxsO1xuXG4gICAgaWYgKGFjbEdyb3VwLmluZGV4T2YocXVlcnkub2JqZWN0SWQpID4gLTEpIHJldHVybiBudWxsO1xuICAgIGlmIChcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDAgJiZcbiAgICAgIGF1dGggJiZcbiAgICAgIGF1dGgudXNlciAmJlxuICAgICAgYWNsR3JvdXAuaW5kZXhPZihhdXRoLnVzZXIuaWQpID4gLTFcbiAgICApXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gT2JqZWN0LnZhbHVlcyhwcm90ZWN0ZWRGaWVsZHMpLnJlZHVjZShcbiAgICAgIChhY2MsIHZhbCkgPT4gYWNjLmNvbmNhdCh2YWwpLFxuICAgICAgW11cbiAgICApOyAvLy5mbGF0KCk7XG4gICAgWy4uLihhdXRoLnVzZXJSb2xlcyB8fCBbXSldLmZvckVhY2gocm9sZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHNbcm9sZV07XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIC8vIFRPRE86IGNyZWF0ZSBpbmRleGVzIG9uIGZpcnN0IGNyZWF0aW9uIG9mIGEgX1VzZXIgb2JqZWN0LiBPdGhlcndpc2UgaXQncyBpbXBvc3NpYmxlIHRvXG4gIC8vIGhhdmUgYSBQYXJzZSBhcHAgd2l0aG91dCBpdCBoYXZpbmcgYSBfVXNlciBjb2xsZWN0aW9uLlxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKSB7XG4gICAgY29uc3QgcmVxdWlyZWRVc2VyRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1VzZXIsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgcmVxdWlyZWRSb2xlRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1JvbGUsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCB1c2VyQ2xhc3NQcm9taXNlID0gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT5cbiAgICAgIHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJylcbiAgICApO1xuICAgIGNvbnN0IHJvbGVDbGFzc1Byb21pc2UgPSB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PlxuICAgICAgc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKVxuICAgICk7XG5cbiAgICBjb25zdCB1c2VybmFtZVVuaXF1ZW5lc3MgPSB1c2VyQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgZW1haWxVbmlxdWVuZXNzID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICAnVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJyxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3Qgcm9sZVVuaXF1ZW5lc3MgPSByb2xlQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpbmRleFByb21pc2UgPSB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcblxuICAgIC8vIENyZWF0ZSB0YWJsZXMgZm9yIHZvbGF0aWxlIGNsYXNzZXNcbiAgICBjb25zdCBhZGFwdGVySW5pdCA9IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICB1c2VybmFtZVVuaXF1ZW5lc3MsXG4gICAgICBlbWFpbFVuaXF1ZW5lc3MsXG4gICAgICByb2xlVW5pcXVlbmVzcyxcbiAgICAgIGFkYXB0ZXJJbml0LFxuICAgICAgaW5kZXhQcm9taXNlLFxuICAgIF0pO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiAoYW55LCBib29sZWFuKSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xuIl19