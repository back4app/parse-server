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
const specialQueryKeys = ['$and', '$or', '$nor', '_rperm', '_wperm'];
const specialMasterQueryKeys = [...specialQueryKeys, '_email_verify_token', '_perishable_token', '_tombstone', '_email_verify_token_expires_at', '_failed_login_count', '_account_lockout_expires_at', '_password_changed_at', '_password_history'];
const validateQuery = (query, isMaster, isMaintenance, update) => {
  if (isMaintenance) {
    isMaster = true;
  }
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }
  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }
  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }
  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
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
    if (!key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/) && (!specialQueryKeys.includes(key) && !isMaster && !update || update && isMaster && !specialMasterQueryKeys.includes(key))) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, isMaintenance, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id;

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
    var _perms$protectedField, _perms$protectedField2;
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
    // but were needed to apply protectedFields
    perms === null || perms === void 0 ? void 0 : (_perms$protectedField = perms.protectedFields) === null || _perms$protectedField === void 0 ? void 0 : (_perms$protectedField2 = _perms$protectedField.temporaryKeys) === null || _perms$protectedField2 === void 0 ? void 0 : _perms$protectedField2.forEach(k => delete object[k]);
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
        validateQuery(query, isMaster, false, true);
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
        validateQuery(query, isMaster, false, false);
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
          if (!schema.fields[fieldName.split('.')[0]] && fieldName !== 'score') {
            delete sort[fieldName];
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
          validateQuery(query, isMaster, isMaintenance, false);
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
              return filterSensitiveData(isMaster, isMaintenance, aclGroup, auth, op, schemaController, className, protectedFields, object);
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
    const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : schema;
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
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfZGVlcGNvcHkiLCJfbG9nZ2VyIiwiX1V0aWxzIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9TY2hlbWFDYWNoZSIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsImV4Y2x1ZGVkIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZiIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5S2V5cyIsInNwZWNpYWxNYXN0ZXJRdWVyeUtleXMiLCJ2YWxpZGF0ZVF1ZXJ5IiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwidXBkYXRlIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsIiRhbmQiLCIkbm9yIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsImluY2x1ZGVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJzb21lIiwib2JqZWN0SWQiLCJmaWVsZHMiLCJ2IiwiaXNVc2VyQ2xhc3MiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfcGVybXMkcHJvdGVjdGVkRmllbGQiLCJfcGVybXMkcHJvdGVjdGVkRmllbGQyIiwiayIsInRlbXBvcmFyeUtleXMiLCJjaGFyQXQiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5Iiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJfX29wIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZjIiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwib3B0aW9ucyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsInNjaGVtYVByb21pc2UiLCJfdHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2xsZWN0aW9uRXhpc3RzIiwiY2xhc3NFeGlzdHMiLCJwdXJnZUNvbGxlY3Rpb24iLCJsb2FkU2NoZW1hIiwidGhlbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJnZXRPbmVTY2hlbWEiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInZhbGlkYXRlQ2xhc3NOYW1lIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsIm1haW50ZW5hbmNlIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwicHJvbWlzZXMiLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJvdGhlcktleXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5Iiwiam9pbiIsInJlZHVjZU9yT3BlcmF0aW9uIiwicmVwZWF0IiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInJlcXVpcmVkVXNlckZpZWxkcyIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJfVXNlciIsInJlcXVpcmVkUm9sZUZpZWxkcyIsIl9Sb2xlIiwicmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyIsIl9JZGVtcG90ZW5jeSIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW5zdXJlSW5kZXgiLCJpc01vbmdvQWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJpc1Bvc3RncmVzQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJ0dGwiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJfZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsImZpcnN0S2V5IiwibmV4dFBhdGgiLCJzbGljZSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwiVXRpbHMiLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwicmVzcG9uc2UiLCJrZXlVcGRhdGUiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0ICogYXMgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBNb25nb1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCB0eXBlIHsgTG9hZFNjaGVtYU9wdGlvbnMgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgdHlwZSB7IFF1ZXJ5T3B0aW9ucywgRnVsbFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuXG5mdW5jdGlvbiBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3dwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll93cGVybSA9IHsgJGluOiBbbnVsbCwgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbmZ1bmN0aW9uIGFkZFJlYWRBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ19ycGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fcnBlcm0gPSB7ICRpbjogW251bGwsICcqJywgLi4uYWNsXSB9O1xuICByZXR1cm4gbmV3UXVlcnk7XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBSRVNUIEFQSSBmb3JtYXR0ZWQgQUNMIG9iamVjdCB0byBvdXIgdHdvLWZpZWxkIG1vbmdvIGZvcm1hdC5cbmNvbnN0IHRyYW5zZm9ybU9iamVjdEFDTCA9ICh7IEFDTCwgLi4ucmVzdWx0IH0pID0+IHtcbiAgaWYgKCFBQ0wpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmVzdWx0Ll93cGVybSA9IFtdO1xuICByZXN1bHQuX3JwZXJtID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBpbiBBQ0wpIHtcbiAgICBpZiAoQUNMW2VudHJ5XS5yZWFkKSB7XG4gICAgICByZXN1bHQuX3JwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBpZiAoQUNMW2VudHJ5XS53cml0ZSkge1xuICAgICAgcmVzdWx0Ll93cGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNwZWNpYWxRdWVyeUtleXMgPSBbJyRhbmQnLCAnJG9yJywgJyRub3InLCAnX3JwZXJtJywgJ193cGVybSddO1xuY29uc3Qgc3BlY2lhbE1hc3RlclF1ZXJ5S2V5cyA9IFtcbiAgLi4uc3BlY2lhbFF1ZXJ5S2V5cyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX3RvbWJzdG9uZScsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChcbiAgcXVlcnk6IGFueSxcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGlzTWFpbnRlbmFuY2U6IGJvb2xlYW4sXG4gIHVwZGF0ZTogYm9vbGVhblxuKTogdm9pZCA9PiB7XG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgaXNNYXN0ZXIgPSB0cnVlO1xuICB9XG4gIGlmIChxdWVyeS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0Nhbm5vdCBxdWVyeSBvbiBBQ0wuJyk7XG4gIH1cblxuICBpZiAocXVlcnkuJG9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRvciBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kb3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgaXNNYWludGVuYW5jZSwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRvciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRhbmQpIHtcbiAgICBpZiAocXVlcnkuJGFuZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kYW5kLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG5vciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgb2YgYXQgbGVhc3QgMSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5W2tleV0gJiYgcXVlcnlba2V5XS4kcmVnZXgpIHtcbiAgICAgIGlmICh0eXBlb2YgcXVlcnlba2V5XS4kb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFxdWVyeVtrZXldLiRvcHRpb25zLm1hdGNoKC9eW2lteHNdKyQvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICBgQmFkICRvcHRpb25zIHZhbHVlIGZvciBxdWVyeTogJHtxdWVyeVtrZXldLiRvcHRpb25zfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChcbiAgICAgICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykgJiZcbiAgICAgICgoIXNwZWNpYWxRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSAmJiAhaXNNYXN0ZXIgJiYgIXVwZGF0ZSkgfHxcbiAgICAgICAgKHVwZGF0ZSAmJiBpc01hc3RlciAmJiAhc3BlY2lhbE1hc3RlclF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpKSlcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGlzTWFpbnRlbmFuY2U6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIgfCBhbnksXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpIDoge307XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcbiAgaWYgKGlzVXNlckNsYXNzKSB7XG4gICAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLyogc3BlY2lhbCB0cmVhdCBmb3IgdGhlIHVzZXIgY2xhc3M6IGRvbid0IGZpbHRlciBwcm90ZWN0ZWRGaWVsZHMgaWYgY3VycmVudGx5IGxvZ2dlZGluIHVzZXIgaXNcbiAgdGhlIHJldHJpZXZlZCB1c2VyICovXG4gIGlmICghKGlzVXNlckNsYXNzICYmIHVzZXJJZCAmJiBvYmplY3Qub2JqZWN0SWQgPT09IHVzZXJJZCkpIHtcbiAgICBwcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcblxuICAgIC8vIGZpZWxkcyBub3QgcmVxdWVzdGVkIGJ5IGNsaWVudCAoZXhjbHVkZWQpLFxuICAgIC8vIGJ1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwZXJtcz8ucHJvdGVjdGVkRmllbGRzPy50ZW1wb3JhcnlLZXlzPy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG4gIH1cblxuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5LmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcyB8fCBpc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBpZGVtcG90ZW5jeU9wdGlvbnM6IGFueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zID0gdGhpcy5vcHRpb25zLmlkZW1wb3RlbmN5T3B0aW9ucyB8fCB7fTtcbiAgICAvLyBQcmV2ZW50IG11dGFibGUgdGhpcy5zY2hlbWEsIG90aGVyd2lzZSBvbmUgcmVxdWVzdCBjb3VsZCB1c2VcbiAgICAvLyBtdWx0aXBsZSBzY2hlbWFzLCBzbyBpbnN0ZWFkIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwge30pKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQodGhpcy5hZGFwdGVyLCBvcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zLFxuICAgIG1haW50ZW5hbmNlOiBib29sZWFuXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSwgbWFpbnRlbmFuY2UpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCwgdXBkYXRlKTtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICd1cGRhdGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhZGRzRmllbGQpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgJGFuZDogW1xuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UsIHRydWUpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgZmFsc2UpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG5cbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG51bGwsIG9iamVjdCk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIGNvbnN0IG9ycyA9IHF1ZXJ5Wyckb3InXTtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIC4uLm9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAuLi5hbmRzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRhbmQnXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG90aGVyS2V5cyA9IE9iamVjdC5rZXlzKHF1ZXJ5KS5tYXAoa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT09ICckYW5kJyB8fCBrZXkgPT09ICckb3InKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICghdCB8fCB0LnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9XG4gICAgICBsZXQgcXVlcmllczogPyhhbnlbXSkgPSBudWxsO1xuICAgICAgaWYgKFxuICAgICAgICBxdWVyeVtrZXldICYmXG4gICAgICAgIChxdWVyeVtrZXldWyckaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuZSddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5pbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBsaXN0IG9mIHF1ZXJpZXNcbiAgICAgICAgcXVlcmllcyA9IE9iamVjdC5rZXlzKHF1ZXJ5W2tleV0pLm1hcChjb25zdHJhaW50S2V5ID0+IHtcbiAgICAgICAgICBsZXQgcmVsYXRlZElkcztcbiAgICAgICAgICBsZXQgaXNOZWdhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50S2V5ID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV0ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJGluJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRpbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5pbicpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRuaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuZScpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldWyckbmUnXS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24sXG4gICAgICAgICAgICByZWxhdGVkSWRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcyA9IFt7IGlzTmVnYXRpb246IGZhbHNlLCByZWxhdGVkSWRzOiBbXSB9XTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBjdXJyZW50IHF1ZXJ5S2V5IGFzIHdlIGRvbix0IG5lZWQgaXQgYW55bW9yZVxuICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAvLyBleGVjdXRlIGVhY2ggcXVlcnkgaW5kZXBlbmRlbnRseSB0byBidWlsZCB0aGUgbGlzdCBvZlxuICAgICAgLy8gJGluIC8gJG5pblxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBxdWVyaWVzLm1hcChxID0+IHtcbiAgICAgICAgaWYgKCFxKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLm93bmluZ0lkcyhjbGFzc05hbWUsIGtleSwgcS5yZWxhdGVkSWRzKS50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgaWYgKHEuaXNOZWdhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5hZGROb3RJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChbLi4ucHJvbWlzZXMsIC4uLm90aGVyS2V5c10pLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFpbnRlbmFuY2UgPSBhdXRoLmlzTWFpbnRlbmFuY2U7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZCB8fCBpc01haW50ZW5hbmNlO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgIH07XG4gICAgICAgICAgT2JqZWN0LmtleXMoc29ydCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBDYW5ub3Qgc29ydCBieSAke2ZpZWxkTmFtZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lLnNwbGl0KCcuJylbMF1dICYmIGZpZWxkTmFtZSAhPT0gJ3Njb3JlJykge1xuICAgICAgICAgICAgICBkZWxldGUgc29ydFtmaWVsZE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIGZhbHNlKTtcbiAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgaGludFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBkaXN0aW5jdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgZXhwbGFpblxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWludGVuYW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICB0eXBlb2YgZmllbGREZXNjcmlwdG9yID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID1cbiAgICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zXG4gICAgICAgID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpXG4gICAgICAgIDogc2NoZW1hO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlciBlbWFpbCBhZGRyZXNzZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10sICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJywgdHJ1ZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBpZGVtcG90ZW5jeSByZXF1ZXN0IElEOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpc01vbmdvQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4gICAgY29uc3QgaXNQb3N0Z3Jlc0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuICAgIGlmIChpc01vbmdvQWRhcHRlciB8fCBpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgbGV0IG9wdGlvbnMgPSB7fTtcbiAgICAgIGlmIChpc01vbmdvQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIHR0bDogMCxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zO1xuICAgICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCBvcHRpb25zKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoXG4gICAgICAgICAgeyBbZmlyc3RLZXldOiB0cnVlLCBbbmV4dFBhdGhdOiB0cnVlIH0sXG4gICAgICAgICAga2V5d29yZC5rZXksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSA9IHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgICBuZXh0UGF0aCxcbiAgICAgIHZhbHVlW2ZpcnN0S2V5XVxuICAgICk7XG4gICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBfc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdDogYW55LCByZXN1bHQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgICBpZiAoXG4gICAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICAgICkge1xuICAgICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmVkIG9uIGEga2V5cGF0aFxuICAgICAgICB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbiwgYm9vbGVhbiwgYm9vbGVhbikgPT4gdm9pZDtcbiAgc3RhdGljIGZpbHRlclNlbnNpdGl2ZURhdGE6IChib29sZWFuLCBib29sZWFuLCBhbnlbXSwgYW55LCBhbnksIGFueSwgc3RyaW5nLCBhbnlbXSwgYW55KSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xubW9kdWxlLmV4cG9ydHMuZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IGZpbHRlclNlbnNpdGl2ZURhdGE7XG4iXSwibWFwcGluZ3MiOiI7O0FBS0EsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsT0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUcsVUFBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUksU0FBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sTUFBQSxHQUFBSixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU8sZ0JBQUEsR0FBQUMsdUJBQUEsQ0FBQVIsT0FB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