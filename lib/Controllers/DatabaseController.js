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

    // Own-property check so an inherited member name is never read as the container
    (_rperm || []).forEach(entry => {
      if (!Object.hasOwn(output.ACL, entry)) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });
    (_wperm || []).forEach(entry => {
      if (!Object.hasOwn(output.ACL, entry)) {
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
      // The owning reference and relation key must be well-formed strings. A
      // non-string objectId (e.g. a query operator such as `{$gt: ''}`) would
      // pass `authorizeRelatedToQuery` existentially against any readable owner
      // while `relatedIds` applies the operator across every owner, disclosing
      // relation membership of owning objects the caller cannot read.
      const relatedToObject = relatedTo.object;
      if (!relatedToObject || typeof relatedToObject.className !== 'string' || typeof relatedToObject.objectId !== 'string' || typeof relatedTo.key !== 'string') {
        throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Invalid $relatedTo constraint.');
      }
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

    // Only descend into an own object, never an inherited prototype member
    const child = Object.hasOwn(object, firstKey) && object[firstKey] && typeof object[firstKey] === 'object' ? object[firstKey] : {};
    object[firstKey] = this._expandResultOnKeyPath(child, nextPath, value[firstKey]);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfbG9nZ2VyIiwiX1V0aWxzIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9TY2hlbWFDYWNoZSIsIl9FcnJvciIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiQUNMIiwicmVzdWx0IiwiZW50cnkiLCJyZWFkIiwicHVzaCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5S2V5cyIsInNwZWNpYWxNYXN0ZXJRdWVyeUtleXMiLCJ2YWxpZGF0ZVF1ZXJ5IiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwidXBkYXRlIiwib3B0aW9ucyIsIl9kZXB0aCIsInJjIiwicmVxdWVzdENvbXBsZXhpdHkiLCJxdWVyeURlcHRoIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJ2YWx1ZSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwia2V5cyIsImtleSIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJpbmNsdWRlcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJpbmRleE9mIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJmaWx0ZXIiLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpc1VzZXJDbGFzcyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsImsiLCJ0ZW1wb3JhcnlLZXlzIiwiY2hhckF0IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImhhc093biIsImdldFJvb3RGaWVsZE5hbWUiLCJzcGxpdCIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJjb252ZXJ0RW1haWxUb0xvd2VyY2FzZSIsInRvTG93ZXJDYXNlIiwiY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZyIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImFwcElkIiwibG9hZFNjaGVtYUlmTmVlZGVkIiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsIm1haW50ZW5hbmNlIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJVdGlscyIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJzdHJ1Y3R1cmVkQ2xvbmUiLCJyZWxhdGlvblVwZGF0ZXMiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjb2xsZWN0UmVsYXRpb25VcGRhdGVzIiwiYWRkUG9pbnRlclBlcm1pc3Npb25zIiwiY2F0Y2giLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsInJlYWRQcmVmZXJlbmNlIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJvcmlnaW5hbE9iamVjdCIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsIlNjaGVtYUNhY2hlIiwiZm9yIiwiY2xlYXIiLCJkZWxldGVBbGxDbGFzc2VzIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsInByb21pc2VzIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJhbmRzIiwib3RoZXJLZXlzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJyZWxhdGVkVG9PYmplY3QiLCJhdXRob3JpemVSZWxhdGVkVG9RdWVyeSIsImNhblJlYWRPd25pbmdPYmplY3QiLCJvd25pbmdDbGFzc05hbWUiLCJyZWxhdGlvbktleSIsImxvYWRlZFNjaGVtYSIsImFkZFByb3RlY3RlZEZpZWxkcyIsInJvb3RGaWVsZCIsImNyZWF0ZVNhbml0aXplZEVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsImNvbW1lbnQiLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiZW5hYmxlQ29sbGF0aW9uQ2FzZUNvbXBhcmlzb24iLCJhZ2dyZWdhdGUiLCJkZXRhaWxlZE1lc3NhZ2UiLCJtZXNzYWdlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwiZGVsIiwicmVsb2FkRGF0YSIsIm9iamVjdFRvRW50cmllc1N0cmluZ3MiLCJlbnRyaWVzIiwiYSIsIkpTT04iLCJzdHJpbmdpZnkiLCJqb2luIiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJmaW5hbGx5IiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImRhdGFiYXNlT3B0aW9ucyIsImNyZWF0ZUluZGV4VXNlclVzZXJuYW1lIiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJjcmVhdGVJbmRleFVzZXJVc2VybmFtZUNhc2VJbnNlbnNpdGl2ZSIsImVuc3VyZUluZGV4IiwiY3JlYXRlSW5kZXhVc2VyRW1haWxDYXNlSW5zZW5zaXRpdmUiLCJjcmVhdGVJbmRleFVzZXJFbWFpbCIsImNyZWF0ZUluZGV4VXNlckVtYWlsVmVyaWZ5VG9rZW4iLCJjcmVhdGVJbmRleFVzZXJQYXNzd29yZFJlc2V0VG9rZW4iLCJjcmVhdGVJbmRleFJvbGVOYW1lIiwiaXNNb25nb0FkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiaXNQb3N0Z3Jlc0FkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidHRsIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsImNyZWF0ZUluZGV4QXV0aERhdGFVbmlxdWVuZXNzIiwiZW5zdXJlQXV0aERhdGFVbmlxdWVuZXNzIiwiYXV0aFByb3ZpZGVycyIsImVuYWJsZUFub255bW91c1VzZXJzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJfZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsImNoaWxkIiwicmVzcG9uc2UiLCJrZXlVcGRhdGUiLCJpc0FycmF5SW5kZXgiLCJmcm9tIiwiZXZlcnkiLCJjIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB7IGNyZWF0ZVNhbml0aXplZEVycm9yIH0gZnJvbSAnLi4vRXJyb3InO1xuXG5mdW5jdGlvbiBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3dwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll93cGVybSA9IHsgJGluOiBbbnVsbCwgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbmZ1bmN0aW9uIGFkZFJlYWRBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ19ycGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fcnBlcm0gPSB7ICRpbjogW251bGwsICcqJywgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBSRVNUIEFQSSBmb3JtYXR0ZWQgQUNMIG9iamVjdCB0byBvdXIgdHdvLWZpZWxkIG1vbmdvIGZvcm1hdC5cbmNvbnN0IHRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IEFDTCwgLi4ucmVzdWx0IH0pID0+IHtcbiAgaWYgKCFBQ0wpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmVzdWx0Ll93cGVybSA9IFtdO1xuICByZXN1bHQuX3JwZXJtID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBpbiBBQ0wpIHtcbiAgICBpZiAoQUNMW2VudHJ5XS5yZWFkKSB7XG4gICAgICByZXN1bHQuX3JwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBpZiAoQUNMW2VudHJ5XS53cml0ZSkge1xuICAgICAgcmVzdWx0Ll93cGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNwZWNpYWxRdWVyeUtleXMgPSBbJyRhbmQnLCAnJG9yJywgJyRub3InLCAnX3JwZXJtJywgJ193cGVybSddO1xuY29uc3Qgc3BlY2lhbE1hc3RlclF1ZXJ5S2V5cyA9IFtcbiAgLi4uc3BlY2lhbFF1ZXJ5S2V5cyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfdG9tYnN0b25lJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG4gICdfc2Vzc2lvbl90b2tlbicsXG5dO1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKFxuICBxdWVyeTogYW55LFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgaXNNYWludGVuYW5jZTogYm9vbGVhbixcbiAgdXBkYXRlOiBib29sZWFuLFxuICBvcHRpb25zOiA/UGFyc2VTZXJ2ZXJPcHRpb25zLFxuICBfZGVwdGg6IG51bWJlciA9IDBcbik6IHZvaWQgPT4ge1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlzTWFzdGVyID0gdHJ1ZTtcbiAgfVxuICBjb25zdCByYyA9IG9wdGlvbnM/LnJlcXVlc3RDb21wbGV4aXR5O1xuICBpZiAoIWlzTWFzdGVyICYmIHJjICYmIHJjLnF1ZXJ5RGVwdGggIT09IC0xICYmIF9kZXB0aCA+IHJjLnF1ZXJ5RGVwdGgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgYFF1ZXJ5IGNvbmRpdGlvbiBuZXN0aW5nIGRlcHRoIGV4Y2VlZHMgbWF4aW11bSBhbGxvd2VkIGRlcHRoIG9mICR7cmMucXVlcnlEZXB0aH1gXG4gICAgKTtcbiAgfVxuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSwgb3B0aW9ucywgX2RlcHRoICsgMSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUsIG9wdGlvbnMsIF9kZXB0aCArIDEpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUsIG9wdGlvbnMsIF9kZXB0aCArIDEpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzdV0rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKFxuICAgICAgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSAmJlxuICAgICAgIXNwZWNpYWxRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSAmJlxuICAgICAgIShpc01hc3RlciAmJiBzcGVjaWFsTWFzdGVyUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICBhY2xHcm91cDogYW55W10sXG4gIGF1dGg6IGFueSxcbiAgb3BlcmF0aW9uOiBhbnksXG4gIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgcHJvdGVjdGVkRmllbGRzOiBudWxsIHwgQXJyYXk8YW55PixcbiAgb2JqZWN0OiBhbnlcbikgPT4ge1xuICBsZXQgdXNlcklkID0gbnVsbDtcbiAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7IHVzZXJJZCA9IGF1dGgudXNlci5pZDsgfVxuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSkgOiB7fTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiYgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICBpZiAoaXNVc2VyQ2xhc3MpIHtcbiAgICBvYmplY3QucGFzc3dvcmQgPSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgZGVsZXRlIG9iamVjdC5zZXNzaW9uVG9rZW47XG4gIH1cblxuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy8gYnV0IHdlcmUgbmVlZGVkIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkc1xuICAgIHBlcm1zPy5wcm90ZWN0ZWRGaWVsZHM/LnRlbXBvcmFyeUtleXM/LmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkuY2hhckF0KDApID09PSAnXycpIHtcbiAgICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWlzVXNlckNsYXNzIHx8IGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSkge1xuICByZXR1cm4gYF9Kb2luOiR7a2V5fToke2NsYXNzTmFtZX1gO1xufVxuXG5jb25zdCBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlID0gb2JqZWN0ID0+IHtcbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKG9iamVjdFtrZXldICYmIG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgIHN3aXRjaCAob2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0uYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5hbW91bnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1NldE9uSW5zZXJ0JzpcbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gW107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgICBgVGhlICR7b2JqZWN0W2tleV0uX19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BdXRoRGF0YSA9IChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSA9PiB7XG4gIGlmIChvYmplY3QuYXV0aERhdGEgJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IG9iamVjdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfWA7XG4gICAgICBpZiAocHJvdmlkZXJEYXRhID09IG51bGwpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX19vcDogJ0RlbGV0ZScsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdID0geyB0eXBlOiAnT2JqZWN0JyB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIH1cbn07XG4vLyBUcmFuc2Zvcm1zIGEgRGF0YWJhc2UgZm9ybWF0IEFDTCB0byBhIFJFU1QgQVBJIGZvcm1hdCBBQ0xcbmNvbnN0IHVudHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgX3JwZXJtLCBfd3Blcm0sIC4uLm91dHB1dCB9KSA9PiB7XG4gIGlmIChfcnBlcm0gfHwgX3dwZXJtKSB7XG4gICAgb3V0cHV0LkFDTCA9IHt9O1xuXG4gICAgLy8gT3duLXByb3BlcnR5IGNoZWNrIHNvIGFuIGluaGVyaXRlZCBtZW1iZXIgbmFtZSBpcyBuZXZlciByZWFkIGFzIHRoZSBjb250YWluZXJcbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghT2JqZWN0Lmhhc093bihvdXRwdXQuQUNMLCBlbnRyeSkpIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIU9iamVjdC5oYXNPd24ob3V0cHV0LkFDTCwgZW50cnkpKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY29uc3QgY29udmVydEVtYWlsVG9Mb3dlcmNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmNvbnZlcnRFbWFpbFRvTG93ZXJjYXNlKSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3RbJ2VtYWlsJ10gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvYmplY3RbJ2VtYWlsJ10gPSBvYmplY3RbJ2VtYWlsJ10udG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IGNvbnZlcnRVc2VybmFtZVRvTG93ZXJjYXNlID0gKG9iamVjdCwgY2xhc3NOYW1lLCBvcHRpb25zKSA9PiB7XG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiYgb3B0aW9ucy5jb252ZXJ0VXNlcm5hbWVUb0xvd2VyY2FzZSkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0Wyd1c2VybmFtZSddID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqZWN0Wyd1c2VybmFtZSddID0gb2JqZWN0Wyd1c2VybmFtZSddLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuICB9XG59O1xuXG5jbGFzcyBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcbiAgc2NoZW1hUHJvbWlzZTogP1Byb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPjtcbiAgX3RyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55O1xuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuaWRlbXBvdGVuY3lPcHRpb25zIHx8IHt9O1xuICAgIC8vIFByZXZlbnQgbXV0YWJsZSB0aGlzLnNjaGVtYSwgb3RoZXJ3aXNlIG9uZSByZXF1ZXN0IGNvdWxkIHVzZVxuICAgIC8vIG11bHRpcGxlIHNjaGVtYXMsIHNvIGluc3RlYWQgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZyA9IGZhbHNlO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIG9wdGlvbnMsIHRoaXMub3B0aW9ucy5hcHBJZCk7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlLnRoZW4oXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlLFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIGxvYWRTY2hlbWFJZk5lZWRlZChcbiAgICBzY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlciA/IFByb21pc2UucmVzb2x2ZShzY2hlbWFDb250cm9sbGVyKSA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9ucyxcbiAgICBtYWludGVuYW5jZTogYm9vbGVhblxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGFjbCA9IHJ1bk9wdGlvbnMuYWNsO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXAsIHJ1bk9wdGlvbnMpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnksIG1haW50ZW5hbmNlKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0cnkge1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5vcHRpb25zLCB1cGRhdGUpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgfVxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gc3RydWN0dXJlZENsb25lKHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsIHVwZGF0ZSk7XG4gICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoYWRkc0ZpZWxkKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICRhbmQ6IFtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ2FkZEZpZWxkJyxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGZhbHNlLCB0cnVlLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIGNvbnZlcnRFbWFpbFRvTG93ZXJjYXNlKHVwZGF0ZSwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICBjb252ZXJ0VXNlcm5hbWVUb0xvd2VyY2FzZSh1cGRhdGUsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7IHJlYWRQcmVmZXJlbmNlOiAncHJpbWFyeScgfSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChtYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHVwc2VydCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kT25lQW5kVXBkYXRlKFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKHNraXBTYW5pdGl6YXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxVcGRhdGUsIHJlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29sbGVjdCBhbGwgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBhbGwgcmVsYXRpb24gdXBkYXRlcyB0byBwZXJmb3JtXG4gIC8vIFRoaXMgbXV0YXRlcyB1cGRhdGUuXG4gIGNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiA/c3RyaW5nLCB1cGRhdGU6IGFueSkge1xuICAgIHZhciBvcHMgPSBbXTtcbiAgICB2YXIgZGVsZXRlTWUgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcblxuICAgIHZhciBwcm9jZXNzID0gKG9wLCBrZXkpID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0JhdGNoJykge1xuICAgICAgICBmb3IgKHZhciB4IG9mIG9wLm9wcykge1xuICAgICAgICAgIHByb2Nlc3MoeCwga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUpIHtcbiAgICAgIHByb2Nlc3ModXBkYXRlW2tleV0sIGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIGRlbGV0ZU1lKSB7XG4gICAgICBkZWxldGUgdXBkYXRlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHM7XG4gIH1cblxuICAvLyBQcm9jZXNzZXMgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsIHVwZGF0ZXMgaGF2ZSBiZWVuIHBlcmZvcm1lZFxuICBoYW5kbGVSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiBzdHJpbmcsIHVwZGF0ZTogYW55LCBvcHM6IGFueSkge1xuICAgIHZhciBwZW5kaW5nID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG4gICAgb3BzLmZvckVhY2goKHsga2V5LCBvcCB9KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLmFkZFJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMucmVtb3ZlUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHBlbmRpbmcpO1xuICB9XG5cbiAgLy8gQWRkcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIGFkZCB3YXMgc3VjY2Vzc2Z1bC5cbiAgYWRkUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgIGRvYyxcbiAgICAgIGRvYyxcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSByZW1vdmUgd2FzXG4gIC8vIHN1Y2Nlc3NmdWwuXG4gIHJlbW92ZVJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICB2YXIgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIGRvYyxcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFdlIGRvbid0IGNhcmUgaWYgdGhleSB0cnkgdG8gZGVsZXRlIGEgbm9uLWV4aXN0ZW50IHJlbGF0aW9uLlxuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmVzIG9iamVjdHMgbWF0Y2hlcyB0aGlzIHF1ZXJ5IGZyb20gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCB3YXNcbiAgLy8gZGVsZXRlZC5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4gIC8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbiAgLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbiAgZGVzdHJveShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnZGVsZXRlJylcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICdkZWxldGUnLFxuICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBkZWxldGUgYnkgcXVlcnlcbiAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGZhbHNlLCBmYWxzZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihwYXJzZUZvcm1hdFNjaGVtYSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIFdoZW4gZGVsZXRpbmcgc2Vzc2lvbnMgd2hpbGUgY2hhbmdpbmcgcGFzc3dvcmRzLCBkb24ndCB0aHJvdyBhbiBlcnJvciBpZiB0aGV5IGRvbid0IGhhdmUgYW55IHNlc3Npb25zLlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdHJ5IHtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMub3B0aW9ucywgb2JqZWN0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBlcnJvcikpO1xuICAgIH1cbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG5cbiAgICBjb252ZXJ0RW1haWxUb0xvd2VyY2FzZShvYmplY3QsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICBjb252ZXJ0VXNlcm5hbWVUb0xvd2VyY2FzZShvYmplY3QsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG51bGwsIG9iamVjdCk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuZm9yKHRoaXMuYWRhcHRlcikuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIGNvbnN0IG9ycyA9IHF1ZXJ5Wyckb3InXTtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIC4uLm9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAuLi5hbmRzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRhbmQnXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG90aGVyS2V5cyA9IE9iamVjdC5rZXlzKHF1ZXJ5KS5tYXAoa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT09ICckYW5kJyB8fCBrZXkgPT09ICckb3InKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICghdCB8fCB0LnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9XG4gICAgICBsZXQgcXVlcmllczogPyhhbnlbXSkgPSBudWxsO1xuICAgICAgaWYgKFxuICAgICAgICBxdWVyeVtrZXldICYmXG4gICAgICAgIChxdWVyeVtrZXldWyckaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuZSddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5pbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBsaXN0IG9mIHF1ZXJpZXNcbiAgICAgICAgcXVlcmllcyA9IE9iamVjdC5rZXlzKHF1ZXJ5W2tleV0pLm1hcChjb25zdHJhaW50S2V5ID0+IHtcbiAgICAgICAgICBsZXQgcmVsYXRlZElkcztcbiAgICAgICAgICBsZXQgaXNOZWdhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50S2V5ID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV0ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJGluJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRpbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5pbicpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRuaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuZScpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldWyckbmUnXS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24sXG4gICAgICAgICAgICByZWxhdGVkSWRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcyA9IFt7IGlzTmVnYXRpb246IGZhbHNlLCByZWxhdGVkSWRzOiBbXSB9XTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBjdXJyZW50IHF1ZXJ5S2V5IGFzIHdlIGRvbix0IG5lZWQgaXQgYW55bW9yZVxuICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAvLyBleGVjdXRlIGVhY2ggcXVlcnkgaW5kZXBlbmRlbnRseSB0byBidWlsZCB0aGUgbGlzdCBvZlxuICAgICAgLy8gJGluIC8gJG5pblxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBxdWVyaWVzLm1hcChxID0+IHtcbiAgICAgICAgaWYgKCFxKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLm93bmluZ0lkcyhjbGFzc05hbWUsIGtleSwgcS5yZWxhdGVkSWRzKS50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgaWYgKHEuaXNOZWdhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5hZGROb3RJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChbLi4ucHJvbWlzZXMsIC4uLm90aGVyS2V5c10pLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBxdWVyeU9wdGlvbnM6IGFueSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBpc01hc3RlcjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6ID9TY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGFRdWVyeSxcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJGFuZCddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGFRdWVyeSxcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShxdWVyeVsnJG5vciddKSkge1xuICAgICAgLy8gR3VhcmQgd2l0aCBBcnJheS5pc0FycmF5ICh1bmxpa2UgdGhlIGxlZ2FjeSAkb3IvJGFuZCBjaGVja3MgYWJvdmUpIHNvIGFcbiAgICAgIC8vIG1hbGZvcm1lZCBub24tYXJyYXkgJG5vciBzdGlsbCBmYWxscyB0aHJvdWdoIHRvIHZhbGlkYXRlUXVlcnkgYW5kIHlpZWxkc1xuICAgICAgLy8gdGhlIGV4aXN0aW5nIElOVkFMSURfUVVFUlkgZXJyb3IgaW5zdGVhZCBvZiB0aHJvd2luZyBoZXJlLlxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG5vciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGFRdWVyeSxcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICB2YXIgcmVsYXRlZFRvID0gcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICBpZiAocmVsYXRlZFRvKSB7XG4gICAgICAvLyBUaGUgb3duaW5nIHJlZmVyZW5jZSBhbmQgcmVsYXRpb24ga2V5IG11c3QgYmUgd2VsbC1mb3JtZWQgc3RyaW5ncy4gQVxuICAgICAgLy8gbm9uLXN0cmluZyBvYmplY3RJZCAoZS5nLiBhIHF1ZXJ5IG9wZXJhdG9yIHN1Y2ggYXMgYHskZ3Q6ICcnfWApIHdvdWxkXG4gICAgICAvLyBwYXNzIGBhdXRob3JpemVSZWxhdGVkVG9RdWVyeWAgZXhpc3RlbnRpYWxseSBhZ2FpbnN0IGFueSByZWFkYWJsZSBvd25lclxuICAgICAgLy8gd2hpbGUgYHJlbGF0ZWRJZHNgIGFwcGxpZXMgdGhlIG9wZXJhdG9yIGFjcm9zcyBldmVyeSBvd25lciwgZGlzY2xvc2luZ1xuICAgICAgLy8gcmVsYXRpb24gbWVtYmVyc2hpcCBvZiBvd25pbmcgb2JqZWN0cyB0aGUgY2FsbGVyIGNhbm5vdCByZWFkLlxuICAgICAgY29uc3QgcmVsYXRlZFRvT2JqZWN0ID0gcmVsYXRlZFRvLm9iamVjdDtcbiAgICAgIGlmIChcbiAgICAgICAgIXJlbGF0ZWRUb09iamVjdCB8fFxuICAgICAgICB0eXBlb2YgcmVsYXRlZFRvT2JqZWN0LmNsYXNzTmFtZSAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgdHlwZW9mIHJlbGF0ZWRUb09iamVjdC5vYmplY3RJZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgdHlwZW9mIHJlbGF0ZWRUby5rZXkgIT09ICdzdHJpbmcnXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdJbnZhbGlkICRyZWxhdGVkVG8gY29uc3RyYWludC4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLmF1dGhvcml6ZVJlbGF0ZWRUb1F1ZXJ5KHJlbGF0ZWRUbywgYXV0aCwgYWNsR3JvdXAsIGlzTWFzdGVyLCBzY2hlbWFDb250cm9sbGVyKVxuICAgICAgICAudGhlbihjYW5SZWFkT3duaW5nT2JqZWN0ID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICBpZiAoIWNhblJlYWRPd25pbmdPYmplY3QpIHtcbiAgICAgICAgICAgIC8vIFRoZSBjYWxsZXIgaXMgbm90IGFsbG93ZWQgdG8gcmVhZCB0aGUgb3duaW5nIG9iamVjdCwgc28gdGhlXG4gICAgICAgICAgICAvLyByZWxhdGlvbiBtdXN0IG5vdCBkaXNjbG9zZSBhbnkgbGlua2VkIG9iamVjdHMgKGFuZCBtdXN0IG5vdCBhY3RcbiAgICAgICAgICAgIC8vIGFzIGEgbWVtYmVyc2hpcCBvcmFjbGUgZm9yIGEga25vd24gcmVsYXRlZCBpZCkuXG4gICAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKFtdLCBxdWVyeSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICkudGhlbihpZHMgPT4ge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICAvLyBBdXRob3JpemVzIGEgYCRyZWxhdGVkVG9gIHJlbGF0aW9uIHF1ZXJ5IGFnYWluc3QgdGhlIG93bmluZyBvYmplY3QgYmVmb3JlXG4gIC8vIGl0cyBqb2luIHRhYmxlIGlzIHJlYWQgYnkgYHJlbGF0ZWRJZHNgLiBXaXRob3V0IHRoaXMgY2hlY2ssIGAkcmVsYXRlZFRvYFxuICAvLyBieXBhc3NlcyBib3RoIGBwcm90ZWN0ZWRGaWVsZHNgIGFuZCB0aGUgb3duaW5nIG9iamVjdCdzIEFDTC9DTFAsIGJlY2F1c2VcbiAgLy8gdGhlIGRvd25zdHJlYW0gcHJvdGVjdGVkLWZpZWxkIGFuZCBBQ0wgZmlsdGVycyBvbmx5IGFwcGx5IHRvIHRoZSBxdWVyaWVkXG4gIC8vICh0YXJnZXQpIGNsYXNzLCBuZXZlciB0byB0aGUgb3duaW5nIGNsYXNzIHJlZmVyZW5jZWQgYnkgYCRyZWxhdGVkVG9gLlxuICAvL1xuICAvLyAtIFRocm93cyBgT1BFUkFUSU9OX0ZPUkJJRERFTmAgaWYgdGhlIHJlbGF0aW9uIGtleSBpcyBhIHByb3RlY3RlZCBmaWVsZCBvblxuICAvLyAgIHRoZSBvd25pbmcgY2xhc3MgZm9yIHRoZSBjYWxsZXIncyBhdXRoIGNvbnRleHQgKG1pcnJvcnMgdGhlIHByb3RlY3RlZFxuICAvLyAgIFdIRVJFLWZpZWxkIGRlbmlhbCBpbiBgUmVzdFF1ZXJ5LmRlbnlQcm90ZWN0ZWRGaWVsZHNgKS5cbiAgLy8gLSBSZXNvbHZlcyB0byBgdHJ1ZWAgaWYgdGhlIGNhbGxlciBtYXkgcmVhZCB0aGUgb3duaW5nIG9iamVjdCAoc28gdGhlIGpvaW5cbiAgLy8gICB0YWJsZSByZWFkIG1heSBwcm9jZWVkKSwgb3IgYGZhbHNlYCBvdGhlcndpc2UgKHNvIHRoZSByZWxhdGlvbiB5aWVsZHMgbm9cbiAgLy8gICByZXN1bHRzIGFuZCBjYW5ub3QgYmUgdXNlZCBhcyBhIG1lbWJlcnNoaXAgb3JhY2xlKS5cbiAgLy9cbiAgLy8gTWFzdGVyIGFuZCBtYWludGVuYW5jZSByZXF1ZXN0cyBieXBhc3MgYm90aCBjaGVja3MgYnkgZGVzaWduLlxuICBhdXRob3JpemVSZWxhdGVkVG9RdWVyeShcbiAgICByZWxhdGVkVG86IGFueSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBpc01hc3RlcjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6ID9TY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICBjb25zdCBvd25pbmdDbGFzc05hbWUgPSByZWxhdGVkVG8gJiYgcmVsYXRlZFRvLm9iamVjdCAmJiByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZTtcbiAgICBjb25zdCBvd25pbmdJZCA9IHJlbGF0ZWRUbyAmJiByZWxhdGVkVG8ub2JqZWN0ICYmIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQ7XG4gICAgY29uc3QgcmVsYXRpb25LZXkgPSByZWxhdGVkVG8gJiYgcmVsYXRlZFRvLmtleTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQoc2NoZW1hQ29udHJvbGxlcikudGhlbihsb2FkZWRTY2hlbWEgPT4ge1xuICAgICAgLy8gMS4gVGhlIHJlbGF0aW9uIGtleSBtdXN0IG5vdCBiZSBhIHByb3RlY3RlZCBmaWVsZCBvbiB0aGUgb3duaW5nIGNsYXNzLlxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICAgICAgdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMobG9hZGVkU2NoZW1hLCBvd25pbmdDbGFzc05hbWUsIHt9LCBhY2xHcm91cCwgYXV0aCkgfHwgW107XG4gICAgICBjb25zdCByb290RmllbGQgPSB0eXBlb2YgcmVsYXRpb25LZXkgPT09ICdzdHJpbmcnID8gcmVsYXRpb25LZXkuc3BsaXQoJy4nKVswXSA6IHJlbGF0aW9uS2V5O1xuICAgICAgaWYgKHByb3RlY3RlZEZpZWxkcy5pbmNsdWRlcyhyZWxhdGlvbktleSkgfHwgcHJvdGVjdGVkRmllbGRzLmluY2x1ZGVzKHJvb3RGaWVsZCkpIHtcbiAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICBgVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIHF1ZXJ5ICR7cmVsYXRpb25LZXl9IG9uIGNsYXNzICR7b3duaW5nQ2xhc3NOYW1lfWAsXG4gICAgICAgICAgdGhpcy5vcHRpb25zXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyAyLiBUaGUgY2FsbGVyIG11c3QgYmUgYWJsZSB0byByZWFkIHRoZSBvd25pbmcgb2JqZWN0IGl0c2VsZi4gQSByZWFkIHdpdGhcbiAgICAgIC8vICAgIHRoZSBjYWxsZXIncyBhdXRoIGNvbnRleHQgYXBwbGllcyB0aGUgb3duaW5nIGNsYXNzIENMUCwgdGhlIG9iamVjdFxuICAgICAgLy8gICAgQUNMIGFuZCBwb2ludGVyIHBlcm1pc3Npb25zLiBBbnkgXCJub3QgYXV0aG9yaXplZFwiIG9yIFwibm90IGZvdW5kXCJcbiAgICAgIC8vICAgIG91dGNvbWUgbWFwcyB0byBcImNhbm5vdCByZWFkXCIsIHNvIHRoZSByZWxhdGlvbiByZXR1cm5zIG5vIHJlc3VsdHMuXG4gICAgICByZXR1cm4gdGhpcy5maW5kKFxuICAgICAgICBvd25pbmdDbGFzc05hbWUsXG4gICAgICAgIHsgb2JqZWN0SWQ6IG93bmluZ0lkIH0sXG4gICAgICAgIHsgYWNsOiBhY2xHcm91cCwgbGltaXQ6IDEsIGtleXM6IFsnb2JqZWN0SWQnXSwgb3A6ICdnZXQnIH0sXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGxvYWRlZFNjaGVtYVxuICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IEFycmF5LmlzQXJyYXkocmVzdWx0cykgJiYgcmVzdWx0cy5sZW5ndGggPiAwKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IgJiZcbiAgICAgICAgICAgIChlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOIHx8XG4gICAgICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbaWRzRnJvbVN0cmluZywgaWRzRnJvbUVxLCBpZHNGcm9tSW4sIGlkc10uZmlsdGVyKFxuICAgICAgbGlzdCA9PiBsaXN0ICE9PSBudWxsXG4gICAgKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPSBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgICAgY29tbWVudCxcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFpbnRlbmFuY2UgPSBhdXRoLmlzTWFpbnRlbmFuY2U7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZCB8fCBpc01haW50ZW5hbmNlO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmU6IHRoaXMub3B0aW9ucy5lbmFibGVDb2xsYXRpb25DYXNlQ29tcGFyaXNvbiA/IGZhbHNlIDogY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWUuc3BsaXQoJy4nKVswXV0gJiYgZmllbGROYW1lICE9PSAnc2NvcmUnKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zLFxuICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCBmYWxzZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgY29tbWVudFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBkaXN0aW5jdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICAgICAgICAgICAgY29tbWVudFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWludGVuYW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRldGFpbGVkTWVzc2FnZSA9XG4gICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIGVycm9yID09PSAnc3RyaW5nJ1xuICAgICAgICAgICAgICAgICAgICAgICAgPyBlcnJvclxuICAgICAgICAgICAgICAgICAgICAgICAgOiBlcnJvcj8ubWVzc2FnZSB8fCAnQW4gaW50ZXJuYWwgc2VydmVyIGVycm9yIG9jY3VycmVkJztcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgICAgIGRldGFpbGVkTWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMsXG4gICAgICAgICAgICAgICAgICAgICAgJ0FuIGludGVybmFsIHNlcnZlciBlcnJvciBvY2N1cnJlZCdcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgc2NoZW1hQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYUNvbnRyb2xsZXIgPSBzO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuY291bnQoY2xhc3NOYW1lLCB7IGZpZWxkczoge30gfSwgbnVsbCwgJycsIGZhbHNlKSlcbiAgICAgICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbih3YXNQYXJzZUNvbGxlY3Rpb24gPT4ge1xuICAgICAgICAgICAgaWYgKHdhc1BhcnNlQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICByZWxhdGlvbkZpZWxkTmFtZXMubWFwKG5hbWUgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIFNjaGVtYUNhY2hlLmZvcih0aGlzLmFkYXB0ZXIpLmRlbChjbGFzc05hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLnJlbG9hZERhdGEoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFRoaXMgaGVscHMgdG8gY3JlYXRlIGludGVybWVkaWF0ZSBvYmplY3RzIGZvciBzaW1wbGVyIGNvbXBhcmlzb24gb2ZcbiAgLy8ga2V5IHZhbHVlIHBhaXJzIHVzZWQgaW4gcXVlcnkgb2JqZWN0cy4gRWFjaCBrZXkgdmFsdWUgcGFpciB3aWxsIHJlcHJlc2VudGVkXG4gIC8vIGluIGEgc2ltaWxhciB3YXkgdG8ganNvblxuICBvYmplY3RUb0VudHJpZXNTdHJpbmdzKHF1ZXJ5OiBhbnkpOiBBcnJheTxzdHJpbmc+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVlcnkpLm1hcChhID0+IGEubWFwKHMgPT4gSlNPTi5zdHJpbmdpZnkocykpLmpvaW4oJzonKSk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBPUiBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlT3JPcGVyYXRpb24ocXVlcnk6IHsgJG9yOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJG9yKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kb3IubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBsb25nZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kb3Iuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRvci5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJG9yWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJG9yO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBBTkQgb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZUFuZE9wZXJhdGlvbihxdWVyeTogeyAkYW5kOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJGFuZCkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJGFuZC5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIHNob3J0ZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kYW5kLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRhbmQubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRhbmRbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kYW5kO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBDb25zdHJhaW50cyBxdWVyeSB1c2luZyBDTFAncyBwb2ludGVyIHBlcm1pc3Npb25zIChQUCkgaWYgYW55LlxuICAvLyAxLiBFdHJhY3QgdGhlIHVzZXIgaWQgZnJvbSBjYWxsZXIncyBBQ0xncm91cDtcbiAgLy8gMi4gRXhjdHJhY3QgYSBsaXN0IG9mIGZpZWxkIG5hbWVzIHRoYXQgYXJlIFBQIGZvciB0YXJnZXQgY29sbGVjdGlvbiBhbmQgb3BlcmF0aW9uO1xuICAvLyAzLiBDb25zdHJhaW50IHRoZSBvcmlnaW5hbCBxdWVyeSBzbyB0aGF0IGVhY2ggUFAgZmllbGQgbXVzdFxuICAvLyBwb2ludCB0byBjYWxsZXIncyBpZCAob3IgY29udGFpbiBpdCBpbiBjYXNlIG9mIFBQIGZpZWxkIGJlaW5nIGFuIGFycmF5KVxuICBhZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXVxuICApOiBhbnkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuXG4gICAgY29uc3QgdXNlckFDTCA9IGFjbEdyb3VwLmZpbHRlcihhY2wgPT4ge1xuICAgICAgcmV0dXJuIGFjbC5pbmRleE9mKCdyb2xlOicpICE9IDAgJiYgYWNsICE9ICcqJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBbXTtcblxuICAgIGlmIChwZXJtc1tvcGVyYXRpb25dICYmIHBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcykge1xuICAgICAgcGVybUZpZWxkcy5wdXNoKC4uLnBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwZXJtc1tncm91cEtleV0pIHtcbiAgICAgICAgaWYgKCFwZXJtRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBlcm1GaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcXVlcmllcyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkRGVzY3JpcHRvciA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPVxuICAgICAgICAgIGZpZWxkRGVzY3JpcHRvciAmJlxuICAgICAgICAgIHR5cGVvZiBmaWVsZERlc2NyaXB0b3IgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkRGVzY3JpcHRvciwgJ3R5cGUnKVxuICAgICAgICAgICAgPyBmaWVsZERlc2NyaXB0b3IudHlwZVxuICAgICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGxldCBxdWVyeUNsYXVzZTtcblxuICAgICAgICBpZiAoZmllbGRUeXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBzaW5nbGUgcG9pbnRlciBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciB1c2Vycy1hcnJheSBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogeyAkYWxsOiBbdXNlclBvaW50ZXJdIH0gfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdPYmplY3QnKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igb2JqZWN0IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRoaXMgbWVhbnMgdGhhdCB0aGVyZSBpcyBhIENMUCBmaWVsZCBvZiBhbiB1bmV4cGVjdGVkIHR5cGUuIFRoaXMgY29uZGl0aW9uIHNob3VsZCBub3QgaGFwcGVuLCB3aGljaCBpc1xuICAgICAgICAgIC8vIHdoeSBpcyBiZWluZyB0cmVhdGVkIGFzIGFuIGVycm9yLlxuICAgICAgICAgIHRocm93IEVycm9yKFxuICAgICAgICAgICAgYEFuIHVuZXhwZWN0ZWQgY29uZGl0aW9uIG9jY3VycmVkIHdoZW4gcmVzb2x2aW5nIHBvaW50ZXIgcGVybWlzc2lvbnM6ICR7Y2xhc3NOYW1lfSAke2tleX1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBjb25zdHJhaW50IG9uIHRoZSBrZXksIHVzZSB0aGUgJGFuZFxuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHF1ZXJ5LCBrZXkpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlQW5kT3BlcmF0aW9uKHsgJGFuZDogW3F1ZXJ5Q2xhdXNlLCBxdWVyeV0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gb3RoZXJ3aXNlIGp1c3QgYWRkIHRoZSBjb25zdGFpbnRcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCBxdWVyeUNsYXVzZSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHF1ZXJpZXMubGVuZ3RoID09PSAxID8gcXVlcmllc1swXSA6IHRoaXMucmVkdWNlT3JPcGVyYXRpb24oeyAkb3I6IHF1ZXJpZXMgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBhZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIgfCBhbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSA9IHt9LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdLFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHF1ZXJ5T3B0aW9uczogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9XG4gICk6IG51bGwgfCBzdHJpbmdbXSB7XG4gICAgY29uc3QgcGVybXMgPVxuICAgICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnNcbiAgICAgICAgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSlcbiAgICAgICAgOiBzY2hlbWE7XG4gICAgaWYgKCFwZXJtcykgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7IHJldHVybiBudWxsOyB9XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgLy8gZm9yIHF1ZXJpZXMgd2hlcmUgXCJrZXlzXCIgYXJlIHNldCBhbmQgZG8gbm90IGluY2x1ZGUgYWxsICd1c2VyRmllbGQnOntmaWVsZH0sXG4gICAgLy8gd2UgaGF2ZSB0byB0cmFuc3BhcmVudGx5IGluY2x1ZGUgaXQsIGFuZCB0aGVuIHJlbW92ZSBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudFxuICAgIC8vIEJlY2F1c2UgaWYgc3VjaCBrZXkgbm90IHByb2plY3RlZCB0aGUgcGVybWlzc2lvbiB3b24ndCBiZSBlbmZvcmNlZCBwcm9wZXJseVxuICAgIC8vIFBTIHRoaXMgaXMgY2FsbGVkIHdoZW4gJ2V4Y2x1ZGVLZXlzJyBhbHJlYWR5IHJlZHVjZWQgdG8gJ2tleXMnXG4gICAgY29uc3QgcHJlc2VydmVLZXlzID0gcXVlcnlPcHRpb25zLmtleXM7XG5cbiAgICAvLyB0aGVzZSBhcmUga2V5cyB0aGF0IG5lZWQgdG8gYmUgaW5jbHVkZWQgb25seVxuICAgIC8vIHRvIGJlIGFibGUgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzIGJ5IHBvaW50ZXJcbiAgICAvLyBhbmQgdGhlbiB1bnNldCBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudCAobGF0ZXIgaW4gIGZpbHRlclNlbnNpdGl2ZUZpZWxkcylcbiAgICBjb25zdCBzZXJ2ZXJPbmx5S2V5cyA9IFtdO1xuXG4gICAgY29uc3QgYXV0aGVudGljYXRlZCA9IGF1dGgudXNlcjtcblxuICAgIC8vIG1hcCB0byBhbGxvdyBjaGVjayB3aXRob3V0IGFycmF5IHNlYXJjaFxuICAgIGNvbnN0IHJvbGVzID0gKGF1dGgudXNlclJvbGVzIHx8IFtdKS5yZWR1Y2UoKGFjYywgcikgPT4ge1xuICAgICAgYWNjW3JdID0gcHJvdGVjdGVkRmllbGRzW3JdO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBhcnJheSBvZiBzZXRzIG9mIHByb3RlY3RlZCBmaWVsZHMuIHNlcGFyYXRlIGl0ZW0gZm9yIGVhY2ggYXBwbGljYWJsZSBjcml0ZXJpYVxuICAgIGNvbnN0IHByb3RlY3RlZEtleXNTZXRzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIHNraXAgdXNlckZpZWxkc1xuICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpIHtcbiAgICAgICAgaWYgKHByZXNlcnZlS2V5cykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoMTApO1xuICAgICAgICAgIGlmICghcHJlc2VydmVLZXlzLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAgIC8vIDEuIHB1dCBpdCB0aGVyZSB0ZW1wb3JhcmlseVxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLmtleXMgJiYgcXVlcnlPcHRpb25zLmtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgLy8gMi4gcHJlc2VydmUgaXQgZGVsZXRlIGxhdGVyXG4gICAgICAgICAgICBzZXJ2ZXJPbmx5S2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBhZGQgcHVibGljIHRpZXJcbiAgICAgIGlmIChrZXkgPT09ICcqJykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICAgIGlmIChrZXkgPT09ICdhdXRoZW50aWNhdGVkJykge1xuICAgICAgICAgIC8vIGZvciBsb2dnZWQgaW4gdXNlcnNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyb2xlc1trZXldICYmIGtleS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgICAgICAgLy8gYWRkIGFwcGxpY2FibGUgcm9sZXNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHJvbGVzW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUncyBhIHJ1bGUgZm9yIGN1cnJlbnQgdXNlcidzIGlkXG4gICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9IGF1dGgudXNlci5pZDtcbiAgICAgIGlmIChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSkge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcmVzZXJ2ZSBmaWVsZHMgdG8gYmUgcmVtb3ZlZCBiZWZvcmUgc2VuZGluZyByZXNwb25zZSB0byBjbGllbnRcbiAgICBpZiAoc2VydmVyT25seUtleXMubGVuZ3RoID4gMCkge1xuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgPSBzZXJ2ZXJPbmx5S2V5cztcbiAgICB9XG5cbiAgICBsZXQgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXNTZXRzLnJlZHVjZSgoYWNjLCBuZXh0KSA9PiB7XG4gICAgICBpZiAobmV4dCkge1xuICAgICAgICBhY2MucHVzaCguLi5uZXh0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgIHByb3RlY3RlZEtleXNTZXRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm90ZWN0ZWRLZXlzO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uIHx8IHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uUGVuZGluZykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignVGhlcmUgaXMgYWxyZWFkeSBhbiBhY3RpdmUgdHJhbnNhY3Rpb25hbCBzZXNzaW9uJykpO1xuICAgIH1cbiAgICAvLyBSZXNlcnZlIHRoZSBzZXNzaW9uIGJlZm9yZSBpdCBpcyBjcmVhdGVkLCB3aXRob3V0IHNldHRpbmcgYF90cmFuc2FjdGlvbmFsU2Vzc2lvbmAsIHdoaWNoXG4gICAgLy8gY29uY3VycmVudCB3cml0ZXMgb24gdGhpcyBjb250cm9sbGVyIHdvdWxkIG90aGVyd2lzZSB1c2VcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblBlbmRpbmcgPSB0cnVlO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkpXG4gICAgICAudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgICB9KVxuICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblBlbmRpbmcgPSBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGNvbnN0IGRhdGFiYXNlT3B0aW9ucyA9IHRoaXMub3B0aW9ucy5kYXRhYmFzZU9wdGlvbnMgfHwge307XG5cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLmNyZWF0ZUluZGV4VXNlclVzZXJuYW1lICE9PSBmYWxzZSkge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlcm5hbWVzOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMuZW5hYmxlQ29sbGF0aW9uQ2FzZUNvbXBhcmlzb24pIHtcbiAgICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyVXNlcm5hbWVDYXNlSW5zZW5zaXRpdmUgIT09IGZhbHNlKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleFVzZXJFbWFpbENhc2VJbnNlbnNpdGl2ZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyRW1haWwgIT09IGZhbHNlKSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyRW1haWxWZXJpZnlUb2tlbiAhPT0gZmFsc2UpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ19lbWFpbF92ZXJpZnlfdG9rZW4nXSwgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLCBmYWxzZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBpbmRleCBmb3IgZW1haWwgdmVyaWZpY2F0aW9uIHRva2VuOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhVc2VyUGFzc3dvcmRSZXNldFRva2VuICE9PSBmYWxzZSkge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnX3BlcmlzaGFibGVfdG9rZW4nXSwgJ19wZXJpc2hhYmxlX3Rva2VuJywgZmFsc2UpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgaW5kZXggZm9yIHBhc3N3b3JkIHJlc2V0IHRva2VuOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuY3JlYXRlSW5kZXhSb2xlTmFtZSAhPT0gZmFsc2UpIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBDcmVhdGUgdW5pcXVlIGluZGV4ZXMgZm9yIGF1dGhEYXRhIHByb3ZpZGVycyB0byBwcmV2ZW50IHJhY2UgY29uZGl0aW9uc1xuICAgIC8vIGR1cmluZyBjb25jdXJyZW50IHNpZ251cHMgd2l0aCB0aGUgc2FtZSBhdXRoRGF0YVxuICAgIGlmIChcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5jcmVhdGVJbmRleEF1dGhEYXRhVW5pcXVlbmVzcyAhPT0gZmFsc2UgJiZcbiAgICAgIHR5cGVvZiB0aGlzLmFkYXB0ZXIuZW5zdXJlQXV0aERhdGFVbmlxdWVuZXNzID09PSAnZnVuY3Rpb24nXG4gICAgKSB7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXJzID0gT2JqZWN0LmtleXModGhpcy5vcHRpb25zLmF1dGggfHwge30pO1xuICAgICAgaWYgKHRoaXMub3B0aW9ucy5lbmFibGVBbm9ueW1vdXNVc2VycyAhPT0gZmFsc2UpIHtcbiAgICAgICAgaWYgKCFhdXRoUHJvdmlkZXJzLmluY2x1ZGVzKCdhbm9ueW1vdXMnKSkge1xuICAgICAgICAgIGF1dGhQcm92aWRlcnMucHVzaCgnYW5vbnltb3VzJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICBhdXRoUHJvdmlkZXJzLm1hcChwcm92aWRlciA9PlxuICAgICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVBdXRoRGF0YVVuaXF1ZW5lc3MocHJvdmlkZXIpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgICAgICBgVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBhdXRoIGRhdGEgcHJvdmlkZXIgXCIke3Byb3ZpZGVyfVwiOiBgLFxuICAgICAgICAgICAgICBlcnJvclxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApXG4gICAgICApO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoXG4gICAgICAgICAgeyBbZmlyc3RLZXldOiB0cnVlLCBbbmV4dFBhdGhdOiB0cnVlIH0sXG4gICAgICAgICAga2V5d29yZC5rZXksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gT25seSBkZXNjZW5kIGludG8gYW4gb3duIG9iamVjdCwgbmV2ZXIgYW4gaW5oZXJpdGVkIHByb3RvdHlwZSBtZW1iZXJcbiAgICBjb25zdCBjaGlsZCA9XG4gICAgICBPYmplY3QuaGFzT3duKG9iamVjdCwgZmlyc3RLZXkpICYmIG9iamVjdFtmaXJzdEtleV0gJiYgdHlwZW9mIG9iamVjdFtmaXJzdEtleV0gPT09ICdvYmplY3QnXG4gICAgICAgID8gb2JqZWN0W2ZpcnN0S2V5XVxuICAgICAgICA6IHt9O1xuICAgIG9iamVjdFtmaXJzdEtleV0gPSB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgoY2hpbGQsIG5leHRQYXRoLCB2YWx1ZVtmaXJzdEtleV0pO1xuICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3Q6IGFueSwgcmVzdWx0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0ge307XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhvcmlnaW5hbE9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgICAgaWYgKFxuICAgICAgICBrZXlVcGRhdGUgJiZcbiAgICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAga2V5VXBkYXRlLl9fb3AgJiZcbiAgICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnLCAnU2V0T25JbnNlcnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgICApIHtcbiAgICAgICAgLy8gb25seSB2YWxpZCBvcHMgdGhhdCBwcm9kdWNlIGFuIGFjdGlvbmFibGUgcmVzdWx0XG4gICAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5lZCBvbiBhIGtleXBhdGhcbiAgICAgICAgdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgICAgIC8vIFJldmVydCBhcnJheSB0byBvYmplY3QgY29udmVyc2lvbiBvbiBkb3Qgbm90YXRpb24gZm9yIGFycmF5cyAoZS5nLiBcImZpZWxkLjAua2V5XCIpXG4gICAgICAgIGlmIChrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIGNvbnN0IFtmaWVsZCwgaW5kZXhdID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICAgICAgY29uc3QgaXNBcnJheUluZGV4ID0gQXJyYXkuZnJvbShpbmRleCkuZXZlcnkoYyA9PiBjID49ICcwJyAmJiBjIDw9ICc5Jyk7XG4gICAgICAgICAgaWYgKGlzQXJyYXlJbmRleCAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtmaWVsZF0pICYmICFBcnJheS5pc0FycmF5KHJlc3BvbnNlW2ZpZWxkXSkpIHtcbiAgICAgICAgICAgIHJlc3BvbnNlW2ZpZWxkXSA9IHJlc3VsdFtmaWVsZF07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gIH1cblxuICBzdGF0aWMgX3ZhbGlkYXRlUXVlcnk6IChhbnksIGJvb2xlYW4sIGJvb2xlYW4sIGJvb2xlYW4pID0+IHZvaWQ7XG4gIHN0YXRpYyBmaWx0ZXJTZW5zaXRpdmVEYXRhOiAoYm9vbGVhbiwgYm9vbGVhbiwgYW55W10sIGFueSwgYW55LCBhbnksIHN0cmluZywgYW55W10sIGFueSkgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbm1vZHVsZS5leHBvcnRzLmZpbHRlclNlbnNpdGl2ZURhdGEgPSBmaWx0ZXJTZW5zaXRpdmVEYXRhO1xuIl0sIm1hcHBpbmdzIjoiOztBQUtBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUVBLElBQUFDLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFHLFVBQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtB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