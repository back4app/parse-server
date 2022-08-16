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
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id; // replace protectedFields when using pointer-permissions

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
      let overrideProtectedFields = false; // check if the object grants the current user access based on the extracted fields

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
      }); // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C

      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      } // intersect all sets of protectedFields


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
    protectedFields && protectedFields.forEach(k => delete object[k]); // fields not requested by client (excluded),
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
}; // Runs an update on the database.
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
}; // Transforms a Database format ACL to a REST API format ACL


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
    this.idempotencyOptions = this.options.idempotencyOptions || {}; // Prevent mutable this.schema, otherwise one request could use
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
  } // Returns a promise for a schemaController.


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
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  } // Removes a relation.
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
  } // Won't delete collections in the system namespace

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
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
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
  } // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json


  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  } // Naive logic reducer for OR operations meant to be used only for pointer permissions.


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
  } // Naive logic reducer for AND operations meant to be used only for pointer permissions.


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
  } // Constraints query using CLP's pointer permissions (PP) if any.
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
    } // the ACL should have exactly 1 user


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
        } // if we already have a constraint on the key, use the $and


        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        } // otherwise just add the constaint


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
    if (aclGroup.indexOf(query.objectId) > -1) return null; // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'

    const preserveKeys = queryOptions.keys; // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)

    const serverOnlyKeys = [];
    const authenticated = auth.user; // map to allow check without array search

    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {}); // array of sets of protected fields. separate item for each applicable criteria

    const protectedKeysSets = [];

    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);

          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName); // 2. preserve it delete later

            serverOnlyKeys.push(fieldName);
          }
        }

        continue;
      } // add public tier


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
    } // check if there's a rule for current user's id


    if (authenticated) {
      const userId = auth.user.id;

      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    } // preserve fields to be removed before sending response to client


    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }

    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }

      return acc;
    }, []); // intersect all sets of protectedFields

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
  } // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
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
    const nextPath = path.slice(1).join('.'); // Scan request data for denied keywords

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
      const keyUpdate = originalObject[key]; // determine if that was an op

      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
      }
    });
    return Promise.resolve(response);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJhZGRXcml0ZUFDTCIsInF1ZXJ5IiwiYWNsIiwibmV3UXVlcnkiLCJfIiwiY2xvbmVEZWVwIiwiX3dwZXJtIiwiJGluIiwiYWRkUmVhZEFDTCIsIl9ycGVybSIsInRyYW5zZm9ybU9iamVjdEFDTCIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsInB1c2giLCJ3cml0ZSIsInNwZWNpYWxRdWVyeWtleXMiLCJpc1NwZWNpYWxRdWVyeUtleSIsImtleSIsImluZGV4T2YiLCJ2YWxpZGF0ZVF1ZXJ5IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIk9iamVjdCIsImtleXMiLCIkcmVnZXgiLCIkb3B0aW9ucyIsIm1hdGNoIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJpc01hc3RlciIsImFjbEdyb3VwIiwiYXV0aCIsIm9wZXJhdGlvbiIsInNjaGVtYSIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsInVzZXJJZCIsInVzZXIiLCJpZCIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNSZWFkT3BlcmF0aW9uIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJmaWx0ZXIiLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwidmFsdWUiLCJuZXdQcm90ZWN0ZWRGaWVsZHMiLCJvdmVycmlkZVByb3RlY3RlZEZpZWxkcyIsInBvaW50ZXJQZXJtIiwicG9pbnRlclBlcm1JbmNsdWRlc1VzZXIiLCJyZWFkVXNlckZpZWxkVmFsdWUiLCJpc0FycmF5Iiwic29tZSIsIm9iamVjdElkIiwiZmllbGRzIiwidiIsImluY2x1ZGVzIiwiaXNVc2VyQ2xhc3MiLCJrIiwidGVtcG9yYXJ5S2V5cyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfdG9tYnN0b25lIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5Iiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJfX29wIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwib3V0cHV0IiwiZ2V0Um9vdEZpZWxkTmFtZSIsInNwbGl0IiwicmVsYXRpb25TY2hlbWEiLCJyZWxhdGVkSWQiLCJvd25pbmdJZCIsIkRhdGFiYXNlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsIm9wdGlvbnMiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJydW5PcHRpb25zIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwidXBkYXRlIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJhbmRzIiwicHJvbWlzZXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJhZ2dyZWdhdGUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJkZWxldGVTY2hlbWEiLCJkZWxldGVDbGFzcyIsIndhc1BhcnNlQ29sbGVjdGlvbiIsInJlbGF0aW9uRmllbGROYW1lcyIsIm5hbWUiLCJkZWwiLCJyZWxvYWREYXRhIiwib2JqZWN0VG9FbnRyaWVzU3RyaW5ncyIsImVudHJpZXMiLCJhIiwiSlNPTiIsInN0cmluZ2lmeSIsImpvaW4iLCJyZWR1Y2VPck9wZXJhdGlvbiIsInJlcGVhdCIsImkiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJlbnN1cmVJbmRleCIsImlzTW9uZ29BZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImlzUG9zdGdyZXNBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInR0bCIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsIl9leHBhbmRSZXN1bHRPbktleVBhdGgiLCJwYXRoIiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJVdGlscyIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJyZXNwb25zZSIsImtleVVwZGF0ZSIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5a2V5cyA9IFtcbiAgJyRhbmQnLFxuICAnJG9yJyxcbiAgJyRub3InLFxuICAnX3JwZXJtJyxcbiAgJ193cGVybScsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxRdWVyeUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsUXVlcnlrZXlzLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChxdWVyeTogYW55KTogdm9pZCA9PiB7XG4gIGlmIChxdWVyeS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0Nhbm5vdCBxdWVyeSBvbiBBQ0wuJyk7XG4gIH1cblxuICBpZiAocXVlcnkuJG9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRvciBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kb3IuZm9yRWFjaCh2YWxpZGF0ZVF1ZXJ5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaCh2YWxpZGF0ZVF1ZXJ5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG5vciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgb2YgYXQgbGVhc3QgMSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5W2tleV0gJiYgcXVlcnlba2V5XS4kcmVnZXgpIHtcbiAgICAgIGlmICh0eXBlb2YgcXVlcnlba2V5XS4kb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFxdWVyeVtrZXldLiRvcHRpb25zLm1hdGNoKC9eW2lteHNdKyQvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICBgQmFkICRvcHRpb25zIHZhbHVlIGZvciBxdWVyeTogJHtxdWVyeVtrZXldLiRvcHRpb25zfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghaXNTcGVjaWFsUXVlcnlLZXkoa2V5KSAmJiAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBhY2xHcm91cDogYW55W10sXG4gIGF1dGg6IGFueSxcbiAgb3BlcmF0aW9uOiBhbnksXG4gIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgcHJvdGVjdGVkRmllbGRzOiBudWxsIHwgQXJyYXk8YW55PixcbiAgb2JqZWN0OiBhbnlcbikgPT4ge1xuICBsZXQgdXNlcklkID0gbnVsbDtcbiAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG5cbiAgLy8gcmVwbGFjZSBwcm90ZWN0ZWRGaWVsZHMgd2hlbiB1c2luZyBwb2ludGVyLXBlcm1pc3Npb25zXG4gIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuICBpZiAocGVybXMpIHtcbiAgICBjb25zdCBpc1JlYWRPcGVyYXRpb24gPSBbJ2dldCcsICdmaW5kJ10uaW5kZXhPZihvcGVyYXRpb24pID4gLTE7XG5cbiAgICBpZiAoaXNSZWFkT3BlcmF0aW9uICYmIHBlcm1zLnByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gZXh0cmFjdCBwcm90ZWN0ZWRGaWVsZHMgYWRkZWQgd2l0aCB0aGUgcG9pbnRlci1wZXJtaXNzaW9uIHByZWZpeFxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0gPSBPYmplY3Qua2V5cyhwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IGtleS5zdWJzdHJpbmcoMTApLCB2YWx1ZTogcGVybXMucHJvdGVjdGVkRmllbGRzW2tleV0gfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG5ld1Byb3RlY3RlZEZpZWxkczogQXJyYXk8c3RyaW5nPltdID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJiByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIC8vIGlmIHRoZXJlJ3JlIG5vIHByb3RjdGVkRmllbGRzIGJ5IG90aGVyIGNyaXRlcmlhICggaWQgLyByb2xlIC8gYXV0aClcbiAgICAgICAgICAvLyB0aGVuIHdlIG11c3QgaW50ZXJzZWN0IGVhY2ggc2V0IChwZXIgdXNlckZpZWxkKVxuICAgICAgICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBmaWVsZHM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG5cbiAgLyogc3BlY2lhbCB0cmVhdCBmb3IgdGhlIHVzZXIgY2xhc3M6IGRvbid0IGZpbHRlciBwcm90ZWN0ZWRGaWVsZHMgaWYgY3VycmVudGx5IGxvZ2dlZGluIHVzZXIgaXNcbiAgdGhlIHJldHJpZXZlZCB1c2VyICovXG4gIGlmICghKGlzVXNlckNsYXNzICYmIHVzZXJJZCAmJiBvYmplY3Qub2JqZWN0SWQgPT09IHVzZXJJZCkpIHtcbiAgICBwcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcblxuICAgIC8vIGZpZWxkcyBub3QgcmVxdWVzdGVkIGJ5IGNsaWVudCAoZXhjbHVkZWQpLFxuICAgIC8vYnV0IHdlcmUgbmVlZGVkIHRvIGFwcGx5IHByb3RlY3R0ZWRGaWVsZHNcbiAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG4gIH1cblxuICBpZiAoIWlzVXNlckNsYXNzKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICBkZWxldGUgb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG5cbiAgZGVsZXRlIG9iamVjdC5zZXNzaW9uVG9rZW47XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW47XG4gIGRlbGV0ZSBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW47XG4gIGRlbGV0ZSBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fdG9tYnN0b25lO1xuICBkZWxldGUgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fZmFpbGVkX2xvZ2luX2NvdW50O1xuICBkZWxldGUgb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcbiAgZGVsZXRlIG9iamVjdC5fcGFzc3dvcmRfaGlzdG9yeTtcblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBpZGVtcG90ZW5jeU9wdGlvbnM6IGFueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zID0gdGhpcy5vcHRpb25zLmlkZW1wb3RlbmN5T3B0aW9ucyB8fCB7fTtcbiAgICAvLyBQcmV2ZW50IG11dGFibGUgdGhpcy5zY2hlbWEsIG90aGVyd2lzZSBvbmUgcmVxdWVzdCBjb3VsZCB1c2VcbiAgICAvLyBtdWx0aXBsZSBzY2hlbWFzLCBzbyBpbnN0ZWFkIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwge30pKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQodGhpcy5hZGFwdGVyLCBvcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG5cbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG51bGwsIG9iamVjdCk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIGFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucykpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBoaW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIGRpc3RpbmN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBleHBsYWluXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBzY2hlbWFDb250cm9sbGVyO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgU2NoZW1hQ2FjaGUuZGVsKGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIucmVsb2FkRGF0YSgpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVGhpcyBoZWxwcyB0byBjcmVhdGUgaW50ZXJtZWRpYXRlIG9iamVjdHMgZm9yIHNpbXBsZXIgY29tcGFyaXNvbiBvZlxuICAvLyBrZXkgdmFsdWUgcGFpcnMgdXNlZCBpbiBxdWVyeSBvYmplY3RzLiBFYWNoIGtleSB2YWx1ZSBwYWlyIHdpbGwgcmVwcmVzZW50ZWRcbiAgLy8gaW4gYSBzaW1pbGFyIHdheSB0byBqc29uXG4gIG9iamVjdFRvRW50cmllc1N0cmluZ3MocXVlcnk6IGFueSk6IEFycmF5PHN0cmluZz4ge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyhxdWVyeSkubWFwKGEgPT4gYS5tYXAocyA9PiBKU09OLnN0cmluZ2lmeShzKSkuam9pbignOicpKTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIE9SIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VPck9wZXJhdGlvbihxdWVyeTogeyAkb3I6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kb3IpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRvci5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIGxvbmdlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRvci5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJG9yLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kb3JbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kb3I7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIEFORCBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlQW5kT3BlcmF0aW9uKHF1ZXJ5OiB7ICRhbmQ6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kYW5kKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kYW5kLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgc2hvcnRlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRhbmQuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJGFuZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJGFuZFswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRhbmQ7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgY29uc3QgcGVybUZpZWxkcyA9IFtdO1xuXG4gICAgaWYgKHBlcm1zW29wZXJhdGlvbl0gJiYgcGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKSB7XG4gICAgICBwZXJtRmllbGRzLnB1c2goLi4ucGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKTtcbiAgICB9XG5cbiAgICBpZiAocGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgICBpZiAoIXBlcm1GaWVsZHMuaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGVybUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgaWYgKHBlcm1GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgICAgLy8gTm8gdXNlciBzZXQgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgLy8gSWYgdGhlIGxlbmd0aCBpcyA+IDEsIHRoYXQgbWVhbnMgd2UgZGlkbid0IGRlLWR1cGUgdXNlcnMgY29ycmVjdGx5XG4gICAgICBpZiAodXNlckFDTC5sZW5ndGggIT0gMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VySWQgPSB1c2VyQUNMWzBdO1xuICAgICAgY29uc3QgdXNlclBvaW50ZXIgPSB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBxdWVyaWVzID0gcGVybUZpZWxkcy5tYXAoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9XG4gICAgICAgICAgZmllbGREZXNjcmlwdG9yICYmXG4gICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10sICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJywgdHJ1ZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgdXNlcm5hbWUgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIGVtYWlsIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcbiAgfVxuXG4gIF9leHBhbmRSZXN1bHRPbktleVBhdGgob2JqZWN0OiBhbnksIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICAgIG9iamVjdFtrZXldID0gdmFsdWVba2V5XTtcbiAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgfVxuICAgIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gICAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcblxuICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICBpZiAodGhpcy5vcHRpb25zICYmIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKHsgZmlyc3RLZXk6IHVuZGVmaW5lZCB9LCBrZXl3b3JkLmtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIG9iamVjdFtmaXJzdEtleV0gPSB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgICBvYmplY3RbZmlyc3RLZXldIHx8IHt9LFxuICAgICAgbmV4dFBhdGgsXG4gICAgICB2YWx1ZVtmaXJzdEtleV1cbiAgICApO1xuICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3Q6IGFueSwgcmVzdWx0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0ge307XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhvcmlnaW5hbE9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgICAgaWYgKFxuICAgICAgICBrZXlVcGRhdGUgJiZcbiAgICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAga2V5VXBkYXRlLl9fb3AgJiZcbiAgICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgICApIHtcbiAgICAgICAgLy8gb25seSB2YWxpZCBvcHMgdGhhdCBwcm9kdWNlIGFuIGFjdGlvbmFibGUgcmVzdWx0XG4gICAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5lZCBvbiBhIGtleXBhdGhcbiAgICAgICAgdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gIH1cblxuICBzdGF0aWMgX3ZhbGlkYXRlUXVlcnk6IGFueSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xuIl0sIm1hcHBpbmdzIjoiOztBQUtBOztBQUVBOztBQUVBOztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFLQSxTQUFTQSxXQUFULENBQXFCQyxLQUFyQixFQUE0QkMsR0FBNUIsRUFBaUM7RUFDL0IsTUFBTUMsUUFBUSxHQUFHQyxlQUFBLENBQUVDLFNBQUYsQ0FB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