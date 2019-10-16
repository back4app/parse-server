"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.classNameIsValid = classNameIsValid;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.VolatileClassesSchemas = exports.convertSchemaToAdapterSchema = exports.defaultColumns = exports.systemClasses = exports.load = exports.SchemaController = exports.default = void 0;

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _Config = _interopRequireDefault(require("../Config"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.
// -disable-next
const Parse = require('parse/node').Parse;

const defaultColumns = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    objectId: {
      type: 'String'
    },
    createdAt: {
      type: 'Date'
    },
    updatedAt: {
      type: 'Date'
    },
    ACL: {
      type: 'ACL'
    }
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    username: {
      type: 'String'
    },
    password: {
      type: 'String'
    },
    email: {
      type: 'String'
    },
    emailVerified: {
      type: 'Boolean'
    },
    authData: {
      type: 'Object'
    }
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    installationId: {
      type: 'String'
    },
    deviceToken: {
      type: 'String'
    },
    channels: {
      type: 'Array'
    },
    deviceType: {
      type: 'String'
    },
    pushType: {
      type: 'String'
    },
    GCMSenderId: {
      type: 'String'
    },
    timeZone: {
      type: 'String'
    },
    localeIdentifier: {
      type: 'String'
    },
    badge: {
      type: 'Number'
    },
    appVersion: {
      type: 'String'
    },
    appName: {
      type: 'String'
    },
    appIdentifier: {
      type: 'String'
    },
    parseVersion: {
      type: 'String'
    }
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    name: {
      type: 'String'
    },
    users: {
      type: 'Relation',
      targetClass: '_User'
    },
    roles: {
      type: 'Relation',
      targetClass: '_Role'
    }
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    restricted: {
      type: 'Boolean'
    },
    user: {
      type: 'Pointer',
      targetClass: '_User'
    },
    installationId: {
      type: 'String'
    },
    sessionToken: {
      type: 'String'
    },
    expiresAt: {
      type: 'Date'
    },
    createdWith: {
      type: 'Object'
    }
  },
  _Product: {
    productIdentifier: {
      type: 'String'
    },
    download: {
      type: 'File'
    },
    downloadName: {
      type: 'String'
    },
    icon: {
      type: 'File'
    },
    order: {
      type: 'Number'
    },
    title: {
      type: 'String'
    },
    subtitle: {
      type: 'String'
    }
  },
  _PushStatus: {
    pushTime: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    // rest or webui
    query: {
      type: 'String'
    },
    // the stringified JSON query
    payload: {
      type: 'String'
    },
    // the stringified JSON payload,
    title: {
      type: 'String'
    },
    expiry: {
      type: 'Number'
    },
    expiration_interval: {
      type: 'Number'
    },
    status: {
      type: 'String'
    },
    numSent: {
      type: 'Number'
    },
    numFailed: {
      type: 'Number'
    },
    pushHash: {
      type: 'String'
    },
    errorMessage: {
      type: 'Object'
    },
    sentPerType: {
      type: 'Object'
    },
    failedPerType: {
      type: 'Object'
    },
    sentPerUTCOffset: {
      type: 'Object'
    },
    failedPerUTCOffset: {
      type: 'Object'
    },
    count: {
      type: 'Number'
    } // tracks # of batches queued and pending

  },
  _JobStatus: {
    jobName: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    status: {
      type: 'String'
    },
    message: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    // params received when calling the job
    finishedAt: {
      type: 'Date'
    }
  },
  _JobSchedule: {
    jobName: {
      type: 'String'
    },
    description: {
      type: 'String'
    },
    params: {
      type: 'String'
    },
    startAfter: {
      type: 'String'
    },
    daysOfWeek: {
      type: 'Array'
    },
    timeOfDay: {
      type: 'String'
    },
    lastRun: {
      type: 'Number'
    },
    repeatMinutes: {
      type: 'Number'
    }
  },
  _Hooks: {
    functionName: {
      type: 'String'
    },
    className: {
      type: 'String'
    },
    triggerName: {
      type: 'String'
    },
    url: {
      type: 'String'
    }
  },
  _GlobalConfig: {
    objectId: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    masterKeyOnly: {
      type: 'Object'
    }
  },
  _GraphQLConfig: {
    objectId: {
      type: 'String'
    },
    config: {
      type: 'Object'
    }
  },
  _Audience: {
    objectId: {
      type: 'String'
    },
    name: {
      type: 'String'
    },
    query: {
      type: 'String'
    },
    //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    lastUsed: {
      type: 'Date'
    },
    timesUsed: {
      type: 'Number'
    }
  }
});
exports.defaultColumns = defaultColumns;
const requiredColumns = Object.freeze({
  _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
  _Role: ['name', 'ACL']
});
const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience']);
exports.systemClasses = systemClasses;
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience']); // 10 alpha numberic chars + uppercase

const userIdRegex = /^[a-zA-Z0-9]{10}$/; // Anything that start with role

const roleRegex = /^role:.*/; // Anything that starts with userField

const pointerPermissionRegex = /^userField:.*/; // * permission

const publicRegex = /^\*$/;
const requireAuthenticationRegex = /^requiresAuthentication$/;
const permissionKeyRegex = Object.freeze([userIdRegex, roleRegex, pointerPermissionRegex, publicRegex, requireAuthenticationRegex]);

function verifyPermissionKey(key) {
  const result = permissionKeyRegex.reduce((isGood, regEx) => {
    isGood = isGood || key.match(regEx) != null;
    return isGood;
  }, false);

  if (!result) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']);

function validateCLP(perms, fields) {
  if (!perms) {
    return;
  }

  Object.keys(perms).forEach(operation => {
    if (CLPValidKeys.indexOf(operation) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operation} is not a valid operation for class level permissions`);
    }

    if (!perms[operation]) {
      return;
    }

    if (operation === 'readUserFields' || operation === 'writeUserFields') {
      if (!Array.isArray(perms[operation])) {
        // -disable-next
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${perms[operation]}' is not a valid value for class level permissions ${operation}`);
      } else {
        perms[operation].forEach(key => {
          if (!(fields[key] && (fields[key].type == 'Pointer' && fields[key].targetClass == '_User' || fields[key].type == 'Array'))) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid column for class level pointer permissions ${operation}`);
          }
        });
      }

      return;
    } // -disable-next


    Object.keys(perms[operation]).forEach(key => {
      verifyPermissionKey(key); // -disable-next

      const perm = perms[operation][key];

      if (perm !== true && (operation !== 'protectedFields' || !Array.isArray(perm))) {
        // -disable-next
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${perm}' is not a valid value for class level permissions ${operation}:${key}:${perm}`);
      }
    });
  });
}

const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;

function classNameIsValid(className) {
  // Valid classes must:
  return (// Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 || // Be a join table OR
    joinClassRegex.test(className) || // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className)
  );
} // Valid fields must be alpha-numeric, and not start with an underscore or number


function fieldNameIsValid(fieldName) {
  return classAndFieldRegex.test(fieldName);
} // Checks that it's not trying to clobber one of the default fields of the class.


function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName)) {
    return false;
  }

  if (defaultColumns._Default[fieldName]) {
    return false;
  }

  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }

  return true;
}

function invalidClassNameMessage(className) {
  return 'Invalid classname: ' + className + ', classnames can only have alphanumeric characters and _, and must start with an alpha character ';
}

const invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, 'invalid JSON');
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon']; // Returns an error suitable for throwing if the type is invalid

const fieldTypeIsInvalid = ({
  type,
  targetClass
}) => {
  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
    if (!targetClass) {
      return new Parse.Error(135, `type ${type} needs a class name`);
    } else if (typeof targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
    } else {
      return undefined;
    }
  }

  if (typeof type !== 'string') {
    return invalidJsonError;
  }

  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
  }

  return undefined;
};

const convertSchemaToAdapterSchema = schema => {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = {
    type: 'Array'
  };
  schema.fields._wperm = {
    type: 'Array'
  };

  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = {
      type: 'String'
    };
  }

  return schema;
};

exports.convertSchemaToAdapterSchema = convertSchemaToAdapterSchema;

const convertAdapterSchemaToParseSchema = (_ref) => {
  let schema = _extends({}, _ref);

  delete schema.fields._rperm;
  delete schema.fields._wperm;
  schema.fields.ACL = {
    type: 'ACL'
  };

  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit

    delete schema.fields._hashed_password;
    schema.fields.password = {
      type: 'String'
    };
  }

  if (schema.indexes && Object.keys(schema.indexes).length === 0) {
    delete schema.indexes;
  }

  return schema;
};

class SchemaData {
  constructor(allSchemas = [], protectedFields = {}) {
    this.__data = {};
    this.__protectedFields = protectedFields;
    allSchemas.forEach(schema => {
      if (volatileClasses.includes(schema.className)) {
        return;
      }

      Object.defineProperty(this, schema.className, {
        get: () => {
          if (!this.__data[schema.className]) {
            const data = {};
            data.fields = injectDefaultSchema(schema).fields;
            data.classLevelPermissions = (0, _deepcopy.default)(schema.classLevelPermissions);
            data.indexes = schema.indexes;
            const classProtectedFields = this.__protectedFields[schema.className];

            if (classProtectedFields) {
              for (const key in classProtectedFields) {
                const unq = new Set([...(data.classLevelPermissions.protectedFields[key] || []), ...classProtectedFields[key]]);
                data.classLevelPermissions.protectedFields[key] = Array.from(unq);
              }
            }

            this.__data[schema.className] = data;
          }

          return this.__data[schema.className];
        }
      });
    }); // Inject the in-memory classes

    volatileClasses.forEach(className => {
      Object.defineProperty(this, className, {
        get: () => {
          if (!this.__data[className]) {
            const schema = injectDefaultSchema({
              className,
              fields: {},
              classLevelPermissions: {}
            });
            const data = {};
            data.fields = schema.fields;
            data.classLevelPermissions = schema.classLevelPermissions;
            data.indexes = schema.indexes;
            this.__data[className] = data;
          }

          return this.__data[className];
        }
      });
    });
  }

}

const injectDefaultSchema = ({
  className,
  fields,
  classLevelPermissions,
  indexes
}) => {
  const defaultSchema = {
    className,
    fields: _objectSpread({}, defaultColumns._Default, {}, defaultColumns[className] || {}, {}, fields),
    classLevelPermissions
  };

  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }

  return defaultSchema;
};

