"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.classNameIsValid = classNameIsValid;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.requiredColumns = exports.VolatileClassesSchemas = exports.convertSchemaToAdapterSchema = exports.defaultColumns = exports.systemClasses = exports.load = exports.SchemaController = exports.default = void 0;

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
}); // fields required for read or write operations on their respective classes.

exports.defaultColumns = defaultColumns;
const requiredColumns = Object.freeze({
  read: {
    _User: ['username']
  },
  write: {
    _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
    _Role: ['name', 'ACL']
  }
});
exports.requiredColumns = requiredColumns;
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
    const columns = requiredColumns.write[className];

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsImRlZmF1bHRDb2x1bW5zIiwiT2JqZWN0IiwiZnJlZXplIiwiX0RlZmF1bHQiLCJvYmplY3RJZCIsInR5cGUiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJBQ0wiLCJfVXNlciIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJlbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJhdXRoRGF0YSIsIl9JbnN0YWxsYXRpb24iLCJpbnN0YWxsYXRpb25JZCIsImRldmljZVRva2VuIiwiY2hhbm5lbHMiLCJkZXZpY2VUeXBlIiwicHVzaFR5cGUiLCJHQ01TZW5kZXJJZCIsInRpbWVab25lIiwibG9jYWxlSWRlbnRpZmllciIsImJhZGdlIiwiYXBwVmVyc2lvbiIsImFwcE5hbWUiLCJhcHBJZGVudGlmaWVyIiwicGFyc2VWZXJzaW9uIiwiX1JvbGUiLCJuYW1lIiwidXNlcnMiLCJ0YXJnZXRDbGFzcyIsInJvbGVzIiwiX1Nlc3Npb24iLCJ1c2VyIiwic2Vzc2lvblRva2VuIiwiZXhwaXJlc0F0IiwiY3JlYXRlZFdpdGgiLCJfUHJvZHVjdCIsInByb2R1Y3RJZGVudGlmaWVyIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJpY29uIiwib3JkZXIiLCJ0aXRsZSIsInN1YnRpdGxlIiwiX1B1c2hTdGF0dXMiLCJwdXNoVGltZSIsInNvdXJjZSIsInF1ZXJ5IiwicGF5bG9hZCIsImV4cGlyeSIsImV4cGlyYXRpb25faW50ZXJ2YWwiLCJzdGF0dXMiLCJudW1TZW50IiwibnVtRmFpbGVkIiwicHVzaEhhc2giLCJlcnJvck1lc3NhZ2UiLCJzZW50UGVyVHlwZSIsImZhaWxlZFBlclR5cGUiLCJzZW50UGVyVVRDT2Zmc2V0IiwiZmFpbGVkUGVyVVRDT2Zmc2V0IiwiY291bnQiLCJfSm9iU3RhdHVzIiwiam9iTmFtZSIsIm1lc3NhZ2UiLCJwYXJhbXMiLCJmaW5pc2hlZEF0IiwiX0pvYlNjaGVkdWxlIiwiZGVzY3JpcHRpb24iLCJzdGFydEFmdGVyIiwiZGF5c09mV2VlayIsInRpbWVPZkRheSIsImxhc3RSdW4iLCJyZXBlYXRNaW51dGVzIiwiX0hvb2tzIiwiZnVuY3Rpb25OYW1lIiwiY2xhc3NOYW1lIiwidHJpZ2dlck5hbWUiLCJ1cmwiLCJfR2xvYmFsQ29uZmlnIiwibWFzdGVyS2V5T25seSIsIl9HcmFwaFFMQ29uZmlnIiwiY29uZmlnIiwiX0F1ZGllbmNlIiwibGFzdFVzZWQiLCJ0aW1lc1VzZWQiLCJfSWRlbXBvdGVuY3kiLCJyZXFJZCIsImV4cGlyZSIsIl9FeHBvcnRQcm9ncmVzcyIsImlkIiwibWFzdGVyS2V5IiwiYXBwbGljYXRpb25JZCIsInJlcXVpcmVkQ29sdW1ucyIsInJlYWQiLCJ3cml0ZSIsImludmFsaWRDb2x1bW5zIiwic3lzdGVtQ2xhc3NlcyIsInZvbGF0aWxlQ2xhc3NlcyIsInJvbGVSZWdleCIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCIsInB1YmxpY1JlZ2V4IiwiYXV0aGVudGljYXRlZFJlZ2V4IiwicmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4IiwiY2xwUG9pbnRlclJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUmVnZXgiLCJjbHBGaWVsZHNSZWdleCIsInZhbGlkYXRlUGVybWlzc2lvbktleSIsImtleSIsInVzZXJJZFJlZ0V4cCIsIm1hdGNoZXNTb21lIiwicmVnRXgiLCJtYXRjaCIsInZhbGlkIiwiRXJyb3IiLCJJTlZBTElEX0pTT04iLCJ2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleSIsIkNMUFZhbGlkS2V5cyIsInZhbGlkYXRlQ0xQIiwicGVybXMiLCJmaWVsZHMiLCJvcGVyYXRpb25LZXkiLCJpbmRleE9mIiwib3BlcmF0aW9uIiwidmFsaWRhdGVDTFBqc29uIiwiZmllbGROYW1lIiwidmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbiIsImVudGl0eSIsInByb3RlY3RlZEZpZWxkcyIsIkFycmF5IiwiaXNBcnJheSIsImZpZWxkIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicG9pbnRlckZpZWxkcyIsInBvaW50ZXJGaWVsZCIsInBlcm1pdCIsImpvaW5DbGFzc1JlZ2V4IiwiY2xhc3NBbmRGaWVsZFJlZ2V4IiwiY2xhc3NOYW1lSXNWYWxpZCIsInRlc3QiLCJmaWVsZE5hbWVJc1ZhbGlkIiwiaW5jbHVkZXMiLCJmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MiLCJpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSIsImludmFsaWRKc29uRXJyb3IiLCJ2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMiLCJmaWVsZFR5cGVJc0ludmFsaWQiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJ1bmRlZmluZWQiLCJJTkNPUlJFQ1RfVFlQRSIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJzY2hlbWEiLCJpbmplY3REZWZhdWx0U2NoZW1hIiwiX3JwZXJtIiwiX3dwZXJtIiwiX2hhc2hlZF9wYXNzd29yZCIsImNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSIsImluZGV4ZXMiLCJrZXlzIiwibGVuZ3RoIiwiU2NoZW1hRGF0YSIsImNvbnN0cnVjdG9yIiwiYWxsU2NoZW1hcyIsIl9fZGF0YSIsIl9fcHJvdGVjdGVkRmllbGRzIiwiZm9yRWFjaCIsImRlZmluZVByb3BlcnR5IiwiZ2V0IiwiZGF0YSIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImNsYXNzUHJvdGVjdGVkRmllbGRzIiwidW5xIiwiU2V0IiwiZnJvbSIsImRlZmF1bHRTY2hlbWEiLCJfSG9va3NTY2hlbWEiLCJfR2xvYmFsQ29uZmlnU2NoZW1hIiwiX0dyYXBoUUxDb25maWdTY2hlbWEiLCJfUHVzaFN0YXR1c1NjaGVtYSIsIl9Kb2JTdGF0dXNTY2hlbWEiLCJfSm9iU2NoZWR1bGVTY2hlbWEiLCJfQXVkaWVuY2VTY2hlbWEiLCJfSWRlbXBvdGVuY3lTY2hlbWEiLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwiZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUiLCJkYlR5cGUiLCJvYmplY3RUeXBlIiwidHlwZVRvU3RyaW5nIiwiU2NoZW1hQ29udHJvbGxlciIsImRhdGFiYXNlQWRhcHRlciIsIl9kYkFkYXB0ZXIiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJDb25maWciLCJjdXN0b21JZHMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiY3VzdG9tSWRSZWdFeCIsImF1dG9JZFJlZ0V4IiwidXNlcklkUmVnRXgiLCJ3YXRjaCIsInJlbG9hZERhdGEiLCJjbGVhckNhY2hlIiwib3B0aW9ucyIsInJlbG9hZERhdGFQcm9taXNlIiwiZ2V0QWxsQ2xhc3NlcyIsInRoZW4iLCJlcnIiLCJzZXRBbGxDbGFzc2VzIiwiY2FjaGVkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJtYXAiLCJwdXQiLCJnZXRPbmVTY2hlbWEiLCJhbGxvd1ZvbGF0aWxlQ2xhc3NlcyIsImNsZWFyIiwib25lU2NoZW1hIiwiZmluZCIsInJlamVjdCIsImFkZENsYXNzSWZOb3RFeGlzdHMiLCJ2YWxpZGF0aW9uRXJyb3IiLCJ2YWxpZGF0ZU5ld0NsYXNzIiwiY29kZSIsImVycm9yIiwiYWRhcHRlclNjaGVtYSIsImNyZWF0ZUNsYXNzIiwicGFyc2VTY2hlbWEiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1cGRhdGVDbGFzcyIsInN1Ym1pdHRlZEZpZWxkcyIsImRhdGFiYXNlIiwiZXhpc3RpbmdGaWVsZHMiLCJfX29wIiwibmV3U2NoZW1hIiwiYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QiLCJkZWZhdWx0RmllbGRzIiwiZnVsbE5ld1NjaGVtYSIsImFzc2lnbiIsInZhbGlkYXRlU2NoZW1hRGF0YSIsImRlbGV0ZWRGaWVsZHMiLCJpbnNlcnRlZEZpZWxkcyIsInB1c2giLCJkZWxldGVQcm9taXNlIiwiZGVsZXRlRmllbGRzIiwiZW5mb3JjZUZpZWxkcyIsInByb21pc2VzIiwiZW5mb3JjZUZpZWxkRXhpc3RzIiwicmVzdWx0cyIsImZpbHRlciIsInJlc3VsdCIsInNldFBlcm1pc3Npb25zIiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJlbnN1cmVGaWVsZHMiLCJyZWxvYWRlZFNjaGVtYSIsImNhdGNoIiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiZXhpc3RpbmdGaWVsZE5hbWVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpZWxkVHlwZSIsImRlZmF1bHRWYWx1ZSIsImRlZmF1bHRWYWx1ZVR5cGUiLCJnZXRUeXBlIiwicmVxdWlyZWQiLCJnZW9Qb2ludHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1ZhbGlkYXRpb24iLCJzcGxpdCIsImV4cGVjdGVkVHlwZSIsImdldEV4cGVjdGVkVHlwZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiaSIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0Iiwib2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJvYmoiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBa0JBOztBQUNBOztBQUNBOztBQUNBOztBQUVBOzs7Ozs7Ozs7Ozs7QUF0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JELEtBQXBDOztBQWVBLE1BQU1FLGNBQTBDLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO0FBQy9EO0FBQ0FDLEVBQUFBLFFBQVEsRUFBRTtBQUNSQyxJQUFBQSxRQUFRLEVBQUU7QUFBRUMsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FERjtBQUVSQyxJQUFBQSxTQUFTLEVBQUU7QUFBRUQsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FGSDtBQUdSRSxJQUFBQSxTQUFTLEVBQUU7QUFBRUYsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FISDtBQUlSRyxJQUFBQSxHQUFHLEVBQUU7QUFBRUgsTUFBQUEsSUFBSSxFQUFFO0FBQVI7QUFKRyxHQUZxRDtBQVEvRDtBQUNBSSxFQUFBQSxLQUFLLEVBQUU7QUFDTEMsSUFBQUEsUUFBUSxFQUFFO0FBQUVMLE1BQUFBLElBQUksRUFBRTtBQUFSLEtBREw7QUFFTE0sSUFBQUEsUUFBUSxFQUFFO0FBQUVOLE1BQUFBLElBQUksRUFBRTtBQUFSLEtBRkw7QUFHTE8sSUFBQUEsS0FBSyxFQUFFO0FBQUVQLE1BQUFBLElBQUksRUFBRTtBQUFSLEtBSEY7QUFJTFEsSUFBQUEsYUFBYSxFQUFFO0FBQUVSLE1BQUFBLElBQUksRUFBRTtBQUFSLEtBSlY7QUFLTFMsSUFBQUEsUUFBUSxFQUFFO0FBQUVULE1BQUFBLElBQUks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IGNsYXNzIGhhbmRsZXMgc2NoZW1hIHZhbGlkYXRpb24sIHBlcnNpc3RlbmNlLCBhbmQgbW9kaWZpY2F0aW9uLlxuLy9cbi8vIEVhY2ggaW5kaXZpZHVhbCBTY2hlbWEgb2JqZWN0IHNob3VsZCBiZSBpbW11dGFibGUuIFRoZSBoZWxwZXJzIHRvXG4vLyBkbyB0aGluZ3Mgd2l0aCB0aGUgU2NoZW1hIGp1c3QgcmV0dXJuIGEgbmV3IHNjaGVtYSB3aGVuIHRoZSBzY2hlbWFcbi8vIGlzIGNoYW5nZWQuXG4vL1xuLy8gVGhlIGNhbm9uaWNhbCBwbGFjZSB0byBzdG9yZSB0aGlzIFNjaGVtYSBpcyBpbiB0aGUgZGF0YWJhc2UgaXRzZWxmLFxuLy8gaW4gYSBfU0NIRU1BIGNvbGxlY3Rpb24uIFRoaXMgaXMgbm90IHRoZSByaWdodCB3YXkgdG8gZG8gaXQgZm9yIGFuXG4vLyBvcGVuIHNvdXJjZSBmcmFtZXdvcmssIGJ1dCBpdCdzIGJhY2t3YXJkIGNvbXBhdGlibGUsIHNvIHdlJ3JlXG4vLyBrZWVwaW5nIGl0IHRoaXMgd2F5IGZvciBub3cuXG4vL1xuLy8gSW4gQVBJLWhhbmRsaW5nIGNvZGUsIHlvdSBzaG91bGQgb25seSB1c2UgdGhlIFNjaGVtYSBjbGFzcyB2aWEgdGhlXG4vLyBEYXRhYmFzZUNvbnRyb2xsZXIuIFRoaXMgd2lsbCBsZXQgdXMgcmVwbGFjZSB0aGUgc2NoZW1hIGxvZ2ljIGZvclxuLy8gZGlmZmVyZW50IGRhdGFiYXNlcy5cbi8vIFRPRE86IGhpZGUgYWxsIHNjaGVtYSBsb2dpYyBpbnNpZGUgdGhlIGRhdGFiYXNlIGFkYXB0ZXIuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCB0eXBlIHtcbiAgU2NoZW1hLFxuICBTY2hlbWFGaWVsZHMsXG4gIENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgU2NoZW1hRmllbGQsXG4gIExvYWRTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL3R5cGVzJztcblxuY29uc3QgZGVmYXVsdENvbHVtbnM6IHsgW3N0cmluZ106IFNjaGVtYUZpZWxkcyB9ID0gT2JqZWN0LmZyZWV6ZSh7XG4gIC8vIENvbnRhaW4gdGhlIGRlZmF1bHQgY29sdW1ucyBmb3IgZXZlcnkgcGFyc2Ugb2JqZWN0IHR5cGUgKGV4Y2VwdCBfSm9pbiBjb2xsZWN0aW9uKVxuICBfRGVmYXVsdDoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY3JlYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHVwZGF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBBQ0w6IHsgdHlwZTogJ0FDTCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1VzZXIgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Vc2VyOiB7XG4gICAgdXNlcm5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXNzd29yZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWxWZXJpZmllZDogeyB0eXBlOiAnQm9vbGVhbicgfSxcbiAgICBhdXRoRGF0YTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfSW5zdGFsbGF0aW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfSW5zdGFsbGF0aW9uOiB7XG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXZpY2VUb2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNoYW5uZWxzOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICBkZXZpY2VUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcHVzaFR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBHQ01TZW5kZXJJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRpbWVab25lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbG9jYWxlSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGJhZGdlOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgYXBwVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyc2VWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Sb2xlIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfUm9sZToge1xuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1c2VyczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIHJvbGVzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1JvbGUnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9TZXNzaW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfU2Vzc2lvbjoge1xuICAgIHVzZXI6IHsgdHlwZTogJ1BvaW50ZXInLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc2Vzc2lvblRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlc0F0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIGNyZWF0ZWRXaXRoOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9Qcm9kdWN0OiB7XG4gICAgcHJvZHVjdElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkb3dubG9hZDogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBkb3dubG9hZE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpY29uOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIG9yZGVyOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdWJ0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfUHVzaFN0YXR1czoge1xuICAgIHB1c2hUaW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHJlc3Qgb3Igd2VidWlcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBxdWVyeVxuICAgIHBheWxvYWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcGF5bG9hZCxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyeTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGV4cGlyYXRpb25faW50ZXJ2YWw6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBudW1TZW50OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgbnVtRmFpbGVkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcHVzaEhhc2g6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlcnJvck1lc3NhZ2U6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgY291bnQ6IHsgdHlwZTogJ051bWJlcicgfSwgLy8gdHJhY2tzICMgb2YgYmF0Y2hlcyBxdWV1ZWQgYW5kIHBlbmRpbmdcbiAgfSxcbiAgX0pvYlN0YXR1czoge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBtZXNzYWdlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sIC8vIHBhcmFtcyByZWNlaXZlZCB3aGVuIGNhbGxpbmcgdGhlIGpvYlxuICAgIGZpbmlzaGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG4gIF9Kb2JTY2hlZHVsZToge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXJ0QWZ0ZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkYXlzT2ZXZWVrOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICB0aW1lT2ZEYXk6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsYXN0UnVuOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcmVwZWF0TWludXRlczogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSG9va3M6IHtcbiAgICBmdW5jdGlvbk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjbGFzc05hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0cmlnZ2VyTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVybDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfR2xvYmFsQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBtYXN0ZXJLZXlPbmx5OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9HcmFwaFFMQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjb25maWc6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0F1ZGllbmNlOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy9zdG9yaW5nIHF1ZXJ5IGFzIEpTT04gc3RyaW5nIHRvIHByZXZlbnQgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiIGVycm9yXG4gICAgbGFzdFVzZWQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdGltZXNVc2VkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9JZGVtcG90ZW5jeToge1xuICAgIHJlcUlkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlOiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfRXhwb3J0UHJvZ3Jlc3M6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGlkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWFzdGVyS2V5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwbGljYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxufSk7XG5cbi8vIGZpZWxkcyByZXF1aXJlZCBmb3IgcmVhZCBvciB3cml0ZSBvcGVyYXRpb25zIG9uIHRoZWlyIHJlc3BlY3RpdmUgY2xhc3Nlcy5cbmNvbnN0IHJlcXVpcmVkQ29sdW1ucyA9IE9iamVjdC5mcmVlemUoe1xuICByZWFkOiB7XG4gICAgX1VzZXI6IFsndXNlcm5hbWUnXSxcbiAgfSxcbiAgd3JpdGU6IHtcbiAgICBfUHJvZHVjdDogWydwcm9kdWN0SWRlbnRpZmllcicsICdpY29uJywgJ29yZGVyJywgJ3RpdGxlJywgJ3N1YnRpdGxlJ10sXG4gICAgX1JvbGU6IFsnbmFtZScsICdBQ0wnXSxcbiAgfSxcbn0pO1xuXG5jb25zdCBpbnZhbGlkQ29sdW1ucyA9IFsnbGVuZ3RoJ107XG5cbmNvbnN0IHN5c3RlbUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Vc2VyJyxcbiAgJ19JbnN0YWxsYXRpb24nLFxuICAnX1JvbGUnLFxuICAnX1Nlc3Npb24nLFxuICAnX1Byb2R1Y3QnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0pvYlN0YXR1cycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG4gICdfRXhwb3J0UHJvZ3Jlc3MnLFxuXSk7XG5cbmNvbnN0IHZvbGF0aWxlQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX0pvYlN0YXR1cycsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSG9va3MnLFxuICAnX0dsb2JhbENvbmZpZycsXG4gICdfR3JhcGhRTENvbmZpZycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG4gICdfRXhwb3J0UHJvZ3Jlc3MnLFxuXSk7XG5cbi8vIEFueXRoaW5nIHRoYXQgc3RhcnQgd2l0aCByb2xlXG5jb25zdCByb2xlUmVnZXggPSAvXnJvbGU6LiovO1xuLy8gQW55dGhpbmcgdGhhdCBzdGFydHMgd2l0aCB1c2VyRmllbGQgKGFsbG93ZWQgZm9yIHByb3RlY3RlZCBmaWVsZHMgb25seSlcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCA9IC9edXNlckZpZWxkOi4qLztcbi8vICogcGVybWlzc2lvblxuY29uc3QgcHVibGljUmVnZXggPSAvXlxcKiQvO1xuXG5jb25zdCBhdXRoZW50aWNhdGVkUmVnZXggPSAvXmF1dGhlbnRpY2F0ZWQkLztcblxuY29uc3QgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4ID0gL15yZXF1aXJlc0F1dGhlbnRpY2F0aW9uJC87XG5cbmNvbnN0IGNscFBvaW50ZXJSZWdleCA9IC9ecG9pbnRlckZpZWxkcyQvO1xuXG4vLyByZWdleCBmb3IgdmFsaWRhdGluZyBlbnRpdGllcyBpbiBwcm90ZWN0ZWRGaWVsZHMgb2JqZWN0XG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICBhdXRoZW50aWNhdGVkUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG4vLyBjbHAgcmVnZXhcbmNvbnN0IGNscEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIGNscFBvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUGVybWlzc2lvbktleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBjbHBGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgZGVwZW5kcyBvbiBzdGFydHVwIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIHByb3RlY3RlZEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCByZWdleCBkZXBlbmRzIG9uIGxhdW5jaCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5jb25zdCBDTFBWYWxpZEtleXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ2ZpbmQnLFxuICAnY291bnQnLFxuICAnZ2V0JyxcbiAgJ2NyZWF0ZScsXG4gICd1cGRhdGUnLFxuICAnZGVsZXRlJyxcbiAgJ2FkZEZpZWxkJyxcbiAgJ3JlYWRVc2VyRmllbGRzJyxcbiAgJ3dyaXRlVXNlckZpZWxkcycsXG4gICdwcm90ZWN0ZWRGaWVsZHMnLFxuXSk7XG5cbi8vIHZhbGlkYXRpb24gYmVmb3JlIHNldHRpbmcgY2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgb24gY29sbGVjdGlvblxuZnVuY3Rpb24gdmFsaWRhdGVDTFAocGVybXM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzOiBTY2hlbWFGaWVsZHMsIHVzZXJJZFJlZ0V4cDogUmVnRXhwKSB7XG4gIGlmICghcGVybXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBvcGVyYXRpb25LZXkgaW4gcGVybXMpIHtcbiAgICBpZiAoQ0xQVmFsaWRLZXlzLmluZGV4T2Yob3BlcmF0aW9uS2V5KSA9PSAtMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAke29wZXJhdGlvbktleX0gaXMgbm90IGEgdmFsaWQgb3BlcmF0aW9uIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3BlcmF0aW9uID0gcGVybXNbb3BlcmF0aW9uS2V5XTtcbiAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcblxuICAgIC8vIHRocm93cyB3aGVuIHJvb3QgZmllbGRzIGFyZSBvZiB3cm9uZyB0eXBlXG4gICAgdmFsaWRhdGVDTFBqc29uKG9wZXJhdGlvbiwgb3BlcmF0aW9uS2V5KTtcblxuICAgIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgICAgLy8gdmFsaWRhdGUgZ3JvdXBlZCBwb2ludGVyIHBlcm1pc3Npb25zXG4gICAgICAvLyBtdXN0IGJlIGFuIGFycmF5IHdpdGggZmllbGQgbmFtZXNcbiAgICAgIGZvciAoY29uc3QgZmllbGROYW1lIG9mIG9wZXJhdGlvbikge1xuICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKGZpZWxkTmFtZSwgZmllbGRzLCBvcGVyYXRpb25LZXkpO1xuICAgICAgfVxuICAgICAgLy8gcmVhZFVzZXJGaWVsZHMgYW5kIHdyaXRlclVzZXJGaWVsZHMgZG8gbm90IGhhdmUgbmVzZHRlZCBmaWVsZHNcbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgcHJvdGVjdGVkIGZpZWxkc1xuICAgIGlmIChvcGVyYXRpb25LZXkgPT09ICdwcm90ZWN0ZWRGaWVsZHMnKSB7XG4gICAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgICAgLy8gdGhyb3dzIG9uIHVuZXhwZWN0ZWQga2V5XG4gICAgICAgIHZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtwcm90ZWN0ZWRGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgcHJvdGVjdGVkRmllbGRzWyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBmaWVsZCBpcyBpbiBmb3JtIG9mIGFycmF5XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgLy8gZG8gbm90IGFsbG9vdyB0byBwcm90ZWN0IGRlZmF1bHQgZmllbGRzXG4gICAgICAgICAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBEZWZhdWx0IGZpZWxkICcke2ZpZWxkfScgY2FuIG5vdCBiZSBwcm90ZWN0ZWRgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBmaWVsZCBzaG91bGQgZXhpc3Qgb24gY29sbGVjdGlvblxuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywgZmllbGQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYEZpZWxkICcke2ZpZWxkfScgaW4gcHJvdGVjdGVkRmllbGRzOiR7ZW50aXR5fSBkb2VzIG5vdCBleGlzdGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIG90aGVyIGZpZWxkc1xuICAgIC8vIEVudGl0eSBjYW4gYmU6XG4gICAgLy8gXCIqXCIgLSBQdWJsaWMsXG4gICAgLy8gXCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uXCIgLSBhdXRoZW50aWNhdGVkIHVzZXJzLFxuICAgIC8vIFwib2JqZWN0SWRcIiAtIF9Vc2VyIGlkLFxuICAgIC8vIFwicm9sZTpyb2xlbmFtZVwiLFxuICAgIC8vIFwicG9pbnRlckZpZWxkc1wiIC0gYXJyYXkgb2YgZmllbGQgbmFtZXMgY29udGFpbmluZyBwb2ludGVycyB0byB1c2Vyc1xuICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgLy8gdGhyb3dzIG9uIHVuZXhwZWN0ZWQga2V5XG4gICAgICB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAvLyBlbnRpdHkgY2FuIGJlIGVpdGhlcjpcbiAgICAgIC8vIFwicG9pbnRlckZpZWxkc1wiOiBzdHJpbmdbXVxuICAgICAgaWYgKGVudGl0eSA9PT0gJ3BvaW50ZXJGaWVsZHMnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ZXJGaWVsZHMgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwb2ludGVyRmllbGRzKSkge1xuICAgICAgICAgIGZvciAoY29uc3QgcG9pbnRlckZpZWxkIG9mIHBvaW50ZXJGaWVsZHMpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24ocG9pbnRlckZpZWxkLCBmaWVsZHMsIG9wZXJhdGlvbik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtwb2ludGVyRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yICR7b3BlcmF0aW9uS2V5fVske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgZW50aXR5IGtleVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gb3IgW2VudGl0eV06IGJvb2xlYW5cbiAgICAgIGNvbnN0IHBlcm1pdCA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICBpZiAocGVybWl0ICE9PSB0cnVlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYCcke3Blcm1pdH0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX06JHtlbnRpdHl9OiR7cGVybWl0fWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDTFBqc29uKG9wZXJhdGlvbjogYW55LCBvcGVyYXRpb25LZXk6IHN0cmluZykge1xuICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3BlcmF0aW9uKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAnJHtvcGVyYXRpb259JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9IC0gbXVzdCBiZSBhbiBhcnJheWBcbiAgICAgICk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmICh0eXBlb2Ygb3BlcmF0aW9uID09PSAnb2JqZWN0JyAmJiBvcGVyYXRpb24gIT09IG51bGwpIHtcbiAgICAgIC8vIG9rIHRvIHByb2NlZWRcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAnJHtvcGVyYXRpb259JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9IC0gbXVzdCBiZSBhbiBvYmplY3RgXG4gICAgICApO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZHM6IE9iamVjdCwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgLy8gVXNlcyBjb2xsZWN0aW9uIHNjaGVtYSB0byBlbnN1cmUgdGhlIGZpZWxkIGlzIG9mIHR5cGU6XG4gIC8vIC0gUG9pbnRlcjxfVXNlcj4gKHBvaW50ZXJzKVxuICAvLyAtIEFycmF5XG4gIC8vXG4gIC8vICAgIEl0J3Mgbm90IHBvc3NpYmxlIHRvIGVuZm9yY2UgdHlwZSBvbiBBcnJheSdzIGl0ZW1zIGluIHNjaGVtYVxuICAvLyAgc28gd2UgYWNjZXB0IGFueSBBcnJheSBmaWVsZCwgYW5kIGxhdGVyIHdoZW4gYXBwbHlpbmcgcGVybWlzc2lvbnNcbiAgLy8gIG9ubHkgaXRlbXMgdGhhdCBhcmUgcG9pbnRlcnMgdG8gX1VzZXIgYXJlIGNvbnNpZGVyZWQuXG4gIGlmIChcbiAgICAhKFxuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICgoZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnUG9pbnRlcicgJiYgZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MgPT0gJ19Vc2VyJykgfHxcbiAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnQXJyYXknKVxuICAgIClcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2ZpZWxkTmFtZX0nIGlzIG5vdCBhIHZhbGlkIGNvbHVtbiBmb3IgY2xhc3MgbGV2ZWwgcG9pbnRlciBwZXJtaXNzaW9ucyAke29wZXJhdGlvbn1gXG4gICAgKTtcbiAgfVxufVxuXG5jb25zdCBqb2luQ2xhc3NSZWdleCA9IC9eX0pvaW46W0EtWmEtejAtOV9dKzpbQS1aYS16MC05X10rLztcbmNvbnN0IGNsYXNzQW5kRmllbGRSZWdleCA9IC9eW0EtWmEtel1bQS1aYS16MC05X10qJC87XG5mdW5jdGlvbiBjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIC8vIFZhbGlkIGNsYXNzZXMgbXVzdDpcbiAgcmV0dXJuIChcbiAgICAvLyBCZSBvbmUgb2YgX1VzZXIsIF9JbnN0YWxsYXRpb24sIF9Sb2xlLCBfU2Vzc2lvbiBPUlxuICAgIHN5c3RlbUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEgfHxcbiAgICAvLyBCZSBhIGpvaW4gdGFibGUgT1JcbiAgICBqb2luQ2xhc3NSZWdleC50ZXN0KGNsYXNzTmFtZSkgfHxcbiAgICAvLyBJbmNsdWRlIG9ubHkgYWxwaGEtbnVtZXJpYyBhbmQgdW5kZXJzY29yZXMsIGFuZCBub3Qgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIG9yIG51bWJlclxuICAgIGZpZWxkTmFtZUlzVmFsaWQoY2xhc3NOYW1lLCBjbGFzc05hbWUpXG4gICk7XG59XG5cbi8vIFZhbGlkIGZpZWxkcyBtdXN0IGJlIGFscGhhLW51bWVyaWMsIGFuZCBub3Qgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIG9yIG51bWJlclxuLy8gbXVzdCBub3QgYmUgYSByZXNlcnZlZCBrZXlcbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmIChjbGFzc05hbWUgJiYgY2xhc3NOYW1lICE9PSAnX0hvb2tzJykge1xuICAgIGlmIChmaWVsZE5hbWUgPT09ICdjbGFzc05hbWUnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiBjbGFzc0FuZEZpZWxkUmVnZXgudGVzdChmaWVsZE5hbWUpICYmICFpbnZhbGlkQ29sdW1ucy5pbmNsdWRlcyhmaWVsZE5hbWUpO1xufVxuXG4vLyBDaGVja3MgdGhhdCBpdCdzIG5vdCB0cnlpbmcgdG8gY2xvYmJlciBvbmUgb2YgdGhlIGRlZmF1bHQgZmllbGRzIG9mIHRoZSBjbGFzcy5cbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSAmJiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICAnSW52YWxpZCBjbGFzc25hbWU6ICcgK1xuICAgIGNsYXNzTmFtZSArXG4gICAgJywgY2xhc3NuYW1lcyBjYW4gb25seSBoYXZlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzIGFuZCBfLCBhbmQgbXVzdCBzdGFydCB3aXRoIGFuIGFscGhhIGNoYXJhY3RlciAnXG4gICk7XG59XG5cbmNvbnN0IGludmFsaWRKc29uRXJyb3IgPSBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnaW52YWxpZCBKU09OJyk7XG5jb25zdCB2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMgPSBbXG4gICdOdW1iZXInLFxuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnRGF0ZScsXG4gICdPYmplY3QnLFxuICAnQXJyYXknLFxuICAnR2VvUG9pbnQnLFxuICAnRmlsZScsXG4gICdCeXRlcycsXG4gICdQb2x5Z29uJyxcbl07XG4vLyBSZXR1cm5zIGFuIGVycm9yIHN1aXRhYmxlIGZvciB0aHJvd2luZyBpZiB0aGUgdHlwZSBpcyBpbnZhbGlkXG5jb25zdCBmaWVsZFR5cGVJc0ludmFsaWQgPSAoeyB0eXBlLCB0YXJnZXRDbGFzcyB9KSA9PiB7XG4gIGlmIChbJ1BvaW50ZXInLCAnUmVsYXRpb24nXS5pbmRleE9mKHR5cGUpID49IDApIHtcbiAgICBpZiAoIXRhcmdldENsYXNzKSB7XG4gICAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKDEzNSwgYHR5cGUgJHt0eXBlfSBuZWVkcyBhIGNsYXNzIG5hbWVgKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB0YXJnZXRDbGFzcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBpbnZhbGlkSnNvbkVycm9yO1xuICAgIH0gZWxzZSBpZiAoIWNsYXNzTmFtZUlzVmFsaWQodGFyZ2V0Q2xhc3MpKSB7XG4gICAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UodGFyZ2V0Q2xhc3MpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiB0eXBlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnZhbGlkSnNvbkVycm9yO1xuICB9XG4gIGlmICh2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMuaW5kZXhPZih0eXBlKSA8IDApIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBgaW52YWxpZCBmaWVsZCB0eXBlOiAke3R5cGV9YCk7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEgPSAoc2NoZW1hOiBhbnkpID0+IHtcbiAgc2NoZW1hID0gaW5qZWN0RGVmYXVsdFNjaGVtYShzY2hlbWEpO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5BQ0w7XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknIH07XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknIH07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hID0gKHsgLi4uc2NoZW1hIH0pID0+IHtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG5cbiAgc2NoZW1hLmZpZWxkcy5BQ0wgPSB7IHR5cGU6ICdBQ0wnIH07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5hdXRoRGF0YTsgLy9BdXRoIGRhdGEgaXMgaW1wbGljaXRcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMucGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIH1cblxuICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgIGRlbGV0ZSBzY2hlbWEuaW5kZXhlcztcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jbGFzcyBTY2hlbWFEYXRhIHtcbiAgX19kYXRhOiBhbnk7XG4gIF9fcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIGNvbnN0cnVjdG9yKGFsbFNjaGVtYXMgPSBbXSwgcHJvdGVjdGVkRmllbGRzID0ge30pIHtcbiAgICB0aGlzLl9fZGF0YSA9IHt9O1xuICAgIHRoaXMuX19wcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgYWxsU2NoZW1hcy5mb3JFYWNoKHNjaGVtYSA9PiB7XG4gICAgICBpZiAodm9sYXRpbGVDbGFzc2VzLmluY2x1ZGVzKHNjaGVtYS5jbGFzc05hbWUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBzY2hlbWEuY2xhc3NOYW1lLCB7XG4gICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gaW5qZWN0RGVmYXVsdFNjaGVtYShzY2hlbWEpLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gZGVlcGNvcHkoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcblxuICAgICAgICAgICAgY29uc3QgY2xhc3NQcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLl9fcHJvdGVjdGVkRmllbGRzW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICAgICAgaWYgKGNsYXNzUHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGNsYXNzUHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgICAgICAgICAuLi4oZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gfHwgW10pLFxuICAgICAgICAgICAgICAgICAgLi4uY2xhc3NQcm90ZWN0ZWRGaWVsZHNba2V5XSxcbiAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gSW5qZWN0IHRoZSBpbi1tZW1vcnkgY2xhc3Nlc1xuICAgIHZvbGF0aWxlQ2xhc3Nlcy5mb3JFYWNoKGNsYXNzTmFtZSA9PiB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgY2xhc3NOYW1lLCB7XG4gICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGRzOiB7fSxcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtjbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW2NsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5jb25zdCBpbmplY3REZWZhdWx0U2NoZW1hID0gKHsgY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgaW5kZXhlcyB9OiBTY2hlbWEpID0+IHtcbiAgY29uc3QgZGVmYXVsdFNjaGVtYTogU2NoZW1hID0ge1xuICAgIGNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHtcbiAgICAgIC4uLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgLi4uKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwge30pLFxuICAgICAgLi4uZmllbGRzLFxuICAgIH0sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICB9O1xuICBpZiAoaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhpbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICBkZWZhdWx0U2NoZW1hLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG4gIHJldHVybiBkZWZhdWx0U2NoZW1hO1xufTtcblxuY29uc3QgX0hvb2tzU2NoZW1hID0geyBjbGFzc05hbWU6ICdfSG9va3MnLCBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9Ib29rcyB9O1xuY29uc3QgX0dsb2JhbENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dsb2JhbENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dsb2JhbENvbmZpZyxcbn07XG5jb25zdCBfR3JhcGhRTENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dyYXBoUUxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HcmFwaFFMQ29uZmlnLFxufTtcbmNvbnN0IF9QdXNoU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX1B1c2hTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTY2hlZHVsZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTY2hlZHVsZScsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9BdWRpZW5jZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19BdWRpZW5jZScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fQXVkaWVuY2UsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSWRlbXBvdGVuY3lTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSWRlbXBvdGVuY3knLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyA9IFtcbiAgX0hvb2tzU2NoZW1hLFxuICBfSm9iU3RhdHVzU2NoZW1hLFxuICBfSm9iU2NoZWR1bGVTY2hlbWEsXG4gIF9QdXNoU3RhdHVzU2NoZW1hLFxuICBfR2xvYmFsQ29uZmlnU2NoZW1hLFxuICBfR3JhcGhRTENvbmZpZ1NjaGVtYSxcbiAgX0F1ZGllbmNlU2NoZW1hLFxuICBfSWRlbXBvdGVuY3lTY2hlbWEsXG5dO1xuXG5jb25zdCBkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSA9IChkYlR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nLCBvYmplY3RUeXBlOiBTY2hlbWFGaWVsZCkgPT4ge1xuICBpZiAoZGJUeXBlLnR5cGUgIT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlLnRhcmdldENsYXNzICE9PSBvYmplY3RUeXBlLnRhcmdldENsYXNzKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIGlmIChkYlR5cGUudHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuY29uc3QgdHlwZVRvU3RyaW5nID0gKHR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0eXBlO1xuICB9XG4gIGlmICh0eXBlLnRhcmdldENsYXNzKSB7XG4gICAgcmV0dXJuIGAke3R5cGUudHlwZX08JHt0eXBlLnRhcmdldENsYXNzfT5gO1xuICB9XG4gIHJldHVybiBgJHt0eXBlLnR5cGV9YDtcbn07XG5cbi8vIFN0b3JlcyB0aGUgZW50aXJlIHNjaGVtYSBvZiB0aGUgYXBwIGluIGEgd2VpcmQgaHlicmlkIGZvcm1hdCBzb21ld2hlcmUgYmV0d2VlblxuLy8gdGhlIG1vbmdvIGZvcm1hdCBhbmQgdGhlIFBhcnNlIGZvcm1hdC4gU29vbiwgdGhpcyB3aWxsIGFsbCBiZSBQYXJzZSBmb3JtYXQuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY2hlbWFDb250cm9sbGVyIHtcbiAgX2RiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYURhdGE6IHsgW3N0cmluZ106IFNjaGVtYSB9O1xuICByZWxvYWREYXRhUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIHVzZXJJZFJlZ0V4OiBSZWdFeHA7XG5cbiAgY29uc3RydWN0b3IoZGF0YWJhc2VBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcikge1xuICAgIHRoaXMuX2RiQWRhcHRlciA9IGRhdGFiYXNlQWRhcHRlcjtcbiAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShTY2hlbWFDYWNoZS5hbGwoKSwgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIHRoaXMucHJvdGVjdGVkRmllbGRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5wcm90ZWN0ZWRGaWVsZHM7XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpLmFsbG93Q3VzdG9tT2JqZWN0SWQ7XG5cbiAgICBjb25zdCBjdXN0b21JZFJlZ0V4ID0gL14uezEsfSQvdTsgLy8gMSsgY2hhcnNcbiAgICBjb25zdCBhdXRvSWRSZWdFeCA9IC9eW2EtekEtWjAtOV17MSx9JC87XG5cbiAgICB0aGlzLnVzZXJJZFJlZ0V4ID0gY3VzdG9tSWRzID8gY3VzdG9tSWRSZWdFeCA6IGF1dG9JZFJlZ0V4O1xuXG4gICAgdGhpcy5fZGJBZGFwdGVyLndhdGNoKCgpID0+IHtcbiAgICAgIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfSk7XG4gIH1cblxuICByZWxvYWREYXRhKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAodGhpcy5yZWxvYWREYXRhUHJvbWlzZSAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5yZWxvYWREYXRhUHJvbWlzZSA9IHRoaXMuZ2V0QWxsQ2xhc3NlcyhvcHRpb25zKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKGFsbFNjaGVtYXMsIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICB9XG5cbiAgZ2V0QWxsQ2xhc3NlcyhvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuYWxsKCk7XG4gICAgaWYgKGNhY2hlZCAmJiBjYWNoZWQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgfVxuXG4gIHNldEFsbENsYXNzZXMoKTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiBhbGxTY2hlbWFzLm1hcChpbmplY3REZWZhdWx0U2NoZW1hKSlcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5wdXQoYWxsU2NoZW1hcyk7XG4gICAgICAgIHJldHVybiBhbGxTY2hlbWFzO1xuICAgICAgfSk7XG4gIH1cblxuICBnZXRPbmVTY2hlbWEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWxsb3dWb2xhdGlsZUNsYXNzZXM6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYT4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgfVxuICAgIGlmIChhbGxvd1ZvbGF0aWxlQ2xhc3NlcyAmJiB2b2xhdGlsZUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGZpZWxkczogZGF0YS5maWVsZHMsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIGluZGV4ZXM6IGRhdGEuaW5kZXhlcyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICBjb25zdCBvbmVTY2hlbWEgPSBhbGxTY2hlbWFzLmZpbmQoc2NoZW1hID0+IHNjaGVtYS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSk7XG4gICAgICBpZiAoIW9uZVNjaGVtYSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvbmVTY2hlbWE7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBuZXcgY2xhc3MgdGhhdCBpbmNsdWRlcyB0aGUgdGhyZWUgZGVmYXVsdCBmaWVsZHMuXG4gIC8vIEFDTCBpcyBhbiBpbXBsaWNpdCBjb2x1bW4gdGhhdCBkb2VzIG5vdCBnZXQgYW4gZW50cnkgaW4gdGhlXG4gIC8vIF9TQ0hFTUFTIGRhdGFiYXNlLiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGggdGhlXG4gIC8vIGNyZWF0ZWQgc2NoZW1hLCBpbiBtb25nbyBmb3JtYXQuXG4gIC8vIG9uIHN1Y2Nlc3MsIGFuZCByZWplY3RzIHdpdGggYW4gZXJyb3Igb24gZmFpbC4gRW5zdXJlIHlvdVxuICAvLyBoYXZlIGF1dGhvcml6YXRpb24gKG1hc3RlciBrZXksIG9yIGNsaWVudCBjbGFzcyBjcmVhdGlvblxuICAvLyBlbmFibGVkKSBiZWZvcmUgY2FsbGluZyB0aGlzIGZ1bmN0aW9uLlxuICBhc3luYyBhZGRDbGFzc0lmTm90RXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55ID0ge31cbiAgKTogUHJvbWlzZTx2b2lkIHwgU2NoZW1hPiB7XG4gICAgdmFyIHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICBpZiAodmFsaWRhdGlvbkVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHZhbGlkYXRpb25FcnJvci5jb2RlICYmIHZhbGlkYXRpb25FcnJvci5lcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgYWRhcHRlclNjaGVtYSA9IGF3YWl0IHRoaXMuX2RiQWRhcHRlci5jcmVhdGVDbGFzcyhcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHtcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYShhZGFwdGVyU2NoZW1hKTtcbiAgICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlQ2xhc3MoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkRmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55LFxuICAgIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXJcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkRmllbGRzW25hbWVdO1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdICYmXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXS50eXBlICE9PSBmaWVsZC50eXBlICYmXG4gICAgICAgICAgICBmaWVsZC5fX29wICE9PSAnRGVsZXRlJ1xuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWV4aXN0aW5nRmllbGRzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fd3Blcm07XG4gICAgICAgIGNvbnN0IG5ld1NjaGVtYSA9IGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KGV4aXN0aW5nRmllbGRzLCBzdWJtaXR0ZWRGaWVsZHMpO1xuICAgICAgICBjb25zdCBkZWZhdWx0RmllbGRzID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCBkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdDtcbiAgICAgICAgY29uc3QgZnVsbE5ld1NjaGVtYSA9IE9iamVjdC5hc3NpZ24oe30sIG5ld1NjaGVtYSwgZGVmYXVsdEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBuZXdTY2hlbWEsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIE9iamVjdC5rZXlzKGV4aXN0aW5nRmllbGRzKVxuICAgICAgICApO1xuICAgICAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmluYWxseSB3ZSBoYXZlIGNoZWNrZWQgdG8gbWFrZSBzdXJlIHRoZSByZXF1ZXN0IGlzIHZhbGlkIGFuZCB3ZSBjYW4gc3RhcnQgZGVsZXRpbmcgZmllbGRzLlxuICAgICAgICAvLyBEbyBhbGwgZGVsZXRpb25zIGZpcnN0LCB0aGVuIGEgc2luZ2xlIHNhdmUgdG8gX1NDSEVNQSBjb2xsZWN0aW9uIHRvIGhhbmRsZSBhbGwgYWRkaXRpb25zLlxuICAgICAgICBjb25zdCBkZWxldGVkRmllbGRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBpbnNlcnRlZEZpZWxkcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIGRlbGV0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNlcnRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgZGVsZXRlUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICBpZiAoZGVsZXRlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSA9IHRoaXMuZGVsZXRlRmllbGRzKGRlbGV0ZWRGaWVsZHMsIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICAgICAgICB9XG4gICAgICAgIGxldCBlbmZvcmNlRmllbGRzID0gW107XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSAvLyBEZWxldGUgRXZlcnl0aGluZ1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSkgLy8gUmVsb2FkIG91ciBTY2hlbWEsIHNvIHdlIGhhdmUgYWxsIHRoZSBuZXcgdmFsdWVzXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHByb21pc2VzID0gaW5zZXJ0ZWRGaWVsZHMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZSA9IHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgICBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIG5ld1NjaGVtYSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgdGhpcy5fZGJBZGFwdGVyLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgICAgICAgIHNjaGVtYS5pbmRleGVzLFxuICAgICAgICAgICAgICAgIGZ1bGxOZXdTY2hlbWFcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSlcbiAgICAgICAgICAgIC8vVE9ETzogTW92ZSB0aGlzIGxvZ2ljIGludG8gdGhlIGRhdGFiYXNlIGFkYXB0ZXJcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG4gICAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgICAgICAgICBjb25zdCByZWxvYWRlZFNjaGVtYTogU2NoZW1hID0ge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVsb2FkZWRTY2hlbWEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiByZWxvYWRlZFNjaGVtYTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBvciBmYWlscyB3aXRoIGEgcmVhc29uLlxuICBlbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuICAgIC8vIFdlIGRvbid0IGhhdmUgdGhpcyBjbGFzcy4gVXBkYXRlIHRoZSBzY2hlbWFcbiAgICByZXR1cm4gKFxuICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgc3VjY2VlZGVkLiBSZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgdGhpcy5hZGRDbGFzc0lmTm90RXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodFxuICAgICAgICAgIC8vIGhhdmUgZmFpbGVkIGJlY2F1c2UgdGhlcmUncyBhIHJhY2UgY29uZGl0aW9uIGFuZCBhIGRpZmZlcmVudFxuICAgICAgICAgIC8vIGNsaWVudCBpcyBtYWtpbmcgdGhlIGV4YWN0IHNhbWUgc2NoZW1hIHVwZGF0ZSB0aGF0IHdlIHdhbnQuXG4gICAgICAgICAgLy8gU28ganVzdCByZWxvYWQgdGhlIHNjaGVtYS5cbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBzY2hlbWEgbm93IHZhbGlkYXRlc1xuICAgICAgICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBGYWlsZWQgdG8gYWRkICR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHN0aWxsIGRvZXNuJ3QgdmFsaWRhdGUuIEdpdmUgdXBcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnc2NoZW1hIGNsYXNzIG5hbWUgZG9lcyBub3QgcmV2YWxpZGF0ZScpO1xuICAgICAgICB9KVxuICAgICk7XG4gIH1cblxuICB2YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LCBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSk6IGFueSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgIH1cbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBlcnJvcjogaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBbXSk7XG4gIH1cblxuICB2YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgZXhpc3RpbmdGaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+XG4gICkge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgICAgaWYgKGV4aXN0aW5nRmllbGROYW1lcy5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGVycm9yOiAnaW52YWxpZCBmaWVsZCBuYW1lOiAnICsgZmllbGROYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IDEzNixcbiAgICAgICAgICAgIGVycm9yOiAnZmllbGQgJyArIGZpZWxkTmFtZSArICcgY2Fubm90IGJlIGFkZGVkJyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBjb25zdCBlcnJvciA9IGZpZWxkVHlwZUlzSW52YWxpZChmaWVsZFR5cGUpO1xuICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB7IGNvZGU6IGVycm9yLmNvZGUsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIGlmIChmaWVsZFR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ2RlZmF1bHQgdmFsdWUnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShmaWVsZFR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlXG4gICAgICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZS5yZXF1aXJlZCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZmllbGRUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdyZXF1aXJlZCcgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0pIHtcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdO1xuICAgIH1cblxuICAgIGNvbnN0IGdlb1BvaW50cyA9IE9iamVjdC5rZXlzKGZpZWxkcykuZmlsdGVyKFxuICAgICAga2V5ID0+IGZpZWxkc1trZXldICYmIGZpZWxkc1trZXldLnR5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICAgIGlmIChnZW9Qb2ludHMubGVuZ3RoID4gMSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgIGVycm9yOlxuICAgICAgICAgICdjdXJyZW50bHksIG9ubHkgb25lIEdlb1BvaW50IGZpZWxkIG1heSBleGlzdCBpbiBhbiBvYmplY3QuIEFkZGluZyAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMV0gK1xuICAgICAgICAgICcgd2hlbiAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMF0gK1xuICAgICAgICAgICcgYWxyZWFkeSBleGlzdHMuJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgfVxuXG4gIC8vIFNldHMgdGhlIENsYXNzLWxldmVsIHBlcm1pc3Npb25zIGZvciBhIGdpdmVuIGNsYXNzTmFtZSwgd2hpY2ggbXVzdCBleGlzdC5cbiAgYXN5bmMgc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIHBlcm1zOiBhbnksIG5ld1NjaGVtYTogU2NoZW1hRmllbGRzKSB7XG4gICAgaWYgKHR5cGVvZiBwZXJtcyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAocGVybXMsIG5ld1NjaGVtYSwgdGhpcy51c2VySWRSZWdFeCk7XG4gICAgYXdhaXQgdGhpcy5fZGJBZGFwdGVyLnNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUsIHBlcm1zKTtcbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICBjYWNoZWQuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gcGVybXM7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IGlmIHRoZSBwcm92aWRlZCBjbGFzc05hbWUtZmllbGROYW1lLXR5cGUgdHVwbGUgaXMgdmFsaWQuXG4gIC8vIFRoZSBjbGFzc05hbWUgbXVzdCBhbHJlYWR5IGJlIHZhbGlkYXRlZC5cbiAgLy8gSWYgJ2ZyZWV6ZScgaXMgdHJ1ZSwgcmVmdXNlIHRvIHVwZGF0ZSB0aGUgc2NoZW1hIGZvciB0aGlzIGZpZWxkLlxuICBlbmZvcmNlRmllbGRFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nIHwgU2NoZW1hRmllbGQsXG4gICAgaXNWYWxpZGF0aW9uPzogYm9vbGVhblxuICApIHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSAoeC55KSA9PiBvayBpZiB4IGlzIG9mIHR5cGUgJ29iamVjdCdcbiAgICAgIGZpZWxkTmFtZSA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgICAgdHlwZSA9ICdPYmplY3QnO1xuICAgIH1cbiAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmApO1xuICAgIH1cblxuICAgIC8vIElmIHNvbWVvbmUgdHJpZXMgdG8gY3JlYXRlIGEgbmV3IGZpZWxkIHdpdGggbnVsbC91bmRlZmluZWQgYXMgdGhlIHZhbHVlLCByZXR1cm47XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gKHsgdHlwZSB9OiBTY2hlbWFGaWVsZCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZSh0eXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUodHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICB0eXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4cGVjdGVkVHlwZSkge1xuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9OyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIGV4cGVjdGVkVHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcodHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSWYgdHlwZSBvcHRpb25zIGRvIG5vdCBjaGFuZ2VcbiAgICAgIC8vIHdlIGNhbiBzYWZlbHkgcmV0dXJuXG4gICAgICBpZiAoaXNWYWxpZGF0aW9uIHx8IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVHlwZSkgPT09IEpTT04uc3RyaW5naWZ5KHR5cGUpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvLyBGaWVsZCBvcHRpb25zIGFyZSBtYXkgYmUgY2hhbmdlZFxuICAgICAgLy8gZW5zdXJlIHRvIGhhdmUgYW4gdXBkYXRlIHRvIGRhdGUgc2NoZW1hIGZpZWxkXG4gICAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSkge1xuICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHRocm93IGVycm9ycyB3aGVuIGl0IGlzIGFwcHJvcHJpYXRlIHRvIGRvIHNvLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHQgaGF2ZSBiZWVuIGEgcmFjZVxuICAgICAgICAvLyBjb25kaXRpb24gd2hlcmUgYW5vdGhlciBjbGllbnQgdXBkYXRlZCB0aGUgc2NoZW1hIGluIHRoZSBzYW1lXG4gICAgICAgIC8vIHdheSB0aGF0IHdlIHdhbnRlZCB0by4gU28sIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIHR5cGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGVuc3VyZUZpZWxkcyhmaWVsZHM6IGFueSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH0gPSBmaWVsZHNbaV07XG4gICAgICBsZXQgeyB0eXBlIH0gPSBmaWVsZHNbaV07XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHR5cGUgPSB7IHR5cGU6IHR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhwZWN0ZWRUeXBlIHx8ICFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG1haW50YWluIGNvbXBhdGliaWxpdHlcbiAgZGVsZXRlRmllbGQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBpbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgICAgLy9Eb24ndCBhbGxvdyBkZWxldGluZyB0aGUgZGVmYXVsdCBmaWVsZHMuXG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgYGZpZWxkICR7ZmllbGROYW1lfSBjYW5ub3QgYmUgY2hhbmdlZGApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgZmFsc2UsIHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke2ZpZWxkTmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSB7IC4uLnNjaGVtYS5maWVsZHMgfTtcbiAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlRmllbGRzKGNsYXNzTmFtZSwgc2NoZW1hLCBmaWVsZE5hbWVzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgICAgIC8vRm9yIHJlbGF0aW9ucywgZHJvcCB0aGUgX0pvaW4gdGFibGVcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVDbGFzcyhgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb2JqZWN0IHByb3ZpZGVkIGluIFJFU1QgZm9ybWF0LlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hIGlmIHRoaXMgb2JqZWN0IGlzXG4gIC8vIHZhbGlkLlxuICBhc3luYyB2YWxpZGF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBsZXQgZ2VvY291bnQgPSAwO1xuICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IHRoaXMuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGdlb2NvdW50Kys7XG4gICAgICB9XG4gICAgICBpZiAoZ2VvY291bnQgPiAxKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBlY3RlZCA9IGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgaWYgKCFleHBlY3RlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdBQ0wnKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9iamVjdCBoYXMgQUNMIGltcGxpY2l0bHkuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcHJvbWlzZXMucHVzaChzY2hlbWEuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBleHBlY3RlZCwgdHJ1ZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGNvbnN0IGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuXG4gICAgaWYgKGVuZm9yY2VGaWVsZHMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH1cbiAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcblxuICAgIGNvbnN0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgdGhhdCBhbGwgdGhlIHByb3BlcnRpZXMgYXJlIHNldCBmb3IgdGhlIG9iamVjdFxuICB2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVxdWlyZWRDb2x1bW5zLndyaXRlW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjb2x1bW5zIHx8IGNvbHVtbnMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2luZ0NvbHVtbnMgPSBjb2x1bW5zLmZpbHRlcihmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICBpZiAocXVlcnkgJiYgcXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKG9iamVjdFtjb2x1bW5dICYmIHR5cGVvZiBvYmplY3RbY29sdW1uXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAvLyBUcnlpbmcgdG8gZGVsZXRlIGEgcmVxdWlyZWQgY29sdW1uXG4gICAgICAgICAgcmV0dXJuIG9iamVjdFtjb2x1bW5dLl9fb3AgPT0gJ0RlbGV0ZSc7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm90IHRyeWluZyB0byBkbyBhbnl0aGluZyB0aGVyZVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gIW9iamVjdFtjb2x1bW5dO1xuICAgIH0pO1xuXG4gICAgaWYgKG1pc3NpbmdDb2x1bW5zLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgbWlzc2luZ0NvbHVtbnNbMF0gKyAnIGlzIHJlcXVpcmVkLicpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICB9XG5cbiAgdGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFRlc3RzIHRoYXQgdGhlIGNsYXNzIGxldmVsIHBlcm1pc3Npb24gbGV0IHBhc3MgdGhlIG9wZXJhdGlvbiBmb3IgYSBnaXZlbiBhY2xHcm91cFxuICBzdGF0aWMgdGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnM6ID9hbnksIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIGlmIChwZXJtc1snKiddKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgcGVybWlzc2lvbnMgYWdhaW5zdCB0aGUgYWNsR3JvdXAgcHJvdmlkZWQgKGFycmF5IG9mIHVzZXJJZC9yb2xlcylcbiAgICBpZiAoXG4gICAgICBhY2xHcm91cC5zb21lKGFjbCA9PiB7XG4gICAgICAgIHJldHVybiBwZXJtc1thY2xdID09PSB0cnVlO1xuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICBzdGF0aWMgdmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgIGNsYXNzUGVybWlzc2lvbnM6ID9hbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIGFjdGlvbj86IHN0cmluZ1xuICApIHtcbiAgICBpZiAoU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9ucywgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIC8vIElmIG9ubHkgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnNcbiAgICAvLyBtYWtlIHN1cmUgd2UgaGF2ZSBhbiBhY2xHcm91cFxuICAgIGlmIChwZXJtc1sncmVxdWlyZXNBdXRoZW50aWNhdGlvbiddKSB7XG4gICAgICAvLyBJZiBhY2xHcm91cCBoYXMgKiAocHVibGljKVxuICAgICAgaWYgKCFhY2xHcm91cCB8fCBhY2xHcm91cC5sZW5ndGggPT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGFjbEdyb3VwLmluZGV4T2YoJyonKSA+IC0xICYmIGFjbEdyb3VwLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIHJlcXVpcmVzQXV0aGVudGljYXRpb24gcGFzc2VkLCBqdXN0IG1vdmUgZm9yd2FyZFxuICAgICAgLy8gcHJvYmFibHkgd291bGQgYmUgd2lzZSBhdCBzb21lIHBvaW50IHRvIHJlbmFtZSB0byAnYXV0aGVudGljYXRlZFVzZXInXG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgLy8gTm8gbWF0Y2hpbmcgQ0xQLCBsZXQncyBjaGVjayB0aGUgUG9pbnRlciBwZXJtaXNzaW9uc1xuICAgIC8vIEFuZCBoYW5kbGUgdGhvc2UgbGF0ZXJcbiAgICBjb25zdCBwZXJtaXNzaW9uRmllbGQgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgLy8gUmVqZWN0IGNyZWF0ZSB3aGVuIHdyaXRlIGxvY2tkb3duXG4gICAgaWYgKHBlcm1pc3Npb25GaWVsZCA9PSAnd3JpdGVVc2VyRmllbGRzJyAmJiBvcGVyYXRpb24gPT0gJ2NyZWF0ZScpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgdGhlIHJlYWRVc2VyRmllbGRzIGxhdGVyXG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0pICYmXG4gICAgICBjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0ubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGNvbnN0IHBvaW50ZXJGaWVsZHMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwb2ludGVyRmllbGRzKSAmJiBwb2ludGVyRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFueSBvcCBleGNlcHQgJ2FkZEZpZWxkIGFzIHBhcnQgb2YgY3JlYXRlJyBpcyBvay5cbiAgICAgIGlmIChvcGVyYXRpb24gIT09ICdhZGRGaWVsZCcgfHwgYWN0aW9uID09PSAndXBkYXRlJykge1xuICAgICAgICAvLyBXZSBjYW4gYWxsb3cgYWRkaW5nIGZpZWxkIG9uIHVwZGF0ZSBmbG93IG9ubHkuXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZywgYWN0aW9uPzogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uLFxuICAgICAgYWN0aW9uXG4gICAgKTtcbiAgfVxuXG4gIGdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZyk6IGFueSB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdICYmIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgfVxuXG4gIC8vIFJldHVybnMgdGhlIGV4cGVjdGVkIHR5cGUgZm9yIGEgY2xhc3NOYW1lK2tleSBjb21iaW5hdGlvblxuICAvLyBvciB1bmRlZmluZWQgaWYgdGhlIHNjaGVtYSBpcyBub3Qgc2V0XG4gIGdldEV4cGVjdGVkVHlwZShjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBleHBlY3RlZFR5cGUgPT09ICdtYXAnID8gJ09iamVjdCcgOiBleHBlY3RlZFR5cGU7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICAvLyBDaGVja3MgaWYgYSBnaXZlbiBjbGFzcyBpcyBpbiB0aGUgc2NoZW1hLlxuICBoYXNDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSgpLnRoZW4oKCkgPT4gISF0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSk7XG4gIH1cbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbmV3IFNjaGVtYS5cbmNvbnN0IGxvYWQgPSAoZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogYW55KTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiA9PiB7XG4gIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWFDb250cm9sbGVyKGRiQWRhcHRlcik7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG4gIHJlcXVpcmVkQ29sdW1ucyxcbn07XG4iXX0=