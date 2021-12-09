"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VolatileClassesSchemas = exports.SchemaController = void 0;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.classNameIsValid = classNameIsValid;
exports.defaultColumns = exports.default = exports.convertSchemaToAdapterSchema = void 0;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.systemClasses = exports.load = void 0;

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _Config = _interopRequireDefault(require("../Config"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

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
  _Idempotency: {
    reqId: {
      type: 'String'
    },
    expire: {
      type: 'Date'
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
const invalidColumns = ['length'];
const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency', '_ExportProgress']);
exports.systemClasses = systemClasses;
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency', '_ExportProgress']); // Anything that start with role

const roleRegex = /^role:.*/; // Anything that starts with userField (allowed for protected fields only)

const protectedFieldsPointerRegex = /^userField:.*/; // * permission

const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/; // regex for validating entities in protectedFields object

const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]); // clp regex

const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);

function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;

  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  } // userId depends on startup options so it's dynamic


  const valid = matchesSome || key.match(userIdRegExp) !== null;

  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

function validateProtectedFieldsKey(key, userIdRegExp) {
  let matchesSome = false;

  for (const regEx of protectedFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  } // userId regex depends on launch options so it's dynamic


  const valid = matchesSome || key.match(userIdRegExp) !== null;

  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']); // validation before setting class-level permissions on collection

function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }

  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }

    const operation = perms[operationKey]; // proceed with next operationKey
    // throws when root fields are of wrong type

    validateCLPjson(operation, operationKey);

    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      } // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey


      continue;
    } // validate protected fields


    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];

        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        } // if the field is in form of array


        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          } // field should exist on collection


          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      } // proceed with next operationKey


      continue;
    } // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users


    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp); // entity can be either:
      // "pointerFields": string[]

      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];

        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        } // proceed with next entity key


        continue;
      } // or [entity]: boolean


      const permit = operation[entity];

      if (permit !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${permit}' is not a valid value for class level permissions ${operationKey}:${entity}:${permit}`);
      }
    }
  }
}

function validateCLPjson(operation, operationKey) {
  if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
    if (!Array.isArray(operation)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an array`);
    }
  } else {
    if (typeof operation === 'object' && operation !== null) {
      // ok to proceed
      return;
    } else {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an object`);
    }
  }
}

function validatePointerPermission(fieldName, fields, operation) {
  // Uses collection schema to ensure the field is of type:
  // - Pointer<_User> (pointers)
  // - Array
  //
  //    It's not possible to enforce type on Array's items in schema
  //  so we accept any Array field, and later when applying permissions
  //  only items that are pointers to _User are considered.
  if (!(fields[fieldName] && (fields[fieldName].type == 'Pointer' && fields[fieldName].targetClass == '_User' || fields[fieldName].type == 'Array'))) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${fieldName}' is not a valid column for class level pointer permissions ${operation}`);
  }
}

const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;

function classNameIsValid(className) {
  // Valid classes must:
  return (// Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 || // Be a join table OR
    joinClassRegex.test(className) || // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
} // Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key


function fieldNameIsValid(fieldName, className) {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }

  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
} // Checks that it's not trying to clobber one of the default fields of the class.


function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName, className)) {
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

const convertAdapterSchemaToParseSchema = _ref => {
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
    fields: _objectSpread(_objectSpread(_objectSpread({}, defaultColumns._Default), defaultColumns[className] || {}), fields),
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

const _IdempotencySchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Idempotency',
  fields: defaultColumns._Idempotency,
  classLevelPermissions: {}
}));

const VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema, _IdempotencySchema];
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
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = _Config.default.get(Parse.applicationId).protectedFields;

    const customIds = _Config.default.get(Parse.applicationId).allowCustomObjectId;

    const customIdRegEx = /^.{1,}$/u; // 1+ chars

    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;

    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
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

    const cached = _SchemaCache.default.all();

    if (cached && cached.length) {
      return Promise.resolve(cached);
    }

    return this.setAllClasses();
  }

  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      _SchemaCache.default.put(allSchemas);

      return allSchemas;
    });
  }

  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      _SchemaCache.default.clear();
    }

    if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
      const data = this.schemaData[className];
      return Promise.resolve({
        className,
        fields: data.fields,
        classLevelPermissions: data.classLevelPermissions,
        indexes: data.indexes
      });
    }

    const cached = _SchemaCache.default.get(className);

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
  } // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.


  async addClassIfNotExists(className, fields = {}, classLevelPermissions, indexes = {}) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);

    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }

      return Promise.reject(validationError);
    }

    try {
      const adapterSchema = await this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({
        fields,
        classLevelPermissions,
        indexes,
        className
      })); // TODO: Remove by updating schema cache directly

      await this.reloadData({
        clearCache: true
      });
      const parseSchema = convertAdapterSchemaToParseSchema(adapterSchema);
      return parseSchema;
    } catch (error) {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    }
  }

  updateClass(className, submittedFields, classLevelPermissions, indexes, database) {
    return this.getOneSchema(className).then(schema => {
      const existingFields = schema.fields;
      Object.keys(submittedFields).forEach(name => {
        const field = submittedFields[name];

        if (existingFields[name] && existingFields[name].type !== field.type && field.__op !== 'Delete') {
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


    return (// The schema update succeeded. Reload the schema
      this.addClassIfNotExists(className).catch(() => {
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
      })
    );
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
        if (!fieldNameIsValid(fieldName, className)) {
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

    validateCLP(classLevelPermissions, fields, this.userIdRegEx);
  } // Sets the Class-level permissions for a given className, which must exist.


  async setPermissions(className, perms, newSchema) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }

    validateCLP(perms, newSchema, this.userIdRegEx);
    await this._dbAdapter.setClassLevelPermissions(className, perms);

    const cached = _SchemaCache.default.get(className);

    if (cached) {
      cached.classLevelPermissions = perms;
    }
  } // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.


  enforceFieldExists(className, fieldName, type, isValidation) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }

    if (!fieldNameIsValid(fieldName, className)) {
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
      } // If type options do not change
      // we can safely return


      if (isValidation || JSON.stringify(expectedType) === JSON.stringify(type)) {
        return undefined;
      } // Field options are may be changed
      // ensure to have an update to date schema field


      return this._dbAdapter.updateFieldOptions(className, fieldName, type);
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
      if (!fieldNameIsValid(fieldName, className)) {
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
    }).then(() => {
      _SchemaCache.default.clear();
    });
  } // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.


  async validateObject(className, object, query) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];

    for (const fieldName in object) {
      if (object[fieldName] && getType(object[fieldName]) === 'GeoPoint') {
        geocount++;
      }

      if (geocount > 1) {
        return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
      }
    }

    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }

      const expected = getType(object[fieldName]);

      if (!expected) {
        continue;
      }

      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }

      promises.push(schema.enforceFieldExists(className, fieldName, expected, true));
    }

    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);

    if (enforceFields.length !== 0) {
      // TODO: Remove by updating schema cache directly
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


  static validatePermission(classPermissions, className, aclGroup, operation, action) {
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

    const pointerFields = classPermissions[operation].pointerFields;

    if (Array.isArray(pointerFields) && pointerFields.length > 0) {
      // any op except 'addField as part of create' is ok.
      if (operation !== 'addField' || action === 'update') {
        // We can allow adding field on update flow only.
        return Promise.resolve();
      }
    }

    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
  } // Validates an operation passes class-level-permissions set in the schema


  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
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

const load = (dbAdapter, options) => {
  const schema = new SchemaController(dbAdapter);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsImRlZmF1bHRDb2x1bW5zIiwiT2JqZWN0IiwiZnJlZXplIiwiX0RlZmF1bHQiLCJvYmplY3RJZCIsInR5cGUiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJBQ0wiLCJfVXNlciIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJlbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJhdXRoRGF0YSIsIl9JbnN0YWxsYXRpb24iLCJpbnN0YWxsYXRpb25JZCIsImRldmljZVRva2VuIiwiY2hhbm5lbHMiLCJkZXZpY2VUeXBlIiwicHVzaFR5cGUiLCJHQ01TZW5kZXJJZCIsInRpbWVab25lIiwibG9jYWxlSWRlbnRpZmllciIsImJhZGdlIiwiYXBwVmVyc2lvbiIsImFwcE5hbWUiLCJhcHBJZGVudGlmaWVyIiwicGFyc2VWZXJzaW9uIiwiX1JvbGUiLCJuYW1lIiwidXNlcnMiLCJ0YXJnZXRDbGFzcyIsInJvbGVzIiwiX1Nlc3Npb24iLCJ1c2VyIiwic2Vzc2lvblRva2VuIiwiZXhwaXJlc0F0IiwiY3JlYXRlZFdpdGgiLCJfUHJvZHVjdCIsInByb2R1Y3RJZGVudGlmaWVyIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJpY29uIiwib3JkZXIiLCJ0aXRsZSIsInN1YnRpdGxlIiwiX1B1c2hTdGF0dXMiLCJwdXNoVGltZSIsInNvdXJjZSIsInF1ZXJ5IiwicGF5bG9hZCIsImV4cGlyeSIsImV4cGlyYXRpb25faW50ZXJ2YWwiLCJzdGF0dXMiLCJudW1TZW50IiwibnVtRmFpbGVkIiwicHVzaEhhc2giLCJlcnJvck1lc3NhZ2UiLCJzZW50UGVyVHlwZSIsImZhaWxlZFBlclR5cGUiLCJzZW50UGVyVVRDT2Zmc2V0IiwiZmFpbGVkUGVyVVRDT2Zmc2V0IiwiY291bnQiLCJfSm9iU3RhdHVzIiwiam9iTmFtZSIsIm1lc3NhZ2UiLCJwYXJhbXMiLCJmaW5pc2hlZEF0IiwiX0pvYlNjaGVkdWxlIiwiZGVzY3JpcHRpb24iLCJzdGFydEFmdGVyIiwiZGF5c09mV2VlayIsInRpbWVPZkRheSIsImxhc3RSdW4iLCJyZXBlYXRNaW51dGVzIiwiX0hvb2tzIiwiZnVuY3Rpb25OYW1lIiwiY2xhc3NOYW1lIiwidHJpZ2dlck5hbWUiLCJ1cmwiLCJfR2xvYmFsQ29uZmlnIiwibWFzdGVyS2V5T25seSIsIl9HcmFwaFFMQ29uZmlnIiwiY29uZmlnIiwiX0F1ZGllbmNlIiwibGFzdFVzZWQiLCJ0aW1lc1VzZWQiLCJfSWRlbXBvdGVuY3kiLCJyZXFJZCIsImV4cGlyZSIsIl9FeHBvcnRQcm9ncmVzcyIsImlkIiwibWFzdGVyS2V5IiwiYXBwbGljYXRpb25JZCIsInJlcXVpcmVkQ29sdW1ucyIsImludmFsaWRDb2x1bW5zIiwic3lzdGVtQ2xhc3NlcyIsInZvbGF0aWxlQ2xhc3NlcyIsInJvbGVSZWdleCIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCIsInB1YmxpY1JlZ2V4IiwiYXV0aGVudGljYXRlZFJlZ2V4IiwicmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4IiwiY2xwUG9pbnRlclJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUmVnZXgiLCJjbHBGaWVsZHNSZWdleCIsInZhbGlkYXRlUGVybWlzc2lvbktleSIsImtleSIsInVzZXJJZFJlZ0V4cCIsIm1hdGNoZXNTb21lIiwicmVnRXgiLCJtYXRjaCIsInZhbGlkIiwiRXJyb3IiLCJJTlZBTElEX0pTT04iLCJ2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleSIsIkNMUFZhbGlkS2V5cyIsInZhbGlkYXRlQ0xQIiwicGVybXMiLCJmaWVsZHMiLCJvcGVyYXRpb25LZXkiLCJpbmRleE9mIiwib3BlcmF0aW9uIiwidmFsaWRhdGVDTFBqc29uIiwiZmllbGROYW1lIiwidmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbiIsImVudGl0eSIsInByb3RlY3RlZEZpZWxkcyIsIkFycmF5IiwiaXNBcnJheSIsImZpZWxkIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicG9pbnRlckZpZWxkcyIsInBvaW50ZXJGaWVsZCIsInBlcm1pdCIsImpvaW5DbGFzc1JlZ2V4IiwiY2xhc3NBbmRGaWVsZFJlZ2V4IiwiY2xhc3NOYW1lSXNWYWxpZCIsInRlc3QiLCJmaWVsZE5hbWVJc1ZhbGlkIiwiaW5jbHVkZXMiLCJmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MiLCJpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSIsImludmFsaWRKc29uRXJyb3IiLCJ2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMiLCJmaWVsZFR5cGVJc0ludmFsaWQiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJ1bmRlZmluZWQiLCJJTkNPUlJFQ1RfVFlQRSIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJzY2hlbWEiLCJpbmplY3REZWZhdWx0U2NoZW1hIiwiX3JwZXJtIiwiX3dwZXJtIiwiX2hhc2hlZF9wYXNzd29yZCIsImNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSIsImluZGV4ZXMiLCJrZXlzIiwibGVuZ3RoIiwiU2NoZW1hRGF0YSIsImNvbnN0cnVjdG9yIiwiYWxsU2NoZW1hcyIsIl9fZGF0YSIsIl9fcHJvdGVjdGVkRmllbGRzIiwiZm9yRWFjaCIsImRlZmluZVByb3BlcnR5IiwiZ2V0IiwiZGF0YSIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImNsYXNzUHJvdGVjdGVkRmllbGRzIiwidW5xIiwiU2V0IiwiZnJvbSIsImRlZmF1bHRTY2hlbWEiLCJfSG9va3NTY2hlbWEiLCJfR2xvYmFsQ29uZmlnU2NoZW1hIiwiX0dyYXBoUUxDb25maWdTY2hlbWEiLCJfUHVzaFN0YXR1c1NjaGVtYSIsIl9Kb2JTdGF0dXNTY2hlbWEiLCJfSm9iU2NoZWR1bGVTY2hlbWEiLCJfQXVkaWVuY2VTY2hlbWEiLCJfSWRlbXBvdGVuY3lTY2hlbWEiLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwiZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUiLCJkYlR5cGUiLCJvYmplY3RUeXBlIiwidHlwZVRvU3RyaW5nIiwiU2NoZW1hQ29udHJvbGxlciIsImRhdGFiYXNlQWRhcHRlciIsIl9kYkFkYXB0ZXIiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJDb25maWciLCJjdXN0b21JZHMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiY3VzdG9tSWRSZWdFeCIsImF1dG9JZFJlZ0V4IiwidXNlcklkUmVnRXgiLCJ3YXRjaCIsInJlbG9hZERhdGEiLCJjbGVhckNhY2hlIiwib3B0aW9ucyIsInJlbG9hZERhdGFQcm9taXNlIiwiZ2V0QWxsQ2xhc3NlcyIsInRoZW4iLCJlcnIiLCJzZXRBbGxDbGFzc2VzIiwiY2FjaGVkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJtYXAiLCJwdXQiLCJnZXRPbmVTY2hlbWEiLCJhbGxvd1ZvbGF0aWxlQ2xhc3NlcyIsImNsZWFyIiwib25lU2NoZW1hIiwiZmluZCIsInJlamVjdCIsImFkZENsYXNzSWZOb3RFeGlzdHMiLCJ2YWxpZGF0aW9uRXJyb3IiLCJ2YWxpZGF0ZU5ld0NsYXNzIiwiY29kZSIsImVycm9yIiwiYWRhcHRlclNjaGVtYSIsImNyZWF0ZUNsYXNzIiwicGFyc2VTY2hlbWEiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1cGRhdGVDbGFzcyIsInN1Ym1pdHRlZEZpZWxkcyIsImRhdGFiYXNlIiwiZXhpc3RpbmdGaWVsZHMiLCJfX29wIiwibmV3U2NoZW1hIiwiYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QiLCJkZWZhdWx0RmllbGRzIiwiZnVsbE5ld1NjaGVtYSIsImFzc2lnbiIsInZhbGlkYXRlU2NoZW1hRGF0YSIsImRlbGV0ZWRGaWVsZHMiLCJpbnNlcnRlZEZpZWxkcyIsInB1c2giLCJkZWxldGVQcm9taXNlIiwiZGVsZXRlRmllbGRzIiwiZW5mb3JjZUZpZWxkcyIsInByb21pc2VzIiwiZW5mb3JjZUZpZWxkRXhpc3RzIiwicmVzdWx0cyIsImZpbHRlciIsInJlc3VsdCIsInNldFBlcm1pc3Npb25zIiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJlbnN1cmVGaWVsZHMiLCJyZWxvYWRlZFNjaGVtYSIsImNhdGNoIiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiZXhpc3RpbmdGaWVsZE5hbWVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpZWxkVHlwZSIsImRlZmF1bHRWYWx1ZSIsImRlZmF1bHRWYWx1ZVR5cGUiLCJnZXRUeXBlIiwicmVxdWlyZWQiLCJnZW9Qb2ludHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1ZhbGlkYXRpb24iLCJzcGxpdCIsImV4cGVjdGVkVHlwZSIsImdldEV4cGVjdGVkVHlwZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiaSIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0Iiwib2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJvYmoiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFrQkE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7OztBQXRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQUQsQ0FBUCxDQUFzQkQsS0FBcEM7O0FBZUEsTUFBTUUsY0FBMEMsR0FBR0MsTUFBTSxDQUFDQyxNQUFQLENBQWM7QUFDL0Q7QUFDQUMsRUFBQUEsUUFBUSxFQUFFO0FBQ1JDLElBQUFBLFFBQVEsRUFBRTtBQUFFQyxNQUFBQSxJQUFJLEVBQUU7QUFBUixLQURGO0FBRVJDLElBQUFBLFNBQVMsRUFBRTtBQUFFRCxNQUFBQSxJQUFJLEVBQUU7QUFBUixLQUZIO0FBR1JFLElBQUFBLFNBQVMsRUFBRTtBQUFFRixNQUFBQSxJQUFJLEVBQUU7QUFBUixLQUhIO0FBSVJHLElBQUFBLEdBQUcsRUFBRTtBQUFFSCxNQUFBQSxJQUFJLEVBQUU7QUFBUjtBQUpHLEdBRnFEO0FBUS9EO0FBQ0FJLEVBQUFBLEtBQUssRUFBRTtBQUNMQyxJQUFBQSxRQUFRLEVBQUU7QUFBRUwsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FETDtBQUVMTSxJQUFBQSxRQUFRLEVBQUU7QUFBRU4sTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FGTDtBQUdMTyxJQUFBQSxLQUFLLEVBQUU7QUFBRVAsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FIRjtBQUlMUSxJQUFBQSxhQUFhLEVBQUU7QUFBRVIsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FKVjtBQUtMUyxJQUFBQSxRQUFRLEVBQUU7QUFBRVQsTUFBQUEsSUFBSSxFQUFFO0FBQVI7QUFM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Q0FBQ08sV0FBUixFQUFxQjtBQUNuQixpQkFBTyxTQUFQO0FBQ0Q7O0FBQ0Q7QUF6Q0o7O0FBMkNBLFVBQU0sSUFBSW5VLEtBQUssQ0FBQ29ILEtBQVYsQ0FBZ0JwSCxLQUFLLENBQUNvSCxLQUFOLENBQVlxQyxjQUE1QixFQUE0Qyx5QkFBeUJtSyxHQUFHLENBQUNFLE1BQXpFLENBQU47QUFDRDs7QUFDRCxNQUFJRixHQUFHLENBQUMsS0FBRCxDQUFQLEVBQWdCO0FBQ2QsV0FBT0MsYUFBYSxDQUFDRCxHQUFHLENBQUMsS0FBRCxDQUFKLENBQXBCO0FBQ0Q7O0FBQ0QsTUFBSUEsR0FBRyxDQUFDL0UsSUFBUixFQUFjO0FBQ1osWUFBUStFLEdBQUcsQ0FBQy9FLElBQVo7QUFDRSxXQUFLLFdBQUw7QUFDRSxlQUFPLFFBQVA7O0FBQ0YsV0FBSyxRQUFMO0FBQ0UsZUFBTyxJQUFQOztBQUNGLFdBQUssS0FBTDtBQUNBLFdBQUssV0FBTDtBQUNBLFdBQUssUUFBTDtBQUNFLGVBQU8sT0FBUDs7QUFDRixXQUFLLGFBQUw7QUFDQSxXQUFLLGdCQUFMO0FBQ0UsZUFBTztBQUNMdE8sVUFBQUEsSUFBSSxFQUFFLFVBREQ7QUFFTDJCLFVBQUFBLFdBQVcsRUFBRTBSLEdBQUcsQ0FBQ1EsT0FBSixDQUFZLENBQVosRUFBZXBQO0FBRnZCLFNBQVA7O0FBSUYsV0FBSyxPQUFMO0FBQ0UsZUFBTzZPLGFBQWEsQ0FBQ0QsR0FBRyxDQUFDUyxHQUFKLENBQVEsQ0FBUixDQUFELENBQXBCOztBQUNGO0FBQ0UsY0FBTSxvQkFBb0JULEdBQUcsQ0FBQy9FLElBQTlCO0FBbEJKO0FBb0JEOztBQUNELFNBQU8sUUFBUDtBQUNEIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIFRoaXMgY2xhc3MgaGFuZGxlcyBzY2hlbWEgdmFsaWRhdGlvbiwgcGVyc2lzdGVuY2UsIGFuZCBtb2RpZmljYXRpb24uXG4vL1xuLy8gRWFjaCBpbmRpdmlkdWFsIFNjaGVtYSBvYmplY3Qgc2hvdWxkIGJlIGltbXV0YWJsZS4gVGhlIGhlbHBlcnMgdG9cbi8vIGRvIHRoaW5ncyB3aXRoIHRoZSBTY2hlbWEganVzdCByZXR1cm4gYSBuZXcgc2NoZW1hIHdoZW4gdGhlIHNjaGVtYVxuLy8gaXMgY2hhbmdlZC5cbi8vXG4vLyBUaGUgY2Fub25pY2FsIHBsYWNlIHRvIHN0b3JlIHRoaXMgU2NoZW1hIGlzIGluIHRoZSBkYXRhYmFzZSBpdHNlbGYsXG4vLyBpbiBhIF9TQ0hFTUEgY29sbGVjdGlvbi4gVGhpcyBpcyBub3QgdGhlIHJpZ2h0IHdheSB0byBkbyBpdCBmb3IgYW5cbi8vIG9wZW4gc291cmNlIGZyYW1ld29yaywgYnV0IGl0J3MgYmFja3dhcmQgY29tcGF0aWJsZSwgc28gd2UncmVcbi8vIGtlZXBpbmcgaXQgdGhpcyB3YXkgZm9yIG5vdy5cbi8vXG4vLyBJbiBBUEktaGFuZGxpbmcgY29kZSwgeW91IHNob3VsZCBvbmx5IHVzZSB0aGUgU2NoZW1hIGNsYXNzIHZpYSB0aGVcbi8vIERhdGFiYXNlQ29udHJvbGxlci4gVGhpcyB3aWxsIGxldCB1cyByZXBsYWNlIHRoZSBzY2hlbWEgbG9naWMgZm9yXG4vLyBkaWZmZXJlbnQgZGF0YWJhc2VzLlxuLy8gVE9ETzogaGlkZSBhbGwgc2NoZW1hIGxvZ2ljIGluc2lkZSB0aGUgZGF0YWJhc2UgYWRhcHRlci5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHR5cGUge1xuICBTY2hlbWEsXG4gIFNjaGVtYUZpZWxkcyxcbiAgQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBTY2hlbWFGaWVsZCxcbiAgTG9hZFNjaGVtYU9wdGlvbnMsXG59IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCBkZWZhdWx0Q29sdW1uczogeyBbc3RyaW5nXTogU2NoZW1hRmllbGRzIH0gPSBPYmplY3QuZnJlZXplKHtcbiAgLy8gQ29udGFpbiB0aGUgZGVmYXVsdCBjb2x1bW5zIGZvciBldmVyeSBwYXJzZSBvYmplY3QgdHlwZSAoZXhjZXB0IF9Kb2luIGNvbGxlY3Rpb24pXG4gIF9EZWZhdWx0OiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjcmVhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdXBkYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIEFDTDogeyB0eXBlOiAnQUNMJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfVXNlciBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1VzZXI6IHtcbiAgICB1c2VybmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhc3N3b3JkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbFZlcmlmaWVkOiB7IHR5cGU6ICdCb29sZWFuJyB9LFxuICAgIGF1dGhEYXRhOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9JbnN0YWxsYXRpb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9JbnN0YWxsYXRpb246IHtcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRldmljZVRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2hhbm5lbHM6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIGRldmljZVR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwdXNoVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIEdDTVNlbmRlcklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdGltZVpvbmU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsb2NhbGVJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYmFkZ2U6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBhcHBWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJzZVZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1JvbGUgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Sb2xlOiB7XG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVzZXJzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgcm9sZXM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfUm9sZScgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1Nlc3Npb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9TZXNzaW9uOiB7XG4gICAgdXNlcjogeyB0eXBlOiAnUG9pbnRlcicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzZXNzaW9uVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmVzQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgY3JlYXRlZFdpdGg6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX1Byb2R1Y3Q6IHtcbiAgICBwcm9kdWN0SWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRvd25sb2FkOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIGRvd25sb2FkTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGljb246IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgb3JkZXI6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN1YnRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9QdXNoU3RhdHVzOiB7XG4gICAgcHVzaFRpbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gcmVzdCBvciB3ZWJ1aVxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHF1ZXJ5XG4gICAgcGF5bG9hZDogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBwYXlsb2FkLFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJ5OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgZXhwaXJhdGlvbl9pbnRlcnZhbDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG51bVNlbnQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBudW1GYWlsZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBwdXNoSGFzaDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVycm9yTWVzc2FnZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBjb3VudDogeyB0eXBlOiAnTnVtYmVyJyB9LCAvLyB0cmFja3MgIyBvZiBiYXRjaGVzIHF1ZXVlZCBhbmQgcGVuZGluZ1xuICB9LFxuICBfSm9iU3RhdHVzOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1lc3NhZ2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSwgLy8gcGFyYW1zIHJlY2VpdmVkIHdoZW4gY2FsbGluZyB0aGUgam9iXG4gICAgZmluaXNoZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbiAgX0pvYlNjaGVkdWxlOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhcnRBZnRlcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRheXNPZldlZWs6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIHRpbWVPZkRheTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxhc3RSdW46IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICByZXBlYXRNaW51dGVzOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9Ib29rczoge1xuICAgIGZ1bmN0aW9uTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNsYXNzTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRyaWdnZXJOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXJsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9HbG9iYWxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIG1hc3RlcktleU9ubHk6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0dyYXBoUUxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNvbmZpZzogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfQXVkaWVuY2U6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvL3N0b3JpbmcgcXVlcnkgYXMgSlNPTiBzdHJpbmcgdG8gcHJldmVudCBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCIgZXJyb3JcbiAgICBsYXN0VXNlZDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB0aW1lc1VzZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0lkZW1wb3RlbmN5OiB7XG4gICAgcmVxSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmU6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG4gIF9FeHBvcnRQcm9ncmVzczoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBtYXN0ZXJLZXk6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBsaWNhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG59KTtcblxuY29uc3QgcmVxdWlyZWRDb2x1bW5zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIF9Qcm9kdWN0OiBbJ3Byb2R1Y3RJZGVudGlmaWVyJywgJ2ljb24nLCAnb3JkZXInLCAndGl0bGUnLCAnc3VidGl0bGUnXSxcbiAgX1JvbGU6IFsnbmFtZScsICdBQ0wnXSxcbn0pO1xuXG5jb25zdCBpbnZhbGlkQ29sdW1ucyA9IFsnbGVuZ3RoJ107XG5cbmNvbnN0IHN5c3RlbUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Vc2VyJyxcbiAgJ19JbnN0YWxsYXRpb24nLFxuICAnX1JvbGUnLFxuICAnX1Nlc3Npb24nLFxuICAnX1Byb2R1Y3QnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0pvYlN0YXR1cycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG4gICdfRXhwb3J0UHJvZ3Jlc3MnLFxuXSk7XG5cbmNvbnN0IHZvbGF0aWxlQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX0pvYlN0YXR1cycsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSG9va3MnLFxuICAnX0dsb2JhbENvbmZpZycsXG4gICdfR3JhcGhRTENvbmZpZycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG4gICdfRXhwb3J0UHJvZ3Jlc3MnLFxuXSk7XG5cbi8vIEFueXRoaW5nIHRoYXQgc3RhcnQgd2l0aCByb2xlXG5jb25zdCByb2xlUmVnZXggPSAvXnJvbGU6LiovO1xuLy8gQW55dGhpbmcgdGhhdCBzdGFydHMgd2l0aCB1c2VyRmllbGQgKGFsbG93ZWQgZm9yIHByb3RlY3RlZCBmaWVsZHMgb25seSlcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCA9IC9edXNlckZpZWxkOi4qLztcbi8vICogcGVybWlzc2lvblxuY29uc3QgcHVibGljUmVnZXggPSAvXlxcKiQvO1xuXG5jb25zdCBhdXRoZW50aWNhdGVkUmVnZXggPSAvXmF1dGhlbnRpY2F0ZWQkLztcblxuY29uc3QgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4ID0gL15yZXF1aXJlc0F1dGhlbnRpY2F0aW9uJC87XG5cbmNvbnN0IGNscFBvaW50ZXJSZWdleCA9IC9ecG9pbnRlckZpZWxkcyQvO1xuXG4vLyByZWdleCBmb3IgdmFsaWRhdGluZyBlbnRpdGllcyBpbiBwcm90ZWN0ZWRGaWVsZHMgb2JqZWN0XG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICBhdXRoZW50aWNhdGVkUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG4vLyBjbHAgcmVnZXhcbmNvbnN0IGNscEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIGNscFBvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUGVybWlzc2lvbktleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBjbHBGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgZGVwZW5kcyBvbiBzdGFydHVwIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIHByb3RlY3RlZEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCByZWdleCBkZXBlbmRzIG9uIGxhdW5jaCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5jb25zdCBDTFBWYWxpZEtleXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ2ZpbmQnLFxuICAnY291bnQnLFxuICAnZ2V0JyxcbiAgJ2NyZWF0ZScsXG4gICd1cGRhdGUnLFxuICAnZGVsZXRlJyxcbiAgJ2FkZEZpZWxkJyxcbiAgJ3JlYWRVc2VyRmllbGRzJyxcbiAgJ3dyaXRlVXNlckZpZWxkcycsXG4gICdwcm90ZWN0ZWRGaWVsZHMnLFxuXSk7XG5cbi8vIHZhbGlkYXRpb24gYmVmb3JlIHNldHRpbmcgY2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgb24gY29sbGVjdGlvblxuZnVuY3Rpb24gdmFsaWRhdGVDTFAocGVybXM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzOiBTY2hlbWFGaWVsZHMsIHVzZXJJZFJlZ0V4cDogUmVnRXhwKSB7XG4gIGlmICghcGVybXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBvcGVyYXRpb25LZXkgaW4gcGVybXMpIHtcbiAgICBpZiAoQ0xQVmFsaWRLZXlzLmluZGV4T2Yob3BlcmF0aW9uS2V5KSA9PSAtMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAke29wZXJhdGlvbktleX0gaXMgbm90IGEgdmFsaWQgb3BlcmF0aW9uIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3BlcmF0aW9uID0gcGVybXNbb3BlcmF0aW9uS2V5XTtcbiAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcblxuICAgIC8vIHRocm93cyB3aGVuIHJvb3QgZmllbGRzIGFyZSBvZiB3cm9uZyB0eXBlXG4gICAgdmFsaWRhdGVDTFBqc29uKG9wZXJhdGlvbiwgb3BlcmF0aW9uS2V5KTtcblxuICAgIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgICAgLy8gdmFsaWRhdGUgZ3JvdXBlZCBwb2ludGVyIHBlcm1pc3Npb25zXG4gICAgICAvLyBtdXN0IGJlIGFuIGFycmF5IHdpdGggZmllbGQgbmFtZXNcbiAgICAgIGZvciAoY29uc3QgZmllbGROYW1lIG9mIG9wZXJhdGlvbikge1xuICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKGZpZWxkTmFtZSwgZmllbGRzLCBvcGVyYXRpb25LZXkpO1xuICAgICAgfVxuICAgICAgLy8gcmVhZFVzZXJGaWVsZHMgYW5kIHdyaXRlclVzZXJGaWVsZHMgZG8gbm90IGhhdmUgbmVzZHRlZCBmaWVsZHNcbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgcHJvdGVjdGVkIGZpZWxkc1xuICAgIGlmIChvcGVyYXRpb25LZXkgPT09ICdwcm90ZWN0ZWRGaWVsZHMnKSB7XG4gICAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgICAgLy8gdGhyb3dzIG9uIHVuZXhwZWN0ZWQga2V5XG4gICAgICAgIHZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtwcm90ZWN0ZWRGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgcHJvdGVjdGVkRmllbGRzWyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBmaWVsZCBpcyBpbiBmb3JtIG9mIGFycmF5XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgLy8gZG8gbm90IGFsbG9vdyB0byBwcm90ZWN0IGRlZmF1bHQgZmllbGRzXG4gICAgICAgICAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBEZWZhdWx0IGZpZWxkICcke2ZpZWxkfScgY2FuIG5vdCBiZSBwcm90ZWN0ZWRgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBmaWVsZCBzaG91bGQgZXhpc3Qgb24gY29sbGVjdGlvblxuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywgZmllbGQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYEZpZWxkICcke2ZpZWxkfScgaW4gcHJvdGVjdGVkRmllbGRzOiR7ZW50aXR5fSBkb2VzIG5vdCBleGlzdGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIG90aGVyIGZpZWxkc1xuICAgIC8vIEVudGl0eSBjYW4gYmU6XG4gICAgLy8gXCIqXCIgLSBQdWJsaWMsXG4gICAgLy8gXCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uXCIgLSBhdXRoZW50aWNhdGVkIHVzZXJzLFxuICAgIC8vIFwib2JqZWN0SWRcIiAtIF9Vc2VyIGlkLFxuICAgIC8vIFwicm9sZTpyb2xlbmFtZVwiLFxuICAgIC8vIFwicG9pbnRlckZpZWxkc1wiIC0gYXJyYXkgb2YgZmllbGQgbmFtZXMgY29udGFpbmluZyBwb2ludGVycyB0byB1c2Vyc1xuICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgLy8gdGhyb3dzIG9uIHVuZXhwZWN0ZWQga2V5XG4gICAgICB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAvLyBlbnRpdHkgY2FuIGJlIGVpdGhlcjpcbiAgICAgIC8vIFwicG9pbnRlckZpZWxkc1wiOiBzdHJpbmdbXVxuICAgICAgaWYgKGVudGl0eSA9PT0gJ3BvaW50ZXJGaWVsZHMnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ZXJGaWVsZHMgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwb2ludGVyRmllbGRzKSkge1xuICAgICAgICAgIGZvciAoY29uc3QgcG9pbnRlckZpZWxkIG9mIHBvaW50ZXJGaWVsZHMpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24ocG9pbnRlckZpZWxkLCBmaWVsZHMsIG9wZXJhdGlvbik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtwb2ludGVyRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yICR7b3BlcmF0aW9uS2V5fVske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgZW50aXR5IGtleVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gb3IgW2VudGl0eV06IGJvb2xlYW5cbiAgICAgIGNvbnN0IHBlcm1pdCA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICBpZiAocGVybWl0ICE9PSB0cnVlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYCcke3Blcm1pdH0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX06JHtlbnRpdHl9OiR7cGVybWl0fWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDTFBqc29uKG9wZXJhdGlvbjogYW55LCBvcGVyYXRpb25LZXk6IHN0cmluZykge1xuICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3BlcmF0aW9uKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAnJHtvcGVyYXRpb259JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9IC0gbXVzdCBiZSBhbiBhcnJheWBcbiAgICAgICk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmICh0eXBlb2Ygb3BlcmF0aW9uID09PSAnb2JqZWN0JyAmJiBvcGVyYXRpb24gIT09IG51bGwpIHtcbiAgICAgIC8vIG9rIHRvIHByb2NlZWRcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAnJHtvcGVyYXRpb259JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9IC0gbXVzdCBiZSBhbiBvYmplY3RgXG4gICAgICApO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZHM6IE9iamVjdCwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgLy8gVXNlcyBjb2xsZWN0aW9uIHNjaGVtYSB0byBlbnN1cmUgdGhlIGZpZWxkIGlzIG9mIHR5cGU6XG4gIC8vIC0gUG9pbnRlcjxfVXNlcj4gKHBvaW50ZXJzKVxuICAvLyAtIEFycmF5XG4gIC8vXG4gIC8vICAgIEl0J3Mgbm90IHBvc3NpYmxlIHRvIGVuZm9yY2UgdHlwZSBvbiBBcnJheSdzIGl0ZW1zIGluIHNjaGVtYVxuICAvLyAgc28gd2UgYWNjZXB0IGFueSBBcnJheSBmaWVsZCwgYW5kIGxhdGVyIHdoZW4gYXBwbHlpbmcgcGVybWlzc2lvbnNcbiAgLy8gIG9ubHkgaXRlbXMgdGhhdCBhcmUgcG9pbnRlcnMgdG8gX1VzZXIgYXJlIGNvbnNpZGVyZWQuXG4gIGlmIChcbiAgICAhKFxuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICgoZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnUG9pbnRlcicgJiYgZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MgPT0gJ19Vc2VyJykgfHxcbiAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnQXJyYXknKVxuICAgIClcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2ZpZWxkTmFtZX0nIGlzIG5vdCBhIHZhbGlkIGNvbHVtbiBmb3IgY2xhc3MgbGV2ZWwgcG9pbnRlciBwZXJtaXNzaW9ucyAke29wZXJhdGlvbn1gXG4gICAgKTtcbiAgfVxufVxuXG5jb25zdCBqb2luQ2xhc3NSZWdleCA9IC9eX0pvaW46W0EtWmEtejAtOV9dKzpbQS1aYS16MC05X10rLztcbmNvbnN0IGNsYXNzQW5kRmllbGRSZWdleCA9IC9eW0EtWmEtel1bQS1aYS16MC05X10qJC87XG5mdW5jdGlvbiBjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIC8vIFZhbGlkIGNsYXNzZXMgbXVzdDpcbiAgcmV0dXJuIChcbiAgICAvLyBCZSBvbmUgb2YgX1VzZXIsIF9JbnN0YWxsYXRpb24sIF9Sb2xlLCBfU2Vzc2lvbiBPUlxuICAgIHN5c3RlbUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEgfHxcbiAgICAvLyBCZSBhIGpvaW4gdGFibGUgT1JcbiAgICBqb2luQ2xhc3NSZWdleC50ZXN0KGNsYXNzTmFtZSkgfHxcbiAgICAvLyBJbmNsdWRlIG9ubHkgYWxwaGEtbnVtZXJpYyBhbmQgdW5kZXJzY29yZXMsIGFuZCBub3Qgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIG9yIG51bWJlclxuICAgIGZpZWxkTmFtZUlzVmFsaWQoY2xhc3NOYW1lLCBjbGFzc05hbWUpXG4gICk7XG59XG5cbi8vIFZhbGlkIGZpZWxkcyBtdXN0IGJlIGFscGhhLW51bWVyaWMsIGFuZCBub3Qgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIG9yIG51bWJlclxuLy8gbXVzdCBub3QgYmUgYSByZXNlcnZlZCBrZXlcbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmIChjbGFzc05hbWUgJiYgY2xhc3NOYW1lICE9PSAnX0hvb2tzJykge1xuICAgIGlmIChmaWVsZE5hbWUgPT09ICdjbGFzc05hbWUnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiBjbGFzc0FuZEZpZWxkUmVnZXgudGVzdChmaWVsZE5hbWUpICYmICFpbnZhbGlkQ29sdW1ucy5pbmNsdWRlcyhmaWVsZE5hbWUpO1xufVxuXG4vLyBDaGVja3MgdGhhdCBpdCdzIG5vdCB0cnlpbmcgdG8gY2xvYmJlciBvbmUgb2YgdGhlIGRlZmF1bHQgZmllbGRzIG9mIHRoZSBjbGFzcy5cbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSAmJiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICAnSW52YWxpZCBjbGFzc25hbWU6ICcgK1xuICAgIGNsYXNzTmFtZSArXG4gICAgJywgY2xhc3NuYW1lcyBjYW4gb25seSBoYXZlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzIGFuZCBfLCBhbmQgbXVzdCBzdGFydCB3aXRoIGFuIGFscGhhIGNoYXJhY3RlciAnXG4gICk7XG59XG5cbmNvbnN0IGludmFsaWRKc29uRXJyb3IgPSBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnaW52YWxpZCBKU09OJyk7XG5jb25zdCB2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMgPSBbXG4gICdOdW1iZXInLFxuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnRGF0ZScsXG4gICdPYmplY3QnLFxuICAnQXJyYXknLFxuICAnR2VvUG9pbnQnLFxuICAnRmlsZScsXG4gICdCeXRlcycsXG4gICdQb2x5Z29uJyxcbl07XG4vLyBSZXR1cm5zIGFuIGVycm9yIHN1aXRhYmxlIGZvciB0aHJvd2luZyBpZiB0aGUgdHlwZSBpcyBpbnZhbGlkXG5jb25zdCBmaWVsZFR5cGVJc0ludmFsaWQgPSAoeyB0eXBlLCB0YXJnZXRDbGFzcyB9KSA9PiB7XG4gIGlmIChbJ1BvaW50ZXInLCAnUmVsYXRpb24nXS5pbmRleE9mKHR5cGUpID49IDApIHtcbiAgICBpZiAoIXRhcmdldENsYXNzKSB7XG4gICAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKDEzNSwgYHR5cGUgJHt0eXBlfSBuZWVkcyBhIGNsYXNzIG5hbWVgKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB0YXJnZXRDbGFzcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBpbnZhbGlkSnNvbkVycm9yO1xuICAgIH0gZWxzZSBpZiAoIWNsYXNzTmFtZUlzVmFsaWQodGFyZ2V0Q2xhc3MpKSB7XG4gICAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UodGFyZ2V0Q2xhc3MpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiB0eXBlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnZhbGlkSnNvbkVycm9yO1xuICB9XG4gIGlmICh2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMuaW5kZXhPZih0eXBlKSA8IDApIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBgaW52YWxpZCBmaWVsZCB0eXBlOiAke3R5cGV9YCk7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEgPSAoc2NoZW1hOiBhbnkpID0+IHtcbiAgc2NoZW1hID0gaW5qZWN0RGVmYXVsdFNjaGVtYShzY2hlbWEpO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5BQ0w7XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknIH07XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknIH07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hID0gKHsgLi4uc2NoZW1hIH0pID0+IHtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG5cbiAgc2NoZW1hLmZpZWxkcy5BQ0wgPSB7IHR5cGU6ICdBQ0wnIH07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5hdXRoRGF0YTsgLy9BdXRoIGRhdGEgaXMgaW1wbGljaXRcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMucGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIH1cblxuICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgIGRlbGV0ZSBzY2hlbWEuaW5kZXhlcztcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jbGFzcyBTY2hlbWFEYXRhIHtcbiAgX19kYXRhOiBhbnk7XG4gIF9fcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIGNvbnN0cnVjdG9yKGFsbFNjaGVtYXMgPSBbXSwgcHJvdGVjdGVkRmllbGRzID0ge30pIHtcbiAgICB0aGlzLl9fZGF0YSA9IHt9O1xuICAgIHRoaXMuX19wcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgYWxsU2NoZW1hcy5mb3JFYWNoKHNjaGVtYSA9PiB7XG4gICAgICBpZiAodm9sYXRpbGVDbGFzc2VzLmluY2x1ZGVzKHNjaGVtYS5jbGFzc05hbWUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBzY2hlbWEuY2xhc3NOYW1lLCB7XG4gICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gaW5qZWN0RGVmYXVsdFNjaGVtYShzY2hlbWEpLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gZGVlcGNvcHkoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcblxuICAgICAgICAgICAgY29uc3QgY2xhc3NQcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLl9fcHJvdGVjdGVkRmllbGRzW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICAgICAgaWYgKGNsYXNzUHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGNsYXNzUHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgICAgICAgICAuLi4oZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gfHwgW10pLFxuICAgICAgICAgICAgICAgICAgLi4uY2xhc3NQcm90ZWN0ZWRGaWVsZHNba2V5XSxcbiAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gSW5qZWN0IHRoZSBpbi1tZW1vcnkgY2xhc3Nlc1xuICAgIHZvbGF0aWxlQ2xhc3Nlcy5mb3JFYWNoKGNsYXNzTmFtZSA9PiB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgY2xhc3NOYW1lLCB7XG4gICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGRzOiB7fSxcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtjbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW2NsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5jb25zdCBpbmplY3REZWZhdWx0U2NoZW1hID0gKHsgY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgaW5kZXhlcyB9OiBTY2hlbWEpID0+IHtcbiAgY29uc3QgZGVmYXVsdFNjaGVtYTogU2NoZW1hID0ge1xuICAgIGNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHtcbiAgICAgIC4uLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgLi4uKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwge30pLFxuICAgICAgLi4uZmllbGRzLFxuICAgIH0sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICB9O1xuICBpZiAoaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhpbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICBkZWZhdWx0U2NoZW1hLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG4gIHJldHVybiBkZWZhdWx0U2NoZW1hO1xufTtcblxuY29uc3QgX0hvb2tzU2NoZW1hID0geyBjbGFzc05hbWU6ICdfSG9va3MnLCBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9Ib29rcyB9O1xuY29uc3QgX0dsb2JhbENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dsb2JhbENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dsb2JhbENvbmZpZyxcbn07XG5jb25zdCBfR3JhcGhRTENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dyYXBoUUxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HcmFwaFFMQ29uZmlnLFxufTtcbmNvbnN0IF9QdXNoU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX1B1c2hTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTY2hlZHVsZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTY2hlZHVsZScsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9BdWRpZW5jZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19BdWRpZW5jZScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fQXVkaWVuY2UsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSWRlbXBvdGVuY3lTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSWRlbXBvdGVuY3knLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyA9IFtcbiAgX0hvb2tzU2NoZW1hLFxuICBfSm9iU3RhdHVzU2NoZW1hLFxuICBfSm9iU2NoZWR1bGVTY2hlbWEsXG4gIF9QdXNoU3RhdHVzU2NoZW1hLFxuICBfR2xvYmFsQ29uZmlnU2NoZW1hLFxuICBfR3JhcGhRTENvbmZpZ1NjaGVtYSxcbiAgX0F1ZGllbmNlU2NoZW1hLFxuICBfSWRlbXBvdGVuY3lTY2hlbWEsXG5dO1xuXG5jb25zdCBkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSA9IChkYlR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nLCBvYmplY3RUeXBlOiBTY2hlbWFGaWVsZCkgPT4ge1xuICBpZiAoZGJUeXBlLnR5cGUgIT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlLnRhcmdldENsYXNzICE9PSBvYmplY3RUeXBlLnRhcmdldENsYXNzKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIGlmIChkYlR5cGUudHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuY29uc3QgdHlwZVRvU3RyaW5nID0gKHR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0eXBlO1xuICB9XG4gIGlmICh0eXBlLnRhcmdldENsYXNzKSB7XG4gICAgcmV0dXJuIGAke3R5cGUudHlwZX08JHt0eXBlLnRhcmdldENsYXNzfT5gO1xuICB9XG4gIHJldHVybiBgJHt0eXBlLnR5cGV9YDtcbn07XG5cbi8vIFN0b3JlcyB0aGUgZW50aXJlIHNjaGVtYSBvZiB0aGUgYXBwIGluIGEgd2VpcmQgaHlicmlkIGZvcm1hdCBzb21ld2hlcmUgYmV0d2VlblxuLy8gdGhlIG1vbmdvIGZvcm1hdCBhbmQgdGhlIFBhcnNlIGZvcm1hdC4gU29vbiwgdGhpcyB3aWxsIGFsbCBiZSBQYXJzZSBmb3JtYXQuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY2hlbWFDb250cm9sbGVyIHtcbiAgX2RiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYURhdGE6IHsgW3N0cmluZ106IFNjaGVtYSB9O1xuICByZWxvYWREYXRhUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIHVzZXJJZFJlZ0V4OiBSZWdFeHA7XG5cbiAgY29uc3RydWN0b3IoZGF0YWJhc2VBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcikge1xuICAgIHRoaXMuX2RiQWRhcHRlciA9IGRhdGFiYXNlQWRhcHRlcjtcbiAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShTY2hlbWFDYWNoZS5hbGwoKSwgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIHRoaXMucHJvdGVjdGVkRmllbGRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5wcm90ZWN0ZWRGaWVsZHM7XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpLmFsbG93Q3VzdG9tT2JqZWN0SWQ7XG5cbiAgICBjb25zdCBjdXN0b21JZFJlZ0V4ID0gL14uezEsfSQvdTsgLy8gMSsgY2hhcnNcbiAgICBjb25zdCBhdXRvSWRSZWdFeCA9IC9eW2EtekEtWjAtOV17MSx9JC87XG5cbiAgICB0aGlzLnVzZXJJZFJlZ0V4ID0gY3VzdG9tSWRzID8gY3VzdG9tSWRSZWdFeCA6IGF1dG9JZFJlZ0V4O1xuXG4gICAgdGhpcy5fZGJBZGFwdGVyLndhdGNoKCgpID0+IHtcbiAgICAgIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfSk7XG4gIH1cblxuICByZWxvYWREYXRhKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAodGhpcy5yZWxvYWREYXRhUHJvbWlzZSAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5yZWxvYWREYXRhUHJvbWlzZSA9IHRoaXMuZ2V0QWxsQ2xhc3NlcyhvcHRpb25zKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKGFsbFNjaGVtYXMsIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICB9XG5cbiAgZ2V0QWxsQ2xhc3NlcyhvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuYWxsKCk7XG4gICAgaWYgKGNhY2hlZCAmJiBjYWNoZWQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgfVxuXG4gIHNldEFsbENsYXNzZXMoKTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiBhbGxTY2hlbWFzLm1hcChpbmplY3REZWZhdWx0U2NoZW1hKSlcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5wdXQoYWxsU2NoZW1hcyk7XG4gICAgICAgIHJldHVybiBhbGxTY2hlbWFzO1xuICAgICAgfSk7XG4gIH1cblxuICBnZXRPbmVTY2hlbWEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWxsb3dWb2xhdGlsZUNsYXNzZXM6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYT4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgfVxuICAgIGlmIChhbGxvd1ZvbGF0aWxlQ2xhc3NlcyAmJiB2b2xhdGlsZUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGZpZWxkczogZGF0YS5maWVsZHMsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIGluZGV4ZXM6IGRhdGEuaW5kZXhlcyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICBjb25zdCBvbmVTY2hlbWEgPSBhbGxTY2hlbWFzLmZpbmQoc2NoZW1hID0+IHNjaGVtYS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSk7XG4gICAgICBpZiAoIW9uZVNjaGVtYSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvbmVTY2hlbWE7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBuZXcgY2xhc3MgdGhhdCBpbmNsdWRlcyB0aGUgdGhyZWUgZGVmYXVsdCBmaWVsZHMuXG4gIC8vIEFDTCBpcyBhbiBpbXBsaWNpdCBjb2x1bW4gdGhhdCBkb2VzIG5vdCBnZXQgYW4gZW50cnkgaW4gdGhlXG4gIC8vIF9TQ0hFTUFTIGRhdGFiYXNlLiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGggdGhlXG4gIC8vIGNyZWF0ZWQgc2NoZW1hLCBpbiBtb25nbyBmb3JtYXQuXG4gIC8vIG9uIHN1Y2Nlc3MsIGFuZCByZWplY3RzIHdpdGggYW4gZXJyb3Igb24gZmFpbC4gRW5zdXJlIHlvdVxuICAvLyBoYXZlIGF1dGhvcml6YXRpb24gKG1hc3RlciBrZXksIG9yIGNsaWVudCBjbGFzcyBjcmVhdGlvblxuICAvLyBlbmFibGVkKSBiZWZvcmUgY2FsbGluZyB0aGlzIGZ1bmN0aW9uLlxuICBhc3luYyBhZGRDbGFzc0lmTm90RXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55ID0ge31cbiAgKTogUHJvbWlzZTx2b2lkIHwgU2NoZW1hPiB7XG4gICAgdmFyIHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICBpZiAodmFsaWRhdGlvbkVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHZhbGlkYXRpb25FcnJvci5jb2RlICYmIHZhbGlkYXRpb25FcnJvci5lcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgYWRhcHRlclNjaGVtYSA9IGF3YWl0IHRoaXMuX2RiQWRhcHRlci5jcmVhdGVDbGFzcyhcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHtcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYShhZGFwdGVyU2NoZW1hKTtcbiAgICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlQ2xhc3MoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkRmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55LFxuICAgIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXJcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkRmllbGRzW25hbWVdO1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdICYmXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXS50eXBlICE9PSBmaWVsZC50eXBlICYmXG4gICAgICAgICAgICBmaWVsZC5fX29wICE9PSAnRGVsZXRlJ1xuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWV4aXN0aW5nRmllbGRzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fd3Blcm07XG4gICAgICAgIGNvbnN0IG5ld1NjaGVtYSA9IGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KGV4aXN0aW5nRmllbGRzLCBzdWJtaXR0ZWRGaWVsZHMpO1xuICAgICAgICBjb25zdCBkZWZhdWx0RmllbGRzID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCBkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdDtcbiAgICAgICAgY29uc3QgZnVsbE5ld1NjaGVtYSA9IE9iamVjdC5hc3NpZ24oe30sIG5ld1NjaGVtYSwgZGVmYXVsdEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBuZXdTY2hlbWEsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIE9iamVjdC5rZXlzKGV4aXN0aW5nRmllbGRzKVxuICAgICAgICApO1xuICAgICAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmluYWxseSB3ZSBoYXZlIGNoZWNrZWQgdG8gbWFrZSBzdXJlIHRoZSByZXF1ZXN0IGlzIHZhbGlkIGFuZCB3ZSBjYW4gc3RhcnQgZGVsZXRpbmcgZmllbGRzLlxuICAgICAgICAvLyBEbyBhbGwgZGVsZXRpb25zIGZpcnN0LCB0aGVuIGEgc2luZ2xlIHNhdmUgdG8gX1NDSEVNQSBjb2xsZWN0aW9uIHRvIGhhbmRsZSBhbGwgYWRkaXRpb25zLlxuICAgICAgICBjb25zdCBkZWxldGVkRmllbGRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBpbnNlcnRlZEZpZWxkcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIGRlbGV0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNlcnRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgZGVsZXRlUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICBpZiAoZGVsZXRlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSA9IHRoaXMuZGVsZXRlRmllbGRzKGRlbGV0ZWRGaWVsZHMsIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICAgICAgICB9XG4gICAgICAgIGxldCBlbmZvcmNlRmllbGRzID0gW107XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSAvLyBEZWxldGUgRXZlcnl0aGluZ1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSkgLy8gUmVsb2FkIG91ciBTY2hlbWEsIHNvIHdlIGhhdmUgYWxsIHRoZSBuZXcgdmFsdWVzXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHByb21pc2VzID0gaW5zZXJ0ZWRGaWVsZHMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZSA9IHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgICBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIG5ld1NjaGVtYSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgdGhpcy5fZGJBZGFwdGVyLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgICAgICAgIHNjaGVtYS5pbmRleGVzLFxuICAgICAgICAgICAgICAgIGZ1bGxOZXdTY2hlbWFcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSlcbiAgICAgICAgICAgIC8vVE9ETzogTW92ZSB0aGlzIGxvZ2ljIGludG8gdGhlIGRhdGFiYXNlIGFkYXB0ZXJcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG4gICAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgICAgICAgICBjb25zdCByZWxvYWRlZFNjaGVtYTogU2NoZW1hID0ge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVsb2FkZWRTY2hlbWEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiByZWxvYWRlZFNjaGVtYTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBvciBmYWlscyB3aXRoIGEgcmVhc29uLlxuICBlbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuICAgIC8vIFdlIGRvbid0IGhhdmUgdGhpcyBjbGFzcy4gVXBkYXRlIHRoZSBzY2hlbWFcbiAgICByZXR1cm4gKFxuICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgc3VjY2VlZGVkLiBSZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgdGhpcy5hZGRDbGFzc0lmTm90RXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodFxuICAgICAgICAgIC8vIGhhdmUgZmFpbGVkIGJlY2F1c2UgdGhlcmUncyBhIHJhY2UgY29uZGl0aW9uIGFuZCBhIGRpZmZlcmVudFxuICAgICAgICAgIC8vIGNsaWVudCBpcyBtYWtpbmcgdGhlIGV4YWN0IHNhbWUgc2NoZW1hIHVwZGF0ZSB0aGF0IHdlIHdhbnQuXG4gICAgICAgICAgLy8gU28ganVzdCByZWxvYWQgdGhlIHNjaGVtYS5cbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBzY2hlbWEgbm93IHZhbGlkYXRlc1xuICAgICAgICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBGYWlsZWQgdG8gYWRkICR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHN0aWxsIGRvZXNuJ3QgdmFsaWRhdGUuIEdpdmUgdXBcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnc2NoZW1hIGNsYXNzIG5hbWUgZG9lcyBub3QgcmV2YWxpZGF0ZScpO1xuICAgICAgICB9KVxuICAgICk7XG4gIH1cblxuICB2YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LCBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSk6IGFueSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgIH1cbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBlcnJvcjogaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBbXSk7XG4gIH1cblxuICB2YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgZXhpc3RpbmdGaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+XG4gICkge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgICAgaWYgKGV4aXN0aW5nRmllbGROYW1lcy5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGVycm9yOiAnaW52YWxpZCBmaWVsZCBuYW1lOiAnICsgZmllbGROYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IDEzNixcbiAgICAgICAgICAgIGVycm9yOiAnZmllbGQgJyArIGZpZWxkTmFtZSArICcgY2Fubm90IGJlIGFkZGVkJyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBjb25zdCBlcnJvciA9IGZpZWxkVHlwZUlzSW52YWxpZChmaWVsZFR5cGUpO1xuICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB7IGNvZGU6IGVycm9yLmNvZGUsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIGlmIChmaWVsZFR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ2RlZmF1bHQgdmFsdWUnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShmaWVsZFR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlXG4gICAgICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZS5yZXF1aXJlZCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZmllbGRUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdyZXF1aXJlZCcgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0pIHtcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdO1xuICAgIH1cblxuICAgIGNvbnN0IGdlb1BvaW50cyA9IE9iamVjdC5rZXlzKGZpZWxkcykuZmlsdGVyKFxuICAgICAga2V5ID0+IGZpZWxkc1trZXldICYmIGZpZWxkc1trZXldLnR5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICAgIGlmIChnZW9Qb2ludHMubGVuZ3RoID4gMSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgIGVycm9yOlxuICAgICAgICAgICdjdXJyZW50bHksIG9ubHkgb25lIEdlb1BvaW50IGZpZWxkIG1heSBleGlzdCBpbiBhbiBvYmplY3QuIEFkZGluZyAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMV0gK1xuICAgICAgICAgICcgd2hlbiAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMF0gK1xuICAgICAgICAgICcgYWxyZWFkeSBleGlzdHMuJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgfVxuXG4gIC8vIFNldHMgdGhlIENsYXNzLWxldmVsIHBlcm1pc3Npb25zIGZvciBhIGdpdmVuIGNsYXNzTmFtZSwgd2hpY2ggbXVzdCBleGlzdC5cbiAgYXN5bmMgc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIHBlcm1zOiBhbnksIG5ld1NjaGVtYTogU2NoZW1hRmllbGRzKSB7XG4gICAgaWYgKHR5cGVvZiBwZXJtcyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAocGVybXMsIG5ld1NjaGVtYSwgdGhpcy51c2VySWRSZWdFeCk7XG4gICAgYXdhaXQgdGhpcy5fZGJBZGFwdGVyLnNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUsIHBlcm1zKTtcbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICBjYWNoZWQuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gcGVybXM7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IGlmIHRoZSBwcm92aWRlZCBjbGFzc05hbWUtZmllbGROYW1lLXR5cGUgdHVwbGUgaXMgdmFsaWQuXG4gIC8vIFRoZSBjbGFzc05hbWUgbXVzdCBhbHJlYWR5IGJlIHZhbGlkYXRlZC5cbiAgLy8gSWYgJ2ZyZWV6ZScgaXMgdHJ1ZSwgcmVmdXNlIHRvIHVwZGF0ZSB0aGUgc2NoZW1hIGZvciB0aGlzIGZpZWxkLlxuICBlbmZvcmNlRmllbGRFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nIHwgU2NoZW1hRmllbGQsXG4gICAgaXNWYWxpZGF0aW9uPzogYm9vbGVhblxuICApIHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSAoeC55KSA9PiBvayBpZiB4IGlzIG9mIHR5cGUgJ29iamVjdCdcbiAgICAgIGZpZWxkTmFtZSA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgICAgdHlwZSA9ICdPYmplY3QnO1xuICAgIH1cbiAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmApO1xuICAgIH1cblxuICAgIC8vIElmIHNvbWVvbmUgdHJpZXMgdG8gY3JlYXRlIGEgbmV3IGZpZWxkIHdpdGggbnVsbC91bmRlZmluZWQgYXMgdGhlIHZhbHVlLCByZXR1cm47XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gKHsgdHlwZSB9OiBTY2hlbWFGaWVsZCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZSh0eXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUodHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICB0eXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4cGVjdGVkVHlwZSkge1xuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9OyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIGV4cGVjdGVkVHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcodHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSWYgdHlwZSBvcHRpb25zIGRvIG5vdCBjaGFuZ2VcbiAgICAgIC8vIHdlIGNhbiBzYWZlbHkgcmV0dXJuXG4gICAgICBpZiAoaXNWYWxpZGF0aW9uIHx8IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVHlwZSkgPT09IEpTT04uc3RyaW5naWZ5KHR5cGUpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvLyBGaWVsZCBvcHRpb25zIGFyZSBtYXkgYmUgY2hhbmdlZFxuICAgICAgLy8gZW5zdXJlIHRvIGhhdmUgYW4gdXBkYXRlIHRvIGRhdGUgc2NoZW1hIGZpZWxkXG4gICAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSkge1xuICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHRocm93IGVycm9ycyB3aGVuIGl0IGlzIGFwcHJvcHJpYXRlIHRvIGRvIHNvLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHQgaGF2ZSBiZWVuIGEgcmFjZVxuICAgICAgICAvLyBjb25kaXRpb24gd2hlcmUgYW5vdGhlciBjbGllbnQgdXBkYXRlZCB0aGUgc2NoZW1hIGluIHRoZSBzYW1lXG4gICAgICAgIC8vIHdheSB0aGF0IHdlIHdhbnRlZCB0by4gU28sIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIHR5cGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGVuc3VyZUZpZWxkcyhmaWVsZHM6IGFueSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH0gPSBmaWVsZHNbaV07XG4gICAgICBsZXQgeyB0eXBlIH0gPSBmaWVsZHNbaV07XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHR5cGUgPSB7IHR5cGU6IHR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhwZWN0ZWRUeXBlIHx8ICFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG1haW50YWluIGNvbXBhdGliaWxpdHlcbiAgZGVsZXRlRmllbGQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBpbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgICAgLy9Eb24ndCBhbGxvdyBkZWxldGluZyB0aGUgZGVmYXVsdCBmaWVsZHMuXG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgYGZpZWxkICR7ZmllbGROYW1lfSBjYW5ub3QgYmUgY2hhbmdlZGApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgZmFsc2UsIHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke2ZpZWxkTmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSB7IC4uLnNjaGVtYS5maWVsZHMgfTtcbiAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlRmllbGRzKGNsYXNzTmFtZSwgc2NoZW1hLCBmaWVsZE5hbWVzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgICAgIC8vRm9yIHJlbGF0aW9ucywgZHJvcCB0aGUgX0pvaW4gdGFibGVcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVDbGFzcyhgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb2JqZWN0IHByb3ZpZGVkIGluIFJFU1QgZm9ybWF0LlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hIGlmIHRoaXMgb2JqZWN0IGlzXG4gIC8vIHZhbGlkLlxuICBhc3luYyB2YWxpZGF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBsZXQgZ2VvY291bnQgPSAwO1xuICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IHRoaXMuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGdlb2NvdW50Kys7XG4gICAgICB9XG4gICAgICBpZiAoZ2VvY291bnQgPiAxKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBlY3RlZCA9IGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgaWYgKCFleHBlY3RlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdBQ0wnKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9iamVjdCBoYXMgQUNMIGltcGxpY2l0bHkuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcHJvbWlzZXMucHVzaChzY2hlbWEuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBleHBlY3RlZCwgdHJ1ZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGNvbnN0IGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuXG4gICAgaWYgKGVuZm9yY2VGaWVsZHMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH1cbiAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcblxuICAgIGNvbnN0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgdGhhdCBhbGwgdGhlIHByb3BlcnRpZXMgYXJlIHNldCBmb3IgdGhlIG9iamVjdFxuICB2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVxdWlyZWRDb2x1bW5zW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjb2x1bW5zIHx8IGNvbHVtbnMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2luZ0NvbHVtbnMgPSBjb2x1bW5zLmZpbHRlcihmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICBpZiAocXVlcnkgJiYgcXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKG9iamVjdFtjb2x1bW5dICYmIHR5cGVvZiBvYmplY3RbY29sdW1uXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAvLyBUcnlpbmcgdG8gZGVsZXRlIGEgcmVxdWlyZWQgY29sdW1uXG4gICAgICAgICAgcmV0dXJuIG9iamVjdFtjb2x1bW5dLl9fb3AgPT0gJ0RlbGV0ZSc7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm90IHRyeWluZyB0byBkbyBhbnl0aGluZyB0aGVyZVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gIW9iamVjdFtjb2x1bW5dO1xuICAgIH0pO1xuXG4gICAgaWYgKG1pc3NpbmdDb2x1bW5zLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgbWlzc2luZ0NvbHVtbnNbMF0gKyAnIGlzIHJlcXVpcmVkLicpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICB9XG5cbiAgdGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFRlc3RzIHRoYXQgdGhlIGNsYXNzIGxldmVsIHBlcm1pc3Npb24gbGV0IHBhc3MgdGhlIG9wZXJhdGlvbiBmb3IgYSBnaXZlbiBhY2xHcm91cFxuICBzdGF0aWMgdGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnM6ID9hbnksIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIGlmIChwZXJtc1snKiddKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgcGVybWlzc2lvbnMgYWdhaW5zdCB0aGUgYWNsR3JvdXAgcHJvdmlkZWQgKGFycmF5IG9mIHVzZXJJZC9yb2xlcylcbiAgICBpZiAoXG4gICAgICBhY2xHcm91cC5zb21lKGFjbCA9PiB7XG4gICAgICAgIHJldHVybiBwZXJtc1thY2xdID09PSB0cnVlO1xuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICBzdGF0aWMgdmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgIGNsYXNzUGVybWlzc2lvbnM6ID9hbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIGFjdGlvbj86IHN0cmluZ1xuICApIHtcbiAgICBpZiAoU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9ucywgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIC8vIElmIG9ubHkgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnNcbiAgICAvLyBtYWtlIHN1cmUgd2UgaGF2ZSBhbiBhY2xHcm91cFxuICAgIGlmIChwZXJtc1sncmVxdWlyZXNBdXRoZW50aWNhdGlvbiddKSB7XG4gICAgICAvLyBJZiBhY2xHcm91cCBoYXMgKiAocHVibGljKVxuICAgICAgaWYgKCFhY2xHcm91cCB8fCBhY2xHcm91cC5sZW5ndGggPT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGFjbEdyb3VwLmluZGV4T2YoJyonKSA+IC0xICYmIGFjbEdyb3VwLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIHJlcXVpcmVzQXV0aGVudGljYXRpb24gcGFzc2VkLCBqdXN0IG1vdmUgZm9yd2FyZFxuICAgICAgLy8gcHJvYmFibHkgd291bGQgYmUgd2lzZSBhdCBzb21lIHBvaW50IHRvIHJlbmFtZSB0byAnYXV0aGVudGljYXRlZFVzZXInXG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgLy8gTm8gbWF0Y2hpbmcgQ0xQLCBsZXQncyBjaGVjayB0aGUgUG9pbnRlciBwZXJtaXNzaW9uc1xuICAgIC8vIEFuZCBoYW5kbGUgdGhvc2UgbGF0ZXJcbiAgICBjb25zdCBwZXJtaXNzaW9uRmllbGQgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgLy8gUmVqZWN0IGNyZWF0ZSB3aGVuIHdyaXRlIGxvY2tkb3duXG4gICAgaWYgKHBlcm1pc3Npb25GaWVsZCA9PSAnd3JpdGVVc2VyRmllbGRzJyAmJiBvcGVyYXRpb24gPT0gJ2NyZWF0ZScpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgdGhlIHJlYWRVc2VyRmllbGRzIGxhdGVyXG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0pICYmXG4gICAgICBjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0ubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGNvbnN0IHBvaW50ZXJGaWVsZHMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwb2ludGVyRmllbGRzKSAmJiBwb2ludGVyRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFueSBvcCBleGNlcHQgJ2FkZEZpZWxkIGFzIHBhcnQgb2YgY3JlYXRlJyBpcyBvay5cbiAgICAgIGlmIChvcGVyYXRpb24gIT09ICdhZGRGaWVsZCcgfHwgYWN0aW9uID09PSAndXBkYXRlJykge1xuICAgICAgICAvLyBXZSBjYW4gYWxsb3cgYWRkaW5nIGZpZWxkIG9uIHVwZGF0ZSBmbG93IG9ubHkuXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZywgYWN0aW9uPzogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uLFxuICAgICAgYWN0aW9uXG4gICAgKTtcbiAgfVxuXG4gIGdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZyk6IGFueSB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdICYmIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgfVxuXG4gIC8vIFJldHVybnMgdGhlIGV4cGVjdGVkIHR5cGUgZm9yIGEgY2xhc3NOYW1lK2tleSBjb21iaW5hdGlvblxuICAvLyBvciB1bmRlZmluZWQgaWYgdGhlIHNjaGVtYSBpcyBub3Qgc2V0XG4gIGdldEV4cGVjdGVkVHlwZShjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBleHBlY3RlZFR5cGUgPT09ICdtYXAnID8gJ09iamVjdCcgOiBleHBlY3RlZFR5cGU7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICAvLyBDaGVja3MgaWYgYSBnaXZlbiBjbGFzcyBpcyBpbiB0aGUgc2NoZW1hLlxuICBoYXNDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSgpLnRoZW4oKCkgPT4gISF0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSk7XG4gIH1cbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbmV3IFNjaGVtYS5cbmNvbnN0IGxvYWQgPSAoZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogYW55KTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiA9PiB7XG4gIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWFDb250cm9sbGVyKGRiQWRhcHRlcik7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG59O1xuIl19