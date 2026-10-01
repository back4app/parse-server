"use strict";

var _node = require("parse/node");
var _lodash = _interopRequireDefault(require("lodash"));
var _intersect = _interopRequireDefault(require("intersect"));
var _logger = _interopRequireDefault(require("../logger"));
var _Utils = _interopRequireDefault(require("../Utils"));
var SchemaController = _interopRequireWildcard(require("./SchemaController"));
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _Error = require("../Error");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// A database adapter that works with data exported from the hosted
// Parse database.
// -disable-next
// -disable-next
// -disable-next
function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}
function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
const transformObjectACL = ({
  ACL,
  ...result
}) => {
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
const specialQueryKeys = ['$and', '$or', '$nor', '_rperm', '_wperm'];
const specialMasterQueryKeys = [...specialQueryKeys, '_email_verify_token', '_perishable_token', '_perishable_token_expires_at', '_tombstone', '_email_verify_token_expires_at', '_failed_login_count', '_account_lockout_expires_at', '_password_changed_at', '_password_history', '_session_token'];
const validateQuery = (query, isMaster, isMaintenance, update, options, _depth = 0) => {
  if (isMaintenance) {
    isMaster = true;
  }
  const rc = options?.requestComplexity;
  if (!isMaster && rc && rc.queryDepth !== -1 && _depth > rc.queryDepth) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Query condition nesting depth exceeds maximum allowed depth of ${rc.queryDepth}`);
  }
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }
  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(value => validateQuery(value, isMaster, isMaintenance, update, options, _depth + 1));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }
  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(value => validateQuery(value, isMaster, isMaintenance, update, options, _depth + 1));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }
  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(value => validateQuery(value, isMaster, isMaintenance, update, options, _depth + 1));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }
  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxsu]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }
    if (!key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/) && !specialQueryKeys.includes(key) && !(isMaster && specialMasterQueryKeys.includes(key))) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, isMaintenance, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) {
    userId = auth.user.id;
  }

  // replace protectedFields when using pointer-permissions
  const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : {};
  if (perms) {
    const isReadOperation = ['get', 'find'].indexOf(operation) > -1;
    if (isReadOperation && perms.protectedFields) {
      // extract protectedFields added with the pointer-permission prefix
      const protectedFieldsPointerPerm = Object.keys(perms.protectedFields).filter(key => key.startsWith('userField:')).map(key => {
        return {
          key: key.substring(10),
          value: perms.protectedFields[key]
        };
      });
      const newProtectedFields = [];
      let overrideProtectedFields = false;

      // check if the object grants the current user access based on the extracted fields
      protectedFieldsPointerPerm.forEach(pointerPerm => {
        let pointerPermIncludesUser = false;
        const readUserFieldValue = object[pointerPerm.key];
        if (readUserFieldValue) {
          if (Array.isArray(readUserFieldValue)) {
            pointerPermIncludesUser = readUserFieldValue.some(user => user.objectId && user.objectId === userId);
          } else {
            pointerPermIncludesUser = readUserFieldValue.objectId && readUserFieldValue.objectId === userId;
          }
        }
        if (pointerPermIncludesUser) {
          overrideProtectedFields = true;
          newProtectedFields.push(pointerPerm.value);
        }
      });

      // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C
      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      }
      // intersect all sets of protectedFields
      newProtectedFields.forEach(fields => {
        if (fields) {
          // if there're no protctedFields by other criteria ( id / role / auth)
          // then we must intersect each set (per userField)
          if (!protectedFields) {
            protectedFields = fields;
          } else {
            protectedFields = protectedFields.filter(v => fields.includes(v));
          }
        }
      });
    }
  }
  const isUserClass = className === '_User';
  if (isUserClass) {
    object.password = object._hashed_password;
    delete object._hashed_password;
    delete object.sessionToken;
  }
  if (isMaintenance) {
    return object;
  }

  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */
  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
    // but were needed to apply protectedFields
    perms?.protectedFields?.temporaryKeys?.forEach(k => delete object[k]);
  }
  for (const key in object) {
    if (key.charAt(0) === '_') {
      delete object[key];
    }
  }
  if (!isUserClass || isMaster) {
    return object;
  }
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
        case 'SetOnInsert':
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
};
// Transforms a Database format ACL to a REST API format ACL
const untransformObjectACL = ({
  _rperm,
  _wperm,
  ...output
}) => {
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
const convertEmailToLowercase = (object, className, options) => {
  if (className === '_User' && options.convertEmailToLowercase) {
    if (typeof object['email'] === 'string') {
      object['email'] = object['email'].toLowerCase();
    }
  }
};
const convertUsernameToLowercase = (object, className, options) => {
  if (className === '_User' && options.convertUsernameToLowercase) {
    if (typeof object['username'] === 'string') {
      object['username'] = object['username'].toLowerCase();
    }
  }
};
class DatabaseController {
  constructor(adapter, options) {
    this.adapter = adapter;
    this.options = options || {};
    this.idempotencyOptions = this.options.idempotencyOptions || {};
    // Prevent mutable this.schema, otherwise one request could use
    // multiple schemas, so instead use loadSchema to get a schema.
    this.schemaPromise = null;
    this._transactionalSession = null;
    this._transactionalSessionPending = false;
    this.options = options;
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
  }

  // Returns a promise for a schemaController.
  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }
    this.schemaPromise = SchemaController.load(this.adapter, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }
  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  }

  // Returns a promise for the classname that is related to the given
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
  }

  // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.
  validateObject(className, object, query, runOptions, maintenance) {
    let schema;
    const acl = runOptions.acl;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;
      if (isMaster) {
        return Promise.resolve();
      }
      return this.canAddField(schema, className, object, aclGroup, runOptions);
    }).then(() => {
      return schema.validateObject(className, object, query, maintenance);
    });
  }
  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    try {
      _Utils.default.checkProhibitedKeywords(this.options, update);
    } catch (error) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, error));
    }
    const originalQuery = query;
    const originalUpdate = update;
    // Make a copy of the object, so we don't mutate the incoming data.
    update = structuredClone(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
          if (addsField) {
            query = {
              $and: [query, this.addPointerPermissions(schemaController, className, 'addField', query, aclGroup)]
            };
          }
        }
        if (!query) {
          return Promise.resolve();
        }
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query, isMaster, false, true, this.options);
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
            if (!SchemaController.fieldNameIsValid(rootFieldName, className) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });
          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }
          update = transformObjectACL(update);
          convertEmailToLowercase(update, className, this.options);
          convertUsernameToLowercase(update, className, this.options);
          transformAuthData(className, update, schema);
          if (validateOnly) {
            return this.adapter.find(className, schema, query, {
              readPreference: 'primary'
            }).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }
              return {};
            });
          }
          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update, this._transactionalSession);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update, this._transactionalSession);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update, this._transactionalSession);
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
        return this._sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  }

  // Collect all relation-updating operations from a REST-format update.
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
  }

  // Processes relation-updating operations from a REST-format update.
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
  }

  // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.
  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  }

  // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.
  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc, this._transactionalSession).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }
      throw error;
    });
  }

  // Removes objects matches this query from the database.
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
        }
        // delete by query
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query, isMaster, false, false, this.options);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }
          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query, this._transactionalSession)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }
          throw error;
        });
      });
    });
  }

  // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.
  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    try {
      _Utils.default.checkProhibitedKeywords(this.options, object);
    } catch (error) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, error));
    }
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    convertEmailToLowercase(object, className, this.options);
    convertUsernameToLowercase(object, className, this.options);
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
        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object, this._transactionalSession);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }
        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return this._sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }
  canAddField(schema, className, object, aclGroup, runOptions) {
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
      return schemaFields.indexOf(getRootFieldName(field)) < 0;
    });
    if (newKeys.length > 0) {
      // adds a marker that new field is being adding during update
      runOptions.addsField = true;
      const action = runOptions.action;
      return schema.validatePermission(className, aclGroup, 'addField', action);
    }
    return Promise.resolve();
  }

  // Won't delete collections in the system namespace
  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */
  deleteEverything(fast = false) {
    this.schemaPromise = null;
    _SchemaCache.default.clear();
    return this.adapter.deleteAllClasses(fast);
  }

  // Returns a promise for a list of related ids given an owning id.
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
  }

  // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.
  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
  }

  // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated
  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    const promises = [];
    if (query['$or']) {
      const ors = query['$or'];
      promises.push(...ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      }));
    }
    if (query['$and']) {
      const ands = query['$and'];
      promises.push(...ands.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$and'][index] = aQuery;
        });
      }));
    }
    const otherKeys = Object.keys(query).map(key => {
      if (key === '$and' || key === '$or') {
        return;
      }
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
      }

      // remove the current queryKey as we don,t need it anymore
      delete query[key];
      // execute each query independently to build the list of
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
    return Promise.all([...promises, ...otherKeys]).then(() => {
      return Promise.resolve(query);
    });
  }

  // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated
  reduceRelationKeys(className, query, queryOptions, auth = {}, aclGroup = [], isMaster = false, schemaController) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions, auth, aclGroup, isMaster, schemaController);
      }));
    }
    if (query['$and']) {
      return Promise.all(query['$and'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions, auth, aclGroup, isMaster, schemaController);
      }));
    }
    if (Array.isArray(query['$nor'])) {
      // Guard with Array.isArray (unlike the legacy $or/$and checks above) so a
      // malformed non-array $nor still falls through to validateQuery and yields
      // the existing INVALID_QUERY error instead of throwing here.
      return Promise.all(query['$nor'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions, auth, aclGroup, isMaster, schemaController);
      }));
    }
    var relatedTo = query['$relatedTo'];
    if (relatedTo) {
      return this.authorizeRelatedToQuery(relatedTo, auth, aclGroup, isMaster, schemaController).then(canReadOwningObject => {
        delete query['$relatedTo'];
        if (!canReadOwningObject) {
          // The caller is not allowed to read the owning object, so the
          // relation must not disclose any linked objects (and must not act
          // as a membership oracle for a known related id).
          this.addInObjectIdsIds([], query);
          return this.reduceRelationKeys(className, query, queryOptions, auth, aclGroup, isMaster, schemaController);
        }
        return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
          this.addInObjectIdsIds(ids, query);
          return this.reduceRelationKeys(className, query, queryOptions, auth, aclGroup, isMaster, schemaController);
        });
      }).then(() => {});
    }
  }

  // Authorizes a `$relatedTo` relation query against the owning object before
  // its join table is read by `relatedIds`. Without this check, `$relatedTo`
  // bypasses both `protectedFields` and the owning object's ACL/CLP, because
  // the downstream protected-field and ACL filters only apply to the queried
  // (target) class, never to the owning class referenced by `$relatedTo`.
  //
  // - Throws `OPERATION_FORBIDDEN` if the relation key is a protected field on
  //   the owning class for the caller's auth context (mirrors the protected
  //   WHERE-field denial in `RestQuery.denyProtectedFields`).
  // - Resolves to `true` if the caller may read the owning object (so the join
  //   table read may proceed), or `false` otherwise (so the relation yields no
  //   results and cannot be used as a membership oracle).
  //
  // Master and maintenance requests bypass both checks by design.
  authorizeRelatedToQuery(relatedTo, auth = {}, aclGroup = [], isMaster = false, schemaController) {
    if (isMaster) {
      return Promise.resolve(true);
    }
    const owningClassName = relatedTo && relatedTo.object && relatedTo.object.className;
    const owningId = relatedTo && relatedTo.object && relatedTo.object.objectId;
    const relationKey = relatedTo && relatedTo.key;
    return this.loadSchemaIfNeeded(schemaController).then(loadedSchema => {
      // 1. The relation key must not be a protected field on the owning class.
      const protectedFields = this.addProtectedFields(loadedSchema, owningClassName, {}, aclGroup, auth) || [];
      const rootField = typeof relationKey === 'string' ? relationKey.split('.')[0] : relationKey;
      if (protectedFields.includes(relationKey) || protectedFields.includes(rootField)) {
        throw (0, _Error.createSanitizedError)(_node.Parse.Error.OPERATION_FORBIDDEN, `This user is not allowed to query ${relationKey} on class ${owningClassName}`, this.options);
      }
      // 2. The caller must be able to read the owning object itself. A read with
      //    the caller's auth context applies the owning class CLP, the object
      //    ACL and pointer permissions. Any "not authorized" or "not found"
      //    outcome maps to "cannot read", so the relation returns no results.
      return this.find(owningClassName, {
        objectId: owningId
      }, {
        acl: aclGroup,
        limit: 1,
        keys: ['objectId'],
        op: 'get'
      }, auth, loadedSchema).then(results => Array.isArray(results) && results.length > 0).catch(error => {
        if (error instanceof _node.Parse.Error && (error.code === _node.Parse.Error.OPERATION_FORBIDDEN || error.code === _node.Parse.Error.OBJECT_NOT_FOUND)) {
          return false;
        }
        throw error;
      });
    });
  }
  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

    // -disable-next
    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];
    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    }

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
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
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null);

    // make a set and spread to remove duplicates
    allIds = [...new Set(allIds)];

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
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
  }

  // Runs a query on the database.
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
  //  caseInsensitive make string comparisons case insensitive
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
    readPreference,
    hint,
    caseInsensitive = false,
    explain,
    comment
  } = {}, auth = {}, validSchemaController) {
    const isMaintenance = auth.isMaintenance;
    const isMaster = acl === undefined || isMaintenance;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find');
    // Count operation if counting
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
          readPreference,
          hint,
          caseInsensitive: this.options.enableCollationCaseComparison ? false : caseInsensitive,
          explain,
          comment
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }
          const rootFieldName = getRootFieldName(fieldName);
          if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
          if (!schema.fields[fieldName.split('.')[0]] && fieldName !== 'score') {
            delete sort[fieldName];
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions, auth, aclGroup, isMaster, schemaController)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;
          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
            /* Don't use projections to optimize the protectedFields since the protectedFields
              based on pointer-permissions are determined after querying. The filtering can
              overwrite the protected fields. */
            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth, queryOptions);
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
          validateQuery(query, isMaster, isMaintenance, false, this.options);
          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference, undefined, hint, comment);
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
              return this.adapter.aggregate(className, schema, pipeline, readPreference, hint, explain, comment);
            }
          } else if (explain) {
            return this.adapter.find(className, schema, query, queryOptions);
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, isMaintenance, aclGroup, auth, op, schemaController, className, protectedFields, object);
            })).catch(error => {
              if (error instanceof _node.Parse.Error) {
                throw error;
              }
              const detailedMessage = typeof error === 'string' ? error : error?.message || 'An internal server error occurred';
              throw (0, _Error.createSanitizedError)(_node.Parse.Error.INTERNAL_SERVER_ERROR, detailedMessage, this.options, 'An internal server error occurred');
            });
          }
        });
      });
    });
  }
  deleteSchema(className) {
    let schemaController;
    return this.loadSchema({
      clearCache: true
    }).then(s => {
      schemaController = s;
      return schemaController.getOneSchema(className, true);
    }).catch(error => {
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
            _SchemaCache.default.del(className);
            return schemaController.reloadData();
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  }

  // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json
  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  }

  // Naive logic reducer for OR operations meant to be used only for pointer permissions.
  reduceOrOperation(query) {
    if (!query.$or) {
      return query;
    }
    const queries = query.$or.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the longer query.
            query.$or.splice(longer, 1);
            queries.splice(longer, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$or.length === 1) {
      query = {
        ...query,
        ...query.$or[0]
      };
      delete query.$or;
    }
    return query;
  }

  // Naive logic reducer for AND operations meant to be used only for pointer permissions.
  reduceAndOperation(query) {
    if (!query.$and) {
      return query;
    }
    const queries = query.$and.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the shorter query.
            query.$and.splice(shorter, 1);
            queries.splice(shorter, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$and.length === 1) {
      query = {
        ...query,
        ...query.$and[0]
      };
      delete query.$and;
    }
    return query;
  }

  // Constraints query using CLP's pointer permissions (PP) if any.
  // 1. Etract the user id from caller's ACLgroup;
  // 2. Exctract a list of field names that are PP for target collection and operation;
  // 3. Constraint the original query so that each PP field must
  // point to caller's id (or contain it in case of PP field being an array)
  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }
    const perms = schema.getClassLevelPermissions(className);
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    });
    const groupKey = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const permFields = [];
    if (perms[operation] && perms[operation].pointerFields) {
      permFields.push(...perms[operation].pointerFields);
    }
    if (perms[groupKey]) {
      for (const field of perms[groupKey]) {
        if (!permFields.includes(field)) {
          permFields.push(field);
        }
      }
    }
    // the ACL should have exactly 1 user
    if (permFields.length > 0) {
      // the ACL should have exactly 1 user
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
      const queries = permFields.map(key => {
        const fieldDescriptor = schema.getExpectedType(className, key);
        const fieldType = fieldDescriptor && typeof fieldDescriptor === 'object' && Object.prototype.hasOwnProperty.call(fieldDescriptor, 'type') ? fieldDescriptor.type : null;
        let queryClause;
        if (fieldType === 'Pointer') {
          // constraint for single pointer setup
          queryClause = {
            [key]: userPointer
          };
        } else if (fieldType === 'Array') {
          // constraint for users-array setup
          queryClause = {
            [key]: {
              $all: [userPointer]
            }
          };
        } else if (fieldType === 'Object') {
          // constraint for object setup
          queryClause = {
            [key]: userPointer
          };
        } else {
          // This means that there is a CLP field of an unexpected type. This condition should not happen, which is
          // why is being treated as an error.
          throw Error(`An unexpected condition occurred when resolving pointer permissions: ${className} ${key}`);
        }
        // if we already have a constraint on the key, use the $and
        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        }
        // otherwise just add the constaint
        return Object.assign({}, query, queryClause);
      });
      return queries.length === 1 ? queries[0] : this.reduceOrOperation({
        $or: queries
      });
    } else {
      return query;
    }
  }
  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}, queryOptions = {}) {
    const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : schema;
    if (!perms) {
      return null;
    }
    const protectedFields = perms.protectedFields;
    if (!protectedFields) {
      return null;
    }
    if (aclGroup.indexOf(query.objectId) > -1) {
      return null;
    }

    // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'
    const preserveKeys = queryOptions.keys;

    // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)
    const serverOnlyKeys = [];
    const authenticated = auth.user;

    // map to allow check without array search
    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {});

    // array of sets of protected fields. separate item for each applicable criteria
    const protectedKeysSets = [];
    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);
          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName);
            // 2. preserve it delete later
            serverOnlyKeys.push(fieldName);
          }
        }
        continue;
      }

      // add public tier
      if (key === '*') {
        protectedKeysSets.push(protectedFields[key]);
        continue;
      }
      if (authenticated) {
        if (key === 'authenticated') {
          // for logged in users
          protectedKeysSets.push(protectedFields[key]);
          continue;
        }
        if (roles[key] && key.startsWith('role:')) {
          // add applicable roles
          protectedKeysSets.push(roles[key]);
        }
      }
    }

    // check if there's a rule for current user's id
    if (authenticated) {
      const userId = auth.user.id;
      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    }

    // preserve fields to be removed before sending response to client
    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }
    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }
      return acc;
    }, []);

    // intersect all sets of protectedFields
    protectedKeysSets.forEach(fields => {
      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  }
  createTransactionalSession() {
    if (this._transactionalSession || this._transactionalSessionPending) {
      return Promise.reject(new Error('There is already an active transactional session'));
    }
    // Reserve the session before it is created, without setting `_transactionalSession`, which
    // concurrent writes on this controller would otherwise use
    this._transactionalSessionPending = true;
    return Promise.resolve().then(() => this.adapter.createTransactionalSession()).then(transactionalSession => {
      this._transactionalSession = transactionalSession;
    }).finally(() => {
      this._transactionalSessionPending = false;
    });
  }
  commitTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to commit');
    }
    return this.adapter.commitTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }
  abortTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to abort');
    }
    return this.adapter.abortTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.
  async performInitialization() {
    await this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    const requiredUserFields = {
      fields: {
        ...SchemaController.defaultColumns._Default,
        ...SchemaController.defaultColumns._User
      }
    };
    const requiredRoleFields = {
      fields: {
        ...SchemaController.defaultColumns._Default,
        ...SchemaController.defaultColumns._Role
      }
    };
    const requiredIdempotencyFields = {
      fields: {
        ...SchemaController.defaultColumns._Default,
        ...SchemaController.defaultColumns._Idempotency
      }
    };
    await this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    const databaseOptions = this.options.databaseOptions || {};
    if (databaseOptions.createIndexUserUsername !== false) {
      await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
        _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);
        throw error;
      });
    }
    if (!this.options.enableCollationCaseComparison) {
      if (databaseOptions.createIndexUserUsernameCaseInsensitive !== false) {
        await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
          _logger.default.warn('Unable to create case insensitive username index: ', error);
          throw error;
        });
      }
      if (databaseOptions.createIndexUserEmailCaseInsensitive !== false) {
        await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true).catch(error => {
          _logger.default.warn('Unable to create case insensitive email index: ', error);
          throw error;
        });
      }
    }
    if (databaseOptions.createIndexUserEmail !== false) {
      await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
        _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);
        throw error;
      });
    }
    if (databaseOptions.createIndexUserEmailVerifyToken !== false) {
      await this.adapter.ensureIndex('_User', requiredUserFields, ['_email_verify_token'], '_email_verify_token', false).catch(error => {
        _logger.default.warn('Unable to create index for email verification token: ', error);
        throw error;
      });
    }
    if (databaseOptions.createIndexUserPasswordResetToken !== false) {
      await this.adapter.ensureIndex('_User', requiredUserFields, ['_perishable_token'], '_perishable_token', false).catch(error => {
        _logger.default.warn('Unable to create index for password reset token: ', error);
        throw error;
      });
    }
    if (databaseOptions.createIndexRoleName !== false) {
      await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
        _logger.default.warn('Unable to ensure uniqueness for role name: ', error);
        throw error;
      });
    }
    await this.adapter.ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for idempotency request ID: ', error);
      throw error;
    });
    const isMongoAdapter = this.adapter instanceof _MongoStorageAdapter.default;
    const isPostgresAdapter = this.adapter instanceof _PostgresStorageAdapter.default;
    if (isMongoAdapter || isPostgresAdapter) {
      let options = {};
      if (isMongoAdapter) {
        options = {
          ttl: 0
        };
      } else if (isPostgresAdapter) {
        options = this.idempotencyOptions;
        options.setIdempotencyFunction = true;
      }
      await this.adapter.ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, options).catch(error => {
        _logger.default.warn('Unable to create TTL index for idempotency expire date: ', error);
        throw error;
      });
    }
    // Create unique indexes for authData providers to prevent race conditions
    // during concurrent signups with the same authData
    if (databaseOptions.createIndexAuthDataUniqueness !== false && typeof this.adapter.ensureAuthDataUniqueness === 'function') {
      const authProviders = Object.keys(this.options.auth || {});
      if (this.options.enableAnonymousUsers !== false) {
        if (!authProviders.includes('anonymous')) {
          authProviders.push('anonymous');
        }
      }
      await Promise.all(authProviders.map(provider => this.adapter.ensureAuthDataUniqueness(provider).catch(error => {
        _logger.default.warn(`Unable to ensure uniqueness for auth data provider "${provider}": `, error);
      })));
    }
    await this.adapter.updateSchemaWithIndexes();
  }
  _expandResultOnKeyPath(object, key, value) {
    if (key.indexOf('.') < 0) {
      object[key] = value[key];
      return object;
    }
    const path = key.split('.');
    const firstKey = path[0];
    const nextPath = path.slice(1).join('.');

    // Scan request data for denied keywords
    if (this.options && this.options.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of this.options.requestKeywordDenylist) {
        const match = _Utils.default.objectContainsKeyValue({
          [firstKey]: true,
          [nextPath]: true
        }, keyword.key, true);
        if (match) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
        }
      }
    }
    object[firstKey] = this._expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
    delete object[key];
    return object;
  }
  _sanitizeDatabaseResult(originalObject, result) {
    const response = {};
    if (!result) {
      return Promise.resolve(response);
    }
    Object.keys(originalObject).forEach(key => {
      const keyUpdate = originalObject[key];
      // determine if that was an op
      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment', 'SetOnInsert'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
        // Revert array to object conversion on dot notation for arrays (e.g. "field.0.key")
        if (key.includes('.')) {
          const [field, index] = key.split('.');
          const isArrayIndex = Array.from(index).every(c => c >= '0' && c <= '9');
          if (isArrayIndex && Array.isArray(result[field]) && !Array.isArray(response[field])) {
            response[field] = result[field];
          }
        }
      }
    });
    return Promise.resolve(response);
  }
}
module.exports = DatabaseController;
// Expose validateQuery for tests
module.exports._validateQuery = validateQuery;
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfbG9nZ2VyIiwiX1V0aWxzIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9TY2hlbWFDYWNoZSIsIl9FcnJvciIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiQUNMIiwicmVzdWx0IiwiZW50cnkiLCJyZWFkIiwicHVzaCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5S2V5cyIsInNwZWNpYWxNYXN0ZXJRdWVyeUtleXMiLCJ2YWxpZGF0ZVF1ZXJ5IiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwidXBkYXRlIiwib3B0aW9ucyIsIl9kZXB0aCIsInJjIiwicmVxdWVzdENvbXBsZXhpdHkiLCJxdWVyeURlcHRoIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJ2YWx1ZSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwia2V5cyIsImtleSIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJpbmNsdWRlcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJpbmRleE9mIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJmaWx0ZXIiLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpc1VzZXJDbGFzcyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsImsiLCJ0ZW1wb3JhcnlLZXlzIiwiY2hhckF0IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJzcGxpdCIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJjb252ZXJ0RW1haWxUb0xvd2VyY2FzZSIsInRvTG93ZXJDYXNlIiwiY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZyIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwiZ2V0RXhwZWN0ZWRUeXBlIiwidGFyZ2V0Q2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInJ1bk9wdGlvbnMiLCJtYWludGVuYW5jZSIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwiVXRpbHMiLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsImVycm9yIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwic3RydWN0dXJlZENsb25lIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJyZWFkUHJlZmVyZW5jZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwc2VydE9uZU9iamVjdCIsImZpbmRPbmVBbmRVcGRhdGUiLCJoYW5kbGVSZWxhdGlvblVwZGF0ZXMiLCJfc2FuaXRpemVEYXRhYmFzZVJlc3VsdCIsIm9wcyIsImRlbGV0ZU1lIiwicHJvY2VzcyIsIm9wIiwieCIsInBlbmRpbmciLCJhZGRSZWxhdGlvbiIsInJlbW92ZVJlbGF0aW9uIiwiYWxsIiwiZnJvbUNsYXNzTmFtZSIsImZyb21JZCIsInRvSWQiLCJkb2MiLCJjb2RlIiwiZGVzdHJveSIsInBhcnNlRm9ybWF0U2NoZW1hIiwiY3JlYXRlIiwib3JpZ2luYWxPYmplY3QiLCJjcmVhdGVkQXQiLCJpc28iLCJfX3R5cGUiLCJ1cGRhdGVkQXQiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJjcmVhdGVPYmplY3QiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwiY2xhc3NTY2hlbWEiLCJzY2hlbWFEYXRhIiwic2NoZW1hRmllbGRzIiwibmV3S2V5cyIsImZpZWxkIiwiYWN0aW9uIiwiZGVsZXRlRXZlcnl0aGluZyIsImZhc3QiLCJTY2hlbWFDYWNoZSIsImNsZWFyIiwiZGVsZXRlQWxsQ2xhc3NlcyIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJwcm9taXNlcyIsIm9ycyIsImFRdWVyeSIsImluZGV4IiwiYW5kcyIsIm90aGVyS2V5cyIsInF1ZXJpZXMiLCJjb25zdHJhaW50S2V5IiwiaXNOZWdhdGlvbiIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiYXV0aG9yaXplUmVsYXRlZFRvUXVlcnkiLCJjYW5SZWFkT3duaW5nT2JqZWN0Iiwib3duaW5nQ2xhc3NOYW1lIiwicmVsYXRpb25LZXkiLCJsb2FkZWRTY2hlbWEiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJyb290RmllbGQiLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJjb21tZW50IiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImVuYWJsZUNvbGxhdGlvbkNhc2VDb21wYXJpc29uIiwiYWdncmVnYXRlIiwiZGV0YWlsZWRNZXNzYWdlIiwibWVzc2FnZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5Iiwiam9pbiIsInJlZHVjZU9yT3BlcmF0aW9uIiwicmVwZWF0IiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJwcm90b3R5cGUiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiZmluYWxseSIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJyZXF1aXJlZFVzZXJGaWVsZHMiLCJkZWZhdWx0Q29sdW1ucyIsIl9EZWZhdWx0IiwiX1VzZXIiLCJyZXF1aXJlZFJvbGVGaWVsZHMiLCJfUm9sZSIsInJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMiLCJfSWRlbXBvdGVuY3kiLCJkYXRhYmFzZU9wdGlvbnMiLCJjcmVhdGVJbmRleFVzZXJVc2VybmFtZSIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiY3JlYXRlSW5kZXhVc2VyVXNlcm5hbWVDYXNlSW5zZW5zaXRpdmUiLCJlbnN1cmVJbmRleCIsImNyZWF0ZUluZGV4VXNlckVtYWlsQ2FzZUluc2Vuc2l0aXZlIiwiY3JlYXRlSW5kZXhVc2VyRW1haWwiLCJjcmVhdGVJbmRleFVzZXJFbWFpbFZlcmlmeVRva2VuIiwiY3JlYXRlSW5kZXhVc2VyUGFzc3dvcmRSZXNldFRva2VuIiwiY3JlYXRlSW5kZXhSb2xlTmFtZSIsImlzTW9uZ29BZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImlzUG9zdGdyZXNBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInR0bCIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJjcmVhdGVJbmRleEF1dGhEYXRhVW5pcXVlbmVzcyIsImVuc3VyZUF1dGhEYXRhVW5pcXVlbmVzcyIsImF1dGhQcm92aWRlcnMiLCJlbmFibGVBbm9ueW1vdXNVc2VycyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiX2V4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJmaXJzdEtleSIsIm5leHRQYXRoIiwic2xpY2UiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0Iiwia2V5d29yZCIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJyZXNwb25zZSIsImtleVVwZGF0ZSIsImlzQXJyYXlJbmRleCIsImZyb20iLCJldmVyeSIsImMiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0ICogYXMgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBNb25nb1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCB0eXBlIHsgTG9hZFNjaGVtYU9wdGlvbnMgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgdHlwZSB7IFF1ZXJ5T3B0aW9ucywgRnVsbFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHsgY3JlYXRlU2FuaXRpemVkRXJyb3IgfSBmcm9tICcuLi9FcnJvcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5S2V5cyA9IFsnJGFuZCcsICckb3InLCAnJG5vcicsICdfcnBlcm0nLCAnX3dwZXJtJ107XG5jb25zdCBzcGVjaWFsTWFzdGVyUXVlcnlLZXlzID0gW1xuICAuLi5zcGVjaWFsUXVlcnlLZXlzLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ190b21ic3RvbmUnLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5JyxcbiAgJ19zZXNzaW9uX3Rva2VuJyxcbl07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAoXG4gIHF1ZXJ5OiBhbnksXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICB1cGRhdGU6IGJvb2xlYW4sXG4gIG9wdGlvbnM6ID9QYXJzZVNlcnZlck9wdGlvbnMsXG4gIF9kZXB0aDogbnVtYmVyID0gMFxuKTogdm9pZCA9PiB7XG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgaXNNYXN0ZXIgPSB0cnVlO1xuICB9XG4gIGNvbnN0IHJjID0gb3B0aW9ucz8ucmVxdWVzdENvbXBsZXhpdHk7XG4gIGlmICghaXNNYXN0ZXIgJiYgcmMgJiYgcmMucXVlcnlEZXB0aCAhPT0gLTEgJiYgX2RlcHRoID4gcmMucXVlcnlEZXB0aCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICBgUXVlcnkgY29uZGl0aW9uIG5lc3RpbmcgZGVwdGggZXhjZWVkcyBtYXhpbXVtIGFsbG93ZWQgZGVwdGggb2YgJHtyYy5xdWVyeURlcHRofWBcbiAgICApO1xuICB9XG4gIGlmIChxdWVyeS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0Nhbm5vdCBxdWVyeSBvbiBBQ0wuJyk7XG4gIH1cblxuICBpZiAocXVlcnkuJG9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRvciBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kb3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgaXNNYWludGVuYW5jZSwgdXBkYXRlLCBvcHRpb25zLCBfZGVwdGggKyAxKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRvciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRhbmQpIHtcbiAgICBpZiAocXVlcnkuJGFuZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kYW5kLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSwgb3B0aW9ucywgX2RlcHRoICsgMSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSwgb3B0aW9ucywgX2RlcHRoICsgMSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG5vciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgb2YgYXQgbGVhc3QgMSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5W2tleV0gJiYgcXVlcnlba2V5XS4kcmVnZXgpIHtcbiAgICAgIGlmICh0eXBlb2YgcXVlcnlba2V5XS4kb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFxdWVyeVtrZXldLiRvcHRpb25zLm1hdGNoKC9eW2lteHN1XSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoXG4gICAgICAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pICYmXG4gICAgICAhc3BlY2lhbFF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpICYmXG4gICAgICAhKGlzTWFzdGVyICYmIHNwZWNpYWxNYXN0ZXJRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSlcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGlzTWFpbnRlbmFuY2U6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIgfCBhbnksXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHsgdXNlcklkID0gYXV0aC51c2VyLmlkOyB9XG5cbiAgLy8gcmVwbGFjZSBwcm90ZWN0ZWRGaWVsZHMgd2hlbiB1c2luZyBwb2ludGVyLXBlcm1pc3Npb25zXG4gIGNvbnN0IHBlcm1zID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSA6IHt9O1xuICBpZiAocGVybXMpIHtcbiAgICBjb25zdCBpc1JlYWRPcGVyYXRpb24gPSBbJ2dldCcsICdmaW5kJ10uaW5kZXhPZihvcGVyYXRpb24pID4gLTE7XG5cbiAgICBpZiAoaXNSZWFkT3BlcmF0aW9uICYmIHBlcm1zLnByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gZXh0cmFjdCBwcm90ZWN0ZWRGaWVsZHMgYWRkZWQgd2l0aCB0aGUgcG9pbnRlci1wZXJtaXNzaW9uIHByZWZpeFxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0gPSBPYmplY3Qua2V5cyhwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IGtleS5zdWJzdHJpbmcoMTApLCB2YWx1ZTogcGVybXMucHJvdGVjdGVkRmllbGRzW2tleV0gfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG5ld1Byb3RlY3RlZEZpZWxkczogQXJyYXk8c3RyaW5nPltdID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJiByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIC8vIGlmIHRoZXJlJ3JlIG5vIHByb3RjdGVkRmllbGRzIGJ5IG90aGVyIGNyaXRlcmlhICggaWQgLyByb2xlIC8gYXV0aClcbiAgICAgICAgICAvLyB0aGVuIHdlIG11c3QgaW50ZXJzZWN0IGVhY2ggc2V0IChwZXIgdXNlckZpZWxkKVxuICAgICAgICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBmaWVsZHM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG4gIGlmIChpc1VzZXJDbGFzcykge1xuICAgIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvLyBidXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzXG4gICAgcGVybXM/LnByb3RlY3RlZEZpZWxkcz8udGVtcG9yYXJ5S2V5cz8uZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleS5jaGFyQXQoMCkgPT09ICdfJykge1xuICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MgfHwgaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnU2V0T25JbnNlcnQnOlxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY29uc3QgY29udmVydEVtYWlsVG9Mb3dlcmNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmNvbnZlcnRFbWFpbFRvTG93ZXJjYXNlKSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3RbJ2VtYWlsJ10gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvYmplY3RbJ2VtYWlsJ10gPSBvYmplY3RbJ2VtYWlsJ10udG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IGNvbnZlcnRVc2VybmFtZVRvTG93ZXJjYXNlID0gKG9iamVjdCwgY2xhc3NOYW1lLCBvcHRpb25zKSA9PiB7XG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiYgb3B0aW9ucy5jb252ZXJ0VXNlcm5hbWVUb0xvd2VyY2FzZSkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0Wyd1c2VybmFtZSddID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqZWN0Wyd1c2VybmFtZSddID0gb2JqZWN0Wyd1c2VybmFtZSddLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuICB9XG59O1xuXG5jbGFzcyBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcbiAgc2NoZW1hUHJvbWlzZTogP1Byb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPjtcbiAgX3RyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55O1xuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuaWRlbXBvdGVuY3lPcHRpb25zIHx8IHt9O1xuICAgIC8vIFByZXZlbnQgbXV0YWJsZSB0aGlzLnNjaGVtYSwgb3RoZXJ3aXNlIG9uZSByZXF1ZXN0IGNvdWxkIHVzZVxuICAgIC8vIG11bHRpcGxlIHNjaGVtYXMsIHNvIGluc3RlYWQgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZyA9IGZhbHNlO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcikgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnMsXG4gICAgbWFpbnRlbmFuY2U6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwLCBydW5PcHRpb25zKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5LCBtYWludGVuYW5jZSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdHJ5IHtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMub3B0aW9ucywgdXBkYXRlKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBlcnJvcikpO1xuICAgIH1cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IHN0cnVjdHVyZWRDbG9uZSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgdHJ1ZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSAmJlxuICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCB1cGRhdGVPcGVyYXRpb24gaW4gdXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gJiZcbiAgICAgICAgICAgICAgICAgIHR5cGVvZiB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICBpbm5lcktleSA9PiBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgICAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICBjb252ZXJ0RW1haWxUb0xvd2VyY2FzZSh1cGRhdGUsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgICAgICAgY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2UodXBkYXRlLCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgeyByZWFkUHJlZmVyZW5jZTogJ3ByaW1hcnknIH0pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgZmFsc2UsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocGFyc2VGb3JtYXRTY2hlbWEgPT5cbiAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBwYXJzZUZvcm1hdFNjaGVtYSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBXaGVuIGRlbGV0aW5nIHNlc3Npb25zIHdoaWxlIGNoYW5naW5nIHBhc3N3b3JkcywgZG9uJ3QgdGhyb3cgYW4gZXJyb3IgaWYgdGhleSBkb24ndCBoYXZlIGFueSBzZXNzaW9ucy5cbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBJbnNlcnRzIGFuIG9iamVjdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgc2F2ZWQuXG4gIGNyZWF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHRyeSB7XG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyh0aGlzLm9wdGlvbnMsIG9iamVjdCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpKTtcbiAgICB9XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIGNvbnN0IG9yaWdpbmFsT2JqZWN0ID0gb2JqZWN0O1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuXG4gICAgY29udmVydEVtYWlsVG9Mb3dlcmNhc2Uob2JqZWN0LCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2Uob2JqZWN0LCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuXG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0Lm9wc1swXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2FuQWRkRmllbGQoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChvYmplY3RbZmllbGRdICYmIG9iamVjdFtmaWVsZF0uX19vcCAmJiBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihnZXRSb290RmllbGROYW1lKGZpZWxkKSkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksIHJlbGF0aW9uU2NoZW1hLCB7IG93bmluZ0lkIH0sIGZpbmRPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nLCByZWxhdGVkSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7IGtleXM6IFsnb3duaW5nSWQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAuLi5vcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIGNvbnN0IGFuZHMgPSBxdWVyeVsnJGFuZCddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4uYW5kcy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5WyckYW5kJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvdGhlcktleXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09PSAnJGFuZCcgfHwga2V5ID09PSAnJG9yJykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoWy4uLnByb21pc2VzLCAuLi5vdGhlcktleXNdKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcXVlcnlPcHRpb25zOiBhbnksXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgaXNNYXN0ZXI6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBzY2hlbWFDb250cm9sbGVyOiA/U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6ID9Qcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckb3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBhUXVlcnksXG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICApO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRhbmQnXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBhUXVlcnksXG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICApO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocXVlcnlbJyRub3InXSkpIHtcbiAgICAgIC8vIEd1YXJkIHdpdGggQXJyYXkuaXNBcnJheSAodW5saWtlIHRoZSBsZWdhY3kgJG9yLyRhbmQgY2hlY2tzIGFib3ZlKSBzbyBhXG4gICAgICAvLyBtYWxmb3JtZWQgbm9uLWFycmF5ICRub3Igc3RpbGwgZmFsbHMgdGhyb3VnaCB0byB2YWxpZGF0ZVF1ZXJ5IGFuZCB5aWVsZHNcbiAgICAgIC8vIHRoZSBleGlzdGluZyBJTlZBTElEX1FVRVJZIGVycm9yIGluc3RlYWQgb2YgdGhyb3dpbmcgaGVyZS5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRub3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBhUXVlcnksXG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICApO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMuYXV0aG9yaXplUmVsYXRlZFRvUXVlcnkocmVsYXRlZFRvLCBhdXRoLCBhY2xHcm91cCwgaXNNYXN0ZXIsIHNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAgIC50aGVuKGNhblJlYWRPd25pbmdPYmplY3QgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIGlmICghY2FuUmVhZE93bmluZ09iamVjdCkge1xuICAgICAgICAgICAgLy8gVGhlIGNhbGxlciBpcyBub3QgYWxsb3dlZCB0byByZWFkIHRoZSBvd25pbmcgb2JqZWN0LCBzbyB0aGVcbiAgICAgICAgICAgIC8vIHJlbGF0aW9uIG11c3Qgbm90IGRpc2Nsb3NlIGFueSBsaW5rZWQgb2JqZWN0cyAoYW5kIG11c3Qgbm90IGFjdFxuICAgICAgICAgICAgLy8gYXMgYSBtZW1iZXJzaGlwIG9yYWNsZSBmb3IgYSBrbm93biByZWxhdGVkIGlkKS5cbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoW10sIHF1ZXJ5KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgICAgICByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgKS50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBxdWVyeU9wdGlvbnMsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIH1cbiAgfVxuXG4gIC8vIEF1dGhvcml6ZXMgYSBgJHJlbGF0ZWRUb2AgcmVsYXRpb24gcXVlcnkgYWdhaW5zdCB0aGUgb3duaW5nIG9iamVjdCBiZWZvcmVcbiAgLy8gaXRzIGpvaW4gdGFibGUgaXMgcmVhZCBieSBgcmVsYXRlZElkc2AuIFdpdGhvdXQgdGhpcyBjaGVjaywgYCRyZWxhdGVkVG9gXG4gIC8vIGJ5cGFzc2VzIGJvdGggYHByb3RlY3RlZEZpZWxkc2AgYW5kIHRoZSBvd25pbmcgb2JqZWN0J3MgQUNML0NMUCwgYmVjYXVzZVxuICAvLyB0aGUgZG93bnN0cmVhbSBwcm90ZWN0ZWQtZmllbGQgYW5kIEFDTCBmaWx0ZXJzIG9ubHkgYXBwbHkgdG8gdGhlIHF1ZXJpZWRcbiAgLy8gKHRhcmdldCkgY2xhc3MsIG5ldmVyIHRvIHRoZSBvd25pbmcgY2xhc3MgcmVmZXJlbmNlZCBieSBgJHJlbGF0ZWRUb2AuXG4gIC8vXG4gIC8vIC0gVGhyb3dzIGBPUEVSQVRJT05fRk9SQklEREVOYCBpZiB0aGUgcmVsYXRpb24ga2V5IGlzIGEgcHJvdGVjdGVkIGZpZWxkIG9uXG4gIC8vICAgdGhlIG93bmluZyBjbGFzcyBmb3IgdGhlIGNhbGxlcidzIGF1dGggY29udGV4dCAobWlycm9ycyB0aGUgcHJvdGVjdGVkXG4gIC8vICAgV0hFUkUtZmllbGQgZGVuaWFsIGluIGBSZXN0UXVlcnkuZGVueVByb3RlY3RlZEZpZWxkc2ApLlxuICAvLyAtIFJlc29sdmVzIHRvIGB0cnVlYCBpZiB0aGUgY2FsbGVyIG1heSByZWFkIHRoZSBvd25pbmcgb2JqZWN0IChzbyB0aGUgam9pblxuICAvLyAgIHRhYmxlIHJlYWQgbWF5IHByb2NlZWQpLCBvciBgZmFsc2VgIG90aGVyd2lzZSAoc28gdGhlIHJlbGF0aW9uIHlpZWxkcyBub1xuICAvLyAgIHJlc3VsdHMgYW5kIGNhbm5vdCBiZSB1c2VkIGFzIGEgbWVtYmVyc2hpcCBvcmFjbGUpLlxuICAvL1xuICAvLyBNYXN0ZXIgYW5kIG1haW50ZW5hbmNlIHJlcXVlc3RzIGJ5cGFzcyBib3RoIGNoZWNrcyBieSBkZXNpZ24uXG4gIGF1dGhvcml6ZVJlbGF0ZWRUb1F1ZXJ5KFxuICAgIHJlbGF0ZWRUbzogYW55LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdLFxuICAgIGlzTWFzdGVyOiBib29sZWFuID0gZmFsc2UsXG4gICAgc2NoZW1hQ29udHJvbGxlcjogP1NjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIGNvbnN0IG93bmluZ0NsYXNzTmFtZSA9IHJlbGF0ZWRUbyAmJiByZWxhdGVkVG8ub2JqZWN0ICYmIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lO1xuICAgIGNvbnN0IG93bmluZ0lkID0gcmVsYXRlZFRvICYmIHJlbGF0ZWRUby5vYmplY3QgJiYgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZDtcbiAgICBjb25zdCByZWxhdGlvbktleSA9IHJlbGF0ZWRUbyAmJiByZWxhdGVkVG8ua2V5O1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZChzY2hlbWFDb250cm9sbGVyKS50aGVuKGxvYWRlZFNjaGVtYSA9PiB7XG4gICAgICAvLyAxLiBUaGUgcmVsYXRpb24ga2V5IG11c3Qgbm90IGJlIGEgcHJvdGVjdGVkIGZpZWxkIG9uIHRoZSBvd25pbmcgY2xhc3MuXG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPVxuICAgICAgICB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhsb2FkZWRTY2hlbWEsIG93bmluZ0NsYXNzTmFtZSwge30sIGFjbEdyb3VwLCBhdXRoKSB8fCBbXTtcbiAgICAgIGNvbnN0IHJvb3RGaWVsZCA9IHR5cGVvZiByZWxhdGlvbktleSA9PT0gJ3N0cmluZycgPyByZWxhdGlvbktleS5zcGxpdCgnLicpWzBdIDogcmVsYXRpb25LZXk7XG4gICAgICBpZiAocHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHJlbGF0aW9uS2V5KSB8fCBwcm90ZWN0ZWRGaWVsZHMuaW5jbHVkZXMocm9vdEZpZWxkKSkge1xuICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgIGBUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gcXVlcnkgJHtyZWxhdGlvbktleX0gb24gY2xhc3MgJHtvd25pbmdDbGFzc05hbWV9YCxcbiAgICAgICAgICB0aGlzLm9wdGlvbnNcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIDIuIFRoZSBjYWxsZXIgbXVzdCBiZSBhYmxlIHRvIHJlYWQgdGhlIG93bmluZyBvYmplY3QgaXRzZWxmLiBBIHJlYWQgd2l0aFxuICAgICAgLy8gICAgdGhlIGNhbGxlcidzIGF1dGggY29udGV4dCBhcHBsaWVzIHRoZSBvd25pbmcgY2xhc3MgQ0xQLCB0aGUgb2JqZWN0XG4gICAgICAvLyAgICBBQ0wgYW5kIHBvaW50ZXIgcGVybWlzc2lvbnMuIEFueSBcIm5vdCBhdXRob3JpemVkXCIgb3IgXCJub3QgZm91bmRcIlxuICAgICAgLy8gICAgb3V0Y29tZSBtYXBzIHRvIFwiY2Fubm90IHJlYWRcIiwgc28gdGhlIHJlbGF0aW9uIHJldHVybnMgbm8gcmVzdWx0cy5cbiAgICAgIHJldHVybiB0aGlzLmZpbmQoXG4gICAgICAgIG93bmluZ0NsYXNzTmFtZSxcbiAgICAgICAgeyBvYmplY3RJZDogb3duaW5nSWQgfSxcbiAgICAgICAgeyBhY2w6IGFjbEdyb3VwLCBsaW1pdDogMSwga2V5czogWydvYmplY3RJZCddLCBvcDogJ2dldCcgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgbG9hZGVkU2NoZW1hXG4gICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4gQXJyYXkuaXNBcnJheShyZXN1bHRzKSAmJiByZXN1bHRzLmxlbmd0aCA+IDApXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvciAmJlxuICAgICAgICAgICAgKGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4gfHxcbiAgICAgICAgICAgICAgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYWRkSW5PYmplY3RJZHNJZHMoaWRzOiA/QXJyYXk8c3RyaW5nPiA9IG51bGwsIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tU3RyaW5nOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gW3F1ZXJ5Lm9iamVjdElkXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUVxOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGVxJ10gPyBbcXVlcnkub2JqZWN0SWRbJyRlcSddXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUluOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGluJ10gPyBxdWVyeS5vYmplY3RJZFsnJGluJ10gOiBudWxsO1xuXG4gICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgY29uc3QgYWxsSWRzOiBBcnJheTxBcnJheTxzdHJpbmc+PiA9IFtpZHNGcm9tU3RyaW5nLCBpZHNGcm9tRXEsIGlkc0Zyb21JbiwgaWRzXS5maWx0ZXIoXG4gICAgICBsaXN0ID0+IGxpc3QgIT09IG51bGxcbiAgICApO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9IHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuXG4gICAgLy8gbWFrZSBhIHNldCBhbmQgc3ByZWFkIHRvIHJlbW92ZSBkdXBsaWNhdGVzXG4gICAgYWxsSWRzID0gWy4uLm5ldyBTZXQoYWxsSWRzKV07XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA9IGFsbElkcztcbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBSdW5zIGEgcXVlcnkgb24gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgbGlzdCBvZiBpdGVtcy5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBza2lwICAgIG51bWJlciBvZiByZXN1bHRzIHRvIHNraXAuXG4gIC8vICAgbGltaXQgICBsaW1pdCB0byB0aGlzIG51bWJlciBvZiByZXN1bHRzLlxuICAvLyAgIHNvcnQgICAgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIHRoZSBmaWVsZHMgdG8gc29ydCBieS5cbiAgLy8gICAgICAgICAgIHRoZSB2YWx1ZSBpcyArMSBmb3IgYXNjZW5kaW5nLCAtMSBmb3IgZGVzY2VuZGluZy5cbiAgLy8gICBjb3VudCAgIHJ1biBhIGNvdW50IGluc3RlYWQgb2YgcmV0dXJuaW5nIHJlc3VsdHMuXG4gIC8vICAgYWNsICAgICByZXN0cmljdCB0aGlzIG9wZXJhdGlvbiB3aXRoIGFuIEFDTCBmb3IgdGhlIHByb3ZpZGVkIGFycmF5XG4gIC8vICAgICAgICAgICBvZiB1c2VyIG9iamVjdElkcyBhbmQgcm9sZXMuIGFjbDogbnVsbCBtZWFucyBubyB1c2VyLlxuICAvLyAgICAgICAgICAgd2hlbiB0aGlzIGZpZWxkIGlzIG5vdCBwcmVzZW50LCBkb24ndCBkbyBhbnl0aGluZyByZWdhcmRpbmcgQUNMcy5cbiAgLy8gIGNhc2VJbnNlbnNpdGl2ZSBtYWtlIHN0cmluZyBjb21wYXJpc29ucyBjYXNlIGluc2Vuc2l0aXZlXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUgPSBmYWxzZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgICBjb21tZW50LFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYWludGVuYW5jZSA9IGF1dGguaXNNYWludGVuYW5jZTtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkIHx8IGlzTWFpbnRlbmFuY2U7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZTogdGhpcy5vcHRpb25zLmVuYWJsZUNvbGxhdGlvbkNhc2VDb21wYXJpc29uID8gZmFsc2UgOiBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgICAgY29tbWVudCxcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZS5zcGxpdCgnLicpWzBdXSAmJiBmaWVsZE5hbWUgIT09ICdzY29yZScpIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHNvcnRbZmllbGROYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnMsXG4gICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIGZhbHNlLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBjb21tZW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIGRpc3RpbmN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgICAgICAgICAgICBjb21tZW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01haW50ZW5hbmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGV0YWlsZWRNZXNzYWdlID1cbiAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgZXJyb3IgPT09ICdzdHJpbmcnXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGVycm9yXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGVycm9yPy5tZXNzYWdlIHx8ICdBbiBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3Igb2NjdXJyZWQnO1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgICAgICAgICAgICAgZGV0YWlsZWRNZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucyxcbiAgICAgICAgICAgICAgICAgICAgICAnQW4gaW50ZXJuYWwgc2VydmVyIGVycm9yIG9jY3VycmVkJ1xuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBzY2hlbWFDb250cm9sbGVyO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgU2NoZW1hQ2FjaGUuZGVsKGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIucmVsb2FkRGF0YSgpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVGhpcyBoZWxwcyB0byBjcmVhdGUgaW50ZXJtZWRpYXRlIG9iamVjdHMgZm9yIHNpbXBsZXIgY29tcGFyaXNvbiBvZlxuICAvLyBrZXkgdmFsdWUgcGFpcnMgdXNlZCBpbiBxdWVyeSBvYmplY3RzLiBFYWNoIGtleSB2YWx1ZSBwYWlyIHdpbGwgcmVwcmVzZW50ZWRcbiAgLy8gaW4gYSBzaW1pbGFyIHdheSB0byBqc29uXG4gIG9iamVjdFRvRW50cmllc1N0cmluZ3MocXVlcnk6IGFueSk6IEFycmF5PHN0cmluZz4ge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyhxdWVyeSkubWFwKGEgPT4gYS5tYXAocyA9PiBKU09OLnN0cmluZ2lmeShzKSkuam9pbignOicpKTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIE9SIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VPck9wZXJhdGlvbihxdWVyeTogeyAkb3I6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kb3IpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRvci5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIGxvbmdlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRvci5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJG9yLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kb3JbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kb3I7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIEFORCBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlQW5kT3BlcmF0aW9uKHF1ZXJ5OiB7ICRhbmQ6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kYW5kKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kYW5kLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgc2hvcnRlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRhbmQuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJGFuZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJGFuZFswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRhbmQ7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgY29uc3QgcGVybUZpZWxkcyA9IFtdO1xuXG4gICAgaWYgKHBlcm1zW29wZXJhdGlvbl0gJiYgcGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKSB7XG4gICAgICBwZXJtRmllbGRzLnB1c2goLi4ucGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKTtcbiAgICB9XG5cbiAgICBpZiAocGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgICBpZiAoIXBlcm1GaWVsZHMuaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGVybUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgaWYgKHBlcm1GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgICAgLy8gTm8gdXNlciBzZXQgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgLy8gSWYgdGhlIGxlbmd0aCBpcyA+IDEsIHRoYXQgbWVhbnMgd2UgZGlkbid0IGRlLWR1cGUgdXNlcnMgY29ycmVjdGx5XG4gICAgICBpZiAodXNlckFDTC5sZW5ndGggIT0gMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VySWQgPSB1c2VyQUNMWzBdO1xuICAgICAgY29uc3QgdXNlclBvaW50ZXIgPSB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBxdWVyaWVzID0gcGVybUZpZWxkcy5tYXAoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9XG4gICAgICAgICAgZmllbGREZXNjcmlwdG9yICYmXG4gICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9XG4gICAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9uc1xuICAgICAgICA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKVxuICAgICAgICA6IHNjaGVtYTtcbiAgICBpZiAoIXBlcm1zKSB7IHJldHVybiBudWxsOyB9XG5cbiAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBwZXJtcy5wcm90ZWN0ZWRGaWVsZHM7XG4gICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHsgcmV0dXJuIG51bGw7IH1cblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSB7IHJldHVybiBudWxsOyB9XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAodGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gfHwgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25QZW5kaW5nKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdUaGVyZSBpcyBhbHJlYWR5IGFuIGFjdGl2ZSB0cmFuc2FjdGlvbmFsIHNlc3Npb24nKSk7XG4gICAgfVxuICAgIC8vIFJlc2VydmUgdGhlIHNlc3Npb24gYmVmb3JlIGl0IGlzIGNyZWF0ZWQsIHdpdGhvdXQgc2V0dGluZyBgX3RyYW5zYWN0aW9uYWxTZXNzaW9uYCwgd2hpY2hcbiAgICAvLyBjb25jdXJyZW50IHdyaXRlcyBvbiB0aGlzIGNvbnRyb2xsZXIgd291bGQgb3RoZXJ3aXNlIHVzZVxuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZyA9IHRydWU7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKSlcbiAgICAgIC50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSB0cmFuc2FjdGlvbmFsU2Vzc2lvbjtcbiAgICAgIH0pXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZyA9IGZhbHNlO1xuICAgICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgY29uc3QgZGF0YWJhc2VPcHRpb25zID0gdGhpcy5vcHRpb25zLmRhdGFiYXNlT3B0aW9ucyB8fCB7fTtcblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyVXNlcm5hbWUgIT09IGZhbHNlKSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMub3B0aW9ucy5lbmFibGVDb2xsYXRpb25DYXNlQ29tcGFyaXNvbikge1xuICAgICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleFVzZXJVc2VybmFtZUNhc2VJbnNlbnNpdGl2ZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgdXNlcm5hbWUgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoZGF0YWJhc2VPcHRpb25zLmNyZWF0ZUluZGV4VXNlckVtYWlsQ2FzZUluc2Vuc2l0aXZlICE9PSBmYWxzZSkge1xuICAgICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10sICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJywgdHJ1ZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleFVzZXJFbWFpbCAhPT0gZmFsc2UpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleFVzZXJFbWFpbFZlcmlmeVRva2VuICE9PSBmYWxzZSkge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnX2VtYWlsX3ZlcmlmeV90b2tlbiddLCAnX2VtYWlsX3ZlcmlmeV90b2tlbicsIGZhbHNlKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGluZGV4IGZvciBlbWFpbCB2ZXJpZmljYXRpb24gdG9rZW46ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleFVzZXJQYXNzd29yZFJlc2V0VG9rZW4gIT09IGZhbHNlKSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydfcGVyaXNoYWJsZV90b2tlbiddLCAnX3BlcmlzaGFibGVfdG9rZW4nLCBmYWxzZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBpbmRleCBmb3IgcGFzc3dvcmQgcmVzZXQgdG9rZW46ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleFJvbGVOYW1lICE9PSBmYWxzZSkge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Sb2xlJywgcmVxdWlyZWRSb2xlRmllbGRzLCBbJ25hbWUnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBpZGVtcG90ZW5jeSByZXF1ZXN0IElEOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpc01vbmdvQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4gICAgY29uc3QgaXNQb3N0Z3Jlc0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuICAgIGlmIChpc01vbmdvQWRhcHRlciB8fCBpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgbGV0IG9wdGlvbnMgPSB7fTtcbiAgICAgIGlmIChpc01vbmdvQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIHR0bDogMCxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zO1xuICAgICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCBvcHRpb25zKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIENyZWF0ZSB1bmlxdWUgaW5kZXhlcyBmb3IgYXV0aERhdGEgcHJvdmlkZXJzIHRvIHByZXZlbnQgcmFjZSBjb25kaXRpb25zXG4gICAgLy8gZHVyaW5nIGNvbmN1cnJlbnQgc2lnbnVwcyB3aXRoIHRoZSBzYW1lIGF1dGhEYXRhXG4gICAgaWYgKFxuICAgICAgZGF0YWJhc2VPcHRpb25zLmNyZWF0ZUluZGV4QXV0aERhdGFVbmlxdWVuZXNzICE9PSBmYWxzZSAmJlxuICAgICAgdHlwZW9mIHRoaXMuYWRhcHRlci5lbnN1cmVBdXRoRGF0YVVuaXF1ZW5lc3MgPT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIGNvbnN0IGF1dGhQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh0aGlzLm9wdGlvbnMuYXV0aCB8fCB7fSk7XG4gICAgICBpZiAodGhpcy5vcHRpb25zLmVuYWJsZUFub255bW91c1VzZXJzICE9PSBmYWxzZSkge1xuICAgICAgICBpZiAoIWF1dGhQcm92aWRlcnMuaW5jbHVkZXMoJ2Fub255bW91cycpKSB7XG4gICAgICAgICAgYXV0aFByb3ZpZGVycy5wdXNoKCdhbm9ueW1vdXMnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIGF1dGhQcm92aWRlcnMubWFwKHByb3ZpZGVyID0+XG4gICAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZUF1dGhEYXRhVW5pcXVlbmVzcyhwcm92aWRlcikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgICAgIGBVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIGF1dGggZGF0YSBwcm92aWRlciBcIiR7cHJvdmlkZXJ9XCI6IGAsXG4gICAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLnVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk7XG4gIH1cblxuICBfZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdDogYW55LCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgIH1cbiAgICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgY29uc3QgZmlyc3RLZXkgPSBwYXRoWzBdO1xuICAgIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG5cbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgaWYgKHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShcbiAgICAgICAgICB7IFtmaXJzdEtleV06IHRydWUsIFtuZXh0UGF0aF06IHRydWUgfSxcbiAgICAgICAgICBrZXl3b3JkLmtleSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvYmplY3RbZmlyc3RLZXldID0gdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKFxuICAgICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICAgIG5leHRQYXRoLFxuICAgICAgdmFsdWVbZmlyc3RLZXldXG4gICAgKTtcbiAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIF9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0OiBhbnksIHJlc3VsdDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IHt9O1xuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9XG4gICAgT2JqZWN0LmtleXMob3JpZ2luYWxPYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IGtleVVwZGF0ZSA9IG9yaWdpbmFsT2JqZWN0W2tleV07XG4gICAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICAgIGlmIChcbiAgICAgICAga2V5VXBkYXRlICYmXG4gICAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIGtleVVwZGF0ZS5fX29wICYmXG4gICAgICAgIFsnQWRkJywgJ0FkZFVuaXF1ZScsICdSZW1vdmUnLCAnSW5jcmVtZW50JywgJ1NldE9uSW5zZXJ0J10uaW5kZXhPZihrZXlVcGRhdGUuX19vcCkgPiAtMVxuICAgICAgKSB7XG4gICAgICAgIC8vIG9ubHkgdmFsaWQgb3BzIHRoYXQgcHJvZHVjZSBhbiBhY3Rpb25hYmxlIHJlc3VsdFxuICAgICAgICAvLyB0aGUgb3AgbWF5IGhhdmUgaGFwcGVuZWQgb24gYSBrZXlwYXRoXG4gICAgICAgIHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChyZXNwb25zZSwga2V5LCByZXN1bHQpO1xuICAgICAgICAvLyBSZXZlcnQgYXJyYXkgdG8gb2JqZWN0IGNvbnZlcnNpb24gb24gZG90IG5vdGF0aW9uIGZvciBhcnJheXMgKGUuZy4gXCJmaWVsZC4wLmtleVwiKVxuICAgICAgICBpZiAoa2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICBjb25zdCBbZmllbGQsIGluZGV4XSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICAgIGNvbnN0IGlzQXJyYXlJbmRleCA9IEFycmF5LmZyb20oaW5kZXgpLmV2ZXJ5KGMgPT4gYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuICAgICAgICAgIGlmIChpc0FycmF5SW5kZXggJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbZmllbGRdKSAmJiAhQXJyYXkuaXNBcnJheShyZXNwb25zZVtmaWVsZF0pKSB7XG4gICAgICAgICAgICByZXNwb25zZVtmaWVsZF0gPSByZXN1bHRbZmllbGRdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiAoYW55LCBib29sZWFuLCBib29sZWFuLCBib29sZWFuKSA9PiB2b2lkO1xuICBzdGF0aWMgZmlsdGVyU2Vuc2l0aXZlRGF0YTogKGJvb2xlYW4sIGJvb2xlYW4sIGFueVtdLCBhbnksIGFueSwgYW55LCBzdHJpbmcsIGFueVtdLCBhbnkpID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG5tb2R1bGUuZXhwb3J0cy5maWx0ZXJTZW5zaXRpdmVEYXRhID0gZmlsdGVyU2Vuc2l0aXZlRGF0YTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFLQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFFQSxJQUFBQyxPQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFFQSxJQUFBRyxVQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSSxPQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSyxNQUFBLEdBQUFILHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBTSxnQkFBQSxHQUFBQyx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVEsZUFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsb0JBQUEsR0FBQVAsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFVLHVCQUFBLEdBQUFSLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBVyxZQUFBLEdBQUFULHNCQUFBLENBQUFGLE9BQUE7QUFJQSxJ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