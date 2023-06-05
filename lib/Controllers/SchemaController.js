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

// fields required for read or write operations on their respective classes.
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
const ttl = {
  date: Date.now(),
  duration: undefined
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
class SchemaController {
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    const config = _Config.default.get(Parse.applicationId);
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = config.protectedFields;
    const customIds = config.allowCustomObjectId;
    const customIdRegEx = /^.{1,}$/u; // 1+ chars
    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;
    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
  }
  async reloadDataIfNeeded() {
    if (this._dbAdapter.enableSchemaHooks) {
      return;
    }
    const {
      date,
      duration
    } = ttl || {};
    if (!duration) {
      return;
    }
    const now = Date.now();
    if (now - date > duration) {
      ttl.date = now;
      await this.reloadData({
        clearCache: true
      });
    }
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
  async getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }
    await this.reloadDataIfNeeded();
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
  enforceFieldExists(className, fieldName, type, isValidation, maintenance) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }
    let fieldNameToValidate = `${fieldName}`;
    if (maintenance && fieldNameToValidate.charAt(0) === '_') {
      fieldNameToValidate = fieldNameToValidate.substring(1);
    }
    if (!fieldNameIsValid(fieldNameToValidate, className)) {
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
  async validateObject(className, object, query, maintenance) {
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
      promises.push(schema.enforceFieldExists(className, fieldName, expected, true, maintenance));
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
    const columns = requiredColumns.write[className];
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
  ttl.duration = dbAdapter.schemaCacheTtl;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJfRXhwb3J0UHJvZ3Jlc3MiLCJpZCIsIm1hc3RlcktleSIsImFwcGxpY2F0aW9uSWQiLCJleHBvcnRzIiwicmVxdWlyZWRDb2x1bW5zIiwicmVhZCIsIndyaXRlIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJpbmNsdWRlcyIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiX3JlZiIsImluZGV4ZXMiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZGVlcGNvcHkiLCJjbGFzc1Byb3RlY3RlZEZpZWxkcyIsInVucSIsIlNldCIsImZyb20iLCJkZWZhdWx0U2NoZW1hIiwiX0hvb2tzU2NoZW1hIiwiX0dsb2JhbENvbmZpZ1NjaGVtYSIsIl9HcmFwaFFMQ29uZmlnU2NoZW1hIiwiX1B1c2hTdGF0dXNTY2hlbWEiLCJfSm9iU3RhdHVzU2NoZW1hIiwiX0pvYlNjaGVkdWxlU2NoZW1hIiwiX0F1ZGllbmNlU2NoZW1hIiwiX0lkZW1wb3RlbmN5U2NoZW1hIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsImRiVHlwZU1hdGNoZXNPYmplY3RUeXBlIiwiZGJUeXBlIiwib2JqZWN0VHlwZSIsInR5cGVUb1N0cmluZyIsInR0bCIsImRhdGUiLCJEYXRlIiwibm93IiwiZHVyYXRpb24iLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwiX2RiQWRhcHRlciIsIkNvbmZpZyIsInNjaGVtYURhdGEiLCJTY2hlbWFDYWNoZSIsImFsbCIsImN1c3RvbUlkcyIsImFsbG93Q3VzdG9tT2JqZWN0SWQiLCJjdXN0b21JZFJlZ0V4IiwiYXV0b0lkUmVnRXgiLCJ1c2VySWRSZWdFeCIsIndhdGNoIiwicmVsb2FkRGF0YSIsImNsZWFyQ2FjaGUiLCJyZWxvYWREYXRhSWZOZWVkZWQiLCJlbmFibGVTY2hlbWFIb29rcyIsIm9wdGlvbnMiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImNhY2hlZCIsIlByb21pc2UiLCJyZXNvbHZlIiwibWFwIiwicHV0IiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJjbGVhciIsIm9uZVNjaGVtYSIsImZpbmQiLCJyZWplY3QiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwidmFsaWRhdGlvbkVycm9yIiwidmFsaWRhdGVOZXdDbGFzcyIsImNvZGUiLCJlcnJvciIsImFkYXB0ZXJTY2hlbWEiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiRFVQTElDQVRFX1ZBTFVFIiwidXBkYXRlQ2xhc3MiLCJzdWJtaXR0ZWRGaWVsZHMiLCJkYXRhYmFzZSIsImV4aXN0aW5nRmllbGRzIiwiX19vcCIsIm5ld1NjaGVtYSIsImJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0IiwiZGVmYXVsdEZpZWxkcyIsImZ1bGxOZXdTY2hlbWEiLCJ2YWxpZGF0ZVNjaGVtYURhdGEiLCJkZWxldGVkRmllbGRzIiwiaW5zZXJ0ZWRGaWVsZHMiLCJkZWxldGVQcm9taXNlIiwiZGVsZXRlRmllbGRzIiwiZW5mb3JjZUZpZWxkcyIsInByb21pc2VzIiwiZW5mb3JjZUZpZWxkRXhpc3RzIiwicmVzdWx0cyIsInJlc3VsdCIsInNldFBlcm1pc3Npb25zIiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJlbnN1cmVGaWVsZHMiLCJyZWxvYWRlZFNjaGVtYSIsImNhdGNoIiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiZXhpc3RpbmdGaWVsZE5hbWVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpZWxkVHlwZSIsImRlZmF1bHRWYWx1ZSIsImRlZmF1bHRWYWx1ZVR5cGUiLCJnZXRUeXBlIiwicmVxdWlyZWQiLCJnZW9Qb2ludHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1ZhbGlkYXRpb24iLCJtYWludGVuYW5jZSIsInNwbGl0IiwiZmllbGROYW1lVG9WYWxpZGF0ZSIsImNoYXJBdCIsInN1YnN0cmluZyIsImV4cGVjdGVkVHlwZSIsImdldEV4cGVjdGVkVHlwZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiZGVsZXRlRmllbGQiLCJmaWVsZE5hbWVzIiwic2NoZW1hRmllbGRzIiwiYWRhcHRlciIsImRlbGV0ZUNsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJnZW9jb3VudCIsImV4cGVjdGVkIiwicHJvbWlzZSIsInRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsInZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwiY29sdW1ucyIsIm1pc3NpbmdDb2x1bW5zIiwiY29sdW1uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwiYWNsR3JvdXAiLCJ0ZXN0UGVybWlzc2lvbnMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJjbGFzc1Blcm1pc3Npb25zIiwic29tZSIsImFjbCIsInZhbGlkYXRlUGVybWlzc2lvbiIsImFjdGlvbiIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwZXJtaXNzaW9uRmllbGQiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiaGFzQ2xhc3MiLCJsb2FkIiwiZGJBZGFwdGVyIiwic2NoZW1hQ2FjaGVUdGwiLCJwdXRSZXF1ZXN0Iiwic3lzU2NoZW1hRmllbGQiLCJfaWQiLCJvbGRGaWVsZCIsImZpZWxkSXNEZWxldGVkIiwibmV3RmllbGQiLCJzY2hlbWFQcm9taXNlIiwiZ2V0T2JqZWN0VHlwZSIsIl9fdHlwZSIsImlzbyIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiYmFzZTY0IiwiY29vcmRpbmF0ZXMiLCJvYmplY3RzIiwib3BzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIFRoaXMgY2xhc3MgaGFuZGxlcyBzY2hlbWEgdmFsaWRhdGlvbiwgcGVyc2lzdGVuY2UsIGFuZCBtb2RpZmljYXRpb24uXG4vL1xuLy8gRWFjaCBpbmRpdmlkdWFsIFNjaGVtYSBvYmplY3Qgc2hvdWxkIGJlIGltbXV0YWJsZS4gVGhlIGhlbHBlcnMgdG9cbi8vIGRvIHRoaW5ncyB3aXRoIHRoZSBTY2hlbWEganVzdCByZXR1cm4gYSBuZXcgc2NoZW1hIHdoZW4gdGhlIHNjaGVtYVxuLy8gaXMgY2hhbmdlZC5cbi8vXG4vLyBUaGUgY2Fub25pY2FsIHBsYWNlIHRvIHN0b3JlIHRoaXMgU2NoZW1hIGlzIGluIHRoZSBkYXRhYmFzZSBpdHNlbGYsXG4vLyBpbiBhIF9TQ0hFTUEgY29sbGVjdGlvbi4gVGhpcyBpcyBub3QgdGhlIHJpZ2h0IHdheSB0byBkbyBpdCBmb3IgYW5cbi8vIG9wZW4gc291cmNlIGZyYW1ld29yaywgYnV0IGl0J3MgYmFja3dhcmQgY29tcGF0aWJsZSwgc28gd2UncmVcbi8vIGtlZXBpbmcgaXQgdGhpcyB3YXkgZm9yIG5vdy5cbi8vXG4vLyBJbiBBUEktaGFuZGxpbmcgY29kZSwgeW91IHNob3VsZCBvbmx5IHVzZSB0aGUgU2NoZW1hIGNsYXNzIHZpYSB0aGVcbi8vIERhdGFiYXNlQ29udHJvbGxlci4gVGhpcyB3aWxsIGxldCB1cyByZXBsYWNlIHRoZSBzY2hlbWEgbG9naWMgZm9yXG4vLyBkaWZmZXJlbnQgZGF0YWJhc2VzLlxuLy8gVE9ETzogaGlkZSBhbGwgc2NoZW1hIGxvZ2ljIGluc2lkZSB0aGUgZGF0YWJhc2UgYWRhcHRlci5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHR5cGUge1xuICBTY2hlbWEsXG4gIFNjaGVtYUZpZWxkcyxcbiAgQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBTY2hlbWFGaWVsZCxcbiAgTG9hZFNjaGVtYU9wdGlvbnMsXG59IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCBkZWZhdWx0Q29sdW1uczogeyBbc3RyaW5nXTogU2NoZW1hRmllbGRzIH0gPSBPYmplY3QuZnJlZXplKHtcbiAgLy8gQ29udGFpbiB0aGUgZGVmYXVsdCBjb2x1bW5zIGZvciBldmVyeSBwYXJzZSBvYmplY3QgdHlwZSAoZXhjZXB0IF9Kb2luIGNvbGxlY3Rpb24pXG4gIF9EZWZhdWx0OiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjcmVhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdXBkYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIEFDTDogeyB0eXBlOiAnQUNMJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfVXNlciBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1VzZXI6IHtcbiAgICB1c2VybmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhc3N3b3JkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbFZlcmlmaWVkOiB7IHR5cGU6ICdCb29sZWFuJyB9LFxuICAgIGF1dGhEYXRhOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9JbnN0YWxsYXRpb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9JbnN0YWxsYXRpb246IHtcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRldmljZVRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2hhbm5lbHM6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIGRldmljZVR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwdXNoVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIEdDTVNlbmRlcklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdGltZVpvbmU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsb2NhbGVJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYmFkZ2U6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBhcHBWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJzZVZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1JvbGUgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Sb2xlOiB7XG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVzZXJzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgcm9sZXM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfUm9sZScgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1Nlc3Npb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9TZXNzaW9uOiB7XG4gICAgdXNlcjogeyB0eXBlOiAnUG9pbnRlcicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzZXNzaW9uVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmVzQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgY3JlYXRlZFdpdGg6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX1Byb2R1Y3Q6IHtcbiAgICBwcm9kdWN0SWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRvd25sb2FkOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIGRvd25sb2FkTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGljb246IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgb3JkZXI6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN1YnRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9QdXNoU3RhdHVzOiB7XG4gICAgcHVzaFRpbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gcmVzdCBvciB3ZWJ1aVxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHF1ZXJ5XG4gICAgcGF5bG9hZDogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBwYXlsb2FkLFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJ5OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgZXhwaXJhdGlvbl9pbnRlcnZhbDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG51bVNlbnQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBudW1GYWlsZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBwdXNoSGFzaDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVycm9yTWVzc2FnZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBjb3VudDogeyB0eXBlOiAnTnVtYmVyJyB9LCAvLyB0cmFja3MgIyBvZiBiYXRjaGVzIHF1ZXVlZCBhbmQgcGVuZGluZ1xuICB9LFxuICBfSm9iU3RhdHVzOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1lc3NhZ2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSwgLy8gcGFyYW1zIHJlY2VpdmVkIHdoZW4gY2FsbGluZyB0aGUgam9iXG4gICAgZmluaXNoZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbiAgX0pvYlNjaGVkdWxlOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhcnRBZnRlcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRheXNPZldlZWs6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIHRpbWVPZkRheTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxhc3RSdW46IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICByZXBlYXRNaW51dGVzOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9Ib29rczoge1xuICAgIGZ1bmN0aW9uTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNsYXNzTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRyaWdnZXJOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXJsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9HbG9iYWxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIG1hc3RlcktleU9ubHk6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0dyYXBoUUxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNvbmZpZzogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfQXVkaWVuY2U6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvL3N0b3JpbmcgcXVlcnkgYXMgSlNPTiBzdHJpbmcgdG8gcHJldmVudCBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCIgZXJyb3JcbiAgICBsYXN0VXNlZDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB0aW1lc1VzZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0lkZW1wb3RlbmN5OiB7XG4gICAgcmVxSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmU6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG4gIF9FeHBvcnRQcm9ncmVzczoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBtYXN0ZXJLZXk6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBsaWNhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG59KTtcblxuLy8gZmllbGRzIHJlcXVpcmVkIGZvciByZWFkIG9yIHdyaXRlIG9wZXJhdGlvbnMgb24gdGhlaXIgcmVzcGVjdGl2ZSBjbGFzc2VzLlxuY29uc3QgcmVxdWlyZWRDb2x1bW5zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHJlYWQ6IHtcbiAgICBfVXNlcjogWyd1c2VybmFtZSddLFxuICB9LFxuICB3cml0ZToge1xuICAgIF9Qcm9kdWN0OiBbJ3Byb2R1Y3RJZGVudGlmaWVyJywgJ2ljb24nLCAnb3JkZXInLCAndGl0bGUnLCAnc3VidGl0bGUnXSxcbiAgICBfUm9sZTogWyduYW1lJywgJ0FDTCddLFxuICB9LFxufSk7XG5cbmNvbnN0IGludmFsaWRDb2x1bW5zID0gWydsZW5ndGgnXTtcblxuY29uc3Qgc3lzdGVtQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX1VzZXInLFxuICAnX0luc3RhbGxhdGlvbicsXG4gICdfUm9sZScsXG4gICdfU2Vzc2lvbicsXG4gICdfUHJvZHVjdCcsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0lkZW1wb3RlbmN5JyxcbiAgJ19FeHBvcnRQcm9ncmVzcycsXG5dKTtcblxuY29uc3Qgdm9sYXRpbGVDbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Ib29rcycsXG4gICdfR2xvYmFsQ29uZmlnJyxcbiAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0lkZW1wb3RlbmN5JyxcbiAgJ19FeHBvcnRQcm9ncmVzcycsXG5dKTtcblxuLy8gQW55dGhpbmcgdGhhdCBzdGFydCB3aXRoIHJvbGVcbmNvbnN0IHJvbGVSZWdleCA9IC9ecm9sZTouKi87XG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0cyB3aXRoIHVzZXJGaWVsZCAoYWxsb3dlZCBmb3IgcHJvdGVjdGVkIGZpZWxkcyBvbmx5KVxuY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4ID0gL151c2VyRmllbGQ6LiovO1xuLy8gKiBwZXJtaXNzaW9uXG5jb25zdCBwdWJsaWNSZWdleCA9IC9eXFwqJC87XG5cbmNvbnN0IGF1dGhlbnRpY2F0ZWRSZWdleCA9IC9eYXV0aGVudGljYXRlZCQvO1xuXG5jb25zdCByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXggPSAvXnJlcXVpcmVzQXV0aGVudGljYXRpb24kLztcblxuY29uc3QgY2xwUG9pbnRlclJlZ2V4ID0gL15wb2ludGVyRmllbGRzJC87XG5cbi8vIHJlZ2V4IGZvciB2YWxpZGF0aW5nIGVudGl0aWVzIGluIHByb3RlY3RlZEZpZWxkcyBvYmplY3RcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIGF1dGhlbnRpY2F0ZWRSZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbi8vIGNscCByZWdleFxuY29uc3QgY2xwRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgY2xwUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIGNscEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCBkZXBlbmRzIG9uIHN0YXJ0dXAgb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgcHJvdGVjdGVkRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIHJlZ2V4IGRlcGVuZHMgb24gbGF1bmNoIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IENMUFZhbGlkS2V5cyA9IE9iamVjdC5mcmVlemUoW1xuICAnZmluZCcsXG4gICdjb3VudCcsXG4gICdnZXQnLFxuICAnY3JlYXRlJyxcbiAgJ3VwZGF0ZScsXG4gICdkZWxldGUnLFxuICAnYWRkRmllbGQnLFxuICAncmVhZFVzZXJGaWVsZHMnLFxuICAnd3JpdGVVc2VyRmllbGRzJyxcbiAgJ3Byb3RlY3RlZEZpZWxkcycsXG5dKTtcblxuLy8gdmFsaWRhdGlvbiBiZWZvcmUgc2V0dGluZyBjbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBvbiBjb2xsZWN0aW9uXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUChwZXJtczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHM6IFNjaGVtYUZpZWxkcywgdXNlcklkUmVnRXhwOiBSZWdFeHApIHtcbiAgaWYgKCFwZXJtcykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IG9wZXJhdGlvbktleSBpbiBwZXJtcykge1xuICAgIGlmIChDTFBWYWxpZEtleXMuaW5kZXhPZihvcGVyYXRpb25LZXkpID09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCR7b3BlcmF0aW9uS2V5fSBpcyBub3QgYSB2YWxpZCBvcGVyYXRpb24gZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcGVyYXRpb24gPSBwZXJtc1tvcGVyYXRpb25LZXldO1xuICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuXG4gICAgLy8gdGhyb3dzIHdoZW4gcm9vdCBmaWVsZHMgYXJlIG9mIHdyb25nIHR5cGVcbiAgICB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uLCBvcGVyYXRpb25LZXkpO1xuXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgICAvLyB2YWxpZGF0ZSBncm91cGVkIHBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAgIC8vIG11c3QgYmUgYW4gYXJyYXkgd2l0aCBmaWVsZCBuYW1lc1xuICAgICAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2Ygb3BlcmF0aW9uKSB7XG4gICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lLCBmaWVsZHMsIG9wZXJhdGlvbktleSk7XG4gICAgICB9XG4gICAgICAvLyByZWFkVXNlckZpZWxkcyBhbmQgd3JpdGVyVXNlckZpZWxkcyBkbyBub3QgaGF2ZSBuZXNkdGVkIGZpZWxkc1xuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBwcm90ZWN0ZWQgZmllbGRzXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3Byb3RlY3RlZEZpZWxkcycpIHtcbiAgICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgICAgdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3Byb3RlY3RlZEZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBwcm90ZWN0ZWRGaWVsZHNbJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGZpZWxkIGlzIGluIGZvcm0gb2YgYXJyYXlcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAvLyBkbyBub3QgYWxsb293IHRvIHByb3RlY3QgZGVmYXVsdCBmaWVsZHNcbiAgICAgICAgICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGRdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYERlZmF1bHQgZmllbGQgJyR7ZmllbGR9JyBjYW4gbm90IGJlIHByb3RlY3RlZGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGZpZWxkIHNob3VsZCBleGlzdCBvbiBjb2xsZWN0aW9uXG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBmaWVsZCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRmllbGQgJyR7ZmllbGR9JyBpbiBwcm90ZWN0ZWRGaWVsZHM6JHtlbnRpdHl9IGRvZXMgbm90IGV4aXN0YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgb3RoZXIgZmllbGRzXG4gICAgLy8gRW50aXR5IGNhbiBiZTpcbiAgICAvLyBcIipcIiAtIFB1YmxpYyxcbiAgICAvLyBcInJlcXVpcmVzQXV0aGVudGljYXRpb25cIiAtIGF1dGhlbnRpY2F0ZWQgdXNlcnMsXG4gICAgLy8gXCJvYmplY3RJZFwiIC0gX1VzZXIgaWQsXG4gICAgLy8gXCJyb2xlOnJvbGVuYW1lXCIsXG4gICAgLy8gXCJwb2ludGVyRmllbGRzXCIgLSBhcnJheSBvZiBmaWVsZCBuYW1lcyBjb250YWluaW5nIHBvaW50ZXJzIHRvIHVzZXJzXG4gICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgIHZhbGlkYXRlUGVybWlzc2lvbktleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgIC8vIGVudGl0eSBjYW4gYmUgZWl0aGVyOlxuICAgICAgLy8gXCJwb2ludGVyRmllbGRzXCI6IHN0cmluZ1tdXG4gICAgICBpZiAoZW50aXR5ID09PSAncG9pbnRlckZpZWxkcycpIHtcbiAgICAgICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBwb2ludGVyRmllbGQgb2YgcG9pbnRlckZpZWxkcykge1xuICAgICAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihwb2ludGVyRmllbGQsIGZpZWxkcywgb3BlcmF0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3BvaW50ZXJGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgJHtvcGVyYXRpb25LZXl9WyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBlbnRpdHkga2V5XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBvciBbZW50aXR5XTogYm9vbGVhblxuICAgICAgY29uc3QgcGVybWl0ID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgIGlmIChwZXJtaXQgIT09IHRydWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgJyR7cGVybWl0fScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fToke2VudGl0eX06JHtwZXJtaXR9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uOiBhbnksIG9wZXJhdGlvbktleTogc3RyaW5nKSB7XG4gIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShvcGVyYXRpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIGFycmF5YFxuICAgICAgKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRpb24gPT09ICdvYmplY3QnICYmIG9wZXJhdGlvbiAhPT0gbnVsbCkge1xuICAgICAgLy8gb2sgdG8gcHJvY2VlZFxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIG9iamVjdGBcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkczogT2JqZWN0LCBvcGVyYXRpb246IHN0cmluZykge1xuICAvLyBVc2VzIGNvbGxlY3Rpb24gc2NoZW1hIHRvIGVuc3VyZSB0aGUgZmllbGQgaXMgb2YgdHlwZTpcbiAgLy8gLSBQb2ludGVyPF9Vc2VyPiAocG9pbnRlcnMpXG4gIC8vIC0gQXJyYXlcbiAgLy9cbiAgLy8gICAgSXQncyBub3QgcG9zc2libGUgdG8gZW5mb3JjZSB0eXBlIG9uIEFycmF5J3MgaXRlbXMgaW4gc2NoZW1hXG4gIC8vICBzbyB3ZSBhY2NlcHQgYW55IEFycmF5IGZpZWxkLCBhbmQgbGF0ZXIgd2hlbiBhcHBseWluZyBwZXJtaXNzaW9uc1xuICAvLyAgb25seSBpdGVtcyB0aGF0IGFyZSBwb2ludGVycyB0byBfVXNlciBhcmUgY29uc2lkZXJlZC5cbiAgaWYgKFxuICAgICEoXG4gICAgICBmaWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgKChmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJyAmJiBmaWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyA9PSAnX1VzZXInKSB8fFxuICAgICAgICBmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdBcnJheScpXG4gICAgKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7ZmllbGROYW1lfScgaXMgbm90IGEgdmFsaWQgY29sdW1uIGZvciBjbGFzcyBsZXZlbCBwb2ludGVyIHBlcm1pc3Npb25zICR7b3BlcmF0aW9ufWBcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IGpvaW5DbGFzc1JlZ2V4ID0gL15fSm9pbjpbQS1aYS16MC05X10rOltBLVphLXowLTlfXSsvO1xuY29uc3QgY2xhc3NBbmRGaWVsZFJlZ2V4ID0gL15bQS1aYS16XVtBLVphLXowLTlfXSokLztcbmZ1bmN0aW9uIGNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgLy8gVmFsaWQgY2xhc3NlcyBtdXN0OlxuICByZXR1cm4gKFxuICAgIC8vIEJlIG9uZSBvZiBfVXNlciwgX0luc3RhbGxhdGlvbiwgX1JvbGUsIF9TZXNzaW9uIE9SXG4gICAgc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSB8fFxuICAgIC8vIEJlIGEgam9pbiB0YWJsZSBPUlxuICAgIGpvaW5DbGFzc1JlZ2V4LnRlc3QoY2xhc3NOYW1lKSB8fFxuICAgIC8vIEluY2x1ZGUgb25seSBhbHBoYS1udW1lcmljIGFuZCB1bmRlcnNjb3JlcywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4gICAgZmllbGROYW1lSXNWYWxpZChjbGFzc05hbWUsIGNsYXNzTmFtZSlcbiAgKTtcbn1cblxuLy8gVmFsaWQgZmllbGRzIG11c3QgYmUgYWxwaGEtbnVtZXJpYywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4vLyBtdXN0IG5vdCBiZSBhIHJlc2VydmVkIGtleVxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKGNsYXNzTmFtZSAmJiBjbGFzc05hbWUgIT09ICdfSG9va3MnKSB7XG4gICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2NsYXNzTmFtZScpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNsYXNzQW5kRmllbGRSZWdleC50ZXN0KGZpZWxkTmFtZSkgJiYgIWludmFsaWRDb2x1bW5zLmluY2x1ZGVzKGZpZWxkTmFtZSk7XG59XG5cbi8vIENoZWNrcyB0aGF0IGl0J3Mgbm90IHRyeWluZyB0byBjbG9iYmVyIG9uZSBvZiB0aGUgZGVmYXVsdCBmaWVsZHMgb2YgdGhlIGNsYXNzLlxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgICdJbnZhbGlkIGNsYXNzbmFtZTogJyArXG4gICAgY2xhc3NOYW1lICtcbiAgICAnLCBjbGFzc25hbWVzIGNhbiBvbmx5IGhhdmUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMgYW5kIF8sIGFuZCBtdXN0IHN0YXJ0IHdpdGggYW4gYWxwaGEgY2hhcmFjdGVyICdcbiAgKTtcbn1cblxuY29uc3QgaW52YWxpZEpzb25FcnJvciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbnZhbGlkIEpTT04nKTtcbmNvbnN0IHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyA9IFtcbiAgJ051bWJlcicsXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdEYXRlJyxcbiAgJ09iamVjdCcsXG4gICdBcnJheScsXG4gICdHZW9Qb2ludCcsXG4gICdGaWxlJyxcbiAgJ0J5dGVzJyxcbiAgJ1BvbHlnb24nLFxuXTtcbi8vIFJldHVybnMgYW4gZXJyb3Igc3VpdGFibGUgZm9yIHRocm93aW5nIGlmIHRoZSB0eXBlIGlzIGludmFsaWRcbmNvbnN0IGZpZWxkVHlwZUlzSW52YWxpZCA9ICh7IHR5cGUsIHRhcmdldENsYXNzIH0pID0+IHtcbiAgaWYgKFsnUG9pbnRlcicsICdSZWxhdGlvbiddLmluZGV4T2YodHlwZSkgPj0gMCkge1xuICAgIGlmICghdGFyZ2V0Q2xhc3MpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoMTM1LCBgdHlwZSAke3R5cGV9IG5lZWRzIGEgY2xhc3MgbmFtZWApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRhcmdldENsYXNzICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gICAgfSBlbHNlIGlmICghY2xhc3NOYW1lSXNWYWxpZCh0YXJnZXRDbGFzcykpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSh0YXJnZXRDbGFzcykpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gIH1cbiAgaWYgKHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcy5pbmRleE9mKHR5cGUpIDwgMCkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIGBpbnZhbGlkIGZpZWxkIHR5cGU6ICR7dHlwZX1gKTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSA9IChzY2hlbWE6IGFueSkgPT4ge1xuICBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSk7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLkFDTDtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLnBhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBzY2hlbWEuZmllbGRzLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLmF1dGhEYXRhOyAvL0F1dGggZGF0YSBpcyBpbXBsaWNpdFxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5pbmRleGVzO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNsYXNzIFNjaGVtYURhdGEge1xuICBfX2RhdGE6IGFueTtcbiAgX19wcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgY29uc3RydWN0b3IoYWxsU2NoZW1hcyA9IFtdLCBwcm90ZWN0ZWRGaWVsZHMgPSB7fSkge1xuICAgIHRoaXMuX19kYXRhID0ge307XG4gICAgdGhpcy5fX3Byb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcztcbiAgICBhbGxTY2hlbWFzLmZvckVhY2goc2NoZW1hID0+IHtcbiAgICAgIGlmICh2b2xhdGlsZUNsYXNzZXMuaW5jbHVkZXMoc2NoZW1hLmNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIHNjaGVtYS5jbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSkuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBkZWVwY29weShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuXG4gICAgICAgICAgICBjb25zdCBjbGFzc1Byb3RlY3RlZEZpZWxkcyA9IHRoaXMuX19wcm90ZWN0ZWRGaWVsZHNbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgICAgICBpZiAoY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgIC4uLihkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB8fCBbXSksXG4gICAgICAgICAgICAgICAgICAuLi5jbGFzc1Byb3RlY3RlZEZpZWxkc1trZXldLFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBJbmplY3QgdGhlIGluLW1lbW9yeSBjbGFzc2VzXG4gICAgdm9sYXRpbGVDbGFzc2VzLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBjbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZHM6IHt9LFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgIHRoaXMuX19kYXRhW2NsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGluamVjdERlZmF1bHRTY2hlbWEgPSAoeyBjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBpbmRleGVzIH06IFNjaGVtYSkgPT4ge1xuICBjb25zdCBkZWZhdWx0U2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgY2xhc3NOYW1lLFxuICAgIGZpZWxkczoge1xuICAgICAgLi4uZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAuLi4oZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCB7fSksXG4gICAgICAuLi5maWVsZHMsXG4gICAgfSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIH07XG4gIGlmIChpbmRleGVzICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgIGRlZmF1bHRTY2hlbWEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRTY2hlbWE7XG59O1xuXG5jb25zdCBfSG9va3NTY2hlbWEgPSB7IGNsYXNzTmFtZTogJ19Ib29rcycsIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0hvb2tzIH07XG5jb25zdCBfR2xvYmFsQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR2xvYmFsQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR2xvYmFsQ29uZmlnLFxufTtcbmNvbnN0IF9HcmFwaFFMQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR3JhcGhRTENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dyYXBoUUxDb25maWcsXG59O1xuY29uc3QgX1B1c2hTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfUHVzaFN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlNjaGVkdWxlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlNjaGVkdWxlJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0F1ZGllbmNlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0F1ZGllbmNlJyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9BdWRpZW5jZSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9JZGVtcG90ZW5jeVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19JZGVtcG90ZW5jeScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzID0gW1xuICBfSG9va3NTY2hlbWEsXG4gIF9Kb2JTdGF0dXNTY2hlbWEsXG4gIF9Kb2JTY2hlZHVsZVNjaGVtYSxcbiAgX1B1c2hTdGF0dXNTY2hlbWEsXG4gIF9HbG9iYWxDb25maWdTY2hlbWEsXG4gIF9HcmFwaFFMQ29uZmlnU2NoZW1hLFxuICBfQXVkaWVuY2VTY2hlbWEsXG4gIF9JZGVtcG90ZW5jeVNjaGVtYSxcbl07XG5cbmNvbnN0IGRiVHlwZU1hdGNoZXNPYmplY3RUeXBlID0gKGRiVHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcsIG9iamVjdFR5cGU6IFNjaGVtYUZpZWxkKSA9PiB7XG4gIGlmIChkYlR5cGUudHlwZSAhPT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUudGFyZ2V0Q2xhc3MgIT09IG9iamVjdFR5cGUudGFyZ2V0Q2xhc3MpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGRiVHlwZS50eXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59O1xuXG5jb25zdCB0eXBlVG9TdHJpbmcgPSAodHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cbiAgaWYgKHR5cGUudGFyZ2V0Q2xhc3MpIHtcbiAgICByZXR1cm4gYCR7dHlwZS50eXBlfTwke3R5cGUudGFyZ2V0Q2xhc3N9PmA7XG4gIH1cbiAgcmV0dXJuIGAke3R5cGUudHlwZX1gO1xufTtcbmNvbnN0IHR0bCA9IHtcbiAgZGF0ZTogRGF0ZS5ub3coKSxcbiAgZHVyYXRpb246IHVuZGVmaW5lZCxcbn07XG5cbi8vIFN0b3JlcyB0aGUgZW50aXJlIHNjaGVtYSBvZiB0aGUgYXBwIGluIGEgd2VpcmQgaHlicmlkIGZvcm1hdCBzb21ld2hlcmUgYmV0d2VlblxuLy8gdGhlIG1vbmdvIGZvcm1hdCBhbmQgdGhlIFBhcnNlIGZvcm1hdC4gU29vbiwgdGhpcyB3aWxsIGFsbCBiZSBQYXJzZSBmb3JtYXQuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY2hlbWFDb250cm9sbGVyIHtcbiAgX2RiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYURhdGE6IHsgW3N0cmluZ106IFNjaGVtYSB9O1xuICByZWxvYWREYXRhUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIHVzZXJJZFJlZ0V4OiBSZWdFeHA7XG5cbiAgY29uc3RydWN0b3IoZGF0YWJhc2VBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcikge1xuICAgIHRoaXMuX2RiQWRhcHRlciA9IGRhdGFiYXNlQWRhcHRlcjtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKFNjaGVtYUNhY2hlLmFsbCgpLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgdGhpcy5wcm90ZWN0ZWRGaWVsZHMgPSBjb25maWcucHJvdGVjdGVkRmllbGRzO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQ7XG5cbiAgICBjb25zdCBjdXN0b21JZFJlZ0V4ID0gL14uezEsfSQvdTsgLy8gMSsgY2hhcnNcbiAgICBjb25zdCBhdXRvSWRSZWdFeCA9IC9eW2EtekEtWjAtOV17MSx9JC87XG5cbiAgICB0aGlzLnVzZXJJZFJlZ0V4ID0gY3VzdG9tSWRzID8gY3VzdG9tSWRSZWdFeCA6IGF1dG9JZFJlZ0V4O1xuXG4gICAgdGhpcy5fZGJBZGFwdGVyLndhdGNoKCgpID0+IHtcbiAgICAgIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyByZWxvYWREYXRhSWZOZWVkZWQoKSB7XG4gICAgaWYgKHRoaXMuX2RiQWRhcHRlci5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IGRhdGUsIGR1cmF0aW9uIH0gPSB0dGwgfHwge307XG4gICAgaWYgKCFkdXJhdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGlmIChub3cgLSBkYXRlID4gZHVyYXRpb24pIHtcbiAgICAgIHR0bC5kYXRlID0gbm93O1xuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cblxuICByZWxvYWREYXRhKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAodGhpcy5yZWxvYWREYXRhUHJvbWlzZSAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5yZWxvYWREYXRhUHJvbWlzZSA9IHRoaXMuZ2V0QWxsQ2xhc3NlcyhvcHRpb25zKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKGFsbFNjaGVtYXMsIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgZ2V0QWxsQ2xhc3NlcyhvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhSWZOZWVkZWQoKTtcbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5hbGwoKTtcbiAgICBpZiAoY2FjaGVkICYmIGNhY2hlZC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICB9XG5cbiAgc2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IGFsbFNjaGVtYXMubWFwKGluamVjdERlZmF1bHRTY2hlbWEpKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLnB1dChhbGxTY2hlbWFzKTtcbiAgICAgICAgcmV0dXJuIGFsbFNjaGVtYXM7XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldE9uZVNjaGVtYShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhbGxvd1ZvbGF0aWxlQ2xhc3NlczogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hPiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICB9XG4gICAgaWYgKGFsbG93Vm9sYXRpbGVDbGFzc2VzICYmIHZvbGF0aWxlQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSkge1xuICAgICAgY29uc3QgZGF0YSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgZmllbGRzOiBkYXRhLmZpZWxkcyxcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgaW5kZXhlczogZGF0YS5pbmRleGVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCkudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgIGNvbnN0IG9uZVNjaGVtYSA9IGFsbFNjaGVtYXMuZmluZChzY2hlbWEgPT4gc2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgICAgIGlmICghb25lU2NoZW1hKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh1bmRlZmluZWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9uZVNjaGVtYTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG5ldyBjbGFzcyB0aGF0IGluY2x1ZGVzIHRoZSB0aHJlZSBkZWZhdWx0IGZpZWxkcy5cbiAgLy8gQUNMIGlzIGFuIGltcGxpY2l0IGNvbHVtbiB0aGF0IGRvZXMgbm90IGdldCBhbiBlbnRyeSBpbiB0aGVcbiAgLy8gX1NDSEVNQVMgZGF0YWJhc2UuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGVcbiAgLy8gY3JlYXRlZCBzY2hlbWEsIGluIG1vbmdvIGZvcm1hdC5cbiAgLy8gb24gc3VjY2VzcywgYW5kIHJlamVjdHMgd2l0aCBhbiBlcnJvciBvbiBmYWlsLiBFbnN1cmUgeW91XG4gIC8vIGhhdmUgYXV0aG9yaXphdGlvbiAobWFzdGVyIGtleSwgb3IgY2xpZW50IGNsYXNzIGNyZWF0aW9uXG4gIC8vIGVuYWJsZWQpIGJlZm9yZSBjYWxsaW5nIHRoaXMgZnVuY3Rpb24uXG4gIGFzeW5jIGFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnkgPSB7fVxuICApOiBQcm9taXNlPHZvaWQgfCBTY2hlbWE+IHtcbiAgICB2YXIgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAodmFsaWRhdGlvbkVycm9yLmNvZGUgJiYgdmFsaWRhdGlvbkVycm9yLmVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBhZGFwdGVyU2NoZW1hID0gYXdhaXQgdGhpcy5fZGJBZGFwdGVyLmNyZWF0ZUNsYXNzKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoe1xuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hKGFkYXB0ZXJTY2hlbWEpO1xuICAgICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB1cGRhdGVDbGFzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRGaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlclxuICApIHtcbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdGaWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRGaWVsZHNbbmFtZV07XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiZcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdLnR5cGUgIT09IGZpZWxkLnR5cGUgJiZcbiAgICAgICAgICAgIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl9ycGVybTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl93cGVybTtcbiAgICAgICAgY29uc3QgbmV3U2NoZW1hID0gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHMsIHN1Ym1pdHRlZEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRGaWVsZHMgPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0O1xuICAgICAgICBjb25zdCBmdWxsTmV3U2NoZW1hID0gT2JqZWN0LmFzc2lnbih7fSwgbmV3U2NoZW1hLCBkZWZhdWx0RmllbGRzKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIG5ld1NjaGVtYSxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdGaWVsZHMpXG4gICAgICAgICk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5IHdlIGhhdmUgY2hlY2tlZCB0byBtYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgdmFsaWQgYW5kIHdlIGNhbiBzdGFydCBkZWxldGluZyBmaWVsZHMuXG4gICAgICAgIC8vIERvIGFsbCBkZWxldGlvbnMgZmlyc3QsIHRoZW4gYSBzaW5nbGUgc2F2ZSB0byBfU0NIRU1BIGNvbGxlY3Rpb24gdG8gaGFuZGxlIGFsbCBhZGRpdGlvbnMuXG4gICAgICAgIGNvbnN0IGRlbGV0ZWRGaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IGluc2VydGVkRmllbGRzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgZGVsZXRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBkZWxldGVQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkZWxldGVkRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBkZWxldGVQcm9taXNlID0gdGhpcy5kZWxldGVGaWVsZHMoZGVsZXRlZEZpZWxkcywgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGVuZm9yY2VGaWVsZHMgPSBbXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBkZWxldGVQcm9taXNlIC8vIERlbGV0ZSBFdmVyeXRoaW5nXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKSAvLyBSZWxvYWQgb3VyIFNjaGVtYSwgc28gd2UgaGF2ZSBhbGwgdGhlIG5ldyB2YWx1ZXNcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBpbnNlcnRlZEZpZWxkcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlID0gc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgIGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRQZXJtaXNzaW9ucyhjbGFzc05hbWUsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbmV3U2NoZW1hKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLl9kYkFkYXB0ZXIuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAgICAgICAgZnVsbE5ld1NjaGVtYVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKVxuICAgICAgICAgICAgLy9UT0RPOiBNb3ZlIHRoaXMgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlclxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICAgICAgICAgIGNvbnN0IHJlbG9hZGVkU2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICByZWxvYWRlZFNjaGVtYS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbG9hZGVkU2NoZW1hO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IG9yIGZhaWxzIHdpdGggYSByZWFzb24uXG4gIGVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3QgaGF2ZSB0aGlzIGNsYXNzLiBVcGRhdGUgdGhlIHNjaGVtYVxuICAgIHJldHVybiAoXG4gICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBzdWNjZWVkZWQuIFJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICB0aGlzLmFkZENsYXNzSWZOb3RFeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0XG4gICAgICAgICAgLy8gaGF2ZSBmYWlsZWQgYmVjYXVzZSB0aGVyZSdzIGEgcmFjZSBjb25kaXRpb24gYW5kIGEgZGlmZmVyZW50XG4gICAgICAgICAgLy8gY2xpZW50IGlzIG1ha2luZyB0aGUgZXhhY3Qgc2FtZSBzY2hlbWEgdXBkYXRlIHRoYXQgd2Ugd2FudC5cbiAgICAgICAgICAvLyBTbyBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hLlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNjaGVtYSBub3cgdmFsaWRhdGVzXG4gICAgICAgICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYEZhaWxlZCB0byBhZGQgJHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgc3RpbGwgZG9lc24ndCB2YWxpZGF0ZS4gR2l2ZSB1cFxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdzY2hlbWEgY2xhc3MgbmFtZSBkb2VzIG5vdCByZXZhbGlkYXRlJyk7XG4gICAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55KTogYW55IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgfVxuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgIGVycm9yOiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIFtdKTtcbiAgfVxuXG4gIHZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICBleGlzdGluZ0ZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz5cbiAgKSB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgICBpZiAoZXhpc3RpbmdGaWVsZE5hbWVzLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgZXJyb3I6ICdpbnZhbGlkIGZpZWxkIG5hbWU6ICcgKyBmaWVsZE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogMTM2LFxuICAgICAgICAgICAgZXJyb3I6ICdmaWVsZCAnICsgZmllbGROYW1lICsgJyBjYW5ub3QgYmUgYWRkZWQnLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmllbGRUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGNvbnN0IGVycm9yID0gZmllbGRUeXBlSXNJbnZhbGlkKGZpZWxkVHlwZSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgaWYgKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZShmaWVsZFR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAnZGVmYXVsdCB2YWx1ZScgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGZpZWxkVHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGVcbiAgICAgICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlLnJlcXVpcmVkKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ3JlcXVpcmVkJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSkge1xuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV07XG4gICAgfVxuXG4gICAgY29uc3QgZ2VvUG9pbnRzID0gT2JqZWN0LmtleXMoZmllbGRzKS5maWx0ZXIoXG4gICAgICBrZXkgPT4gZmllbGRzW2tleV0gJiYgZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICk7XG4gICAgaWYgKGdlb1BvaW50cy5sZW5ndGggPiAxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgZXJyb3I6XG4gICAgICAgICAgJ2N1cnJlbnRseSwgb25seSBvbmUgR2VvUG9pbnQgZmllbGQgbWF5IGV4aXN0IGluIGFuIG9iamVjdC4gQWRkaW5nICcgK1xuICAgICAgICAgIGdlb1BvaW50c1sxXSArXG4gICAgICAgICAgJyB3aGVuICcgK1xuICAgICAgICAgIGdlb1BvaW50c1swXSArXG4gICAgICAgICAgJyBhbHJlYWR5IGV4aXN0cy4nLFxuICAgICAgfTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHMsIHRoaXMudXNlcklkUmVnRXgpO1xuICB9XG5cbiAgLy8gU2V0cyB0aGUgQ2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgZm9yIGEgZ2l2ZW4gY2xhc3NOYW1lLCB3aGljaCBtdXN0IGV4aXN0LlxuICBhc3luYyBzZXRQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgcGVybXM6IGFueSwgbmV3U2NoZW1hOiBTY2hlbWFGaWVsZHMpIHtcbiAgICBpZiAodHlwZW9mIHBlcm1zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChwZXJtcywgbmV3U2NoZW1hLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgICBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgcGVybXMpO1xuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIGNhY2hlZC5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBwZXJtcztcbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3QgaWYgdGhlIHByb3ZpZGVkIGNsYXNzTmFtZS1maWVsZE5hbWUtdHlwZSB0dXBsZSBpcyB2YWxpZC5cbiAgLy8gVGhlIGNsYXNzTmFtZSBtdXN0IGFscmVhZHkgYmUgdmFsaWRhdGVkLlxuICAvLyBJZiAnZnJlZXplJyBpcyB0cnVlLCByZWZ1c2UgdG8gdXBkYXRlIHRoZSBzY2hlbWEgZm9yIHRoaXMgZmllbGQuXG4gIGVuZm9yY2VGaWVsZEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmcgfCBTY2hlbWFGaWVsZCxcbiAgICBpc1ZhbGlkYXRpb24/OiBib29sZWFuLFxuICAgIG1haW50ZW5hbmNlPzogYm9vbGVhblxuICApIHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSAoeC55KSA9PiBvayBpZiB4IGlzIG9mIHR5cGUgJ29iamVjdCdcbiAgICAgIGZpZWxkTmFtZSA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgICAgdHlwZSA9ICdPYmplY3QnO1xuICAgIH1cbiAgICBsZXQgZmllbGROYW1lVG9WYWxpZGF0ZSA9IGAke2ZpZWxkTmFtZX1gO1xuICAgIGlmIChtYWludGVuYW5jZSAmJiBmaWVsZE5hbWVUb1ZhbGlkYXRlLmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBmaWVsZE5hbWVUb1ZhbGlkYXRlID0gZmllbGROYW1lVG9WYWxpZGF0ZS5zdWJzdHJpbmcoMSk7XG4gICAgfVxuICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWVUb1ZhbGlkYXRlLCBjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmApO1xuICAgIH1cblxuICAgIC8vIElmIHNvbWVvbmUgdHJpZXMgdG8gY3JlYXRlIGEgbmV3IGZpZWxkIHdpdGggbnVsbC91bmRlZmluZWQgYXMgdGhlIHZhbHVlLCByZXR1cm47XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gKHsgdHlwZSB9OiBTY2hlbWFGaWVsZCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZSh0eXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUodHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICB0eXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4cGVjdGVkVHlwZSkge1xuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9OyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIGV4cGVjdGVkVHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcodHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSWYgdHlwZSBvcHRpb25zIGRvIG5vdCBjaGFuZ2VcbiAgICAgIC8vIHdlIGNhbiBzYWZlbHkgcmV0dXJuXG4gICAgICBpZiAoaXNWYWxpZGF0aW9uIHx8IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVHlwZSkgPT09IEpTT04uc3RyaW5naWZ5KHR5cGUpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvLyBGaWVsZCBvcHRpb25zIGFyZSBtYXkgYmUgY2hhbmdlZFxuICAgICAgLy8gZW5zdXJlIHRvIGhhdmUgYW4gdXBkYXRlIHRvIGRhdGUgc2NoZW1hIGZpZWxkXG4gICAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSkge1xuICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHRocm93IGVycm9ycyB3aGVuIGl0IGlzIGFwcHJvcHJpYXRlIHRvIGRvIHNvLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHQgaGF2ZSBiZWVuIGEgcmFjZVxuICAgICAgICAvLyBjb25kaXRpb24gd2hlcmUgYW5vdGhlciBjbGllbnQgdXBkYXRlZCB0aGUgc2NoZW1hIGluIHRoZSBzYW1lXG4gICAgICAgIC8vIHdheSB0aGF0IHdlIHdhbnRlZCB0by4gU28sIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIHR5cGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGVuc3VyZUZpZWxkcyhmaWVsZHM6IGFueSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH0gPSBmaWVsZHNbaV07XG4gICAgICBsZXQgeyB0eXBlIH0gPSBmaWVsZHNbaV07XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHR5cGUgPSB7IHR5cGU6IHR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhwZWN0ZWRUeXBlIHx8ICFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG1haW50YWluIGNvbXBhdGliaWxpdHlcbiAgZGVsZXRlRmllbGQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBpbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgICAgLy9Eb24ndCBhbGxvdyBkZWxldGluZyB0aGUgZGVmYXVsdCBmaWVsZHMuXG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgYGZpZWxkICR7ZmllbGROYW1lfSBjYW5ub3QgYmUgY2hhbmdlZGApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgZmFsc2UsIHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke2ZpZWxkTmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSB7IC4uLnNjaGVtYS5maWVsZHMgfTtcbiAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlRmllbGRzKGNsYXNzTmFtZSwgc2NoZW1hLCBmaWVsZE5hbWVzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgICAgIC8vRm9yIHJlbGF0aW9ucywgZHJvcCB0aGUgX0pvaW4gdGFibGVcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVDbGFzcyhgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb2JqZWN0IHByb3ZpZGVkIGluIFJFU1QgZm9ybWF0LlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hIGlmIHRoaXMgb2JqZWN0IGlzXG4gIC8vIHZhbGlkLlxuICBhc3luYyB2YWxpZGF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnksIG1haW50ZW5hbmNlOiBib29sZWFuKSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAndGhlcmUgY2FuIG9ubHkgYmUgb25lIGdlb3BvaW50IGZpZWxkIGluIGEgY2xhc3MnXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmICghZXhwZWN0ZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnQUNMJykge1xuICAgICAgICAvLyBFdmVyeSBvYmplY3QgaGFzIEFDTCBpbXBsaWNpdGx5LlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHByb21pc2VzLnB1c2goc2NoZW1hLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgZXhwZWN0ZWQsIHRydWUsIG1haW50ZW5hbmNlKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgY29uc3QgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG5cbiAgICBpZiAoZW5mb3JjZUZpZWxkcy5sZW5ndGggIT09IDApIHtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfVxuICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuXG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzY2hlbWEpO1xuICAgIHJldHVybiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMocHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyB0aGF0IGFsbCB0aGUgcHJvcGVydGllcyBhcmUgc2V0IGZvciB0aGUgb2JqZWN0XG4gIHZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXF1aXJlZENvbHVtbnMud3JpdGVbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNvbHVtbnMgfHwgY29sdW1ucy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaXNzaW5nQ29sdW1ucyA9IGNvbHVtbnMuZmlsdGVyKGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgIGlmIChxdWVyeSAmJiBxdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAob2JqZWN0W2NvbHVtbl0gJiYgdHlwZW9mIG9iamVjdFtjb2x1bW5dID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIC8vIFRyeWluZyB0byBkZWxldGUgYSByZXF1aXJlZCBjb2x1bW5cbiAgICAgICAgICByZXR1cm4gb2JqZWN0W2NvbHVtbl0uX19vcCA9PSAnRGVsZXRlJztcbiAgICAgICAgfVxuICAgICAgICAvLyBOb3QgdHJ5aW5nIHRvIGRvIGFueXRoaW5nIHRoZXJlXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhb2JqZWN0W2NvbHVtbl07XG4gICAgfSk7XG5cbiAgICBpZiAobWlzc2luZ0NvbHVtbnMubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBtaXNzaW5nQ29sdW1uc1swXSArICcgaXMgcmVxdWlyZWQuJyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gIH1cblxuICB0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gVGVzdHMgdGhhdCB0aGUgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbiBsZXQgcGFzcyB0aGUgb3BlcmF0aW9uIGZvciBhIGdpdmVuIGFjbEdyb3VwXG4gIHN0YXRpYyB0ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9uczogP2FueSwgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgaWYgKHBlcm1zWycqJ10pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBwZXJtaXNzaW9ucyBhZ2FpbnN0IHRoZSBhY2xHcm91cCBwcm92aWRlZCAoYXJyYXkgb2YgdXNlcklkL3JvbGVzKVxuICAgIGlmIChcbiAgICAgIGFjbEdyb3VwLnNvbWUoYWNsID0+IHtcbiAgICAgICAgcmV0dXJuIHBlcm1zW2FjbF0gPT09IHRydWU7XG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHN0YXRpYyB2YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgY2xhc3NQZXJtaXNzaW9uczogP2FueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgYWN0aW9uPzogc3RyaW5nXG4gICkge1xuICAgIGlmIChTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgLy8gSWYgb25seSBmb3IgYXV0aGVudGljYXRlZCB1c2Vyc1xuICAgIC8vIG1ha2Ugc3VyZSB3ZSBoYXZlIGFuIGFjbEdyb3VwXG4gICAgaWYgKHBlcm1zWydyZXF1aXJlc0F1dGhlbnRpY2F0aW9uJ10pIHtcbiAgICAgIC8vIElmIGFjbEdyb3VwIGhhcyAqIChwdWJsaWMpXG4gICAgICBpZiAoIWFjbEdyb3VwIHx8IGFjbEdyb3VwLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoYWNsR3JvdXAuaW5kZXhPZignKicpID4gLTEgJiYgYWNsR3JvdXAubGVuZ3RoID09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gcmVxdWlyZXNBdXRoZW50aWNhdGlvbiBwYXNzZWQsIGp1c3QgbW92ZSBmb3J3YXJkXG4gICAgICAvLyBwcm9iYWJseSB3b3VsZCBiZSB3aXNlIGF0IHNvbWUgcG9pbnQgdG8gcmVuYW1lIHRvICdhdXRoZW50aWNhdGVkVXNlcidcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICAvLyBObyBtYXRjaGluZyBDTFAsIGxldCdzIGNoZWNrIHRoZSBQb2ludGVyIHBlcm1pc3Npb25zXG4gICAgLy8gQW5kIGhhbmRsZSB0aG9zZSBsYXRlclxuICAgIGNvbnN0IHBlcm1pc3Npb25GaWVsZCA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICAvLyBSZWplY3QgY3JlYXRlIHdoZW4gd3JpdGUgbG9ja2Rvd25cbiAgICBpZiAocGVybWlzc2lvbkZpZWxkID09ICd3cml0ZVVzZXJGaWVsZHMnICYmIG9wZXJhdGlvbiA9PSAnY3JlYXRlJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyB0aGUgcmVhZFVzZXJGaWVsZHMgbGF0ZXJcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkgJiZcbiAgICAgIGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXS5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpICYmIHBvaW50ZXJGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYW55IG9wIGV4Y2VwdCAnYWRkRmllbGQgYXMgcGFydCBvZiBjcmVhdGUnIGlzIG9rLlxuICAgICAgaWYgKG9wZXJhdGlvbiAhPT0gJ2FkZEZpZWxkJyB8fCBhY3Rpb24gPT09ICd1cGRhdGUnKSB7XG4gICAgICAgIC8vIFdlIGNhbiBhbGxvdyBhZGRpbmcgZmllbGQgb24gdXBkYXRlIGZsb3cgb25seS5cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICApO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgdmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nLCBhY3Rpb24/OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb24sXG4gICAgICBhY3Rpb25cbiAgICApO1xuICB9XG5cbiAgZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0gJiYgdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZXhwZWN0ZWQgdHlwZSBmb3IgYSBjbGFzc05hbWUra2V5IGNvbWJpbmF0aW9uXG4gIC8vIG9yIHVuZGVmaW5lZCBpZiB0aGUgc2NoZW1hIGlzIG5vdCBzZXRcbiAgZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZyk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGV4cGVjdGVkVHlwZSA9PT0gJ21hcCcgPyAnT2JqZWN0JyA6IGV4cGVjdGVkVHlwZTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIENoZWNrcyBpZiBhIGdpdmVuIGNsYXNzIGlzIGluIHRoZSBzY2hlbWEuXG4gIGhhc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKCkudGhlbigoKSA9PiAhIXRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKTtcbiAgfVxufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBuZXcgU2NoZW1hLlxuY29uc3QgbG9hZCA9IChkYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBhbnkpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+ID0+IHtcbiAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYUNvbnRyb2xsZXIoZGJBZGFwdGVyKTtcbiAgdHRsLmR1cmF0aW9uID0gZGJBZGFwdGVyLnNjaGVtYUNhY2hlVHRsO1xuICByZXR1cm4gc2NoZW1hLnJlbG9hZERhdGEob3B0aW9ucykudGhlbigoKSA9PiBzY2hlbWEpO1xufTtcblxuLy8gQnVpbGRzIGEgbmV3IHNjaGVtYSAoaW4gc2NoZW1hIEFQSSByZXNwb25zZSBmb3JtYXQpIG91dCBvZiBhblxuLy8gZXhpc3RpbmcgbW9uZ28gc2NoZW1hICsgYSBzY2hlbWFzIEFQSSBwdXQgcmVxdWVzdC4gVGhpcyByZXNwb25zZVxuLy8gZG9lcyBub3QgaW5jbHVkZSB0aGUgZGVmYXVsdCBmaWVsZHMsIGFzIGl0IGlzIGludGVuZGVkIHRvIGJlIHBhc3NlZFxuLy8gdG8gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLiBObyB2YWxpZGF0aW9uIGlzIGRvbmUgaGVyZSwgaXRcbi8vIGlzIGRvbmUgaW4gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLlxuZnVuY3Rpb24gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHM6IFNjaGVtYUZpZWxkcywgcHV0UmVxdWVzdDogYW55KTogU2NoZW1hRmllbGRzIHtcbiAgY29uc3QgbmV3U2NoZW1hID0ge307XG4gIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICBjb25zdCBzeXNTY2hlbWFGaWVsZCA9XG4gICAgT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnMpLmluZGV4T2YoZXhpc3RpbmdGaWVsZHMuX2lkKSA9PT0gLTFcbiAgICAgID8gW11cbiAgICAgIDogT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnNbZXhpc3RpbmdGaWVsZHMuX2lkXSk7XG4gIGZvciAoY29uc3Qgb2xkRmllbGQgaW4gZXhpc3RpbmdGaWVsZHMpIHtcbiAgICBpZiAoXG4gICAgICBvbGRGaWVsZCAhPT0gJ19pZCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnQUNMJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICd1cGRhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ2NyZWF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnb2JqZWN0SWQnXG4gICAgKSB7XG4gICAgICBpZiAoc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJiBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG9sZEZpZWxkKSAhPT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWVsZElzRGVsZXRlZCA9IHB1dFJlcXVlc3Rbb2xkRmllbGRdICYmIHB1dFJlcXVlc3Rbb2xkRmllbGRdLl9fb3AgPT09ICdEZWxldGUnO1xuICAgICAgaWYgKCFmaWVsZElzRGVsZXRlZCkge1xuICAgICAgICBuZXdTY2hlbWFbb2xkRmllbGRdID0gZXhpc3RpbmdGaWVsZHNbb2xkRmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IG5ld0ZpZWxkIGluIHB1dFJlcXVlc3QpIHtcbiAgICBpZiAobmV3RmllbGQgIT09ICdvYmplY3RJZCcgJiYgcHV0UmVxdWVzdFtuZXdGaWVsZF0uX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2YobmV3RmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIG5ld1NjaGVtYVtuZXdGaWVsZF0gPSBwdXRSZXF1ZXN0W25ld0ZpZWxkXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ld1NjaGVtYTtcbn1cblxuLy8gR2l2ZW4gYSBzY2hlbWEgcHJvbWlzZSwgY29uc3RydWN0IGFub3RoZXIgc2NoZW1hIHByb21pc2UgdGhhdFxuLy8gdmFsaWRhdGVzIHRoaXMgZmllbGQgb25jZSB0aGUgc2NoZW1hIGxvYWRzLlxuZnVuY3Rpb24gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHNjaGVtYVByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSkge1xuICByZXR1cm4gc2NoZW1hUHJvbWlzZS50aGVuKHNjaGVtYSA9PiB7XG4gICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9KTtcbn1cblxuLy8gR2V0cyB0aGUgdHlwZSBmcm9tIGEgUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdCwgd2hlcmUgJ3R5cGUnIGlzXG4vLyBleHRlbmRlZCBwYXN0IGphdmFzY3JpcHQgdHlwZXMgdG8gaW5jbHVkZSB0aGUgcmVzdCBvZiB0aGUgUGFyc2Vcbi8vIHR5cGUgc3lzdGVtLlxuLy8gVGhlIG91dHB1dCBzaG91bGQgYmUgYSB2YWxpZCBzY2hlbWEgdmFsdWUuXG4vLyBUT0RPOiBlbnN1cmUgdGhhdCB0aGlzIGlzIGNvbXBhdGlibGUgd2l0aCB0aGUgZm9ybWF0IHVzZWQgaW4gT3BlbiBEQlxuZnVuY3Rpb24gZ2V0VHlwZShvYmo6IGFueSk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBvYmo7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdCb29sZWFuJztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuICdTdHJpbmcnO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iaik7XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ2JhZCBvYmo6ICcgKyBvYmo7XG4gIH1cbn1cblxuLy8gVGhpcyBnZXRzIHRoZSB0eXBlIGZvciBub24tSlNPTiB0eXBlcyBsaWtlIHBvaW50ZXJzIGFuZCBmaWxlcywgYnV0XG4vLyBhbHNvIGdldHMgdGhlIGFwcHJvcHJpYXRlIHR5cGUgZm9yICQgb3BlcmF0b3JzLlxuLy8gUmV0dXJucyBudWxsIGlmIHRoZSB0eXBlIGlzIHVua25vd24uXG5mdW5jdGlvbiBnZXRPYmplY3RUeXBlKG9iaik6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuICdBcnJheSc7XG4gIH1cbiAgaWYgKG9iai5fX3R5cGUpIHtcbiAgICBzd2l0Y2ggKG9iai5fX3R5cGUpIHtcbiAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICBpZiAob2JqLm5hbWUpIHtcbiAgICAgICAgICByZXR1cm4gJ0ZpbGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgIGlmIChvYmouaXNvKSB7XG4gICAgICAgICAgcmV0dXJuICdEYXRlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgaWYgKG9iai5sYXRpdHVkZSAhPSBudWxsICYmIG9iai5sb25naXR1ZGUgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBpZiAob2JqLmJhc2U2NCkge1xuICAgICAgICAgIHJldHVybiAnQnl0ZXMnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUG9seWdvbic6XG4gICAgICAgIGlmIChvYmouY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICByZXR1cm4gJ1BvbHlnb24nO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsICdUaGlzIGlzIG5vdCBhIHZhbGlkICcgKyBvYmouX190eXBlKTtcbiAgfVxuICBpZiAob2JqWyckbmUnXSkge1xuICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9ialsnJG5lJ10pO1xuICB9XG4gIGlmIChvYmouX19vcCkge1xuICAgIHN3aXRjaCAob2JqLl9fb3ApIHtcbiAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgY2FzZSAnQWRkJzpcbiAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICByZXR1cm4gJ0FycmF5JztcbiAgICAgIGNhc2UgJ0FkZFJlbGF0aW9uJzpcbiAgICAgIGNhc2UgJ1JlbW92ZVJlbGF0aW9uJzpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIHRhcmdldENsYXNzOiBvYmoub2JqZWN0c1swXS5jbGFzc05hbWUsXG4gICAgICAgIH07XG4gICAgICBjYXNlICdCYXRjaCc6XG4gICAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iai5vcHNbMF0pO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgJ3VuZXhwZWN0ZWQgb3A6ICcgKyBvYmouX19vcDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICdPYmplY3QnO1xufVxuXG5leHBvcnQge1xuICBsb2FkLFxuICBjbGFzc05hbWVJc1ZhbGlkLFxuICBmaWVsZE5hbWVJc1ZhbGlkLFxuICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSxcbiAgYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QsXG4gIHN5c3RlbUNsYXNzZXMsXG4gIGRlZmF1bHRDb2x1bW5zLFxuICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hLFxuICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICBTY2hlbWFDb250cm9sbGVyLFxuICByZXF1aXJlZENvbHVtbnMsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFrQkEsSUFBQUEsZUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsWUFBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsbUJBQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFJLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFLLFNBQUEsR0FBQUgsc0JBQUEsQ0FBQUYsT0FBQTtBQUFnQyxTQUFBRSx1QkFBQUksR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQUFBLFNBQUFHLFFBQUFDLE1BQUEsRUFBQUMsY0FBQSxRQUFBQyxJQUFBLEdBQUFDLE1BQUEsQ0FBQUQsSUFBQSxDQUFBRixNQUFBLE9BQUFHLE1BQUEsQ0FBQUMscUJBQUEsUUFBQUMsT0FBQSxHQUFBRixNQUFBLENBQUFDLHFCQUFBLENBQUFKLE1BQUEsR0FBQUMsY0FBQSxLQUFBSSxPQUFBLEdBQUFBLE9BQUEsQ0FBQUMsTUFBQSxXQUFBQyxHQUFBLFdBQUFKLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVIsTUFBQSxFQUFBTyxHQUFBLEVBQUFFLFVBQUEsT0FBQVAsSUFBQSxDQUFBUSxJQUFBLENBQUFDLEtBQUEsQ0FBQVQsSUFBQSxFQUFBRyxPQUFBLFlBQUFILElBQUE7QUFBQSxTQUFBVSxjQUFBQyxNQUFBLGFBQUFDLENBQUEsTUFBQUEsQ0FBQSxHQUFBQyxTQUFBLENBQUFDLE1BQUEsRUFBQUYsQ0FBQSxVQUFBRyxNQUFBLFdBQUFGLFNBQUEsQ0FBQUQsQ0FBQSxJQUFBQyxTQUFBLENBQUFELENBQUEsUUFBQUEsQ0FBQSxPQUFBZixPQUFBLENBQUFJLE1BQUEsQ0FBQWMsTUFBQSxPQUFBQyxPQUFBLFdBQUFDLEdBQUEsSUFBQUMsZUFBQSxDQUFBUCxNQUFBLEVBQUFNLEdBQUEsRUFBQUYsTUFBQSxDQUFBRSxHQUFBLFNBQUFoQixNQUFBLENBQUFrQix5QkFBQSxHQUFBbEIsTUFBQSxDQUFBbUIsZ0JBQUEsQ0FBQVQsTUFBQSxFQUFBVixNQUFBLENBQUFrQix5QkFBQSxDQUFBSixNQUFBLEtBQUFsQixPQUFBLENBQUFJLE1BQUEsQ0FBQWMsTUFBQSxHQUFBQyxPQUFBLFdBQUFDLEdBQUEsSUFBQWhCLE1BQUEsQ0FBQW9CLGNBQUEsQ0FBQVYsTUFBQSxFQUFBTSxHQUFBLEVBQUFoQixNQUFBLENBQUFLLHdCQUFBLENBQUFTLE1BQUEsRUFBQUUsR0FBQSxpQkFBQU4sTUFBQTtBQUFBLFNBQUFPLGdCQUFBeEIsR0FBQSxFQUFBdUIsR0FBQSxFQUFBSyxLQUFBLElBQUFMLEdBQUEsR0FBQU0sY0FBQSxDQUFBTixHQUFBLE9BQUFBLEdBQUEsSUFBQXZCLEdBQUEsSUFBQU8sTUFBQSxDQUFBb0IsY0FBQSxDQUFBM0IsR0FBQSxFQUFBdUIsR0FBQSxJQUFBSyxLQUFBLEVBQUFBLEtBQUEsRUFBQWYsVUFBQSxRQUFBaUIsWUFBQSxRQUFBQyxRQUFBLG9CQUFBL0IsR0FBQSxDQUFBdUIsR0FBQSxJQUFBSyxLQUFBLFdBQUE1QixHQUFBO0FBQUEsU0FBQTZCLGVBQUFHLEdBQUEsUUFBQVQsR0FBQSxHQUFBVSxZQUFBLENBQUFELEdBQUEsMkJBQUFULEdBQUEsZ0JBQUFBLEdBQUEsR0FBQVcsTUFBQSxDQUFBWCxHQUFBO0FBQUEsU0FBQVUsYUFBQUUsS0FBQSxFQUFBQyxJQUFBLGVBQUFELEtBQUEsaUJBQUFBLEtBQUEsa0JBQUFBLEtBQUEsTUFBQUUsSUFBQSxHQUFBRixLQUFBLENBQUFHLE1BQUEsQ0FBQUMsV0FBQSxPQUFBRixJQUFBLEtBQUFHLFNBQUEsUUFBQUMsR0FBQSxHQUFBSixJQUFBLENBQUFLLElBQUEsQ0FBQVAsS0FBQSxFQUFBQyxJQUFBLDJCQUFBSyxHQUFBLHNCQUFBQSxHQUFBLFlBQUFFLFNBQUEsNERBQUFQLElBQUEsZ0JBQUFGLE1BQUEsR0FBQVUsTUFBQSxFQUFBVCxLQUFBO0FBQUEsU0FBQVUsU0FBQSxJQUFBQSxRQUFBLEdBQUF0QyxNQUFBLENBQUF1QyxNQUFBLEdBQUF2QyxNQUFBLENBQUF1QyxNQUFBLENBQUFDLElBQUEsZUFBQTlCLE1BQUEsYUFBQUMsQ0FBQSxNQUFBQSxDQUFBLEdBQUFDLFNBQUEsQ0FBQUMsTUFBQSxFQUFBRixDQUFBLFVBQUFHLE1BQUEsR0FBQUYsU0FBQSxDQUFBRCxDQUFBLFlBQUFLLEdBQUEsSUFBQUYsTUFBQSxRQUFBZCxNQUFBLENBQUF5QyxTQUFBLENBQUFDLGNBQUEsQ0FBQVAsSUFBQSxDQUFBckIsTUFBQSxFQUFBRSxHQUFBLEtBQUFOLE1BQUEsQ0FBQU0sR0FBQSxJQUFBRixNQUFBLENBQUFFLEdBQUEsZ0JBQUFOLE1BQUEsWUFBQTRCLFFBQUEsQ0FBQTlCLEtBQUEsT0FBQUksU0FBQTtBQXRCaEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNK0IsS0FBSyxHQUFHeEQsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDd0QsS0FBSzs7QUFLekM7O0FBVUEsTUFBTUMsY0FBMEMsR0FBRzVDLE1BQU0sQ0FBQzZDLE1BQU0sQ0FBQztFQUMvRDtFQUNBQyxRQUFRLEVBQUU7SUFDUkMsUUFBUSxFQUFFO01BQUVDLElBQUksRUFBRTtJQUFTLENBQUM7SUFDNUJDLFNBQVMsRUFBRTtNQUFFRCxJQUFJLEVBQUU7SUFBTyxDQUFDO0lBQzNCRSxTQUFTLEVBQUU7TUFBRUYsSUFBSSxFQUFFO0lBQU8sQ0FBQztJQUMzQkcsR0FBRyxFQUFFO01BQUVILElBQUksRUFBRTtJQUFNO0VBQ3JCLENBQUM7RUFDRDtFQUNBSSxLQUFLLEVBQUU7SUFDTEMsUUFBUSxFQUFFO01BQUVMLElBQUksRUFBRTtJQUFTLENBQUM7SUFDNUJNLFFBQVEsRUFBRTtNQUFFTixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzVCTyxLQUFLLEVBQUU7TUFBRVAsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUN6QlEsYUFBYSxFQUFFO01BQUVSLElBQUksRUFBRTtJQUFVLENBQUM7SUFDbENTLFFBQVEsRUFBRTtNQUFFVCxJQUFJLEVBQUU7SUFBUztFQUM3QixDQUFDO0VBQ0Q7RUFDQVUsYUFBYSxFQUFFO0lBQ2JDLGNBQWMsRUFBRTtNQUFFWCxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ2xDWSxXQUFXLEVBQUU7TUFBRVosSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMvQmEsUUFBUSxFQUFFO01BQUViLElBQUksRUFBRTtJQUFRLENBQUM7SUFDM0JjLFVBQVUsRUFBRTtNQUFFZCxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzlCZSxRQUFRLEVBQUU7TUFBRWYsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM1QmdCLFdBQVcsRUFBRTtNQUFFaEIsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMvQmlCLFFBQVEsRUFBRTtNQUFFakIsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM1QmtCLGdCQUFnQixFQUFFO01BQUVsQixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3BDbUIsS0FBSyxFQUFFO01BQUVuQixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3pCb0IsVUFBVSxFQUFFO01BQUVwQixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzlCcUIsT0FBTyxFQUFFO01BQUVyQixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzNCc0IsYUFBYSxFQUFFO01BQUV0QixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ2pDdUIsWUFBWSxFQUFFO01BQUV2QixJQUFJLEVBQUU7SUFBUztFQUNqQyxDQUFDO0VBQ0Q7RUFDQXdCLEtBQUssRUFBRTtJQUNMQyxJQUFJLEVBQUU7TUFBRXpCLElBQUksRUFBRTtJQUFTLENBQUM7SUFDeEIwQixLQUFLLEVBQUU7TUFBRTFCLElBQUksRUFBRSxVQUFVO01BQUUyQixXQUFXLEVBQUU7SUFBUSxDQUFDO0lBQ2pEQyxLQUFLLEVBQUU7TUFBRTVCLElBQUksRUFBRSxVQUFVO01BQUUyQixXQUFXLEVBQUU7SUFBUTtFQUNsRCxDQUFDO0VBQ0Q7RUFDQUUsUUFBUSxFQUFFO0lBQ1JDLElBQUksRUFBRTtNQUFFOUIsSUFBSSxFQUFFLFNBQVM7TUFBRTJCLFdBQVcsRUFBRTtJQUFRLENBQUM7SUFDL0NoQixjQUFjLEVBQUU7TUFBRVgsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUNsQytCLFlBQVksRUFBRTtNQUFFL0IsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUNoQ2dDLFNBQVMsRUFBRTtNQUFFaEMsSUFBSSxFQUFFO0lBQU8sQ0FBQztJQUMzQmlDLFdBQVcsRUFBRTtNQUFFakMsSUFBSSxFQUFFO0lBQVM7RUFDaEMsQ0FBQztFQUNEa0MsUUFBUSxFQUFFO0lBQ1JDLGlCQUFpQixFQUFFO01BQUVuQyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3JDb0MsUUFBUSxFQUFFO01BQUVwQyxJQUFJLEVBQUU7SUFBTyxDQUFDO0lBQzFCcUMsWUFBWSxFQUFFO01BQUVyQyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ2hDc0MsSUFBSSxFQUFFO01BQUV0QyxJQUFJLEVBQUU7SUFBTyxDQUFDO0lBQ3RCdUMsS0FBSyxFQUFFO01BQUV2QyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3pCd0MsS0FBSyxFQUFFO01BQUV4QyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3pCeUMsUUFBUSxFQUFFO01BQUV6QyxJQUFJLEVBQUU7SUFBUztFQUM3QixDQUFDO0VBQ0QwQyxXQUFXLEVBQUU7SUFDWEMsUUFBUSxFQUFFO01BQUUzQyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzVCbEMsTUFBTSxFQUFFO01BQUVrQyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQUU7SUFDNUI0QyxLQUFLLEVBQUU7TUFBRTVDLElBQUksRUFBRTtJQUFTLENBQUM7SUFBRTtJQUMzQjZDLE9BQU8sRUFBRTtNQUFFN0MsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUFFO0lBQzdCd0MsS0FBSyxFQUFFO01BQUV4QyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3pCOEMsTUFBTSxFQUFFO01BQUU5QyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzFCK0MsbUJBQW1CLEVBQUU7TUFBRS9DLElBQUksRUFBRTtJQUFTLENBQUM7SUFDdkNnRCxNQUFNLEVBQUU7TUFBRWhELElBQUksRUFBRTtJQUFTLENBQUM7SUFDMUJpRCxPQUFPLEVBQUU7TUFBRWpELElBQUksRUFBRTtJQUFTLENBQUM7SUFDM0JrRCxTQUFTLEVBQUU7TUFBRWxELElBQUksRUFBRTtJQUFTLENBQUM7SUFDN0JtRCxRQUFRLEVBQUU7TUFBRW5ELElBQUksRUFBRTtJQUFTLENBQUM7SUFDNUJvRCxZQUFZLEVBQUU7TUFBRXBELElBQUksRUFBRTtJQUFTLENBQUM7SUFDaENxRCxXQUFXLEVBQUU7TUFBRXJELElBQUksRUFBRTtJQUFTLENBQUM7SUFDL0JzRCxhQUFhLEVBQUU7TUFBRXRELElBQUksRUFBRTtJQUFTLENBQUM7SUFDakN1RCxnQkFBZ0IsRUFBRTtNQUFFdkQsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUNwQ3dELGtCQUFrQixFQUFFO01BQUV4RCxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3RDeUQsS0FBSyxFQUFFO01BQUV6RCxJQUFJLEVBQUU7SUFBUyxDQUFDLENBQUU7RUFDN0IsQ0FBQzs7RUFDRDBELFVBQVUsRUFBRTtJQUNWQyxPQUFPLEVBQUU7TUFBRTNELElBQUksRUFBRTtJQUFTLENBQUM7SUFDM0JsQyxNQUFNLEVBQUU7TUFBRWtDLElBQUksRUFBRTtJQUFTLENBQUM7SUFDMUJnRCxNQUFNLEVBQUU7TUFBRWhELElBQUksRUFBRTtJQUFTLENBQUM7SUFDMUI0RCxPQUFPLEVBQUU7TUFBRTVELElBQUksRUFBRTtJQUFTLENBQUM7SUFDM0I2RCxNQUFNLEVBQUU7TUFBRTdELElBQUksRUFBRTtJQUFTLENBQUM7SUFBRTtJQUM1QjhELFVBQVUsRUFBRTtNQUFFOUQsSUFBSSxFQUFFO0lBQU87RUFDN0IsQ0FBQztFQUNEK0QsWUFBWSxFQUFFO0lBQ1pKLE9BQU8sRUFBRTtNQUFFM0QsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMzQmdFLFdBQVcsRUFBRTtNQUFFaEUsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMvQjZELE1BQU0sRUFBRTtNQUFFN0QsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMxQmlFLFVBQVUsRUFBRTtNQUFFakUsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM5QmtFLFVBQVUsRUFBRTtNQUFFbEUsSUFBSSxFQUFFO0lBQVEsQ0FBQztJQUM3Qm1FLFNBQVMsRUFBRTtNQUFFbkUsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM3Qm9FLE9BQU8sRUFBRTtNQUFFcEUsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMzQnFFLGFBQWEsRUFBRTtNQUFFckUsSUFBSSxFQUFFO0lBQVM7RUFDbEMsQ0FBQztFQUNEc0UsTUFBTSxFQUFFO0lBQ05DLFlBQVksRUFBRTtNQUFFdkUsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUNoQ3dFLFNBQVMsRUFBRTtNQUFFeEUsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM3QnlFLFdBQVcsRUFBRTtNQUFFekUsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMvQjBFLEdBQUcsRUFBRTtNQUFFMUUsSUFBSSxFQUFFO0lBQVM7RUFDeEIsQ0FBQztFQUNEMkUsYUFBYSxFQUFFO0lBQ2I1RSxRQUFRLEVBQUU7TUFBRUMsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM1QjZELE1BQU0sRUFBRTtNQUFFN0QsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUMxQjRFLGFBQWEsRUFBRTtNQUFFNUUsSUFBSSxFQUFFO0lBQVM7RUFDbEMsQ0FBQztFQUNENkUsY0FBYyxFQUFFO0lBQ2Q5RSxRQUFRLEVBQUU7TUFBRUMsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM1QjhFLE1BQU0sRUFBRTtNQUFFOUUsSUFBSSxFQUFFO0lBQVM7RUFDM0IsQ0FBQztFQUNEK0UsU0FBUyxFQUFFO0lBQ1RoRixRQUFRLEVBQUU7TUFBRUMsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM1QnlCLElBQUksRUFBRTtNQUFFekIsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUN4QjRDLEtBQUssRUFBRTtNQUFFNUMsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUFFO0lBQzNCZ0YsUUFBUSxFQUFFO01BQUVoRixJQUFJLEVBQUU7SUFBTyxDQUFDO0lBQzFCaUYsU0FBUyxFQUFFO01BQUVqRixJQUFJLEVBQUU7SUFBUztFQUM5QixDQUFDO0VBQ0RrRixZQUFZLEVBQUU7SUFDWkMsS0FBSyxFQUFFO01BQUVuRixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3pCb0YsTUFBTSxFQUFFO01BQUVwRixJQUFJLEVBQUU7SUFBTztFQUN6QixDQUFDO0VBQ0RxRixlQUFlLEVBQUU7SUFDZnRGLFFBQVEsRUFBRTtNQUFFQyxJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzVCc0YsRUFBRSxFQUFFO01BQUV0RixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQ3RCdUYsU0FBUyxFQUFFO01BQUV2RixJQUFJLEVBQUU7SUFBUyxDQUFDO0lBQzdCd0YsYUFBYSxFQUFFO01BQUV4RixJQUFJLEVBQUU7SUFBUztFQUNsQztBQUNGLENBQUMsQ0FBQzs7QUFFRjtBQUFBeUYsT0FBQSxDQUFBN0YsY0FBQSxHQUFBQSxjQUFBO0FBQ0EsTUFBTThGLGVBQWUsR0FBRzFJLE1BQU0sQ0FBQzZDLE1BQU0sQ0FBQztFQUNwQzhGLElBQUksRUFBRTtJQUNKdkYsS0FBSyxFQUFFLENBQUMsVUFBVTtFQUNwQixDQUFDO0VBQ0R3RixLQUFLLEVBQUU7SUFDTDFELFFBQVEsRUFBRSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsQ0FBQztJQUNyRVYsS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUs7RUFDdkI7QUFDRixDQUFDLENBQUM7QUFBQ2lFLE9BQUEsQ0FBQUMsZUFBQSxHQUFBQSxlQUFBO0FBRUgsTUFBTUcsY0FBYyxHQUFHLENBQUMsUUFBUSxDQUFDO0FBRWpDLE1BQU1DLGFBQWEsR0FBRzlJLE1BQU0sQ0FBQzZDLE1BQU0sQ0FBQyxDQUNsQyxPQUFPLEVBQ1AsZUFBZSxFQUNmLE9BQU8sRUFDUCxVQUFVLEVBQ1YsVUFBVSxFQUNWLGFBQWEsRUFDYixZQUFZLEVBQ1osY0FBYyxFQUNkLFdBQVcsRUFDWCxjQUFjLEVBQ2QsaUJBQWlCLENBQ2xCLENBQUM7QUFBQzRGLE9BQUEsQ0FBQUssYUFBQSxHQUFBQSxhQUFBO0FBRUgsTUFBTUMsZUFBZSxHQUFHL0ksTUFBTSxDQUFDNkMsTUFBTSxDQUFDLENBQ3BDLFlBQVksRUFDWixhQUFhLEVBQ2IsUUFBUSxFQUNSLGVBQWUsRUFDZixnQkFBZ0IsRUFDaEIsY0FBYyxFQUNkLFdBQVcsRUFDWCxjQUFjLEVBQ2QsaUJBQWlCLENBQ2xCLENBQUM7O0FBRUY7QUFDQSxNQUFNbUcsU0FBUyxHQUFHLFVBQVU7QUFDNUI7QUFDQSxNQUFNQywyQkFBMkIsR0FBRyxlQUFlO0FBQ25EO0FBQ0EsTUFBTUMsV0FBVyxHQUFHLE1BQU07QUFFMUIsTUFBTUMsa0JBQWtCLEdBQUcsaUJBQWlCO0FBRTVDLE1BQU1DLDJCQUEyQixHQUFHLDBCQUEwQjtBQUU5RCxNQUFNQyxlQUFlLEdBQUcsaUJBQWlCOztBQUV6QztBQUNBLE1BQU1DLG9CQUFvQixHQUFHdEosTUFBTSxDQUFDNkMsTUFBTSxDQUFDLENBQ3pDb0csMkJBQTJCLEVBQzNCQyxXQUFXLEVBQ1hDLGtCQUFrQixFQUNsQkgsU0FBUyxDQUNWLENBQUM7O0FBRUY7QUFDQSxNQUFNTyxjQUFjLEdBQUd2SixNQUFNLENBQUM2QyxNQUFNLENBQUMsQ0FDbkN3RyxlQUFlLEVBQ2ZILFdBQVcsRUFDWEUsMkJBQTJCLEVBQzNCSixTQUFTLENBQ1YsQ0FBQztBQUVGLFNBQVNRLHFCQUFxQkEsQ0FBQ3hJLEdBQUcsRUFBRXlJLFlBQVksRUFBRTtFQUNoRCxJQUFJQyxXQUFXLEdBQUcsS0FBSztFQUN2QixLQUFLLE1BQU1DLEtBQUssSUFBSUosY0FBYyxFQUFFO0lBQ2xDLElBQUl2SSxHQUFHLENBQUM0SSxLQUFLLENBQUNELEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtNQUM3QkQsV0FBVyxHQUFHLElBQUk7TUFDbEI7SUFDRjtFQUNGOztFQUVBO0VBQ0EsTUFBTUcsS0FBSyxHQUFHSCxXQUFXLElBQUkxSSxHQUFHLENBQUM0SSxLQUFLLENBQUNILFlBQVksQ0FBQyxLQUFLLElBQUk7RUFDN0QsSUFBSSxDQUFDSSxLQUFLLEVBQUU7SUFDVixNQUFNLElBQUlsSCxLQUFLLENBQUNtSCxLQUFLLENBQ25CbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDQyxZQUFZLEVBQ3ZCLElBQUcvSSxHQUFJLGtEQUNWLENBQUM7RUFDSDtBQUNGO0FBRUEsU0FBU2dKLDBCQUEwQkEsQ0FBQ2hKLEdBQUcsRUFBRXlJLFlBQVksRUFBRTtFQUNyRCxJQUFJQyxXQUFXLEdBQUcsS0FBSztFQUN2QixLQUFLLE1BQU1DLEtBQUssSUFBSUwsb0JBQW9CLEVBQUU7SUFDeEMsSUFBSXRJLEdBQUcsQ0FBQzRJLEtBQUssQ0FBQ0QsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO01BQzdCRCxXQUFXLEdBQUcsSUFBSTtNQUNsQjtJQUNGO0VBQ0Y7O0VBRUE7RUFDQSxNQUFNRyxLQUFLLEdBQUdILFdBQVcsSUFBSTFJLEdBQUcsQ0FBQzRJLEtBQUssQ0FBQ0gsWUFBWSxDQUFDLEtBQUssSUFBSTtFQUM3RCxJQUFJLENBQUNJLEtBQUssRUFBRTtJQUNWLE1BQU0sSUFBSWxILEtBQUssQ0FBQ21ILEtBQUssQ0FDbkJuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNDLFlBQVksRUFDdkIsSUFBRy9JLEdBQUksa0RBQ1YsQ0FBQztFQUNIO0FBQ0Y7QUFFQSxNQUFNaUosWUFBWSxHQUFHakssTUFBTSxDQUFDNkMsTUFBTSxDQUFDLENBQ2pDLE1BQU0sRUFDTixPQUFPLEVBQ1AsS0FBSyxFQUNMLFFBQVEsRUFDUixRQUFRLEVBQ1IsUUFBUSxFQUNSLFVBQVUsRUFDVixnQkFBZ0IsRUFDaEIsaUJBQWlCLEVBQ2pCLGlCQUFpQixDQUNsQixDQUFDOztBQUVGO0FBQ0EsU0FBU3FILFdBQVdBLENBQUNDLEtBQTRCLEVBQUVDLE1BQW9CLEVBQUVYLFlBQW9CLEVBQUU7RUFDN0YsSUFBSSxDQUFDVSxLQUFLLEVBQUU7SUFDVjtFQUNGO0VBQ0EsS0FBSyxNQUFNRSxZQUFZLElBQUlGLEtBQUssRUFBRTtJQUNoQyxJQUFJRixZQUFZLENBQUNLLE9BQU8sQ0FBQ0QsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUU7TUFDNUMsTUFBTSxJQUFJMUgsS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ0MsWUFBWSxFQUN2QixHQUFFTSxZQUFhLHVEQUNsQixDQUFDO0lBQ0g7SUFFQSxNQUFNRSxTQUFTLEdBQUdKLEtBQUssQ0FBQ0UsWUFBWSxDQUFDO0lBQ3JDOztJQUVBO0lBQ0FHLGVBQWUsQ0FBQ0QsU0FBUyxFQUFFRixZQUFZLENBQUM7SUFFeEMsSUFBSUEsWUFBWSxLQUFLLGdCQUFnQixJQUFJQSxZQUFZLEtBQUssaUJBQWlCLEVBQUU7TUFDM0U7TUFDQTtNQUNBLEtBQUssTUFBTUksU0FBUyxJQUFJRixTQUFTLEVBQUU7UUFDakNHLHlCQUF5QixDQUFDRCxTQUFTLEVBQUVMLE1BQU0sRUFBRUMsWUFBWSxDQUFDO01BQzVEO01BQ0E7TUFDQTtNQUNBO0lBQ0Y7O0lBRUE7SUFDQSxJQUFJQSxZQUFZLEtBQUssaUJBQWlCLEVBQUU7TUFDdEMsS0FBSyxNQUFNTSxNQUFNLElBQUlKLFNBQVMsRUFBRTtRQUM5QjtRQUNBUCwwQkFBMEIsQ0FBQ1csTUFBTSxFQUFFbEIsWUFBWSxDQUFDO1FBRWhELE1BQU1tQixlQUFlLEdBQUdMLFNBQVMsQ0FBQ0ksTUFBTSxDQUFDO1FBRXpDLElBQUksQ0FBQ0UsS0FBSyxDQUFDQyxPQUFPLENBQUNGLGVBQWUsQ0FBQyxFQUFFO1VBQ25DLE1BQU0sSUFBSWpJLEtBQUssQ0FBQ21ILEtBQUssQ0FDbkJuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNDLFlBQVksRUFDdkIsSUFBR2EsZUFBZ0IsOENBQTZDRCxNQUFPLHdCQUMxRSxDQUFDO1FBQ0g7O1FBRUE7UUFDQSxLQUFLLE1BQU1JLEtBQUssSUFBSUgsZUFBZSxFQUFFO1VBQ25DO1VBQ0EsSUFBSWhJLGNBQWMsQ0FBQ0UsUUFBUSxDQUFDaUksS0FBSyxDQUFDLEVBQUU7WUFDbEMsTUFBTSxJQUFJcEksS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ0MsWUFBWSxFQUN2QixrQkFBaUJnQixLQUFNLHdCQUMxQixDQUFDO1VBQ0g7VUFDQTtVQUNBLElBQUksQ0FBQy9LLE1BQU0sQ0FBQ3lDLFNBQVMsQ0FBQ0MsY0FBYyxDQUFDUCxJQUFJLENBQUNpSSxNQUFNLEVBQUVXLEtBQUssQ0FBQyxFQUFFO1lBQ3hELE1BQU0sSUFBSXBJLEtBQUssQ0FBQ21ILEtBQUssQ0FDbkJuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNDLFlBQVksRUFDdkIsVUFBU2dCLEtBQU0sd0JBQXVCSixNQUFPLGlCQUNoRCxDQUFDO1VBQ0g7UUFDRjtNQUNGO01BQ0E7TUFDQTtJQUNGOztJQUVBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsS0FBSyxNQUFNQSxNQUFNLElBQUlKLFNBQVMsRUFBRTtNQUM5QjtNQUNBZixxQkFBcUIsQ0FBQ21CLE1BQU0sRUFBRWxCLFlBQVksQ0FBQzs7TUFFM0M7TUFDQTtNQUNBLElBQUlrQixNQUFNLEtBQUssZUFBZSxFQUFFO1FBQzlCLE1BQU1LLGFBQWEsR0FBR1QsU0FBUyxDQUFDSSxNQUFNLENBQUM7UUFFdkMsSUFBSUUsS0FBSyxDQUFDQyxPQUFPLENBQUNFLGFBQWEsQ0FBQyxFQUFFO1VBQ2hDLEtBQUssTUFBTUMsWUFBWSxJQUFJRCxhQUFhLEVBQUU7WUFDeENOLHlCQUF5QixDQUFDTyxZQUFZLEVBQUViLE1BQU0sRUFBRUcsU0FBUyxDQUFDO1VBQzVEO1FBQ0YsQ0FBQyxNQUFNO1VBQ0wsTUFBTSxJQUFJNUgsS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ0MsWUFBWSxFQUN2QixJQUFHaUIsYUFBYyw4QkFBNkJYLFlBQWEsSUFBR00sTUFBTyx3QkFDeEUsQ0FBQztRQUNIO1FBQ0E7UUFDQTtNQUNGOztNQUVBO01BQ0EsTUFBTU8sTUFBTSxHQUFHWCxTQUFTLENBQUNJLE1BQU0sQ0FBQztNQUVoQyxJQUFJTyxNQUFNLEtBQUssSUFBSSxFQUFFO1FBQ25CLE1BQU0sSUFBSXZJLEtBQUssQ0FBQ21ILEtBQUssQ0FDbkJuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNDLFlBQVksRUFDdkIsSUFBR21CLE1BQU8sc0RBQXFEYixZQUFhLElBQUdNLE1BQU8sSUFBR08sTUFBTyxFQUNuRyxDQUFDO01BQ0g7SUFDRjtFQUNGO0FBQ0Y7QUFFQSxTQUFTVixlQUFlQSxDQUFDRCxTQUFjLEVBQUVGLFlBQW9CLEVBQUU7RUFDN0QsSUFBSUEsWUFBWSxLQUFLLGdCQUFnQixJQUFJQSxZQUFZLEtBQUssaUJBQWlCLEVBQUU7SUFDM0UsSUFBSSxDQUFDUSxLQUFLLENBQUNDLE9BQU8sQ0FBQ1AsU0FBUyxDQUFDLEVBQUU7TUFDN0IsTUFBTSxJQUFJNUgsS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ0MsWUFBWSxFQUN2QixJQUFHUSxTQUFVLHNEQUFxREYsWUFBYSxxQkFDbEYsQ0FBQztJQUNIO0VBQ0YsQ0FBQyxNQUFNO0lBQ0wsSUFBSSxPQUFPRSxTQUFTLEtBQUssUUFBUSxJQUFJQSxTQUFTLEtBQUssSUFBSSxFQUFFO01BQ3ZEO01BQ0E7SUFDRixDQUFDLE1BQU07TUFDTCxNQUFNLElBQUk1SCxLQUFLLENBQUNtSCxLQUFLLENBQ25CbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDQyxZQUFZLEVBQ3ZCLElBQUdRLFNBQVUsc0RBQXFERixZQUFhLHNCQUNsRixDQUFDO0lBQ0g7RUFDRjtBQUNGO0FBRUEsU0FBU0sseUJBQXlCQSxDQUFDRCxTQUFpQixFQUFFTCxNQUFjLEVBQUVHLFNBQWlCLEVBQUU7RUFDdkY7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQSxJQUNFLEVBQ0VILE1BQU0sQ0FBQ0ssU0FBUyxDQUFDLEtBQ2ZMLE1BQU0sQ0FBQ0ssU0FBUyxDQUFDLENBQUN6SCxJQUFJLElBQUksU0FBUyxJQUFJb0gsTUFBTSxDQUFDSyxTQUFTLENBQUMsQ0FBQzlGLFdBQVcsSUFBSSxPQUFPLElBQy9FeUYsTUFBTSxDQUFDSyxTQUFTLENBQUMsQ0FBQ3pILElBQUksSUFBSSxPQUFPLENBQUMsQ0FDckMsRUFDRDtJQUNBLE1BQU0sSUFBSUwsS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ0MsWUFBWSxFQUN2QixJQUFHVSxTQUFVLCtEQUE4REYsU0FBVSxFQUN4RixDQUFDO0VBQ0g7QUFDRjtBQUVBLE1BQU1ZLGNBQWMsR0FBRyxvQ0FBb0M7QUFDM0QsTUFBTUMsa0JBQWtCLEdBQUcseUJBQXlCO0FBQ3BELFNBQVNDLGdCQUFnQkEsQ0FBQzdELFNBQWlCLEVBQVc7RUFDcEQ7RUFDQTtJQUNFO0lBQ0FzQixhQUFhLENBQUN3QixPQUFPLENBQUM5QyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDckM7SUFDQTJELGNBQWMsQ0FBQ0csSUFBSSxDQUFDOUQsU0FBUyxDQUFDO0lBQzlCO0lBQ0ErRCxnQkFBZ0IsQ0FBQy9ELFNBQVMsRUFBRUEsU0FBUztFQUFDO0FBRTFDOztBQUVBO0FBQ0E7QUFDQSxTQUFTK0QsZ0JBQWdCQSxDQUFDZCxTQUFpQixFQUFFakQsU0FBaUIsRUFBVztFQUN2RSxJQUFJQSxTQUFTLElBQUlBLFNBQVMsS0FBSyxRQUFRLEVBQUU7SUFDdkMsSUFBSWlELFNBQVMsS0FBSyxXQUFXLEVBQUU7TUFDN0IsT0FBTyxLQUFLO0lBQ2Q7RUFDRjtFQUNBLE9BQU9XLGtCQUFrQixDQUFDRSxJQUFJLENBQUNiLFNBQVMsQ0FBQyxJQUFJLENBQUM1QixjQUFjLENBQUMyQyxRQUFRLENBQUNmLFNBQVMsQ0FBQztBQUNsRjs7QUFFQTtBQUNBLFNBQVNnQix3QkFBd0JBLENBQUNoQixTQUFpQixFQUFFakQsU0FBaUIsRUFBVztFQUMvRSxJQUFJLENBQUMrRCxnQkFBZ0IsQ0FBQ2QsU0FBUyxFQUFFakQsU0FBUyxDQUFDLEVBQUU7SUFDM0MsT0FBTyxLQUFLO0VBQ2Q7RUFDQSxJQUFJNUUsY0FBYyxDQUFDRSxRQUFRLENBQUMySCxTQUFTLENBQUMsRUFBRTtJQUN0QyxPQUFPLEtBQUs7RUFDZDtFQUNBLElBQUk3SCxjQUFjLENBQUM0RSxTQUFTLENBQUMsSUFBSTVFLGNBQWMsQ0FBQzRFLFNBQVMsQ0FBQyxDQUFDaUQsU0FBUyxDQUFDLEVBQUU7SUFDckUsT0FBTyxLQUFLO0VBQ2Q7RUFDQSxPQUFPLElBQUk7QUFDYjtBQUVBLFNBQVNpQix1QkFBdUJBLENBQUNsRSxTQUFpQixFQUFVO0VBQzFELE9BQ0UscUJBQXFCLEdBQ3JCQSxTQUFTLEdBQ1QsbUdBQW1HO0FBRXZHO0FBRUEsTUFBTW1FLGdCQUFnQixHQUFHLElBQUloSixLQUFLLENBQUNtSCxLQUFLLENBQUNuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNDLFlBQVksRUFBRSxjQUFjLENBQUM7QUFDbEYsTUFBTTZCLDhCQUE4QixHQUFHLENBQ3JDLFFBQVEsRUFDUixRQUFRLEVBQ1IsU0FBUyxFQUNULE1BQU0sRUFDTixRQUFRLEVBQ1IsT0FBTyxFQUNQLFVBQVUsRUFDVixNQUFNLEVBQ04sT0FBTyxFQUNQLFNBQVMsQ0FDVjtBQUNEO0FBQ0EsTUFBTUMsa0JBQWtCLEdBQUdBLENBQUM7RUFBRTdJLElBQUk7RUFBRTJCO0FBQVksQ0FBQyxLQUFLO0VBQ3BELElBQUksQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUMyRixPQUFPLENBQUN0SCxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7SUFDOUMsSUFBSSxDQUFDMkIsV0FBVyxFQUFFO01BQ2hCLE9BQU8sSUFBSWhDLEtBQUssQ0FBQ21ILEtBQUssQ0FBQyxHQUFHLEVBQUcsUUFBTzlHLElBQUsscUJBQW9CLENBQUM7SUFDaEUsQ0FBQyxNQUFNLElBQUksT0FBTzJCLFdBQVcsS0FBSyxRQUFRLEVBQUU7TUFDMUMsT0FBT2dILGdCQUFnQjtJQUN6QixDQUFDLE1BQU0sSUFBSSxDQUFDTixnQkFBZ0IsQ0FBQzFHLFdBQVcsQ0FBQyxFQUFFO01BQ3pDLE9BQU8sSUFBSWhDLEtBQUssQ0FBQ21ILEtBQUssQ0FBQ25ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ2dDLGtCQUFrQixFQUFFSix1QkFBdUIsQ0FBQy9HLFdBQVcsQ0FBQyxDQUFDO0lBQzlGLENBQUMsTUFBTTtNQUNMLE9BQU8xQyxTQUFTO0lBQ2xCO0VBQ0Y7RUFDQSxJQUFJLE9BQU9lLElBQUksS0FBSyxRQUFRLEVBQUU7SUFDNUIsT0FBTzJJLGdCQUFnQjtFQUN6QjtFQUNBLElBQUlDLDhCQUE4QixDQUFDdEIsT0FBTyxDQUFDdEgsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQ3BELE9BQU8sSUFBSUwsS0FBSyxDQUFDbUgsS0FBSyxDQUFDbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDaUMsY0FBYyxFQUFHLHVCQUFzQi9JLElBQUssRUFBQyxDQUFDO0VBQ25GO0VBQ0EsT0FBT2YsU0FBUztBQUNsQixDQUFDO0FBRUQsTUFBTStKLDRCQUE0QixHQUFJQyxNQUFXLElBQUs7RUFDcERBLE1BQU0sR0FBR0MsbUJBQW1CLENBQUNELE1BQU0sQ0FBQztFQUNwQyxPQUFPQSxNQUFNLENBQUM3QixNQUFNLENBQUNqSCxHQUFHO0VBQ3hCOEksTUFBTSxDQUFDN0IsTUFBTSxDQUFDK0IsTUFBTSxHQUFHO0lBQUVuSixJQUFJLEVBQUU7RUFBUSxDQUFDO0VBQ3hDaUosTUFBTSxDQUFDN0IsTUFBTSxDQUFDZ0MsTUFBTSxHQUFHO0lBQUVwSixJQUFJLEVBQUU7RUFBUSxDQUFDO0VBRXhDLElBQUlpSixNQUFNLENBQUN6RSxTQUFTLEtBQUssT0FBTyxFQUFFO0lBQ2hDLE9BQU95RSxNQUFNLENBQUM3QixNQUFNLENBQUM5RyxRQUFRO0lBQzdCMkksTUFBTSxDQUFDN0IsTUFBTSxDQUFDaUMsZ0JBQWdCLEdBQUc7TUFBRXJKLElBQUksRUFBRTtJQUFTLENBQUM7RUFDckQ7RUFFQSxPQUFPaUosTUFBTTtBQUNmLENBQUM7QUFBQ3hELE9BQUEsQ0FBQXVELDRCQUFBLEdBQUFBLDRCQUFBO0FBRUYsTUFBTU0saUNBQWlDLEdBQUdDLElBQUEsSUFBbUI7RUFBQSxJQUFiTixNQUFNLEdBQUEzSixRQUFBLEtBQUFpSyxJQUFBO0VBQ3BELE9BQU9OLE1BQU0sQ0FBQzdCLE1BQU0sQ0FBQytCLE1BQU07RUFDM0IsT0FBT0YsTUFBTSxDQUFDN0IsTUFBTSxDQUFDZ0MsTUFBTTtFQUUzQkgsTUFBTSxDQUFDN0IsTUFBTSxDQUFDakgsR0FBRyxHQUFHO0lBQUVILElBQUksRUFBRTtFQUFNLENBQUM7RUFFbkMsSUFBSWlKLE1BQU0sQ0FBQ3pFLFNBQVMsS0FBSyxPQUFPLEVBQUU7SUFDaEMsT0FBT3lFLE1BQU0sQ0FBQzdCLE1BQU0sQ0FBQzNHLFFBQVEsQ0FBQyxDQUFDO0lBQy9CLE9BQU93SSxNQUFNLENBQUM3QixNQUFNLENBQUNpQyxnQkFBZ0I7SUFDckNKLE1BQU0sQ0FBQzdCLE1BQU0sQ0FBQzlHLFFBQVEsR0FBRztNQUFFTixJQUFJLEVBQUU7SUFBUyxDQUFDO0VBQzdDO0VBRUEsSUFBSWlKLE1BQU0sQ0FBQ08sT0FBTyxJQUFJeE0sTUFBTSxDQUFDRCxJQUFJLENBQUNrTSxNQUFNLENBQUNPLE9BQU8sQ0FBQyxDQUFDM0wsTUFBTSxLQUFLLENBQUMsRUFBRTtJQUM5RCxPQUFPb0wsTUFBTSxDQUFDTyxPQUFPO0VBQ3ZCO0VBRUEsT0FBT1AsTUFBTTtBQUNmLENBQUM7QUFFRCxNQUFNUSxVQUFVLENBQUM7RUFHZkMsV0FBV0EsQ0FBQ0MsVUFBVSxHQUFHLEVBQUUsRUFBRS9CLGVBQWUsR0FBRyxDQUFDLENBQUMsRUFBRTtJQUNqRCxJQUFJLENBQUNnQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLElBQUksQ0FBQ0MsaUJBQWlCLEdBQUdqQyxlQUFlO0lBQ3hDK0IsVUFBVSxDQUFDNUwsT0FBTyxDQUFDa0wsTUFBTSxJQUFJO01BQzNCLElBQUlsRCxlQUFlLENBQUN5QyxRQUFRLENBQUNTLE1BQU0sQ0FBQ3pFLFNBQVMsQ0FBQyxFQUFFO1FBQzlDO01BQ0Y7TUFDQXhILE1BQU0sQ0FBQ29CLGNBQWMsQ0FBQyxJQUFJLEVBQUU2SyxNQUFNLENBQUN6RSxTQUFTLEVBQUU7UUFDNUNzRixHQUFHLEVBQUVBLENBQUEsS0FBTTtVQUNULElBQUksQ0FBQyxJQUFJLENBQUNGLE1BQU0sQ0FBQ1gsTUFBTSxDQUFDekUsU0FBUyxDQUFDLEVBQUU7WUFDbEMsTUFBTXVGLElBQUksR0FBRyxDQUFDLENBQUM7WUFDZkEsSUFBSSxDQUFDM0MsTUFBTSxHQUFHOEIsbUJBQW1CLENBQUNELE1BQU0sQ0FBQyxDQUFDN0IsTUFBTTtZQUNoRDJDLElBQUksQ0FBQ0MscUJBQXFCLEdBQUcsSUFBQUMsaUJBQVEsRUFBQ2hCLE1BQU0sQ0FBQ2UscUJBQXFCLENBQUM7WUFDbkVELElBQUksQ0FBQ1AsT0FBTyxHQUFHUCxNQUFNLENBQUNPLE9BQU87WUFFN0IsTUFBTVUsb0JBQW9CLEdBQUcsSUFBSSxDQUFDTCxpQkFBaUIsQ0FBQ1osTUFBTSxDQUFDekUsU0FBUyxDQUFDO1lBQ3JFLElBQUkwRixvQkFBb0IsRUFBRTtjQUN4QixLQUFLLE1BQU1sTSxHQUFHLElBQUlrTSxvQkFBb0IsRUFBRTtnQkFDdEMsTUFBTUMsR0FBRyxHQUFHLElBQUlDLEdBQUcsQ0FBQyxDQUNsQixJQUFJTCxJQUFJLENBQUNDLHFCQUFxQixDQUFDcEMsZUFBZSxDQUFDNUosR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQzFELEdBQUdrTSxvQkFBb0IsQ0FBQ2xNLEdBQUcsQ0FBQyxDQUM3QixDQUFDO2dCQUNGK0wsSUFBSSxDQUFDQyxxQkFBcUIsQ0FBQ3BDLGVBQWUsQ0FBQzVKLEdBQUcsQ0FBQyxHQUFHNkosS0FBSyxDQUFDd0MsSUFBSSxDQUFDRixHQUFHLENBQUM7Y0FDbkU7WUFDRjtZQUVBLElBQUksQ0FBQ1AsTUFBTSxDQUFDWCxNQUFNLENBQUN6RSxTQUFTLENBQUMsR0FBR3VGLElBQUk7VUFDdEM7VUFDQSxPQUFPLElBQUksQ0FBQ0gsTUFBTSxDQUFDWCxNQUFNLENBQUN6RSxTQUFTLENBQUM7UUFDdEM7TUFDRixDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7O0lBRUY7SUFDQXVCLGVBQWUsQ0FBQ2hJLE9BQU8sQ0FBQ3lHLFNBQVMsSUFBSTtNQUNuQ3hILE1BQU0sQ0FBQ29CLGNBQWMsQ0FBQyxJQUFJLEVBQUVvRyxTQUFTLEVBQUU7UUFDckNzRixHQUFHLEVBQUVBLENBQUEsS0FBTTtVQUNULElBQUksQ0FBQyxJQUFJLENBQUNGLE1BQU0sQ0FBQ3BGLFNBQVMsQ0FBQyxFQUFFO1lBQzNCLE1BQU15RSxNQUFNLEdBQUdDLG1CQUFtQixDQUFDO2NBQ2pDMUUsU0FBUztjQUNUNEMsTUFBTSxFQUFFLENBQUMsQ0FBQztjQUNWNEMscUJBQXFCLEVBQUUsQ0FBQztZQUMxQixDQUFDLENBQUM7WUFDRixNQUFNRCxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQ2ZBLElBQUksQ0FBQzNDLE1BQU0sR0FBRzZCLE1BQU0sQ0FBQzdCLE1BQU07WUFDM0IyQyxJQUFJLENBQUNDLHFCQUFxQixHQUFHZixNQUFNLENBQUNlLHFCQUFxQjtZQUN6REQsSUFBSSxDQUFDUCxPQUFPLEdBQUdQLE1BQU0sQ0FBQ08sT0FBTztZQUM3QixJQUFJLENBQUNJLE1BQU0sQ0FBQ3BGLFNBQVMsQ0FBQyxHQUFHdUYsSUFBSTtVQUMvQjtVQUNBLE9BQU8sSUFBSSxDQUFDSCxNQUFNLENBQUNwRixTQUFTLENBQUM7UUFDL0I7TUFDRixDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7RUFDSjtBQUNGO0FBRUEsTUFBTTBFLG1CQUFtQixHQUFHQSxDQUFDO0VBQUUxRSxTQUFTO0VBQUU0QyxNQUFNO0VBQUU0QyxxQkFBcUI7RUFBRVI7QUFBZ0IsQ0FBQyxLQUFLO0VBQzdGLE1BQU1jLGFBQXFCLEdBQUc7SUFDNUI5RixTQUFTO0lBQ1Q0QyxNQUFNLEVBQUEzSixhQUFBLENBQUFBLGFBQUEsQ0FBQUEsYUFBQSxLQUNEbUMsY0FBYyxDQUFDRSxRQUFRLEdBQ3RCRixjQUFjLENBQUM0RSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsR0FDaEM0QyxNQUFNLENBQ1Y7SUFDRDRDO0VBQ0YsQ0FBQztFQUNELElBQUlSLE9BQU8sSUFBSXhNLE1BQU0sQ0FBQ0QsSUFBSSxDQUFDeU0sT0FBTyxDQUFDLENBQUMzTCxNQUFNLEtBQUssQ0FBQyxFQUFFO0lBQ2hEeU0sYUFBYSxDQUFDZCxPQUFPLEdBQUdBLE9BQU87RUFDakM7RUFDQSxPQUFPYyxhQUFhO0FBQ3RCLENBQUM7QUFFRCxNQUFNQyxZQUFZLEdBQUc7RUFBRS9GLFNBQVMsRUFBRSxRQUFRO0VBQUU0QyxNQUFNLEVBQUV4SCxjQUFjLENBQUMwRTtBQUFPLENBQUM7QUFDM0UsTUFBTWtHLG1CQUFtQixHQUFHO0VBQzFCaEcsU0FBUyxFQUFFLGVBQWU7RUFDMUI0QyxNQUFNLEVBQUV4SCxjQUFjLENBQUMrRTtBQUN6QixDQUFDO0FBQ0QsTUFBTThGLG9CQUFvQixHQUFHO0VBQzNCakcsU0FBUyxFQUFFLGdCQUFnQjtFQUMzQjRDLE1BQU0sRUFBRXhILGNBQWMsQ0FBQ2lGO0FBQ3pCLENBQUM7QUFDRCxNQUFNNkYsaUJBQWlCLEdBQUcxQiw0QkFBNEIsQ0FDcERFLG1CQUFtQixDQUFDO0VBQ2xCMUUsU0FBUyxFQUFFLGFBQWE7RUFDeEI0QyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0VBQ1Y0QyxxQkFBcUIsRUFBRSxDQUFDO0FBQzFCLENBQUMsQ0FDSCxDQUFDO0FBQ0QsTUFBTVcsZ0JBQWdCLEdBQUczQiw0QkFBNEIsQ0FDbkRFLG1CQUFtQixDQUFDO0VBQ2xCMUUsU0FBUyxFQUFFLFlBQVk7RUFDdkI0QyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0VBQ1Y0QyxxQkFBcUIsRUFBRSxDQUFDO0FBQzFCLENBQUMsQ0FDSCxDQUFDO0FBQ0QsTUFBTVksa0JBQWtCLEdBQUc1Qiw0QkFBNEIsQ0FDckRFLG1CQUFtQixDQUFDO0VBQ2xCMUUsU0FBUyxFQUFFLGNBQWM7RUFDekI0QyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0VBQ1Y0QyxxQkFBcUIsRUFBRSxDQUFDO0FBQzFCLENBQUMsQ0FDSCxDQUFDO0FBQ0QsTUFBTWEsZUFBZSxHQUFHN0IsNEJBQTRCLENBQ2xERSxtQkFBbUIsQ0FBQztFQUNsQjFFLFNBQVMsRUFBRSxXQUFXO0VBQ3RCNEMsTUFBTSxFQUFFeEgsY0FBYyxDQUFDbUYsU0FBUztFQUNoQ2lGLHFCQUFxQixFQUFFLENBQUM7QUFDMUIsQ0FBQyxDQUNILENBQUM7QUFDRCxNQUFNYyxrQkFBa0IsR0FBRzlCLDRCQUE0QixDQUNyREUsbUJBQW1CLENBQUM7RUFDbEIxRSxTQUFTLEVBQUUsY0FBYztFQUN6QjRDLE1BQU0sRUFBRXhILGNBQWMsQ0FBQ3NGLFlBQVk7RUFDbkM4RSxxQkFBcUIsRUFBRSxDQUFDO0FBQzFCLENBQUMsQ0FDSCxDQUFDO0FBQ0QsTUFBTWUsc0JBQXNCLEdBQUcsQ0FDN0JSLFlBQVksRUFDWkksZ0JBQWdCLEVBQ2hCQyxrQkFBa0IsRUFDbEJGLGlCQUFpQixFQUNqQkYsbUJBQW1CLEVBQ25CQyxvQkFBb0IsRUFDcEJJLGVBQWUsRUFDZkMsa0JBQWtCLENBQ25CO0FBQUNyRixPQUFBLENBQUFzRixzQkFBQSxHQUFBQSxzQkFBQTtBQUVGLE1BQU1DLHVCQUF1QixHQUFHQSxDQUFDQyxNQUE0QixFQUFFQyxVQUF1QixLQUFLO0VBQ3pGLElBQUlELE1BQU0sQ0FBQ2pMLElBQUksS0FBS2tMLFVBQVUsQ0FBQ2xMLElBQUksRUFBRSxPQUFPLEtBQUs7RUFDakQsSUFBSWlMLE1BQU0sQ0FBQ3RKLFdBQVcsS0FBS3VKLFVBQVUsQ0FBQ3ZKLFdBQVcsRUFBRSxPQUFPLEtBQUs7RUFDL0QsSUFBSXNKLE1BQU0sS0FBS0MsVUFBVSxDQUFDbEwsSUFBSSxFQUFFLE9BQU8sSUFBSTtFQUMzQyxJQUFJaUwsTUFBTSxDQUFDakwsSUFBSSxLQUFLa0wsVUFBVSxDQUFDbEwsSUFBSSxFQUFFLE9BQU8sSUFBSTtFQUNoRCxPQUFPLEtBQUs7QUFDZCxDQUFDO0FBRUQsTUFBTW1MLFlBQVksR0FBSW5MLElBQTBCLElBQWE7RUFDM0QsSUFBSSxPQUFPQSxJQUFJLEtBQUssUUFBUSxFQUFFO0lBQzVCLE9BQU9BLElBQUk7RUFDYjtFQUNBLElBQUlBLElBQUksQ0FBQzJCLFdBQVcsRUFBRTtJQUNwQixPQUFRLEdBQUUzQixJQUFJLENBQUNBLElBQUssSUFBR0EsSUFBSSxDQUFDMkIsV0FBWSxHQUFFO0VBQzVDO0VBQ0EsT0FBUSxHQUFFM0IsSUFBSSxDQUFDQSxJQUFLLEVBQUM7QUFDdkIsQ0FBQztBQUNELE1BQU1vTCxHQUFHLEdBQUc7RUFDVkMsSUFBSSxFQUFFQyxJQUFJLENBQUNDLEdBQUcsQ0FBQyxDQUFDO0VBQ2hCQyxRQUFRLEVBQUV2TTtBQUNaLENBQUM7O0FBRUQ7QUFDQTtBQUNlLE1BQU13TSxnQkFBZ0IsQ0FBQztFQU9wQy9CLFdBQVdBLENBQUNnQyxlQUErQixFQUFFO0lBQzNDLElBQUksQ0FBQ0MsVUFBVSxHQUFHRCxlQUFlO0lBQ2pDLE1BQU01RyxNQUFNLEdBQUc4RyxlQUFNLENBQUM5QixHQUFHLENBQUNuSyxLQUFLLENBQUM2RixhQUFhLENBQUM7SUFDOUMsSUFBSSxDQUFDcUcsVUFBVSxHQUFHLElBQUlwQyxVQUFVLENBQUNxQyxvQkFBVyxDQUFDQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQ25FLGVBQWUsQ0FBQztJQUN6RSxJQUFJLENBQUNBLGVBQWUsR0FBRzlDLE1BQU0sQ0FBQzhDLGVBQWU7SUFFN0MsTUFBTW9FLFNBQVMsR0FBR2xILE1BQU0sQ0FBQ21ILG1CQUFtQjtJQUU1QyxNQUFNQyxhQUFhLEdBQUcsVUFBVSxDQUFDLENBQUM7SUFDbEMsTUFBTUMsV0FBVyxHQUFHLG1CQUFtQjtJQUV2QyxJQUFJLENBQUNDLFdBQVcsR0FBR0osU0FBUyxHQUFHRSxhQUFhLEdBQUdDLFdBQVc7SUFFMUQsSUFBSSxDQUFDUixVQUFVLENBQUNVLEtBQUssQ0FBQyxNQUFNO01BQzFCLElBQUksQ0FBQ0MsVUFBVSxDQUFDO1FBQUVDLFVBQVUsRUFBRTtNQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUM7RUFDSjtFQUVBLE1BQU1DLGtCQUFrQkEsQ0FBQSxFQUFHO0lBQ3pCLElBQUksSUFBSSxDQUFDYixVQUFVLENBQUNjLGlCQUFpQixFQUFFO01BQ3JDO0lBQ0Y7SUFDQSxNQUFNO01BQUVwQixJQUFJO01BQUVHO0lBQVMsQ0FBQyxHQUFHSixHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3BDLElBQUksQ0FBQ0ksUUFBUSxFQUFFO01BQ2I7SUFDRjtJQUNBLE1BQU1ELEdBQUcsR0FBR0QsSUFBSSxDQUFDQyxHQUFHLENBQUMsQ0FBQztJQUN0QixJQUFJQSxHQUFHLEdBQUdGLElBQUksR0FBR0csUUFBUSxFQUFFO01BQ3pCSixHQUFHLENBQUNDLElBQUksR0FBR0UsR0FBRztNQUNkLE1BQU0sSUFBSSxDQUFDZSxVQUFVLENBQUM7UUFBRUMsVUFBVSxFQUFFO01BQUssQ0FBQyxDQUFDO0lBQzdDO0VBQ0Y7RUFFQUQsVUFBVUEsQ0FBQ0ksT0FBMEIsR0FBRztJQUFFSCxVQUFVLEVBQUU7RUFBTSxDQUFDLEVBQWdCO0lBQzNFLElBQUksSUFBSSxDQUFDSSxpQkFBaUIsSUFBSSxDQUFDRCxPQUFPLENBQUNILFVBQVUsRUFBRTtNQUNqRCxPQUFPLElBQUksQ0FBQ0ksaUJBQWlCO0lBQy9CO0lBQ0EsSUFBSSxDQUFDQSxpQkFBaUIsR0FBRyxJQUFJLENBQUNDLGFBQWEsQ0FBQ0YsT0FBTyxDQUFDLENBQ2pERyxJQUFJLENBQ0hsRCxVQUFVLElBQUk7TUFDWixJQUFJLENBQUNrQyxVQUFVLEdBQUcsSUFBSXBDLFVBQVUsQ0FBQ0UsVUFBVSxFQUFFLElBQUksQ0FBQy9CLGVBQWUsQ0FBQztNQUNsRSxPQUFPLElBQUksQ0FBQytFLGlCQUFpQjtJQUMvQixDQUFDLEVBQ0RHLEdBQUcsSUFBSTtNQUNMLElBQUksQ0FBQ2pCLFVBQVUsR0FBRyxJQUFJcEMsVUFBVSxDQUFDLENBQUM7TUFDbEMsT0FBTyxJQUFJLENBQUNrRCxpQkFBaUI7TUFDN0IsTUFBTUcsR0FBRztJQUNYLENBQ0YsQ0FBQyxDQUNBRCxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNqQixPQUFPLElBQUksQ0FBQ0YsaUJBQWlCO0VBQy9CO0VBRUEsTUFBTUMsYUFBYUEsQ0FBQ0YsT0FBMEIsR0FBRztJQUFFSCxVQUFVLEVBQUU7RUFBTSxDQUFDLEVBQTBCO0lBQzlGLElBQUlHLE9BQU8sQ0FBQ0gsVUFBVSxFQUFFO01BQ3RCLE9BQU8sSUFBSSxDQUFDUSxhQUFhLENBQUMsQ0FBQztJQUM3QjtJQUNBLE1BQU0sSUFBSSxDQUFDUCxrQkFBa0IsQ0FBQyxDQUFDO0lBQy9CLE1BQU1RLE1BQU0sR0FBR2xCLG9CQUFXLENBQUNDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLElBQUlpQixNQUFNLElBQUlBLE1BQU0sQ0FBQ25QLE1BQU0sRUFBRTtNQUMzQixPQUFPb1AsT0FBTyxDQUFDQyxPQUFPLENBQUNGLE1BQU0sQ0FBQztJQUNoQztJQUNBLE9BQU8sSUFBSSxDQUFDRCxhQUFhLENBQUMsQ0FBQztFQUM3QjtFQUVBQSxhQUFhQSxDQUFBLEVBQTJCO0lBQ3RDLE9BQU8sSUFBSSxDQUFDcEIsVUFBVSxDQUNuQmlCLGFBQWEsQ0FBQyxDQUFDLENBQ2ZDLElBQUksQ0FBQ2xELFVBQVUsSUFBSUEsVUFBVSxDQUFDd0QsR0FBRyxDQUFDakUsbUJBQW1CLENBQUMsQ0FBQyxDQUN2RDJELElBQUksQ0FBQ2xELFVBQVUsSUFBSTtNQUNsQm1DLG9CQUFXLENBQUNzQixHQUFHLENBQUN6RCxVQUFVLENBQUM7TUFDM0IsT0FBT0EsVUFBVTtJQUNuQixDQUFDLENBQUM7RUFDTjtFQUVBMEQsWUFBWUEsQ0FDVjdJLFNBQWlCLEVBQ2pCOEksb0JBQTZCLEdBQUcsS0FBSyxFQUNyQ1osT0FBMEIsR0FBRztJQUFFSCxVQUFVLEVBQUU7RUFBTSxDQUFDLEVBQ2pDO0lBQ2pCLElBQUlHLE9BQU8sQ0FBQ0gsVUFBVSxFQUFFO01BQ3RCVCxvQkFBVyxDQUFDeUIsS0FBSyxDQUFDLENBQUM7SUFDckI7SUFDQSxJQUFJRCxvQkFBb0IsSUFBSXZILGVBQWUsQ0FBQ3VCLE9BQU8sQ0FBQzlDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO01BQ25FLE1BQU11RixJQUFJLEdBQUcsSUFBSSxDQUFDOEIsVUFBVSxDQUFDckgsU0FBUyxDQUFDO01BQ3ZDLE9BQU95SSxPQUFPLENBQUNDLE9BQU8sQ0FBQztRQUNyQjFJLFNBQVM7UUFDVDRDLE1BQU0sRUFBRTJDLElBQUksQ0FBQzNDLE1BQU07UUFDbkI0QyxxQkFBcUIsRUFBRUQsSUFBSSxDQUFDQyxxQkFBcUI7UUFDakRSLE9BQU8sRUFBRU8sSUFBSSxDQUFDUDtNQUNoQixDQUFDLENBQUM7SUFDSjtJQUNBLE1BQU13RCxNQUFNLEdBQUdsQixvQkFBVyxDQUFDaEMsR0FBRyxDQUFDdEYsU0FBUyxDQUFDO0lBQ3pDLElBQUl3SSxNQUFNLElBQUksQ0FBQ04sT0FBTyxDQUFDSCxVQUFVLEVBQUU7TUFDakMsT0FBT1UsT0FBTyxDQUFDQyxPQUFPLENBQUNGLE1BQU0sQ0FBQztJQUNoQztJQUNBLE9BQU8sSUFBSSxDQUFDRCxhQUFhLENBQUMsQ0FBQyxDQUFDRixJQUFJLENBQUNsRCxVQUFVLElBQUk7TUFDN0MsTUFBTTZELFNBQVMsR0FBRzdELFVBQVUsQ0FBQzhELElBQUksQ0FBQ3hFLE1BQU0sSUFBSUEsTUFBTSxDQUFDekUsU0FBUyxLQUFLQSxTQUFTLENBQUM7TUFDM0UsSUFBSSxDQUFDZ0osU0FBUyxFQUFFO1FBQ2QsT0FBT1AsT0FBTyxDQUFDUyxNQUFNLENBQUN6TyxTQUFTLENBQUM7TUFDbEM7TUFDQSxPQUFPdU8sU0FBUztJQUNsQixDQUFDLENBQUM7RUFDSjs7RUFFQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBLE1BQU1HLG1CQUFtQkEsQ0FDdkJuSixTQUFpQixFQUNqQjRDLE1BQW9CLEdBQUcsQ0FBQyxDQUFDLEVBQ3pCNEMscUJBQTBCLEVBQzFCUixPQUFZLEdBQUcsQ0FBQyxDQUFDLEVBQ087SUFDeEIsSUFBSW9FLGVBQWUsR0FBRyxJQUFJLENBQUNDLGdCQUFnQixDQUFDckosU0FBUyxFQUFFNEMsTUFBTSxFQUFFNEMscUJBQXFCLENBQUM7SUFDckYsSUFBSTRELGVBQWUsRUFBRTtNQUNuQixJQUFJQSxlQUFlLFlBQVlqTyxLQUFLLENBQUNtSCxLQUFLLEVBQUU7UUFDMUMsT0FBT21HLE9BQU8sQ0FBQ1MsTUFBTSxDQUFDRSxlQUFlLENBQUM7TUFDeEMsQ0FBQyxNQUFNLElBQUlBLGVBQWUsQ0FBQ0UsSUFBSSxJQUFJRixlQUFlLENBQUNHLEtBQUssRUFBRTtRQUN4RCxPQUFPZCxPQUFPLENBQUNTLE1BQU0sQ0FBQyxJQUFJL04sS0FBSyxDQUFDbUgsS0FBSyxDQUFDOEcsZUFBZSxDQUFDRSxJQUFJLEVBQUVGLGVBQWUsQ0FBQ0csS0FBSyxDQUFDLENBQUM7TUFDckY7TUFDQSxPQUFPZCxPQUFPLENBQUNTLE1BQU0sQ0FBQ0UsZUFBZSxDQUFDO0lBQ3hDO0lBQ0EsSUFBSTtNQUNGLE1BQU1JLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQ3JDLFVBQVUsQ0FBQ3NDLFdBQVcsQ0FDckR6SixTQUFTLEVBQ1R3RSw0QkFBNEIsQ0FBQztRQUMzQjVCLE1BQU07UUFDTjRDLHFCQUFxQjtRQUNyQlIsT0FBTztRQUNQaEY7TUFDRixDQUFDLENBQ0gsQ0FBQztNQUNEO01BQ0EsTUFBTSxJQUFJLENBQUM4SCxVQUFVLENBQUM7UUFBRUMsVUFBVSxFQUFFO01BQUssQ0FBQyxDQUFDO01BQzNDLE1BQU0yQixXQUFXLEdBQUc1RSxpQ0FBaUMsQ0FBQzBFLGFBQWEsQ0FBQztNQUNwRSxPQUFPRSxXQUFXO0lBQ3BCLENBQUMsQ0FBQyxPQUFPSCxLQUFLLEVBQUU7TUFDZCxJQUFJQSxLQUFLLElBQUlBLEtBQUssQ0FBQ0QsSUFBSSxLQUFLbk8sS0FBSyxDQUFDbUgsS0FBSyxDQUFDcUgsZUFBZSxFQUFFO1FBQ3ZELE1BQU0sSUFBSXhPLEtBQUssQ0FBQ21ILEtBQUssQ0FBQ25ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ2dDLGtCQUFrQixFQUFHLFNBQVF0RSxTQUFVLGtCQUFpQixDQUFDO01BQzdGLENBQUMsTUFBTTtRQUNMLE1BQU11SixLQUFLO01BQ2I7SUFDRjtFQUNGO0VBRUFLLFdBQVdBLENBQ1Q1SixTQUFpQixFQUNqQjZKLGVBQTZCLEVBQzdCckUscUJBQTBCLEVBQzFCUixPQUFZLEVBQ1o4RSxRQUE0QixFQUM1QjtJQUNBLE9BQU8sSUFBSSxDQUFDakIsWUFBWSxDQUFDN0ksU0FBUyxDQUFDLENBQ2hDcUksSUFBSSxDQUFDNUQsTUFBTSxJQUFJO01BQ2QsTUFBTXNGLGNBQWMsR0FBR3RGLE1BQU0sQ0FBQzdCLE1BQU07TUFDcENwSyxNQUFNLENBQUNELElBQUksQ0FBQ3NSLGVBQWUsQ0FBQyxDQUFDdFEsT0FBTyxDQUFDMEQsSUFBSSxJQUFJO1FBQzNDLE1BQU1zRyxLQUFLLEdBQUdzRyxlQUFlLENBQUM1TSxJQUFJLENBQUM7UUFDbkMsSUFDRThNLGNBQWMsQ0FBQzlNLElBQUksQ0FBQyxJQUNwQjhNLGNBQWMsQ0FBQzlNLElBQUksQ0FBQyxDQUFDekIsSUFBSSxLQUFLK0gsS0FBSyxDQUFDL0gsSUFBSSxJQUN4QytILEtBQUssQ0FBQ3lHLElBQUksS0FBSyxRQUFRLEVBQ3ZCO1VBQ0EsTUFBTSxJQUFJN08sS0FBSyxDQUFDbUgsS0FBSyxDQUFDLEdBQUcsRUFBRyxTQUFRckYsSUFBSyx5QkFBd0IsQ0FBQztRQUNwRTtRQUNBLElBQUksQ0FBQzhNLGNBQWMsQ0FBQzlNLElBQUksQ0FBQyxJQUFJc0csS0FBSyxDQUFDeUcsSUFBSSxLQUFLLFFBQVEsRUFBRTtVQUNwRCxNQUFNLElBQUk3TyxLQUFLLENBQUNtSCxLQUFLLENBQUMsR0FBRyxFQUFHLFNBQVFyRixJQUFLLGlDQUFnQyxDQUFDO1FBQzVFO01BQ0YsQ0FBQyxDQUFDO01BRUYsT0FBTzhNLGNBQWMsQ0FBQ3BGLE1BQU07TUFDNUIsT0FBT29GLGNBQWMsQ0FBQ25GLE1BQU07TUFDNUIsTUFBTXFGLFNBQVMsR0FBR0MsdUJBQXVCLENBQUNILGNBQWMsRUFBRUYsZUFBZSxDQUFDO01BQzFFLE1BQU1NLGFBQWEsR0FBRy9PLGNBQWMsQ0FBQzRFLFNBQVMsQ0FBQyxJQUFJNUUsY0FBYyxDQUFDRSxRQUFRO01BQzFFLE1BQU04TyxhQUFhLEdBQUc1UixNQUFNLENBQUN1QyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUVrUCxTQUFTLEVBQUVFLGFBQWEsQ0FBQztNQUNqRSxNQUFNZixlQUFlLEdBQUcsSUFBSSxDQUFDaUIsa0JBQWtCLENBQzdDckssU0FBUyxFQUNUaUssU0FBUyxFQUNUekUscUJBQXFCLEVBQ3JCaE4sTUFBTSxDQUFDRCxJQUFJLENBQUN3UixjQUFjLENBQzVCLENBQUM7TUFDRCxJQUFJWCxlQUFlLEVBQUU7UUFDbkIsTUFBTSxJQUFJak8sS0FBSyxDQUFDbUgsS0FBSyxDQUFDOEcsZUFBZSxDQUFDRSxJQUFJLEVBQUVGLGVBQWUsQ0FBQ0csS0FBSyxDQUFDO01BQ3BFOztNQUVBO01BQ0E7TUFDQSxNQUFNZSxhQUF1QixHQUFHLEVBQUU7TUFDbEMsTUFBTUMsY0FBYyxHQUFHLEVBQUU7TUFDekIvUixNQUFNLENBQUNELElBQUksQ0FBQ3NSLGVBQWUsQ0FBQyxDQUFDdFEsT0FBTyxDQUFDMEosU0FBUyxJQUFJO1FBQ2hELElBQUk0RyxlQUFlLENBQUM1RyxTQUFTLENBQUMsQ0FBQytHLElBQUksS0FBSyxRQUFRLEVBQUU7VUFDaERNLGFBQWEsQ0FBQ3ZSLElBQUksQ0FBQ2tLLFNBQVMsQ0FBQztRQUMvQixDQUFDLE1BQU07VUFDTHNILGNBQWMsQ0FBQ3hSLElBQUksQ0FBQ2tLLFNBQVMsQ0FBQztRQUNoQztNQUNGLENBQUMsQ0FBQztNQUVGLElBQUl1SCxhQUFhLEdBQUcvQixPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDO01BQ3JDLElBQUk0QixhQUFhLENBQUNqUixNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQzVCbVIsYUFBYSxHQUFHLElBQUksQ0FBQ0MsWUFBWSxDQUFDSCxhQUFhLEVBQUV0SyxTQUFTLEVBQUU4SixRQUFRLENBQUM7TUFDdkU7TUFDQSxJQUFJWSxhQUFhLEdBQUcsRUFBRTtNQUN0QixPQUNFRixhQUFhLENBQUM7TUFBQSxDQUNYbkMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDUCxVQUFVLENBQUM7UUFBRUMsVUFBVSxFQUFFO01BQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUFBLENBQ2xETSxJQUFJLENBQUMsTUFBTTtRQUNWLE1BQU1zQyxRQUFRLEdBQUdKLGNBQWMsQ0FBQzVCLEdBQUcsQ0FBQzFGLFNBQVMsSUFBSTtVQUMvQyxNQUFNekgsSUFBSSxHQUFHcU8sZUFBZSxDQUFDNUcsU0FBUyxDQUFDO1VBQ3ZDLE9BQU8sSUFBSSxDQUFDMkgsa0JBQWtCLENBQUM1SyxTQUFTLEVBQUVpRCxTQUFTLEVBQUV6SCxJQUFJLENBQUM7UUFDNUQsQ0FBQyxDQUFDO1FBQ0YsT0FBT2lOLE9BQU8sQ0FBQ2xCLEdBQUcsQ0FBQ29ELFFBQVEsQ0FBQztNQUM5QixDQUFDLENBQUMsQ0FDRHRDLElBQUksQ0FBQ3dDLE9BQU8sSUFBSTtRQUNmSCxhQUFhLEdBQUdHLE9BQU8sQ0FBQ2xTLE1BQU0sQ0FBQ21TLE1BQU0sSUFBSSxDQUFDLENBQUNBLE1BQU0sQ0FBQztRQUNsRCxPQUFPLElBQUksQ0FBQ0MsY0FBYyxDQUFDL0ssU0FBUyxFQUFFd0YscUJBQXFCLEVBQUV5RSxTQUFTLENBQUM7TUFDekUsQ0FBQyxDQUFDLENBQ0Q1QixJQUFJLENBQUMsTUFDSixJQUFJLENBQUNsQixVQUFVLENBQUM2RCwwQkFBMEIsQ0FDeENoTCxTQUFTLEVBQ1RnRixPQUFPLEVBQ1BQLE1BQU0sQ0FBQ08sT0FBTyxFQUNkb0YsYUFDRixDQUNGLENBQUMsQ0FDQS9CLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQ1AsVUFBVSxDQUFDO1FBQUVDLFVBQVUsRUFBRTtNQUFLLENBQUMsQ0FBQztNQUNqRDtNQUFBLENBQ0NNLElBQUksQ0FBQyxNQUFNO1FBQ1YsSUFBSSxDQUFDNEMsWUFBWSxDQUFDUCxhQUFhLENBQUM7UUFDaEMsTUFBTWpHLE1BQU0sR0FBRyxJQUFJLENBQUM0QyxVQUFVLENBQUNySCxTQUFTLENBQUM7UUFDekMsTUFBTWtMLGNBQXNCLEdBQUc7VUFDN0JsTCxTQUFTLEVBQUVBLFNBQVM7VUFDcEI0QyxNQUFNLEVBQUU2QixNQUFNLENBQUM3QixNQUFNO1VBQ3JCNEMscUJBQXFCLEVBQUVmLE1BQU0sQ0FBQ2U7UUFDaEMsQ0FBQztRQUNELElBQUlmLE1BQU0sQ0FBQ08sT0FBTyxJQUFJeE0sTUFBTSxDQUFDRCxJQUFJLENBQUNrTSxNQUFNLENBQUNPLE9BQU8sQ0FBQyxDQUFDM0wsTUFBTSxLQUFLLENBQUMsRUFBRTtVQUM5RDZSLGNBQWMsQ0FBQ2xHLE9BQU8sR0FBR1AsTUFBTSxDQUFDTyxPQUFPO1FBQ3pDO1FBQ0EsT0FBT2tHLGNBQWM7TUFDdkIsQ0FBQyxDQUFDO0lBRVIsQ0FBQyxDQUFDLENBQ0RDLEtBQUssQ0FBQzVCLEtBQUssSUFBSTtNQUNkLElBQUlBLEtBQUssS0FBSzlPLFNBQVMsRUFBRTtRQUN2QixNQUFNLElBQUlVLEtBQUssQ0FBQ21ILEtBQUssQ0FDbkJuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNnQyxrQkFBa0IsRUFDN0IsU0FBUXRFLFNBQVUsa0JBQ3JCLENBQUM7TUFDSCxDQUFDLE1BQU07UUFDTCxNQUFNdUosS0FBSztNQUNiO0lBQ0YsQ0FBQyxDQUFDO0VBQ047O0VBRUE7RUFDQTtFQUNBNkIsa0JBQWtCQSxDQUFDcEwsU0FBaUIsRUFBNkI7SUFDL0QsSUFBSSxJQUFJLENBQUNxSCxVQUFVLENBQUNySCxTQUFTLENBQUMsRUFBRTtNQUM5QixPQUFPeUksT0FBTyxDQUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDO0lBQzlCO0lBQ0E7SUFDQTtNQUNFO01BQ0EsSUFBSSxDQUFDUyxtQkFBbUIsQ0FBQ25KLFNBQVMsQ0FBQyxDQUNoQ21MLEtBQUssQ0FBQyxNQUFNO1FBQ1g7UUFDQTtRQUNBO1FBQ0E7UUFDQSxPQUFPLElBQUksQ0FBQ3JELFVBQVUsQ0FBQztVQUFFQyxVQUFVLEVBQUU7UUFBSyxDQUFDLENBQUM7TUFDOUMsQ0FBQyxDQUFDLENBQ0RNLElBQUksQ0FBQyxNQUFNO1FBQ1Y7UUFDQSxJQUFJLElBQUksQ0FBQ2hCLFVBQVUsQ0FBQ3JILFNBQVMsQ0FBQyxFQUFFO1VBQzlCLE9BQU8sSUFBSTtRQUNiLENBQUMsTUFBTTtVQUNMLE1BQU0sSUFBSTdFLEtBQUssQ0FBQ21ILEtBQUssQ0FBQ25ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ0MsWUFBWSxFQUFHLGlCQUFnQnZDLFNBQVUsRUFBQyxDQUFDO1FBQy9FO01BQ0YsQ0FBQyxDQUFDLENBQ0RtTCxLQUFLLENBQUMsTUFBTTtRQUNYO1FBQ0EsTUFBTSxJQUFJaFEsS0FBSyxDQUFDbUgsS0FBSyxDQUFDbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDQyxZQUFZLEVBQUUsdUNBQXVDLENBQUM7TUFDMUYsQ0FBQztJQUFDO0VBRVI7RUFFQThHLGdCQUFnQkEsQ0FBQ3JKLFNBQWlCLEVBQUU0QyxNQUFvQixHQUFHLENBQUMsQ0FBQyxFQUFFNEMscUJBQTBCLEVBQU87SUFDOUYsSUFBSSxJQUFJLENBQUM2QixVQUFVLENBQUNySCxTQUFTLENBQUMsRUFBRTtNQUM5QixNQUFNLElBQUk3RSxLQUFLLENBQUNtSCxLQUFLLENBQUNuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNnQyxrQkFBa0IsRUFBRyxTQUFRdEUsU0FBVSxrQkFBaUIsQ0FBQztJQUM3RjtJQUNBLElBQUksQ0FBQzZELGdCQUFnQixDQUFDN0QsU0FBUyxDQUFDLEVBQUU7TUFDaEMsT0FBTztRQUNMc0osSUFBSSxFQUFFbk8sS0FBSyxDQUFDbUgsS0FBSyxDQUFDZ0Msa0JBQWtCO1FBQ3BDaUYsS0FBSyxFQUFFckYsdUJBQXVCLENBQUNsRSxTQUFTO01BQzFDLENBQUM7SUFDSDtJQUNBLE9BQU8sSUFBSSxDQUFDcUssa0JBQWtCLENBQUNySyxTQUFTLEVBQUU0QyxNQUFNLEVBQUU0QyxxQkFBcUIsRUFBRSxFQUFFLENBQUM7RUFDOUU7RUFFQTZFLGtCQUFrQkEsQ0FDaEJySyxTQUFpQixFQUNqQjRDLE1BQW9CLEVBQ3BCNEMscUJBQTRDLEVBQzVDNkYsa0JBQWlDLEVBQ2pDO0lBQ0EsS0FBSyxNQUFNcEksU0FBUyxJQUFJTCxNQUFNLEVBQUU7TUFDOUIsSUFBSXlJLGtCQUFrQixDQUFDdkksT0FBTyxDQUFDRyxTQUFTLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDN0MsSUFBSSxDQUFDYyxnQkFBZ0IsQ0FBQ2QsU0FBUyxFQUFFakQsU0FBUyxDQUFDLEVBQUU7VUFDM0MsT0FBTztZQUNMc0osSUFBSSxFQUFFbk8sS0FBSyxDQUFDbUgsS0FBSyxDQUFDZ0osZ0JBQWdCO1lBQ2xDL0IsS0FBSyxFQUFFLHNCQUFzQixHQUFHdEc7VUFDbEMsQ0FBQztRQUNIO1FBQ0EsSUFBSSxDQUFDZ0Isd0JBQXdCLENBQUNoQixTQUFTLEVBQUVqRCxTQUFTLENBQUMsRUFBRTtVQUNuRCxPQUFPO1lBQ0xzSixJQUFJLEVBQUUsR0FBRztZQUNUQyxLQUFLLEVBQUUsUUFBUSxHQUFHdEcsU0FBUyxHQUFHO1VBQ2hDLENBQUM7UUFDSDtRQUNBLE1BQU1zSSxTQUFTLEdBQUczSSxNQUFNLENBQUNLLFNBQVMsQ0FBQztRQUNuQyxNQUFNc0csS0FBSyxHQUFHbEYsa0JBQWtCLENBQUNrSCxTQUFTLENBQUM7UUFDM0MsSUFBSWhDLEtBQUssRUFBRSxPQUFPO1VBQUVELElBQUksRUFBRUMsS0FBSyxDQUFDRCxJQUFJO1VBQUVDLEtBQUssRUFBRUEsS0FBSyxDQUFDbks7UUFBUSxDQUFDO1FBQzVELElBQUltTSxTQUFTLENBQUNDLFlBQVksS0FBSy9RLFNBQVMsRUFBRTtVQUN4QyxJQUFJZ1IsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQ0gsU0FBUyxDQUFDQyxZQUFZLENBQUM7VUFDdEQsSUFBSSxPQUFPQyxnQkFBZ0IsS0FBSyxRQUFRLEVBQUU7WUFDeENBLGdCQUFnQixHQUFHO2NBQUVqUSxJQUFJLEVBQUVpUTtZQUFpQixDQUFDO1VBQy9DLENBQUMsTUFBTSxJQUFJLE9BQU9BLGdCQUFnQixLQUFLLFFBQVEsSUFBSUYsU0FBUyxDQUFDL1AsSUFBSSxLQUFLLFVBQVUsRUFBRTtZQUNoRixPQUFPO2NBQ0w4TixJQUFJLEVBQUVuTyxLQUFLLENBQUNtSCxLQUFLLENBQUNpQyxjQUFjO2NBQ2hDZ0YsS0FBSyxFQUFHLG9EQUFtRDVDLFlBQVksQ0FBQzRFLFNBQVMsQ0FBRTtZQUNyRixDQUFDO1VBQ0g7VUFDQSxJQUFJLENBQUMvRSx1QkFBdUIsQ0FBQytFLFNBQVMsRUFBRUUsZ0JBQWdCLENBQUMsRUFBRTtZQUN6RCxPQUFPO2NBQ0xuQyxJQUFJLEVBQUVuTyxLQUFLLENBQUNtSCxLQUFLLENBQUNpQyxjQUFjO2NBQ2hDZ0YsS0FBSyxFQUFHLHVCQUFzQnZKLFNBQVUsSUFBR2lELFNBQVUsNEJBQTJCMEQsWUFBWSxDQUMxRjRFLFNBQ0YsQ0FBRSxZQUFXNUUsWUFBWSxDQUFDOEUsZ0JBQWdCLENBQUU7WUFDOUMsQ0FBQztVQUNIO1FBQ0YsQ0FBQyxNQUFNLElBQUlGLFNBQVMsQ0FBQ0ksUUFBUSxFQUFFO1VBQzdCLElBQUksT0FBT0osU0FBUyxLQUFLLFFBQVEsSUFBSUEsU0FBUyxDQUFDL1AsSUFBSSxLQUFLLFVBQVUsRUFBRTtZQUNsRSxPQUFPO2NBQ0w4TixJQUFJLEVBQUVuTyxLQUFLLENBQUNtSCxLQUFLLENBQUNpQyxjQUFjO2NBQ2hDZ0YsS0FBSyxFQUFHLCtDQUE4QzVDLFlBQVksQ0FBQzRFLFNBQVMsQ0FBRTtZQUNoRixDQUFDO1VBQ0g7UUFDRjtNQUNGO0lBQ0Y7SUFFQSxLQUFLLE1BQU10SSxTQUFTLElBQUk3SCxjQUFjLENBQUM0RSxTQUFTLENBQUMsRUFBRTtNQUNqRDRDLE1BQU0sQ0FBQ0ssU0FBUyxDQUFDLEdBQUc3SCxjQUFjLENBQUM0RSxTQUFTLENBQUMsQ0FBQ2lELFNBQVMsQ0FBQztJQUMxRDtJQUVBLE1BQU0ySSxTQUFTLEdBQUdwVCxNQUFNLENBQUNELElBQUksQ0FBQ3FLLE1BQU0sQ0FBQyxDQUFDakssTUFBTSxDQUMxQ2EsR0FBRyxJQUFJb0osTUFBTSxDQUFDcEosR0FBRyxDQUFDLElBQUlvSixNQUFNLENBQUNwSixHQUFHLENBQUMsQ0FBQ2dDLElBQUksS0FBSyxVQUM3QyxDQUFDO0lBQ0QsSUFBSW9RLFNBQVMsQ0FBQ3ZTLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDeEIsT0FBTztRQUNMaVEsSUFBSSxFQUFFbk8sS0FBSyxDQUFDbUgsS0FBSyxDQUFDaUMsY0FBYztRQUNoQ2dGLEtBQUssRUFDSCxvRUFBb0UsR0FDcEVxQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQ1osUUFBUSxHQUNSQSxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQ1o7TUFDSixDQUFDO0lBQ0g7SUFDQWxKLFdBQVcsQ0FBQzhDLHFCQUFxQixFQUFFNUMsTUFBTSxFQUFFLElBQUksQ0FBQ2dGLFdBQVcsQ0FBQztFQUM5RDs7RUFFQTtFQUNBLE1BQU1tRCxjQUFjQSxDQUFDL0ssU0FBaUIsRUFBRTJDLEtBQVUsRUFBRXNILFNBQXVCLEVBQUU7SUFDM0UsSUFBSSxPQUFPdEgsS0FBSyxLQUFLLFdBQVcsRUFBRTtNQUNoQyxPQUFPOEYsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQztJQUMxQjtJQUNBaEcsV0FBVyxDQUFDQyxLQUFLLEVBQUVzSCxTQUFTLEVBQUUsSUFBSSxDQUFDckMsV0FBVyxDQUFDO0lBQy9DLE1BQU0sSUFBSSxDQUFDVCxVQUFVLENBQUMwRSx3QkFBd0IsQ0FBQzdMLFNBQVMsRUFBRTJDLEtBQUssQ0FBQztJQUNoRSxNQUFNNkYsTUFBTSxHQUFHbEIsb0JBQVcsQ0FBQ2hDLEdBQUcsQ0FBQ3RGLFNBQVMsQ0FBQztJQUN6QyxJQUFJd0ksTUFBTSxFQUFFO01BQ1ZBLE1BQU0sQ0FBQ2hELHFCQUFxQixHQUFHN0MsS0FBSztJQUN0QztFQUNGOztFQUVBO0VBQ0E7RUFDQTtFQUNBO0VBQ0FpSSxrQkFBa0JBLENBQ2hCNUssU0FBaUIsRUFDakJpRCxTQUFpQixFQUNqQnpILElBQTBCLEVBQzFCc1EsWUFBc0IsRUFDdEJDLFdBQXFCLEVBQ3JCO0lBQ0EsSUFBSTlJLFNBQVMsQ0FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtNQUM5QjtNQUNBRyxTQUFTLEdBQUdBLFNBQVMsQ0FBQytJLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDbkN4USxJQUFJLEdBQUcsUUFBUTtJQUNqQjtJQUNBLElBQUl5USxtQkFBbUIsR0FBSSxHQUFFaEosU0FBVSxFQUFDO0lBQ3hDLElBQUk4SSxXQUFXLElBQUlFLG1CQUFtQixDQUFDQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO01BQ3hERCxtQkFBbUIsR0FBR0EsbUJBQW1CLENBQUNFLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDeEQ7SUFDQSxJQUFJLENBQUNwSSxnQkFBZ0IsQ0FBQ2tJLG1CQUFtQixFQUFFak0sU0FBUyxDQUFDLEVBQUU7TUFDckQsTUFBTSxJQUFJN0UsS0FBSyxDQUFDbUgsS0FBSyxDQUFDbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDZ0osZ0JBQWdCLEVBQUcsdUJBQXNCckksU0FBVSxHQUFFLENBQUM7SUFDMUY7O0lBRUE7SUFDQSxJQUFJLENBQUN6SCxJQUFJLEVBQUU7TUFDVCxPQUFPZixTQUFTO0lBQ2xCO0lBRUEsTUFBTTJSLFlBQVksR0FBRyxJQUFJLENBQUNDLGVBQWUsQ0FBQ3JNLFNBQVMsRUFBRWlELFNBQVMsQ0FBQztJQUMvRCxJQUFJLE9BQU96SCxJQUFJLEtBQUssUUFBUSxFQUFFO01BQzVCQSxJQUFJLEdBQUk7UUFBRUE7TUFBSyxDQUFlO0lBQ2hDO0lBRUEsSUFBSUEsSUFBSSxDQUFDZ1EsWUFBWSxLQUFLL1EsU0FBUyxFQUFFO01BQ25DLElBQUlnUixnQkFBZ0IsR0FBR0MsT0FBTyxDQUFDbFEsSUFBSSxDQUFDZ1EsWUFBWSxDQUFDO01BQ2pELElBQUksT0FBT0MsZ0JBQWdCLEtBQUssUUFBUSxFQUFFO1FBQ3hDQSxnQkFBZ0IsR0FBRztVQUFFalEsSUFBSSxFQUFFaVE7UUFBaUIsQ0FBQztNQUMvQztNQUNBLElBQUksQ0FBQ2pGLHVCQUF1QixDQUFDaEwsSUFBSSxFQUFFaVEsZ0JBQWdCLENBQUMsRUFBRTtRQUNwRCxNQUFNLElBQUl0USxLQUFLLENBQUNtSCxLQUFLLENBQ25CbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDaUMsY0FBYyxFQUN6Qix1QkFBc0J2RSxTQUFVLElBQUdpRCxTQUFVLDRCQUEyQjBELFlBQVksQ0FDbkZuTCxJQUNGLENBQUUsWUFBV21MLFlBQVksQ0FBQzhFLGdCQUFnQixDQUFFLEVBQzlDLENBQUM7TUFDSDtJQUNGO0lBRUEsSUFBSVcsWUFBWSxFQUFFO01BQ2hCLElBQUksQ0FBQzVGLHVCQUF1QixDQUFDNEYsWUFBWSxFQUFFNVEsSUFBSSxDQUFDLEVBQUU7UUFDaEQsTUFBTSxJQUFJTCxLQUFLLENBQUNtSCxLQUFLLENBQ25CbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDaUMsY0FBYyxFQUN6Qix1QkFBc0J2RSxTQUFVLElBQUdpRCxTQUFVLGNBQWEwRCxZQUFZLENBQ3JFeUYsWUFDRixDQUFFLFlBQVd6RixZQUFZLENBQUNuTCxJQUFJLENBQUUsRUFDbEMsQ0FBQztNQUNIO01BQ0E7TUFDQTtNQUNBLElBQUlzUSxZQUFZLElBQUlRLElBQUksQ0FBQ0MsU0FBUyxDQUFDSCxZQUFZLENBQUMsS0FBS0UsSUFBSSxDQUFDQyxTQUFTLENBQUMvUSxJQUFJLENBQUMsRUFBRTtRQUN6RSxPQUFPZixTQUFTO01BQ2xCO01BQ0E7TUFDQTtNQUNBLE9BQU8sSUFBSSxDQUFDME0sVUFBVSxDQUFDcUYsa0JBQWtCLENBQUN4TSxTQUFTLEVBQUVpRCxTQUFTLEVBQUV6SCxJQUFJLENBQUM7SUFDdkU7SUFFQSxPQUFPLElBQUksQ0FBQzJMLFVBQVUsQ0FDbkJzRixtQkFBbUIsQ0FBQ3pNLFNBQVMsRUFBRWlELFNBQVMsRUFBRXpILElBQUksQ0FBQyxDQUMvQzJQLEtBQUssQ0FBQzVCLEtBQUssSUFBSTtNQUNkLElBQUlBLEtBQUssQ0FBQ0QsSUFBSSxJQUFJbk8sS0FBSyxDQUFDbUgsS0FBSyxDQUFDaUMsY0FBYyxFQUFFO1FBQzVDO1FBQ0EsTUFBTWdGLEtBQUs7TUFDYjtNQUNBO01BQ0E7TUFDQTtNQUNBLE9BQU9kLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUM7SUFDMUIsQ0FBQyxDQUFDLENBQ0RMLElBQUksQ0FBQyxNQUFNO01BQ1YsT0FBTztRQUNMckksU0FBUztRQUNUaUQsU0FBUztRQUNUekg7TUFDRixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0VBQ047RUFFQXlQLFlBQVlBLENBQUNySSxNQUFXLEVBQUU7SUFDeEIsS0FBSyxJQUFJekosQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHeUosTUFBTSxDQUFDdkosTUFBTSxFQUFFRixDQUFDLElBQUksQ0FBQyxFQUFFO01BQ3pDLE1BQU07UUFBRTZHLFNBQVM7UUFBRWlEO01BQVUsQ0FBQyxHQUFHTCxNQUFNLENBQUN6SixDQUFDLENBQUM7TUFDMUMsSUFBSTtRQUFFcUM7TUFBSyxDQUFDLEdBQUdvSCxNQUFNLENBQUN6SixDQUFDLENBQUM7TUFDeEIsTUFBTWlULFlBQVksR0FBRyxJQUFJLENBQUNDLGVBQWUsQ0FBQ3JNLFNBQVMsRUFBRWlELFNBQVMsQ0FBQztNQUMvRCxJQUFJLE9BQU96SCxJQUFJLEtBQUssUUFBUSxFQUFFO1FBQzVCQSxJQUFJLEdBQUc7VUFBRUEsSUFBSSxFQUFFQTtRQUFLLENBQUM7TUFDdkI7TUFDQSxJQUFJLENBQUM0USxZQUFZLElBQUksQ0FBQzVGLHVCQUF1QixDQUFDNEYsWUFBWSxFQUFFNVEsSUFBSSxDQUFDLEVBQUU7UUFDakUsTUFBTSxJQUFJTCxLQUFLLENBQUNtSCxLQUFLLENBQUNuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNDLFlBQVksRUFBRyx1QkFBc0JVLFNBQVUsRUFBQyxDQUFDO01BQ3JGO0lBQ0Y7RUFDRjs7RUFFQTtFQUNBeUosV0FBV0EsQ0FBQ3pKLFNBQWlCLEVBQUVqRCxTQUFpQixFQUFFOEosUUFBNEIsRUFBRTtJQUM5RSxPQUFPLElBQUksQ0FBQ1csWUFBWSxDQUFDLENBQUN4SCxTQUFTLENBQUMsRUFBRWpELFNBQVMsRUFBRThKLFFBQVEsQ0FBQztFQUM1RDs7RUFFQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBVyxZQUFZQSxDQUFDa0MsVUFBeUIsRUFBRTNNLFNBQWlCLEVBQUU4SixRQUE0QixFQUFFO0lBQ3ZGLElBQUksQ0FBQ2pHLGdCQUFnQixDQUFDN0QsU0FBUyxDQUFDLEVBQUU7TUFDaEMsTUFBTSxJQUFJN0UsS0FBSyxDQUFDbUgsS0FBSyxDQUFDbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDZ0Msa0JBQWtCLEVBQUVKLHVCQUF1QixDQUFDbEUsU0FBUyxDQUFDLENBQUM7SUFDM0Y7SUFFQTJNLFVBQVUsQ0FBQ3BULE9BQU8sQ0FBQzBKLFNBQVMsSUFBSTtNQUM5QixJQUFJLENBQUNjLGdCQUFnQixDQUFDZCxTQUFTLEVBQUVqRCxTQUFTLENBQUMsRUFBRTtRQUMzQyxNQUFNLElBQUk3RSxLQUFLLENBQUNtSCxLQUFLLENBQUNuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNnSixnQkFBZ0IsRUFBRyx1QkFBc0JySSxTQUFVLEVBQUMsQ0FBQztNQUN6RjtNQUNBO01BQ0EsSUFBSSxDQUFDZ0Isd0JBQXdCLENBQUNoQixTQUFTLEVBQUVqRCxTQUFTLENBQUMsRUFBRTtRQUNuRCxNQUFNLElBQUk3RSxLQUFLLENBQUNtSCxLQUFLLENBQUMsR0FBRyxFQUFHLFNBQVFXLFNBQVUsb0JBQW1CLENBQUM7TUFDcEU7SUFDRixDQUFDLENBQUM7SUFFRixPQUFPLElBQUksQ0FBQzRGLFlBQVksQ0FBQzdJLFNBQVMsRUFBRSxLQUFLLEVBQUU7TUFBRStILFVBQVUsRUFBRTtJQUFLLENBQUMsQ0FBQyxDQUM3RG9ELEtBQUssQ0FBQzVCLEtBQUssSUFBSTtNQUNkLElBQUlBLEtBQUssS0FBSzlPLFNBQVMsRUFBRTtRQUN2QixNQUFNLElBQUlVLEtBQUssQ0FBQ21ILEtBQUssQ0FDbkJuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNnQyxrQkFBa0IsRUFDN0IsU0FBUXRFLFNBQVUsa0JBQ3JCLENBQUM7TUFDSCxDQUFDLE1BQU07UUFDTCxNQUFNdUosS0FBSztNQUNiO0lBQ0YsQ0FBQyxDQUFDLENBQ0RsQixJQUFJLENBQUM1RCxNQUFNLElBQUk7TUFDZGtJLFVBQVUsQ0FBQ3BULE9BQU8sQ0FBQzBKLFNBQVMsSUFBSTtRQUM5QixJQUFJLENBQUN3QixNQUFNLENBQUM3QixNQUFNLENBQUNLLFNBQVMsQ0FBQyxFQUFFO1VBQzdCLE1BQU0sSUFBSTlILEtBQUssQ0FBQ21ILEtBQUssQ0FBQyxHQUFHLEVBQUcsU0FBUVcsU0FBVSxpQ0FBZ0MsQ0FBQztRQUNqRjtNQUNGLENBQUMsQ0FBQztNQUVGLE1BQU0ySixZQUFZLEdBQUEzVCxhQUFBLEtBQVF3TCxNQUFNLENBQUM3QixNQUFNLENBQUU7TUFDekMsT0FBT2tILFFBQVEsQ0FBQytDLE9BQU8sQ0FBQ3BDLFlBQVksQ0FBQ3pLLFNBQVMsRUFBRXlFLE1BQU0sRUFBRWtJLFVBQVUsQ0FBQyxDQUFDdEUsSUFBSSxDQUFDLE1BQU07UUFDN0UsT0FBT0ksT0FBTyxDQUFDbEIsR0FBRyxDQUNoQm9GLFVBQVUsQ0FBQ2hFLEdBQUcsQ0FBQzFGLFNBQVMsSUFBSTtVQUMxQixNQUFNTSxLQUFLLEdBQUdxSixZQUFZLENBQUMzSixTQUFTLENBQUM7VUFDckMsSUFBSU0sS0FBSyxJQUFJQSxLQUFLLENBQUMvSCxJQUFJLEtBQUssVUFBVSxFQUFFO1lBQ3RDO1lBQ0EsT0FBT3NPLFFBQVEsQ0FBQytDLE9BQU8sQ0FBQ0MsV0FBVyxDQUFFLFNBQVE3SixTQUFVLElBQUdqRCxTQUFVLEVBQUMsQ0FBQztVQUN4RTtVQUNBLE9BQU95SSxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDO1FBQzFCLENBQUMsQ0FDSCxDQUFDO01BQ0gsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQ0RMLElBQUksQ0FBQyxNQUFNO01BQ1ZmLG9CQUFXLENBQUN5QixLQUFLLENBQUMsQ0FBQztJQUNyQixDQUFDLENBQUM7RUFDTjs7RUFFQTtFQUNBO0VBQ0E7RUFDQSxNQUFNZ0UsY0FBY0EsQ0FBQy9NLFNBQWlCLEVBQUUzSCxNQUFXLEVBQUUrRixLQUFVLEVBQUUyTixXQUFvQixFQUFFO0lBQ3JGLElBQUlpQixRQUFRLEdBQUcsQ0FBQztJQUNoQixNQUFNdkksTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDMkcsa0JBQWtCLENBQUNwTCxTQUFTLENBQUM7SUFDdkQsTUFBTTJLLFFBQVEsR0FBRyxFQUFFO0lBRW5CLEtBQUssTUFBTTFILFNBQVMsSUFBSTVLLE1BQU0sRUFBRTtNQUM5QixJQUFJQSxNQUFNLENBQUM0SyxTQUFTLENBQUMsSUFBSXlJLE9BQU8sQ0FBQ3JULE1BQU0sQ0FBQzRLLFNBQVMsQ0FBQyxDQUFDLEtBQUssVUFBVSxFQUFFO1FBQ2xFK0osUUFBUSxFQUFFO01BQ1o7TUFDQSxJQUFJQSxRQUFRLEdBQUcsQ0FBQyxFQUFFO1FBQ2hCLE9BQU92RSxPQUFPLENBQUNTLE1BQU0sQ0FDbkIsSUFBSS9OLEtBQUssQ0FBQ21ILEtBQUssQ0FDYm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQ2lDLGNBQWMsRUFDMUIsaURBQ0YsQ0FDRixDQUFDO01BQ0g7SUFDRjtJQUNBLEtBQUssTUFBTXRCLFNBQVMsSUFBSTVLLE1BQU0sRUFBRTtNQUM5QixJQUFJQSxNQUFNLENBQUM0SyxTQUFTLENBQUMsS0FBS3hJLFNBQVMsRUFBRTtRQUNuQztNQUNGO01BQ0EsTUFBTXdTLFFBQVEsR0FBR3ZCLE9BQU8sQ0FBQ3JULE1BQU0sQ0FBQzRLLFNBQVMsQ0FBQyxDQUFDO01BQzNDLElBQUksQ0FBQ2dLLFFBQVEsRUFBRTtRQUNiO01BQ0Y7TUFDQSxJQUFJaEssU0FBUyxLQUFLLEtBQUssRUFBRTtRQUN2QjtRQUNBO01BQ0Y7TUFDQTBILFFBQVEsQ0FBQzVSLElBQUksQ0FBQzBMLE1BQU0sQ0FBQ21HLGtCQUFrQixDQUFDNUssU0FBUyxFQUFFaUQsU0FBUyxFQUFFZ0ssUUFBUSxFQUFFLElBQUksRUFBRWxCLFdBQVcsQ0FBQyxDQUFDO0lBQzdGO0lBQ0EsTUFBTWxCLE9BQU8sR0FBRyxNQUFNcEMsT0FBTyxDQUFDbEIsR0FBRyxDQUFDb0QsUUFBUSxDQUFDO0lBQzNDLE1BQU1ELGFBQWEsR0FBR0csT0FBTyxDQUFDbFMsTUFBTSxDQUFDbVMsTUFBTSxJQUFJLENBQUMsQ0FBQ0EsTUFBTSxDQUFDO0lBRXhELElBQUlKLGFBQWEsQ0FBQ3JSLE1BQU0sS0FBSyxDQUFDLEVBQUU7TUFDOUI7TUFDQSxNQUFNLElBQUksQ0FBQ3lPLFVBQVUsQ0FBQztRQUFFQyxVQUFVLEVBQUU7TUFBSyxDQUFDLENBQUM7SUFDN0M7SUFDQSxJQUFJLENBQUNrRCxZQUFZLENBQUNQLGFBQWEsQ0FBQztJQUVoQyxNQUFNd0MsT0FBTyxHQUFHekUsT0FBTyxDQUFDQyxPQUFPLENBQUNqRSxNQUFNLENBQUM7SUFDdkMsT0FBTzBJLDJCQUEyQixDQUFDRCxPQUFPLEVBQUVsTixTQUFTLEVBQUUzSCxNQUFNLEVBQUUrRixLQUFLLENBQUM7RUFDdkU7O0VBRUE7RUFDQWdQLHVCQUF1QkEsQ0FBQ3BOLFNBQWlCLEVBQUUzSCxNQUFXLEVBQUUrRixLQUFVLEVBQUU7SUFDbEUsTUFBTWlQLE9BQU8sR0FBR25NLGVBQWUsQ0FBQ0UsS0FBSyxDQUFDcEIsU0FBUyxDQUFDO0lBQ2hELElBQUksQ0FBQ3FOLE9BQU8sSUFBSUEsT0FBTyxDQUFDaFUsTUFBTSxJQUFJLENBQUMsRUFBRTtNQUNuQyxPQUFPb1AsT0FBTyxDQUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDO0lBQzlCO0lBRUEsTUFBTTRFLGNBQWMsR0FBR0QsT0FBTyxDQUFDMVUsTUFBTSxDQUFDLFVBQVU0VSxNQUFNLEVBQUU7TUFDdEQsSUFBSW5QLEtBQUssSUFBSUEsS0FBSyxDQUFDN0MsUUFBUSxFQUFFO1FBQzNCLElBQUlsRCxNQUFNLENBQUNrVixNQUFNLENBQUMsSUFBSSxPQUFPbFYsTUFBTSxDQUFDa1YsTUFBTSxDQUFDLEtBQUssUUFBUSxFQUFFO1VBQ3hEO1VBQ0EsT0FBT2xWLE1BQU0sQ0FBQ2tWLE1BQU0sQ0FBQyxDQUFDdkQsSUFBSSxJQUFJLFFBQVE7UUFDeEM7UUFDQTtRQUNBLE9BQU8sS0FBSztNQUNkO01BQ0EsT0FBTyxDQUFDM1IsTUFBTSxDQUFDa1YsTUFBTSxDQUFDO0lBQ3hCLENBQUMsQ0FBQztJQUVGLElBQUlELGNBQWMsQ0FBQ2pVLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDN0IsTUFBTSxJQUFJOEIsS0FBSyxDQUFDbUgsS0FBSyxDQUFDbkgsS0FBSyxDQUFDbUgsS0FBSyxDQUFDaUMsY0FBYyxFQUFFK0ksY0FBYyxDQUFDLENBQUMsQ0FBQyxHQUFHLGVBQWUsQ0FBQztJQUN4RjtJQUNBLE9BQU83RSxPQUFPLENBQUNDLE9BQU8sQ0FBQyxJQUFJLENBQUM7RUFDOUI7RUFFQThFLDJCQUEyQkEsQ0FBQ3hOLFNBQWlCLEVBQUV5TixRQUFrQixFQUFFMUssU0FBaUIsRUFBRTtJQUNwRixPQUFPa0UsZ0JBQWdCLENBQUN5RyxlQUFlLENBQ3JDLElBQUksQ0FBQ0Msd0JBQXdCLENBQUMzTixTQUFTLENBQUMsRUFDeEN5TixRQUFRLEVBQ1IxSyxTQUNGLENBQUM7RUFDSDs7RUFFQTtFQUNBLE9BQU8ySyxlQUFlQSxDQUFDRSxnQkFBc0IsRUFBRUgsUUFBa0IsRUFBRTFLLFNBQWlCLEVBQVc7SUFDN0YsSUFBSSxDQUFDNkssZ0JBQWdCLElBQUksQ0FBQ0EsZ0JBQWdCLENBQUM3SyxTQUFTLENBQUMsRUFBRTtNQUNyRCxPQUFPLElBQUk7SUFDYjtJQUNBLE1BQU1KLEtBQUssR0FBR2lMLGdCQUFnQixDQUFDN0ssU0FBUyxDQUFDO0lBQ3pDLElBQUlKLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRTtNQUNkLE9BQU8sSUFBSTtJQUNiO0lBQ0E7SUFDQSxJQUNFOEssUUFBUSxDQUFDSSxJQUFJLENBQUNDLEdBQUcsSUFBSTtNQUNuQixPQUFPbkwsS0FBSyxDQUFDbUwsR0FBRyxDQUFDLEtBQUssSUFBSTtJQUM1QixDQUFDLENBQUMsRUFDRjtNQUNBLE9BQU8sSUFBSTtJQUNiO0lBQ0EsT0FBTyxLQUFLO0VBQ2Q7O0VBRUE7RUFDQSxPQUFPQyxrQkFBa0JBLENBQ3ZCSCxnQkFBc0IsRUFDdEI1TixTQUFpQixFQUNqQnlOLFFBQWtCLEVBQ2xCMUssU0FBaUIsRUFDakJpTCxNQUFlLEVBQ2Y7SUFDQSxJQUFJL0csZ0JBQWdCLENBQUN5RyxlQUFlLENBQUNFLGdCQUFnQixFQUFFSCxRQUFRLEVBQUUxSyxTQUFTLENBQUMsRUFBRTtNQUMzRSxPQUFPMEYsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQztJQUMxQjtJQUVBLElBQUksQ0FBQ2tGLGdCQUFnQixJQUFJLENBQUNBLGdCQUFnQixDQUFDN0ssU0FBUyxDQUFDLEVBQUU7TUFDckQsT0FBTyxJQUFJO0lBQ2I7SUFDQSxNQUFNSixLQUFLLEdBQUdpTCxnQkFBZ0IsQ0FBQzdLLFNBQVMsQ0FBQztJQUN6QztJQUNBO0lBQ0EsSUFBSUosS0FBSyxDQUFDLHdCQUF3QixDQUFDLEVBQUU7TUFDbkM7TUFDQSxJQUFJLENBQUM4SyxRQUFRLElBQUlBLFFBQVEsQ0FBQ3BVLE1BQU0sSUFBSSxDQUFDLEVBQUU7UUFDckMsTUFBTSxJQUFJOEIsS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQzJMLGdCQUFnQixFQUM1QixvREFDRixDQUFDO01BQ0gsQ0FBQyxNQUFNLElBQUlSLFFBQVEsQ0FBQzNLLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSTJLLFFBQVEsQ0FBQ3BVLE1BQU0sSUFBSSxDQUFDLEVBQUU7UUFDN0QsTUFBTSxJQUFJOEIsS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQzJMLGdCQUFnQixFQUM1QixvREFDRixDQUFDO01BQ0g7TUFDQTtNQUNBO01BQ0EsT0FBT3hGLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUM7SUFDMUI7O0lBRUE7SUFDQTtJQUNBLE1BQU13RixlQUFlLEdBQ25CLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQ3BMLE9BQU8sQ0FBQ0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCLEdBQUcsaUJBQWlCOztJQUV6RjtJQUNBLElBQUltTCxlQUFlLElBQUksaUJBQWlCLElBQUluTCxTQUFTLElBQUksUUFBUSxFQUFFO01BQ2pFLE1BQU0sSUFBSTVILEtBQUssQ0FBQ21ILEtBQUssQ0FDbkJuSCxLQUFLLENBQUNtSCxLQUFLLENBQUM2TCxtQkFBbUIsRUFDOUIsZ0NBQStCcEwsU0FBVSxhQUFZL0MsU0FBVSxHQUNsRSxDQUFDO0lBQ0g7O0lBRUE7SUFDQSxJQUNFcUQsS0FBSyxDQUFDQyxPQUFPLENBQUNzSyxnQkFBZ0IsQ0FBQ00sZUFBZSxDQUFDLENBQUMsSUFDaEROLGdCQUFnQixDQUFDTSxlQUFlLENBQUMsQ0FBQzdVLE1BQU0sR0FBRyxDQUFDLEVBQzVDO01BQ0EsT0FBT29QLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUM7SUFDMUI7SUFFQSxNQUFNbEYsYUFBYSxHQUFHb0ssZ0JBQWdCLENBQUM3SyxTQUFTLENBQUMsQ0FBQ1MsYUFBYTtJQUMvRCxJQUFJSCxLQUFLLENBQUNDLE9BQU8sQ0FBQ0UsYUFBYSxDQUFDLElBQUlBLGFBQWEsQ0FBQ25LLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDNUQ7TUFDQSxJQUFJMEosU0FBUyxLQUFLLFVBQVUsSUFBSWlMLE1BQU0sS0FBSyxRQUFRLEVBQUU7UUFDbkQ7UUFDQSxPQUFPdkYsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQztNQUMxQjtJQUNGO0lBRUEsTUFBTSxJQUFJdk4sS0FBSyxDQUFDbUgsS0FBSyxDQUNuQm5ILEtBQUssQ0FBQ21ILEtBQUssQ0FBQzZMLG1CQUFtQixFQUM5QixnQ0FBK0JwTCxTQUFVLGFBQVkvQyxTQUFVLEdBQ2xFLENBQUM7RUFDSDs7RUFFQTtFQUNBK04sa0JBQWtCQSxDQUFDL04sU0FBaUIsRUFBRXlOLFFBQWtCLEVBQUUxSyxTQUFpQixFQUFFaUwsTUFBZSxFQUFFO0lBQzVGLE9BQU8vRyxnQkFBZ0IsQ0FBQzhHLGtCQUFrQixDQUN4QyxJQUFJLENBQUNKLHdCQUF3QixDQUFDM04sU0FBUyxDQUFDLEVBQ3hDQSxTQUFTLEVBQ1R5TixRQUFRLEVBQ1IxSyxTQUFTLEVBQ1RpTCxNQUNGLENBQUM7RUFDSDtFQUVBTCx3QkFBd0JBLENBQUMzTixTQUFpQixFQUFPO0lBQy9DLE9BQU8sSUFBSSxDQUFDcUgsVUFBVSxDQUFDckgsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDcUgsVUFBVSxDQUFDckgsU0FBUyxDQUFDLENBQUN3RixxQkFBcUI7RUFDdkY7O0VBRUE7RUFDQTtFQUNBNkcsZUFBZUEsQ0FBQ3JNLFNBQWlCLEVBQUVpRCxTQUFpQixFQUEyQjtJQUM3RSxJQUFJLElBQUksQ0FBQ29FLFVBQVUsQ0FBQ3JILFNBQVMsQ0FBQyxFQUFFO01BQzlCLE1BQU1vTSxZQUFZLEdBQUcsSUFBSSxDQUFDL0UsVUFBVSxDQUFDckgsU0FBUyxDQUFDLENBQUM0QyxNQUFNLENBQUNLLFNBQVMsQ0FBQztNQUNqRSxPQUFPbUosWUFBWSxLQUFLLEtBQUssR0FBRyxRQUFRLEdBQUdBLFlBQVk7SUFDekQ7SUFDQSxPQUFPM1IsU0FBUztFQUNsQjs7RUFFQTtFQUNBMlQsUUFBUUEsQ0FBQ3BPLFNBQWlCLEVBQUU7SUFDMUIsSUFBSSxJQUFJLENBQUNxSCxVQUFVLENBQUNySCxTQUFTLENBQUMsRUFBRTtNQUM5QixPQUFPeUksT0FBTyxDQUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDO0lBQzlCO0lBQ0EsT0FBTyxJQUFJLENBQUNaLFVBQVUsQ0FBQyxDQUFDLENBQUNPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUNoQixVQUFVLENBQUNySCxTQUFTLENBQUMsQ0FBQztFQUNuRTtBQUNGOztBQUVBO0FBQUFpQixPQUFBLENBQUFnRyxnQkFBQSxHQUFBaEcsT0FBQSxDQUFBOUksT0FBQSxHQUFBOE8sZ0JBQUE7QUFDQSxNQUFNb0gsSUFBSSxHQUFHQSxDQUFDQyxTQUF5QixFQUFFcEcsT0FBWSxLQUFnQztFQUNuRixNQUFNekQsTUFBTSxHQUFHLElBQUl3QyxnQkFBZ0IsQ0FBQ3FILFNBQVMsQ0FBQztFQUM5QzFILEdBQUcsQ0FBQ0ksUUFBUSxHQUFHc0gsU0FBUyxDQUFDQyxjQUFjO0VBQ3ZDLE9BQU85SixNQUFNLENBQUNxRCxVQUFVLENBQUNJLE9BQU8sQ0FBQyxDQUFDRyxJQUFJLENBQUMsTUFBTTVELE1BQU0sQ0FBQztBQUN0RCxDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQXhELE9BQUEsQ0FBQW9OLElBQUEsR0FBQUEsSUFBQTtBQUNBLFNBQVNuRSx1QkFBdUJBLENBQUNILGNBQTRCLEVBQUV5RSxVQUFlLEVBQWdCO0VBQzVGLE1BQU12RSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0VBQ3BCO0VBQ0EsTUFBTXdFLGNBQWMsR0FDbEJqVyxNQUFNLENBQUNELElBQUksQ0FBQzZDLGNBQWMsQ0FBQyxDQUFDMEgsT0FBTyxDQUFDaUgsY0FBYyxDQUFDMkUsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQzFELEVBQUUsR0FDRmxXLE1BQU0sQ0FBQ0QsSUFBSSxDQUFDNkMsY0FBYyxDQUFDMk8sY0FBYyxDQUFDMkUsR0FBRyxDQUFDLENBQUM7RUFDckQsS0FBSyxNQUFNQyxRQUFRLElBQUk1RSxjQUFjLEVBQUU7SUFDckMsSUFDRTRFLFFBQVEsS0FBSyxLQUFLLElBQ2xCQSxRQUFRLEtBQUssS0FBSyxJQUNsQkEsUUFBUSxLQUFLLFdBQVcsSUFDeEJBLFFBQVEsS0FBSyxXQUFXLElBQ3hCQSxRQUFRLEtBQUssVUFBVSxFQUN2QjtNQUNBLElBQUlGLGNBQWMsQ0FBQ3BWLE1BQU0sR0FBRyxDQUFDLElBQUlvVixjQUFjLENBQUMzTCxPQUFPLENBQUM2TCxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtRQUN4RTtNQUNGO01BQ0EsTUFBTUMsY0FBYyxHQUFHSixVQUFVLENBQUNHLFFBQVEsQ0FBQyxJQUFJSCxVQUFVLENBQUNHLFFBQVEsQ0FBQyxDQUFDM0UsSUFBSSxLQUFLLFFBQVE7TUFDckYsSUFBSSxDQUFDNEUsY0FBYyxFQUFFO1FBQ25CM0UsU0FBUyxDQUFDMEUsUUFBUSxDQUFDLEdBQUc1RSxjQUFjLENBQUM0RSxRQUFRLENBQUM7TUFDaEQ7SUFDRjtFQUNGO0VBQ0EsS0FBSyxNQUFNRSxRQUFRLElBQUlMLFVBQVUsRUFBRTtJQUNqQyxJQUFJSyxRQUFRLEtBQUssVUFBVSxJQUFJTCxVQUFVLENBQUNLLFFBQVEsQ0FBQyxDQUFDN0UsSUFBSSxLQUFLLFFBQVEsRUFBRTtNQUNyRSxJQUFJeUUsY0FBYyxDQUFDcFYsTUFBTSxHQUFHLENBQUMsSUFBSW9WLGNBQWMsQ0FBQzNMLE9BQU8sQ0FBQytMLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFO1FBQ3hFO01BQ0Y7TUFDQTVFLFNBQVMsQ0FBQzRFLFFBQVEsQ0FBQyxHQUFHTCxVQUFVLENBQUNLLFFBQVEsQ0FBQztJQUM1QztFQUNGO0VBQ0EsT0FBTzVFLFNBQVM7QUFDbEI7O0FBRUE7QUFDQTtBQUNBLFNBQVNrRCwyQkFBMkJBLENBQUMyQixhQUFhLEVBQUU5TyxTQUFTLEVBQUUzSCxNQUFNLEVBQUUrRixLQUFLLEVBQUU7RUFDNUUsT0FBTzBRLGFBQWEsQ0FBQ3pHLElBQUksQ0FBQzVELE1BQU0sSUFBSTtJQUNsQyxPQUFPQSxNQUFNLENBQUMySSx1QkFBdUIsQ0FBQ3BOLFNBQVMsRUFBRTNILE1BQU0sRUFBRStGLEtBQUssQ0FBQztFQUNqRSxDQUFDLENBQUM7QUFDSjs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU3NOLE9BQU9BLENBQUN6VCxHQUFRLEVBQTJCO0VBQ2xELE1BQU11RCxJQUFJLEdBQUcsT0FBT3ZELEdBQUc7RUFDdkIsUUFBUXVELElBQUk7SUFDVixLQUFLLFNBQVM7TUFDWixPQUFPLFNBQVM7SUFDbEIsS0FBSyxRQUFRO01BQ1gsT0FBTyxRQUFRO0lBQ2pCLEtBQUssUUFBUTtNQUNYLE9BQU8sUUFBUTtJQUNqQixLQUFLLEtBQUs7SUFDVixLQUFLLFFBQVE7TUFDWCxJQUFJLENBQUN2RCxHQUFHLEVBQUU7UUFDUixPQUFPd0MsU0FBUztNQUNsQjtNQUNBLE9BQU9zVSxhQUFhLENBQUM5VyxHQUFHLENBQUM7SUFDM0IsS0FBSyxVQUFVO0lBQ2YsS0FBSyxRQUFRO0lBQ2IsS0FBSyxXQUFXO0lBQ2hCO01BQ0UsTUFBTSxXQUFXLEdBQUdBLEdBQUc7RUFDM0I7QUFDRjs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxTQUFTOFcsYUFBYUEsQ0FBQzlXLEdBQUcsRUFBMkI7RUFDbkQsSUFBSUEsR0FBRyxZQUFZb0wsS0FBSyxFQUFFO0lBQ3hCLE9BQU8sT0FBTztFQUNoQjtFQUNBLElBQUlwTCxHQUFHLENBQUMrVyxNQUFNLEVBQUU7SUFDZCxRQUFRL1csR0FBRyxDQUFDK1csTUFBTTtNQUNoQixLQUFLLFNBQVM7UUFDWixJQUFJL1csR0FBRyxDQUFDK0gsU0FBUyxFQUFFO1VBQ2pCLE9BQU87WUFDTHhFLElBQUksRUFBRSxTQUFTO1lBQ2YyQixXQUFXLEVBQUVsRixHQUFHLENBQUMrSDtVQUNuQixDQUFDO1FBQ0g7UUFDQTtNQUNGLEtBQUssVUFBVTtRQUNiLElBQUkvSCxHQUFHLENBQUMrSCxTQUFTLEVBQUU7VUFDakIsT0FBTztZQUNMeEUsSUFBSSxFQUFFLFVBQVU7WUFDaEIyQixXQUFXLEVBQUVsRixHQUFHLENBQUMrSDtVQUNuQixDQUFDO1FBQ0g7UUFDQTtNQUNGLEtBQUssTUFBTTtRQUNULElBQUkvSCxHQUFHLENBQUNnRixJQUFJLEVBQUU7VUFDWixPQUFPLE1BQU07UUFDZjtRQUNBO01BQ0YsS0FBSyxNQUFNO1FBQ1QsSUFBSWhGLEdBQUcsQ0FBQ2dYLEdBQUcsRUFBRTtVQUNYLE9BQU8sTUFBTTtRQUNmO1FBQ0E7TUFDRixLQUFLLFVBQVU7UUFDYixJQUFJaFgsR0FBRyxDQUFDaVgsUUFBUSxJQUFJLElBQUksSUFBSWpYLEdBQUcsQ0FBQ2tYLFNBQVMsSUFBSSxJQUFJLEVBQUU7VUFDakQsT0FBTyxVQUFVO1FBQ25CO1FBQ0E7TUFDRixLQUFLLE9BQU87UUFDVixJQUFJbFgsR0FBRyxDQUFDbVgsTUFBTSxFQUFFO1VBQ2QsT0FBTyxPQUFPO1FBQ2hCO1FBQ0E7TUFDRixLQUFLLFNBQVM7UUFDWixJQUFJblgsR0FBRyxDQUFDb1gsV0FBVyxFQUFFO1VBQ25CLE9BQU8sU0FBUztRQUNsQjtRQUNBO0lBQ0o7SUFDQSxNQUFNLElBQUlsVSxLQUFLLENBQUNtSCxLQUFLLENBQUNuSCxLQUFLLENBQUNtSCxLQUFLLENBQUNpQyxjQUFjLEVBQUUsc0JBQXNCLEdBQUd0TSxHQUFHLENBQUMrVyxNQUFNLENBQUM7RUFDeEY7RUFDQSxJQUFJL1csR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFO0lBQ2QsT0FBTzhXLGFBQWEsQ0FBQzlXLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztFQUNsQztFQUNBLElBQUlBLEdBQUcsQ0FBQytSLElBQUksRUFBRTtJQUNaLFFBQVEvUixHQUFHLENBQUMrUixJQUFJO01BQ2QsS0FBSyxXQUFXO1FBQ2QsT0FBTyxRQUFRO01BQ2pCLEtBQUssUUFBUTtRQUNYLE9BQU8sSUFBSTtNQUNiLEtBQUssS0FBSztNQUNWLEtBQUssV0FBVztNQUNoQixLQUFLLFFBQVE7UUFDWCxPQUFPLE9BQU87TUFDaEIsS0FBSyxhQUFhO01BQ2xCLEtBQUssZ0JBQWdCO1FBQ25CLE9BQU87VUFDTHhPLElBQUksRUFBRSxVQUFVO1VBQ2hCMkIsV0FBVyxFQUFFbEYsR0FBRyxDQUFDcVgsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDdFA7UUFDOUIsQ0FBQztNQUNILEtBQUssT0FBTztRQUNWLE9BQU8rTyxhQUFhLENBQUM5VyxHQUFHLENBQUNzWCxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDbEM7UUFDRSxNQUFNLGlCQUFpQixHQUFHdFgsR0FBRyxDQUFDK1IsSUFBSTtJQUN0QztFQUNGO0VBQ0EsT0FBTyxRQUFRO0FBQ2pCIn0=