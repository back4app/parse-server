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
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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

// -disable-next

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
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency', '_ExportProgress']);

// Anything that start with role
const roleRegex = /^role:.*/;
// Anything that starts with userField (allowed for protected fields only)
const protectedFieldsPointerRegex = /^userField:.*/;
// * permission
const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/;

// regex for validating entities in protectedFields object
const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]);

// clp regex
const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);
function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId depends on startup options so it's dynamic
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
  }

  // userId regex depends on launch options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']);

// validation before setting class-level permissions on collection
function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }
  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }
    const operation = perms[operationKey];
    // proceed with next operationKey

    // throws when root fields are of wrong type
    validateCLPjson(operation, operationKey);
    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      }
      // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey
      continue;
    }

    // validate protected fields
    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];
        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        }

        // if the field is in form of array
        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          }
          // field should exist on collection
          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      }
      // proceed with next operationKey
      continue;
    }

    // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users
    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp);

      // entity can be either:
      // "pointerFields": string[]
      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];
        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        }
        // proceed with next entity key
        continue;
      }

      // or [entity]: boolean
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
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key
function fieldNameIsValid(fieldName, className) {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }
  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
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
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon'];
// Returns an error suitable for throwing if the type is invalid
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
    });

    // Inject the in-memory classes
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
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
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
  }

  // Create a new class that includes the three default fields.
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
      }));
      // TODO: Remove by updating schema cache directly
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
      }

      // Finally we have checked to make sure the request is valid and we can start deleting fields.
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
      }))
      //TODO: Move this logic into the database adapter
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
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    }
    // We don't have this class. Update the schema
    return (
      // The schema update succeeded. Reload the schema
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
  }

  // Sets the Class-level permissions for a given className, which must exist.
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
  }

  // Returns a promise that resolves successfully to the new schema
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
    }

    // If someone tries to create a new field with null/undefined as the value, return;
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
      // If type options do not change
      // we can safely return
      if (isValidation || JSON.stringify(expectedType) === JSON.stringify(type)) {
        return undefined;
      }
      // Field options are may be changed
      // ensure to have an update to date schema field
      return this._dbAdapter.updateFieldOptions(className, fieldName, type);
    }
    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      }
      // The update failed. This can be okay - it might have been a race
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
  }

  // maintain compatibility
  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  }

  // Delete fields, and remove that data from all objects. This is intended
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
      }
      //Don't allow deleting the default fields.
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
  }

  // Validates an object provided in REST format.
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
  }

  // Validates that all the properties are set for the object
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
        }
        // Not trying to do anything there
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
  }

  // Tests that the class level permission let pass the operation for a given aclGroup
  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    if (perms['*']) {
      return true;
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }
    return false;
  }

  // Validates an operation passes class-level-permissions set in the schema
  static validatePermission(classPermissions, className, aclGroup, operation, action) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      }
      // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'
      return Promise.resolve();
    }

    // No matching CLP, let's check the Pointer permissions
    // And handle those later
    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    // Reject create when write lockdown
    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    }

    // Process the readUserFields later
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
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
  }
  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  }

  // Returns the expected type for a className+key combination
  // or undefined if the schema is not set
  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }
    return undefined;
  }

  // Checks if a given class is in the schema.
  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }
    return this.reloadData().then(() => !!this.schemaData[className]);
  }
}

// Returns a promise for a new Schema.
exports.SchemaController = exports.default = SchemaController;
const load = (dbAdapter, options) => {
  const schema = new SchemaController(dbAdapter);
  return schema.reloadData(options).then(() => schema);
};

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
exports.load = load;
function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {};
  // -disable-next
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
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
}

// Gets the type from a REST API formatted object, where 'type' is
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
}

