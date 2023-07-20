"use strict";

var _node = require("parse/node");
var _lodash = _interopRequireDefault(require("lodash"));
var _intersect = _interopRequireDefault(require("intersect"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _logger = _interopRequireDefault(require("../logger"));
var _Utils = _interopRequireDefault(require("../Utils"));
var SchemaController = _interopRequireWildcard(require("./SchemaController"));
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; } // A database adapter that works with data exported from the hosted
// Parse database.
// -disable-next
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
const transformObjectACL = _ref => {
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
const validateQuery = query => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }
  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }
  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }
  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(validateQuery);
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
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id;

  // replace protectedFields when using pointer-permissions
  const perms = schema.getClassLevelPermissions(className);
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

  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */
  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
    //but were needed to apply protecttedFields
    perms.protectedFields && perms.protectedFields.temporaryKeys && perms.protectedFields.temporaryKeys.forEach(k => delete object[k]);
  }
  if (!isUserClass) {
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
};
// Transforms a Database format ACL to a REST API format ACL
const untransformObjectACL = _ref2 => {
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
  constructor(adapter, options) {
    this.adapter = adapter;
    this.options = options || {};
    this.idempotencyOptions = this.options.idempotencyOptions || {};
    // Prevent mutable this.schema, otherwise one request could use
    // multiple schemas, so instead use loadSchema to get a schema.
    this.schemaPromise = null;
    this._transactionalSession = null;
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
  validateObject(className, object, query, runOptions) {
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
      return schema.validateObject(className, object, query);
    });
  }
  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update;
    // Make a copy of the object, so we don't mutate the incoming data.
    update = (0, _deepcopy.default)(update);
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
        validateQuery(query);
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
        validateQuery(query);
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
    if (query['$and']) {
      const ands = query['$and'];
      return Promise.all(ands.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$and'][index] = aQuery;
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
    return Promise.all(promises).then(() => {
      return Promise.resolve(query);
    });
  }

  // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated
  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }
    if (query['$and']) {
      return Promise.all(query['$and'].map(aQuery => {
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
    explain
  } = {}, auth = {}, validSchemaController) {
    const isMaster = acl === undefined;
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
          caseInsensitive,
          explain
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }
          const rootFieldName = getRootFieldName(fieldName);
          if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
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
          validateQuery(query);
          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference, undefined, hint);
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
              return this.adapter.aggregate(className, schema, pipeline, readPreference, hint, explain);
            }
          } else if (explain) {
            return this.adapter.find(className, schema, query, queryOptions);
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, aclGroup, auth, op, schemaController, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
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
      query = _objectSpread(_objectSpread({}, query), query.$or[0]);
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
      query = _objectSpread(_objectSpread({}, query), query.$and[0]);
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
    const perms = schema.getClassLevelPermissions(className);
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null;

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
    return this.adapter.createTransactionalSession().then(transactionalSession => {
      this._transactionalSession = transactionalSession;
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
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Role)
    };
    const requiredIdempotencyFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Idempotency)
    };
    await this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);
      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);
      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);
      throw error;
    });
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);
      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive email index: ', error);
      throw error;
    });
    await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);
      throw error;
    });
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
          firstKey: undefined
        }, keyword.key, undefined);
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
      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
      }
    });
    return Promise.resolve(response);
  }
}
module.exports = DatabaseController;
// Expose validateQuery for tests
module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfZGVlcGNvcHkiLCJfbG9nZ2VyIiwiX1V0aWxzIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9TY2hlbWFDYWNoZSIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsImV4Y2x1ZGVkIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZiIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5a2V5cyIsImlzU3BlY2lhbFF1ZXJ5S2V5IiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCIkYW5kIiwiJG5vciIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImlzTWFzdGVyIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSIsInN0YXJ0c1dpdGgiLCJtYXAiLCJzdWJzdHJpbmciLCJuZXdQcm90ZWN0ZWRGaWVsZHMiLCJvdmVycmlkZVByb3RlY3RlZEZpZWxkcyIsInBvaW50ZXJQZXJtIiwicG9pbnRlclBlcm1JbmNsdWRlc1VzZXIiLCJyZWFkVXNlckZpZWxkVmFsdWUiLCJpc0FycmF5Iiwic29tZSIsIm9iamVjdElkIiwiZmllbGRzIiwidiIsImluY2x1ZGVzIiwiaXNVc2VyQ2xhc3MiLCJrIiwidGVtcG9yYXJ5S2V5cyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfdG9tYnN0b25lIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5Iiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJfX29wIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZjIiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwib3B0aW9ucyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsInNjaGVtYVByb21pc2UiLCJfdHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2xsZWN0aW9uRXhpc3RzIiwiY2xhc3NFeGlzdHMiLCJwdXJnZUNvbGxlY3Rpb24iLCJsb2FkU2NoZW1hIiwidGhlbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJnZXRPbmVTY2hlbWEiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInZhbGlkYXRlQ2xhc3NOYW1lIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsInMiLCJjYW5BZGRGaWVsZCIsInVwZGF0ZSIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwiZGVlcGNvcHkiLCJyZWxhdGlvblVwZGF0ZXMiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjb2xsZWN0UmVsYXRpb25VcGRhdGVzIiwiYWRkUG9pbnRlclBlcm1pc3Npb25zIiwiY2F0Y2giLCJlcnJvciIsInJvb3RGaWVsZE5hbWUiLCJmaWVsZE5hbWVJc1ZhbGlkIiwidXBkYXRlT3BlcmF0aW9uIiwiaW5uZXJLZXkiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0Iiwib3BzIiwiZGVsZXRlTWUiLCJwcm9jZXNzIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJvcmlnaW5hbE9iamVjdCIsImNyZWF0ZWRBdCIsImlzbyIsIl9fdHlwZSIsInVwZGF0ZWRBdCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImNyZWF0ZU9iamVjdCIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJjbGFzc1NjaGVtYSIsInNjaGVtYURhdGEiLCJzY2hlbWFGaWVsZHMiLCJuZXdLZXlzIiwiZmllbGQiLCJhY3Rpb24iLCJkZWxldGVFdmVyeXRoaW5nIiwiZmFzdCIsIlNjaGVtYUNhY2hlIiwiY2xlYXIiLCJkZWxldGVBbGxDbGFzc2VzIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsIm9ycyIsImFRdWVyeSIsImluZGV4IiwiYW5kcyIsInByb21pc2VzIiwicXVlcmllcyIsImNvbnN0cmFpbnRLZXkiLCJpc05lZ2F0aW9uIiwiciIsInEiLCJpZHMiLCJhZGROb3RJbk9iamVjdElkc0lkcyIsImFkZEluT2JqZWN0SWRzSWRzIiwicmVkdWNlUmVsYXRpb25LZXlzIiwicmVsYXRlZFRvIiwiaWRzRnJvbVN0cmluZyIsImlkc0Zyb21FcSIsImlkc0Zyb21JbiIsImFsbElkcyIsImxpc3QiLCJ0b3RhbExlbmd0aCIsInJlZHVjZSIsIm1lbW8iLCJpZHNJbnRlcnNlY3Rpb24iLCJpbnRlcnNlY3QiLCJiaWciLCIkZXEiLCJpZHNGcm9tTmluIiwiU2V0IiwiJG5pbiIsImNvdW50IiwiZGlzdGluY3QiLCJwaXBlbGluZSIsInJlYWRQcmVmZXJlbmNlIiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJhZ2dyZWdhdGUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJkZWxldGVTY2hlbWEiLCJkZWxldGVDbGFzcyIsIndhc1BhcnNlQ29sbGVjdGlvbiIsInJlbGF0aW9uRmllbGROYW1lcyIsIm5hbWUiLCJkZWwiLCJyZWxvYWREYXRhIiwib2JqZWN0VG9FbnRyaWVzU3RyaW5ncyIsImVudHJpZXMiLCJhIiwiSlNPTiIsInN0cmluZ2lmeSIsImpvaW4iLCJyZWR1Y2VPck9wZXJhdGlvbiIsInJlcGVhdCIsImoiLCJzaG9ydGVyIiwibG9uZ2VyIiwiZm91bmRFbnRyaWVzIiwiYWNjIiwic2hvcnRlckVudHJpZXMiLCJzcGxpY2UiLCJyZWR1Y2VBbmRPcGVyYXRpb24iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJ1c2VyQUNMIiwiZ3JvdXBLZXkiLCJwZXJtRmllbGRzIiwicG9pbnRlckZpZWxkcyIsInVzZXJQb2ludGVyIiwiZmllbGREZXNjcmlwdG9yIiwiZmllbGRUeXBlIiwicXVlcnlDbGF1c2UiLCIkYWxsIiwiYXNzaWduIiwicHJlc2VydmVLZXlzIiwic2VydmVyT25seUtleXMiLCJhdXRoZW50aWNhdGVkIiwicm9sZXMiLCJ1c2VyUm9sZXMiLCJwcm90ZWN0ZWRLZXlzU2V0cyIsInByb3RlY3RlZEtleXMiLCJuZXh0IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJyZXF1aXJlZFVzZXJGaWVsZHMiLCJkZWZhdWx0Q29sdW1ucyIsIl9EZWZhdWx0IiwiX1VzZXIiLCJyZXF1aXJlZFJvbGVGaWVsZHMiLCJfUm9sZSIsInJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMiLCJfSWRlbXBvdGVuY3kiLCJlbnN1cmVVbmlxdWVuZXNzIiwibG9nZ2VyIiwid2FybiIsImVuc3VyZUluZGV4IiwiaXNNb25nb0FkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiaXNQb3N0Z3Jlc0FkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidHRsIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiX2V4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJmaXJzdEtleSIsIm5leHRQYXRoIiwic2xpY2UiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0Iiwia2V5d29yZCIsIlV0aWxzIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlrZXlzID0gW1xuICAnJGFuZCcsXG4gICckb3InLFxuICAnJG5vcicsXG4gICdfcnBlcm0nLFxuICAnX3dwZXJtJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFF1ZXJ5S2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxRdWVyeWtleXMuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnkpOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFpc1NwZWNpYWxRdWVyeUtleShrZXkpICYmICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy9idXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdHRlZEZpZWxkc1xuICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcblxuICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll90b21ic3RvbmU7XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9mYWlsZWRfbG9naW5fY291bnQ7XG4gIGRlbGV0ZSBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9oaXN0b3J5O1xuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSkge1xuICByZXR1cm4gYF9Kb2luOiR7a2V5fToke2NsYXNzTmFtZX1gO1xufVxuXG5jb25zdCBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlID0gb2JqZWN0ID0+IHtcbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKG9iamVjdFtrZXldICYmIG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgIHN3aXRjaCAob2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0uYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5hbW91bnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IFtdO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICAgYFRoZSAke29iamVjdFtrZXldLl9fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtQXV0aERhdGEgPSAoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkgPT4ge1xuICBpZiAob2JqZWN0LmF1dGhEYXRhICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIE9iamVjdC5rZXlzKG9iamVjdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBvYmplY3QuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gYF9hdXRoX2RhdGFfJHtwcm92aWRlcn1gO1xuICAgICAgaWYgKHByb3ZpZGVyRGF0YSA9PSBudWxsKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fb3A6ICdEZWxldGUnLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSBwcm92aWRlckRhdGE7XG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSA9IHsgdHlwZTogJ09iamVjdCcgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICB9XG59O1xuLy8gVHJhbnNmb3JtcyBhIERhdGFiYXNlIGZvcm1hdCBBQ0wgdG8gYSBSRVNUIEFQSSBmb3JtYXQgQUNMXG5jb25zdCB1bnRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IF9ycGVybSwgX3dwZXJtLCAuLi5vdXRwdXQgfSkgPT4ge1xuICBpZiAoX3JwZXJtIHx8IF93cGVybSkge1xuICAgIG91dHB1dC5BQ0wgPSB7fTtcblxuICAgIChfcnBlcm0gfHwgW10pLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgcmVhZDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3JlYWQnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAoX3dwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHdyaXRlOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XVsnd3JpdGUnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG91dHB1dDtcbn07XG5cbi8qKlxuICogV2hlbiBxdWVyeWluZywgdGhlIGZpZWxkTmFtZSBtYXkgYmUgY29tcG91bmQsIGV4dHJhY3QgdGhlIHJvb3QgZmllbGROYW1lXG4gKiAgICAgYHRlbXBlcmF0dXJlLmNlbHNpdXNgIGJlY29tZXMgYHRlbXBlcmF0dXJlYFxuICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkTmFtZSB0aGF0IG1heSBiZSBhIGNvbXBvdW5kIGZpZWxkIG5hbWVcbiAqIEByZXR1cm5zIHtzdHJpbmd9IHRoZSByb290IG5hbWUgb2YgdGhlIGZpZWxkXG4gKi9cbmNvbnN0IGdldFJvb3RGaWVsZE5hbWUgPSAoZmllbGROYW1lOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG59O1xuXG5jb25zdCByZWxhdGlvblNjaGVtYSA9IHtcbiAgZmllbGRzOiB7IHJlbGF0ZWRJZDogeyB0eXBlOiAnU3RyaW5nJyB9LCBvd25pbmdJZDogeyB0eXBlOiAnU3RyaW5nJyB9IH0sXG59O1xuXG5jbGFzcyBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcbiAgc2NoZW1hUHJvbWlzZTogP1Byb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPjtcbiAgX3RyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55O1xuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuaWRlbXBvdGVuY3lPcHRpb25zIHx8IHt9O1xuICAgIC8vIFByZXZlbnQgbXV0YWJsZSB0aGlzLnNjaGVtYSwgb3RoZXJ3aXNlIG9uZSByZXF1ZXN0IGNvdWxkIHVzZVxuICAgIC8vIG11bHRpcGxlIHNjaGVtYXMsIHNvIGluc3RlYWQgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcikgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwLCBydW5PcHRpb25zKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsIHVwZGF0ZSk7XG4gICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoYWRkc0ZpZWxkKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICRhbmQ6IFtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ2FkZEZpZWxkJyxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dICYmXG4gICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkgPT4gaW5uZXJLZXkuaW5jbHVkZXMoJyQnKSB8fCBpbm5lcktleS5pbmNsdWRlcygnLicpXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSB0cmFuc2Zvcm1PYmplY3RBQ0wodXBkYXRlKTtcbiAgICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7fSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChtYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHVwc2VydCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kT25lQW5kVXBkYXRlKFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKHNraXBTYW5pdGl6YXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxVcGRhdGUsIHJlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29sbGVjdCBhbGwgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBhbGwgcmVsYXRpb24gdXBkYXRlcyB0byBwZXJmb3JtXG4gIC8vIFRoaXMgbXV0YXRlcyB1cGRhdGUuXG4gIGNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiA/c3RyaW5nLCB1cGRhdGU6IGFueSkge1xuICAgIHZhciBvcHMgPSBbXTtcbiAgICB2YXIgZGVsZXRlTWUgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcblxuICAgIHZhciBwcm9jZXNzID0gKG9wLCBrZXkpID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0JhdGNoJykge1xuICAgICAgICBmb3IgKHZhciB4IG9mIG9wLm9wcykge1xuICAgICAgICAgIHByb2Nlc3MoeCwga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUpIHtcbiAgICAgIHByb2Nlc3ModXBkYXRlW2tleV0sIGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIGRlbGV0ZU1lKSB7XG4gICAgICBkZWxldGUgdXBkYXRlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHM7XG4gIH1cblxuICAvLyBQcm9jZXNzZXMgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsIHVwZGF0ZXMgaGF2ZSBiZWVuIHBlcmZvcm1lZFxuICBoYW5kbGVSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiBzdHJpbmcsIHVwZGF0ZTogYW55LCBvcHM6IGFueSkge1xuICAgIHZhciBwZW5kaW5nID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG4gICAgb3BzLmZvckVhY2goKHsga2V5LCBvcCB9KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLmFkZFJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMucmVtb3ZlUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHBlbmRpbmcpO1xuICB9XG5cbiAgLy8gQWRkcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIGFkZCB3YXMgc3VjY2Vzc2Z1bC5cbiAgYWRkUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgIGRvYyxcbiAgICAgIGRvYyxcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSByZW1vdmUgd2FzXG4gIC8vIHN1Y2Nlc3NmdWwuXG4gIHJlbW92ZVJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICB2YXIgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIGRvYyxcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFdlIGRvbid0IGNhcmUgaWYgdGhleSB0cnkgdG8gZGVsZXRlIGEgbm9uLWV4aXN0ZW50IHJlbGF0aW9uLlxuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmVzIG9iamVjdHMgbWF0Y2hlcyB0aGlzIHF1ZXJ5IGZyb20gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCB3YXNcbiAgLy8gZGVsZXRlZC5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4gIC8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbiAgLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbiAgZGVzdHJveShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnZGVsZXRlJylcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICdkZWxldGUnLFxuICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBkZWxldGUgYnkgcXVlcnlcbiAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocGFyc2VGb3JtYXRTY2hlbWEgPT5cbiAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBwYXJzZUZvcm1hdFNjaGVtYSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBXaGVuIGRlbGV0aW5nIHNlc3Npb25zIHdoaWxlIGNoYW5naW5nIHBhc3N3b3JkcywgZG9uJ3QgdGhyb3cgYW4gZXJyb3IgaWYgdGhleSBkb24ndCBoYXZlIGFueSBzZXNzaW9ucy5cbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBJbnNlcnRzIGFuIG9iamVjdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgc2F2ZWQuXG4gIGNyZWF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcblxuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgbnVsbCwgb2JqZWN0KTtcblxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdjcmVhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKSlcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgICAgIGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUob2JqZWN0KTtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgU2NoZW1hQ29udHJvbGxlci5jb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHNjaGVtYSksXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkXSAmJiBvYmplY3RbZmllbGRdLl9fb3AgJiYgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZ2V0Um9vdEZpZWxkTmFtZShmaWVsZCkpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhZGRzIGEgbWFya2VyIHRoYXQgbmV3IGZpZWxkIGlzIGJlaW5nIGFkZGluZyBkdXJpbmcgdXBkYXRlXG4gICAgICBydW5PcHRpb25zLmFkZHNGaWVsZCA9IHRydWU7XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJ1bk9wdGlvbnMuYWN0aW9uO1xuICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2FkZEZpZWxkJywgYWN0aW9uKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQWxsQ2xhc3NlcyhmYXN0KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLCByZWxhdGlvblNjaGVtYSwgeyBvd25pbmdJZCB9LCBmaW5kT3B0aW9ucylcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWxhdGVkSWQpKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2Ygb3duaW5nIGlkcyBnaXZlbiBzb21lIHJlbGF0ZWQgaWRzLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgb3duaW5nSWRzKGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZywgcmVsYXRlZElkczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAgeyBrZXlzOiBbJ293bmluZ0lkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0Lm93bmluZ0lkKSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJGluIG9uIHJlbGF0aW9uIGZpZWxkcywgb3JcbiAgLy8gZXF1YWwtdG8tcG9pbnRlciBjb25zdHJhaW50cyBvbiByZWxhdGlvbiBmaWVsZHMuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHNjaGVtYTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZWFyY2ggZm9yIGFuIGluLXJlbGF0aW9uIG9yIGVxdWFsLXRvLXJlbGF0aW9uXG4gICAgLy8gTWFrZSBpdCBzZXF1ZW50aWFsIGZvciBub3csIG5vdCBzdXJlIG9mIHBhcmFsbGVpemF0aW9uIHNpZGUgZWZmZWN0c1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIGNvbnN0IG9ycyA9IHF1ZXJ5Wyckb3InXTtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgb3JzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRvciddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICBjb25zdCBhbmRzID0gcXVlcnlbJyRhbmQnXTtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgYW5kcy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5WyckYW5kJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKHF1ZXJ5KS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICghdCB8fCB0LnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9XG4gICAgICBsZXQgcXVlcmllczogPyhhbnlbXSkgPSBudWxsO1xuICAgICAgaWYgKFxuICAgICAgICBxdWVyeVtrZXldICYmXG4gICAgICAgIChxdWVyeVtrZXldWyckaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuZSddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5pbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBsaXN0IG9mIHF1ZXJpZXNcbiAgICAgICAgcXVlcmllcyA9IE9iamVjdC5rZXlzKHF1ZXJ5W2tleV0pLm1hcChjb25zdHJhaW50S2V5ID0+IHtcbiAgICAgICAgICBsZXQgcmVsYXRlZElkcztcbiAgICAgICAgICBsZXQgaXNOZWdhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50S2V5ID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV0ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJGluJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRpbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5pbicpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRuaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuZScpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldWyckbmUnXS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24sXG4gICAgICAgICAgICByZWxhdGVkSWRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcyA9IFt7IGlzTmVnYXRpb246IGZhbHNlLCByZWxhdGVkSWRzOiBbXSB9XTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBjdXJyZW50IHF1ZXJ5S2V5IGFzIHdlIGRvbix0IG5lZWQgaXQgYW55bW9yZVxuICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAvLyBleGVjdXRlIGVhY2ggcXVlcnkgaW5kZXBlbmRlbnRseSB0byBidWlsZCB0aGUgbGlzdCBvZlxuICAgICAgLy8gJGluIC8gJG5pblxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBxdWVyaWVzLm1hcChxID0+IHtcbiAgICAgICAgaWYgKCFxKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLm93bmluZ0lkcyhjbGFzc05hbWUsIGtleSwgcS5yZWxhdGVkSWRzKS50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgaWYgKHEuaXNOZWdhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5hZGROb3RJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkcmVsYXRlZFRvXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgcXVlcnlPcHRpb25zOiBhbnkpOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRhbmQnXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICB2YXIgcmVsYXRlZFRvID0gcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICBpZiAocmVsYXRlZFRvKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcmVsYXRlZFRvLmtleSxcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICApXG4gICAgICAgIC50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgZGVsZXRlIHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIH1cbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbaWRzRnJvbVN0cmluZywgaWRzRnJvbUVxLCBpZHNGcm9tSW4sIGlkc10uZmlsdGVyKFxuICAgICAgbGlzdCA9PiBsaXN0ICE9PSBudWxsXG4gICAgKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGFsbElkcy5yZWR1Y2UoKG1lbW8sIGxpc3QpID0+IG1lbW8gKyBsaXN0Lmxlbmd0aCwgMCk7XG5cbiAgICBsZXQgaWRzSW50ZXJzZWN0aW9uID0gW107XG4gICAgaWYgKHRvdGFsTGVuZ3RoID4gMTI1KSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QuYmlnKGFsbElkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdChhbGxJZHMpO1xuICAgIH1cblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA9IGlkc0ludGVyc2VjdGlvbjtcblxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIGFkZE5vdEluT2JqZWN0SWRzSWRzKGlkczogc3RyaW5nW10gPSBbXSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21OaW4gPSBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJG5pbiddID8gcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA6IFtdO1xuICAgIGxldCBhbGxJZHMgPSBbLi4uaWRzRnJvbU5pbiwgLi4uaWRzXS5maWx0ZXIobGlzdCA9PiBsaXN0ICE9PSBudWxsKTtcblxuICAgIC8vIG1ha2UgYSBzZXQgYW5kIHNwcmVhZCB0byByZW1vdmUgZHVwbGljYXRlc1xuICAgIGFsbElkcyA9IFsuLi5uZXcgU2V0KGFsbElkcyldO1xuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPSBhbGxJZHM7XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gUnVucyBhIHF1ZXJ5IG9uIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIGxpc3Qgb2YgaXRlbXMuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgc2tpcCAgICBudW1iZXIgb2YgcmVzdWx0cyB0byBza2lwLlxuICAvLyAgIGxpbWl0ICAgbGltaXQgdG8gdGhpcyBudW1iZXIgb2YgcmVzdWx0cy5cbiAgLy8gICBzb3J0ICAgIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSB0aGUgZmllbGRzIHRvIHNvcnQgYnkuXG4gIC8vICAgICAgICAgICB0aGUgdmFsdWUgaXMgKzEgZm9yIGFzY2VuZGluZywgLTEgZm9yIGRlc2NlbmRpbmcuXG4gIC8vICAgY291bnQgICBydW4gYSBjb3VudCBpbnN0ZWFkIG9mIHJldHVybmluZyByZXN1bHRzLlxuICAvLyAgIGFjbCAgICAgcmVzdHJpY3QgdGhpcyBvcGVyYXRpb24gd2l0aCBhbiBBQ0wgZm9yIHRoZSBwcm92aWRlZCBhcnJheVxuICAvLyAgICAgICAgICAgb2YgdXNlciBvYmplY3RJZHMgYW5kIHJvbGVzLiBhY2w6IG51bGwgbWVhbnMgbm8gdXNlci5cbiAgLy8gICAgICAgICAgIHdoZW4gdGhpcyBmaWVsZCBpcyBub3QgcHJlc2VudCwgZG9uJ3QgZG8gYW55dGhpbmcgcmVnYXJkaW5nIEFDTHMuXG4gIC8vICBjYXNlSW5zZW5zaXRpdmUgbWFrZSBzdHJpbmcgY29tcGFyaXNvbnMgY2FzZSBpbnNlbnNpdGl2ZVxuICAvLyBUT0RPOiBtYWtlIHVzZXJJZHMgbm90IG5lZWRlZCBoZXJlLiBUaGUgZGIgYWRhcHRlciBzaG91bGRuJ3Qga25vd1xuICAvLyBhbnl0aGluZyBhYm91dCB1c2VycywgaWRlYWxseS4gVGhlbiwgaW1wcm92ZSB0aGUgZm9ybWF0IG9mIHRoZSBBQ0xcbiAgLy8gYXJnIHRvIHdvcmsgbGlrZSB0aGUgb3RoZXJzLlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgYWNsLFxuICAgICAgc29ydCA9IHt9LFxuICAgICAgY291bnQsXG4gICAgICBrZXlzLFxuICAgICAgb3AsXG4gICAgICBkaXN0aW5jdCxcbiAgICAgIHBpcGVsaW5lLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlID0gZmFsc2UsXG4gICAgICBleHBsYWluLFxuICAgIH06IGFueSA9IHt9LFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBvcCA9XG4gICAgICBvcCB8fCAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09ICdzdHJpbmcnICYmIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDEgPyAnZ2V0JyA6ICdmaW5kJyk7XG4gICAgLy8gQ291bnQgb3BlcmF0aW9uIGlmIGNvdW50aW5nXG4gICAgb3AgPSBjb3VudCA9PT0gdHJ1ZSA/ICdjb3VudCcgOiBvcDtcblxuICAgIGxldCBjbGFzc0V4aXN0cyA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIC8vQWxsb3cgdm9sYXRpbGUgY2xhc3NlcyBpZiBxdWVyeWluZyB3aXRoIE1hc3RlciAoZm9yIF9QdXNoU3RhdHVzKVxuICAgICAgLy9UT0RPOiBNb3ZlIHZvbGF0aWxlIGNsYXNzZXMgY29uY2VwdCBpbnRvIG1vbmdvIGFkYXB0ZXIsIHBvc3RncmVzIGFkYXB0ZXIgc2hvdWxkbid0IGNhcmVcbiAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBpc01hc3RlcilcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyBCZWhhdmlvciBmb3Igbm9uLWV4aXN0ZW50IGNsYXNzZXMgaXMga2luZGEgd2VpcmQgb24gUGFyc2UuY29tLiBQcm9iYWJseSBkb2Vzbid0IG1hdHRlciB0b28gbXVjaC5cbiAgICAgICAgICAvLyBGb3Igbm93LCBwcmV0ZW5kIHRoZSBjbGFzcyBleGlzdHMgYnV0IGhhcyBubyBvYmplY3RzLFxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjbGFzc0V4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAvLyBQYXJzZS5jb20gdHJlYXRzIHF1ZXJpZXMgb24gX2NyZWF0ZWRfYXQgYW5kIF91cGRhdGVkX2F0IGFzIGlmIHRoZXkgd2VyZSBxdWVyaWVzIG9uIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0LFxuICAgICAgICAgIC8vIHNvIGR1cGxpY2F0ZSB0aGF0IGJlaGF2aW9yIGhlcmUuIElmIGJvdGggYXJlIHNwZWNpZmllZCwgdGhlIGNvcnJlY3QgYmVoYXZpb3IgdG8gbWF0Y2ggUGFyc2UuY29tIGlzIHRvXG4gICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgaWYgKHNvcnQuX2NyZWF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQuY3JlYXRlZEF0ID0gc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc29ydC5fdXBkYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICB9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgZGlzdGluY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgIC5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hc3RlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICB0eXBlb2YgZmllbGREZXNjcmlwdG9yID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10sICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJywgdHJ1ZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBpZGVtcG90ZW5jeSByZXF1ZXN0IElEOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpc01vbmdvQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4gICAgY29uc3QgaXNQb3N0Z3Jlc0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuICAgIGlmIChpc01vbmdvQWRhcHRlciB8fCBpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgbGV0IG9wdGlvbnMgPSB7fTtcbiAgICAgIGlmIChpc01vbmdvQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIHR0bDogMCxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zO1xuICAgICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCBvcHRpb25zKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoeyBmaXJzdEtleTogdW5kZWZpbmVkIH0sIGtleXdvcmQua2V5LCB1bmRlZmluZWQpO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSA9IHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgICBuZXh0UGF0aCxcbiAgICAgIHZhbHVlW2ZpcnN0S2V5XVxuICAgICk7XG4gICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBfc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdDogYW55LCByZXN1bHQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgICBpZiAoXG4gICAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICAgICkge1xuICAgICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmVkIG9uIGEga2V5cGF0aFxuICAgICAgICB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogYW55ID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG4iXSwibWFwcGluZ3MiOiI7O0FBS0EsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsT0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUcsVUFBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUksU0FBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUssT0FBQSxH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