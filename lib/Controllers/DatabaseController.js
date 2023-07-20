"use strict";

var _node = require("parse/node");
var _lodash = _interopRequireDefault(require("lodash"));
var _intersect = _interopRequireDefault(require("intersect"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _logger = _interopRequireDefault(require("../logger"));
var SchemaController = _interopRequireWildcard(require("./SchemaController"));
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
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
const case_insensitive_username = process.env.CREATE_INDEX_CASE_INSENSITIVE_USERNAME || false;
const case_insensitive_email = process.env.CREATE_INDEX_CASE_INSENSITIVE_EMAIL || false;
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
    const keyUpdate = originalObject[key];
    // determine if that was an op
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
  constructor(adapter, schemaCache) {
    this.adapter = adapter;
    this.schemaCache = schemaCache;
    // We don't want a mutable this.schema, because then you could have
    // one request that uses different schemas for different parts of
    // it. Instead, use loadSchema to get a schema.
    this.schemaPromise = null;
    this._transactionalSession = null;
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
    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
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
        return sanitizeDatabaseResult(originalUpdate, result);
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
          return sanitizeDatabaseResult(originalObject, result.ops[0]);
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
      return schemaFields.indexOf(field) < 0;
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
    return Promise.all([this.adapter.deleteAllClasses(fast), this.schemaCache.clear()]);
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
          if (!SchemaController.fieldNameIsValid(rootFieldName)) {
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
      const ors = permFields.flatMap(key => {
        // constraint for single pointer setup
        const q = {
          [key]: userPointer
        };
        // constraint for users-array setup
        const qa = {
          [key]: {
            $all: [userPointer]
          }
        };
        // if we already have a constraint on the key, use the $and
        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return [{
            $and: [q, query]
          }, {
            $and: [qa, query]
          }];
        }
        // otherwise just add the constaint
        return [Object.assign({}, query, q), Object.assign({}, query, qa)];
      });
      return {
        $or: ors
      };
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
  performInitialization() {
    const requiredUserFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Role)
    };
    const userClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    const roleClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    let promises = [];
    if (case_insensitive_username) {
      const usernameUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['username'])).catch(error => {
        _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);
        throw error;
      });
      promises.push(usernameUniqueness);
      const usernameCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true)).catch(error => {
        _logger.default.warn('Unable to create case insensitive username index: ', error);
        throw error;
      });
      promises.push(usernameCaseInsensitiveIndex);
    }
    if (case_insensitive_email) {
      const emailUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email'])).catch(error => {
        _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);
        throw error;
      });
      promises.push(emailUniqueness);
      const emailCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true)).catch(error => {
        _logger.default.warn('Unable to create case insensitive email index: ', error);
        throw error;
      });
      promises.push(emailCaseInsensitiveIndex);
    }
    const roleUniqueness = roleClassPromise.then(() => this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);
      throw error;
    });
    promises.push(roleUniqueness);
    const indexPromise = this.adapter.updateSchemaWithIndexes();

    // Create tables for volatile classes
    const adapterInit = this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    promises.push(adapterInit);
    promises.push(indexPromise);
    return Promise.all(promises);
  }
}
module.exports = DatabaseController;
// Expose validateQuery for tests
module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfZGVlcGNvcHkiLCJfbG9nZ2VyIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwiZXhjbHVkZWQiLCJfb2JqZWN0V2l0aG91dFByb3BlcnRpZXNMb29zZSIsInNvdXJjZVN5bWJvbEtleXMiLCJpbmRleE9mIiwicHJvcGVydHlJc0VudW1lcmFibGUiLCJzb3VyY2VLZXlzIiwiY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZSIsInByb2Nlc3MiLCJlbnYiLCJDUkVBVEVfSU5ERVhfQ0FTRV9JTlNFTlNJVElWRV9VU0VSTkFNRSIsImNhc2VfaW5zZW5zaXRpdmVfZW1haWwiLCJDUkVBVEVfSU5ERVhfQ0FTRV9JTlNFTlNJVElWRV9FTUFJTCIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZiIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5a2V5cyIsImlzU3BlY2lhbFF1ZXJ5S2V5IiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCIkYW5kIiwiJG5vciIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImlzTWFzdGVyIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSIsInN0YXJ0c1dpdGgiLCJtYXAiLCJzdWJzdHJpbmciLCJuZXdQcm90ZWN0ZWRGaWVsZHMiLCJvdmVycmlkZVByb3RlY3RlZEZpZWxkcyIsInBvaW50ZXJQZXJtIiwicG9pbnRlclBlcm1JbmNsdWRlc1VzZXIiLCJyZWFkVXNlckZpZWxkVmFsdWUiLCJpc0FycmF5Iiwic29tZSIsIm9iamVjdElkIiwiZmllbGRzIiwidiIsImluY2x1ZGVzIiwiaXNVc2VyQ2xhc3MiLCJrIiwidGVtcG9yYXJ5S2V5cyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfdG9tYnN0b25lIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5IiwiZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsInNwbGl0IiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwiam9pbiIsInNhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcmlnaW5hbE9iamVjdCIsInJlc3BvbnNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJrZXlVcGRhdGUiLCJfX29wIiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJfcmVmMiIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwic2NoZW1hQ2FjaGUiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsImNsYXNzTmFtZUlzVmFsaWQiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJvcHRpb25zIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsInMiLCJjYW5BZGRGaWVsZCIsInVwZGF0ZSIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwiZGVlcGNvcHkiLCJyZWxhdGlvblVwZGF0ZXMiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjb2xsZWN0UmVsYXRpb25VcGRhdGVzIiwiYWRkUG9pbnRlclBlcm1pc3Npb25zIiwiY2F0Y2giLCJlcnJvciIsInJvb3RGaWVsZE5hbWUiLCJmaWVsZE5hbWVJc1ZhbGlkIiwidXBkYXRlT3BlcmF0aW9uIiwiaW5uZXJLZXkiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIm9wcyIsImRlbGV0ZU1lIiwib3AiLCJ4IiwicGVuZGluZyIsImFkZFJlbGF0aW9uIiwicmVtb3ZlUmVsYXRpb24iLCJhbGwiLCJmcm9tQ2xhc3NOYW1lIiwiZnJvbUlkIiwidG9JZCIsImRvYyIsImNvZGUiLCJkZXN0cm95IiwicGFyc2VGb3JtYXRTY2hlbWEiLCJjcmVhdGUiLCJjcmVhdGVkQXQiLCJpc28iLCJfX3R5cGUiLCJ1cGRhdGVkQXQiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJjcmVhdGVPYmplY3QiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwiY2xhc3NTY2hlbWEiLCJzY2hlbWFEYXRhIiwic2NoZW1hRmllbGRzIiwibmV3S2V5cyIsImZpZWxkIiwiYWN0aW9uIiwiZGVsZXRlRXZlcnl0aGluZyIsImZhc3QiLCJkZWxldGVBbGxDbGFzc2VzIiwiY2xlYXIiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJwcm9taXNlcyIsInF1ZXJpZXMiLCJjb25zdHJhaW50S2V5IiwiaXNOZWdhdGlvbiIsInIiLCJxIiwiaWRzIiwiYWRkTm90SW5PYmplY3RJZHNJZHMiLCJhZGRJbk9iamVjdElkc0lkcyIsInJlZHVjZVJlbGF0aW9uS2V5cyIsInJlbGF0ZWRUbyIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJyZWFkUHJlZmVyZW5jZSIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZsYXRNYXAiLCJxYSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsImFjYyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJ1c2VyQ2xhc3NQcm9taXNlIiwicm9sZUNsYXNzUHJvbWlzZSIsInVzZXJuYW1lVW5pcXVlbmVzcyIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwidXNlcm5hbWVDYXNlSW5zZW5zaXRpdmVJbmRleCIsImVuc3VyZUluZGV4IiwiZW1haWxVbmlxdWVuZXNzIiwiZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCIsInJvbGVVbmlxdWVuZXNzIiwiaW5kZXhQcm9taXNlIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJhZGFwdGVySW5pdCIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIu+7vy8vIEBmbG93XG4vLyBBIGRhdGFiYXNlIGFkYXB0ZXIgdGhhdCB3b3JrcyB3aXRoIGRhdGEgZXhwb3J0ZWQgZnJvbSB0aGUgaG9zdGVkXG4vLyBQYXJzZSBkYXRhYmFzZS5cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgaW50ZXJzZWN0IGZyb20gJ2ludGVyc2VjdCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUge1xuICBRdWVyeU9wdGlvbnMsXG4gIEZ1bGxRdWVyeU9wdGlvbnMsXG59IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuXG5jb25zdCBjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lID0gcHJvY2Vzcy5lbnYuQ1JFQVRFX0lOREVYX0NBU0VfSU5TRU5TSVRJVkVfVVNFUk5BTUUgfHwgZmFsc2U7XG5jb25zdCBjYXNlX2luc2Vuc2l0aXZlX2VtYWlsID0gcHJvY2Vzcy5lbnYuQ1JFQVRFX0lOREVYX0NBU0VfSU5TRU5TSVRJVkVfRU1BSUwgfHwgZmFsc2U7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5a2V5cyA9IFtcbiAgJyRhbmQnLFxuICAnJG9yJyxcbiAgJyRub3InLFxuICAnX3JwZXJtJyxcbiAgJ193cGVybScsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxRdWVyeUtleSA9IChrZXkpID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxRdWVyeWtleXMuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnkpOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goKGtleSkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIWlzU3BlY2lhbFF1ZXJ5S2V5KGtleSkgJiYgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YFxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoKGtleSkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaCgocG9pbnRlclBlcm0pID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgKHVzZXIpID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goKGZpZWxkcykgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcigodikgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKChrKSA9PiBkZWxldGUgb2JqZWN0W2tdKTtcblxuICAgIC8vIGZpZWxkcyBub3QgcmVxdWVzdGVkIGJ5IGNsaWVudCAoZXhjbHVkZWQpLFxuICAgIC8vYnV0IHdlcmUgbmVlZGVkIHRvIGFwcGx5IHByb3RlY3R0ZWRGaWVsZHNcbiAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cy5mb3JFYWNoKChrKSA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcblxuICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll90b21ic3RvbmU7XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9mYWlsZWRfbG9naW5fY291bnQ7XG4gIGRlbGV0ZSBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9oaXN0b3J5O1xuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmltcG9ydCB0eXBlIHsgTG9hZFNjaGVtYU9wdGlvbnMgfSBmcm9tICcuL3R5cGVzJztcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSAoa2V5KSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGV4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gIGNvbnN0IG5leHRQYXRoID0gcGF0aC5zbGljZSgxKS5qb2luKCcuJyk7XG4gIG9iamVjdFtmaXJzdEtleV0gPSBleHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSB8fCB7fSxcbiAgICBuZXh0UGF0aCxcbiAgICB2YWx1ZVtmaXJzdEtleV1cbiAgKTtcbiAgZGVsZXRlIG9iamVjdFtrZXldO1xuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCByZXNwb25zZSA9IHt9O1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG4gIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgIGlmIChcbiAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIGtleVVwZGF0ZS5fX29wICYmXG4gICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICApIHtcbiAgICAgIC8vIG9ubHkgdmFsaWQgb3BzIHRoYXQgcHJvZHVjZSBhbiBhY3Rpb25hYmxlIHJlc3VsdFxuICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmQgb24gYSBrZXlwYXRoXG4gICAgICBleHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbn1cblxuZnVuY3Rpb24gam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSkge1xuICByZXR1cm4gYF9Kb2luOiR7a2V5fToke2NsYXNzTmFtZX1gO1xufVxuXG5jb25zdCBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlID0gKG9iamVjdCkgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gW107XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgICBgVGhlICR7b2JqZWN0W2tleV0uX19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BdXRoRGF0YSA9IChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSA9PiB7XG4gIGlmIChvYmplY3QuYXV0aERhdGEgJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0LmF1dGhEYXRhKS5mb3JFYWNoKChwcm92aWRlcikgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgcmVhZDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3JlYWQnXSA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAoX3dwZXJtIHx8IFtdKS5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgaWYgKCFvdXRwdXQuQUNMW2VudHJ5XSkge1xuICAgICAgICBvdXRwdXQuQUNMW2VudHJ5XSA9IHsgd3JpdGU6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWyd3cml0ZSddID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxuLyoqXG4gKiBXaGVuIHF1ZXJ5aW5nLCB0aGUgZmllbGROYW1lIG1heSBiZSBjb21wb3VuZCwgZXh0cmFjdCB0aGUgcm9vdCBmaWVsZE5hbWVcbiAqICAgICBgdGVtcGVyYXR1cmUuY2Vsc2l1c2AgYmVjb21lcyBgdGVtcGVyYXR1cmVgXG4gKiBAcGFyYW0ge3N0cmluZ30gZmllbGROYW1lIHRoYXQgbWF5IGJlIGEgY29tcG91bmQgZmllbGQgbmFtZVxuICogQHJldHVybnMge3N0cmluZ30gdGhlIHJvb3QgbmFtZSBvZiB0aGUgZmllbGRcbiAqL1xuY29uc3QgZ2V0Um9vdEZpZWxkTmFtZSA9IChmaWVsZE5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbn07XG5cbmNvbnN0IHJlbGF0aW9uU2NoZW1hID0ge1xuICBmaWVsZHM6IHsgcmVsYXRlZElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIG93bmluZ0lkOiB7IHR5cGU6ICdTdHJpbmcnIH0gfSxcbn07XG5cbmNsYXNzIERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFDYWNoZTogYW55O1xuICBzY2hlbWFQcm9taXNlOiA/UHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+O1xuICBfdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnk7XG5cbiAgY29uc3RydWN0b3IoYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIHNjaGVtYUNhY2hlOiBhbnkpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGUgPSBzY2hlbWFDYWNoZTtcbiAgICAvLyBXZSBkb24ndCB3YW50IGEgbXV0YWJsZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSB0aGVuIHlvdSBjb3VsZCBoYXZlXG4gICAgLy8gb25lIHJlcXVlc3QgdGhhdCB1c2VzIGRpZmZlcmVudCBzY2hlbWFzIGZvciBkaWZmZXJlbnQgcGFydHMgb2ZcbiAgICAvLyBpdC4gSW5zdGVhZCwgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oKHNjaGVtYUNvbnRyb2xsZXIpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbigoc2NoZW1hKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KVxuICAgICAgKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZVxuICAgICAgICApXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQoXG4gICAgICB0aGlzLmFkYXB0ZXIsXG4gICAgICB0aGlzLnNjaGVtYUNhY2hlLFxuICAgICAgb3B0aW9uc1xuICAgICk7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlLnRoZW4oXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlLFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIGxvYWRTY2hlbWFJZk5lZWRlZChcbiAgICBzY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcilcbiAgICAgIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKChzY2hlbWEpID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbigocykgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoXG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgcnVuT3B0aW9uc1xuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0LCBhZGRzRmllbGQgfTogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHNraXBTYW5pdGl6YXRpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHVwZGF0ZTtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgdXBkYXRlID0gZGVlcGNvcHkodXBkYXRlKTtcbiAgICB2YXIgcmVsYXRpb25VcGRhdGVzID0gW107XG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihcbiAgICAgIChzY2hlbWFDb250cm9sbGVyKSA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1cGRhdGVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICBpZiAoYWRkc0ZpZWxkKSB7XG4gICAgICAgICAgICAgICAgcXVlcnkgPSB7XG4gICAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAnYWRkRmllbGQnLFxuICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC50aGVuKChzY2hlbWEpID0+IHtcbiAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goKGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUpICYmXG4gICAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gJiZcbiAgICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgICAoaW5uZXJLZXkpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7fSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtYW55KSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgaWYgKHNraXBTYW5pdGl6YXRpb24pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxVcGRhdGUsIHJlc3VsdCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdElkOiBzdHJpbmcsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgb3BzOiBhbnlcbiAgKSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKFxuICAgICAgICAgICAgdGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZClcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaChcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHBlbmRpbmcpO1xuICB9XG5cbiAgLy8gQWRkcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIGFkZCB3YXMgc3VjY2Vzc2Z1bC5cbiAgYWRkUmVsYXRpb24oXG4gICAga2V5OiBzdHJpbmcsXG4gICAgZnJvbUNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZyb21JZDogc3RyaW5nLFxuICAgIHRvSWQ6IHN0cmluZ1xuICApIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihcbiAgICBrZXk6IHN0cmluZyxcbiAgICBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZnJvbUlkOiBzdHJpbmcsXG4gICAgdG9JZDogc3RyaW5nXG4gICkge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKFxuICAgICAgKHNjaGVtYUNvbnRyb2xsZXIpID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBkZWxldGUgYnkgcXVlcnlcbiAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigocGFyc2VGb3JtYXRTY2hlbWEpID0+XG4gICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICAvLyBXaGVuIGRlbGV0aW5nIHNlc3Npb25zIHdoaWxlIGNoYW5naW5nIHBhc3N3b3JkcywgZG9uJ3QgdGhyb3cgYW4gZXJyb3IgaWYgdGhleSBkb24ndCBoYXZlIGFueSBzZXNzaW9ucy5cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJlxuICAgICAgICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkRcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIC8vIEluc2VydHMgYW4gb2JqZWN0IGludG8gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCBzYXZlZC5cbiAgY3JlYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIGNvbnN0IG9yaWdpbmFsT2JqZWN0ID0gb2JqZWN0O1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuXG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBudWxsLFxuICAgICAgb2JqZWN0XG4gICAgKTtcblxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbigoc2NoZW1hQ29udHJvbGxlcikgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oKHNjaGVtYSkgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKChmaWVsZCkgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChcbiAgICAgICAgb2JqZWN0W2ZpZWxkXSAmJlxuICAgICAgICBvYmplY3RbZmllbGRdLl9fb3AgJiZcbiAgICAgICAgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihmaWVsZCkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQWxsQ2xhc3NlcyhmYXN0KSxcbiAgICAgIHRoaXMuc2NoZW1hQ2FjaGUuY2xlYXIoKSxcbiAgICBdKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgb3duaW5nSWQgfSxcbiAgICAgICAgZmluZE9wdGlvbnNcbiAgICAgIClcbiAgICAgIC50aGVuKChyZXN1bHRzKSA9PiByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICByZWxhdGVkSWRzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAgeyBrZXlzOiBbJ293bmluZ0lkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4oKHJlc3VsdHMpID0+IHJlc3VsdHMubWFwKChyZXN1bHQpID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oXG4gICAgICAgICAgICAoYVF1ZXJ5KSA9PiB7XG4gICAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKChrZXkpID0+IHtcbiAgICAgIGNvbnN0IHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICghdCB8fCB0LnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9XG4gICAgICBsZXQgcXVlcmllczogPyhhbnlbXSkgPSBudWxsO1xuICAgICAgaWYgKFxuICAgICAgICBxdWVyeVtrZXldICYmXG4gICAgICAgIChxdWVyeVtrZXldWyckaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuZSddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5pbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBsaXN0IG9mIHF1ZXJpZXNcbiAgICAgICAgcXVlcmllcyA9IE9iamVjdC5rZXlzKHF1ZXJ5W2tleV0pLm1hcCgoY29uc3RyYWludEtleSkgPT4ge1xuICAgICAgICAgIGxldCByZWxhdGVkSWRzO1xuICAgICAgICAgIGxldCBpc05lZ2F0aW9uID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRLZXkgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckaW4nKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gcXVlcnlba2V5XVsnJGluJ10ubWFwKChyKSA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKChyKSA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuZScpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldWyckbmUnXS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24sXG4gICAgICAgICAgICByZWxhdGVkSWRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcyA9IFt7IGlzTmVnYXRpb246IGZhbHNlLCByZWxhdGVkSWRzOiBbXSB9XTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBjdXJyZW50IHF1ZXJ5S2V5IGFzIHdlIGRvbix0IG5lZWQgaXQgYW55bW9yZVxuICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAvLyBleGVjdXRlIGVhY2ggcXVlcnkgaW5kZXBlbmRlbnRseSB0byBidWlsZCB0aGUgbGlzdCBvZlxuICAgICAgLy8gJGluIC8gJG5pblxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBxdWVyaWVzLm1hcCgocSkgPT4ge1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMub3duaW5nSWRzKGNsYXNzTmFtZSwga2V5LCBxLnJlbGF0ZWRJZHMpLnRoZW4oKGlkcykgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBxdWVyeU9wdGlvbnM6IGFueVxuICApOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKChhUXVlcnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKGlkcykgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW1xuICAgICAgaWRzRnJvbVN0cmluZyxcbiAgICAgIGlkc0Zyb21FcSxcbiAgICAgIGlkc0Zyb21JbixcbiAgICAgIGlkcyxcbiAgICBdLmZpbHRlcigobGlzdCkgPT4gbGlzdCAhPT0gbnVsbCk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcigobGlzdCkgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHxcbiAgICAgICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMVxuICAgICAgICA/ICdnZXQnXG4gICAgICAgIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKFxuICAgICAgKHNjaGVtYUNvbnRyb2xsZXIpID0+IHtcbiAgICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgICAvLyBGb3Igbm93LCBwcmV0ZW5kIHRoZSBjbGFzcyBleGlzdHMgYnV0IGhhcyBubyBvYmplY3RzLFxuICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbigoc2NoZW1hKSA9PiB7XG4gICAgICAgICAgICAvLyBQYXJzZS5jb20gdHJlYXRzIHF1ZXJpZXMgb24gX2NyZWF0ZWRfYXQgYW5kIF91cGRhdGVkX2F0IGFzIGlmIHRoZXkgd2VyZSBxdWVyaWVzIG9uIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0LFxuICAgICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgICAgaWYgKHNvcnQuX2NyZWF0ZWRfYXQpIHtcbiAgICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgICAgZGVsZXRlIHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKHNvcnQpLmZvckVhY2goKGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICBgQ2Fubm90IHNvcnQgYnkgJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICAgIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICAgIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgcHJvdGVjdGVkRmllbGRzO1xuICAgICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIC8qIERvbid0IHVzZSBwcm9qZWN0aW9ucyB0byBvcHRpbWl6ZSB0aGUgcHJvdGVjdGVkRmllbGRzIHNpbmNlIHRoZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgIGJhc2VkIG9uIHBvaW50ZXItcGVybWlzc2lvbnMgYXJlIGRldGVybWluZWQgYWZ0ZXIgcXVlcnlpbmcuIFRoZSBmaWx0ZXJpbmcgY2FuXG4gICAgICAgICAgICAgICAgICBvdmVyd3JpdGUgdGhlIHByb3RlY3RlZCBmaWVsZHMuICovXG4gICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ3VwZGF0ZScgfHwgb3AgPT09ICdkZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkUmVhZEFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvdW50KFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICAgIGhpbnRcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRpc3RpbmN0KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgICBkaXN0aW5jdFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hZ2dyZWdhdGUoXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgICBwaXBlbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICAgIGV4cGxhaW5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKChvYmplY3RzKSA9PlxuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKChvYmplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCA9IHVudHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvclxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbigoc2NoZW1hQ29udHJvbGxlcikgPT5cbiAgICAgICAgc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSlcbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKGNvdW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbigod2FzUGFyc2VDb2xsZWN0aW9uKSA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICAoZmllbGROYW1lKSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcCgobmFtZSkgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKChhY2wpID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTFcbiAgICAgICAgPyAncmVhZFVzZXJGaWVsZHMnXG4gICAgICAgIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG9ycyA9IHBlcm1GaWVsZHMuZmxhdE1hcCgoa2V5KSA9PiB7XG4gICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgIGNvbnN0IHEgPSB7XG4gICAgICAgICAgW2tleV06IHVzZXJQb2ludGVyLFxuICAgICAgICB9O1xuICAgICAgICAvLyBjb25zdHJhaW50IGZvciB1c2Vycy1hcnJheSBzZXR1cFxuICAgICAgICBjb25zdCBxYSA9IHtcbiAgICAgICAgICBba2V5XTogeyAkYWxsOiBbdXNlclBvaW50ZXJdIH0sXG4gICAgICAgIH07XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gW3sgJGFuZDogW3EsIHF1ZXJ5XSB9LCB7ICRhbmQ6IFtxYSwgcXVlcnldIH1dO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBbT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHEpLCBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcWEpXTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHsgJG9yOiBvcnMgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaCgoZmllbGRzKSA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcigodikgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm90ZWN0ZWRLZXlzO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKClcbiAgICAgIC50aGVuKCh0cmFuc2FjdGlvbmFsU2Vzc2lvbikgPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gYWJvcnQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IHVzZXJDbGFzc1Byb21pc2UgPSB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKChzY2hlbWEpID0+XG4gICAgICBzY2hlbWEuZW5mb3JjZUNsYXNzRXhpc3RzKCdfVXNlcicpXG4gICAgKTtcbiAgICBjb25zdCByb2xlQ2xhc3NQcm9taXNlID0gdGhpcy5sb2FkU2NoZW1hKCkudGhlbigoc2NoZW1hKSA9PlxuICAgICAgc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKVxuICAgICk7XG5cbiAgICBsZXQgcHJvbWlzZXMgPSBbXTtcbiAgICBpZiAoY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZSkge1xuICAgICAgY29uc3QgdXNlcm5hbWVVbmlxdWVuZXNzID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKVxuICAgICAgICApXG4gICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgICBcbiAgICAgIHByb21pc2VzLnB1c2godXNlcm5hbWVVbmlxdWVuZXNzKTtcblxuICAgICAgY29uc3QgdXNlcm5hbWVDYXNlSW5zZW5zaXRpdmVJbmRleCA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlSW5kZXgoXG4gICAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgICAgcmVxdWlyZWRVc2VyRmllbGRzLFxuICAgICAgICAgICAgWyd1c2VybmFtZSddLFxuICAgICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgICAnVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLFxuICAgICAgICAgICAgZXJyb3JcbiAgICAgICAgICApO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICAgICAgcHJvbWlzZXMucHVzaCh1c2VybmFtZUNhc2VJbnNlbnNpdGl2ZUluZGV4KTtcbiAgICB9XG4gICAgaWYgKGNhc2VfaW5zZW5zaXRpdmVfZW1haWwpIHtcbiAgICAgIGNvbnN0IGVtYWlsVW5pcXVlbmVzcyA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddKVxuICAgICAgKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICAnVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJyxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgICAgcHJvbWlzZXMucHVzaChlbWFpbFVuaXF1ZW5lc3MpO1xuICAgICAgY29uc3QgZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlSW5kZXgoXG4gICAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgICAgcmVxdWlyZWRVc2VyRmllbGRzLFxuICAgICAgICAgICAgWydlbWFpbCddLFxuICAgICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICAgIFxuICAgICAgcHJvbWlzZXMucHVzaChlbWFpbENhc2VJbnNlbnNpdGl2ZUluZGV4KTtcbiAgICB9XG4gICAgXG5cbiAgICBjb25zdCByb2xlVW5pcXVlbmVzcyA9IHJvbGVDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pXG4gICAgICApXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgcHJvbWlzZXMucHVzaChyb2xlVW5pcXVlbmVzcyk7XG4gICAgY29uc3QgaW5kZXhQcm9taXNlID0gdGhpcy5hZGFwdGVyLnVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk7XG5cbiAgICAvLyBDcmVhdGUgdGFibGVzIGZvciB2b2xhdGlsZSBjbGFzc2VzXG4gICAgY29uc3QgYWRhcHRlckluaXQgPSB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKGFkYXB0ZXJJbml0KTtcbiAgICBwcm9taXNlcy5wdXNoKGluZGV4UHJvbWlzZSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSkgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFLQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFFQSxJQUFBQyxPQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFFQSxJQUFBRyxVQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFFQSxJQUFBSSxTQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFILHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBTSxnQkFBQSxHQUFBQyx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVEsZUFBQSxHQUFBUixPQUFBO0FBQW9FLFNBQUFTLHlCQUFBQyxXQUFBLGVBQUFDLE9BQUEsa0NBQUFDLGlCQUFBLE9BQUFELE9BQUEsUUFBQUUsZ0JBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxXQUFBLFdBQUFBLFdBQUEsR0FBQUcsZ0JBQUEsR0FBQUQsaUJBQUEsS0FBQUYsV0FBQTtBQUFBLFNBQUFILHdCQUFBTyxHQUFBLEVBQUFKLFdBQUEsU0FBQUEsV0FBQSxJQUFBSSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxXQUFBRCxHQUFBLFFBQUFBLEdBQUEsb0JBQUFBLEdBQUEsd0JBQUFBLEdBQUEsNEJBQUFFLE9BQUEsRUFBQUYsR0FBQSxVQUFBRyxLQUFBLEdBQUFSLHdCQUFBLENBQUFDLFdBQUEsT0FBQU8sS0FBQSxJQUFBQSxLQUFBLENBQUFDLEdBQUEsQ0FBQUosR0FBQSxZQUFBRyxLQUFBLENBQUFFLEdBQUEsQ0FBQUwsR0FBQSxTQUFBTSxNQUFBLFdBQUFD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