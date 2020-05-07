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

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

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
  },
  _ExportProgress: {
    objectId: {
      type: 'String'
    },
    id: {
      type: 'String'
    },
    masterKey: {
      type: 'String'
    },
    applicationId: {
      type: 'String'
    }
  }
});
exports.defaultColumns = defaultColumns;
const requiredColumns = Object.freeze({
  _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
  _Role: ['name', 'ACL']
});
const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_ExportProgress']);
exports.systemClasses = systemClasses;
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_ExportProgress']); // 10 alpha numberic chars + uppercase

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsImRlZmF1bHRDb2x1bW5zIiwiT2JqZWN0IiwiZnJlZXplIiwiX0RlZmF1bHQiLCJvYmplY3RJZCIsInR5cGUiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJBQ0wiLCJfVXNlciIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJlbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJhdXRoRGF0YSIsIl9JbnN0YWxsYXRpb24iLCJpbnN0YWxsYXRpb25JZCIsImRldmljZVRva2VuIiwiY2hhbm5lbHMiLCJkZXZpY2VUeXBlIiwicHVzaFR5cGUiLCJHQ01TZW5kZXJJZCIsInRpbWVab25lIiwibG9jYWxlSWRlbnRpZmllciIsImJhZGdlIiwiYXBwVmVyc2lvbiIsImFwcE5hbWUiLCJhcHBJZGVudGlmaWVyIiwicGFyc2VWZXJzaW9uIiwiX1JvbGUiLCJuYW1lIiwidXNlcnMiLCJ0YXJnZXRDbGFzcyIsInJvbGVzIiwiX1Nlc3Npb24iLCJyZXN0cmljdGVkIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJzb3VyY2UiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0V4cG9ydFByb2dyZXNzIiwiaWQiLCJtYXN0ZXJLZXkiLCJhcHBsaWNhdGlvbklkIiwicmVxdWlyZWRDb2x1bW5zIiwic3lzdGVtQ2xhc3NlcyIsInZvbGF0aWxlQ2xhc3NlcyIsInVzZXJJZFJlZ2V4Iiwicm9sZVJlZ2V4IiwicG9pbnRlclBlcm1pc3Npb25SZWdleCIsInB1YmxpY1JlZ2V4IiwicmVxdWlyZUF1dGhlbnRpY2F0aW9uUmVnZXgiLCJwZXJtaXNzaW9uS2V5UmVnZXgiLCJ2ZXJpZnlQZXJtaXNzaW9uS2V5Iiwia2V5IiwicmVzdWx0IiwicmVkdWNlIiwiaXNHb29kIiwicmVnRXgiLCJtYXRjaCIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsImtleXMiLCJmb3JFYWNoIiwib3BlcmF0aW9uIiwiaW5kZXhPZiIsIkFycmF5IiwiaXNBcnJheSIsInBlcm0iLCJqb2luQ2xhc3NSZWdleCIsImNsYXNzQW5kRmllbGRSZWdleCIsImNsYXNzTmFtZUlzVmFsaWQiLCJ0ZXN0IiwiZmllbGROYW1lSXNWYWxpZCIsImZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInVuZGVmaW5lZCIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiaW5kZXhlcyIsImxlbmd0aCIsIlNjaGVtYURhdGEiLCJjb25zdHJ1Y3RvciIsImFsbFNjaGVtYXMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJfX2RhdGEiLCJfX3Byb3RlY3RlZEZpZWxkcyIsImluY2x1ZGVzIiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQcm90ZWN0ZWRGaWVsZHMiLCJ1bnEiLCJTZXQiLCJmcm9tIiwiZGVmYXVsdFNjaGVtYSIsIl9Ib29rc1NjaGVtYSIsIl9HbG9iYWxDb25maWdTY2hlbWEiLCJfR3JhcGhRTENvbmZpZ1NjaGVtYSIsIl9QdXNoU3RhdHVzU2NoZW1hIiwiX0pvYlN0YXR1c1NjaGVtYSIsIl9Kb2JTY2hlZHVsZVNjaGVtYSIsIl9BdWRpZW5jZVNjaGVtYSIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSIsImRiVHlwZSIsIm9iamVjdFR5cGUiLCJ0eXBlVG9TdHJpbmciLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwic2NoZW1hQ2FjaGUiLCJfZGJBZGFwdGVyIiwiX2NhY2hlIiwic2NoZW1hRGF0YSIsIkNvbmZpZyIsInJlbG9hZERhdGEiLCJvcHRpb25zIiwiY2xlYXJDYWNoZSIsInJlbG9hZERhdGFQcm9taXNlIiwiZ2V0QWxsQ2xhc3NlcyIsInRoZW4iLCJlcnIiLCJzZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsIlByb21pc2UiLCJyZXNvbHZlIiwibWFwIiwiY2F0Y2giLCJlcnJvciIsImNvbnNvbGUiLCJnZXRPbmVTY2hlbWEiLCJhbGxvd1ZvbGF0aWxlQ2xhc3NlcyIsInByb21pc2UiLCJjbGVhciIsImNhY2hlZCIsIm9uZVNjaGVtYSIsImZpbmQiLCJyZWplY3QiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwidmFsaWRhdGlvbkVycm9yIiwidmFsaWRhdGVOZXdDbGFzcyIsImNvZGUiLCJjcmVhdGVDbGFzcyIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZUNsYXNzIiwic3VibWl0dGVkRmllbGRzIiwiZGF0YWJhc2UiLCJleGlzdGluZ0ZpZWxkcyIsImZpZWxkIiwiX19vcCIsIm5ld1NjaGVtYSIsImJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0IiwiZGVmYXVsdEZpZWxkcyIsImZ1bGxOZXdTY2hlbWEiLCJhc3NpZ24iLCJ2YWxpZGF0ZVNjaGVtYURhdGEiLCJkZWxldGVkRmllbGRzIiwiaW5zZXJ0ZWRGaWVsZHMiLCJwdXNoIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsImFsbCIsInJlc3VsdHMiLCJmaWx0ZXIiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJleGlzdGluZ0ZpZWxkTmFtZXMiLCJJTlZBTElEX0tFWV9OQU1FIiwiZmllbGRUeXBlIiwiZGVmYXVsdFZhbHVlIiwiZGVmYXVsdFZhbHVlVHlwZSIsImdldFR5cGUiLCJyZXF1aXJlZCIsImdlb1BvaW50cyIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsInNwbGl0IiwiZXhwZWN0ZWRUeXBlIiwiZ2V0RXhwZWN0ZWRUeXBlIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImkiLCJkZWxldGVGaWVsZCIsImZpZWxkTmFtZXMiLCJzY2hlbWFGaWVsZHMiLCJhZGFwdGVyIiwiZGVsZXRlQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsIm9iamVjdCIsImdlb2NvdW50IiwiZXhwZWN0ZWQiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJvYmoiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBa0JBOztBQUNBOztBQUNBOztBQUVBOzs7Ozs7Ozs7Ozs7QUFyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JELEtBQXBDOztBQWNBLE1BQU1FLGNBQTBDLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO0FBQy9EO0FBQ0FDLEVBQUFBLFFBQVEsRUFBRTtBQUNSQyxJQUFBQSxRQUFRLEVBQUU7QUFBRUMsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FERjtBQUVSQyxJQUFBQSxTQUFTLEVBQUU7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RSxZQUFJTCxHQUFHLENBQUNNLE1BQVIsRUFBZ0I7QUFDZCxpQkFBTyxPQUFQO0FBQ0Q7O0FBQ0Q7O0FBQ0YsV0FBSyxTQUFMO0FBQ0UsWUFBSU4sR0FBRyxDQUFDTyxXQUFSLEVBQXFCO0FBQ25CLGlCQUFPLFNBQVA7QUFDRDs7QUFDRDtBQXpDSjs7QUEyQ0EsVUFBTSxJQUFJdlMsS0FBSyxDQUFDK0csS0FBVixDQUNKL0csS0FBSyxDQUFDK0csS0FBTixDQUFZMEIsY0FEUixFQUVKLHlCQUF5QnVKLEdBQUcsQ0FBQ0UsTUFGekIsQ0FBTjtBQUlEOztBQUNELE1BQUlGLEdBQUcsQ0FBQyxLQUFELENBQVAsRUFBZ0I7QUFDZCxXQUFPQyxhQUFhLENBQUNELEdBQUcsQ0FBQyxLQUFELENBQUosQ0FBcEI7QUFDRDs7QUFDRCxNQUFJQSxHQUFHLENBQUN4RSxJQUFSLEVBQWM7QUFDWixZQUFRd0UsR0FBRyxDQUFDeEUsSUFBWjtBQUNFLFdBQUssV0FBTDtBQUNFLGVBQU8sUUFBUDs7QUFDRixXQUFLLFFBQUw7QUFDRSxlQUFPLElBQVA7O0FBQ0YsV0FBSyxLQUFMO0FBQ0EsV0FBSyxXQUFMO0FBQ0EsV0FBSyxRQUFMO0FBQ0UsZUFBTyxPQUFQOztBQUNGLFdBQUssYUFBTDtBQUNBLFdBQUssZ0JBQUw7QUFDRSxlQUFPO0FBQ0xqTixVQUFBQSxJQUFJLEVBQUUsVUFERDtBQUVMMkIsVUFBQUEsV0FBVyxFQUFFOFAsR0FBRyxDQUFDUSxPQUFKLENBQVksQ0FBWixFQUFldk47QUFGdkIsU0FBUDs7QUFJRixXQUFLLE9BQUw7QUFDRSxlQUFPZ04sYUFBYSxDQUFDRCxHQUFHLENBQUNTLEdBQUosQ0FBUSxDQUFSLENBQUQsQ0FBcEI7O0FBQ0Y7QUFDRSxjQUFNLG9CQUFvQlQsR0FBRyxDQUFDeEUsSUFBOUI7QUFsQko7QUFvQkQ7O0FBQ0QsU0FBTyxRQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHNjaGVtYSB2YWxpZGF0aW9uLCBwZXJzaXN0ZW5jZSwgYW5kIG1vZGlmaWNhdGlvbi5cbi8vXG4vLyBFYWNoIGluZGl2aWR1YWwgU2NoZW1hIG9iamVjdCBzaG91bGQgYmUgaW1tdXRhYmxlLiBUaGUgaGVscGVycyB0b1xuLy8gZG8gdGhpbmdzIHdpdGggdGhlIFNjaGVtYSBqdXN0IHJldHVybiBhIG5ldyBzY2hlbWEgd2hlbiB0aGUgc2NoZW1hXG4vLyBpcyBjaGFuZ2VkLlxuLy9cbi8vIFRoZSBjYW5vbmljYWwgcGxhY2UgdG8gc3RvcmUgdGhpcyBTY2hlbWEgaXMgaW4gdGhlIGRhdGFiYXNlIGl0c2VsZixcbi8vIGluIGEgX1NDSEVNQSBjb2xsZWN0aW9uLiBUaGlzIGlzIG5vdCB0aGUgcmlnaHQgd2F5IHRvIGRvIGl0IGZvciBhblxuLy8gb3BlbiBzb3VyY2UgZnJhbWV3b3JrLCBidXQgaXQncyBiYWNrd2FyZCBjb21wYXRpYmxlLCBzbyB3ZSdyZVxuLy8ga2VlcGluZyBpdCB0aGlzIHdheSBmb3Igbm93LlxuLy9cbi8vIEluIEFQSS1oYW5kbGluZyBjb2RlLCB5b3Ugc2hvdWxkIG9ubHkgdXNlIHRoZSBTY2hlbWEgY2xhc3MgdmlhIHRoZVxuLy8gRGF0YWJhc2VDb250cm9sbGVyLiBUaGlzIHdpbGwgbGV0IHVzIHJlcGxhY2UgdGhlIHNjaGVtYSBsb2dpYyBmb3Jcbi8vIGRpZmZlcmVudCBkYXRhYmFzZXMuXG4vLyBUT0RPOiBoaWRlIGFsbCBzY2hlbWEgbG9naWMgaW5zaWRlIHRoZSBkYXRhYmFzZSBhZGFwdGVyLlxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCB0eXBlIHtcbiAgU2NoZW1hLFxuICBTY2hlbWFGaWVsZHMsXG4gIENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgU2NoZW1hRmllbGQsXG4gIExvYWRTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL3R5cGVzJztcblxuY29uc3QgZGVmYXVsdENvbHVtbnM6IHsgW3N0cmluZ106IFNjaGVtYUZpZWxkcyB9ID0gT2JqZWN0LmZyZWV6ZSh7XG4gIC8vIENvbnRhaW4gdGhlIGRlZmF1bHQgY29sdW1ucyBmb3IgZXZlcnkgcGFyc2Ugb2JqZWN0IHR5cGUgKGV4Y2VwdCBfSm9pbiBjb2xsZWN0aW9uKVxuICBfRGVmYXVsdDoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY3JlYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHVwZGF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBBQ0w6IHsgdHlwZTogJ0FDTCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1VzZXIgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Vc2VyOiB7XG4gICAgdXNlcm5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXNzd29yZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWxWZXJpZmllZDogeyB0eXBlOiAnQm9vbGVhbicgfSxcbiAgICBhdXRoRGF0YTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfSW5zdGFsbGF0aW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfSW5zdGFsbGF0aW9uOiB7XG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXZpY2VUb2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNoYW5uZWxzOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICBkZXZpY2VUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcHVzaFR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBHQ01TZW5kZXJJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRpbWVab25lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbG9jYWxlSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGJhZGdlOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgYXBwVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyc2VWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Sb2xlIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfUm9sZToge1xuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1c2VyczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIHJvbGVzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1JvbGUnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9TZXNzaW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfU2Vzc2lvbjoge1xuICAgIHJlc3RyaWN0ZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgdXNlcjogeyB0eXBlOiAnUG9pbnRlcicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzZXNzaW9uVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmVzQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgY3JlYXRlZFdpdGg6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX1Byb2R1Y3Q6IHtcbiAgICBwcm9kdWN0SWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRvd25sb2FkOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIGRvd25sb2FkTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGljb246IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgb3JkZXI6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN1YnRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9QdXNoU3RhdHVzOiB7XG4gICAgcHVzaFRpbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gcmVzdCBvciB3ZWJ1aVxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHF1ZXJ5XG4gICAgcGF5bG9hZDogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBwYXlsb2FkLFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJ5OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgZXhwaXJhdGlvbl9pbnRlcnZhbDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG51bVNlbnQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBudW1GYWlsZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBwdXNoSGFzaDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVycm9yTWVzc2FnZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBjb3VudDogeyB0eXBlOiAnTnVtYmVyJyB9LCAvLyB0cmFja3MgIyBvZiBiYXRjaGVzIHF1ZXVlZCBhbmQgcGVuZGluZ1xuICB9LFxuICBfSm9iU3RhdHVzOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1lc3NhZ2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSwgLy8gcGFyYW1zIHJlY2VpdmVkIHdoZW4gY2FsbGluZyB0aGUgam9iXG4gICAgZmluaXNoZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbiAgX0pvYlNjaGVkdWxlOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhcnRBZnRlcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRheXNPZldlZWs6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIHRpbWVPZkRheTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxhc3RSdW46IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICByZXBlYXRNaW51dGVzOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9Ib29rczoge1xuICAgIGZ1bmN0aW9uTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNsYXNzTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRyaWdnZXJOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXJsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9HbG9iYWxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIG1hc3RlcktleU9ubHk6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0dyYXBoUUxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNvbmZpZzogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfQXVkaWVuY2U6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvL3N0b3JpbmcgcXVlcnkgYXMgSlNPTiBzdHJpbmcgdG8gcHJldmVudCBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCIgZXJyb3JcbiAgICBsYXN0VXNlZDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB0aW1lc1VzZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0V4cG9ydFByb2dyZXNzOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1hc3RlcktleTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcGxpY2F0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICBfUm9sZTogWyduYW1lJywgJ0FDTCddLFxufSk7XG5cbmNvbnN0IHN5c3RlbUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Vc2VyJyxcbiAgJ19JbnN0YWxsYXRpb24nLFxuICAnX1JvbGUnLFxuICAnX1Nlc3Npb24nLFxuICAnX1Byb2R1Y3QnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0pvYlN0YXR1cycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19FeHBvcnRQcm9ncmVzcycsXG5dKTtcblxuY29uc3Qgdm9sYXRpbGVDbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Ib29rcycsXG4gICdfR2xvYmFsQ29uZmlnJyxcbiAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0V4cG9ydFByb2dyZXNzJyxcbl0pO1xuXG4vLyAxMCBhbHBoYSBudW1iZXJpYyBjaGFycyArIHVwcGVyY2FzZVxuY29uc3QgdXNlcklkUmVnZXggPSAvXlthLXpBLVowLTldezEwfSQvO1xuLy8gQW55dGhpbmcgdGhhdCBzdGFydCB3aXRoIHJvbGVcbmNvbnN0IHJvbGVSZWdleCA9IC9ecm9sZTouKi87XG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0cyB3aXRoIHVzZXJGaWVsZFxuY29uc3QgcG9pbnRlclBlcm1pc3Npb25SZWdleCA9IC9edXNlckZpZWxkOi4qLztcbi8vICogcGVybWlzc2lvblxuY29uc3QgcHVibGljUmVnZXggPSAvXlxcKiQvO1xuXG5jb25zdCByZXF1aXJlQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBwZXJtaXNzaW9uS2V5UmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgdXNlcklkUmVnZXgsXG4gIHJvbGVSZWdleCxcbiAgcG9pbnRlclBlcm1pc3Npb25SZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIHJlcXVpcmVBdXRoZW50aWNhdGlvblJlZ2V4LFxuXSk7XG5cbmZ1bmN0aW9uIHZlcmlmeVBlcm1pc3Npb25LZXkoa2V5KSB7XG4gIGNvbnN0IHJlc3VsdCA9IHBlcm1pc3Npb25LZXlSZWdleC5yZWR1Y2UoKGlzR29vZCwgcmVnRXgpID0+IHtcbiAgICBpc0dvb2QgPSBpc0dvb2QgfHwga2V5Lm1hdGNoKHJlZ0V4KSAhPSBudWxsO1xuICAgIHJldHVybiBpc0dvb2Q7XG4gIH0sIGZhbHNlKTtcbiAgaWYgKCFyZXN1bHQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IENMUFZhbGlkS2V5cyA9IE9iamVjdC5mcmVlemUoW1xuICAnZmluZCcsXG4gICdjb3VudCcsXG4gICdnZXQnLFxuICAnY3JlYXRlJyxcbiAgJ3VwZGF0ZScsXG4gICdkZWxldGUnLFxuICAnYWRkRmllbGQnLFxuICAncmVhZFVzZXJGaWVsZHMnLFxuICAnd3JpdGVVc2VyRmllbGRzJyxcbiAgJ3Byb3RlY3RlZEZpZWxkcycsXG5dKTtcbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQKHBlcm1zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkczogU2NoZW1hRmllbGRzKSB7XG4gIGlmICghcGVybXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgT2JqZWN0LmtleXMocGVybXMpLmZvckVhY2gob3BlcmF0aW9uID0+IHtcbiAgICBpZiAoQ0xQVmFsaWRLZXlzLmluZGV4T2Yob3BlcmF0aW9uKSA9PSAtMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAke29wZXJhdGlvbn0gaXMgbm90IGEgdmFsaWQgb3BlcmF0aW9uIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICghcGVybXNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChvcGVyYXRpb24gPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHBlcm1zW29wZXJhdGlvbl0pKSB7XG4gICAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtc1tvcGVyYXRpb25dfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9ufWBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlcm1zW29wZXJhdGlvbl0uZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICEoXG4gICAgICAgICAgICAgIGZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICgoZmllbGRzW2tleV0udHlwZSA9PSAnUG9pbnRlcicgJiZcbiAgICAgICAgICAgICAgICBmaWVsZHNba2V5XS50YXJnZXRDbGFzcyA9PSAnX1VzZXInKSB8fFxuICAgICAgICAgICAgICAgIGZpZWxkc1trZXldLnR5cGUgPT0gJ0FycmF5JylcbiAgICAgICAgICAgIClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQgY29sdW1uIGZvciBjbGFzcyBsZXZlbCBwb2ludGVyIHBlcm1pc3Npb25zICR7b3BlcmF0aW9ufWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBPYmplY3Qua2V5cyhwZXJtc1tvcGVyYXRpb25dKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICB2ZXJpZnlQZXJtaXNzaW9uS2V5KGtleSk7XG4gICAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICAgIGNvbnN0IHBlcm0gPSBwZXJtc1tvcGVyYXRpb25dW2tleV07XG4gICAgICBpZiAoXG4gICAgICAgIHBlcm0gIT09IHRydWUgJiZcbiAgICAgICAgKG9wZXJhdGlvbiAhPT0gJ3Byb3RlY3RlZEZpZWxkcycgfHwgIUFycmF5LmlzQXJyYXkocGVybSkpXG4gICAgICApIHtcbiAgICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYCcke3Blcm19JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259OiR7a2V5fToke3Blcm19YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn1cbmNvbnN0IGpvaW5DbGFzc1JlZ2V4ID0gL15fSm9pbjpbQS1aYS16MC05X10rOltBLVphLXowLTlfXSsvO1xuY29uc3QgY2xhc3NBbmRGaWVsZFJlZ2V4ID0gL15bQS1aYS16XVtBLVphLXowLTlfXSokLztcbmZ1bmN0aW9uIGNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgLy8gVmFsaWQgY2xhc3NlcyBtdXN0OlxuICByZXR1cm4gKFxuICAgIC8vIEJlIG9uZSBvZiBfVXNlciwgX0luc3RhbGxhdGlvbiwgX1JvbGUsIF9TZXNzaW9uIE9SXG4gICAgc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSB8fFxuICAgIC8vIEJlIGEgam9pbiB0YWJsZSBPUlxuICAgIGpvaW5DbGFzc1JlZ2V4LnRlc3QoY2xhc3NOYW1lKSB8fFxuICAgIC8vIEluY2x1ZGUgb25seSBhbHBoYS1udW1lcmljIGFuZCB1bmRlcnNjb3JlcywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4gICAgZmllbGROYW1lSXNWYWxpZChjbGFzc05hbWUpXG4gICk7XG59XG5cbi8vIFZhbGlkIGZpZWxkcyBtdXN0IGJlIGFscGhhLW51bWVyaWMsIGFuZCBub3Qgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIG9yIG51bWJlclxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gY2xhc3NBbmRGaWVsZFJlZ2V4LnRlc3QoZmllbGROYW1lKTtcbn1cblxuLy8gQ2hlY2tzIHRoYXQgaXQncyBub3QgdHJ5aW5nIHRvIGNsb2JiZXIgb25lIG9mIHRoZSBkZWZhdWx0IGZpZWxkcyBvZiB0aGUgY2xhc3MuXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBjbGFzc05hbWU6IHN0cmluZ1xuKTogYm9vbGVhbiB7XG4gIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgICdJbnZhbGlkIGNsYXNzbmFtZTogJyArXG4gICAgY2xhc3NOYW1lICtcbiAgICAnLCBjbGFzc25hbWVzIGNhbiBvbmx5IGhhdmUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMgYW5kIF8sIGFuZCBtdXN0IHN0YXJ0IHdpdGggYW4gYWxwaGEgY2hhcmFjdGVyICdcbiAgKTtcbn1cblxuY29uc3QgaW52YWxpZEpzb25FcnJvciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAnaW52YWxpZCBKU09OJ1xuKTtcbmNvbnN0IHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyA9IFtcbiAgJ051bWJlcicsXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdEYXRlJyxcbiAgJ09iamVjdCcsXG4gICdBcnJheScsXG4gICdHZW9Qb2ludCcsXG4gICdGaWxlJyxcbiAgJ0J5dGVzJyxcbiAgJ1BvbHlnb24nLFxuXTtcbi8vIFJldHVybnMgYW4gZXJyb3Igc3VpdGFibGUgZm9yIHRocm93aW5nIGlmIHRoZSB0eXBlIGlzIGludmFsaWRcbmNvbnN0IGZpZWxkVHlwZUlzSW52YWxpZCA9ICh7IHR5cGUsIHRhcmdldENsYXNzIH0pID0+IHtcbiAgaWYgKFsnUG9pbnRlcicsICdSZWxhdGlvbiddLmluZGV4T2YodHlwZSkgPj0gMCkge1xuICAgIGlmICghdGFyZ2V0Q2xhc3MpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoMTM1LCBgdHlwZSAke3R5cGV9IG5lZWRzIGEgY2xhc3MgbmFtZWApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRhcmdldENsYXNzICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gICAgfSBlbHNlIGlmICghY2xhc3NOYW1lSXNWYWxpZCh0YXJnZXRDbGFzcykpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UodGFyZ2V0Q2xhc3MpXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gIH1cbiAgaWYgKHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcy5pbmRleE9mKHR5cGUpIDwgMCkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgIGBpbnZhbGlkIGZpZWxkIHR5cGU6ICR7dHlwZX1gXG4gICAgKTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSA9IChzY2hlbWE6IGFueSkgPT4ge1xuICBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSk7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLkFDTDtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLnBhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBzY2hlbWEuZmllbGRzLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLmF1dGhEYXRhOyAvL0F1dGggZGF0YSBpcyBpbXBsaWNpdFxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5pbmRleGVzO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNsYXNzIFNjaGVtYURhdGEge1xuICBfX2RhdGE6IGFueTtcbiAgX19wcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgY29uc3RydWN0b3IoYWxsU2NoZW1hcyA9IFtdLCBwcm90ZWN0ZWRGaWVsZHMgPSB7fSkge1xuICAgIHRoaXMuX19kYXRhID0ge307XG4gICAgdGhpcy5fX3Byb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcztcbiAgICBhbGxTY2hlbWFzLmZvckVhY2goc2NoZW1hID0+IHtcbiAgICAgIGlmICh2b2xhdGlsZUNsYXNzZXMuaW5jbHVkZXMoc2NoZW1hLmNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIHNjaGVtYS5jbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSkuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBkZWVwY29weShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuXG4gICAgICAgICAgICBjb25zdCBjbGFzc1Byb3RlY3RlZEZpZWxkcyA9IHRoaXMuX19wcm90ZWN0ZWRGaWVsZHNbXG4gICAgICAgICAgICAgIHNjaGVtYS5jbGFzc05hbWVcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBpZiAoY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgIC4uLihkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB8fCBbXSksXG4gICAgICAgICAgICAgICAgICAuLi5jbGFzc1Byb3RlY3RlZEZpZWxkc1trZXldLFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldID0gQXJyYXkuZnJvbShcbiAgICAgICAgICAgICAgICAgIHVucVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEluamVjdCB0aGUgaW4tbWVtb3J5IGNsYXNzZXNcbiAgICB2b2xhdGlsZUNsYXNzZXMuZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkczoge30sXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtjbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuY29uc3QgaW5qZWN0RGVmYXVsdFNjaGVtYSA9ICh7XG4gIGNsYXNzTmFtZSxcbiAgZmllbGRzLFxuICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIGluZGV4ZXMsXG59OiBTY2hlbWEpID0+IHtcbiAgY29uc3QgZGVmYXVsdFNjaGVtYTogU2NoZW1hID0ge1xuICAgIGNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHtcbiAgICAgIC4uLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgLi4uKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwge30pLFxuICAgICAgLi4uZmllbGRzLFxuICAgIH0sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICB9O1xuICBpZiAoaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhpbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICBkZWZhdWx0U2NoZW1hLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG4gIHJldHVybiBkZWZhdWx0U2NoZW1hO1xufTtcblxuY29uc3QgX0hvb2tzU2NoZW1hID0geyBjbGFzc05hbWU6ICdfSG9va3MnLCBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9Ib29rcyB9O1xuY29uc3QgX0dsb2JhbENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dsb2JhbENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dsb2JhbENvbmZpZyxcbn07XG5jb25zdCBfR3JhcGhRTENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dyYXBoUUxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HcmFwaFFMQ29uZmlnLFxufTtcbmNvbnN0IF9QdXNoU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX1B1c2hTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTY2hlZHVsZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTY2hlZHVsZScsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9BdWRpZW5jZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19BdWRpZW5jZScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fQXVkaWVuY2UsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzID0gW1xuICBfSG9va3NTY2hlbWEsXG4gIF9Kb2JTdGF0dXNTY2hlbWEsXG4gIF9Kb2JTY2hlZHVsZVNjaGVtYSxcbiAgX1B1c2hTdGF0dXNTY2hlbWEsXG4gIF9HbG9iYWxDb25maWdTY2hlbWEsXG4gIF9HcmFwaFFMQ29uZmlnU2NoZW1hLFxuICBfQXVkaWVuY2VTY2hlbWEsXG5dO1xuXG5jb25zdCBkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSA9IChcbiAgZGJUeXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZyxcbiAgb2JqZWN0VHlwZTogU2NoZW1hRmllbGRcbikgPT4ge1xuICBpZiAoZGJUeXBlLnR5cGUgIT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlLnRhcmdldENsYXNzICE9PSBvYmplY3RUeXBlLnRhcmdldENsYXNzKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIGlmIChkYlR5cGUudHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuY29uc3QgdHlwZVRvU3RyaW5nID0gKHR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0eXBlO1xuICB9XG4gIGlmICh0eXBlLnRhcmdldENsYXNzKSB7XG4gICAgcmV0dXJuIGAke3R5cGUudHlwZX08JHt0eXBlLnRhcmdldENsYXNzfT5gO1xuICB9XG4gIHJldHVybiBgJHt0eXBlLnR5cGV9YDtcbn07XG5cbi8vIFN0b3JlcyB0aGUgZW50aXJlIHNjaGVtYSBvZiB0aGUgYXBwIGluIGEgd2VpcmQgaHlicmlkIGZvcm1hdCBzb21ld2hlcmUgYmV0d2VlblxuLy8gdGhlIG1vbmdvIGZvcm1hdCBhbmQgdGhlIFBhcnNlIGZvcm1hdC4gU29vbiwgdGhpcyB3aWxsIGFsbCBiZSBQYXJzZSBmb3JtYXQuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY2hlbWFDb250cm9sbGVyIHtcbiAgX2RiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYURhdGE6IHsgW3N0cmluZ106IFNjaGVtYSB9O1xuICBfY2FjaGU6IGFueTtcbiAgcmVsb2FkRGF0YVByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIHByb3RlY3RlZEZpZWxkczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGRhdGFiYXNlQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIHNjaGVtYUNhY2hlOiBhbnkpIHtcbiAgICB0aGlzLl9kYkFkYXB0ZXIgPSBkYXRhYmFzZUFkYXB0ZXI7XG4gICAgdGhpcy5fY2FjaGUgPSBzY2hlbWFDYWNoZTtcbiAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgIHRoaXMucHJvdGVjdGVkRmllbGRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5wcm90ZWN0ZWRGaWVsZHM7XG4gIH1cblxuICByZWxvYWREYXRhKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAodGhpcy5yZWxvYWREYXRhUHJvbWlzZSAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5yZWxvYWREYXRhUHJvbWlzZSA9IHRoaXMuZ2V0QWxsQ2xhc3NlcyhvcHRpb25zKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKGFsbFNjaGVtYXMsIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICB9XG5cbiAgZ2V0QWxsQ2xhc3NlcyhcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jYWNoZS5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGlmIChhbGxDbGFzc2VzICYmIGFsbENsYXNzZXMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoYWxsQ2xhc3Nlcyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gICAgfSk7XG4gIH1cblxuICBzZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4gYWxsU2NoZW1hcy5tYXAoaW5qZWN0RGVmYXVsdFNjaGVtYSkpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICB0aGlzLl9jYWNoZVxuICAgICAgICAgIC5zZXRBbGxDbGFzc2VzKGFsbFNjaGVtYXMpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzYXZpbmcgc2NoZW1hIHRvIGNhY2hlOicsIGVycm9yKVxuICAgICAgICAgICk7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICByZXR1cm4gYWxsU2NoZW1hcztcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0T25lU2NoZW1hKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFsbG93Vm9sYXRpbGVDbGFzc2VzOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWE+IHtcbiAgICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHByb21pc2UgPSB0aGlzLl9jYWNoZS5jbGVhcigpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChhbGxvd1ZvbGF0aWxlQ2xhc3NlcyAmJiB2b2xhdGlsZUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHtcbiAgICAgICAgY29uc3QgZGF0YSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGRzOiBkYXRhLmZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIGluZGV4ZXM6IGRhdGEuaW5kZXhlcyxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5fY2FjaGUuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkudGhlbihjYWNoZWQgPT4ge1xuICAgICAgICBpZiAoY2FjaGVkICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgICAgY29uc3Qgb25lU2NoZW1hID0gYWxsU2NoZW1hcy5maW5kKFxuICAgICAgICAgICAgc2NoZW1hID0+IHNjaGVtYS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKCFvbmVTY2hlbWEpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh1bmRlZmluZWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gb25lU2NoZW1hO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbmV3IGNsYXNzIHRoYXQgaW5jbHVkZXMgdGhlIHRocmVlIGRlZmF1bHQgZmllbGRzLlxuICAvLyBBQ0wgaXMgYW4gaW1wbGljaXQgY29sdW1uIHRoYXQgZG9lcyBub3QgZ2V0IGFuIGVudHJ5IGluIHRoZVxuICAvLyBfU0NIRU1BUyBkYXRhYmFzZS4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZVxuICAvLyBjcmVhdGVkIHNjaGVtYSwgaW4gbW9uZ28gZm9ybWF0LlxuICAvLyBvbiBzdWNjZXNzLCBhbmQgcmVqZWN0cyB3aXRoIGFuIGVycm9yIG9uIGZhaWwuIEVuc3VyZSB5b3VcbiAgLy8gaGF2ZSBhdXRob3JpemF0aW9uIChtYXN0ZXIga2V5LCBvciBjbGllbnQgY2xhc3MgY3JlYXRpb25cbiAgLy8gZW5hYmxlZCkgYmVmb3JlIGNhbGxpbmcgdGhpcyBmdW5jdGlvbi5cbiAgYWRkQ2xhc3NJZk5vdEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSA9IHt9XG4gICk6IFByb21pc2U8dm9pZCB8IFNjaGVtYT4ge1xuICAgIHZhciB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlTmV3Q2xhc3MoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBmaWVsZHMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnNcbiAgICApO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAodmFsaWRhdGlvbkVycm9yLmNvZGUgJiYgdmFsaWRhdGlvbkVycm9yLmVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcilcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5jcmVhdGVDbGFzcyhcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHtcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4oY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlQ2xhc3MoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkRmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55LFxuICAgIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXJcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkRmllbGRzW25hbWVdO1xuICAgICAgICAgIGlmIChleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWV4aXN0aW5nRmllbGRzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fd3Blcm07XG4gICAgICAgIGNvbnN0IG5ld1NjaGVtYSA9IGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KFxuICAgICAgICAgIGV4aXN0aW5nRmllbGRzLFxuICAgICAgICAgIHN1Ym1pdHRlZEZpZWxkc1xuICAgICAgICApO1xuICAgICAgICBjb25zdCBkZWZhdWx0RmllbGRzID1cbiAgICAgICAgICBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0O1xuICAgICAgICBjb25zdCBmdWxsTmV3U2NoZW1hID0gT2JqZWN0LmFzc2lnbih7fSwgbmV3U2NoZW1hLCBkZWZhdWx0RmllbGRzKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIG5ld1NjaGVtYSxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdGaWVsZHMpXG4gICAgICAgICk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5IHdlIGhhdmUgY2hlY2tlZCB0byBtYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgdmFsaWQgYW5kIHdlIGNhbiBzdGFydCBkZWxldGluZyBmaWVsZHMuXG4gICAgICAgIC8vIERvIGFsbCBkZWxldGlvbnMgZmlyc3QsIHRoZW4gYSBzaW5nbGUgc2F2ZSB0byBfU0NIRU1BIGNvbGxlY3Rpb24gdG8gaGFuZGxlIGFsbCBhZGRpdGlvbnMuXG4gICAgICAgIGNvbnN0IGRlbGV0ZWRGaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IGluc2VydGVkRmllbGRzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgZGVsZXRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBkZWxldGVQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkZWxldGVkRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBkZWxldGVQcm9taXNlID0gdGhpcy5kZWxldGVGaWVsZHMoZGVsZXRlZEZpZWxkcywgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGVuZm9yY2VGaWVsZHMgPSBbXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBkZWxldGVQcm9taXNlIC8vIERlbGV0ZSBFdmVyeXRoaW5nXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKSAvLyBSZWxvYWQgb3VyIFNjaGVtYSwgc28gd2UgaGF2ZSBhbGwgdGhlIG5ldyB2YWx1ZXNcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBpbnNlcnRlZEZpZWxkcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlID0gc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgIGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICAgIG5ld1NjaGVtYVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgIHRoaXMuX2RiQWRhcHRlci5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBmdWxsTmV3U2NoZW1hXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgICAgICAvL1RPRE86IE1vdmUgdGhpcyBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuICAgICAgICAgICAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgICAgICAgY29uc3QgcmVsb2FkZWRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHJlbG9hZGVkU2NoZW1hLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gcmVsb2FkZWRTY2hlbWE7XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3Qgb3IgZmFpbHMgd2l0aCBhIHJlYXNvbi5cbiAgZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cbiAgICAvLyBXZSBkb24ndCBoYXZlIHRoaXMgY2xhc3MuIFVwZGF0ZSB0aGUgc2NoZW1hXG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuYWRkQ2xhc3NJZk5vdEV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIHN1Y2NlZWRlZC4gUmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodFxuICAgICAgICAgIC8vIGhhdmUgZmFpbGVkIGJlY2F1c2UgdGhlcmUncyBhIHJhY2UgY29uZGl0aW9uIGFuZCBhIGRpZmZlcmVudFxuICAgICAgICAgIC8vIGNsaWVudCBpcyBtYWtpbmcgdGhlIGV4YWN0IHNhbWUgc2NoZW1hIHVwZGF0ZSB0aGF0IHdlIHdhbnQuXG4gICAgICAgICAgLy8gU28ganVzdCByZWxvYWQgdGhlIHNjaGVtYS5cbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBzY2hlbWEgbm93IHZhbGlkYXRlc1xuICAgICAgICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRmFpbGVkIHRvIGFkZCAke2NsYXNzTmFtZX1gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHN0aWxsIGRvZXNuJ3QgdmFsaWRhdGUuIEdpdmUgdXBcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnc2NoZW1hIGNsYXNzIG5hbWUgZG9lcyBub3QgcmV2YWxpZGF0ZSdcbiAgICAgICAgICApO1xuICAgICAgICB9KVxuICAgICk7XG4gIH1cblxuICB2YWxpZGF0ZU5ld0NsYXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnlcbiAgKTogYW55IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmBcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgIGVycm9yOiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgZmllbGRzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgW11cbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgIGV4aXN0aW5nRmllbGROYW1lczogQXJyYXk8c3RyaW5nPlxuICApIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICAgIGlmIChleGlzdGluZ0ZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgZXJyb3I6ICdpbnZhbGlkIGZpZWxkIG5hbWU6ICcgKyBmaWVsZE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogMTM2LFxuICAgICAgICAgICAgZXJyb3I6ICdmaWVsZCAnICsgZmllbGROYW1lICsgJyBjYW5ub3QgYmUgYWRkZWQnLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmllbGRUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGNvbnN0IGVycm9yID0gZmllbGRUeXBlSXNJbnZhbGlkKGZpZWxkVHlwZSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgaWYgKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZShmaWVsZFR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgIHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAnZGVmYXVsdCB2YWx1ZScgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGVcbiAgICAgICAgICAgICAgKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShmaWVsZFR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlXG4gICAgICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZS5yZXF1aXJlZCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZmllbGRUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdyZXF1aXJlZCcgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGVcbiAgICAgICAgICAgICAgKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdKSB7XG4gICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXTtcbiAgICB9XG5cbiAgICBjb25zdCBnZW9Qb2ludHMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLmZpbHRlcihcbiAgICAgIGtleSA9PiBmaWVsZHNba2V5XSAmJiBmaWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgICBpZiAoZ2VvUG9pbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBlcnJvcjpcbiAgICAgICAgICAnY3VycmVudGx5LCBvbmx5IG9uZSBHZW9Qb2ludCBmaWVsZCBtYXkgZXhpc3QgaW4gYW4gb2JqZWN0LiBBZGRpbmcgJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzFdICtcbiAgICAgICAgICAnIHdoZW4gJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzBdICtcbiAgICAgICAgICAnIGFscmVhZHkgZXhpc3RzLicsXG4gICAgICB9O1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkcyk7XG4gIH1cblxuICAvLyBTZXRzIHRoZSBDbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBmb3IgYSBnaXZlbiBjbGFzc05hbWUsIHdoaWNoIG11c3QgZXhpc3QuXG4gIHNldFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBwZXJtczogYW55LCBuZXdTY2hlbWE6IFNjaGVtYUZpZWxkcykge1xuICAgIGlmICh0eXBlb2YgcGVybXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKHBlcm1zLCBuZXdTY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXIuc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgcGVybXMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IGlmIHRoZSBwcm92aWRlZCBjbGFzc05hbWUtZmllbGROYW1lLXR5cGUgdHVwbGUgaXMgdmFsaWQuXG4gIC8vIFRoZSBjbGFzc05hbWUgbXVzdCBhbHJlYWR5IGJlIHZhbGlkYXRlZC5cbiAgLy8gSWYgJ2ZyZWV6ZScgaXMgdHJ1ZSwgcmVmdXNlIHRvIHVwZGF0ZSB0aGUgc2NoZW1hIGZvciB0aGlzIGZpZWxkLlxuICBlbmZvcmNlRmllbGRFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nIHwgU2NoZW1hRmllbGRcbiAgKSB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICAvLyBzdWJkb2N1bWVudCBrZXkgKHgueSkgPT4gb2sgaWYgeCBpcyBvZiB0eXBlICdvYmplY3QnXG4gICAgICBmaWVsZE5hbWUgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICAgIHR5cGUgPSAnT2JqZWN0JztcbiAgICB9XG4gICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gSWYgc29tZW9uZSB0cmllcyB0byBjcmVhdGUgYSBuZXcgZmllbGQgd2l0aCBudWxsL3VuZGVmaW5lZCBhcyB0aGUgdmFsdWUsIHJldHVybjtcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHR5cGUgPSAoeyB0eXBlIH06IFNjaGVtYUZpZWxkKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKHR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSh0eXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIHR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXhwZWN0ZWRUeXBlKSB7XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX07IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgZXhwZWN0ZWRUeXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyh0eXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUpIHtcbiAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCB3ZSB0aHJvdyBlcnJvcnMgd2hlbiBpdCBpcyBhcHByb3ByaWF0ZSB0byBkbyBzby5cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0IGhhdmUgYmVlbiBhIHJhY2VcbiAgICAgICAgLy8gY29uZGl0aW9uIHdoZXJlIGFub3RoZXIgY2xpZW50IHVwZGF0ZWQgdGhlIHNjaGVtYSBpbiB0aGUgc2FtZVxuICAgICAgICAvLyB3YXkgdGhhdCB3ZSB3YW50ZWQgdG8uIFNvLCBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICB0eXBlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cblxuICBlbnN1cmVGaWVsZHMoZmllbGRzOiBhbnkpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9ID0gZmllbGRzW2ldO1xuICAgICAgbGV0IHsgdHlwZSB9ID0gZmllbGRzW2ldO1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0eXBlID0geyB0eXBlOiB0eXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWV4cGVjdGVkVHlwZSB8fCAhZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBtYWludGFpbiBjb21wYXRpYmlsaXR5XG4gIGRlbGV0ZUZpZWxkKFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXJcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhcbiAgICBmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXJcbiAgKSB7XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cblxuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgYGludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy9Eb24ndCBhbGxvdyBkZWxldGluZyB0aGUgZGVmYXVsdCBmaWVsZHMuXG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgYGZpZWxkICR7ZmllbGROYW1lfSBjYW5ub3QgYmUgY2hhbmdlZGApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgZmFsc2UsIHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICBgRmllbGQgJHtmaWVsZE5hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSB7IC4uLnNjaGVtYS5maWVsZHMgfTtcbiAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXJcbiAgICAgICAgICAuZGVsZXRlRmllbGRzKGNsYXNzTmFtZSwgc2NoZW1hLCBmaWVsZE5hbWVzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICAgICAgICAvL0ZvciByZWxhdGlvbnMsIGRyb3AgdGhlIF9Kb2luIHRhYmxlXG4gICAgICAgICAgICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVDbGFzcyhcbiAgICAgICAgICAgICAgICAgICAgYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2NhY2hlLmNsZWFyKCkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9iamVjdCBwcm92aWRlZCBpbiBSRVNUIGZvcm1hdC5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYSBpZiB0aGlzIG9iamVjdCBpc1xuICAvLyB2YWxpZC5cbiAgYXN5bmMgdmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmIChleHBlY3RlZCA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICAvLyBNYWtlIHN1cmUgYWxsIGZpZWxkIHZhbGlkYXRpb24gb3BlcmF0aW9ucyBydW4gYmVmb3JlIHdlIHJldHVybi5cbiAgICAgICAgLy8gSWYgbm90IC0gd2UgYXJlIGNvbnRpbnVpbmcgdG8gcnVuIGxvZ2ljLCBidXQgYWxyZWFkeSBwcm92aWRlZCByZXNwb25zZSBmcm9tIHRoZSBzZXJ2ZXIuXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4cGVjdGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgLy8gRXZlcnkgb2JqZWN0IGhhcyBBQ0wgaW1wbGljaXRseS5cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBwcm9taXNlcy5wdXNoKHNjaGVtYS5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIGV4cGVjdGVkKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgY29uc3QgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG5cbiAgICBpZiAoZW5mb3JjZUZpZWxkcy5sZW5ndGggIT09IDApIHtcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfVxuICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuXG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzY2hlbWEpO1xuICAgIHJldHVybiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMocHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyB0aGF0IGFsbCB0aGUgcHJvcGVydGllcyBhcmUgc2V0IGZvciB0aGUgb2JqZWN0XG4gIHZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXF1aXJlZENvbHVtbnNbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNvbHVtbnMgfHwgY29sdW1ucy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaXNzaW5nQ29sdW1ucyA9IGNvbHVtbnMuZmlsdGVyKGZ1bmN0aW9uKGNvbHVtbikge1xuICAgICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmIChvYmplY3RbY29sdW1uXSAmJiB0eXBlb2Ygb2JqZWN0W2NvbHVtbl0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gVHJ5aW5nIHRvIGRlbGV0ZSBhIHJlcXVpcmVkIGNvbHVtblxuICAgICAgICAgIHJldHVybiBvYmplY3RbY29sdW1uXS5fX29wID09ICdEZWxldGUnO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdCB0cnlpbmcgdG8gZG8gYW55dGhpbmcgdGhlcmVcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFvYmplY3RbY29sdW1uXTtcbiAgICB9KTtcblxuICAgIGlmIChtaXNzaW5nQ29sdW1ucy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBtaXNzaW5nQ29sdW1uc1swXSArICcgaXMgcmVxdWlyZWQuJ1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgfVxuXG4gIHRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmdcbiAgKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFRlc3RzIHRoYXQgdGhlIGNsYXNzIGxldmVsIHBlcm1pc3Npb24gbGV0IHBhc3MgdGhlIG9wZXJhdGlvbiBmb3IgYSBnaXZlbiBhY2xHcm91cFxuICBzdGF0aWMgdGVzdFBlcm1pc3Npb25zKFxuICAgIGNsYXNzUGVybWlzc2lvbnM6ID9hbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nXG4gICk6IGJvb2xlYW4ge1xuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgaWYgKHBlcm1zWycqJ10pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBwZXJtaXNzaW9ucyBhZ2FpbnN0IHRoZSBhY2xHcm91cCBwcm92aWRlZCAoYXJyYXkgb2YgdXNlcklkL3JvbGVzKVxuICAgIGlmIChcbiAgICAgIGFjbEdyb3VwLnNvbWUoYWNsID0+IHtcbiAgICAgICAgcmV0dXJuIHBlcm1zW2FjbF0gPT09IHRydWU7XG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHN0YXRpYyB2YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgY2xhc3NQZXJtaXNzaW9uczogP2FueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9ucywgYWNsR3JvdXAsIG9wZXJhdGlvbilcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIC8vIElmIG9ubHkgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnNcbiAgICAvLyBtYWtlIHN1cmUgd2UgaGF2ZSBhbiBhY2xHcm91cFxuICAgIGlmIChwZXJtc1sncmVxdWlyZXNBdXRoZW50aWNhdGlvbiddKSB7XG4gICAgICAvLyBJZiBhY2xHcm91cCBoYXMgKiAocHVibGljKVxuICAgICAgaWYgKCFhY2xHcm91cCB8fCBhY2xHcm91cC5sZW5ndGggPT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGFjbEdyb3VwLmluZGV4T2YoJyonKSA+IC0xICYmIGFjbEdyb3VwLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIHJlcXVpcmVzQXV0aGVudGljYXRpb24gcGFzc2VkLCBqdXN0IG1vdmUgZm9yd2FyZFxuICAgICAgLy8gcHJvYmFibHkgd291bGQgYmUgd2lzZSBhdCBzb21lIHBvaW50IHRvIHJlbmFtZSB0byAnYXV0aGVudGljYXRlZFVzZXInXG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgLy8gTm8gbWF0Y2hpbmcgQ0xQLCBsZXQncyBjaGVjayB0aGUgUG9pbnRlciBwZXJtaXNzaW9uc1xuICAgIC8vIEFuZCBoYW5kbGUgdGhvc2UgbGF0ZXJcbiAgICBjb25zdCBwZXJtaXNzaW9uRmllbGQgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xXG4gICAgICAgID8gJ3JlYWRVc2VyRmllbGRzJ1xuICAgICAgICA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgLy8gUmVqZWN0IGNyZWF0ZSB3aGVuIHdyaXRlIGxvY2tkb3duXG4gICAgaWYgKHBlcm1pc3Npb25GaWVsZCA9PSAnd3JpdGVVc2VyRmllbGRzJyAmJiBvcGVyYXRpb24gPT0gJ2NyZWF0ZScpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgdGhlIHJlYWRVc2VyRmllbGRzIGxhdGVyXG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0pICYmXG4gICAgICBjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0ubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICBnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSAmJlxuICAgICAgdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uY2xhc3NMZXZlbFBlcm1pc3Npb25zXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgdGhlIGV4cGVjdGVkIHR5cGUgZm9yIGEgY2xhc3NOYW1lK2tleSBjb21iaW5hdGlvblxuICAvLyBvciB1bmRlZmluZWQgaWYgdGhlIHNjaGVtYSBpcyBub3Qgc2V0XG4gIGdldEV4cGVjdGVkVHlwZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZ1xuICApOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBleHBlY3RlZFR5cGUgPT09ICdtYXAnID8gJ09iamVjdCcgOiBleHBlY3RlZFR5cGU7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICAvLyBDaGVja3MgaWYgYSBnaXZlbiBjbGFzcyBpcyBpbiB0aGUgc2NoZW1hLlxuICBoYXNDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSgpLnRoZW4oKCkgPT4gISF0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSk7XG4gIH1cbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbmV3IFNjaGVtYS5cbmNvbnN0IGxvYWQgPSAoXG4gIGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsXG4gIHNjaGVtYUNhY2hlOiBhbnksXG4gIG9wdGlvbnM6IGFueVxuKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiA9PiB7XG4gIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWFDb250cm9sbGVyKGRiQWRhcHRlciwgc2NoZW1hQ2FjaGUpO1xuICByZXR1cm4gc2NoZW1hLnJlbG9hZERhdGEob3B0aW9ucykudGhlbigoKSA9PiBzY2hlbWEpO1xufTtcblxuLy8gQnVpbGRzIGEgbmV3IHNjaGVtYSAoaW4gc2NoZW1hIEFQSSByZXNwb25zZSBmb3JtYXQpIG91dCBvZiBhblxuLy8gZXhpc3RpbmcgbW9uZ28gc2NoZW1hICsgYSBzY2hlbWFzIEFQSSBwdXQgcmVxdWVzdC4gVGhpcyByZXNwb25zZVxuLy8gZG9lcyBub3QgaW5jbHVkZSB0aGUgZGVmYXVsdCBmaWVsZHMsIGFzIGl0IGlzIGludGVuZGVkIHRvIGJlIHBhc3NlZFxuLy8gdG8gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLiBObyB2YWxpZGF0aW9uIGlzIGRvbmUgaGVyZSwgaXRcbi8vIGlzIGRvbmUgaW4gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLlxuZnVuY3Rpb24gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoXG4gIGV4aXN0aW5nRmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gIHB1dFJlcXVlc3Q6IGFueVxuKTogU2NoZW1hRmllbGRzIHtcbiAgY29uc3QgbmV3U2NoZW1hID0ge307XG4gIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICBjb25zdCBzeXNTY2hlbWFGaWVsZCA9XG4gICAgT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnMpLmluZGV4T2YoZXhpc3RpbmdGaWVsZHMuX2lkKSA9PT0gLTFcbiAgICAgID8gW11cbiAgICAgIDogT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnNbZXhpc3RpbmdGaWVsZHMuX2lkXSk7XG4gIGZvciAoY29uc3Qgb2xkRmllbGQgaW4gZXhpc3RpbmdGaWVsZHMpIHtcbiAgICBpZiAoXG4gICAgICBvbGRGaWVsZCAhPT0gJ19pZCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnQUNMJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICd1cGRhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ2NyZWF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnb2JqZWN0SWQnXG4gICAgKSB7XG4gICAgICBpZiAoXG4gICAgICAgIHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiZcbiAgICAgICAgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihvbGRGaWVsZCkgIT09IC0xXG4gICAgICApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWVsZElzRGVsZXRlZCA9XG4gICAgICAgIHB1dFJlcXVlc3Rbb2xkRmllbGRdICYmIHB1dFJlcXVlc3Rbb2xkRmllbGRdLl9fb3AgPT09ICdEZWxldGUnO1xuICAgICAgaWYgKCFmaWVsZElzRGVsZXRlZCkge1xuICAgICAgICBuZXdTY2hlbWFbb2xkRmllbGRdID0gZXhpc3RpbmdGaWVsZHNbb2xkRmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IG5ld0ZpZWxkIGluIHB1dFJlcXVlc3QpIHtcbiAgICBpZiAobmV3RmllbGQgIT09ICdvYmplY3RJZCcgJiYgcHV0UmVxdWVzdFtuZXdGaWVsZF0uX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgIGlmIChcbiAgICAgICAgc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJlxuICAgICAgICBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG5ld0ZpZWxkKSAhPT0gLTFcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIG5ld1NjaGVtYVtuZXdGaWVsZF0gPSBwdXRSZXF1ZXN0W25ld0ZpZWxkXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ld1NjaGVtYTtcbn1cblxuLy8gR2l2ZW4gYSBzY2hlbWEgcHJvbWlzZSwgY29uc3RydWN0IGFub3RoZXIgc2NoZW1hIHByb21pc2UgdGhhdFxuLy8gdmFsaWRhdGVzIHRoaXMgZmllbGQgb25jZSB0aGUgc2NoZW1hIGxvYWRzLlxuZnVuY3Rpb24gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHNjaGVtYVByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSkge1xuICByZXR1cm4gc2NoZW1hUHJvbWlzZS50aGVuKHNjaGVtYSA9PiB7XG4gICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9KTtcbn1cblxuLy8gR2V0cyB0aGUgdHlwZSBmcm9tIGEgUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdCwgd2hlcmUgJ3R5cGUnIGlzXG4vLyBleHRlbmRlZCBwYXN0IGphdmFzY3JpcHQgdHlwZXMgdG8gaW5jbHVkZSB0aGUgcmVzdCBvZiB0aGUgUGFyc2Vcbi8vIHR5cGUgc3lzdGVtLlxuLy8gVGhlIG91dHB1dCBzaG91bGQgYmUgYSB2YWxpZCBzY2hlbWEgdmFsdWUuXG4vLyBUT0RPOiBlbnN1cmUgdGhhdCB0aGlzIGlzIGNvbXBhdGlibGUgd2l0aCB0aGUgZm9ybWF0IHVzZWQgaW4gT3BlbiBEQlxuZnVuY3Rpb24gZ2V0VHlwZShvYmo6IGFueSk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBvYmo7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdCb29sZWFuJztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuICdTdHJpbmcnO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iaik7XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ2JhZCBvYmo6ICcgKyBvYmo7XG4gIH1cbn1cblxuLy8gVGhpcyBnZXRzIHRoZSB0eXBlIGZvciBub24tSlNPTiB0eXBlcyBsaWtlIHBvaW50ZXJzIGFuZCBmaWxlcywgYnV0XG4vLyBhbHNvIGdldHMgdGhlIGFwcHJvcHJpYXRlIHR5cGUgZm9yICQgb3BlcmF0b3JzLlxuLy8gUmV0dXJucyBudWxsIGlmIHRoZSB0eXBlIGlzIHVua25vd24uXG5mdW5jdGlvbiBnZXRPYmplY3RUeXBlKG9iaik6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuICdBcnJheSc7XG4gIH1cbiAgaWYgKG9iai5fX3R5cGUpIHtcbiAgICBzd2l0Y2ggKG9iai5fX3R5cGUpIHtcbiAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICBpZiAob2JqLm5hbWUpIHtcbiAgICAgICAgICByZXR1cm4gJ0ZpbGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgIGlmIChvYmouaXNvKSB7XG4gICAgICAgICAgcmV0dXJuICdEYXRlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgaWYgKG9iai5sYXRpdHVkZSAhPSBudWxsICYmIG9iai5sb25naXR1ZGUgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBpZiAob2JqLmJhc2U2NCkge1xuICAgICAgICAgIHJldHVybiAnQnl0ZXMnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUG9seWdvbic6XG4gICAgICAgIGlmIChvYmouY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICByZXR1cm4gJ1BvbHlnb24nO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICdUaGlzIGlzIG5vdCBhIHZhbGlkICcgKyBvYmouX190eXBlXG4gICAgKTtcbiAgfVxuICBpZiAob2JqWyckbmUnXSkge1xuICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9ialsnJG5lJ10pO1xuICB9XG4gIGlmIChvYmouX19vcCkge1xuICAgIHN3aXRjaCAob2JqLl9fb3ApIHtcbiAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgY2FzZSAnQWRkJzpcbiAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICByZXR1cm4gJ0FycmF5JztcbiAgICAgIGNhc2UgJ0FkZFJlbGF0aW9uJzpcbiAgICAgIGNhc2UgJ1JlbW92ZVJlbGF0aW9uJzpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIHRhcmdldENsYXNzOiBvYmoub2JqZWN0c1swXS5jbGFzc05hbWUsXG4gICAgICAgIH07XG4gICAgICBjYXNlICdCYXRjaCc6XG4gICAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iai5vcHNbMF0pO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgJ3VuZXhwZWN0ZWQgb3A6ICcgKyBvYmouX19vcDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICdPYmplY3QnO1xufVxuXG5leHBvcnQge1xuICBsb2FkLFxuICBjbGFzc05hbWVJc1ZhbGlkLFxuICBmaWVsZE5hbWVJc1ZhbGlkLFxuICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSxcbiAgYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QsXG4gIHN5c3RlbUNsYXNzZXMsXG4gIGRlZmF1bHRDb2x1bW5zLFxuICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hLFxuICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICBTY2hlbWFDb250cm9sbGVyLFxufTtcbiJdfQ==