// This gets the type for non-JSON types like pointers and files, but
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJfRXhwb3J0UHJvZ3Jlc3MiLCJpZCIsIm1hc3RlcktleSIsImFwcGxpY2F0aW9uSWQiLCJleHBvcnRzIiwicmVxdWlyZWRDb2x1bW5zIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJpbmNsdWRlcyIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiX3JlZiIsImluZGV4ZXMiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZGVlcGNvcHkiLCJjbGFzc1Byb3RlY3RlZEZpZWxkcyIsInVucSIsIlNldCIsImZyb20iLCJkZWZhdWx0U2NoZW1hIiwiX0hvb2tzU2NoZW1hIiwiX0dsb2JhbENvbmZpZ1NjaGVtYSIsIl9HcmFwaFFMQ29uZmlnU2NoZW1hIiwiX1B1c2hTdGF0dXNTY2hlbWEiLCJfSm9iU3RhdHVzU2NoZW1hIiwiX0pvYlNjaGVkdWxlU2NoZW1hIiwiX0F1ZGllbmNlU2NoZW1hIiwiX0lkZW1wb3RlbmN5U2NoZW1hIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsImRiVHlwZU1hdGNoZXNPYmplY3RUeXBlIiwiZGJUeXBlIiwib2JqZWN0VHlwZSIsInR5cGVUb1N0cmluZyIsIlNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJfZGJBZGFwdGVyIiwic2NoZW1hRGF0YSIsIlNjaGVtYUNhY2hlIiwiYWxsIiwiQ29uZmlnIiwiY3VzdG9tSWRzIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsImN1c3RvbUlkUmVnRXgiLCJhdXRvSWRSZWdFeCIsInVzZXJJZFJlZ0V4Iiwid2F0Y2giLCJyZWxvYWREYXRhIiwiY2xlYXJDYWNoZSIsIm9wdGlvbnMiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImNhY2hlZCIsIlByb21pc2UiLCJyZXNvbHZlIiwibWFwIiwicHV0IiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJjbGVhciIsIm9uZVNjaGVtYSIsImZpbmQiLCJyZWplY3QiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwidmFsaWRhdGlvbkVycm9yIiwidmFsaWRhdGVOZXdDbGFzcyIsImNvZGUiLCJlcnJvciIsImFkYXB0ZXJTY2hlbWEiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiRFVQTElDQVRFX1ZBTFVFIiwidXBkYXRlQ2xhc3MiLCJzdWJtaXR0ZWRGaWVsZHMiLCJkYXRhYmFzZSIsImV4aXN0aW5nRmllbGRzIiwiX19vcCIsIm5ld1NjaGVtYSIsImJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0IiwiZGVmYXVsdEZpZWxkcyIsImZ1bGxOZXdTY2hlbWEiLCJ2YWxpZGF0ZVNjaGVtYURhdGEiLCJkZWxldGVkRmllbGRzIiwiaW5zZXJ0ZWRGaWVsZHMiLCJkZWxldGVQcm9taXNlIiwiZGVsZXRlRmllbGRzIiwiZW5mb3JjZUZpZWxkcyIsInByb21pc2VzIiwiZW5mb3JjZUZpZWxkRXhpc3RzIiwicmVzdWx0cyIsInJlc3VsdCIsInNldFBlcm1pc3Npb25zIiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJlbnN1cmVGaWVsZHMiLCJyZWxvYWRlZFNjaGVtYSIsImNhdGNoIiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiZXhpc3RpbmdGaWVsZE5hbWVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpZWxkVHlwZSIsImRlZmF1bHRWYWx1ZSIsImRlZmF1bHRWYWx1ZVR5cGUiLCJnZXRUeXBlIiwicmVxdWlyZWQiLCJnZW9Qb2ludHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1ZhbGlkYXRpb24iLCJzcGxpdCIsImV4cGVjdGVkVHlwZSIsImdldEV4cGVjdGVkVHlwZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiZGVsZXRlRmllbGQiLCJmaWVsZE5hbWVzIiwic2NoZW1hRmllbGRzIiwiYWRhcHRlciIsImRlbGV0ZUNsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJnZW9jb3VudCIsImV4cGVjdGVkIiwicHJvbWlzZSIsInRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsInZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwiY29sdW1ucyIsIm1pc3NpbmdDb2x1bW5zIiwiY29sdW1uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwiYWNsR3JvdXAiLCJ0ZXN0UGVybWlzc2lvbnMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJjbGFzc1Blcm1pc3Npb25zIiwic29tZSIsImFjbCIsInZhbGlkYXRlUGVybWlzc2lvbiIsImFjdGlvbiIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwZXJtaXNzaW9uRmllbGQiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiaGFzQ2xhc3MiLCJsb2FkIiwiZGJBZGFwdGVyIiwicHV0UmVxdWVzdCIsInN5c1NjaGVtYUZpZWxkIiwiX2lkIiwib2xkRmllbGQiLCJmaWVsZElzRGVsZXRlZCIsIm5ld0ZpZWxkIiwic2NoZW1hUHJvbWlzZSIsImdldE9iamVjdFR5cGUiLCJfX3R5cGUiLCJpc28iLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImJhc2U2NCIsImNvb3JkaW5hdGVzIiwib2JqZWN0cyIsIm9wcyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBUaGlzIGNsYXNzIGhhbmRsZXMgc2NoZW1hIHZhbGlkYXRpb24sIHBlcnNpc3RlbmNlLCBhbmQgbW9kaWZpY2F0aW9uLlxuLy9cbi8vIEVhY2ggaW5kaXZpZHVhbCBTY2hlbWEgb2JqZWN0IHNob3VsZCBiZSBpbW11dGFibGUuIFRoZSBoZWxwZXJzIHRvXG4vLyBkbyB0aGluZ3Mgd2l0aCB0aGUgU2NoZW1hIGp1c3QgcmV0dXJuIGEgbmV3IHNjaGVtYSB3aGVuIHRoZSBzY2hlbWFcbi8vIGlzIGNoYW5nZWQuXG4vL1xuLy8gVGhlIGNhbm9uaWNhbCBwbGFjZSB0byBzdG9yZSB0aGlzIFNjaGVtYSBpcyBpbiB0aGUgZGF0YWJhc2UgaXRzZWxmLFxuLy8gaW4gYSBfU0NIRU1BIGNvbGxlY3Rpb24uIFRoaXMgaXMgbm90IHRoZSByaWdodCB3YXkgdG8gZG8gaXQgZm9yIGFuXG4vLyBvcGVuIHNvdXJjZSBmcmFtZXdvcmssIGJ1dCBpdCdzIGJhY2t3YXJkIGNvbXBhdGlibGUsIHNvIHdlJ3JlXG4vLyBrZWVwaW5nIGl0IHRoaXMgd2F5IGZvciBub3cuXG4vL1xuLy8gSW4gQVBJLWhhbmRsaW5nIGNvZGUsIHlvdSBzaG91bGQgb25seSB1c2UgdGhlIFNjaGVtYSBjbGFzcyB2aWEgdGhlXG4vLyBEYXRhYmFzZUNvbnRyb2xsZXIuIFRoaXMgd2lsbCBsZXQgdXMgcmVwbGFjZSB0aGUgc2NoZW1hIGxvZ2ljIGZvclxuLy8gZGlmZmVyZW50IGRhdGFiYXNlcy5cbi8vIFRPRE86IGhpZGUgYWxsIHNjaGVtYSBsb2dpYyBpbnNpZGUgdGhlIGRhdGFiYXNlIGFkYXB0ZXIuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCB0eXBlIHtcbiAgU2NoZW1hLFxuICBTY2hlbWFGaWVsZHMsXG4gIENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgU2NoZW1hRmllbGQsXG4gIExvYWRTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL3R5cGVzJztcblxuY29uc3QgZGVmYXVsdENvbHVtbnM6IHsgW3N0cmluZ106IFNjaGVtYUZpZWxkcyB9ID0gT2JqZWN0LmZyZWV6ZSh7XG4gIC8vIENvbnRhaW4gdGhlIGRlZmF1bHQgY29sdW1ucyBmb3IgZXZlcnkgcGFyc2Ugb2JqZWN0IHR5cGUgKGV4Y2VwdCBfSm9pbiBjb2xsZWN0aW9uKVxuICBfRGVmYXVsdDoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY3JlYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHVwZGF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBBQ0w6IHsgdHlwZTogJ0FDTCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1VzZXIgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Vc2VyOiB7XG4gICAgdXNlcm5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXNzd29yZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWxWZXJpZmllZDogeyB0eXBlOiAnQm9vbGVhbicgfSxcbiAgICBhdXRoRGF0YTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfSW5zdGFsbGF0aW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfSW5zdGFsbGF0aW9uOiB7XG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXZpY2VUb2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNoYW5uZWxzOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICBkZXZpY2VUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcHVzaFR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBHQ01TZW5kZXJJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRpbWVab25lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbG9jYWxlSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGJhZGdlOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgYXBwVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyc2VWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Sb2xlIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfUm9sZToge1xuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1c2VyczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIHJvbGVzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1JvbGUnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9TZXNzaW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfU2Vzc2lvbjoge1xuICAgIHVzZXI6IHsgdHlwZTogJ1BvaW50ZXInLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc2Vzc2lvblRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlc0F0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIGNyZWF0ZWRXaXRoOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9Qcm9kdWN0OiB7XG4gICAgcHJvZHVjdElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkb3dubG9hZDogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBkb3dubG9hZE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpY29uOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIG9yZGVyOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdWJ0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfUHVzaFN0YXR1czoge1xuICAgIHB1c2hUaW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHJlc3Qgb3Igd2VidWlcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBxdWVyeVxuICAgIHBheWxvYWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcGF5bG9hZCxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyeTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGV4cGlyYXRpb25faW50ZXJ2YWw6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBudW1TZW50OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgbnVtRmFpbGVkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcHVzaEhhc2g6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlcnJvck1lc3NhZ2U6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgY291bnQ6IHsgdHlwZTogJ051bWJlcicgfSwgLy8gdHJhY2tzICMgb2YgYmF0Y2hlcyBxdWV1ZWQgYW5kIHBlbmRpbmdcbiAgfSxcbiAgX0pvYlN0YXR1czoge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBtZXNzYWdlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sIC8vIHBhcmFtcyByZWNlaXZlZCB3aGVuIGNhbGxpbmcgdGhlIGpvYlxuICAgIGZpbmlzaGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG4gIF9Kb2JTY2hlZHVsZToge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXJ0QWZ0ZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkYXlzT2ZXZWVrOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICB0aW1lT2ZEYXk6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsYXN0UnVuOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcmVwZWF0TWludXRlczogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSG9va3M6IHtcbiAgICBmdW5jdGlvbk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjbGFzc05hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0cmlnZ2VyTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVybDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfR2xvYmFsQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBtYXN0ZXJLZXlPbmx5OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9HcmFwaFFMQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjb25maWc6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0F1ZGllbmNlOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy9zdG9yaW5nIHF1ZXJ5IGFzIEpTT04gc3RyaW5nIHRvIHByZXZlbnQgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiIGVycm9yXG4gICAgbGFzdFVzZWQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdGltZXNVc2VkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9JZGVtcG90ZW5jeToge1xuICAgIHJlcUlkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlOiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfRXhwb3J0UHJvZ3Jlc3M6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGlkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWFzdGVyS2V5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwbGljYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IHJlcXVpcmVkQ29sdW1ucyA9IE9iamVjdC5mcmVlemUoe1xuICBfUHJvZHVjdDogWydwcm9kdWN0SWRlbnRpZmllcicsICdpY29uJywgJ29yZGVyJywgJ3RpdGxlJywgJ3N1YnRpdGxlJ10sXG4gIF9Sb2xlOiBbJ25hbWUnLCAnQUNMJ10sXG59KTtcblxuY29uc3QgaW52YWxpZENvbHVtbnMgPSBbJ2xlbmd0aCddO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuICAnX0V4cG9ydFByb2dyZXNzJyxcbl0pO1xuXG5jb25zdCB2b2xhdGlsZUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0hvb2tzJyxcbiAgJ19HbG9iYWxDb25maWcnLFxuICAnX0dyYXBoUUxDb25maWcnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuICAnX0V4cG9ydFByb2dyZXNzJyxcbl0pO1xuXG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkIChhbGxvd2VkIGZvciBwcm90ZWN0ZWQgZmllbGRzIG9ubHkpXG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXggPSAvXnVzZXJGaWVsZDouKi87XG4vLyAqIHBlcm1pc3Npb25cbmNvbnN0IHB1YmxpY1JlZ2V4ID0gL15cXCokLztcblxuY29uc3QgYXV0aGVudGljYXRlZFJlZ2V4ID0gL15hdXRoZW50aWNhdGVkJC87XG5cbmNvbnN0IHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBjbHBQb2ludGVyUmVnZXggPSAvXnBvaW50ZXJGaWVsZHMkLztcblxuLy8gcmVnZXggZm9yIHZhbGlkYXRpbmcgZW50aXRpZXMgaW4gcHJvdGVjdGVkRmllbGRzIG9iamVjdFxuY29uc3QgcHJvdGVjdGVkRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgYXV0aGVudGljYXRlZFJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuLy8gY2xwIHJlZ2V4XG5jb25zdCBjbHBGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBjbHBQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgY2xwRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIGRlcGVuZHMgb24gc3RhcnR1cCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBwcm90ZWN0ZWRGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgcmVnZXggZGVwZW5kcyBvbiBsYXVuY2ggb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdmaW5kJyxcbiAgJ2NvdW50JyxcbiAgJ2dldCcsXG4gICdjcmVhdGUnLFxuICAndXBkYXRlJyxcbiAgJ2RlbGV0ZScsXG4gICdhZGRGaWVsZCcsXG4gICdyZWFkVXNlckZpZWxkcycsXG4gICd3cml0ZVVzZXJGaWVsZHMnLFxuICAncHJvdGVjdGVkRmllbGRzJyxcbl0pO1xuXG4vLyB2YWxpZGF0aW9uIGJlZm9yZSBzZXR0aW5nIGNsYXNzLWxldmVsIHBlcm1pc3Npb25zIG9uIGNvbGxlY3Rpb25cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQKHBlcm1zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkczogU2NoZW1hRmllbGRzLCB1c2VySWRSZWdFeHA6IFJlZ0V4cCkge1xuICBpZiAoIXBlcm1zKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qgb3BlcmF0aW9uS2V5IGluIHBlcm1zKSB7XG4gICAgaWYgKENMUFZhbGlkS2V5cy5pbmRleE9mKG9wZXJhdGlvbktleSkgPT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJHtvcGVyYXRpb25LZXl9IGlzIG5vdCBhIHZhbGlkIG9wZXJhdGlvbiBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG9wZXJhdGlvbiA9IHBlcm1zW29wZXJhdGlvbktleV07XG4gICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG5cbiAgICAvLyB0aHJvd3Mgd2hlbiByb290IGZpZWxkcyBhcmUgb2Ygd3JvbmcgdHlwZVxuICAgIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb24sIG9wZXJhdGlvbktleSk7XG5cbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICAgIC8vIHZhbGlkYXRlIGdyb3VwZWQgcG9pbnRlciBwZXJtaXNzaW9uc1xuICAgICAgLy8gbXVzdCBiZSBhbiBhcnJheSB3aXRoIGZpZWxkIG5hbWVzXG4gICAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiBvcGVyYXRpb24pIHtcbiAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWUsIGZpZWxkcywgb3BlcmF0aW9uS2V5KTtcbiAgICAgIH1cbiAgICAgIC8vIHJlYWRVc2VyRmllbGRzIGFuZCB3cml0ZXJVc2VyRmllbGRzIGRvIG5vdCBoYXZlIG5lc2R0ZWQgZmllbGRzXG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIHByb3RlY3RlZCBmaWVsZHNcbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncHJvdGVjdGVkRmllbGRzJykge1xuICAgICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgICB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cHJvdGVjdGVkRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIHByb3RlY3RlZEZpZWxkc1ske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgZmllbGQgaXMgaW4gZm9ybSBvZiBhcnJheVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgIC8vIGRvIG5vdCBhbGxvb3cgdG8gcHJvdGVjdCBkZWZhdWx0IGZpZWxkc1xuICAgICAgICAgIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZF0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRGVmYXVsdCBmaWVsZCAnJHtmaWVsZH0nIGNhbiBub3QgYmUgcHJvdGVjdGVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZmllbGQgc2hvdWxkIGV4aXN0IG9uIGNvbGxlY3Rpb25cbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGZpZWxkKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBGaWVsZCAnJHtmaWVsZH0nIGluIHByb3RlY3RlZEZpZWxkczoke2VudGl0eX0gZG9lcyBub3QgZXhpc3RgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBvdGhlciBmaWVsZHNcbiAgICAvLyBFbnRpdHkgY2FuIGJlOlxuICAgIC8vIFwiKlwiIC0gUHVibGljLFxuICAgIC8vIFwicmVxdWlyZXNBdXRoZW50aWNhdGlvblwiIC0gYXV0aGVudGljYXRlZCB1c2VycyxcbiAgICAvLyBcIm9iamVjdElkXCIgLSBfVXNlciBpZCxcbiAgICAvLyBcInJvbGU6cm9sZW5hbWVcIixcbiAgICAvLyBcInBvaW50ZXJGaWVsZHNcIiAtIGFycmF5IG9mIGZpZWxkIG5hbWVzIGNvbnRhaW5pbmcgcG9pbnRlcnMgdG8gdXNlcnNcbiAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgLy8gZW50aXR5IGNhbiBiZSBlaXRoZXI6XG4gICAgICAvLyBcInBvaW50ZXJGaWVsZHNcIjogc3RyaW5nW11cbiAgICAgIGlmIChlbnRpdHkgPT09ICdwb2ludGVyRmllbGRzJykge1xuICAgICAgICBjb25zdCBwb2ludGVyRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHBvaW50ZXJGaWVsZCBvZiBwb2ludGVyRmllbGRzKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKHBvaW50ZXJGaWVsZCwgZmllbGRzLCBvcGVyYXRpb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cG9pbnRlckZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciAke29wZXJhdGlvbktleX1bJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IGVudGl0eSBrZXlcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIG9yIFtlbnRpdHldOiBib29sZWFuXG4gICAgICBjb25zdCBwZXJtaXQgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgaWYgKHBlcm1pdCAhPT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9OiR7ZW50aXR5fToke3Blcm1pdH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb246IGFueSwgb3BlcmF0aW9uS2V5OiBzdHJpbmcpIHtcbiAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gYXJyYXlgXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIG9wZXJhdGlvbiA9PT0gJ29iamVjdCcgJiYgb3BlcmF0aW9uICE9PSBudWxsKSB7XG4gICAgICAvLyBvayB0byBwcm9jZWVkXG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gb2JqZWN0YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWU6IHN0cmluZywgZmllbGRzOiBPYmplY3QsIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gIC8vIFVzZXMgY29sbGVjdGlvbiBzY2hlbWEgdG8gZW5zdXJlIHRoZSBmaWVsZCBpcyBvZiB0eXBlOlxuICAvLyAtIFBvaW50ZXI8X1VzZXI+IChwb2ludGVycylcbiAgLy8gLSBBcnJheVxuICAvL1xuICAvLyAgICBJdCdzIG5vdCBwb3NzaWJsZSB0byBlbmZvcmNlIHR5cGUgb24gQXJyYXkncyBpdGVtcyBpbiBzY2hlbWFcbiAgLy8gIHNvIHdlIGFjY2VwdCBhbnkgQXJyYXkgZmllbGQsIGFuZCBsYXRlciB3aGVuIGFwcGx5aW5nIHBlcm1pc3Npb25zXG4gIC8vICBvbmx5IGl0ZW1zIHRoYXQgYXJlIHBvaW50ZXJzIHRvIF9Vc2VyIGFyZSBjb25zaWRlcmVkLlxuICBpZiAoXG4gICAgIShcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAoKGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInICYmIGZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ0FycmF5JylcbiAgICApXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtmaWVsZE5hbWV9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICk7XG4gIH1cbn1cblxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSwgY2xhc3NOYW1lKVxuICApO1xufVxuXG4vLyBWYWxpZCBmaWVsZHMgbXVzdCBiZSBhbHBoYS1udW1lcmljLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbi8vIG11c3Qgbm90IGJlIGEgcmVzZXJ2ZWQga2V5XG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoY2xhc3NOYW1lICYmIGNsYXNzTmFtZSAhPT0gJ19Ib29rcycpIHtcbiAgICBpZiAoZmllbGROYW1lID09PSAnY2xhc3NOYW1lJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY2xhc3NBbmRGaWVsZFJlZ2V4LnRlc3QoZmllbGROYW1lKSAmJiAhaW52YWxpZENvbHVtbnMuaW5jbHVkZXMoZmllbGROYW1lKTtcbn1cblxuLy8gQ2hlY2tzIHRoYXQgaXQncyBub3QgdHJ5aW5nIHRvIGNsb2JiZXIgb25lIG9mIHRoZSBkZWZhdWx0IGZpZWxkcyBvZiB0aGUgY2xhc3MuXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2ludmFsaWQgSlNPTicpO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKHRhcmdldENsYXNzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IGRlZXBjb3B5KHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsYXNzUHJvdGVjdGVkRmllbGRzID0gdGhpcy5fX3Byb3RlY3RlZEZpZWxkc1tzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgICAgIGlmIChjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgICAgICAgLi4uKGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldIHx8IFtdKSxcbiAgICAgICAgICAgICAgICAgIC4uLmNsYXNzUHJvdGVjdGVkRmllbGRzW2tleV0sXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEluamVjdCB0aGUgaW4tbWVtb3J5IGNsYXNzZXNcbiAgICB2b2xhdGlsZUNsYXNzZXMuZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkczoge30sXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtjbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuY29uc3QgaW5qZWN0RGVmYXVsdFNjaGVtYSA9ICh7IGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIGluZGV4ZXMgfTogU2NoZW1hKSA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICBjbGFzc05hbWUsXG4gICAgZmllbGRzOiB7XG4gICAgICAuLi5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgIC4uLihkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IHt9KSxcbiAgICAgIC4uLmZpZWxkcyxcbiAgICB9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgfTtcbiAgaWYgKGluZGV4ZXMgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgZGVmYXVsdFNjaGVtYS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuICByZXR1cm4gZGVmYXVsdFNjaGVtYTtcbn07XG5cbmNvbnN0IF9Ib29rc1NjaGVtYSA9IHsgY2xhc3NOYW1lOiAnX0hvb2tzJywgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSG9va3MgfTtcbmNvbnN0IF9HbG9iYWxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HbG9iYWxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HbG9iYWxDb25maWcsXG59O1xuY29uc3QgX0dyYXBoUUxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HcmFwaFFMQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR3JhcGhRTENvbmZpZyxcbn07XG5jb25zdCBfUHVzaFN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19QdXNoU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU2NoZWR1bGVTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU2NoZWR1bGUnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfQXVkaWVuY2VTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfQXVkaWVuY2UnLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0F1ZGllbmNlLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0lkZW1wb3RlbmN5U2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0lkZW1wb3RlbmN5JyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgPSBbXG4gIF9Ib29rc1NjaGVtYSxcbiAgX0pvYlN0YXR1c1NjaGVtYSxcbiAgX0pvYlNjaGVkdWxlU2NoZW1hLFxuICBfUHVzaFN0YXR1c1NjaGVtYSxcbiAgX0dsb2JhbENvbmZpZ1NjaGVtYSxcbiAgX0dyYXBoUUxDb25maWdTY2hlbWEsXG4gIF9BdWRpZW5jZVNjaGVtYSxcbiAgX0lkZW1wb3RlbmN5U2NoZW1hLFxuXTtcblxuY29uc3QgZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUgPSAoZGJUeXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZywgb2JqZWN0VHlwZTogU2NoZW1hRmllbGQpID0+IHtcbiAgaWYgKGRiVHlwZS50eXBlICE9PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZS50YXJnZXRDbGFzcyAhPT0gb2JqZWN0VHlwZS50YXJnZXRDbGFzcykgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICBpZiAoZGJUeXBlLnR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmNvbnN0IHR5cGVUb1N0cmluZyA9ICh0eXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuICBpZiAodHlwZS50YXJnZXRDbGFzcykge1xuICAgIHJldHVybiBgJHt0eXBlLnR5cGV9PCR7dHlwZS50YXJnZXRDbGFzc30+YDtcbiAgfVxuICByZXR1cm4gYCR7dHlwZS50eXBlfWA7XG59O1xuXG4vLyBTdG9yZXMgdGhlIGVudGlyZSBzY2hlbWEgb2YgdGhlIGFwcCBpbiBhIHdlaXJkIGh5YnJpZCBmb3JtYXQgc29tZXdoZXJlIGJldHdlZW5cbi8vIHRoZSBtb25nbyBmb3JtYXQgYW5kIHRoZSBQYXJzZSBmb3JtYXQuIFNvb24sIHRoaXMgd2lsbCBhbGwgYmUgUGFyc2UgZm9ybWF0LlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2NoZW1hQ29udHJvbGxlciB7XG4gIF9kYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFEYXRhOiB7IFtzdHJpbmddOiBTY2hlbWEgfTtcbiAgcmVsb2FkRGF0YVByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIHByb3RlY3RlZEZpZWxkczogYW55O1xuICB1c2VySWRSZWdFeDogUmVnRXhwO1xuXG4gIGNvbnN0cnVjdG9yKGRhdGFiYXNlQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIpIHtcbiAgICB0aGlzLl9kYkFkYXB0ZXIgPSBkYXRhYmFzZUFkYXB0ZXI7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoU2NoZW1hQ2FjaGUuYWxsKCksIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCkucHJvdGVjdGVkRmllbGRzO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5hbGxvd0N1c3RvbU9iamVjdElkO1xuXG4gICAgY29uc3QgY3VzdG9tSWRSZWdFeCA9IC9eLnsxLH0kL3U7IC8vIDErIGNoYXJzXG4gICAgY29uc3QgYXV0b0lkUmVnRXggPSAvXlthLXpBLVowLTldezEsfSQvO1xuXG4gICAgdGhpcy51c2VySWRSZWdFeCA9IGN1c3RvbUlkcyA/IGN1c3RvbUlkUmVnRXggOiBhdXRvSWRSZWdFeDtcblxuICAgIHRoaXMuX2RiQWRhcHRlci53YXRjaCgoKSA9PiB7XG4gICAgICB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVsb2FkRGF0YShvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKHRoaXMucmVsb2FkRGF0YVByb21pc2UgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMucmVsb2FkRGF0YVByb21pc2UgPSB0aGlzLmdldEFsbENsYXNzZXMob3B0aW9ucylcbiAgICAgIC50aGVuKFxuICAgICAgICBhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShhbGxTY2hlbWFzLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgfVxuXG4gIGdldEFsbENsYXNzZXMob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmFsbCgpO1xuICAgIGlmIChjYWNoZWQgJiYgY2FjaGVkLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gIH1cblxuICBzZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4gYWxsU2NoZW1hcy5tYXAoaW5qZWN0RGVmYXVsdFNjaGVtYSkpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUucHV0KGFsbFNjaGVtYXMpO1xuICAgICAgICByZXR1cm4gYWxsU2NoZW1hcztcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0T25lU2NoZW1hKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFsbG93Vm9sYXRpbGVDbGFzc2VzOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWE+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIH1cbiAgICBpZiAoYWxsb3dWb2xhdGlsZUNsYXNzZXMgJiYgdm9sYXRpbGVDbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xKSB7XG4gICAgICBjb25zdCBkYXRhID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBmaWVsZHM6IGRhdGEuZmllbGRzLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBpbmRleGVzOiBkYXRhLmluZGV4ZXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKS50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgY29uc3Qgb25lU2NoZW1hID0gYWxsU2NoZW1hcy5maW5kKHNjaGVtYSA9PiBzY2hlbWEuY2xhc3NOYW1lID09PSBjbGFzc05hbWUpO1xuICAgICAgaWYgKCFvbmVTY2hlbWEpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gb25lU2NoZW1hO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbmV3IGNsYXNzIHRoYXQgaW5jbHVkZXMgdGhlIHRocmVlIGRlZmF1bHQgZmllbGRzLlxuICAvLyBBQ0wgaXMgYW4gaW1wbGljaXQgY29sdW1uIHRoYXQgZG9lcyBub3QgZ2V0IGFuIGVudHJ5IGluIHRoZVxuICAvLyBfU0NIRU1BUyBkYXRhYmFzZS4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZVxuICAvLyBjcmVhdGVkIHNjaGVtYSwgaW4gbW9uZ28gZm9ybWF0LlxuICAvLyBvbiBzdWNjZXNzLCBhbmQgcmVqZWN0cyB3aXRoIGFuIGVycm9yIG9uIGZhaWwuIEVuc3VyZSB5b3VcbiAgLy8gaGF2ZSBhdXRob3JpemF0aW9uIChtYXN0ZXIga2V5LCBvciBjbGllbnQgY2xhc3MgY3JlYXRpb25cbiAgLy8gZW5hYmxlZCkgYmVmb3JlIGNhbGxpbmcgdGhpcyBmdW5jdGlvbi5cbiAgYXN5bmMgYWRkQ2xhc3NJZk5vdEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSA9IHt9XG4gICk6IFByb21pc2U8dm9pZCB8IFNjaGVtYT4ge1xuICAgIHZhciB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgaWYgKHZhbGlkYXRpb25FcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh2YWxpZGF0aW9uRXJyb3IuY29kZSAmJiB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFkYXB0ZXJTY2hlbWEgPSBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuY3JlYXRlQ2xhc3MoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSh7XG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEoYWRhcHRlclNjaGVtYSk7XG4gICAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZUNsYXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEZpZWxkc1tuYW1lXTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJlxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0udHlwZSAhPT0gZmllbGQudHlwZSAmJlxuICAgICAgICAgICAgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZSdcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3JwZXJtO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3dwZXJtO1xuICAgICAgICBjb25zdCBuZXdTY2hlbWEgPSBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkcywgc3VibWl0dGVkRmllbGRzKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdEZpZWxkcyA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwgZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQ7XG4gICAgICAgIGNvbnN0IGZ1bGxOZXdTY2hlbWEgPSBPYmplY3QuYXNzaWduKHt9LCBuZXdTY2hlbWEsIGRlZmF1bHRGaWVsZHMpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgbmV3U2NoZW1hLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBPYmplY3Qua2V5cyhleGlzdGluZ0ZpZWxkcylcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpbmFsbHkgd2UgaGF2ZSBjaGVja2VkIHRvIG1ha2Ugc3VyZSB0aGUgcmVxdWVzdCBpcyB2YWxpZCBhbmQgd2UgY2FuIHN0YXJ0IGRlbGV0aW5nIGZpZWxkcy5cbiAgICAgICAgLy8gRG8gYWxsIGRlbGV0aW9ucyBmaXJzdCwgdGhlbiBhIHNpbmdsZSBzYXZlIHRvIF9TQ0hFTUEgY29sbGVjdGlvbiB0byBoYW5kbGUgYWxsIGFkZGl0aW9ucy5cbiAgICAgICAgY29uc3QgZGVsZXRlZEZpZWxkczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgY29uc3QgaW5zZXJ0ZWRGaWVsZHMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICBkZWxldGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5zZXJ0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGRlbGV0ZVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgaWYgKGRlbGV0ZWRGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGRlbGV0ZVByb21pc2UgPSB0aGlzLmRlbGV0ZUZpZWxkcyhkZWxldGVkRmllbGRzLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgZW5mb3JjZUZpZWxkcyA9IFtdO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIGRlbGV0ZVByb21pc2UgLy8gRGVsZXRlIEV2ZXJ5dGhpbmdcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpIC8vIFJlbG9hZCBvdXIgU2NoZW1hLCBzbyB3ZSBoYXZlIGFsbCB0aGUgbmV3IHZhbHVlc1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IGluc2VydGVkRmllbGRzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgICAgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBuZXdTY2hlbWEpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgIHRoaXMuX2RiQWRhcHRlci5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBmdWxsTmV3U2NoZW1hXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgICAgICAvL1RPRE86IE1vdmUgdGhpcyBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuICAgICAgICAgICAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgICAgICAgY29uc3QgcmVsb2FkZWRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHJlbG9hZGVkU2NoZW1hLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gcmVsb2FkZWRTY2hlbWE7XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3Qgb3IgZmFpbHMgd2l0aCBhIHJlYXNvbi5cbiAgZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cbiAgICAvLyBXZSBkb24ndCBoYXZlIHRoaXMgY2xhc3MuIFVwZGF0ZSB0aGUgc2NoZW1hXG4gICAgcmV0dXJuIChcbiAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIHN1Y2NlZWRlZC4gUmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgIHRoaXMuYWRkQ2xhc3NJZk5vdEV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHRcbiAgICAgICAgICAvLyBoYXZlIGZhaWxlZCBiZWNhdXNlIHRoZXJlJ3MgYSByYWNlIGNvbmRpdGlvbiBhbmQgYSBkaWZmZXJlbnRcbiAgICAgICAgICAvLyBjbGllbnQgaXMgbWFraW5nIHRoZSBleGFjdCBzYW1lIHNjaGVtYSB1cGRhdGUgdGhhdCB3ZSB3YW50LlxuICAgICAgICAgIC8vIFNvIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWEuXG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2NoZW1hIG5vdyB2YWxpZGF0ZXNcbiAgICAgICAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgRmFpbGVkIHRvIGFkZCAke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBzdGlsbCBkb2Vzbid0IHZhbGlkYXRlLiBHaXZlIHVwXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ3NjaGVtYSBjbGFzcyBuYW1lIGRvZXMgbm90IHJldmFsaWRhdGUnKTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnkpOiBhbnkge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICB9XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgZXJyb3I6IGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSksXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgW10pO1xuICB9XG5cbiAgdmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgIGV4aXN0aW5nRmllbGROYW1lczogQXJyYXk8c3RyaW5nPlxuICApIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICAgIGlmIChleGlzdGluZ0ZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBlcnJvcjogJ2ludmFsaWQgZmllbGQgbmFtZTogJyArIGZpZWxkTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiAxMzYsXG4gICAgICAgICAgICBlcnJvcjogJ2ZpZWxkICcgKyBmaWVsZE5hbWUgKyAnIGNhbm5vdCBiZSBhZGRlZCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgY29uc3QgZXJyb3IgPSBmaWVsZFR5cGVJc0ludmFsaWQoZmllbGRUeXBlKTtcbiAgICAgICAgaWYgKGVycm9yKSByZXR1cm4geyBjb2RlOiBlcnJvci5jb2RlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICBpZiAoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdkZWZhdWx0IHZhbHVlJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZmllbGRUeXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZVxuICAgICAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUucmVxdWlyZWQpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAncmVxdWlyZWQnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdKSB7XG4gICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXTtcbiAgICB9XG5cbiAgICBjb25zdCBnZW9Qb2ludHMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLmZpbHRlcihcbiAgICAgIGtleSA9PiBmaWVsZHNba2V5XSAmJiBmaWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgICBpZiAoZ2VvUG9pbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBlcnJvcjpcbiAgICAgICAgICAnY3VycmVudGx5LCBvbmx5IG9uZSBHZW9Qb2ludCBmaWVsZCBtYXkgZXhpc3QgaW4gYW4gb2JqZWN0LiBBZGRpbmcgJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzFdICtcbiAgICAgICAgICAnIHdoZW4gJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzBdICtcbiAgICAgICAgICAnIGFscmVhZHkgZXhpc3RzLicsXG4gICAgICB9O1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkcywgdGhpcy51c2VySWRSZWdFeCk7XG4gIH1cblxuICAvLyBTZXRzIHRoZSBDbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBmb3IgYSBnaXZlbiBjbGFzc05hbWUsIHdoaWNoIG11c3QgZXhpc3QuXG4gIGFzeW5jIHNldFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBwZXJtczogYW55LCBuZXdTY2hlbWE6IFNjaGVtYUZpZWxkcykge1xuICAgIGlmICh0eXBlb2YgcGVybXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKHBlcm1zLCBuZXdTY2hlbWEsIHRoaXMudXNlcklkUmVnRXgpO1xuICAgIGF3YWl0IHRoaXMuX2RiQWRhcHRlci5zZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lLCBwZXJtcyk7XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgY2FjaGVkLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHBlcm1zO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyB8IFNjaGVtYUZpZWxkLFxuICAgIGlzVmFsaWRhdGlvbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICAvLyBzdWJkb2N1bWVudCBrZXkgKHgueSkgPT4gb2sgaWYgeCBpcyBvZiB0eXBlICdvYmplY3QnXG4gICAgICBmaWVsZE5hbWUgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICAgIHR5cGUgPSAnT2JqZWN0JztcbiAgICB9XG4gICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gKTtcbiAgICB9XG5cbiAgICAvLyBJZiBzb21lb25lIHRyaWVzIHRvIGNyZWF0ZSBhIG5ldyBmaWVsZCB3aXRoIG51bGwvdW5kZWZpbmVkIGFzIHRoZSB2YWx1ZSwgcmV0dXJuO1xuICAgIGlmICghdHlwZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgdHlwZSA9ICh7IHR5cGUgfTogU2NoZW1hRmllbGQpO1xuICAgIH1cblxuICAgIGlmICh0eXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUodHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKHR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgdHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHBlY3RlZFR5cGUpIHtcbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICBleHBlY3RlZFR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKHR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIElmIHR5cGUgb3B0aW9ucyBkbyBub3QgY2hhbmdlXG4gICAgICAvLyB3ZSBjYW4gc2FmZWx5IHJldHVyblxuICAgICAgaWYgKGlzVmFsaWRhdGlvbiB8fCBKU09OLnN0cmluZ2lmeShleHBlY3RlZFR5cGUpID09PSBKU09OLnN0cmluZ2lmeSh0eXBlKSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLy8gRmllbGQgb3B0aW9ucyBhcmUgbWF5IGJlIGNoYW5nZWRcbiAgICAgIC8vIGVuc3VyZSB0byBoYXZlIGFuIHVwZGF0ZSB0byBkYXRlIHNjaGVtYSBmaWVsZFxuICAgICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlci51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUpIHtcbiAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCB3ZSB0aHJvdyBlcnJvcnMgd2hlbiBpdCBpcyBhcHByb3ByaWF0ZSB0byBkbyBzby5cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0IGhhdmUgYmVlbiBhIHJhY2VcbiAgICAgICAgLy8gY29uZGl0aW9uIHdoZXJlIGFub3RoZXIgY2xpZW50IHVwZGF0ZWQgdGhlIHNjaGVtYSBpbiB0aGUgc2FtZVxuICAgICAgICAvLyB3YXkgdGhhdCB3ZSB3YW50ZWQgdG8uIFNvLCBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICB0eXBlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cblxuICBlbnN1cmVGaWVsZHMoZmllbGRzOiBhbnkpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9ID0gZmllbGRzW2ldO1xuICAgICAgbGV0IHsgdHlwZSB9ID0gZmllbGRzW2ldO1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0eXBlID0geyB0eXBlOiB0eXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWV4cGVjdGVkVHlwZSB8fCAhZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgQ291bGQgbm90IGFkZCBmaWVsZCAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBtYWludGFpbiBjb21wYXRpYmlsaXR5XG4gIGRlbGV0ZUZpZWxkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIHJldHVybiB0aGlzLmRlbGV0ZUZpZWxkcyhbZmllbGROYW1lXSwgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gIH1cblxuICAvLyBEZWxldGUgZmllbGRzLCBhbmQgcmVtb3ZlIHRoYXQgZGF0YSBmcm9tIGFsbCBvYmplY3RzLiBUaGlzIGlzIGludGVuZGVkXG4gIC8vIHRvIHJlbW92ZSB1bnVzZWQgZmllbGRzLCBpZiBvdGhlciB3cml0ZXJzIGFyZSB3cml0aW5nIG9iamVjdHMgdGhhdCBpbmNsdWRlXG4gIC8vIHRoaXMgZmllbGQsIHRoZSBmaWVsZCBtYXkgcmVhcHBlYXIuIFJldHVybnMgYSBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aFxuICAvLyBubyBvYmplY3Qgb24gc3VjY2Vzcywgb3IgcmVqZWN0cyB3aXRoIHsgY29kZSwgZXJyb3IgfSBvbiBmYWlsdXJlLlxuICAvLyBQYXNzaW5nIHRoZSBkYXRhYmFzZSBhbmQgcHJlZml4IGlzIG5lY2Vzc2FyeSBpbiBvcmRlciB0byBkcm9wIHJlbGF0aW9uIGNvbGxlY3Rpb25zXG4gIC8vIGFuZCByZW1vdmUgZmllbGRzIGZyb20gb2JqZWN0cy4gSWRlYWxseSB0aGUgZGF0YWJhc2Ugd291bGQgYmVsb25nIHRvXG4gIC8vIGEgZGF0YWJhc2UgYWRhcHRlciBhbmQgdGhpcyBmdW5jdGlvbiB3b3VsZCBjbG9zZSBvdmVyIGl0IG9yIGFjY2VzcyBpdCB2aWEgbWVtYmVyLlxuICBkZWxldGVGaWVsZHMoZmllbGROYW1lczogQXJyYXk8c3RyaW5nPiwgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSk7XG4gICAgfVxuXG4gICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgaW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICAgIC8vRG9uJ3QgYWxsb3cgZGVsZXRpbmcgdGhlIGRlZmF1bHQgZmllbGRzLlxuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsIGBmaWVsZCAke2ZpZWxkTmFtZX0gY2Fubm90IGJlIGNoYW5nZWRgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGZhbHNlLCB7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtmaWVsZE5hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hRmllbGRzID0geyAuLi5zY2hlbWEuZmllbGRzIH07XG4gICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUZpZWxkcyhjbGFzc05hbWUsIHNjaGVtYSwgZmllbGROYW1lcykudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWFGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgICAgICAvL0ZvciByZWxhdGlvbnMsIGRyb3AgdGhlIF9Kb2luIHRhYmxlXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9iamVjdCBwcm92aWRlZCBpbiBSRVNUIGZvcm1hdC5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYSBpZiB0aGlzIG9iamVjdCBpc1xuICAvLyB2YWxpZC5cbiAgYXN5bmMgdmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAndGhlcmUgY2FuIG9ubHkgYmUgb25lIGdlb3BvaW50IGZpZWxkIGluIGEgY2xhc3MnXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmICghZXhwZWN0ZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnQUNMJykge1xuICAgICAgICAvLyBFdmVyeSBvYmplY3QgaGFzIEFDTCBpbXBsaWNpdGx5LlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHByb21pc2VzLnB1c2goc2NoZW1hLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgZXhwZWN0ZWQsIHRydWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25zdCBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcblxuICAgIGlmIChlbmZvcmNlRmllbGRzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG5cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhwcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIHRoYXQgYWxsIHRoZSBwcm9wZXJ0aWVzIGFyZSBzZXQgZm9yIHRoZSBvYmplY3RcbiAgdmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgY29sdW1ucyA9IHJlcXVpcmVkQ29sdW1uc1tjbGFzc05hbWVdO1xuICAgIGlmICghY29sdW1ucyB8fCBjb2x1bW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG1pc3NpbmdDb2x1bW5zID0gY29sdW1ucy5maWx0ZXIoZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmIChvYmplY3RbY29sdW1uXSAmJiB0eXBlb2Ygb2JqZWN0W2NvbHVtbl0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gVHJ5aW5nIHRvIGRlbGV0ZSBhIHJlcXVpcmVkIGNvbHVtblxuICAgICAgICAgIHJldHVybiBvYmplY3RbY29sdW1uXS5fX29wID09ICdEZWxldGUnO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdCB0cnlpbmcgdG8gZG8gYW55dGhpbmcgdGhlcmVcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFvYmplY3RbY29sdW1uXTtcbiAgICB9KTtcblxuICAgIGlmIChtaXNzaW5nQ29sdW1ucy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIG1pc3NpbmdDb2x1bW5zWzBdICsgJyBpcyByZXF1aXJlZC4nKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgfVxuXG4gIHRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBUZXN0cyB0aGF0IHRoZSBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uIGxldCBwYXNzIHRoZSBvcGVyYXRpb24gZm9yIGEgZ2l2ZW4gYWNsR3JvdXBcbiAgc3RhdGljIHRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zOiA/YW55LCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICBpZiAocGVybXNbJyonXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHBlcm1pc3Npb25zIGFnYWluc3QgdGhlIGFjbEdyb3VwIHByb3ZpZGVkIChhcnJheSBvZiB1c2VySWQvcm9sZXMpXG4gICAgaWYgKFxuICAgICAgYWNsR3JvdXAuc29tZShhY2wgPT4ge1xuICAgICAgICByZXR1cm4gcGVybXNbYWNsXSA9PT0gdHJ1ZTtcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgc3RhdGljIHZhbGlkYXRlUGVybWlzc2lvbihcbiAgICBjbGFzc1Blcm1pc3Npb25zOiA/YW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBhY3Rpb24/OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHRoZSByZWFkVXNlckZpZWxkcyBsYXRlclxuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSAmJlxuICAgICAgY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBwb2ludGVyRmllbGRzID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHM7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykgJiYgcG9pbnRlckZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhbnkgb3AgZXhjZXB0ICdhZGRGaWVsZCBhcyBwYXJ0IG9mIGNyZWF0ZScgaXMgb2suXG4gICAgICBpZiAob3BlcmF0aW9uICE9PSAnYWRkRmllbGQnIHx8IGFjdGlvbiA9PT0gJ3VwZGF0ZScpIHtcbiAgICAgICAgLy8gV2UgY2FuIGFsbG93IGFkZGluZyBmaWVsZCBvbiB1cGRhdGUgZmxvdyBvbmx5LlxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcsIGFjdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvbixcbiAgICAgIGFjdGlvblxuICAgICk7XG4gIH1cblxuICBnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIHJldHVybiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSAmJiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBleHBlY3RlZCB0eXBlIGZvciBhIGNsYXNzTmFtZStrZXkgY29tYmluYXRpb25cbiAgLy8gb3IgdW5kZWZpbmVkIGlmIHRoZSBzY2hlbWEgaXMgbm90IHNldFxuICBnZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZXhwZWN0ZWRUeXBlID09PSAnbWFwJyA/ICdPYmplY3QnIDogZXhwZWN0ZWRUeXBlO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGlmIGEgZ2l2ZW4gY2xhc3MgaXMgaW4gdGhlIHNjaGVtYS5cbiAgaGFzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoKS50aGVuKCgpID0+ICEhdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIG5ldyBTY2hlbWEuXG5jb25zdCBsb2FkID0gKGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IGFueSk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIpO1xuICByZXR1cm4gc2NoZW1hLnJlbG9hZERhdGEob3B0aW9ucykudGhlbigoKSA9PiBzY2hlbWEpO1xufTtcblxuLy8gQnVpbGRzIGEgbmV3IHNjaGVtYSAoaW4gc2NoZW1hIEFQSSByZXNwb25zZSBmb3JtYXQpIG91dCBvZiBhblxuLy8gZXhpc3RpbmcgbW9uZ28gc2NoZW1hICsgYSBzY2hlbWFzIEFQSSBwdXQgcmVxdWVzdC4gVGhpcyByZXNwb25zZVxuLy8gZG9lcyBub3QgaW5jbHVkZSB0aGUgZGVmYXVsdCBmaWVsZHMsIGFzIGl0IGlzIGludGVuZGVkIHRvIGJlIHBhc3NlZFxuLy8gdG8gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLiBObyB2YWxpZGF0aW9uIGlzIGRvbmUgaGVyZSwgaXRcbi8vIGlzIGRvbmUgaW4gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLlxuZnVuY3Rpb24gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHM6IFNjaGVtYUZpZWxkcywgcHV0UmVxdWVzdDogYW55KTogU2NoZW1hRmllbGRzIHtcbiAgY29uc3QgbmV3U2NoZW1hID0ge307XG4gIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICBjb25zdCBzeXNTY2hlbWFGaWVsZCA9XG4gICAgT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnMpLmluZGV4T2YoZXhpc3RpbmdGaWVsZHMuX2lkKSA9PT0gLTFcbiAgICAgID8gW11cbiAgICAgIDogT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnNbZXhpc3RpbmdGaWVsZHMuX2lkXSk7XG4gIGZvciAoY29uc3Qgb2xkRmllbGQgaW4gZXhpc3RpbmdGaWVsZHMpIHtcbiAgICBpZiAoXG4gICAgICBvbGRGaWVsZCAhPT0gJ19pZCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnQUNMJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICd1cGRhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ2NyZWF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnb2JqZWN0SWQnXG4gICAgKSB7XG4gICAgICBpZiAoc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJiBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG9sZEZpZWxkKSAhPT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWVsZElzRGVsZXRlZCA9IHB1dFJlcXVlc3Rbb2xkRmllbGRdICYmIHB1dFJlcXVlc3Rbb2xkRmllbGRdLl9fb3AgPT09ICdEZWxldGUnO1xuICAgICAgaWYgKCFmaWVsZElzRGVsZXRlZCkge1xuICAgICAgICBuZXdTY2hlbWFbb2xkRmllbGRdID0gZXhpc3RpbmdGaWVsZHNbb2xkRmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IG5ld0ZpZWxkIGluIHB1dFJlcXVlc3QpIHtcbiAgICBpZiAobmV3RmllbGQgIT09ICdvYmplY3RJZCcgJiYgcHV0UmVxdWVzdFtuZXdGaWVsZF0uX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2YobmV3RmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIG5ld1NjaGVtYVtuZXdGaWVsZF0gPSBwdXRSZXF1ZXN0W25ld0ZpZWxkXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ld1NjaGVtYTtcbn1cblxuLy8gR2l2ZW4gYSBzY2hlbWEgcHJvbWlzZSwgY29uc3RydWN0IGFub3RoZXIgc2NoZW1hIHByb21pc2UgdGhhdFxuLy8gdmFsaWRhdGVzIHRoaXMgZmllbGQgb25jZSB0aGUgc2NoZW1hIGxvYWRzLlxuZnVuY3Rpb24gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHNjaGVtYVByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSkge1xuICByZXR1cm4gc2NoZW1hUHJvbWlzZS50aGVuKHNjaGVtYSA9PiB7XG4gICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9KTtcbn1cblxuLy8gR2V0cyB0aGUgdHlwZSBmcm9tIGEgUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdCwgd2hlcmUgJ3R5cGUnIGlzXG4vLyBleHRlbmRlZCBwYXN0IGphdmFzY3JpcHQgdHlwZXMgdG8gaW5jbHVkZSB0aGUgcmVzdCBvZiB0aGUgUGFyc2Vcbi8vIHR5cGUgc3lzdGVtLlxuLy8gVGhlIG91dHB1dCBzaG91bGQgYmUgYSB2YWxpZCBzY2hlbWEgdmFsdWUuXG4vLyBUT0RPOiBlbnN1cmUgdGhhdCB0aGlzIGlzIGNvbXBhdGlibGUgd2l0aCB0aGUgZm9ybWF0IHVzZWQgaW4gT3BlbiBEQlxuZnVuY3Rpb24gZ2V0VHlwZShvYmo6IGFueSk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBvYmo7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdCb29sZWFuJztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuICdTdHJpbmcnO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iaik7XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ2JhZCBvYmo6ICcgKyBvYmo7XG4gIH1cbn1cblxuLy8gVGhpcyBnZXRzIHRoZSB0eXBlIGZvciBub24tSlNPTiB0eXBlcyBsaWtlIHBvaW50ZXJzIGFuZCBmaWxlcywgYnV0XG4vLyBhbHNvIGdldHMgdGhlIGFwcHJvcHJpYXRlIHR5cGUgZm9yICQgb3BlcmF0b3JzLlxuLy8gUmV0dXJucyBudWxsIGlmIHRoZSB0eXBlIGlzIHVua25vd24uXG5mdW5jdGlvbiBnZXRPYmplY3RUeXBlKG9iaik6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuICdBcnJheSc7XG4gIH1cbiAgaWYgKG9iai5fX3R5cGUpIHtcbiAgICBzd2l0Y2ggKG9iai5fX3R5cGUpIHtcbiAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICBpZiAob2JqLm5hbWUpIHtcbiAgICAgICAgICByZXR1cm4gJ0ZpbGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgIGlmIChvYmouaXNvKSB7XG4gICAgICAgICAgcmV0dXJuICdEYXRlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgaWYgKG9iai5sYXRpdHVkZSAhPSBudWxsICYmIG9iai5sb25naXR1ZGUgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBpZiAob2JqLmJhc2U2NCkge1xuICAgICAgICAgIHJldHVybiAnQnl0ZXMnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUG9seWdvbic6XG4gICAgICAgIGlmIChvYmouY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICByZXR1cm4gJ1BvbHlnb24nO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsICdUaGlzIGlzIG5vdCBhIHZhbGlkICcgKyBvYmouX190eXBlKTtcbiAgfVxuICBpZiAob2JqWyckbmUnXSkge1xuICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9ialsnJG5lJ10pO1xuICB9XG4gIGlmIChvYmouX19vcCkge1xuICAgIHN3aXRjaCAob2JqLl9fb3ApIHtcbiAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgY2FzZSAnQWRkJzpcbiAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICByZXR1cm4gJ0FycmF5JztcbiAgICAgIGNhc2UgJ0FkZFJlbGF0aW9uJzpcbiAgICAgIGNhc2UgJ1JlbW92ZVJlbGF0aW9uJzpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIHRhcmdldENsYXNzOiBvYmoub2JqZWN0c1swXS5jbGFzc05hbWUsXG4gICAgICAgIH07XG4gICAgICBjYXNlICdCYXRjaCc6XG4gICAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iai5vcHNbMF0pO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgJ3VuZXhwZWN0ZWQgb3A6ICcgKyBvYmouX19vcDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICdPYmplY3QnO1xufVxuXG5leHBvcnQge1xuICBsb2FkLFxuICBjbGFzc05hbWVJc1ZhbGlkLFxuICBmaWVsZE5hbWVJc1ZhbGlkLFxuICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSxcbiAgYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QsXG4gIHN5c3RlbUNsYXNzZXMsXG4gIGRlZmF1bHRDb2x1bW5zLFxuICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hLFxuICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICBTY2hlbWFDb250cm9sbGVyLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7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