const _HooksSchema = {
  className: '_Hooks',
  fields: defaultColumns._Hooks
};
const _GlobalConfigSchema = {
  className: '_GlobalConfig',
  fields: defaultColumns._GlobalConfig
};
const _GraphQLConfigSchema = {
  className: '_GraphQLConfig',
  fields: defaultColumns._GraphQLConfig
};

const _PushStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_PushStatus',
  fields: {},
  classLevelPermissions: {}
}));

const _JobStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobStatus',
  fields: {},
  classLevelPermissions: {}
}));

const _JobScheduleSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobSchedule',
  fields: {},
  classLevelPermissions: {}
}));

const _AudienceSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Audience',
  fields: defaultColumns._Audience,
  classLevelPermissions: {}
}));

const VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema];
exports.VolatileClassesSchemas = VolatileClassesSchemas;

const dbTypeMatchesObjectType = (dbType, objectType) => {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
};

const typeToString = type => {
  if (typeof type === 'string') {
    return type;
  }

  if (type.targetClass) {
    return `${type.type}<${type.targetClass}>`;
  }

  return `${type.type}`;
}; // Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.


class SchemaController {
  constructor(databaseAdapter, schemaCache) {
    this._dbAdapter = databaseAdapter;
    this._cache = schemaCache;
    this.schemaData = new SchemaData();
    this.protectedFields = _Config.default.get(Parse.applicationId).protectedFields;
  }

  reloadData(options = {
    clearCache: false
  }) {
    if (this.reloadDataPromise && !options.clearCache) {
      return this.reloadDataPromise;
    }

    this.reloadDataPromise = this.getAllClasses(options).then(allSchemas => {
      this.schemaData = new SchemaData(allSchemas, this.protectedFields);
      delete this.reloadDataPromise;
    }, err => {
      this.schemaData = new SchemaData();
      delete this.reloadDataPromise;
      throw err;
    }).then(() => {});
    return this.reloadDataPromise;
  }

  getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }

    return this._cache.getAllClasses().then(allClasses => {
      if (allClasses && allClasses.length) {
        return Promise.resolve(allClasses);
      }

      return this.setAllClasses();
    });
  }

  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      /* eslint-disable no-console */
      this._cache.setAllClasses(allSchemas).catch(error => console.error('Error saving schema to cache:', error));
      /* eslint-enable no-console */


      return allSchemas;
    });
  }

  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    let promise = Promise.resolve();

    if (options.clearCache) {
      promise = this._cache.clear();
    }

    return promise.then(() => {
      if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
        const data = this.schemaData[className];
        return Promise.resolve({
          className,
          fields: data.fields,
          classLevelPermissions: data.classLevelPermissions,
          indexes: data.indexes
        });
      }

      return this._cache.getOneSchema(className).then(cached => {
        if (cached && !options.clearCache) {
          return Promise.resolve(cached);
        }

        return this.setAllClasses().then(allSchemas => {
          const oneSchema = allSchemas.find(schema => schema.className === className);

          if (!oneSchema) {
            return Promise.reject(undefined);
          }

          return oneSchema;
        });
      });
    });
  } // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.


  addClassIfNotExists(className, fields = {}, classLevelPermissions, indexes = {}) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);

    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }

      return Promise.reject(validationError);
    }

    return this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({
      fields,
      classLevelPermissions,
      indexes,
      className
    })).then(convertAdapterSchemaToParseSchema).catch(error => {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    });
  }

  updateClass(className, submittedFields, classLevelPermissions, indexes, database) {
    return this.getOneSchema(className).then(schema => {
      const existingFields = schema.fields;
      Object.keys(submittedFields).forEach(name => {
        const field = submittedFields[name];

        if (existingFields[name] && field.__op !== 'Delete') {
          throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
        }

        if (!existingFields[name] && field.__op === 'Delete') {
          throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
        }
      });
      delete existingFields._rperm;
      delete existingFields._wperm;
      const newSchema = buildMergedSchemaObject(existingFields, submittedFields);
      const defaultFields = defaultColumns[className] || defaultColumns._Default;
      const fullNewSchema = Object.assign({}, newSchema, defaultFields);
      const validationError = this.validateSchemaData(className, newSchema, classLevelPermissions, Object.keys(existingFields));

      if (validationError) {
        throw new Parse.Error(validationError.code, validationError.error);
      } // Finally we have checked to make sure the request is valid and we can start deleting fields.
      // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.


      const deletedFields = [];
      const insertedFields = [];
      Object.keys(submittedFields).forEach(fieldName => {
        if (submittedFields[fieldName].__op === 'Delete') {
          deletedFields.push(fieldName);
        } else {
          insertedFields.push(fieldName);
        }
      });
      let deletePromise = Promise.resolve();

      if (deletedFields.length > 0) {
        deletePromise = this.deleteFields(deletedFields, className, database);
      }

      let enforceFields = [];
      return deletePromise // Delete Everything
      .then(() => this.reloadData({
        clearCache: true
      })) // Reload our Schema, so we have all the new values
      .then(() => {
        const promises = insertedFields.map(fieldName => {
          const type = submittedFields[fieldName];
          return this.enforceFieldExists(className, fieldName, type);
        });
        return Promise.all(promises);
      }).then(results => {
        enforceFields = results.filter(result => !!result);
        return this.setPermissions(className, classLevelPermissions, newSchema);
      }).then(() => this._dbAdapter.setIndexesWithSchemaFormat(className, indexes, schema.indexes, fullNewSchema)).then(() => this.reloadData({
        clearCache: true
      })) //TODO: Move this logic into the database adapter
      .then(() => {
        this.ensureFields(enforceFields);
        const schema = this.schemaData[className];
        const reloadedSchema = {
          className: className,
          fields: schema.fields,
          classLevelPermissions: schema.classLevelPermissions
        };

        if (schema.indexes && Object.keys(schema.indexes).length !== 0) {
          reloadedSchema.indexes = schema.indexes;
        }

        return reloadedSchema;
      });
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    });
  } // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.


  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    } // We don't have this class. Update the schema


    return this.addClassIfNotExists(className) // The schema update succeeded. Reload the schema
    .then(() => this.reloadData({
      clearCache: true
    })).catch(() => {
      // The schema update failed. This can be okay - it might
      // have failed because there's a race condition and a different
      // client is making the exact same schema update that we want.
      // So just reload the schema.
      return this.reloadData({
        clearCache: true
      });
    }).then(() => {
      // Ensure that the schema now validates
      if (this.schemaData[className]) {
        return this;
      } else {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Failed to add ${className}`);
      }
    }).catch(() => {
      // The schema still doesn't validate. Give up
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
    });
  }

  validateNewClass(className, fields = {}, classLevelPermissions) {
    if (this.schemaData[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }

    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className)
      };
    }

    return this.validateSchemaData(className, fields, classLevelPermissions, []);
  }

  validateSchemaData(className, fields, classLevelPermissions, existingFieldNames) {
    for (const fieldName in fields) {
      if (existingFieldNames.indexOf(fieldName) < 0) {
        if (!fieldNameIsValid(fieldName)) {
          return {
            code: Parse.Error.INVALID_KEY_NAME,
            error: 'invalid field name: ' + fieldName
          };
        }

        if (!fieldNameIsValidForClass(fieldName, className)) {
          return {
            code: 136,
            error: 'field ' + fieldName + ' cannot be added'
          };
        }

        const fieldType = fields[fieldName];
        const error = fieldTypeIsInvalid(fieldType);
        if (error) return {
          code: error.code,
          error: error.message
        };

        if (fieldType.defaultValue !== undefined) {
          let defaultValueType = getType(fieldType.defaultValue);

          if (typeof defaultValueType === 'string') {
            defaultValueType = {
              type: defaultValueType
            };
          } else if (typeof defaultValueType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'default value' option is not applicable for ${typeToString(fieldType)}`
            };
          }

          if (!dbTypeMatchesObjectType(fieldType, defaultValueType)) {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(fieldType)} but got ${typeToString(defaultValueType)}`
            };
          }
        } else if (fieldType.required) {
          if (typeof fieldType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'required' option is not applicable for ${typeToString(fieldType)}`
            };
          }
        }
      }
    }

    for (const fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }

    const geoPoints = Object.keys(fields).filter(key => fields[key] && fields[key].type === 'GeoPoint');

    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.'
      };
    }

    validateCLP(classLevelPermissions, fields);
  } // Sets the Class-level permissions for a given className, which must exist.


  setPermissions(className, perms, newSchema) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }

    validateCLP(perms, newSchema);
    return this._dbAdapter.setClassLevelPermissions(className, perms);
  } // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.


  enforceFieldExists(className, fieldName, type) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }

    if (!fieldNameIsValid(fieldName)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    } // If someone tries to create a new field with null/undefined as the value, return;


    if (!type) {
      return undefined;
    }

    const expectedType = this.getExpectedType(className, fieldName);

    if (typeof type === 'string') {
      type = {
        type
      };
    }

    if (type.defaultValue !== undefined) {
      let defaultValueType = getType(type.defaultValue);

      if (typeof defaultValueType === 'string') {
        defaultValueType = {
          type: defaultValueType
        };
      }

      if (!dbTypeMatchesObjectType(type, defaultValueType)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(type)} but got ${typeToString(defaultValueType)}`);
      }
    }

    if (expectedType) {
      if (!dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName}; expected ${typeToString(expectedType)} but got ${typeToString(type)}`);
      }

      return undefined;
    }

    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      } // The update failed. This can be okay - it might have been a race
      // condition where another client updated the schema in the same
      // way that we wanted to. So, just reload the schema


      return Promise.resolve();
    }).then(() => {
      return {
        className,
        fieldName,
        type
      };
    });
  }

  ensureFields(fields) {
    for (let i = 0; i < fields.length; i += 1) {
      const {
        className,
        fieldName
      } = fields[i];
      let {
        type
      } = fields[i];
      const expectedType = this.getExpectedType(className, fieldName);

      if (typeof type === 'string') {
        type = {
          type: type
        };
      }

      if (!expectedType || !dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Could not add field ${fieldName}`);
      }
    }
  } // maintain compatibility


  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  } // Delete fields, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.


  deleteFields(fieldNames, className, database) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }

    fieldNames.forEach(fieldName => {
      if (!fieldNameIsValid(fieldName)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      } //Don't allow deleting the default fields.


      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
      }
    });
    return this.getOneSchema(className, false, {
      clearCache: true
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    }).then(schema => {
      fieldNames.forEach(fieldName => {
        if (!schema.fields[fieldName]) {
          throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
        }
      });

      const schemaFields = _objectSpread({}, schema.fields);

      return database.adapter.deleteFields(className, schema, fieldNames).then(() => {
        return Promise.all(fieldNames.map(fieldName => {
          const field = schemaFields[fieldName];

          if (field && field.type === 'Relation') {
            //For relations, drop the _Join table
            return database.adapter.deleteClass(`_Join:${fieldName}:${className}`);
          }

          return Promise.resolve();
        }));
      });
    }).then(() => this._cache.clear());
  } // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.


  async validateObject(className, object, query) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];

    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }

      const expected = getType(object[fieldName]);

      if (expected === 'GeoPoint') {
        geocount++;
      }

      if (geocount > 1) {
        // Make sure all field validation operations run before we return.
        // If not - we are continuing to run logic, but already provided response from the server.
        return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
      }

      if (!expected) {
        continue;
      }

      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }

      promises.push(schema.enforceFieldExists(className, fieldName, expected));
    }

    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);

    if (enforceFields.length !== 0) {
      await this.reloadData({
        clearCache: true
      });
    }

    this.ensureFields(enforceFields);
    const promise = Promise.resolve(schema);
    return thenValidateRequiredColumns(promise, className, object, query);
  } // Validates that all the properties are set for the object


  validateRequiredColumns(className, object, query) {
    const columns = requiredColumns[className];

    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }

    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        } // Not trying to do anything there


        return false;
      }

      return !object[column];
    });

    if (missingColumns.length > 0) {
      throw new Parse.Error(Parse.Error.INCORRECT_TYPE, missingColumns[0] + ' is required.');
    }

    return Promise.resolve(this);
  }

  testPermissionsForClassName(className, aclGroup, operation) {
    return SchemaController.testPermissions(this.getClassLevelPermissions(className), aclGroup, operation);
  } // Tests that the class level permission let pass the operation for a given aclGroup


  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }

    const perms = classPermissions[operation];

    if (perms['*']) {
      return true;
    } // Check permissions against the aclGroup provided (array of userId/roles)


    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }

    return false;
  } // Validates an operation passes class-level-permissions set in the schema


  static validatePermission(classPermissions, className, aclGroup, operation) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }

    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }

    const perms = classPermissions[operation]; // If only for authenticated users
    // make sure we have an aclGroup

    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'


      return Promise.resolve();
    } // No matching CLP, let's check the Pointer permissions
    // And handle those later


    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields'; // Reject create when write lockdown

    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    } // Process the readUserFields later


    if (Array.isArray(classPermissions[permissionField]) && classPermissions[permissionField].length > 0) {
      return Promise.resolve();
    }

    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
  } // Validates an operation passes class-level-permissions set in the schema


  validatePermission(className, aclGroup, operation) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation);
  }

  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  } // Returns the expected type for a className+key combination
  // or undefined if the schema is not set


  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }

    return undefined;
  } // Checks if a given class is in the schema.


  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }

    return this.reloadData().then(() => !!this.schemaData[className]);
  }

} // Returns a promise for a new Schema.


exports.SchemaController = exports.default = SchemaController;

const load = (dbAdapter, schemaCache, options) => {
  const schema = new SchemaController(dbAdapter, schemaCache);
  return schema.reloadData(options).then(() => schema);
}; // Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.


exports.load = load;

function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {}; // -disable-next

  const sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);

  for (const oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' && oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }

      const fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete';

      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }

  for (const newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }

      newSchema[newField] = putRequest[newField];
    }
  }

  return newSchema;
} // Given a schema promise, construct another schema promise that
// validates this field once the schema loads.


function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
} // Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB


function getType(obj) {
  const type = typeof obj;

  switch (type) {
    case 'boolean':
      return 'Boolean';

    case 'string':
      return 'String';

    case 'number':
      return 'Number';

    case 'map':
    case 'object':
      if (!obj) {
        return undefined;
      }

      return getObjectType(obj);

    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw 'bad obj: ' + obj;
  }
} // This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.


function getObjectType(obj) {
  if (obj instanceof Array) {
    return 'Array';
  }

  if (obj.__type) {
    switch (obj.__type) {
      case 'Pointer':
        if (obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className
          };
        }

        break;

      case 'Relation':
        if (obj.className) {
          return {
            type: 'Relation',
            targetClass: obj.className
          };
        }

        break;

      case 'File':
        if (obj.name) {
          return 'File';
        }

        break;

      case 'Date':
        if (obj.iso) {
          return 'Date';
        }

        break;

      case 'GeoPoint':
        if (obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
        }

        break;

      case 'Bytes':
        if (obj.base64) {
          return 'Bytes';
        }

        break;

      case 'Polygon':
        if (obj.coordinates) {
          return 'Polygon';
        }

        break;
    }

    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'This is not a valid ' + obj.__type);
  }

  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }

  if (obj.__op) {
    switch (obj.__op) {
      case 'Increment':
        return 'Number';

      case 'Delete':
        return null;

      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';

      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className
        };

      case 'Batch':
        return getObjectType(obj.ops[0]);

      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }

  return 'Object';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsImRlZmF1bHRDb2x1bW5zIiwiT2JqZWN0IiwiZnJlZXplIiwiX0RlZmF1bHQiLCJvYmplY3RJZCIsInR5cGUiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJBQ0wiLCJfVXNlciIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJlbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJhdXRoRGF0YSIsIl9JbnN0YWxsYXRpb24iLCJpbnN0YWxsYXRpb25JZCIsImRldmljZVRva2VuIiwiY2hhbm5lbHMiLCJkZXZpY2VUeXBlIiwicHVzaFR5cGUiLCJHQ01TZW5kZXJJZCIsInRpbWVab25lIiwibG9jYWxlSWRlbnRpZmllciIsImJhZGdlIiwiYXBwVmVyc2lvbiIsImFwcE5hbWUiLCJhcHBJZGVudGlmaWVyIiwicGFyc2VWZXJzaW9uIiwiX1JvbGUiLCJuYW1lIiwidXNlcnMiLCJ0YXJnZXRDbGFzcyIsInJvbGVzIiwiX1Nlc3Npb24iLCJyZXN0cmljdGVkIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJzb3VyY2UiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwicmVxdWlyZWRDb2x1bW5zIiwic3lzdGVtQ2xhc3NlcyIsInZvbGF0aWxlQ2xhc3NlcyIsInVzZXJJZFJlZ2V4Iiwicm9sZVJlZ2V4IiwicG9pbnRlclBlcm1pc3Npb25SZWdleCIsInB1YmxpY1JlZ2V4IiwicmVxdWlyZUF1dGhlbnRpY2F0aW9uUmVnZXgiLCJwZXJtaXNzaW9uS2V5UmVnZXgiLCJ2ZXJpZnlQZXJtaXNzaW9uS2V5Iiwia2V5IiwicmVzdWx0IiwicmVkdWNlIiwiaXNHb29kIiwicmVnRXgiLCJtYXRjaCIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsImtleXMiLCJmb3JFYWNoIiwib3BlcmF0aW9uIiwiaW5kZXhPZiIsIkFycmF5IiwiaXNBcnJheSIsInBlcm0iLCJqb2luQ2xhc3NSZWdleCIsImNsYXNzQW5kRmllbGRSZWdleCIsImNsYXNzTmFtZUlzVmFsaWQiLCJ0ZXN0IiwiZmllbGROYW1lSXNWYWxpZCIsImZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInVuZGVmaW5lZCIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiaW5kZXhlcyIsImxlbmd0aCIsIlNjaGVtYURhdGEiLCJjb25zdHJ1Y3RvciIsImFsbFNjaGVtYXMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJfX2RhdGEiLCJfX3Byb3RlY3RlZEZpZWxkcyIsImluY2x1ZGVzIiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQcm90ZWN0ZWRGaWVsZHMiLCJ1bnEiLCJTZXQiLCJmcm9tIiwiZGVmYXVsdFNjaGVtYSIsIl9Ib29rc1NjaGVtYSIsIl9HbG9iYWxDb25maWdTY2hlbWEiLCJfR3JhcGhRTENvbmZpZ1NjaGVtYSIsIl9QdXNoU3RhdHVzU2NoZW1hIiwiX0pvYlN0YXR1c1NjaGVtYSIsIl9Kb2JTY2hlZHVsZVNjaGVtYSIsIl9BdWRpZW5jZVNjaGVtYSIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSIsImRiVHlwZSIsIm9iamVjdFR5cGUiLCJ0eXBlVG9TdHJpbmciLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwic2NoZW1hQ2FjaGUiLCJfZGJBZGFwdGVyIiwiX2NhY2hlIiwic2NoZW1hRGF0YSIsIkNvbmZpZyIsImFwcGxpY2F0aW9uSWQiLCJyZWxvYWREYXRhIiwib3B0aW9ucyIsImNsZWFyQ2FjaGUiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1hcCIsImNhdGNoIiwiZXJyb3IiLCJjb25zb2xlIiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJwcm9taXNlIiwiY2xlYXIiLCJjYWNoZWQiLCJvbmVTY2hlbWEiLCJmaW5kIiwicmVqZWN0IiwiYWRkQ2xhc3NJZk5vdEV4aXN0cyIsInZhbGlkYXRpb25FcnJvciIsInZhbGlkYXRlTmV3Q2xhc3MiLCJjb2RlIiwiY3JlYXRlQ2xhc3MiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1cGRhdGVDbGFzcyIsInN1Ym1pdHRlZEZpZWxkcyIsImRhdGFiYXNlIiwiZXhpc3RpbmdGaWVsZHMiLCJmaWVsZCIsIl9fb3AiLCJuZXdTY2hlbWEiLCJidWlsZE1lcmdlZFNjaGVtYU9iamVjdCIsImRlZmF1bHRGaWVsZHMiLCJmdWxsTmV3U2NoZW1hIiwiYXNzaWduIiwidmFsaWRhdGVTY2hlbWFEYXRhIiwiZGVsZXRlZEZpZWxkcyIsImluc2VydGVkRmllbGRzIiwicHVzaCIsImRlbGV0ZVByb21pc2UiLCJkZWxldGVGaWVsZHMiLCJlbmZvcmNlRmllbGRzIiwicHJvbWlzZXMiLCJlbmZvcmNlRmllbGRFeGlzdHMiLCJhbGwiLCJyZXN1bHRzIiwiZmlsdGVyIiwic2V0UGVybWlzc2lvbnMiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsImVuc3VyZUZpZWxkcyIsInJlbG9hZGVkU2NoZW1hIiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiZXhpc3RpbmdGaWVsZE5hbWVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpZWxkVHlwZSIsImRlZmF1bHRWYWx1ZSIsImRlZmF1bHRWYWx1ZVR5cGUiLCJnZXRUeXBlIiwicmVxdWlyZWQiLCJnZW9Qb2ludHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJzcGxpdCIsImV4cGVjdGVkVHlwZSIsImdldEV4cGVjdGVkVHlwZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJpIiwiZGVsZXRlRmllbGQiLCJmaWVsZE5hbWVzIiwic2NoZW1hRmllbGRzIiwiYWRhcHRlciIsImRlbGV0ZUNsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJvYmplY3QiLCJnZW9jb3VudCIsImV4cGVjdGVkIiwidGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwidmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJjb2x1bW5zIiwibWlzc2luZ0NvbHVtbnMiLCJjb2x1bW4iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJhY2xHcm91cCIsInRlc3RQZXJtaXNzaW9ucyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImNsYXNzUGVybWlzc2lvbnMiLCJzb21lIiwiYWNsIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiT0JKRUNUX05PVF9GT1VORCIsInBlcm1pc3Npb25GaWVsZCIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJoYXNDbGFzcyIsImxvYWQiLCJkYkFkYXB0ZXIiLCJwdXRSZXF1ZXN0Iiwic3lzU2NoZW1hRmllbGQiLCJfaWQiLCJvbGRGaWVsZCIsImZpZWxkSXNEZWxldGVkIiwibmV3RmllbGQiLCJzY2hlbWFQcm9taXNlIiwib2JqIiwiZ2V0T2JqZWN0VHlwZSIsIl9fdHlwZSIsImlzbyIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiYmFzZTY0IiwiY29vcmRpbmF0ZXMiLCJvYmplY3RzIiwib3BzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQWtCQTs7QUFDQTs7QUFDQTs7QUFFQTs7Ozs7Ozs7Ozs7O0FBckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCRCxLQUFwQzs7QUFjQSxNQUFNRSxjQUEwQyxHQUFHQyxNQUFNLENBQUNDLE1BQVAsQ0FBYztBQUMvRDtBQUNBQyxFQUFBQSxRQUFRLEVBQUU7QUFDUkMsSUFBQUEsUUFBUSxFQUFFO0FBQUVDLE1BQUFBLElBQUksRUFBRTtBQUFSLEtBREY7QUFFUkMsSUFBQUEsU0FBUyxFQUFFO0FBQUVELE1BQUFBLElBQUksRUFBRTtBQUFSLEtBRkg7QUFH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LENBQUMsS0FBRCxDQUFKLENBQXBCO0FBQ0Q7O0FBQ0QsTUFBSUEsR0FBRyxDQUFDeEUsSUFBUixFQUFjO0FBQ1osWUFBUXdFLEdBQUcsQ0FBQ3hFLElBQVo7QUFDRSxXQUFLLFdBQUw7QUFDRSxlQUFPLFFBQVA7O0FBQ0YsV0FBSyxRQUFMO0FBQ0UsZUFBTyxJQUFQOztBQUNGLFdBQUssS0FBTDtBQUNBLFdBQUssV0FBTDtBQUNBLFdBQUssUUFBTDtBQUNFLGVBQU8sT0FBUDs7QUFDRixXQUFLLGFBQUw7QUFDQSxXQUFLLGdCQUFMO0FBQ0UsZUFBTztBQUNMOU0sVUFBQUEsSUFBSSxFQUFFLFVBREQ7QUFFTDJCLFVBQUFBLFdBQVcsRUFBRTJQLEdBQUcsQ0FBQ1EsT0FBSixDQUFZLENBQVosRUFBZXBOO0FBRnZCLFNBQVA7O0FBSUYsV0FBSyxPQUFMO0FBQ0UsZUFBTzZNLGFBQWEsQ0FBQ0QsR0FBRyxDQUFDUyxHQUFKLENBQVEsQ0FBUixDQUFELENBQXBCOztBQUNGO0FBQ0UsY0FBTSxvQkFBb0JULEdBQUcsQ0FBQ3hFLElBQTlCO0FBbEJKO0FBb0JEOztBQUNELFNBQU8sUUFBUDtBQUNEIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIFRoaXMgY2xhc3MgaGFuZGxlcyBzY2hlbWEgdmFsaWRhdGlvbiwgcGVyc2lzdGVuY2UsIGFuZCBtb2RpZmljYXRpb24uXG4vL1xuLy8gRWFjaCBpbmRpdmlkdWFsIFNjaGVtYSBvYmplY3Qgc2hvdWxkIGJlIGltbXV0YWJsZS4gVGhlIGhlbHBlcnMgdG9cbi8vIGRvIHRoaW5ncyB3aXRoIHRoZSBTY2hlbWEganVzdCByZXR1cm4gYSBuZXcgc2NoZW1hIHdoZW4gdGhlIHNjaGVtYVxuLy8gaXMgY2hhbmdlZC5cbi8vXG4vLyBUaGUgY2Fub25pY2FsIHBsYWNlIHRvIHN0b3JlIHRoaXMgU2NoZW1hIGlzIGluIHRoZSBkYXRhYmFzZSBpdHNlbGYsXG4vLyBpbiBhIF9TQ0hFTUEgY29sbGVjdGlvbi4gVGhpcyBpcyBub3QgdGhlIHJpZ2h0IHdheSB0byBkbyBpdCBmb3IgYW5cbi8vIG9wZW4gc291cmNlIGZyYW1ld29yaywgYnV0IGl0J3MgYmFja3dhcmQgY29tcGF0aWJsZSwgc28gd2UncmVcbi8vIGtlZXBpbmcgaXQgdGhpcyB3YXkgZm9yIG5vdy5cbi8vXG4vLyBJbiBBUEktaGFuZGxpbmcgY29kZSwgeW91IHNob3VsZCBvbmx5IHVzZSB0aGUgU2NoZW1hIGNsYXNzIHZpYSB0aGVcbi8vIERhdGFiYXNlQ29udHJvbGxlci4gVGhpcyB3aWxsIGxldCB1cyByZXBsYWNlIHRoZSBzY2hlbWEgbG9naWMgZm9yXG4vLyBkaWZmZXJlbnQgZGF0YWJhc2VzLlxuLy8gVE9ETzogaGlkZSBhbGwgc2NoZW1hIGxvZ2ljIGluc2lkZSB0aGUgZGF0YWJhc2UgYWRhcHRlci5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYSxcbiAgU2NoZW1hRmllbGRzLFxuICBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIFNjaGVtYUZpZWxkLFxuICBMb2FkU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IGRlZmF1bHRDb2x1bW5zOiB7IFtzdHJpbmddOiBTY2hlbWFGaWVsZHMgfSA9IE9iamVjdC5mcmVlemUoe1xuICAvLyBDb250YWluIHRoZSBkZWZhdWx0IGNvbHVtbnMgZm9yIGV2ZXJ5IHBhcnNlIG9iamVjdCB0eXBlIChleGNlcHQgX0pvaW4gY29sbGVjdGlvbilcbiAgX0RlZmF1bHQ6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNyZWF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB1cGRhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgQUNMOiB7IHR5cGU6ICdBQ0wnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Vc2VyIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfVXNlcjoge1xuICAgIHVzZXJuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFzc3dvcmQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsVmVyaWZpZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgYXV0aERhdGE6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX0luc3RhbGxhdGlvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX0luc3RhbGxhdGlvbjoge1xuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGV2aWNlVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjaGFubmVsczogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgZGV2aWNlVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHB1c2hUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgR0NNU2VuZGVySWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0aW1lWm9uZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxvY2FsZUlkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBiYWRnZTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGFwcFZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcnNlVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfUm9sZSBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1JvbGU6IHtcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXNlcnM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICByb2xlczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Sb2xlJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfU2Vzc2lvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1Nlc3Npb246IHtcbiAgICByZXN0cmljdGVkOiB7IHR5cGU6ICdCb29sZWFuJyB9LFxuICAgIHVzZXI6IHsgdHlwZTogJ1BvaW50ZXInLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc2Vzc2lvblRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlc0F0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIGNyZWF0ZWRXaXRoOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9Qcm9kdWN0OiB7XG4gICAgcHJvZHVjdElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkb3dubG9hZDogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBkb3dubG9hZE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpY29uOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIG9yZGVyOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdWJ0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfUHVzaFN0YXR1czoge1xuICAgIHB1c2hUaW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHJlc3Qgb3Igd2VidWlcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBxdWVyeVxuICAgIHBheWxvYWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcGF5bG9hZCxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyeTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGV4cGlyYXRpb25faW50ZXJ2YWw6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBudW1TZW50OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgbnVtRmFpbGVkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcHVzaEhhc2g6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlcnJvck1lc3NhZ2U6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgY291bnQ6IHsgdHlwZTogJ051bWJlcicgfSwgLy8gdHJhY2tzICMgb2YgYmF0Y2hlcyBxdWV1ZWQgYW5kIHBlbmRpbmdcbiAgfSxcbiAgX0pvYlN0YXR1czoge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBtZXNzYWdlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sIC8vIHBhcmFtcyByZWNlaXZlZCB3aGVuIGNhbGxpbmcgdGhlIGpvYlxuICAgIGZpbmlzaGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG4gIF9Kb2JTY2hlZHVsZToge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXJ0QWZ0ZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkYXlzT2ZXZWVrOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICB0aW1lT2ZEYXk6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsYXN0UnVuOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcmVwZWF0TWludXRlczogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSG9va3M6IHtcbiAgICBmdW5jdGlvbk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjbGFzc05hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0cmlnZ2VyTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVybDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfR2xvYmFsQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBtYXN0ZXJLZXlPbmx5OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9HcmFwaFFMQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjb25maWc6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0F1ZGllbmNlOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy9zdG9yaW5nIHF1ZXJ5IGFzIEpTT04gc3RyaW5nIHRvIHByZXZlbnQgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiIGVycm9yXG4gICAgbGFzdFVzZWQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdGltZXNVc2VkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG59KTtcblxuY29uc3QgcmVxdWlyZWRDb2x1bW5zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIF9Qcm9kdWN0OiBbJ3Byb2R1Y3RJZGVudGlmaWVyJywgJ2ljb24nLCAnb3JkZXInLCAndGl0bGUnLCAnc3VidGl0bGUnXSxcbiAgX1JvbGU6IFsnbmFtZScsICdBQ0wnXSxcbn0pO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG5dKTtcblxuY29uc3Qgdm9sYXRpbGVDbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Ib29rcycsXG4gICdfR2xvYmFsQ29uZmlnJyxcbiAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuXSk7XG5cbi8vIDEwIGFscGhhIG51bWJlcmljIGNoYXJzICsgdXBwZXJjYXNlXG5jb25zdCB1c2VySWRSZWdleCA9IC9eW2EtekEtWjAtOV17MTB9JC87XG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkXG5jb25zdCBwb2ludGVyUGVybWlzc2lvblJlZ2V4ID0gL151c2VyRmllbGQ6LiovO1xuLy8gKiBwZXJtaXNzaW9uXG5jb25zdCBwdWJsaWNSZWdleCA9IC9eXFwqJC87XG5cbmNvbnN0IHJlcXVpcmVBdXRoZW50aWNhdGlvblJlZ2V4ID0gL15yZXF1aXJlc0F1dGhlbnRpY2F0aW9uJC87XG5cbmNvbnN0IHBlcm1pc3Npb25LZXlSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICB1c2VySWRSZWdleCxcbiAgcm9sZVJlZ2V4LFxuICBwb2ludGVyUGVybWlzc2lvblJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgcmVxdWlyZUF1dGhlbnRpY2F0aW9uUmVnZXgsXG5dKTtcblxuZnVuY3Rpb24gdmVyaWZ5UGVybWlzc2lvbktleShrZXkpIHtcbiAgY29uc3QgcmVzdWx0ID0gcGVybWlzc2lvbktleVJlZ2V4LnJlZHVjZSgoaXNHb29kLCByZWdFeCkgPT4ge1xuICAgIGlzR29vZCA9IGlzR29vZCB8fCBrZXkubWF0Y2gocmVnRXgpICE9IG51bGw7XG4gICAgcmV0dXJuIGlzR29vZDtcbiAgfSwgZmFsc2UpO1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdmaW5kJyxcbiAgJ2NvdW50JyxcbiAgJ2dldCcsXG4gICdjcmVhdGUnLFxuICAndXBkYXRlJyxcbiAgJ2RlbGV0ZScsXG4gICdhZGRGaWVsZCcsXG4gICdyZWFkVXNlckZpZWxkcycsXG4gICd3cml0ZVVzZXJGaWVsZHMnLFxuICAncHJvdGVjdGVkRmllbGRzJyxcbl0pO1xuZnVuY3Rpb24gdmFsaWRhdGVDTFAocGVybXM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzOiBTY2hlbWFGaWVsZHMpIHtcbiAgaWYgKCFwZXJtcykge1xuICAgIHJldHVybjtcbiAgfVxuICBPYmplY3Qua2V5cyhwZXJtcykuZm9yRWFjaChvcGVyYXRpb24gPT4ge1xuICAgIGlmIChDTFBWYWxpZEtleXMuaW5kZXhPZihvcGVyYXRpb24pID09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCR7b3BlcmF0aW9ufSBpcyBub3QgYSB2YWxpZCBvcGVyYXRpb24gZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKCFwZXJtc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKG9wZXJhdGlvbiA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb24gPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkocGVybXNbb3BlcmF0aW9uXSkpIHtcbiAgICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYCcke3Blcm1zW29wZXJhdGlvbl19JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVybXNbb3BlcmF0aW9uXS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIShcbiAgICAgICAgICAgICAgZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgKChmaWVsZHNba2V5XS50eXBlID09ICdQb2ludGVyJyAmJlxuICAgICAgICAgICAgICAgIGZpZWxkc1trZXldLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgICAgICAgICAgZmllbGRzW2tleV0udHlwZSA9PSAnQXJyYXknKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIE9iamVjdC5rZXlzKHBlcm1zW29wZXJhdGlvbl0pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIHZlcmlmeVBlcm1pc3Npb25LZXkoa2V5KTtcbiAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgICAgY29uc3QgcGVybSA9IHBlcm1zW29wZXJhdGlvbl1ba2V5XTtcbiAgICAgIGlmIChcbiAgICAgICAgcGVybSAhPT0gdHJ1ZSAmJlxuICAgICAgICAob3BlcmF0aW9uICE9PSAncHJvdGVjdGVkRmllbGRzJyB8fCAhQXJyYXkuaXNBcnJheShwZXJtKSlcbiAgICAgICkge1xuICAgICAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgJyR7cGVybX0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbn06JHtrZXl9OiR7cGVybX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufVxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSlcbiAgKTtcbn1cblxuLy8gVmFsaWQgZmllbGRzIG11c3QgYmUgYWxwaGEtbnVtZXJpYywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBjbGFzc0FuZEZpZWxkUmVnZXgudGVzdChmaWVsZE5hbWUpO1xufVxuXG4vLyBDaGVja3MgdGhhdCBpdCdzIG5vdCB0cnlpbmcgdG8gY2xvYmJlciBvbmUgb2YgdGhlIGRlZmF1bHQgZmllbGRzIG9mIHRoZSBjbGFzcy5cbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhcbiAgZmllbGROYW1lOiBzdHJpbmcsXG4gIGNsYXNzTmFtZTogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFxuICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICdpbnZhbGlkIEpTT04nXG4pO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSh0YXJnZXRDbGFzcylcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWBcbiAgICApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IGRlZXBjb3B5KHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsYXNzUHJvdGVjdGVkRmllbGRzID0gdGhpcy5fX3Byb3RlY3RlZEZpZWxkc1tcbiAgICAgICAgICAgICAgc2NoZW1hLmNsYXNzTmFtZVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGlmIChjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgICAgICAgLi4uKGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldIHx8IFtdKSxcbiAgICAgICAgICAgICAgICAgIC4uLmNsYXNzUHJvdGVjdGVkRmllbGRzW2tleV0sXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gPSBBcnJheS5mcm9tKFxuICAgICAgICAgICAgICAgICAgdW5xXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gSW5qZWN0IHRoZSBpbi1tZW1vcnkgY2xhc3Nlc1xuICAgIHZvbGF0aWxlQ2xhc3Nlcy5mb3JFYWNoKGNsYXNzTmFtZSA9PiB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgY2xhc3NOYW1lLCB7XG4gICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGRzOiB7fSxcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtjbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW2NsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5jb25zdCBpbmplY3REZWZhdWx0U2NoZW1hID0gKHtcbiAgY2xhc3NOYW1lLFxuICBmaWVsZHMsXG4gIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgaW5kZXhlcyxcbn06IFNjaGVtYSkgPT4ge1xuICBjb25zdCBkZWZhdWx0U2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgY2xhc3NOYW1lLFxuICAgIGZpZWxkczoge1xuICAgICAgLi4uZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAuLi4oZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCB7fSksXG4gICAgICAuLi5maWVsZHMsXG4gICAgfSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIH07XG4gIGlmIChpbmRleGVzICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgIGRlZmF1bHRTY2hlbWEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRTY2hlbWE7XG59O1xuXG5jb25zdCBfSG9va3NTY2hlbWEgPSB7IGNsYXNzTmFtZTogJ19Ib29rcycsIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0hvb2tzIH07XG5jb25zdCBfR2xvYmFsQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR2xvYmFsQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR2xvYmFsQ29uZmlnLFxufTtcbmNvbnN0IF9HcmFwaFFMQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR3JhcGhRTENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dyYXBoUUxDb25maWcsXG59O1xuY29uc3QgX1B1c2hTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfUHVzaFN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlNjaGVkdWxlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlNjaGVkdWxlJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0F1ZGllbmNlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0F1ZGllbmNlJyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9BdWRpZW5jZSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgPSBbXG4gIF9Ib29rc1NjaGVtYSxcbiAgX0pvYlN0YXR1c1NjaGVtYSxcbiAgX0pvYlNjaGVkdWxlU2NoZW1hLFxuICBfUHVzaFN0YXR1c1NjaGVtYSxcbiAgX0dsb2JhbENvbmZpZ1NjaGVtYSxcbiAgX0dyYXBoUUxDb25maWdTY2hlbWEsXG4gIF9BdWRpZW5jZVNjaGVtYSxcbl07XG5cbmNvbnN0IGRiVHlwZU1hdGNoZXNPYmplY3RUeXBlID0gKFxuICBkYlR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nLFxuICBvYmplY3RUeXBlOiBTY2hlbWFGaWVsZFxuKSA9PiB7XG4gIGlmIChkYlR5cGUudHlwZSAhPT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUudGFyZ2V0Q2xhc3MgIT09IG9iamVjdFR5cGUudGFyZ2V0Q2xhc3MpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGRiVHlwZS50eXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59O1xuXG5jb25zdCB0eXBlVG9TdHJpbmcgPSAodHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cbiAgaWYgKHR5cGUudGFyZ2V0Q2xhc3MpIHtcbiAgICByZXR1cm4gYCR7dHlwZS50eXBlfTwke3R5cGUudGFyZ2V0Q2xhc3N9PmA7XG4gIH1cbiAgcmV0dXJuIGAke3R5cGUudHlwZX1gO1xufTtcblxuLy8gU3RvcmVzIHRoZSBlbnRpcmUgc2NoZW1hIG9mIHRoZSBhcHAgaW4gYSB3ZWlyZCBoeWJyaWQgZm9ybWF0IHNvbWV3aGVyZSBiZXR3ZWVuXG4vLyB0aGUgbW9uZ28gZm9ybWF0IGFuZCB0aGUgUGFyc2UgZm9ybWF0LiBTb29uLCB0aGlzIHdpbGwgYWxsIGJlIFBhcnNlIGZvcm1hdC5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNjaGVtYUNvbnRyb2xsZXIge1xuICBfZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hRGF0YTogeyBbc3RyaW5nXTogU2NoZW1hIH07XG4gIF9jYWNoZTogYW55O1xuICByZWxvYWREYXRhUHJvbWlzZTogUHJvbWlzZTxhbnk+O1xuICBwcm90ZWN0ZWRGaWVsZHM6IGFueTtcblxuICBjb25zdHJ1Y3RvcihkYXRhYmFzZUFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBzY2hlbWFDYWNoZTogYW55KSB7XG4gICAgdGhpcy5fZGJBZGFwdGVyID0gZGF0YWJhc2VBZGFwdGVyO1xuICAgIHRoaXMuX2NhY2hlID0gc2NoZW1hQ2FjaGU7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCkucHJvdGVjdGVkRmllbGRzO1xuICB9XG5cbiAgcmVsb2FkRGF0YShvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKHRoaXMucmVsb2FkRGF0YVByb21pc2UgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMucmVsb2FkRGF0YVByb21pc2UgPSB0aGlzLmdldEFsbENsYXNzZXMob3B0aW9ucylcbiAgICAgIC50aGVuKFxuICAgICAgICBhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShhbGxTY2hlbWFzLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgfVxuXG4gIGdldEFsbENsYXNzZXMoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY2FjaGUuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBpZiAoYWxsQ2xhc3NlcyAmJiBhbGxDbGFzc2VzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGFsbENsYXNzZXMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH0pO1xuICB9XG5cbiAgc2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IGFsbFNjaGVtYXMubWFwKGluamVjdERlZmF1bHRTY2hlbWEpKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgdGhpcy5fY2FjaGVcbiAgICAgICAgICAuc2V0QWxsQ2xhc3NlcyhhbGxTY2hlbWFzKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PlxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHNjaGVtYSB0byBjYWNoZTonLCBlcnJvcilcbiAgICAgICAgICApO1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgcmV0dXJuIGFsbFNjaGVtYXM7XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldE9uZVNjaGVtYShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhbGxvd1ZvbGF0aWxlQ2xhc3NlczogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hPiB7XG4gICAgbGV0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICBwcm9taXNlID0gdGhpcy5fY2FjaGUuY2xlYXIoKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2UudGhlbigoKSA9PiB7XG4gICAgICBpZiAoYWxsb3dWb2xhdGlsZUNsYXNzZXMgJiYgdm9sYXRpbGVDbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIGZpZWxkczogZGF0YS5maWVsZHMsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBpbmRleGVzOiBkYXRhLmluZGV4ZXMsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlLmdldE9uZVNjaGVtYShjbGFzc05hbWUpLnRoZW4oY2FjaGVkID0+IHtcbiAgICAgICAgaWYgKGNhY2hlZCAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKS50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIGNvbnN0IG9uZVNjaGVtYSA9IGFsbFNjaGVtYXMuZmluZChcbiAgICAgICAgICAgIHNjaGVtYSA9PiBzY2hlbWEuY2xhc3NOYW1lID09PSBjbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghb25lU2NoZW1hKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodW5kZWZpbmVkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG9uZVNjaGVtYTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG5ldyBjbGFzcyB0aGF0IGluY2x1ZGVzIHRoZSB0aHJlZSBkZWZhdWx0IGZpZWxkcy5cbiAgLy8gQUNMIGlzIGFuIGltcGxpY2l0IGNvbHVtbiB0aGF0IGRvZXMgbm90IGdldCBhbiBlbnRyeSBpbiB0aGVcbiAgLy8gX1NDSEVNQVMgZGF0YWJhc2UuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGVcbiAgLy8gY3JlYXRlZCBzY2hlbWEsIGluIG1vbmdvIGZvcm1hdC5cbiAgLy8gb24gc3VjY2VzcywgYW5kIHJlamVjdHMgd2l0aCBhbiBlcnJvciBvbiBmYWlsLiBFbnN1cmUgeW91XG4gIC8vIGhhdmUgYXV0aG9yaXphdGlvbiAobWFzdGVyIGtleSwgb3IgY2xpZW50IGNsYXNzIGNyZWF0aW9uXG4gIC8vIGVuYWJsZWQpIGJlZm9yZSBjYWxsaW5nIHRoaXMgZnVuY3Rpb24uXG4gIGFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnkgPSB7fVxuICApOiBQcm9taXNlPHZvaWQgfCBTY2hlbWE+IHtcbiAgICB2YXIgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZU5ld0NsYXNzKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgZmllbGRzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zXG4gICAgKTtcbiAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICBpZiAodmFsaWRhdGlvbkVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHZhbGlkYXRpb25FcnJvci5jb2RlICYmIHZhbGlkYXRpb25FcnJvci5lcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuY3JlYXRlQ2xhc3MoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSh7XG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZUNsYXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEZpZWxkc1tuYW1lXTtcbiAgICAgICAgICBpZiAoZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgIGBGaWVsZCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3JwZXJtO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3dwZXJtO1xuICAgICAgICBjb25zdCBuZXdTY2hlbWEgPSBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChcbiAgICAgICAgICBleGlzdGluZ0ZpZWxkcyxcbiAgICAgICAgICBzdWJtaXR0ZWRGaWVsZHNcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdEZpZWxkcyA9XG4gICAgICAgICAgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCBkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdDtcbiAgICAgICAgY29uc3QgZnVsbE5ld1NjaGVtYSA9IE9iamVjdC5hc3NpZ24oe30sIG5ld1NjaGVtYSwgZGVmYXVsdEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBuZXdTY2hlbWEsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIE9iamVjdC5rZXlzKGV4aXN0aW5nRmllbGRzKVxuICAgICAgICApO1xuICAgICAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmluYWxseSB3ZSBoYXZlIGNoZWNrZWQgdG8gbWFrZSBzdXJlIHRoZSByZXF1ZXN0IGlzIHZhbGlkIGFuZCB3ZSBjYW4gc3RhcnQgZGVsZXRpbmcgZmllbGRzLlxuICAgICAgICAvLyBEbyBhbGwgZGVsZXRpb25zIGZpcnN0LCB0aGVuIGEgc2luZ2xlIHNhdmUgdG8gX1NDSEVNQSBjb2xsZWN0aW9uIHRvIGhhbmRsZSBhbGwgYWRkaXRpb25zLlxuICAgICAgICBjb25zdCBkZWxldGVkRmllbGRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBpbnNlcnRlZEZpZWxkcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIGRlbGV0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNlcnRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgZGVsZXRlUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICBpZiAoZGVsZXRlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSA9IHRoaXMuZGVsZXRlRmllbGRzKGRlbGV0ZWRGaWVsZHMsIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICAgICAgICB9XG4gICAgICAgIGxldCBlbmZvcmNlRmllbGRzID0gW107XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSAvLyBEZWxldGUgRXZlcnl0aGluZ1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSkgLy8gUmVsb2FkIG91ciBTY2hlbWEsIHNvIHdlIGhhdmUgYWxsIHRoZSBuZXcgdmFsdWVzXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHByb21pc2VzID0gaW5zZXJ0ZWRGaWVsZHMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZSA9IHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgICBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0UGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgICBuZXdTY2hlbWFcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLl9kYkFkYXB0ZXIuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAgICAgICAgZnVsbE5ld1NjaGVtYVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKVxuICAgICAgICAgICAgLy9UT0RPOiBNb3ZlIHRoaXMgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlclxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICAgICAgICAgIGNvbnN0IHJlbG9hZGVkU2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICByZWxvYWRlZFNjaGVtYS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbG9hZGVkU2NoZW1hO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IG9yIGZhaWxzIHdpdGggYSByZWFzb24uXG4gIGVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3QgaGF2ZSB0aGlzIGNsYXNzLiBVcGRhdGUgdGhlIHNjaGVtYVxuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmFkZENsYXNzSWZOb3RFeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBzdWNjZWVkZWQuIFJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHRcbiAgICAgICAgICAvLyBoYXZlIGZhaWxlZCBiZWNhdXNlIHRoZXJlJ3MgYSByYWNlIGNvbmRpdGlvbiBhbmQgYSBkaWZmZXJlbnRcbiAgICAgICAgICAvLyBjbGllbnQgaXMgbWFraW5nIHRoZSBleGFjdCBzYW1lIHNjaGVtYSB1cGRhdGUgdGhhdCB3ZSB3YW50LlxuICAgICAgICAgIC8vIFNvIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWEuXG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2NoZW1hIG5vdyB2YWxpZGF0ZXNcbiAgICAgICAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYEZhaWxlZCB0byBhZGQgJHtjbGFzc05hbWV9YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBzdGlsbCBkb2Vzbid0IHZhbGlkYXRlLiBHaXZlIHVwXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ3NjaGVtYSBjbGFzcyBuYW1lIGRvZXMgbm90IHJldmFsaWRhdGUnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVOZXdDbGFzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55XG4gICk6IGFueSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBlcnJvcjogaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIGZpZWxkcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgIFtdXG4gICAgKTtcbiAgfVxuXG4gIHZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICBleGlzdGluZ0ZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz5cbiAgKSB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgICBpZiAoZXhpc3RpbmdGaWVsZE5hbWVzLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGVycm9yOiAnaW52YWxpZCBmaWVsZCBuYW1lOiAnICsgZmllbGROYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IDEzNixcbiAgICAgICAgICAgIGVycm9yOiAnZmllbGQgJyArIGZpZWxkTmFtZSArICcgY2Fubm90IGJlIGFkZGVkJyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBjb25zdCBlcnJvciA9IGZpZWxkVHlwZUlzSW52YWxpZChmaWVsZFR5cGUpO1xuICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB7IGNvZGU6IGVycm9yLmNvZGUsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIGlmIChmaWVsZFR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICB0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ2RlZmF1bHQgdmFsdWUnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlXG4gICAgICAgICAgICAgICl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZmllbGRUeXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZVxuICAgICAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUucmVxdWlyZWQpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAncmVxdWlyZWQnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlXG4gICAgICAgICAgICAgICl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSkge1xuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV07XG4gICAgfVxuXG4gICAgY29uc3QgZ2VvUG9pbnRzID0gT2JqZWN0LmtleXMoZmllbGRzKS5maWx0ZXIoXG4gICAgICBrZXkgPT4gZmllbGRzW2tleV0gJiYgZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICk7XG4gICAgaWYgKGdlb1BvaW50cy5sZW5ndGggPiAxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgZXJyb3I6XG4gICAgICAgICAgJ2N1cnJlbnRseSwgb25seSBvbmUgR2VvUG9pbnQgZmllbGQgbWF5IGV4aXN0IGluIGFuIG9iamVjdC4gQWRkaW5nICcgK1xuICAgICAgICAgIGdlb1BvaW50c1sxXSArXG4gICAgICAgICAgJyB3aGVuICcgK1xuICAgICAgICAgIGdlb1BvaW50c1swXSArXG4gICAgICAgICAgJyBhbHJlYWR5IGV4aXN0cy4nLFxuICAgICAgfTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHMpO1xuICB9XG5cbiAgLy8gU2V0cyB0aGUgQ2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgZm9yIGEgZ2l2ZW4gY2xhc3NOYW1lLCB3aGljaCBtdXN0IGV4aXN0LlxuICBzZXRQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgcGVybXM6IGFueSwgbmV3U2NoZW1hOiBTY2hlbWFGaWVsZHMpIHtcbiAgICBpZiAodHlwZW9mIHBlcm1zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChwZXJtcywgbmV3U2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUsIHBlcm1zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyB8IFNjaGVtYUZpZWxkXG4gICkge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gc3ViZG9jdW1lbnQga2V5ICh4LnkpID0+IG9rIGlmIHggaXMgb2YgdHlwZSAnb2JqZWN0J1xuICAgICAgZmllbGROYW1lID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgICB0eXBlID0gJ09iamVjdCc7XG4gICAgfVxuICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIElmIHNvbWVvbmUgdHJpZXMgdG8gY3JlYXRlIGEgbmV3IGZpZWxkIHdpdGggbnVsbC91bmRlZmluZWQgYXMgdGhlIHZhbHVlLCByZXR1cm47XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gKHsgdHlwZSB9OiBTY2hlbWFGaWVsZCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZSh0eXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUodHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICB0eXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4cGVjdGVkVHlwZSkge1xuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9OyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIGV4cGVjdGVkVHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcodHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFKSB7XG4gICAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgd2UgdGhyb3cgZXJyb3JzIHdoZW4gaXQgaXMgYXBwcm9wcmlhdGUgdG8gZG8gc28uXG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhlIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodCBoYXZlIGJlZW4gYSByYWNlXG4gICAgICAgIC8vIGNvbmRpdGlvbiB3aGVyZSBhbm90aGVyIGNsaWVudCB1cGRhdGVkIHRoZSBzY2hlbWEgaW4gdGhlIHNhbWVcbiAgICAgICAgLy8gd2F5IHRoYXQgd2Ugd2FudGVkIHRvLiBTbywganVzdCByZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgdHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZW5zdXJlRmllbGRzKGZpZWxkczogYW55KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGxldCB7IHR5cGUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHlwZSA9IHsgdHlwZTogdHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFleHBlY3RlZFR5cGUgfHwgIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgQ291bGQgbm90IGFkZCBmaWVsZCAke2ZpZWxkTmFtZX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbWFpbnRhaW4gY29tcGF0aWJpbGl0eVxuICBkZWxldGVGaWVsZChcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIHJldHVybiB0aGlzLmRlbGV0ZUZpZWxkcyhbZmllbGROYW1lXSwgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gIH1cblxuICAvLyBEZWxldGUgZmllbGRzLCBhbmQgcmVtb3ZlIHRoYXQgZGF0YSBmcm9tIGFsbCBvYmplY3RzLiBUaGlzIGlzIGludGVuZGVkXG4gIC8vIHRvIHJlbW92ZSB1bnVzZWQgZmllbGRzLCBpZiBvdGhlciB3cml0ZXJzIGFyZSB3cml0aW5nIG9iamVjdHMgdGhhdCBpbmNsdWRlXG4gIC8vIHRoaXMgZmllbGQsIHRoZSBmaWVsZCBtYXkgcmVhcHBlYXIuIFJldHVybnMgYSBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aFxuICAvLyBubyBvYmplY3Qgb24gc3VjY2Vzcywgb3IgcmVqZWN0cyB3aXRoIHsgY29kZSwgZXJyb3IgfSBvbiBmYWlsdXJlLlxuICAvLyBQYXNzaW5nIHRoZSBkYXRhYmFzZSBhbmQgcHJlZml4IGlzIG5lY2Vzc2FyeSBpbiBvcmRlciB0byBkcm9wIHJlbGF0aW9uIGNvbGxlY3Rpb25zXG4gIC8vIGFuZCByZW1vdmUgZmllbGRzIGZyb20gb2JqZWN0cy4gSWRlYWxseSB0aGUgZGF0YWJhc2Ugd291bGQgYmVsb25nIHRvXG4gIC8vIGEgZGF0YWJhc2UgYWRhcHRlciBhbmQgdGhpcyBmdW5jdGlvbiB3b3VsZCBjbG9zZSBvdmVyIGl0IG9yIGFjY2VzcyBpdCB2aWEgbWVtYmVyLlxuICBkZWxldGVGaWVsZHMoXG4gICAgZmllbGROYW1lczogQXJyYXk8c3RyaW5nPixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgIGBpbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vRG9uJ3QgYWxsb3cgZGVsZXRpbmcgdGhlIGRlZmF1bHQgZmllbGRzLlxuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsIGBmaWVsZCAke2ZpZWxkTmFtZX0gY2Fubm90IGJlIGNoYW5nZWRgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGZhbHNlLCB7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7ZmllbGROYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hRmllbGRzID0geyAuLi5zY2hlbWEuZmllbGRzIH07XG4gICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyXG4gICAgICAgICAgLmRlbGV0ZUZpZWxkcyhjbGFzc05hbWUsIHNjaGVtYSwgZmllbGROYW1lcylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgIGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWFGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgICAgICAgLy9Gb3IgcmVsYXRpb25zLCBkcm9wIHRoZSBfSm9pbiB0YWJsZVxuICAgICAgICAgICAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoXG4gICAgICAgICAgICAgICAgICAgIGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9jYWNoZS5jbGVhcigpKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvYmplY3QgcHJvdmlkZWQgaW4gUkVTVCBmb3JtYXQuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEgaWYgdGhpcyBvYmplY3QgaXNcbiAgLy8gdmFsaWQuXG4gIGFzeW5jIHZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGxldCBnZW9jb3VudCA9IDA7XG4gICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgdGhpcy5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGVjdGVkID0gZ2V0VHlwZShvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICBpZiAoZXhwZWN0ZWQgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgZ2VvY291bnQrKztcbiAgICAgIH1cbiAgICAgIGlmIChnZW9jb3VudCA+IDEpIHtcbiAgICAgICAgLy8gTWFrZSBzdXJlIGFsbCBmaWVsZCB2YWxpZGF0aW9uIG9wZXJhdGlvbnMgcnVuIGJlZm9yZSB3ZSByZXR1cm4uXG4gICAgICAgIC8vIElmIG5vdCAtIHdlIGFyZSBjb250aW51aW5nIHRvIHJ1biBsb2dpYywgYnV0IGFscmVhZHkgcHJvdmlkZWQgcmVzcG9uc2UgZnJvbSB0aGUgc2VydmVyLlxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAndGhlcmUgY2FuIG9ubHkgYmUgb25lIGdlb3BvaW50IGZpZWxkIGluIGEgY2xhc3MnXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFleHBlY3RlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdBQ0wnKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9iamVjdCBoYXMgQUNMIGltcGxpY2l0bHkuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcHJvbWlzZXMucHVzaChzY2hlbWEuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBleHBlY3RlZCkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGNvbnN0IGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuXG4gICAgaWYgKGVuZm9yY2VGaWVsZHMubGVuZ3RoICE9PSAwKSB7XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH1cbiAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcblxuICAgIGNvbnN0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgdGhhdCBhbGwgdGhlIHByb3BlcnRpZXMgYXJlIHNldCBmb3IgdGhlIG9iamVjdFxuICB2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVxdWlyZWRDb2x1bW5zW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjb2x1bW5zIHx8IGNvbHVtbnMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2luZ0NvbHVtbnMgPSBjb2x1bW5zLmZpbHRlcihmdW5jdGlvbihjb2x1bW4pIHtcbiAgICAgIGlmIChxdWVyeSAmJiBxdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAob2JqZWN0W2NvbHVtbl0gJiYgdHlwZW9mIG9iamVjdFtjb2x1bW5dID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIC8vIFRyeWluZyB0byBkZWxldGUgYSByZXF1aXJlZCBjb2x1bW5cbiAgICAgICAgICByZXR1cm4gb2JqZWN0W2NvbHVtbl0uX19vcCA9PSAnRGVsZXRlJztcbiAgICAgICAgfVxuICAgICAgICAvLyBOb3QgdHJ5aW5nIHRvIGRvIGFueXRoaW5nIHRoZXJlXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhb2JqZWN0W2NvbHVtbl07XG4gICAgfSk7XG5cbiAgICBpZiAobWlzc2luZ0NvbHVtbnMubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgbWlzc2luZ0NvbHVtbnNbMF0gKyAnIGlzIHJlcXVpcmVkLidcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gIH1cblxuICB0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nXG4gICkge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBUZXN0cyB0aGF0IHRoZSBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uIGxldCBwYXNzIHRoZSBvcGVyYXRpb24gZm9yIGEgZ2l2ZW4gYWNsR3JvdXBcbiAgc3RhdGljIHRlc3RQZXJtaXNzaW9ucyhcbiAgICBjbGFzc1Blcm1pc3Npb25zOiA/YW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZ1xuICApOiBib29sZWFuIHtcbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIGlmIChwZXJtc1snKiddKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgcGVybWlzc2lvbnMgYWdhaW5zdCB0aGUgYWNsR3JvdXAgcHJvdmlkZWQgKGFycmF5IG9mIHVzZXJJZC9yb2xlcylcbiAgICBpZiAoXG4gICAgICBhY2xHcm91cC5zb21lKGFjbCA9PiB7XG4gICAgICAgIHJldHVybiBwZXJtc1thY2xdID09PSB0cnVlO1xuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICBzdGF0aWMgdmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgIGNsYXNzUGVybWlzc2lvbnM6ID9hbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nXG4gICkge1xuICAgIGlmIChcbiAgICAgIFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcGVyYXRpb24pXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMVxuICAgICAgICA/ICdyZWFkVXNlckZpZWxkcydcbiAgICAgICAgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHRoZSByZWFkVXNlckZpZWxkcyBsYXRlclxuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSAmJlxuICAgICAgY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nKTogYW55IHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0gJiZcbiAgICAgIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmNsYXNzTGV2ZWxQZXJtaXNzaW9uc1xuICAgICk7XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBleHBlY3RlZCB0eXBlIGZvciBhIGNsYXNzTmFtZStrZXkgY29tYmluYXRpb25cbiAgLy8gb3IgdW5kZWZpbmVkIGlmIHRoZSBzY2hlbWEgaXMgbm90IHNldFxuICBnZXRFeHBlY3RlZFR5cGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmdcbiAgKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZXhwZWN0ZWRUeXBlID09PSAnbWFwJyA/ICdPYmplY3QnIDogZXhwZWN0ZWRUeXBlO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGlmIGEgZ2l2ZW4gY2xhc3MgaXMgaW4gdGhlIHNjaGVtYS5cbiAgaGFzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoKS50aGVuKCgpID0+ICEhdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIG5ldyBTY2hlbWEuXG5jb25zdCBsb2FkID0gKFxuICBkYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLFxuICBzY2hlbWFDYWNoZTogYW55LFxuICBvcHRpb25zOiBhbnlcbik6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIsIHNjaGVtYUNhY2hlKTtcbiAgcmV0dXJuIHNjaGVtYS5yZWxvYWREYXRhKG9wdGlvbnMpLnRoZW4oKCkgPT4gc2NoZW1hKTtcbn07XG5cbi8vIEJ1aWxkcyBhIG5ldyBzY2hlbWEgKGluIHNjaGVtYSBBUEkgcmVzcG9uc2UgZm9ybWF0KSBvdXQgb2YgYW5cbi8vIGV4aXN0aW5nIG1vbmdvIHNjaGVtYSArIGEgc2NoZW1hcyBBUEkgcHV0IHJlcXVlc3QuIFRoaXMgcmVzcG9uc2Vcbi8vIGRvZXMgbm90IGluY2x1ZGUgdGhlIGRlZmF1bHQgZmllbGRzLCBhcyBpdCBpcyBpbnRlbmRlZCB0byBiZSBwYXNzZWRcbi8vIHRvIG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZS4gTm8gdmFsaWRhdGlvbiBpcyBkb25lIGhlcmUsIGl0XG4vLyBpcyBkb25lIGluIG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZS5cbmZ1bmN0aW9uIGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KFxuICBleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLFxuICBwdXRSZXF1ZXN0OiBhbnlcbik6IFNjaGVtYUZpZWxkcyB7XG4gIGNvbnN0IG5ld1NjaGVtYSA9IHt9O1xuICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgY29uc3Qgc3lzU2NoZW1hRmllbGQgPVxuICAgIE9iamVjdC5rZXlzKGRlZmF1bHRDb2x1bW5zKS5pbmRleE9mKGV4aXN0aW5nRmllbGRzLl9pZCkgPT09IC0xXG4gICAgICA/IFtdXG4gICAgICA6IE9iamVjdC5rZXlzKGRlZmF1bHRDb2x1bW5zW2V4aXN0aW5nRmllbGRzLl9pZF0pO1xuICBmb3IgKGNvbnN0IG9sZEZpZWxkIGluIGV4aXN0aW5nRmllbGRzKSB7XG4gICAgaWYgKFxuICAgICAgb2xkRmllbGQgIT09ICdfaWQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ0FDTCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAndXBkYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdjcmVhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ29iamVjdElkJ1xuICAgICkge1xuICAgICAgaWYgKFxuICAgICAgICBzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmXG4gICAgICAgIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMVxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZmllbGRJc0RlbGV0ZWQgPVxuICAgICAgICBwdXRSZXF1ZXN0W29sZEZpZWxkXSAmJiBwdXRSZXF1ZXN0W29sZEZpZWxkXS5fX29wID09PSAnRGVsZXRlJztcbiAgICAgIGlmICghZmllbGRJc0RlbGV0ZWQpIHtcbiAgICAgICAgbmV3U2NoZW1hW29sZEZpZWxkXSA9IGV4aXN0aW5nRmllbGRzW29sZEZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBuZXdGaWVsZCBpbiBwdXRSZXF1ZXN0KSB7XG4gICAgaWYgKG5ld0ZpZWxkICE9PSAnb2JqZWN0SWQnICYmIHB1dFJlcXVlc3RbbmV3RmllbGRdLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICBpZiAoXG4gICAgICAgIHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiZcbiAgICAgICAgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xXG4gICAgICApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBuZXdTY2hlbWFbbmV3RmllbGRdID0gcHV0UmVxdWVzdFtuZXdGaWVsZF07XG4gICAgfVxuICB9XG4gIHJldHVybiBuZXdTY2hlbWE7XG59XG5cbi8vIEdpdmVuIGEgc2NoZW1hIHByb21pc2UsIGNvbnN0cnVjdCBhbm90aGVyIHNjaGVtYSBwcm9taXNlIHRoYXRcbi8vIHZhbGlkYXRlcyB0aGlzIGZpZWxkIG9uY2UgdGhlIHNjaGVtYSBsb2Fkcy5cbmZ1bmN0aW9uIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhzY2hlbWFQcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpIHtcbiAgcmV0dXJuIHNjaGVtYVByb21pc2UudGhlbihzY2hlbWEgPT4ge1xuICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfSk7XG59XG5cbi8vIEdldHMgdGhlIHR5cGUgZnJvbSBhIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3QsIHdoZXJlICd0eXBlJyBpc1xuLy8gZXh0ZW5kZWQgcGFzdCBqYXZhc2NyaXB0IHR5cGVzIHRvIGluY2x1ZGUgdGhlIHJlc3Qgb2YgdGhlIFBhcnNlXG4vLyB0eXBlIHN5c3RlbS5cbi8vIFRoZSBvdXRwdXQgc2hvdWxkIGJlIGEgdmFsaWQgc2NoZW1hIHZhbHVlLlxuLy8gVE9ETzogZW5zdXJlIHRoYXQgdGhpcyBpcyBjb21wYXRpYmxlIHdpdGggdGhlIGZvcm1hdCB1c2VkIGluIE9wZW4gREJcbmZ1bmN0aW9uIGdldFR5cGUob2JqOiBhbnkpOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gIGNvbnN0IHR5cGUgPSB0eXBlb2Ygb2JqO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiAnQm9vbGVhbic7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiAnU3RyaW5nJztcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgIGNhc2UgJ21hcCc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmopO1xuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICdiYWQgb2JqOiAnICsgb2JqO1xuICB9XG59XG5cbi8vIFRoaXMgZ2V0cyB0aGUgdHlwZSBmb3Igbm9uLUpTT04gdHlwZXMgbGlrZSBwb2ludGVycyBhbmQgZmlsZXMsIGJ1dFxuLy8gYWxzbyBnZXRzIHRoZSBhcHByb3ByaWF0ZSB0eXBlIGZvciAkIG9wZXJhdG9ycy5cbi8vIFJldHVybnMgbnVsbCBpZiB0aGUgdHlwZSBpcyB1bmtub3duLlxuZnVuY3Rpb24gZ2V0T2JqZWN0VHlwZShvYmopOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gIGlmIChvYmogaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiAnQXJyYXknO1xuICB9XG4gIGlmIChvYmouX190eXBlKSB7XG4gICAgc3dpdGNoIChvYmouX190eXBlKSB7XG4gICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgaWYgKG9iai5uYW1lKSB7XG4gICAgICAgICAgcmV0dXJuICdGaWxlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICBpZiAob2JqLmlzbykge1xuICAgICAgICAgIHJldHVybiAnRGF0ZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgIGlmIChvYmoubGF0aXR1ZGUgIT0gbnVsbCAmJiBvYmoubG9uZ2l0dWRlICE9IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgaWYgKG9iai5iYXNlNjQpIHtcbiAgICAgICAgICByZXR1cm4gJ0J5dGVzJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgICBpZiAob2JqLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgcmV0dXJuICdQb2x5Z29uJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAnVGhpcyBpcyBub3QgYSB2YWxpZCAnICsgb2JqLl9fdHlwZVxuICAgICk7XG4gIH1cbiAgaWYgKG9ialsnJG5lJ10pIHtcbiAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmpbJyRuZSddKTtcbiAgfVxuICBpZiAob2JqLl9fb3ApIHtcbiAgICBzd2l0Y2ggKG9iai5fX29wKSB7XG4gICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgcmV0dXJuICdBcnJheSc7XG4gICAgICBjYXNlICdBZGRSZWxhdGlvbic6XG4gICAgICBjYXNlICdSZW1vdmVSZWxhdGlvbic6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLm9iamVjdHNbMF0uY2xhc3NOYW1lLFxuICAgICAgICB9O1xuICAgICAgY2FzZSAnQmF0Y2gnOlxuICAgICAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmoub3BzWzBdKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93ICd1bmV4cGVjdGVkIG9wOiAnICsgb2JqLl9fb3A7XG4gICAgfVxuICB9XG4gIHJldHVybiAnT2JqZWN0Jztcbn1cblxuZXhwb3J0IHtcbiAgbG9hZCxcbiAgY2xhc3NOYW1lSXNWYWxpZCxcbiAgZmllbGROYW1lSXNWYWxpZCxcbiAgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UsXG4gIGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0LFxuICBzeXN0ZW1DbGFzc2VzLFxuICBkZWZhdWx0Q29sdW1ucyxcbiAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSxcbiAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgU2NoZW1hQ29udHJvbGxlcixcbn07XG4iXX0=