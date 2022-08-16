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
exports.systemClasses = exports.requiredColumns = exports.load = void 0;

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _Config = _interopRequireDefault(require("../Config"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJkZWZhdWx0Q29sdW1ucyIsIk9iamVjdCIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJzb3VyY2UiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJfRXhwb3J0UHJvZ3Jlc3MiLCJpZCIsIm1hc3RlcktleSIsImFwcGxpY2F0aW9uSWQiLCJyZXF1aXJlZENvbHVtbnMiLCJyZWFkIiwid3JpdGUiLCJpbnZhbGlkQ29sdW1ucyIsInN5c3RlbUNsYXNzZXMiLCJ2b2xhdGlsZUNsYXNzZXMiLCJyb2xlUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXgiLCJwdWJsaWNSZWdleCIsImF1dGhlbnRpY2F0ZWRSZWdleCIsInJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCIsImNscFBvaW50ZXJSZWdleCIsInByb3RlY3RlZEZpZWxkc1JlZ2V4IiwiY2xwRmllbGRzUmVnZXgiLCJ2YWxpZGF0ZVBlcm1pc3Npb25LZXkiLCJrZXkiLCJ1c2VySWRSZWdFeHAiLCJtYXRjaGVzU29tZSIsInJlZ0V4IiwibWF0Y2giLCJ2YWxpZCIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwidmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkiLCJDTFBWYWxpZEtleXMiLCJ2YWxpZGF0ZUNMUCIsInBlcm1zIiwiZmllbGRzIiwib3BlcmF0aW9uS2V5IiwiaW5kZXhPZiIsIm9wZXJhdGlvbiIsInZhbGlkYXRlQ0xQanNvbiIsImZpZWxkTmFtZSIsInZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24iLCJlbnRpdHkiLCJwcm90ZWN0ZWRGaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJmaWVsZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInBvaW50ZXJGaWVsZHMiLCJwb2ludGVyRmllbGQiLCJwZXJtaXQiLCJqb2luQ2xhc3NSZWdleCIsImNsYXNzQW5kRmllbGRSZWdleCIsImNsYXNzTmFtZUlzVmFsaWQiLCJ0ZXN0IiwiZmllbGROYW1lSXNWYWxpZCIsImluY2x1ZGVzIiwiZmllbGROYW1lSXNWYWxpZEZvckNsYXNzIiwiaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UiLCJpbnZhbGlkSnNvbkVycm9yIiwidmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzIiwiZmllbGRUeXBlSXNJbnZhbGlkIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwidW5kZWZpbmVkIiwiSU5DT1JSRUNUX1RZUEUiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwic2NoZW1hIiwiaW5qZWN0RGVmYXVsdFNjaGVtYSIsIl9ycGVybSIsIl93cGVybSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEiLCJpbmRleGVzIiwia2V5cyIsImxlbmd0aCIsIlNjaGVtYURhdGEiLCJjb25zdHJ1Y3RvciIsImFsbFNjaGVtYXMiLCJfX2RhdGEiLCJfX3Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJkZWZpbmVQcm9wZXJ0eSIsImdldCIsImRhdGEiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJkZWVwY29weSIsImNsYXNzUHJvdGVjdGVkRmllbGRzIiwidW5xIiwiU2V0IiwiZnJvbSIsImRlZmF1bHRTY2hlbWEiLCJfSG9va3NTY2hlbWEiLCJfR2xvYmFsQ29uZmlnU2NoZW1hIiwiX0dyYXBoUUxDb25maWdTY2hlbWEiLCJfUHVzaFN0YXR1c1NjaGVtYSIsIl9Kb2JTdGF0dXNTY2hlbWEiLCJfSm9iU2NoZWR1bGVTY2hlbWEiLCJfQXVkaWVuY2VTY2hlbWEiLCJfSWRlbXBvdGVuY3lTY2hlbWEiLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwiZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUiLCJkYlR5cGUiLCJvYmplY3RUeXBlIiwidHlwZVRvU3RyaW5nIiwiU2NoZW1hQ29udHJvbGxlciIsImRhdGFiYXNlQWRhcHRlciIsIl9kYkFkYXB0ZXIiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJDb25maWciLCJjdXN0b21JZHMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiY3VzdG9tSWRSZWdFeCIsImF1dG9JZFJlZ0V4IiwidXNlcklkUmVnRXgiLCJ3YXRjaCIsInJlbG9hZERhdGEiLCJjbGVhckNhY2hlIiwib3B0aW9ucyIsInJlbG9hZERhdGFQcm9taXNlIiwiZ2V0QWxsQ2xhc3NlcyIsInRoZW4iLCJlcnIiLCJzZXRBbGxDbGFzc2VzIiwiY2FjaGVkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJtYXAiLCJwdXQiLCJnZXRPbmVTY2hlbWEiLCJhbGxvd1ZvbGF0aWxlQ2xhc3NlcyIsImNsZWFyIiwib25lU2NoZW1hIiwiZmluZCIsInJlamVjdCIsImFkZENsYXNzSWZOb3RFeGlzdHMiLCJ2YWxpZGF0aW9uRXJyb3IiLCJ2YWxpZGF0ZU5ld0NsYXNzIiwiY29kZSIsImVycm9yIiwiYWRhcHRlclNjaGVtYSIsImNyZWF0ZUNsYXNzIiwicGFyc2VTY2hlbWEiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1cGRhdGVDbGFzcyIsInN1Ym1pdHRlZEZpZWxkcyIsImRhdGFiYXNlIiwiZXhpc3RpbmdGaWVsZHMiLCJfX29wIiwibmV3U2NoZW1hIiwiYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QiLCJkZWZhdWx0RmllbGRzIiwiZnVsbE5ld1NjaGVtYSIsImFzc2lnbiIsInZhbGlkYXRlU2NoZW1hRGF0YSIsImRlbGV0ZWRGaWVsZHMiLCJpbnNlcnRlZEZpZWxkcyIsInB1c2giLCJkZWxldGVQcm9taXNlIiwiZGVsZXRlRmllbGRzIiwiZW5mb3JjZUZpZWxkcyIsInByb21pc2VzIiwiZW5mb3JjZUZpZWxkRXhpc3RzIiwicmVzdWx0cyIsImZpbHRlciIsInJlc3VsdCIsInNldFBlcm1pc3Npb25zIiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJlbnN1cmVGaWVsZHMiLCJyZWxvYWRlZFNjaGVtYSIsImNhdGNoIiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiZXhpc3RpbmdGaWVsZE5hbWVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpZWxkVHlwZSIsImRlZmF1bHRWYWx1ZSIsImRlZmF1bHRWYWx1ZVR5cGUiLCJnZXRUeXBlIiwicmVxdWlyZWQiLCJnZW9Qb2ludHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1ZhbGlkYXRpb24iLCJzcGxpdCIsImV4cGVjdGVkVHlwZSIsImdldEV4cGVjdGVkVHlwZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiaSIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0Iiwib2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJvYmoiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHNjaGVtYSB2YWxpZGF0aW9uLCBwZXJzaXN0ZW5jZSwgYW5kIG1vZGlmaWNhdGlvbi5cbi8vXG4vLyBFYWNoIGluZGl2aWR1YWwgU2NoZW1hIG9iamVjdCBzaG91bGQgYmUgaW1tdXRhYmxlLiBUaGUgaGVscGVycyB0b1xuLy8gZG8gdGhpbmdzIHdpdGggdGhlIFNjaGVtYSBqdXN0IHJldHVybiBhIG5ldyBzY2hlbWEgd2hlbiB0aGUgc2NoZW1hXG4vLyBpcyBjaGFuZ2VkLlxuLy9cbi8vIFRoZSBjYW5vbmljYWwgcGxhY2UgdG8gc3RvcmUgdGhpcyBTY2hlbWEgaXMgaW4gdGhlIGRhdGFiYXNlIGl0c2VsZixcbi8vIGluIGEgX1NDSEVNQSBjb2xsZWN0aW9uLiBUaGlzIGlzIG5vdCB0aGUgcmlnaHQgd2F5IHRvIGRvIGl0IGZvciBhblxuLy8gb3BlbiBzb3VyY2UgZnJhbWV3b3JrLCBidXQgaXQncyBiYWNrd2FyZCBjb21wYXRpYmxlLCBzbyB3ZSdyZVxuLy8ga2VlcGluZyBpdCB0aGlzIHdheSBmb3Igbm93LlxuLy9cbi8vIEluIEFQSS1oYW5kbGluZyBjb2RlLCB5b3Ugc2hvdWxkIG9ubHkgdXNlIHRoZSBTY2hlbWEgY2xhc3MgdmlhIHRoZVxuLy8gRGF0YWJhc2VDb250cm9sbGVyLiBUaGlzIHdpbGwgbGV0IHVzIHJlcGxhY2UgdGhlIHNjaGVtYSBsb2dpYyBmb3Jcbi8vIGRpZmZlcmVudCBkYXRhYmFzZXMuXG4vLyBUT0RPOiBoaWRlIGFsbCBzY2hlbWEgbG9naWMgaW5zaWRlIHRoZSBkYXRhYmFzZSBhZGFwdGVyLlxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYSxcbiAgU2NoZW1hRmllbGRzLFxuICBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIFNjaGVtYUZpZWxkLFxuICBMb2FkU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IGRlZmF1bHRDb2x1bW5zOiB7IFtzdHJpbmddOiBTY2hlbWFGaWVsZHMgfSA9IE9iamVjdC5mcmVlemUoe1xuICAvLyBDb250YWluIHRoZSBkZWZhdWx0IGNvbHVtbnMgZm9yIGV2ZXJ5IHBhcnNlIG9iamVjdCB0eXBlIChleGNlcHQgX0pvaW4gY29sbGVjdGlvbilcbiAgX0RlZmF1bHQ6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNyZWF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB1cGRhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgQUNMOiB7IHR5cGU6ICdBQ0wnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Vc2VyIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfVXNlcjoge1xuICAgIHVzZXJuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFzc3dvcmQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsVmVyaWZpZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgYXV0aERhdGE6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX0luc3RhbGxhdGlvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX0luc3RhbGxhdGlvbjoge1xuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGV2aWNlVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjaGFubmVsczogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgZGV2aWNlVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHB1c2hUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgR0NNU2VuZGVySWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0aW1lWm9uZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxvY2FsZUlkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBiYWRnZTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGFwcFZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcnNlVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfUm9sZSBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1JvbGU6IHtcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXNlcnM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICByb2xlczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Sb2xlJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfU2Vzc2lvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1Nlc3Npb246IHtcbiAgICB1c2VyOiB7IHR5cGU6ICdQb2ludGVyJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNlc3Npb25Ub2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZXNBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBjcmVhdGVkV2l0aDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfUHJvZHVjdDoge1xuICAgIHByb2R1Y3RJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZG93bmxvYWQ6IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgZG93bmxvYWROYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWNvbjogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBvcmRlcjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3VidGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX1B1c2hTdGF0dXM6IHtcbiAgICBwdXNoVGltZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyByZXN0IG9yIHdlYnVpXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcXVlcnlcbiAgICBwYXlsb2FkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHBheWxvYWQsXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcnk6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBleHBpcmF0aW9uX2ludGVydmFsOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbnVtU2VudDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIG51bUZhaWxlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHB1c2hIYXNoOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXJyb3JNZXNzYWdlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGNvdW50OiB7IHR5cGU6ICdOdW1iZXInIH0sIC8vIHRyYWNrcyAjIG9mIGJhdGNoZXMgcXVldWVkIGFuZCBwZW5kaW5nXG4gIH0sXG4gIF9Kb2JTdGF0dXM6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWVzc2FnZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LCAvLyBwYXJhbXMgcmVjZWl2ZWQgd2hlbiBjYWxsaW5nIHRoZSBqb2JcbiAgICBmaW5pc2hlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfSm9iU2NoZWR1bGU6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGFydEFmdGVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGF5c09mV2VlazogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgdGltZU9mRGF5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbGFzdFJ1bjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHJlcGVhdE1pbnV0ZXM6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0hvb2tzOiB7XG4gICAgZnVuY3Rpb25OYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2xhc3NOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdHJpZ2dlck5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1cmw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX0dsb2JhbENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgbWFzdGVyS2V5T25seTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfR3JhcGhRTENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY29uZmlnOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9BdWRpZW5jZToge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vc3RvcmluZyBxdWVyeSBhcyBKU09OIHN0cmluZyB0byBwcmV2ZW50IFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIiBlcnJvclxuICAgIGxhc3RVc2VkOiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHRpbWVzVXNlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSWRlbXBvdGVuY3k6IHtcbiAgICByZXFJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZTogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbiAgX0V4cG9ydFByb2dyZXNzOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1hc3RlcktleTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcGxpY2F0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbn0pO1xuXG4vLyBmaWVsZHMgcmVxdWlyZWQgZm9yIHJlYWQgb3Igd3JpdGUgb3BlcmF0aW9ucyBvbiB0aGVpciByZXNwZWN0aXZlIGNsYXNzZXMuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgcmVhZDoge1xuICAgIF9Vc2VyOiBbJ3VzZXJuYW1lJ10sXG4gIH0sXG4gIHdyaXRlOiB7XG4gICAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICAgIF9Sb2xlOiBbJ25hbWUnLCAnQUNMJ10sXG4gIH0sXG59KTtcblxuY29uc3QgaW52YWxpZENvbHVtbnMgPSBbJ2xlbmd0aCddO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuICAnX0V4cG9ydFByb2dyZXNzJyxcbl0pO1xuXG5jb25zdCB2b2xhdGlsZUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0hvb2tzJyxcbiAgJ19HbG9iYWxDb25maWcnLFxuICAnX0dyYXBoUUxDb25maWcnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuICAnX0V4cG9ydFByb2dyZXNzJyxcbl0pO1xuXG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkIChhbGxvd2VkIGZvciBwcm90ZWN0ZWQgZmllbGRzIG9ubHkpXG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXggPSAvXnVzZXJGaWVsZDouKi87XG4vLyAqIHBlcm1pc3Npb25cbmNvbnN0IHB1YmxpY1JlZ2V4ID0gL15cXCokLztcblxuY29uc3QgYXV0aGVudGljYXRlZFJlZ2V4ID0gL15hdXRoZW50aWNhdGVkJC87XG5cbmNvbnN0IHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBjbHBQb2ludGVyUmVnZXggPSAvXnBvaW50ZXJGaWVsZHMkLztcblxuLy8gcmVnZXggZm9yIHZhbGlkYXRpbmcgZW50aXRpZXMgaW4gcHJvdGVjdGVkRmllbGRzIG9iamVjdFxuY29uc3QgcHJvdGVjdGVkRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgYXV0aGVudGljYXRlZFJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuLy8gY2xwIHJlZ2V4XG5jb25zdCBjbHBGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBjbHBQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgY2xwRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIGRlcGVuZHMgb24gc3RhcnR1cCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBwcm90ZWN0ZWRGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgcmVnZXggZGVwZW5kcyBvbiBsYXVuY2ggb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdmaW5kJyxcbiAgJ2NvdW50JyxcbiAgJ2dldCcsXG4gICdjcmVhdGUnLFxuICAndXBkYXRlJyxcbiAgJ2RlbGV0ZScsXG4gICdhZGRGaWVsZCcsXG4gICdyZWFkVXNlckZpZWxkcycsXG4gICd3cml0ZVVzZXJGaWVsZHMnLFxuICAncHJvdGVjdGVkRmllbGRzJyxcbl0pO1xuXG4vLyB2YWxpZGF0aW9uIGJlZm9yZSBzZXR0aW5nIGNsYXNzLWxldmVsIHBlcm1pc3Npb25zIG9uIGNvbGxlY3Rpb25cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQKHBlcm1zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkczogU2NoZW1hRmllbGRzLCB1c2VySWRSZWdFeHA6IFJlZ0V4cCkge1xuICBpZiAoIXBlcm1zKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qgb3BlcmF0aW9uS2V5IGluIHBlcm1zKSB7XG4gICAgaWYgKENMUFZhbGlkS2V5cy5pbmRleE9mKG9wZXJhdGlvbktleSkgPT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJHtvcGVyYXRpb25LZXl9IGlzIG5vdCBhIHZhbGlkIG9wZXJhdGlvbiBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG9wZXJhdGlvbiA9IHBlcm1zW29wZXJhdGlvbktleV07XG4gICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG5cbiAgICAvLyB0aHJvd3Mgd2hlbiByb290IGZpZWxkcyBhcmUgb2Ygd3JvbmcgdHlwZVxuICAgIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb24sIG9wZXJhdGlvbktleSk7XG5cbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICAgIC8vIHZhbGlkYXRlIGdyb3VwZWQgcG9pbnRlciBwZXJtaXNzaW9uc1xuICAgICAgLy8gbXVzdCBiZSBhbiBhcnJheSB3aXRoIGZpZWxkIG5hbWVzXG4gICAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiBvcGVyYXRpb24pIHtcbiAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWUsIGZpZWxkcywgb3BlcmF0aW9uS2V5KTtcbiAgICAgIH1cbiAgICAgIC8vIHJlYWRVc2VyRmllbGRzIGFuZCB3cml0ZXJVc2VyRmllbGRzIGRvIG5vdCBoYXZlIG5lc2R0ZWQgZmllbGRzXG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIHByb3RlY3RlZCBmaWVsZHNcbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncHJvdGVjdGVkRmllbGRzJykge1xuICAgICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgICB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cHJvdGVjdGVkRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIHByb3RlY3RlZEZpZWxkc1ske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgZmllbGQgaXMgaW4gZm9ybSBvZiBhcnJheVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgIC8vIGRvIG5vdCBhbGxvb3cgdG8gcHJvdGVjdCBkZWZhdWx0IGZpZWxkc1xuICAgICAgICAgIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZF0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRGVmYXVsdCBmaWVsZCAnJHtmaWVsZH0nIGNhbiBub3QgYmUgcHJvdGVjdGVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZmllbGQgc2hvdWxkIGV4aXN0IG9uIGNvbGxlY3Rpb25cbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGZpZWxkKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBGaWVsZCAnJHtmaWVsZH0nIGluIHByb3RlY3RlZEZpZWxkczoke2VudGl0eX0gZG9lcyBub3QgZXhpc3RgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBvdGhlciBmaWVsZHNcbiAgICAvLyBFbnRpdHkgY2FuIGJlOlxuICAgIC8vIFwiKlwiIC0gUHVibGljLFxuICAgIC8vIFwicmVxdWlyZXNBdXRoZW50aWNhdGlvblwiIC0gYXV0aGVudGljYXRlZCB1c2VycyxcbiAgICAvLyBcIm9iamVjdElkXCIgLSBfVXNlciBpZCxcbiAgICAvLyBcInJvbGU6cm9sZW5hbWVcIixcbiAgICAvLyBcInBvaW50ZXJGaWVsZHNcIiAtIGFycmF5IG9mIGZpZWxkIG5hbWVzIGNvbnRhaW5pbmcgcG9pbnRlcnMgdG8gdXNlcnNcbiAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgLy8gZW50aXR5IGNhbiBiZSBlaXRoZXI6XG4gICAgICAvLyBcInBvaW50ZXJGaWVsZHNcIjogc3RyaW5nW11cbiAgICAgIGlmIChlbnRpdHkgPT09ICdwb2ludGVyRmllbGRzJykge1xuICAgICAgICBjb25zdCBwb2ludGVyRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHBvaW50ZXJGaWVsZCBvZiBwb2ludGVyRmllbGRzKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKHBvaW50ZXJGaWVsZCwgZmllbGRzLCBvcGVyYXRpb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cG9pbnRlckZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciAke29wZXJhdGlvbktleX1bJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IGVudGl0eSBrZXlcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIG9yIFtlbnRpdHldOiBib29sZWFuXG4gICAgICBjb25zdCBwZXJtaXQgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgaWYgKHBlcm1pdCAhPT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9OiR7ZW50aXR5fToke3Blcm1pdH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb246IGFueSwgb3BlcmF0aW9uS2V5OiBzdHJpbmcpIHtcbiAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gYXJyYXlgXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIG9wZXJhdGlvbiA9PT0gJ29iamVjdCcgJiYgb3BlcmF0aW9uICE9PSBudWxsKSB7XG4gICAgICAvLyBvayB0byBwcm9jZWVkXG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gb2JqZWN0YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWU6IHN0cmluZywgZmllbGRzOiBPYmplY3QsIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gIC8vIFVzZXMgY29sbGVjdGlvbiBzY2hlbWEgdG8gZW5zdXJlIHRoZSBmaWVsZCBpcyBvZiB0eXBlOlxuICAvLyAtIFBvaW50ZXI8X1VzZXI+IChwb2ludGVycylcbiAgLy8gLSBBcnJheVxuICAvL1xuICAvLyAgICBJdCdzIG5vdCBwb3NzaWJsZSB0byBlbmZvcmNlIHR5cGUgb24gQXJyYXkncyBpdGVtcyBpbiBzY2hlbWFcbiAgLy8gIHNvIHdlIGFjY2VwdCBhbnkgQXJyYXkgZmllbGQsIGFuZCBsYXRlciB3aGVuIGFwcGx5aW5nIHBlcm1pc3Npb25zXG4gIC8vICBvbmx5IGl0ZW1zIHRoYXQgYXJlIHBvaW50ZXJzIHRvIF9Vc2VyIGFyZSBjb25zaWRlcmVkLlxuICBpZiAoXG4gICAgIShcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAoKGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInICYmIGZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ0FycmF5JylcbiAgICApXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtmaWVsZE5hbWV9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICk7XG4gIH1cbn1cblxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSwgY2xhc3NOYW1lKVxuICApO1xufVxuXG4vLyBWYWxpZCBmaWVsZHMgbXVzdCBiZSBhbHBoYS1udW1lcmljLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbi8vIG11c3Qgbm90IGJlIGEgcmVzZXJ2ZWQga2V5XG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoY2xhc3NOYW1lICYmIGNsYXNzTmFtZSAhPT0gJ19Ib29rcycpIHtcbiAgICBpZiAoZmllbGROYW1lID09PSAnY2xhc3NOYW1lJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY2xhc3NBbmRGaWVsZFJlZ2V4LnRlc3QoZmllbGROYW1lKSAmJiAhaW52YWxpZENvbHVtbnMuaW5jbHVkZXMoZmllbGROYW1lKTtcbn1cblxuLy8gQ2hlY2tzIHRoYXQgaXQncyBub3QgdHJ5aW5nIHRvIGNsb2JiZXIgb25lIG9mIHRoZSBkZWZhdWx0IGZpZWxkcyBvZiB0aGUgY2xhc3MuXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2ludmFsaWQgSlNPTicpO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKHRhcmdldENsYXNzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IGRlZXBjb3B5KHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsYXNzUHJvdGVjdGVkRmllbGRzID0gdGhpcy5fX3Byb3RlY3RlZEZpZWxkc1tzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgICAgIGlmIChjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgICAgICAgLi4uKGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldIHx8IFtdKSxcbiAgICAgICAgICAgICAgICAgIC4uLmNsYXNzUHJvdGVjdGVkRmllbGRzW2tleV0sXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEluamVjdCB0aGUgaW4tbWVtb3J5IGNsYXNzZXNcbiAgICB2b2xhdGlsZUNsYXNzZXMuZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkczoge30sXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtjbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuY29uc3QgaW5qZWN0RGVmYXVsdFNjaGVtYSA9ICh7IGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIGluZGV4ZXMgfTogU2NoZW1hKSA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICBjbGFzc05hbWUsXG4gICAgZmllbGRzOiB7XG4gICAgICAuLi5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgIC4uLihkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IHt9KSxcbiAgICAgIC4uLmZpZWxkcyxcbiAgICB9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgfTtcbiAgaWYgKGluZGV4ZXMgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgZGVmYXVsdFNjaGVtYS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuICByZXR1cm4gZGVmYXVsdFNjaGVtYTtcbn07XG5cbmNvbnN0IF9Ib29rc1NjaGVtYSA9IHsgY2xhc3NOYW1lOiAnX0hvb2tzJywgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSG9va3MgfTtcbmNvbnN0IF9HbG9iYWxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HbG9iYWxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HbG9iYWxDb25maWcsXG59O1xuY29uc3QgX0dyYXBoUUxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HcmFwaFFMQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR3JhcGhRTENvbmZpZyxcbn07XG5jb25zdCBfUHVzaFN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19QdXNoU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU2NoZWR1bGVTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU2NoZWR1bGUnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfQXVkaWVuY2VTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfQXVkaWVuY2UnLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0F1ZGllbmNlLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0lkZW1wb3RlbmN5U2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0lkZW1wb3RlbmN5JyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgPSBbXG4gIF9Ib29rc1NjaGVtYSxcbiAgX0pvYlN0YXR1c1NjaGVtYSxcbiAgX0pvYlNjaGVkdWxlU2NoZW1hLFxuICBfUHVzaFN0YXR1c1NjaGVtYSxcbiAgX0dsb2JhbENvbmZpZ1NjaGVtYSxcbiAgX0dyYXBoUUxDb25maWdTY2hlbWEsXG4gIF9BdWRpZW5jZVNjaGVtYSxcbiAgX0lkZW1wb3RlbmN5U2NoZW1hLFxuXTtcblxuY29uc3QgZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUgPSAoZGJUeXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZywgb2JqZWN0VHlwZTogU2NoZW1hRmllbGQpID0+IHtcbiAgaWYgKGRiVHlwZS50eXBlICE9PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZS50YXJnZXRDbGFzcyAhPT0gb2JqZWN0VHlwZS50YXJnZXRDbGFzcykgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICBpZiAoZGJUeXBlLnR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmNvbnN0IHR5cGVUb1N0cmluZyA9ICh0eXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuICBpZiAodHlwZS50YXJnZXRDbGFzcykge1xuICAgIHJldHVybiBgJHt0eXBlLnR5cGV9PCR7dHlwZS50YXJnZXRDbGFzc30+YDtcbiAgfVxuICByZXR1cm4gYCR7dHlwZS50eXBlfWA7XG59O1xuXG4vLyBTdG9yZXMgdGhlIGVudGlyZSBzY2hlbWEgb2YgdGhlIGFwcCBpbiBhIHdlaXJkIGh5YnJpZCBmb3JtYXQgc29tZXdoZXJlIGJldHdlZW5cbi8vIHRoZSBtb25nbyBmb3JtYXQgYW5kIHRoZSBQYXJzZSBmb3JtYXQuIFNvb24sIHRoaXMgd2lsbCBhbGwgYmUgUGFyc2UgZm9ybWF0LlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2NoZW1hQ29udHJvbGxlciB7XG4gIF9kYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFEYXRhOiB7IFtzdHJpbmddOiBTY2hlbWEgfTtcbiAgcmVsb2FkRGF0YVByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIHByb3RlY3RlZEZpZWxkczogYW55O1xuICB1c2VySWRSZWdFeDogUmVnRXhwO1xuXG4gIGNvbnN0cnVjdG9yKGRhdGFiYXNlQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIpIHtcbiAgICB0aGlzLl9kYkFkYXB0ZXIgPSBkYXRhYmFzZUFkYXB0ZXI7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoU2NoZW1hQ2FjaGUuYWxsKCksIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCkucHJvdGVjdGVkRmllbGRzO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5hbGxvd0N1c3RvbU9iamVjdElkO1xuXG4gICAgY29uc3QgY3VzdG9tSWRSZWdFeCA9IC9eLnsxLH0kL3U7IC8vIDErIGNoYXJzXG4gICAgY29uc3QgYXV0b0lkUmVnRXggPSAvXlthLXpBLVowLTldezEsfSQvO1xuXG4gICAgdGhpcy51c2VySWRSZWdFeCA9IGN1c3RvbUlkcyA/IGN1c3RvbUlkUmVnRXggOiBhdXRvSWRSZWdFeDtcblxuICAgIHRoaXMuX2RiQWRhcHRlci53YXRjaCgoKSA9PiB7XG4gICAgICB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVsb2FkRGF0YShvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKHRoaXMucmVsb2FkRGF0YVByb21pc2UgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMucmVsb2FkRGF0YVByb21pc2UgPSB0aGlzLmdldEFsbENsYXNzZXMob3B0aW9ucylcbiAgICAgIC50aGVuKFxuICAgICAgICBhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShhbGxTY2hlbWFzLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgfVxuXG4gIGdldEFsbENsYXNzZXMob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmFsbCgpO1xuICAgIGlmIChjYWNoZWQgJiYgY2FjaGVkLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gIH1cblxuICBzZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4gYWxsU2NoZW1hcy5tYXAoaW5qZWN0RGVmYXVsdFNjaGVtYSkpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUucHV0KGFsbFNjaGVtYXMpO1xuICAgICAgICByZXR1cm4gYWxsU2NoZW1hcztcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0T25lU2NoZW1hKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFsbG93Vm9sYXRpbGVDbGFzc2VzOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWE+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIH1cbiAgICBpZiAoYWxsb3dWb2xhdGlsZUNsYXNzZXMgJiYgdm9sYXRpbGVDbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xKSB7XG4gICAgICBjb25zdCBkYXRhID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBmaWVsZHM6IGRhdGEuZmllbGRzLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBpbmRleGVzOiBkYXRhLmluZGV4ZXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKS50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgY29uc3Qgb25lU2NoZW1hID0gYWxsU2NoZW1hcy5maW5kKHNjaGVtYSA9PiBzY2hlbWEuY2xhc3NOYW1lID09PSBjbGFzc05hbWUpO1xuICAgICAgaWYgKCFvbmVTY2hlbWEpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gb25lU2NoZW1hO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbmV3IGNsYXNzIHRoYXQgaW5jbHVkZXMgdGhlIHRocmVlIGRlZmF1bHQgZmllbGRzLlxuICAvLyBBQ0wgaXMgYW4gaW1wbGljaXQgY29sdW1uIHRoYXQgZG9lcyBub3QgZ2V0IGFuIGVudHJ5IGluIHRoZVxuICAvLyBfU0NIRU1BUyBkYXRhYmFzZS4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZVxuICAvLyBjcmVhdGVkIHNjaGVtYSwgaW4gbW9uZ28gZm9ybWF0LlxuICAvLyBvbiBzdWNjZXNzLCBhbmQgcmVqZWN0cyB3aXRoIGFuIGVycm9yIG9uIGZhaWwuIEVuc3VyZSB5b3VcbiAgLy8gaGF2ZSBhdXRob3JpemF0aW9uIChtYXN0ZXIga2V5LCBvciBjbGllbnQgY2xhc3MgY3JlYXRpb25cbiAgLy8gZW5hYmxlZCkgYmVmb3JlIGNhbGxpbmcgdGhpcyBmdW5jdGlvbi5cbiAgYXN5bmMgYWRkQ2xhc3NJZk5vdEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSA9IHt9XG4gICk6IFByb21pc2U8dm9pZCB8IFNjaGVtYT4ge1xuICAgIHZhciB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgaWYgKHZhbGlkYXRpb25FcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh2YWxpZGF0aW9uRXJyb3IuY29kZSAmJiB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFkYXB0ZXJTY2hlbWEgPSBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuY3JlYXRlQ2xhc3MoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSh7XG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEoYWRhcHRlclNjaGVtYSk7XG4gICAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZUNsYXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEZpZWxkc1tuYW1lXTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJlxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0udHlwZSAhPT0gZmllbGQudHlwZSAmJlxuICAgICAgICAgICAgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZSdcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3JwZXJtO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3dwZXJtO1xuICAgICAgICBjb25zdCBuZXdTY2hlbWEgPSBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkcywgc3VibWl0dGVkRmllbGRzKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdEZpZWxkcyA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwgZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQ7XG4gICAgICAgIGNvbnN0IGZ1bGxOZXdTY2hlbWEgPSBPYmplY3QuYXNzaWduKHt9LCBuZXdTY2hlbWEsIGRlZmF1bHRGaWVsZHMpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgbmV3U2NoZW1hLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBPYmplY3Qua2V5cyhleGlzdGluZ0ZpZWxkcylcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpbmFsbHkgd2UgaGF2ZSBjaGVja2VkIHRvIG1ha2Ugc3VyZSB0aGUgcmVxdWVzdCBpcyB2YWxpZCBhbmQgd2UgY2FuIHN0YXJ0IGRlbGV0aW5nIGZpZWxkcy5cbiAgICAgICAgLy8gRG8gYWxsIGRlbGV0aW9ucyBmaXJzdCwgdGhlbiBhIHNpbmdsZSBzYXZlIHRvIF9TQ0hFTUEgY29sbGVjdGlvbiB0byBoYW5kbGUgYWxsIGFkZGl0aW9ucy5cbiAgICAgICAgY29uc3QgZGVsZXRlZEZpZWxkczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgY29uc3QgaW5zZXJ0ZWRGaWVsZHMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICBkZWxldGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5zZXJ0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGRlbGV0ZVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgaWYgKGRlbGV0ZWRGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGRlbGV0ZVByb21pc2UgPSB0aGlzLmRlbGV0ZUZpZWxkcyhkZWxldGVkRmllbGRzLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgZW5mb3JjZUZpZWxkcyA9IFtdO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIGRlbGV0ZVByb21pc2UgLy8gRGVsZXRlIEV2ZXJ5dGhpbmdcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpIC8vIFJlbG9hZCBvdXIgU2NoZW1hLCBzbyB3ZSBoYXZlIGFsbCB0aGUgbmV3IHZhbHVlc1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IGluc2VydGVkRmllbGRzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgICAgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBuZXdTY2hlbWEpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgIHRoaXMuX2RiQWRhcHRlci5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBmdWxsTmV3U2NoZW1hXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgICAgICAvL1RPRE86IE1vdmUgdGhpcyBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuICAgICAgICAgICAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgICAgICAgY29uc3QgcmVsb2FkZWRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHJlbG9hZGVkU2NoZW1hLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gcmVsb2FkZWRTY2hlbWE7XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3Qgb3IgZmFpbHMgd2l0aCBhIHJlYXNvbi5cbiAgZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cbiAgICAvLyBXZSBkb24ndCBoYXZlIHRoaXMgY2xhc3MuIFVwZGF0ZSB0aGUgc2NoZW1hXG4gICAgcmV0dXJuIChcbiAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIHN1Y2NlZWRlZC4gUmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgIHRoaXMuYWRkQ2xhc3NJZk5vdEV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHRcbiAgICAgICAgICAvLyBoYXZlIGZhaWxlZCBiZWNhdXNlIHRoZXJlJ3MgYSByYWNlIGNvbmRpdGlvbiBhbmQgYSBkaWZmZXJlbnRcbiAgICAgICAgICAvLyBjbGllbnQgaXMgbWFraW5nIHRoZSBleGFjdCBzYW1lIHNjaGVtYSB1cGRhdGUgdGhhdCB3ZSB3YW50LlxuICAgICAgICAgIC8vIFNvIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWEuXG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2NoZW1hIG5vdyB2YWxpZGF0ZXNcbiAgICAgICAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgRmFpbGVkIHRvIGFkZCAke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBzdGlsbCBkb2Vzbid0IHZhbGlkYXRlLiBHaXZlIHVwXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ3NjaGVtYSBjbGFzcyBuYW1lIGRvZXMgbm90IHJldmFsaWRhdGUnKTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnkpOiBhbnkge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICB9XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgZXJyb3I6IGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSksXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgW10pO1xuICB9XG5cbiAgdmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgIGV4aXN0aW5nRmllbGROYW1lczogQXJyYXk8c3RyaW5nPlxuICApIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICAgIGlmIChleGlzdGluZ0ZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBlcnJvcjogJ2ludmFsaWQgZmllbGQgbmFtZTogJyArIGZpZWxkTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiAxMzYsXG4gICAgICAgICAgICBlcnJvcjogJ2ZpZWxkICcgKyBmaWVsZE5hbWUgKyAnIGNhbm5vdCBiZSBhZGRlZCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgY29uc3QgZXJyb3IgPSBmaWVsZFR5cGVJc0ludmFsaWQoZmllbGRUeXBlKTtcbiAgICAgICAgaWYgKGVycm9yKSByZXR1cm4geyBjb2RlOiBlcnJvci5jb2RlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICBpZiAoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdkZWZhdWx0IHZhbHVlJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZmllbGRUeXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZVxuICAgICAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUucmVxdWlyZWQpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAncmVxdWlyZWQnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdKSB7XG4gICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXTtcbiAgICB9XG5cbiAgICBjb25zdCBnZW9Qb2ludHMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLmZpbHRlcihcbiAgICAgIGtleSA9PiBmaWVsZHNba2V5XSAmJiBmaWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgICBpZiAoZ2VvUG9pbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBlcnJvcjpcbiAgICAgICAgICAnY3VycmVudGx5LCBvbmx5IG9uZSBHZW9Qb2ludCBmaWVsZCBtYXkgZXhpc3QgaW4gYW4gb2JqZWN0LiBBZGRpbmcgJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzFdICtcbiAgICAgICAgICAnIHdoZW4gJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzBdICtcbiAgICAgICAgICAnIGFscmVhZHkgZXhpc3RzLicsXG4gICAgICB9O1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkcywgdGhpcy51c2VySWRSZWdFeCk7XG4gIH1cblxuICAvLyBTZXRzIHRoZSBDbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBmb3IgYSBnaXZlbiBjbGFzc05hbWUsIHdoaWNoIG11c3QgZXhpc3QuXG4gIGFzeW5jIHNldFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBwZXJtczogYW55LCBuZXdTY2hlbWE6IFNjaGVtYUZpZWxkcykge1xuICAgIGlmICh0eXBlb2YgcGVybXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKHBlcm1zLCBuZXdTY2hlbWEsIHRoaXMudXNlcklkUmVnRXgpO1xuICAgIGF3YWl0IHRoaXMuX2RiQWRhcHRlci5zZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lLCBwZXJtcyk7XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgY2FjaGVkLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHBlcm1zO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyB8IFNjaGVtYUZpZWxkLFxuICAgIGlzVmFsaWRhdGlvbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICAvLyBzdWJkb2N1bWVudCBrZXkgKHgueSkgPT4gb2sgaWYgeCBpcyBvZiB0eXBlICdvYmplY3QnXG4gICAgICBmaWVsZE5hbWUgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICAgIHR5cGUgPSAnT2JqZWN0JztcbiAgICB9XG4gICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gKTtcbiAgICB9XG5cbiAgICAvLyBJZiBzb21lb25lIHRyaWVzIHRvIGNyZWF0ZSBhIG5ldyBmaWVsZCB3aXRoIG51bGwvdW5kZWZpbmVkIGFzIHRoZSB2YWx1ZSwgcmV0dXJuO1xuICAgIGlmICghdHlwZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgdHlwZSA9ICh7IHR5cGUgfTogU2NoZW1hRmllbGQpO1xuICAgIH1cblxuICAgIGlmICh0eXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUodHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKHR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgdHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHBlY3RlZFR5cGUpIHtcbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICBleHBlY3RlZFR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKHR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIElmIHR5cGUgb3B0aW9ucyBkbyBub3QgY2hhbmdlXG4gICAgICAvLyB3ZSBjYW4gc2FmZWx5IHJldHVyblxuICAgICAgaWYgKGlzVmFsaWRhdGlvbiB8fCBKU09OLnN0cmluZ2lmeShleHBlY3RlZFR5cGUpID09PSBKU09OLnN0cmluZ2lmeSh0eXBlKSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLy8gRmllbGQgb3B0aW9ucyBhcmUgbWF5IGJlIGNoYW5nZWRcbiAgICAgIC8vIGVuc3VyZSB0byBoYXZlIGFuIHVwZGF0ZSB0byBkYXRlIHNjaGVtYSBmaWVsZFxuICAgICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlci51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUpIHtcbiAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCB3ZSB0aHJvdyBlcnJvcnMgd2hlbiBpdCBpcyBhcHByb3ByaWF0ZSB0byBkbyBzby5cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0IGhhdmUgYmVlbiBhIHJhY2VcbiAgICAgICAgLy8gY29uZGl0aW9uIHdoZXJlIGFub3RoZXIgY2xpZW50IHVwZGF0ZWQgdGhlIHNjaGVtYSBpbiB0aGUgc2FtZVxuICAgICAgICAvLyB3YXkgdGhhdCB3ZSB3YW50ZWQgdG8uIFNvLCBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICB0eXBlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cblxuICBlbnN1cmVGaWVsZHMoZmllbGRzOiBhbnkpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9ID0gZmllbGRzW2ldO1xuICAgICAgbGV0IHsgdHlwZSB9ID0gZmllbGRzW2ldO1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0eXBlID0geyB0eXBlOiB0eXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWV4cGVjdGVkVHlwZSB8fCAhZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgQ291bGQgbm90IGFkZCBmaWVsZCAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBtYWludGFpbiBjb21wYXRpYmlsaXR5XG4gIGRlbGV0ZUZpZWxkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIHJldHVybiB0aGlzLmRlbGV0ZUZpZWxkcyhbZmllbGROYW1lXSwgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gIH1cblxuICAvLyBEZWxldGUgZmllbGRzLCBhbmQgcmVtb3ZlIHRoYXQgZGF0YSBmcm9tIGFsbCBvYmplY3RzLiBUaGlzIGlzIGludGVuZGVkXG4gIC8vIHRvIHJlbW92ZSB1bnVzZWQgZmllbGRzLCBpZiBvdGhlciB3cml0ZXJzIGFyZSB3cml0aW5nIG9iamVjdHMgdGhhdCBpbmNsdWRlXG4gIC8vIHRoaXMgZmllbGQsIHRoZSBmaWVsZCBtYXkgcmVhcHBlYXIuIFJldHVybnMgYSBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aFxuICAvLyBubyBvYmplY3Qgb24gc3VjY2Vzcywgb3IgcmVqZWN0cyB3aXRoIHsgY29kZSwgZXJyb3IgfSBvbiBmYWlsdXJlLlxuICAvLyBQYXNzaW5nIHRoZSBkYXRhYmFzZSBhbmQgcHJlZml4IGlzIG5lY2Vzc2FyeSBpbiBvcmRlciB0byBkcm9wIHJlbGF0aW9uIGNvbGxlY3Rpb25zXG4gIC8vIGFuZCByZW1vdmUgZmllbGRzIGZyb20gb2JqZWN0cy4gSWRlYWxseSB0aGUgZGF0YWJhc2Ugd291bGQgYmVsb25nIHRvXG4gIC8vIGEgZGF0YWJhc2UgYWRhcHRlciBhbmQgdGhpcyBmdW5jdGlvbiB3b3VsZCBjbG9zZSBvdmVyIGl0IG9yIGFjY2VzcyBpdCB2aWEgbWVtYmVyLlxuICBkZWxldGVGaWVsZHMoZmllbGROYW1lczogQXJyYXk8c3RyaW5nPiwgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSk7XG4gICAgfVxuXG4gICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgaW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICAgIC8vRG9uJ3QgYWxsb3cgZGVsZXRpbmcgdGhlIGRlZmF1bHQgZmllbGRzLlxuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsIGBmaWVsZCAke2ZpZWxkTmFtZX0gY2Fubm90IGJlIGNoYW5nZWRgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGZhbHNlLCB7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtmaWVsZE5hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hRmllbGRzID0geyAuLi5zY2hlbWEuZmllbGRzIH07XG4gICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUZpZWxkcyhjbGFzc05hbWUsIHNjaGVtYSwgZmllbGROYW1lcykudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWFGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgICAgICAvL0ZvciByZWxhdGlvbnMsIGRyb3AgdGhlIF9Kb2luIHRhYmxlXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9iamVjdCBwcm92aWRlZCBpbiBSRVNUIGZvcm1hdC5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYSBpZiB0aGlzIG9iamVjdCBpc1xuICAvLyB2YWxpZC5cbiAgYXN5bmMgdmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAndGhlcmUgY2FuIG9ubHkgYmUgb25lIGdlb3BvaW50IGZpZWxkIGluIGEgY2xhc3MnXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmICghZXhwZWN0ZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnQUNMJykge1xuICAgICAgICAvLyBFdmVyeSBvYmplY3QgaGFzIEFDTCBpbXBsaWNpdGx5LlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHByb21pc2VzLnB1c2goc2NoZW1hLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgZXhwZWN0ZWQsIHRydWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25zdCBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcblxuICAgIGlmIChlbmZvcmNlRmllbGRzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG5cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhwcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIHRoYXQgYWxsIHRoZSBwcm9wZXJ0aWVzIGFyZSBzZXQgZm9yIHRoZSBvYmplY3RcbiAgdmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgY29sdW1ucyA9IHJlcXVpcmVkQ29sdW1ucy53cml0ZVtjbGFzc05hbWVdO1xuICAgIGlmICghY29sdW1ucyB8fCBjb2x1bW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG1pc3NpbmdDb2x1bW5zID0gY29sdW1ucy5maWx0ZXIoZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmIChvYmplY3RbY29sdW1uXSAmJiB0eXBlb2Ygb2JqZWN0W2NvbHVtbl0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gVHJ5aW5nIHRvIGRlbGV0ZSBhIHJlcXVpcmVkIGNvbHVtblxuICAgICAgICAgIHJldHVybiBvYmplY3RbY29sdW1uXS5fX29wID09ICdEZWxldGUnO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdCB0cnlpbmcgdG8gZG8gYW55dGhpbmcgdGhlcmVcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFvYmplY3RbY29sdW1uXTtcbiAgICB9KTtcblxuICAgIGlmIChtaXNzaW5nQ29sdW1ucy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIG1pc3NpbmdDb2x1bW5zWzBdICsgJyBpcyByZXF1aXJlZC4nKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgfVxuXG4gIHRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBUZXN0cyB0aGF0IHRoZSBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uIGxldCBwYXNzIHRoZSBvcGVyYXRpb24gZm9yIGEgZ2l2ZW4gYWNsR3JvdXBcbiAgc3RhdGljIHRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zOiA/YW55LCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICBpZiAocGVybXNbJyonXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHBlcm1pc3Npb25zIGFnYWluc3QgdGhlIGFjbEdyb3VwIHByb3ZpZGVkIChhcnJheSBvZiB1c2VySWQvcm9sZXMpXG4gICAgaWYgKFxuICAgICAgYWNsR3JvdXAuc29tZShhY2wgPT4ge1xuICAgICAgICByZXR1cm4gcGVybXNbYWNsXSA9PT0gdHJ1ZTtcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgc3RhdGljIHZhbGlkYXRlUGVybWlzc2lvbihcbiAgICBjbGFzc1Blcm1pc3Npb25zOiA/YW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBhY3Rpb24/OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHRoZSByZWFkVXNlckZpZWxkcyBsYXRlclxuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSAmJlxuICAgICAgY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBwb2ludGVyRmllbGRzID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHM7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykgJiYgcG9pbnRlckZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhbnkgb3AgZXhjZXB0ICdhZGRGaWVsZCBhcyBwYXJ0IG9mIGNyZWF0ZScgaXMgb2suXG4gICAgICBpZiAob3BlcmF0aW9uICE9PSAnYWRkRmllbGQnIHx8IGFjdGlvbiA9PT0gJ3VwZGF0ZScpIHtcbiAgICAgICAgLy8gV2UgY2FuIGFsbG93IGFkZGluZyBmaWVsZCBvbiB1cGRhdGUgZmxvdyBvbmx5LlxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcsIGFjdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvbixcbiAgICAgIGFjdGlvblxuICAgICk7XG4gIH1cblxuICBnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIHJldHVybiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSAmJiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBleHBlY3RlZCB0eXBlIGZvciBhIGNsYXNzTmFtZStrZXkgY29tYmluYXRpb25cbiAgLy8gb3IgdW5kZWZpbmVkIGlmIHRoZSBzY2hlbWEgaXMgbm90IHNldFxuICBnZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZXhwZWN0ZWRUeXBlID09PSAnbWFwJyA/ICdPYmplY3QnIDogZXhwZWN0ZWRUeXBlO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGlmIGEgZ2l2ZW4gY2xhc3MgaXMgaW4gdGhlIHNjaGVtYS5cbiAgaGFzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoKS50aGVuKCgpID0+ICEhdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIG5ldyBTY2hlbWEuXG5jb25zdCBsb2FkID0gKGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IGFueSk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIpO1xuICByZXR1cm4gc2NoZW1hLnJlbG9hZERhdGEob3B0aW9ucykudGhlbigoKSA9PiBzY2hlbWEpO1xufTtcblxuLy8gQnVpbGRzIGEgbmV3IHNjaGVtYSAoaW4gc2NoZW1hIEFQSSByZXNwb25zZSBmb3JtYXQpIG91dCBvZiBhblxuLy8gZXhpc3RpbmcgbW9uZ28gc2NoZW1hICsgYSBzY2hlbWFzIEFQSSBwdXQgcmVxdWVzdC4gVGhpcyByZXNwb25zZVxuLy8gZG9lcyBub3QgaW5jbHVkZSB0aGUgZGVmYXVsdCBmaWVsZHMsIGFzIGl0IGlzIGludGVuZGVkIHRvIGJlIHBhc3NlZFxuLy8gdG8gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLiBObyB2YWxpZGF0aW9uIGlzIGRvbmUgaGVyZSwgaXRcbi8vIGlzIGRvbmUgaW4gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLlxuZnVuY3Rpb24gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHM6IFNjaGVtYUZpZWxkcywgcHV0UmVxdWVzdDogYW55KTogU2NoZW1hRmllbGRzIHtcbiAgY29uc3QgbmV3U2NoZW1hID0ge307XG4gIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICBjb25zdCBzeXNTY2hlbWFGaWVsZCA9XG4gICAgT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnMpLmluZGV4T2YoZXhpc3RpbmdGaWVsZHMuX2lkKSA9PT0gLTFcbiAgICAgID8gW11cbiAgICAgIDogT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnNbZXhpc3RpbmdGaWVsZHMuX2lkXSk7XG4gIGZvciAoY29uc3Qgb2xkRmllbGQgaW4gZXhpc3RpbmdGaWVsZHMpIHtcbiAgICBpZiAoXG4gICAgICBvbGRGaWVsZCAhPT0gJ19pZCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnQUNMJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICd1cGRhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ2NyZWF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnb2JqZWN0SWQnXG4gICAgKSB7XG4gICAgICBpZiAoc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJiBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG9sZEZpZWxkKSAhPT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWVsZElzRGVsZXRlZCA9IHB1dFJlcXVlc3Rbb2xkRmllbGRdICYmIHB1dFJlcXVlc3Rbb2xkRmllbGRdLl9fb3AgPT09ICdEZWxldGUnO1xuICAgICAgaWYgKCFmaWVsZElzRGVsZXRlZCkge1xuICAgICAgICBuZXdTY2hlbWFbb2xkRmllbGRdID0gZXhpc3RpbmdGaWVsZHNbb2xkRmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IG5ld0ZpZWxkIGluIHB1dFJlcXVlc3QpIHtcbiAgICBpZiAobmV3RmllbGQgIT09ICdvYmplY3RJZCcgJiYgcHV0UmVxdWVzdFtuZXdGaWVsZF0uX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2YobmV3RmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIG5ld1NjaGVtYVtuZXdGaWVsZF0gPSBwdXRSZXF1ZXN0W25ld0ZpZWxkXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ld1NjaGVtYTtcbn1cblxuLy8gR2l2ZW4gYSBzY2hlbWEgcHJvbWlzZSwgY29uc3RydWN0IGFub3RoZXIgc2NoZW1hIHByb21pc2UgdGhhdFxuLy8gdmFsaWRhdGVzIHRoaXMgZmllbGQgb25jZSB0aGUgc2NoZW1hIGxvYWRzLlxuZnVuY3Rpb24gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHNjaGVtYVByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSkge1xuICByZXR1cm4gc2NoZW1hUHJvbWlzZS50aGVuKHNjaGVtYSA9PiB7XG4gICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9KTtcbn1cblxuLy8gR2V0cyB0aGUgdHlwZSBmcm9tIGEgUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdCwgd2hlcmUgJ3R5cGUnIGlzXG4vLyBleHRlbmRlZCBwYXN0IGphdmFzY3JpcHQgdHlwZXMgdG8gaW5jbHVkZSB0aGUgcmVzdCBvZiB0aGUgUGFyc2Vcbi8vIHR5cGUgc3lzdGVtLlxuLy8gVGhlIG91dHB1dCBzaG91bGQgYmUgYSB2YWxpZCBzY2hlbWEgdmFsdWUuXG4vLyBUT0RPOiBlbnN1cmUgdGhhdCB0aGlzIGlzIGNvbXBhdGlibGUgd2l0aCB0aGUgZm9ybWF0IHVzZWQgaW4gT3BlbiBEQlxuZnVuY3Rpb24gZ2V0VHlwZShvYmo6IGFueSk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBvYmo7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdCb29sZWFuJztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuICdTdHJpbmcnO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iaik7XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ2JhZCBvYmo6ICcgKyBvYmo7XG4gIH1cbn1cblxuLy8gVGhpcyBnZXRzIHRoZSB0eXBlIGZvciBub24tSlNPTiB0eXBlcyBsaWtlIHBvaW50ZXJzIGFuZCBmaWxlcywgYnV0XG4vLyBhbHNvIGdldHMgdGhlIGFwcHJvcHJpYXRlIHR5cGUgZm9yICQgb3BlcmF0b3JzLlxuLy8gUmV0dXJucyBudWxsIGlmIHRoZSB0eXBlIGlzIHVua25vd24uXG5mdW5jdGlvbiBnZXRPYmplY3RUeXBlKG9iaik6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuICdBcnJheSc7XG4gIH1cbiAgaWYgKG9iai5fX3R5cGUpIHtcbiAgICBzd2l0Y2ggKG9iai5fX3R5cGUpIHtcbiAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICBpZiAob2JqLm5hbWUpIHtcbiAgICAgICAgICByZXR1cm4gJ0ZpbGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgIGlmIChvYmouaXNvKSB7XG4gICAgICAgICAgcmV0dXJuICdEYXRlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgaWYgKG9iai5sYXRpdHVkZSAhPSBudWxsICYmIG9iai5sb25naXR1ZGUgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBpZiAob2JqLmJhc2U2NCkge1xuICAgICAgICAgIHJldHVybiAnQnl0ZXMnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUG9seWdvbic6XG4gICAgICAgIGlmIChvYmouY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICByZXR1cm4gJ1BvbHlnb24nO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsICdUaGlzIGlzIG5vdCBhIHZhbGlkICcgKyBvYmouX190eXBlKTtcbiAgfVxuICBpZiAob2JqWyckbmUnXSkge1xuICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9ialsnJG5lJ10pO1xuICB9XG4gIGlmIChvYmouX19vcCkge1xuICAgIHN3aXRjaCAob2JqLl9fb3ApIHtcbiAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgY2FzZSAnQWRkJzpcbiAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICByZXR1cm4gJ0FycmF5JztcbiAgICAgIGNhc2UgJ0FkZFJlbGF0aW9uJzpcbiAgICAgIGNhc2UgJ1JlbW92ZVJlbGF0aW9uJzpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIHRhcmdldENsYXNzOiBvYmoub2JqZWN0c1swXS5jbGFzc05hbWUsXG4gICAgICAgIH07XG4gICAgICBjYXNlICdCYXRjaCc6XG4gICAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iai5vcHNbMF0pO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgJ3VuZXhwZWN0ZWQgb3A6ICcgKyBvYmouX19vcDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICdPYmplY3QnO1xufVxuXG5leHBvcnQge1xuICBsb2FkLFxuICBjbGFzc05hbWVJc1ZhbGlkLFxuICBmaWVsZE5hbWVJc1ZhbGlkLFxuICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSxcbiAgYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QsXG4gIHN5c3RlbUNsYXNzZXMsXG4gIGRlZmF1bHRDb2x1bW5zLFxuICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hLFxuICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICBTY2hlbWFDb250cm9sbGVyLFxuICByZXF1aXJlZENvbHVtbnMsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBa0JBOztBQUNBOztBQUNBOztBQUNBOztBQUVBOzs7Ozs7Ozs7Ozs7QUF0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JELEtBQXBDOztBQWVBLE1BQU1FLGNBQTBDLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO0VBQy9EO0VBQ0FDLFFBQVEsRUFBRTtJQUNSQyxRQUFRLEVBQUU7TUFBRUMsSUFBSSxFQUFFO0lBQVIsQ0FERjtJQUVSQyxTQUFTLEVBQUU7TUFBRUQsSUFBSSxFQUFFO0lBQVIsQ0FGSDtJQUdSRSxTQUFTLEVB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