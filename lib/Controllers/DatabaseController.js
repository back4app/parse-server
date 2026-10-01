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
    this.schemaPromise = SchemaController.load(this.adapter, options, this.options.appId);
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
    _SchemaCache.default.for(this.adapter).clear();
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
            _SchemaCache.default.for(this.adapter).del(className);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfbG9nZ2VyIiwiX1V0aWxzIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9TY2hlbWFDYWNoZSIsIl9FcnJvciIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiQUNMIiwicmVzdWx0IiwiZW50cnkiLCJyZWFkIiwicHVzaCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5S2V5cyIsInNwZWNpYWxNYXN0ZXJRdWVyeUtleXMiLCJ2YWxpZGF0ZVF1ZXJ5IiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwidXBkYXRlIiwib3B0aW9ucyIsIl9kZXB0aCIsInJjIiwicmVxdWVzdENvbXBsZXhpdHkiLCJxdWVyeURlcHRoIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJ2YWx1ZSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwia2V5cyIsImtleSIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJpbmNsdWRlcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJpbmRleE9mIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJmaWx0ZXIiLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpc1VzZXJDbGFzcyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsImsiLCJ0ZW1wb3JhcnlLZXlzIiwiY2hhckF0IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJzcGxpdCIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJjb252ZXJ0RW1haWxUb0xvd2VyY2FzZSIsInRvTG93ZXJDYXNlIiwiY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZyIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImFwcElkIiwibG9hZFNjaGVtYUlmTmVlZGVkIiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsIm1haW50ZW5hbmNlIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJVdGlscyIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJzdHJ1Y3R1cmVkQ2xvbmUiLCJyZWxhdGlvblVwZGF0ZXMiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjb2xsZWN0UmVsYXRpb25VcGRhdGVzIiwiYWRkUG9pbnRlclBlcm1pc3Npb25zIiwiY2F0Y2giLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsInJlYWRQcmVmZXJlbmNlIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJvcmlnaW5hbE9iamVjdCIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsIlNjaGVtYUNhY2hlIiwiZm9yIiwiY2xlYXIiLCJkZWxldGVBbGxDbGFzc2VzIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsInByb21pc2VzIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJhbmRzIiwib3RoZXJLZXlzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJhdXRob3JpemVSZWxhdGVkVG9RdWVyeSIsImNhblJlYWRPd25pbmdPYmplY3QiLCJvd25pbmdDbGFzc05hbWUiLCJyZWxhdGlvbktleSIsImxvYWRlZFNjaGVtYSIsImFkZFByb3RlY3RlZEZpZWxkcyIsInJvb3RGaWVsZCIsImNyZWF0ZVNhbml0aXplZEVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsImNvbW1lbnQiLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiZW5hYmxlQ29sbGF0aW9uQ2FzZUNvbXBhcmlzb24iLCJhZ2dyZWdhdGUiLCJkZXRhaWxlZE1lc3NhZ2UiLCJtZXNzYWdlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwiZGVsIiwicmVsb2FkRGF0YSIsIm9iamVjdFRvRW50cmllc1N0cmluZ3MiLCJlbnRyaWVzIiwiYSIsIkpTT04iLCJzdHJpbmdpZnkiLCJqb2luIiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJmaW5hbGx5IiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImRhdGFiYXNlT3B0aW9ucyIsImNyZWF0ZUluZGV4VXNlclVzZXJuYW1lIiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJjcmVhdGVJbmRleFVzZXJVc2VybmFtZUNhc2VJbnNlbnNpdGl2ZSIsImVuc3VyZUluZGV4IiwiY3JlYXRlSW5kZXhVc2VyRW1haWxDYXNlSW5zZW5zaXRpdmUiLCJjcmVhdGVJbmRleFVzZXJFbWFpbCIsImNyZWF0ZUluZGV4VXNlckVtYWlsVmVyaWZ5VG9rZW4iLCJjcmVhdGVJbmRleFVzZXJQYXNzd29yZFJlc2V0VG9rZW4iLCJjcmVhdGVJbmRleFJvbGVOYW1lIiwiaXNNb25nb0FkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiaXNQb3N0Z3Jlc0FkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidHRsIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsImNyZWF0ZUluZGV4QXV0aERhdGFVbmlxdWVuZXNzIiwiZW5zdXJlQXV0aERhdGFVbmlxdWVuZXNzIiwiYXV0aFByb3ZpZGVycyIsImVuYWJsZUFub255bW91c1VzZXJzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJfZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwiaXNBcnJheUluZGV4IiwiZnJvbSIsImV2ZXJ5IiwiYyIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBjcmVhdGVTYW5pdGl6ZWRFcnJvciB9IGZyb20gJy4uL0Vycm9yJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlLZXlzID0gWyckYW5kJywgJyRvcicsICckbm9yJywgJ19ycGVybScsICdfd3Blcm0nXTtcbmNvbnN0IHNwZWNpYWxNYXN0ZXJRdWVyeUtleXMgPSBbXG4gIC4uLnNwZWNpYWxRdWVyeUtleXMsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3RvbWJzdG9uZScsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuICAnX3Nlc3Npb25fdG9rZW4nLFxuXTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChcbiAgcXVlcnk6IGFueSxcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGlzTWFpbnRlbmFuY2U6IGJvb2xlYW4sXG4gIHVwZGF0ZTogYm9vbGVhbixcbiAgb3B0aW9uczogP1BhcnNlU2VydmVyT3B0aW9ucyxcbiAgX2RlcHRoOiBudW1iZXIgPSAwXG4pOiB2b2lkID0+IHtcbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICBpc01hc3RlciA9IHRydWU7XG4gIH1cbiAgY29uc3QgcmMgPSBvcHRpb25zPy5yZXF1ZXN0Q29tcGxleGl0eTtcbiAgaWYgKCFpc01hc3RlciAmJiByYyAmJiByYy5xdWVyeURlcHRoICE9PSAtMSAmJiBfZGVwdGggPiByYy5xdWVyeURlcHRoKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgIGBRdWVyeSBjb25kaXRpb24gbmVzdGluZyBkZXB0aCBleGNlZWRzIG1heGltdW0gYWxsb3dlZCBkZXB0aCBvZiAke3JjLnF1ZXJ5RGVwdGh9YFxuICAgICk7XG4gIH1cbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUsIG9wdGlvbnMsIF9kZXB0aCArIDEpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgaXNNYWludGVuYW5jZSwgdXBkYXRlLCBvcHRpb25zLCBfZGVwdGggKyAxKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRhbmQgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgaXNNYWludGVuYW5jZSwgdXBkYXRlLCBvcHRpb25zLCBfZGVwdGggKyAxKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c3VdKyQvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICBgQmFkICRvcHRpb25zIHZhbHVlIGZvciBxdWVyeTogJHtxdWVyeVtrZXldLiRvcHRpb25zfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChcbiAgICAgICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykgJiZcbiAgICAgICFzcGVjaWFsUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkgJiZcbiAgICAgICEoaXNNYXN0ZXIgJiYgc3BlY2lhbE1hc3RlclF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGtleSBuYW1lOiAke2tleX1gKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgaXNNYWludGVuYW5jZTogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgeyB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7IH1cblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpIDoge307XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcbiAgaWYgKGlzVXNlckNsYXNzKSB7XG4gICAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLyogc3BlY2lhbCB0cmVhdCBmb3IgdGhlIHVzZXIgY2xhc3M6IGRvbid0IGZpbHRlciBwcm90ZWN0ZWRGaWVsZHMgaWYgY3VycmVudGx5IGxvZ2dlZGluIHVzZXIgaXNcbiAgdGhlIHJldHJpZXZlZCB1c2VyICovXG4gIGlmICghKGlzVXNlckNsYXNzICYmIHVzZXJJZCAmJiBvYmplY3Qub2JqZWN0SWQgPT09IHVzZXJJZCkpIHtcbiAgICBwcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcblxuICAgIC8vIGZpZWxkcyBub3QgcmVxdWVzdGVkIGJ5IGNsaWVudCAoZXhjbHVkZWQpLFxuICAgIC8vIGJ1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwZXJtcz8ucHJvdGVjdGVkRmllbGRzPy50ZW1wb3JhcnlLZXlzPy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG4gIH1cblxuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5LmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcyB8fCBpc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdTZXRPbkluc2VydCc6XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5hbW91bnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IFtdO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICAgYFRoZSAke29iamVjdFtrZXldLl9fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtQXV0aERhdGEgPSAoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkgPT4ge1xuICBpZiAob2JqZWN0LmF1dGhEYXRhICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIE9iamVjdC5rZXlzKG9iamVjdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBvYmplY3QuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gYF9hdXRoX2RhdGFfJHtwcm92aWRlcn1gO1xuICAgICAgaWYgKHByb3ZpZGVyRGF0YSA9PSBudWxsKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fb3A6ICdEZWxldGUnLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSBwcm92aWRlckRhdGE7XG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSA9IHsgdHlwZTogJ09iamVjdCcgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICB9XG59O1xuLy8gVHJhbnNmb3JtcyBhIERhdGFiYXNlIGZvcm1hdCBBQ0wgdG8gYSBSRVNUIEFQSSBmb3JtYXQgQUNMXG5jb25zdCB1bnRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IF9ycGVybSwgX3dwZXJtLCAuLi5vdXRwdXQgfSkgPT4ge1xuICBpZiAoX3JwZXJtIHx8IF93cGVybSkge1xuICAgIG91dHB1dC5BQ0wgPSB7fTtcblxuICAgIChfcnBlcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgcmVhZDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3JlYWQnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAoX3dwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHdyaXRlOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsnd3JpdGUnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG91dHB1dDtcbn07XG5cbi8qKlxuICogV2hlbiBxdWVyeWluZywgdGhlIGZpZWxkTmFtZSBtYXkgYmUgY29tcG91bmQsIGV4dHJhY3QgdGhlIHJvb3QgZmllbGROYW1lXG4gKiAgICAgYHRlbXBlcmF0dXJlLmNlbHNpdXNgIGJlY29tZXMgYHRlbXBlcmF0dXJlYFxuICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkTmFtZSB0aGF0IG1heSBiZSBhIGNvbXBvdW5kIGZpZWxkIG5hbWVcbiAqIEByZXR1cm5zIHtzdHJpbmd9IHRoZSByb290IG5hbWUgb2YgdGhlIGZpZWxkXG4gKi9cbmNvbnN0IGdldFJvb3RGaWVsZE5hbWUgPSAoZmllbGROYW1lOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG59O1xuXG5jb25zdCByZWxhdGlvblNjaGVtYSA9IHtcbiAgZmllbGRzOiB7IHJlbGF0ZWRJZDogeyB0eXBlOiAnU3RyaW5nJyB9LCBvd25pbmdJZDogeyB0eXBlOiAnU3RyaW5nJyB9IH0sXG59O1xuXG5jb25zdCBjb252ZXJ0RW1haWxUb0xvd2VyY2FzZSA9IChvYmplY3QsIGNsYXNzTmFtZSwgb3B0aW9ucykgPT4ge1xuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInICYmIG9wdGlvbnMuY29udmVydEVtYWlsVG9Mb3dlcmNhc2UpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdFsnZW1haWwnXSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG9iamVjdFsnZW1haWwnXSA9IG9iamVjdFsnZW1haWwnXS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmNvbnZlcnRVc2VybmFtZVRvTG93ZXJjYXNlKSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3RbJ3VzZXJuYW1lJ10gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvYmplY3RbJ3VzZXJuYW1lJ10gPSBvYmplY3RbJ3VzZXJuYW1lJ10udG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gIH1cbn07XG5cbmNsYXNzIERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG4gIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgaWRlbXBvdGVuY3lPcHRpb25zOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucyA9IHRoaXMub3B0aW9ucy5pZGVtcG90ZW5jeU9wdGlvbnMgfHwge307XG4gICAgLy8gUHJldmVudCBtdXRhYmxlIHRoaXMuc2NoZW1hLCBvdGhlcndpc2Ugb25lIHJlcXVlc3QgY291bGQgdXNlXG4gICAgLy8gbXVsdGlwbGUgc2NoZW1hcywgc28gaW5zdGVhZCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25QZW5kaW5nID0gZmFsc2U7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgJ2ludmFsaWQgY2xhc3NOYW1lOiAnICsgY2xhc3NOYW1lKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKHRoaXMuYWRhcHRlciwgb3B0aW9ucywgdGhpcy5vcHRpb25zLmFwcElkKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zLFxuICAgIG1haW50ZW5hbmNlOiBib29sZWFuXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSwgbWFpbnRlbmFuY2UpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHRyeSB7XG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyh0aGlzLm9wdGlvbnMsIHVwZGF0ZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpKTtcbiAgICB9XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBzdHJ1Y3R1cmVkQ2xvbmUodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCwgdXBkYXRlKTtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UsIHRydWUsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dICYmXG4gICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkgPT4gaW5uZXJLZXkuaW5jbHVkZXMoJyQnKSB8fCBpbm5lcktleS5pbmNsdWRlcygnLicpXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSB0cmFuc2Zvcm1PYmplY3RBQ0wodXBkYXRlKTtcbiAgICAgICAgICAgICAgY29udmVydEVtYWlsVG9Mb3dlcmNhc2UodXBkYXRlLCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgICAgICAgIGNvbnZlcnRVc2VybmFtZVRvTG93ZXJjYXNlKHVwZGF0ZSwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHsgcmVhZFByZWZlcmVuY2U6ICdwcmltYXJ5JyB9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UsIGZhbHNlLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0cnkge1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5vcHRpb25zLCBvYmplY3QpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgfVxuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcblxuICAgIGNvbnZlcnRFbWFpbFRvTG93ZXJjYXNlKG9iamVjdCwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgIGNvbnZlcnRVc2VybmFtZVRvTG93ZXJjYXNlKG9iamVjdCwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgbnVsbCwgb2JqZWN0KTtcblxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdjcmVhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKSlcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgICAgIGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUob2JqZWN0KTtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgU2NoZW1hQ29udHJvbGxlci5jb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHNjaGVtYSksXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkXSAmJiBvYmplY3RbZmllbGRdLl9fb3AgJiYgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZ2V0Um9vdEZpZWxkTmFtZShmaWVsZCkpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhZGRzIGEgbWFya2VyIHRoYXQgbmV3IGZpZWxkIGlzIGJlaW5nIGFkZGluZyBkdXJpbmcgdXBkYXRlXG4gICAgICBydW5PcHRpb25zLmFkZHNGaWVsZCA9IHRydWU7XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJ1bk9wdGlvbnMuYWN0aW9uO1xuICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2FkZEZpZWxkJywgYWN0aW9uKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICBTY2hlbWFDYWNoZS5mb3IodGhpcy5hZGFwdGVyKS5jbGVhcigpO1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQWxsQ2xhc3NlcyhmYXN0KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLCByZWxhdGlvblNjaGVtYSwgeyBvd25pbmdJZCB9LCBmaW5kT3B0aW9ucylcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWxhdGVkSWQpKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2Ygb3duaW5nIGlkcyBnaXZlbiBzb21lIHJlbGF0ZWQgaWRzLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgb3duaW5nSWRzKGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZywgcmVsYXRlZElkczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAgeyBrZXlzOiBbJ293bmluZ0lkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0Lm93bmluZ0lkKSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJGluIG9uIHJlbGF0aW9uIGZpZWxkcywgb3JcbiAgLy8gZXF1YWwtdG8tcG9pbnRlciBjb25zdHJhaW50cyBvbiByZWxhdGlvbiBmaWVsZHMuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHNjaGVtYTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZWFyY2ggZm9yIGFuIGluLXJlbGF0aW9uIG9yIGVxdWFsLXRvLXJlbGF0aW9uXG4gICAgLy8gTWFrZSBpdCBzZXF1ZW50aWFsIGZvciBub3csIG5vdCBzdXJlIG9mIHBhcmFsbGVpemF0aW9uIHNpZGUgZWZmZWN0c1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgY29uc3Qgb3JzID0gcXVlcnlbJyRvciddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4ub3JzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRvciddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICBjb25zdCBhbmRzID0gcXVlcnlbJyRhbmQnXTtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIC4uLmFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3RoZXJLZXlzID0gT2JqZWN0LmtleXMocXVlcnkpLm1hcChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gJyRhbmQnIHx8IGtleSA9PT0gJyRvcicpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKCF0IHx8IHQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIGxldCBxdWVyaWVzOiA/KGFueVtdKSA9IG51bGw7XG4gICAgICBpZiAoXG4gICAgICAgIHF1ZXJ5W2tleV0gJiZcbiAgICAgICAgKHF1ZXJ5W2tleV1bJyRpbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5lJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldLl9fdHlwZSA9PSAnUG9pbnRlcicpXG4gICAgICApIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIGxpc3Qgb2YgcXVlcmllc1xuICAgICAgICBxdWVyaWVzID0gT2JqZWN0LmtleXMocXVlcnlba2V5XSkubWFwKGNvbnN0cmFpbnRLZXkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmluJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJG5pbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5lJykge1xuICAgICAgICAgICAgaXNOZWdhdGlvbiA9IHRydWU7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV1bJyRuZSddLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNOZWdhdGlvbixcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzID0gW3sgaXNOZWdhdGlvbjogZmFsc2UsIHJlbGF0ZWRJZHM6IFtdIH1dO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGN1cnJlbnQgcXVlcnlLZXkgYXMgd2UgZG9uLHQgbmVlZCBpdCBhbnltb3JlXG4gICAgICBkZWxldGUgcXVlcnlba2V5XTtcbiAgICAgIC8vIGV4ZWN1dGUgZWFjaCBxdWVyeSBpbmRlcGVuZGVudGx5IHRvIGJ1aWxkIHRoZSBsaXN0IG9mXG4gICAgICAvLyAkaW4gLyAkbmluXG4gICAgICBjb25zdCBwcm9taXNlcyA9IHF1ZXJpZXMubWFwKHEgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBpZiAocS5pc05lZ2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLmFkZE5vdEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFsuLi5wcm9taXNlcywgLi4ub3RoZXJLZXlzXSkudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkcmVsYXRlZFRvXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHF1ZXJ5T3B0aW9uczogYW55LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdLFxuICAgIGlzTWFzdGVyOiBib29sZWFuID0gZmFsc2UsXG4gICAgc2NoZW1hQ29udHJvbGxlcjogP1NjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgYVF1ZXJ5LFxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgYVF1ZXJ5LFxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KHF1ZXJ5Wyckbm9yJ10pKSB7XG4gICAgICAvLyBHdWFyZCB3aXRoIEFycmF5LmlzQXJyYXkgKHVubGlrZSB0aGUgbGVnYWN5ICRvci8kYW5kIGNoZWNrcyBhYm92ZSkgc28gYVxuICAgICAgLy8gbWFsZm9ybWVkIG5vbi1hcnJheSAkbm9yIHN0aWxsIGZhbGxzIHRocm91Z2ggdG8gdmFsaWRhdGVRdWVyeSBhbmQgeWllbGRzXG4gICAgICAvLyB0aGUgZXhpc3RpbmcgSU5WQUxJRF9RVUVSWSBlcnJvciBpbnN0ZWFkIG9mIHRocm93aW5nIGhlcmUuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckbm9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgYVF1ZXJ5LFxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLmF1dGhvcml6ZVJlbGF0ZWRUb1F1ZXJ5KHJlbGF0ZWRUbywgYXV0aCwgYWNsR3JvdXAsIGlzTWFzdGVyLCBzY2hlbWFDb250cm9sbGVyKVxuICAgICAgICAudGhlbihjYW5SZWFkT3duaW5nT2JqZWN0ID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICBpZiAoIWNhblJlYWRPd25pbmdPYmplY3QpIHtcbiAgICAgICAgICAgIC8vIFRoZSBjYWxsZXIgaXMgbm90IGFsbG93ZWQgdG8gcmVhZCB0aGUgb3duaW5nIG9iamVjdCwgc28gdGhlXG4gICAgICAgICAgICAvLyByZWxhdGlvbiBtdXN0IG5vdCBkaXNjbG9zZSBhbnkgbGlua2VkIG9iamVjdHMgKGFuZCBtdXN0IG5vdCBhY3RcbiAgICAgICAgICAgIC8vIGFzIGEgbWVtYmVyc2hpcCBvcmFjbGUgZm9yIGEga25vd24gcmVsYXRlZCBpZCkuXG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKFtdLCBxdWVyeSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICkudGhlbihpZHMgPT4ge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICAvLyBBdXRob3JpemVzIGEgYCRyZWxhdGVkVG9gIHJlbGF0aW9uIHF1ZXJ5IGFnYWluc3QgdGhlIG93bmluZyBvYmplY3QgYmVmb3JlXG4gIC8vIGl0cyBqb2luIHRhYmxlIGlzIHJlYWQgYnkgYHJlbGF0ZWRJZHNgLiBXaXRob3V0IHRoaXMgY2hlY2ssIGAkcmVsYXRlZFRvYFxuICAvLyBieXBhc3NlcyBib3RoIGBwcm90ZWN0ZWRGaWVsZHNgIGFuZCB0aGUgb3duaW5nIG9iamVjdCdzIEFDTC9DTFAsIGJlY2F1c2VcbiAgLy8gdGhlIGRvd25zdHJlYW0gcHJvdGVjdGVkLWZpZWxkIGFuZCBBQ0wgZmlsdGVycyBvbmx5IGFwcGx5IHRvIHRoZSBxdWVyaWVkXG4gIC8vICh0YXJnZXQpIGNsYXNzLCBuZXZlciB0byB0aGUgb3duaW5nIGNsYXNzIHJlZmVyZW5jZWQgYnkgYCRyZWxhdGVkVG9gLlxuICAvL1xuICAvLyAtIFRocm93cyBgT1BFUkFUSU9OX0ZPUkJJRERFTmAgaWYgdGhlIHJlbGF0aW9uIGtleSBpcyBhIHByb3RlY3RlZCBmaWVsZCBvblxuICAvLyAgIHRoZSBvd25pbmcgY2xhc3MgZm9yIHRoZSBjYWxsZXIncyBhdXRoIGNvbnRleHQgKG1pcnJvcnMgdGhlIHByb3RlY3RlZFxuICAvLyAgIFdIRVJFLWZpZWxkIGRlbmlhbCBpbiBgUmVzdFF1ZXJ5LmRlbnlQcm90ZWN0ZWRGaWVsZHNgKS5cbiAgLy8gLSBSZXNvbHZlcyB0byBgdHJ1ZWAgaWYgdGhlIGNhbGxlciBtYXkgcmVhZCB0aGUgb3duaW5nIG9iamVjdCAoc28gdGhlIGpvaW5cbiAgLy8gICB0YWJsZSByZWFkIG1heSBwcm9jZWVkKSwgb3IgYGZhbHNlYCBvdGhlcndpc2UgKHNvIHRoZSByZWxhdGlvbiB5aWVsZHMgbm9cbiAgLy8gICByZXN1bHRzIGFuZCBjYW5ub3QgYmUgdXNlZCBhcyBhIG1lbWJlcnNoaXAgb3JhY2xlKS5cbiAgLy9cbiAgLy8gTWFzdGVyIGFuZCBtYWludGVuYW5jZSByZXF1ZXN0cyBieXBhc3MgYm90aCBjaGVja3MgYnkgZGVzaWduLlxuICBhdXRob3JpemVSZWxhdGVkVG9RdWVyeShcbiAgICByZWxhdGVkVG86IGFueSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBpc01hc3RlcjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6ID9TY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICBjb25zdCBvd25pbmdDbGFzc05hbWUgPSByZWxhdGVkVG8gJiYgcmVsYXRlZFRvLm9iamVjdCAmJiByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZTtcbiAgICBjb25zdCBvd25pbmdJZCA9IHJlbGF0ZWRUbyAmJiByZWxhdGVkVG8ub2JqZWN0ICYmIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQ7XG4gICAgY29uc3QgcmVsYXRpb25LZXkgPSByZWxhdGVkVG8gJiYgcmVsYXRlZFRvLmtleTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQoc2NoZW1hQ29udHJvbGxlcikudGhlbihsb2FkZWRTY2hlbWEgPT4ge1xuICAgICAgLy8gMS4gVGhlIHJlbGF0aW9uIGtleSBtdXN0IG5vdCBiZSBhIHByb3RlY3RlZCBmaWVsZCBvbiB0aGUgb3duaW5nIGNsYXNzLlxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICAgICAgdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMobG9hZGVkU2NoZW1hLCBvd25pbmdDbGFzc05hbWUsIHt9LCBhY2xHcm91cCwgYXV0aCkgfHwgW107XG4gICAgICBjb25zdCByb290RmllbGQgPSB0eXBlb2YgcmVsYXRpb25LZXkgPT09ICdzdHJpbmcnID8gcmVsYXRpb25LZXkuc3BsaXQoJy4nKVswXSA6IHJlbGF0aW9uS2V5O1xuICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyhyZWxhdGlvbktleSkgfHwgcHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHJvb3RGaWVsZCkpIHtcbiAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICBgVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIHF1ZXJ5ICR7cmVsYXRpb25LZXl9IG9uIGNsYXNzICR7b3duaW5nQ2xhc3NOYW1lfWAsXG4gICAgICAgICAgdGhpcy5vcHRpb25zXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyAyLiBUaGUgY2FsbGVyIG11c3QgYmUgYWJsZSB0byByZWFkIHRoZSBvd25pbmcgb2JqZWN0IGl0c2VsZi4gQSByZWFkIHdpdGhcbiAgICAgIC8vICAgIHRoZSBjYWxsZXIncyBhdXRoIGNvbnRleHQgYXBwbGllcyB0aGUgb3duaW5nIGNsYXNzIENMUCwgdGhlIG9iamVjdFxuICAgICAgLy8gICAgQUNMIGFuZCBwb2ludGVyIHBlcm1pc3Npb25zLiBBbnkgXCJub3QgYXV0aG9yaXplZFwiIG9yIFwibm90IGZvdW5kXCJcbiAgICAgIC8vICAgIG91dGNvbWUgbWFwcyB0byBcImNhbm5vdCByZWFkXCIsIHNvIHRoZSByZWxhdGlvbiByZXR1cm5zIG5vIHJlc3VsdHMuXG4gICAgICByZXR1cm4gdGhpcy5maW5kKFxuICAgICAgICBvd25pbmdDbGFzc05hbWUsXG4gICAgICAgIHsgb2JqZWN0SWQ6IG93bmluZ0lkIH0sXG4gICAgICAgIHsgYWNsOiBhY2xHcm91cCwgbGltaXQ6IDEsIGtleXM6IFsnb2JqZWN0SWQnXSwgb3A6ICdnZXQnIH0sXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGxvYWRlZFNjaGVtYVxuICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IEFycmF5LmlzQXJyYXkocmVzdWx0cykgJiYgcmVzdWx0cy5sZW5ndGggPiAwKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IgJiZcbiAgICAgICAgICAgIChlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOIHx8XG4gICAgICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbaWRzRnJvbVN0cmluZywgaWRzRnJvbUVxLCBpZHNGcm9tSW4sIGlkc10uZmlsdGVyKFxuICAgICAgbGlzdCA9PiBsaXN0ICE9PSBudWxsXG4gICAgKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPSBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgICAgY29tbWVudCxcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFpbnRlbmFuY2UgPSBhdXRoLmlzTWFpbnRlbmFuY2U7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZCB8fCBpc01haW50ZW5hbmNlO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmU6IHRoaXMub3B0aW9ucy5lbmFibGVDb2xsYXRpb25DYXNlQ29tcGFyaXNvbiA/IGZhbHNlIDogY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWUuc3BsaXQoJy4nKVswXV0gJiYgZmllbGROYW1lICE9PSAnc2NvcmUnKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCBmYWxzZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgY29tbWVudFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBkaXN0aW5jdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICAgICAgICAgICAgY29tbWVudFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWludGVuYW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRldGFpbGVkTWVzc2FnZSA9XG4gICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIGVycm9yID09PSAnc3RyaW5nJ1xuICAgICAgICAgICAgICAgICAgICAgICAgPyBlcnJvclxuICAgICAgICAgICAgICAgICAgICAgICAgOiBlcnJvcj8ubWVzc2FnZSB8fCAnQW4gaW50ZXJuYWwgc2VydmVyIGVycm9yIG9jY3VycmVkJztcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgICAgIGRldGFpbGVkTWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMsXG4gICAgICAgICAgICAgICAgICAgICAgJ0FuIGludGVybmFsIHNlcnZlciBlcnJvciBvY2N1cnJlZCdcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgc2NoZW1hQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYUNvbnRyb2xsZXIgPSBzO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuY291bnQoY2xhc3NOYW1lLCB7IGZpZWxkczoge30gfSwgbnVsbCwgJycsIGZhbHNlKSlcbiAgICAgICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbih3YXNQYXJzZUNvbGxlY3Rpb24gPT4ge1xuICAgICAgICAgICAgaWYgKHdhc1BhcnNlQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICByZWxhdGlvbkZpZWxkTmFtZXMubWFwKG5hbWUgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIFNjaGVtYUNhY2hlLmZvcih0aGlzLmFkYXB0ZXIpLmRlbChjbGFzc05hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLnJlbG9hZERhdGEoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFRoaXMgaGVscHMgdG8gY3JlYXRlIGludGVybWVkaWF0ZSBvYmplY3RzIGZvciBzaW1wbGVyIGNvbXBhcmlzb24gb2ZcbiAgLy8ga2V5IHZhbHVlIHBhaXJzIHVzZWQgaW4gcXVlcnkgb2JqZWN0cy4gRWFjaCBrZXkgdmFsdWUgcGFpciB3aWxsIHJlcHJlc2VudGVkXG4gIC8vIGluIGEgc2ltaWxhciB3YXkgdG8ganNvblxuICBvYmplY3RUb0VudHJpZXNTdHJpbmdzKHF1ZXJ5OiBhbnkpOiBBcnJheTxzdHJpbmc+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVlcnkpLm1hcChhID0+IGEubWFwKHMgPT4gSlNPTi5zdHJpbmdpZnkocykpLmpvaW4oJzonKSk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBPUiBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlT3JPcGVyYXRpb24ocXVlcnk6IHsgJG9yOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJG9yKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kb3IubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBsb25nZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kb3Iuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRvci5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJG9yWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJG9yO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBBTkQgb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZUFuZE9wZXJhdGlvbihxdWVyeTogeyAkYW5kOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJGFuZCkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJGFuZC5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIHNob3J0ZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kYW5kLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRhbmQubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRhbmRbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kYW5kO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBDb25zdHJhaW50cyBxdWVyeSB1c2luZyBDTFAncyBwb2ludGVyIHBlcm1pc3Npb25zIChQUCkgaWYgYW55LlxuICAvLyAxLiBFdHJhY3QgdGhlIHVzZXIgaWQgZnJvbSBjYWxsZXIncyBBQ0xncm91cDtcbiAgLy8gMi4gRXhjdHJhY3QgYSBsaXN0IG9mIGZpZWxkIG5hbWVzIHRoYXQgYXJlIFBQIGZvciB0YXJnZXQgY29sbGVjdGlvbiBhbmQgb3BlcmF0aW9uO1xuICAvLyAzLiBDb25zdHJhaW50IHRoZSBvcmlnaW5hbCBxdWVyeSBzbyB0aGF0IGVhY2ggUFAgZmllbGQgbXVzdFxuICAvLyBwb2ludCB0byBjYWxsZXIncyBpZCAob3IgY29udGFpbiBpdCBpbiBjYXNlIG9mIFBQIGZpZWxkIGJlaW5nIGFuIGFycmF5KVxuICBhZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXVxuICApOiBhbnkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuXG4gICAgY29uc3QgdXNlckFDTCA9IGFjbEdyb3VwLmZpbHRlcihhY2wgPT4ge1xuICAgICAgcmV0dXJuIGFjbC5pbmRleE9mKCdyb2xlOicpICE9IDAgJiYgYWNsICE9ICcqJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBbXTtcblxuICAgIGlmIChwZXJtc1tvcGVyYXRpb25dICYmIHBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcykge1xuICAgICAgcGVybUZpZWxkcy5wdXNoKC4uLnBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwZXJtc1tncm91cEtleV0pIHtcbiAgICAgICAgaWYgKCFwZXJtRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBlcm1GaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcXVlcmllcyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkRGVzY3JpcHRvciA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPVxuICAgICAgICAgIGZpZWxkRGVzY3JpcHRvciAmJlxuICAgICAgICAgIHR5cGVvZiBmaWVsZERlc2NyaXB0b3IgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkRGVzY3JpcHRvciwgJ3R5cGUnKVxuICAgICAgICAgICAgPyBmaWVsZERlc2NyaXB0b3IudHlwZVxuICAgICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGxldCBxdWVyeUNsYXVzZTtcblxuICAgICAgICBpZiAoZmllbGRUeXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBzaW5nbGUgcG9pbnRlciBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciB1c2Vycy1hcnJheSBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogeyAkYWxsOiBbdXNlclBvaW50ZXJdIH0gfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdPYmplY3QnKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igb2JqZWN0IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRoaXMgbWVhbnMgdGhhdCB0aGVyZSBpcyBhIENMUCBmaWVsZCBvZiBhbiB1bmV4cGVjdGVkIHR5cGUuIFRoaXMgY29uZGl0aW9uIHNob3VsZCBub3QgaGFwcGVuLCB3aGljaCBpc1xuICAgICAgICAgIC8vIHdoeSBpcyBiZWluZyB0cmVhdGVkIGFzIGFuIGVycm9yLlxuICAgICAgICAgIHRocm93IEVycm9yKFxuICAgICAgICAgICAgYEFuIHVuZXhwZWN0ZWQgY29uZGl0aW9uIG9jY3VycmVkIHdoZW4gcmVzb2x2aW5nIHBvaW50ZXIgcGVybWlzc2lvbnM6ICR7Y2xhc3NOYW1lfSAke2tleX1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBjb25zdHJhaW50IG9uIHRoZSBrZXksIHVzZSB0aGUgJGFuZFxuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHF1ZXJ5LCBrZXkpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlQW5kT3BlcmF0aW9uKHsgJGFuZDogW3F1ZXJ5Q2xhdXNlLCBxdWVyeV0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gb3RoZXJ3aXNlIGp1c3QgYWRkIHRoZSBjb25zdGFpbnRcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCBxdWVyeUNsYXVzZSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHF1ZXJpZXMubGVuZ3RoID09PSAxID8gcXVlcmllc1swXSA6IHRoaXMucmVkdWNlT3JPcGVyYXRpb24oeyAkb3I6IHF1ZXJpZXMgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBhZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIgfCBhbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSA9IHt9LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdLFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHF1ZXJ5T3B0aW9uczogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9XG4gICk6IG51bGwgfCBzdHJpbmdbXSB7XG4gICAgY29uc3QgcGVybXMgPVxuICAgICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnNcbiAgICAgICAgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSlcbiAgICAgICAgOiBzY2hlbWE7XG4gICAgaWYgKCFwZXJtcykgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7IHJldHVybiBudWxsOyB9XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgLy8gZm9yIHF1ZXJpZXMgd2hlcmUgXCJrZXlzXCIgYXJlIHNldCBhbmQgZG8gbm90IGluY2x1ZGUgYWxsICd1c2VyRmllbGQnOntmaWVsZH0sXG4gICAgLy8gd2UgaGF2ZSB0byB0cmFuc3BhcmVudGx5IGluY2x1ZGUgaXQsIGFuZCB0aGVuIHJlbW92ZSBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudFxuICAgIC8vIEJlY2F1c2UgaWYgc3VjaCBrZXkgbm90IHByb2plY3RlZCB0aGUgcGVybWlzc2lvbiB3b24ndCBiZSBlbmZvcmNlZCBwcm9wZXJseVxuICAgIC8vIFBTIHRoaXMgaXMgY2FsbGVkIHdoZW4gJ2V4Y2x1ZGVLZXlzJyBhbHJlYWR5IHJlZHVjZWQgdG8gJ2tleXMnXG4gICAgY29uc3QgcHJlc2VydmVLZXlzID0gcXVlcnlPcHRpb25zLmtleXM7XG5cbiAgICAvLyB0aGVzZSBhcmUga2V5cyB0aGF0IG5lZWQgdG8gYmUgaW5jbHVkZWQgb25seVxuICAgIC8vIHRvIGJlIGFibGUgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzIGJ5IHBvaW50ZXJcbiAgICAvLyBhbmQgdGhlbiB1bnNldCBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudCAobGF0ZXIgaW4gIGZpbHRlclNlbnNpdGl2ZUZpZWxkcylcbiAgICBjb25zdCBzZXJ2ZXJPbmx5S2V5cyA9IFtdO1xuXG4gICAgY29uc3QgYXV0aGVudGljYXRlZCA9IGF1dGgudXNlcjtcblxuICAgIC8vIG1hcCB0byBhbGxvdyBjaGVjayB3aXRob3V0IGFycmF5IHNlYXJjaFxuICAgIGNvbnN0IHJvbGVzID0gKGF1dGgudXNlclJvbGVzIHx8IFtdKS5yZWR1Y2UoKGFjYywgcikgPT4ge1xuICAgICAgYWNjW3JdID0gcHJvdGVjdGVkRmllbGRzW3JdO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBhcnJheSBvZiBzZXRzIG9mIHByb3RlY3RlZCBmaWVsZHMuIHNlcGFyYXRlIGl0ZW0gZm9yIGVhY2ggYXBwbGljYWJsZSBjcml0ZXJpYVxuICAgIGNvbnN0IHByb3RlY3RlZEtleXNTZXRzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIHNraXAgdXNlckZpZWxkc1xuICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpIHtcbiAgICAgICAgaWYgKHByZXNlcnZlS2V5cykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoMTApO1xuICAgICAgICAgIGlmICghcHJlc2VydmVLZXlzLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAgIC8vIDEuIHB1dCBpdCB0aGVyZSB0ZW1wb3JhcmlseVxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLmtleXMgJiYgcXVlcnlPcHRpb25zLmtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgLy8gMi4gcHJlc2VydmUgaXQgZGVsZXRlIGxhdGVyXG4gICAgICAgICAgICBzZXJ2ZXJPbmx5S2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBhZGQgcHVibGljIHRpZXJcbiAgICAgIGlmIChrZXkgPT09ICcqJykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICAgIGlmIChrZXkgPT09ICdhdXRoZW50aWNhdGVkJykge1xuICAgICAgICAgIC8vIGZvciBsb2dnZWQgaW4gdXNlcnNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyb2xlc1trZXldICYmIGtleS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgICAgICAgLy8gYWRkIGFwcGxpY2FibGUgcm9sZXNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHJvbGVzW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUncyBhIHJ1bGUgZm9yIGN1cnJlbnQgdXNlcidzIGlkXG4gICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9IGF1dGgudXNlci5pZDtcbiAgICAgIGlmIChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSkge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcmVzZXJ2ZSBmaWVsZHMgdG8gYmUgcmVtb3ZlZCBiZWZvcmUgc2VuZGluZyByZXNwb25zZSB0byBjbGllbnRcbiAgICBpZiAoc2VydmVyT25seUtleXMubGVuZ3RoID4gMCkge1xuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgPSBzZXJ2ZXJPbmx5S2V5cztcbiAgICB9XG5cbiAgICBsZXQgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXNTZXRzLnJlZHVjZSgoYWNjLCBuZXh0KSA9PiB7XG4gICAgICBpZiAobmV4dCkge1xuICAgICAgICBhY2MucHVzaCguLi5uZXh0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgIHByb3RlY3RlZEtleXNTZXRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm90ZWN0ZWRLZXlzO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uIHx8IHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignVGhlcmUgaXMgYWxyZWFkeSBhbiBhY3RpdmUgdHJhbnNhY3Rpb25hbCBzZXNzaW9uJykpO1xuICAgIH1cbiAgICAvLyBSZXNlcnZlIHRoZSBzZXNzaW9uIGJlZm9yZSBpdCBpcyBjcmVhdGVkLCB3aXRob3V0IHNldHRpbmcgYF90cmFuc2FjdGlvbmFsU2Vzc2lvbmAsIHdoaWNoXG4gICAgLy8gY29uY3VycmVudCB3cml0ZXMgb24gdGhpcyBjb250cm9sbGVyIHdvdWxkIG90aGVyd2lzZSB1c2VcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblBlbmRpbmcgPSB0cnVlO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkpXG4gICAgICAudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgICB9KVxuICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblBlbmRpbmcgPSBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGNvbnN0IGRhdGFiYXNlT3B0aW9ucyA9IHRoaXMub3B0aW9ucy5kYXRhYmFzZU9wdGlvbnMgfHwge307XG5cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLmNyZWF0ZUluZGV4VXNlclVzZXJuYW1lICE9PSBmYWxzZSkge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlcm5hbWVzOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMuZW5hYmxlQ29sbGF0aW9uQ2FzZUNvbXBhcmlzb24pIHtcbiAgICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyVXNlcm5hbWVDYXNlSW5zZW5zaXRpdmUgIT09IGZhbHNlKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleFVzZXJFbWFpbENhc2VJbnNlbnNpdGl2ZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyRW1haWwgIT09IGZhbHNlKSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyRW1haWxWZXJpZnlUb2tlbiAhPT0gZmFsc2UpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ19lbWFpbF92ZXJpZnlfdG9rZW4nXSwgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLCBmYWxzZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBpbmRleCBmb3IgZW1haWwgdmVyaWZpY2F0aW9uIHRva2VuOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyUGFzc3dvcmRSZXNldFRva2VuICE9PSBmYWxzZSkge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnX3BlcmlzaGFibGVfdG9rZW4nXSwgJ19wZXJpc2hhYmxlX3Rva2VuJywgZmFsc2UpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgaW5kZXggZm9yIHBhc3N3b3JkIHJlc2V0IHRva2VuOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhSb2xlTmFtZSAhPT0gZmFsc2UpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBDcmVhdGUgdW5pcXVlIGluZGV4ZXMgZm9yIGF1dGhEYXRhIHByb3ZpZGVycyB0byBwcmV2ZW50IHJhY2UgY29uZGl0aW9uc1xuICAgIC8vIGR1cmluZyBjb25jdXJyZW50IHNpZ251cHMgd2l0aCB0aGUgc2FtZSBhdXRoRGF0YVxuICAgIGlmIChcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleEF1dGhEYXRhVW5pcXVlbmVzcyAhPT0gZmFsc2UgJiZcbiAgICAgIHR5cGVvZiB0aGlzLmFkYXB0ZXIuZW5zdXJlQXV0aERhdGFVbmlxdWVuZXNzID09PSAnZnVuY3Rpb24nXG4gICAgKSB7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXJzID0gT2JqZWN0LmtleXModGhpcy5vcHRpb25zLmF1dGggfHwge30pO1xuICAgICAgaWYgKHRoaXMub3B0aW9ucy5lbmFibGVBbm9ueW1vdXNVc2VycyAhPT0gZmFsc2UpIHtcbiAgICAgICAgaWYgKCFhdXRoUHJvdmlkZXJzLmluY2x1ZGVzKCdhbm9ueW1vdXMnKSkge1xuICAgICAgICAgIGF1dGhQcm92aWRlcnMucHVzaCgnYW5vbnltb3VzJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICBhdXRoUHJvdmlkZXJzLm1hcChwcm92aWRlciA9PlxuICAgICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVBdXRoRGF0YVVuaXF1ZW5lc3MocHJvdmlkZXIpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgICAgICBgVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBhdXRoIGRhdGEgcHJvdmlkZXIgXCIke3Byb3ZpZGVyfVwiOiBgLFxuICAgICAgICAgICAgICBlcnJvclxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApXG4gICAgICApO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoXG4gICAgICAgICAgeyBbZmlyc3RLZXldOiB0cnVlLCBbbmV4dFBhdGhdOiB0cnVlIH0sXG4gICAgICAgICAga2V5d29yZC5rZXksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSA9IHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgICBuZXh0UGF0aCxcbiAgICAgIHZhbHVlW2ZpcnN0S2V5XVxuICAgICk7XG4gICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBfc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdDogYW55LCByZXN1bHQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgICBpZiAoXG4gICAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCcsICdTZXRPbkluc2VydCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICAgICkge1xuICAgICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmVkIG9uIGEga2V5cGF0aFxuICAgICAgICB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICAgICAgLy8gUmV2ZXJ0IGFycmF5IHRvIG9iamVjdCBjb252ZXJzaW9uIG9uIGRvdCBub3RhdGlvbiBmb3IgYXJyYXlzIChlLmcuIFwiZmllbGQuMC5rZXlcIilcbiAgICAgICAgaWYgKGtleS5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgICAgY29uc3QgW2ZpZWxkLCBpbmRleF0gPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgICAgICBjb25zdCBpc0FycmF5SW5kZXggPSBBcnJheS5mcm9tKGluZGV4KS5ldmVyeShjID0+IGMgPj0gJzAnICYmIGMgPD0gJzknKTtcbiAgICAgICAgICBpZiAoaXNBcnJheUluZGV4ICYmIEFycmF5LmlzQXJyYXkocmVzdWx0W2ZpZWxkXSkgJiYgIUFycmF5LmlzQXJyYXkocmVzcG9uc2VbZmllbGRdKSkge1xuICAgICAgICAgICAgcmVzcG9uc2VbZmllbGRdID0gcmVzdWx0W2ZpZWxkXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbiwgYm9vbGVhbiwgYm9vbGVhbikgPT4gdm9pZDtcbiAgc3RhdGljIGZpbHRlclNlbnNpdGl2ZURhdGE6IChib29sZWFuLCBib29sZWFuLCBhbnlbXSwgYW55LCBhbnksIGFueSwgc3RyaW5nLCBhbnlbXSwgYW55KSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xubW9kdWxlLmV4cG9ydHMuZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IGZpbHRlclNlbnNpdGl2ZURhdGE7XG4iXSwibWFwcGluZ3MiOiI7O0FBS0EsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsT0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUcsVUFBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUssTUFBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sZ0JBQUEsR0FBQUMsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFRLGVBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLG9CQUFBLEdBQUFQLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBVSx1QkFB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QUFjLENBQUMsQ0FBQzNKLE9BQU8sQ0FBQ00sR0FBRyxJQUFJO01BQ3pDLE1BQU1tVSxTQUFTLEdBQUc5SyxjQUFjLENBQUNySixHQUFHLENBQUM7TUFDckM7TUFDQSxJQUNFbVUsU0FBUyxJQUNULE9BQU9BLFNBQVMsS0FBSyxRQUFRLElBQzdCQSxTQUFTLENBQUNuUixJQUFJLElBQ2QsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUM1QixPQUFPLENBQUMrUyxTQUFTLENBQUNuUixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFDdkY7UUFDQTtRQUNBO1FBQ0EsSUFBSSxDQUFDMFEsc0JBQXNCLENBQUNRLFFBQVEsRUFBRWxVLEdBQUcsRUFBRTNCLE1BQU0sQ0FBQztRQUNsRDtRQUNBLElBQUkyQixHQUFHLENBQUNJLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtVQUNyQixNQUFNLENBQUM2SixLQUFLLEVBQUVzQixLQUFLLENBQUMsR0FBR3ZMLEdBQUcsQ0FBQzZELEtBQUssQ0FBQyxHQUFHLENBQUM7VUFDckMsTUFBTXVRLFlBQVksR0FBRzNVLEtBQUssQ0FBQzRVLElBQUksQ0FBQzlJLEtBQUssQ0FBQyxDQUFDK0ksS0FBSyxDQUFDQyxDQUFDLElBQUlBLENBQUMsSUFBSSxHQUFHLElBQUlBLENBQUMsSUFBSSxHQUFHLENBQUM7VUFDdkUsSUFBSUgsWUFBWSxJQUFJM1UsS0FBSyxDQUFDc0MsT0FBTyxDQUFDMUQsTUFBTSxDQUFDNEwsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDeEssS0FBSyxDQUFDc0MsT0FBTyxDQUFDbVMsUUFBUSxDQUFDakssS0FBSyxDQUFDLENBQUMsRUFBRTtZQUNuRmlLLFFBQVEsQ0FBQ2pLLEtBQUssQ0FBQyxHQUFHNUwsTUFBTSxDQUFDNEwsS0FBSyxDQUFDO1VBQ2pDO1FBQ0Y7TUFDRjtJQUNGLENBQUMsQ0FBQztJQUNGLE9BQU81RSxPQUFPLENBQUNHLE9BQU8sQ0FBQzBPLFFBQVEsQ0FBQztFQUNsQztBQUlGO0FBRUFNLE1BQU0sQ0FBQ0MsT0FBTyxHQUFHclEsa0JBQWtCO0FBQ25DO0FBQ0FvUSxNQUFNLENBQUNDLE9BQU8sQ0FBQ0MsY0FBYyxHQUFHOVYsYUFBYTtBQUM3QzRWLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDblUsbUJBQW1CLEdBQUdBLG1CQUFtQiIsImlnbm9yZUxpc3QiOltdfQ==