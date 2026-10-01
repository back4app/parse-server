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
var _Error = require("../Error");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
const defaultColumns = exports.defaultColumns = Object.freeze({
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
const requiredColumns = exports.requiredColumns = Object.freeze({
  read: {
    _User: ['username']
  },
  write: {
    _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
    _Role: ['name', 'ACL']
  }
});
const invalidColumns = ['length'];
const systemClasses = exports.systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency', '_ExportProgress']);
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
const CLPValidKeys = Object.freeze(['ACL', 'find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']);

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
      const permit = operation[entity];
      if (operationKey === 'ACL') {
        if (Object.prototype.toString.call(permit) !== '[object Object]') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${permit}' is not a valid value for class level permissions acl`);
        }
        const invalidKeys = Object.keys(permit).filter(key => !['read', 'write'].includes(key));
        const invalidValues = Object.values(permit).filter(key => typeof key !== 'boolean');
        if (invalidKeys.length) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${invalidKeys.join(',')}' is not a valid key for class level permissions acl`);
        }
        if (invalidValues.length) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${invalidValues.join(',')}' is not a valid value for class level permissions acl`);
        }
      } else if (permit !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${permit}' is not a valid value for class level permissions acl ${operationKey}:${entity}`);
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
const convertAdapterSchemaToParseSchema = ({
  ...schema
}) => {
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
            data.classLevelPermissions = structuredClone(schema.classLevelPermissions);
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
    fields: {
      ...defaultColumns._Default,
      ...(defaultColumns[className] || {}),
      ...fields
    },
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
const VolatileClassesSchemas = exports.VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema, _IdempotencySchema];
const dbTypeMatchesObjectType = (dbType, objectType) => {
  if (dbType.type !== objectType.type) {
    return false;
  }
  if (dbType.targetClass !== objectType.targetClass) {
    return false;
  }
  if (dbType === objectType.type) {
    return true;
  }
  if (dbType.type === objectType.type) {
    return true;
  }
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
  constructor(databaseAdapter, appId) {
    this._dbAdapter = databaseAdapter;
    this._appId = appId || Parse.applicationId;
    this._cache = _SchemaCache.default.for(databaseAdapter);
    const config = _Config.default.get(this._appId);
    this.schemaData = new SchemaData(this._cache.all(), this.protectedFields);
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
    const ttl = this._cache.ttl;
    const {
      date,
      duration
    } = ttl;
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
    const cached = this._cache.all();
    if (cached && cached.length) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses();
  }
  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      this._cache.put(allSchemas);
      return allSchemas;
    });
  }
  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      this._cache.clear();
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
    const cached = this._cache.get(className);
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
        if (error) {
          return {
            code: error.code,
            error: error.message
          };
        }
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
    const cached = this._cache.get(className);
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
      // "<array>.<index>" for Nested Arrays
      // "<embedded document>.<field>" for Nested Objects
      // JSON Arrays are treated as Nested Objects
      const [x, y] = fieldName.split('.');
      fieldName = x;
      const isArrayIndex = Array.from(y).every(c => c >= '0' && c <= '9');
      if (isArrayIndex && !['sentPerUTCOffset', 'failedPerUTCOffset'].includes(fieldName)) {
        type = 'Array';
      } else {
        type = 'Object';
      }
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
      const schemaFields = {
        ...schema.fields
      };
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
      this._cache.clear();
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
  static validatePermission(classPermissions, className, aclGroup, operation, action, appId) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    const config = _Config.default.get(appId || Parse.applicationId);
    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw (0, _Error.createSanitizedError)(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.', config);
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw (0, _Error.createSanitizedError)(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.', config);
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
      throw (0, _Error.createSanitizedError)(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`, config);
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
    throw (0, _Error.createSanitizedError)(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`, config);
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action, this._appId);
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
const load = (dbAdapter, options, appId) => {
  const schema = new SchemaController(dbAdapter, appId);
  schema._cache.ttl.duration = dbAdapter.schemaCacheTtl;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX0Vycm9yIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImV4cG9ydHMiLCJPYmplY3QiLCJmcmVlemUiLCJfRGVmYXVsdCIsIm9iamVjdElkIiwidHlwZSIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIkFDTCIsIl9Vc2VyIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsImVtYWlsIiwiZW1haWxWZXJpZmllZCIsImF1dGhEYXRhIiwiX0luc3RhbGxhdGlvbiIsImluc3RhbGxhdGlvbklkIiwiZGV2aWNlVG9rZW4iLCJjaGFubmVscyIsImRldmljZVR5cGUiLCJwdXNoVHlwZSIsIkdDTVNlbmRlcklkIiwidGltZVpvbmUiLCJsb2NhbGVJZGVudGlmaWVyIiwiYmFkZ2UiLCJhcHBWZXJzaW9uIiwiYXBwTmFtZSIsImFwcElkZW50aWZpZXIiLCJwYXJzZVZlcnNpb24iLCJfUm9sZSIsIm5hbWUiLCJ1c2VycyIsInRhcmdldENsYXNzIiwicm9sZXMiLCJfU2Vzc2lvbiIsInVzZXIiLCJzZXNzaW9uVG9rZW4iLCJleHBpcmVzQXQiLCJjcmVhdGVkV2l0aCIsIl9Qcm9kdWN0IiwicHJvZHVjdElkZW50aWZpZXIiLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsImljb24iLCJvcmRlciIsInRpdGxlIiwic3VidGl0bGUiLCJfUHVzaFN0YXR1cyIsInB1c2hUaW1lIiwic291cmNlIiwicXVlcnkiLCJwYXlsb2FkIiwiZXhwaXJ5IiwiZXhwaXJhdGlvbl9pbnRlcnZhbCIsInN0YXR1cyIsIm51bVNlbnQiLCJudW1GYWlsZWQiLCJwdXNoSGFzaCIsImVycm9yTWVzc2FnZSIsInNlbnRQZXJUeXBlIiwiZmFpbGVkUGVyVHlwZSIsInNlbnRQZXJVVENPZmZzZXQiLCJmYWlsZWRQZXJVVENPZmZzZXQiLCJjb3VudCIsIl9Kb2JTdGF0dXMiLCJqb2JOYW1lIiwibWVzc2FnZSIsInBhcmFtcyIsImZpbmlzaGVkQXQiLCJfSm9iU2NoZWR1bGUiLCJkZXNjcmlwdGlvbiIsInN0YXJ0QWZ0ZXIiLCJkYXlzT2ZXZWVrIiwidGltZU9mRGF5IiwibGFzdFJ1biIsInJlcGVhdE1pbnV0ZXMiLCJfSG9va3MiLCJmdW5jdGlvbk5hbWUiLCJjbGFzc05hbWUiLCJ0cmlnZ2VyTmFtZSIsInVybCIsIl9HbG9iYWxDb25maWciLCJtYXN0ZXJLZXlPbmx5IiwiX0dyYXBoUUxDb25maWciLCJjb25maWciLCJfQXVkaWVuY2UiLCJsYXN0VXNlZCIsInRpbWVzVXNlZCIsIl9JZGVtcG90ZW5jeSIsInJlcUlkIiwiZXhwaXJlIiwiX0V4cG9ydFByb2dyZXNzIiwiaWQiLCJtYXN0ZXJLZXkiLCJhcHBsaWNhdGlvbklkIiwicmVxdWlyZWRDb2x1bW5zIiwicmVhZCIsIndyaXRlIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5Iiwia2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0IiwidG9TdHJpbmciLCJpbnZhbGlkS2V5cyIsImtleXMiLCJmaWx0ZXIiLCJpbmNsdWRlcyIsImludmFsaWRWYWx1ZXMiLCJ2YWx1ZXMiLCJsZW5ndGgiLCJqb2luIiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MiLCJpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSIsImludmFsaWRKc29uRXJyb3IiLCJ2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMiLCJmaWVsZFR5cGVJc0ludmFsaWQiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJ1bmRlZmluZWQiLCJJTkNPUlJFQ1RfVFlQRSIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJzY2hlbWEiLCJpbmplY3REZWZhdWx0U2NoZW1hIiwiX3JwZXJtIiwiX3dwZXJtIiwiX2hhc2hlZF9wYXNzd29yZCIsImNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSIsImluZGV4ZXMiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJmb3JFYWNoIiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwic3RydWN0dXJlZENsb25lIiwiY2xhc3NQcm90ZWN0ZWRGaWVsZHMiLCJ1bnEiLCJTZXQiLCJmcm9tIiwiZGVmYXVsdFNjaGVtYSIsIl9Ib29rc1NjaGVtYSIsIl9HbG9iYWxDb25maWdTY2hlbWEiLCJfR3JhcGhRTENvbmZpZ1NjaGVtYSIsIl9QdXNoU3RhdHVzU2NoZW1hIiwiX0pvYlN0YXR1c1NjaGVtYSIsIl9Kb2JTY2hlZHVsZVNjaGVtYSIsIl9BdWRpZW5jZVNjaGVtYSIsIl9JZGVtcG90ZW5jeVNjaGVtYSIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSIsImRiVHlwZSIsIm9iamVjdFR5cGUiLCJ0eXBlVG9TdHJpbmciLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwiYXBwSWQiLCJfZGJBZGFwdGVyIiwiX2FwcElkIiwiX2NhY2hlIiwiU2NoZW1hQ2FjaGUiLCJmb3IiLCJDb25maWciLCJzY2hlbWFEYXRhIiwiYWxsIiwiY3VzdG9tSWRzIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsImN1c3RvbUlkUmVnRXgiLCJhdXRvSWRSZWdFeCIsInVzZXJJZFJlZ0V4Iiwid2F0Y2giLCJyZWxvYWREYXRhIiwiY2xlYXJDYWNoZSIsInJlbG9hZERhdGFJZk5lZWRlZCIsImVuYWJsZVNjaGVtYUhvb2tzIiwidHRsIiwiZGF0ZSIsImR1cmF0aW9uIiwibm93IiwiRGF0ZSIsIm9wdGlvbnMiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImNhY2hlZCIsIlByb21pc2UiLCJyZXNvbHZlIiwibWFwIiwicHV0IiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJjbGVhciIsIm9uZVNjaGVtYSIsImZpbmQiLCJyZWplY3QiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwidmFsaWRhdGlvbkVycm9yIiwidmFsaWRhdGVOZXdDbGFzcyIsImNvZGUiLCJlcnJvciIsImFkYXB0ZXJTY2hlbWEiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiRFVQTElDQVRFX1ZBTFVFIiwidXBkYXRlQ2xhc3MiLCJzdWJtaXR0ZWRGaWVsZHMiLCJkYXRhYmFzZSIsImV4aXN0aW5nRmllbGRzIiwiX19vcCIsIm5ld1NjaGVtYSIsImJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0IiwiZGVmYXVsdEZpZWxkcyIsImZ1bGxOZXdTY2hlbWEiLCJhc3NpZ24iLCJ2YWxpZGF0ZVNjaGVtYURhdGEiLCJkZWxldGVkRmllbGRzIiwiaW5zZXJ0ZWRGaWVsZHMiLCJwdXNoIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsInJlc3VsdHMiLCJyZXN1bHQiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJjYXRjaCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNWYWxpZGF0aW9uIiwibWFpbnRlbmFuY2UiLCJ4IiwieSIsInNwbGl0IiwiaXNBcnJheUluZGV4IiwiZXZlcnkiLCJjIiwiZmllbGROYW1lVG9WYWxpZGF0ZSIsImNoYXJBdCIsInN1YnN0cmluZyIsImV4cGVjdGVkVHlwZSIsImdldEV4cGVjdGVkVHlwZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiaSIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0Iiwib2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwZXJtaXNzaW9uRmllbGQiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiaGFzQ2xhc3MiLCJsb2FkIiwiZGJBZGFwdGVyIiwic2NoZW1hQ2FjaGVUdGwiLCJwdXRSZXF1ZXN0Iiwic3lzU2NoZW1hRmllbGQiLCJfaWQiLCJvbGRGaWVsZCIsImZpZWxkSXNEZWxldGVkIiwibmV3RmllbGQiLCJzY2hlbWFQcm9taXNlIiwib2JqIiwiZ2V0T2JqZWN0VHlwZSIsIl9fdHlwZSIsImlzbyIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiYmFzZTY0IiwiY29vcmRpbmF0ZXMiLCJvYmplY3RzIiwib3BzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIFRoaXMgY2xhc3MgaGFuZGxlcyBzY2hlbWEgdmFsaWRhdGlvbiwgcGVyc2lzdGVuY2UsIGFuZCBtb2RpZmljYXRpb24uXG4vL1xuLy8gRWFjaCBpbmRpdmlkdWFsIFNjaGVtYSBvYmplY3Qgc2hvdWxkIGJlIGltbXV0YWJsZS4gVGhlIGhlbHBlcnMgdG9cbi8vIGRvIHRoaW5ncyB3aXRoIHRoZSBTY2hlbWEganVzdCByZXR1cm4gYSBuZXcgc2NoZW1hIHdoZW4gdGhlIHNjaGVtYVxuLy8gaXMgY2hhbmdlZC5cbi8vXG4vLyBUaGUgY2Fub25pY2FsIHBsYWNlIHRvIHN0b3JlIHRoaXMgU2NoZW1hIGlzIGluIHRoZSBkYXRhYmFzZSBpdHNlbGYsXG4vLyBpbiBhIF9TQ0hFTUEgY29sbGVjdGlvbi4gVGhpcyBpcyBub3QgdGhlIHJpZ2h0IHdheSB0byBkbyBpdCBmb3IgYW5cbi8vIG9wZW4gc291cmNlIGZyYW1ld29yaywgYnV0IGl0J3MgYmFja3dhcmQgY29tcGF0aWJsZSwgc28gd2UncmVcbi8vIGtlZXBpbmcgaXQgdGhpcyB3YXkgZm9yIG5vdy5cbi8vXG4vLyBJbiBBUEktaGFuZGxpbmcgY29kZSwgeW91IHNob3VsZCBvbmx5IHVzZSB0aGUgU2NoZW1hIGNsYXNzIHZpYSB0aGVcbi8vIERhdGFiYXNlQ29udHJvbGxlci4gVGhpcyB3aWxsIGxldCB1cyByZXBsYWNlIHRoZSBzY2hlbWEgbG9naWMgZm9yXG4vLyBkaWZmZXJlbnQgZGF0YWJhc2VzLlxuLy8gVE9ETzogaGlkZSBhbGwgc2NoZW1hIGxvZ2ljIGluc2lkZSB0aGUgZGF0YWJhc2UgYWRhcHRlci5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgY3JlYXRlU2FuaXRpemVkRXJyb3IgfSBmcm9tICcuLi9FcnJvcic7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYSxcbiAgU2NoZW1hRmllbGRzLFxuICBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIFNjaGVtYUZpZWxkLFxuICBMb2FkU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IGRlZmF1bHRDb2x1bW5zOiB7IFtzdHJpbmddOiBTY2hlbWFGaWVsZHMgfSA9IE9iamVjdC5mcmVlemUoe1xuICAvLyBDb250YWluIHRoZSBkZWZhdWx0IGNvbHVtbnMgZm9yIGV2ZXJ5IHBhcnNlIG9iamVjdCB0eXBlIChleGNlcHQgX0pvaW4gY29sbGVjdGlvbilcbiAgX0RlZmF1bHQ6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNyZWF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB1cGRhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgQUNMOiB7IHR5cGU6ICdBQ0wnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Vc2VyIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfVXNlcjoge1xuICAgIHVzZXJuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFzc3dvcmQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsVmVyaWZpZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgYXV0aERhdGE6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX0luc3RhbGxhdGlvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX0luc3RhbGxhdGlvbjoge1xuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGV2aWNlVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjaGFubmVsczogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgZGV2aWNlVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHB1c2hUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgR0NNU2VuZGVySWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0aW1lWm9uZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxvY2FsZUlkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBiYWRnZTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGFwcFZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcnNlVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfUm9sZSBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1JvbGU6IHtcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXNlcnM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICByb2xlczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Sb2xlJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfU2Vzc2lvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1Nlc3Npb246IHtcbiAgICB1c2VyOiB7IHR5cGU6ICdQb2ludGVyJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNlc3Npb25Ub2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZXNBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBjcmVhdGVkV2l0aDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfUHJvZHVjdDoge1xuICAgIHByb2R1Y3RJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZG93bmxvYWQ6IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgZG93bmxvYWROYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWNvbjogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBvcmRlcjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3VidGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX1B1c2hTdGF0dXM6IHtcbiAgICBwdXNoVGltZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyByZXN0IG9yIHdlYnVpXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcXVlcnlcbiAgICBwYXlsb2FkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHBheWxvYWQsXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcnk6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBleHBpcmF0aW9uX2ludGVydmFsOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbnVtU2VudDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIG51bUZhaWxlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHB1c2hIYXNoOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXJyb3JNZXNzYWdlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGNvdW50OiB7IHR5cGU6ICdOdW1iZXInIH0sIC8vIHRyYWNrcyAjIG9mIGJhdGNoZXMgcXVldWVkIGFuZCBwZW5kaW5nXG4gIH0sXG4gIF9Kb2JTdGF0dXM6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWVzc2FnZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LCAvLyBwYXJhbXMgcmVjZWl2ZWQgd2hlbiBjYWxsaW5nIHRoZSBqb2JcbiAgICBmaW5pc2hlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfSm9iU2NoZWR1bGU6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGFydEFmdGVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGF5c09mV2VlazogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgdGltZU9mRGF5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbGFzdFJ1bjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHJlcGVhdE1pbnV0ZXM6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0hvb2tzOiB7XG4gICAgZnVuY3Rpb25OYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2xhc3NOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdHJpZ2dlck5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1cmw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX0dsb2JhbENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgbWFzdGVyS2V5T25seTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfR3JhcGhRTENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY29uZmlnOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9BdWRpZW5jZToge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vc3RvcmluZyBxdWVyeSBhcyBKU09OIHN0cmluZyB0byBwcmV2ZW50IFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIiBlcnJvclxuICAgIGxhc3RVc2VkOiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHRpbWVzVXNlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSWRlbXBvdGVuY3k6IHtcbiAgICByZXFJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZTogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbiAgX0V4cG9ydFByb2dyZXNzOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1hc3RlcktleTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcGxpY2F0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbn0pO1xuXG4vLyBmaWVsZHMgcmVxdWlyZWQgZm9yIHJlYWQgb3Igd3JpdGUgb3BlcmF0aW9ucyBvbiB0aGVpciByZXNwZWN0aXZlIGNsYXNzZXMuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgcmVhZDoge1xuICAgIF9Vc2VyOiBbJ3VzZXJuYW1lJ10sXG4gIH0sXG4gIHdyaXRlOiB7XG4gICAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICAgIF9Sb2xlOiBbJ25hbWUnLCAnQUNMJ10sXG4gIH0sXG59KTtcblxuY29uc3QgaW52YWxpZENvbHVtbnMgPSBbJ2xlbmd0aCddO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuICAnX0V4cG9ydFByb2dyZXNzJyxcbl0pO1xuXG5jb25zdCB2b2xhdGlsZUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0hvb2tzJyxcbiAgJ19HbG9iYWxDb25maWcnLFxuICAnX0dyYXBoUUxDb25maWcnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuICAnX0V4cG9ydFByb2dyZXNzJyxcbl0pO1xuXG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkIChhbGxvd2VkIGZvciBwcm90ZWN0ZWQgZmllbGRzIG9ubHkpXG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXggPSAvXnVzZXJGaWVsZDouKi87XG4vLyAqIHBlcm1pc3Npb25cbmNvbnN0IHB1YmxpY1JlZ2V4ID0gL15cXCokLztcblxuY29uc3QgYXV0aGVudGljYXRlZFJlZ2V4ID0gL15hdXRoZW50aWNhdGVkJC87XG5cbmNvbnN0IHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBjbHBQb2ludGVyUmVnZXggPSAvXnBvaW50ZXJGaWVsZHMkLztcblxuLy8gcmVnZXggZm9yIHZhbGlkYXRpbmcgZW50aXRpZXMgaW4gcHJvdGVjdGVkRmllbGRzIG9iamVjdFxuY29uc3QgcHJvdGVjdGVkRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgYXV0aGVudGljYXRlZFJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuLy8gY2xwIHJlZ2V4XG5jb25zdCBjbHBGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBjbHBQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgY2xwRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIGRlcGVuZHMgb24gc3RhcnR1cCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBwcm90ZWN0ZWRGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgcmVnZXggZGVwZW5kcyBvbiBsYXVuY2ggb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdBQ0wnLFxuICAnZmluZCcsXG4gICdjb3VudCcsXG4gICdnZXQnLFxuICAnY3JlYXRlJyxcbiAgJ3VwZGF0ZScsXG4gICdkZWxldGUnLFxuICAnYWRkRmllbGQnLFxuICAncmVhZFVzZXJGaWVsZHMnLFxuICAnd3JpdGVVc2VyRmllbGRzJyxcbiAgJ3Byb3RlY3RlZEZpZWxkcycsXG5dKTtcblxuLy8gdmFsaWRhdGlvbiBiZWZvcmUgc2V0dGluZyBjbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBvbiBjb2xsZWN0aW9uXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUChwZXJtczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHM6IFNjaGVtYUZpZWxkcywgdXNlcklkUmVnRXhwOiBSZWdFeHApIHtcbiAgaWYgKCFwZXJtcykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IG9wZXJhdGlvbktleSBpbiBwZXJtcykge1xuICAgIGlmIChDTFBWYWxpZEtleXMuaW5kZXhPZihvcGVyYXRpb25LZXkpID09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCR7b3BlcmF0aW9uS2V5fSBpcyBub3QgYSB2YWxpZCBvcGVyYXRpb24gZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcGVyYXRpb24gPSBwZXJtc1tvcGVyYXRpb25LZXldO1xuICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuXG4gICAgLy8gdGhyb3dzIHdoZW4gcm9vdCBmaWVsZHMgYXJlIG9mIHdyb25nIHR5cGVcbiAgICB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uLCBvcGVyYXRpb25LZXkpO1xuXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgICAvLyB2YWxpZGF0ZSBncm91cGVkIHBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAgIC8vIG11c3QgYmUgYW4gYXJyYXkgd2l0aCBmaWVsZCBuYW1lc1xuICAgICAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2Ygb3BlcmF0aW9uKSB7XG4gICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lLCBmaWVsZHMsIG9wZXJhdGlvbktleSk7XG4gICAgICB9XG4gICAgICAvLyByZWFkVXNlckZpZWxkcyBhbmQgd3JpdGVyVXNlckZpZWxkcyBkbyBub3QgaGF2ZSBuZXNkdGVkIGZpZWxkc1xuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBwcm90ZWN0ZWQgZmllbGRzXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3Byb3RlY3RlZEZpZWxkcycpIHtcbiAgICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgICAgdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3Byb3RlY3RlZEZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBwcm90ZWN0ZWRGaWVsZHNbJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGZpZWxkIGlzIGluIGZvcm0gb2YgYXJyYXlcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAvLyBkbyBub3QgYWxsb293IHRvIHByb3RlY3QgZGVmYXVsdCBmaWVsZHNcbiAgICAgICAgICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGRdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYERlZmF1bHQgZmllbGQgJyR7ZmllbGR9JyBjYW4gbm90IGJlIHByb3RlY3RlZGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGZpZWxkIHNob3VsZCBleGlzdCBvbiBjb2xsZWN0aW9uXG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBmaWVsZCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRmllbGQgJyR7ZmllbGR9JyBpbiBwcm90ZWN0ZWRGaWVsZHM6JHtlbnRpdHl9IGRvZXMgbm90IGV4aXN0YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgb3RoZXIgZmllbGRzXG4gICAgLy8gRW50aXR5IGNhbiBiZTpcbiAgICAvLyBcIipcIiAtIFB1YmxpYyxcbiAgICAvLyBcInJlcXVpcmVzQXV0aGVudGljYXRpb25cIiAtIGF1dGhlbnRpY2F0ZWQgdXNlcnMsXG4gICAgLy8gXCJvYmplY3RJZFwiIC0gX1VzZXIgaWQsXG4gICAgLy8gXCJyb2xlOnJvbGVuYW1lXCIsXG4gICAgLy8gXCJwb2ludGVyRmllbGRzXCIgLSBhcnJheSBvZiBmaWVsZCBuYW1lcyBjb250YWluaW5nIHBvaW50ZXJzIHRvIHVzZXJzXG4gICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgIHZhbGlkYXRlUGVybWlzc2lvbktleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgIC8vIGVudGl0eSBjYW4gYmUgZWl0aGVyOlxuICAgICAgLy8gXCJwb2ludGVyRmllbGRzXCI6IHN0cmluZ1tdXG4gICAgICBpZiAoZW50aXR5ID09PSAncG9pbnRlckZpZWxkcycpIHtcbiAgICAgICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBwb2ludGVyRmllbGQgb2YgcG9pbnRlckZpZWxkcykge1xuICAgICAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihwb2ludGVyRmllbGQsIGZpZWxkcywgb3BlcmF0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3BvaW50ZXJGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgJHtvcGVyYXRpb25LZXl9WyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBlbnRpdHkga2V5XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwZXJtaXQgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwZXJtaXQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgYWNsYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaW52YWxpZEtleXMgPSBPYmplY3Qua2V5cyhwZXJtaXQpLmZpbHRlcihrZXkgPT4gIVsncmVhZCcsICd3cml0ZSddLmluY2x1ZGVzKGtleSkpO1xuICAgICAgICBjb25zdCBpbnZhbGlkVmFsdWVzID0gT2JqZWN0LnZhbHVlcyhwZXJtaXQpLmZpbHRlcihrZXkgPT4gdHlwZW9mIGtleSAhPT0gJ2Jvb2xlYW4nKTtcbiAgICAgICAgaWYgKGludmFsaWRLZXlzLmxlbmd0aCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtpbnZhbGlkS2V5cy5qb2luKCcsJyl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zIGFjbGBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGludmFsaWRWYWx1ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke2ludmFsaWRWYWx1ZXMuam9pbignLCcpfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zIGFjbGBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHBlcm1pdCAhPT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgYWNsICR7b3BlcmF0aW9uS2V5fToke2VudGl0eX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb246IGFueSwgb3BlcmF0aW9uS2V5OiBzdHJpbmcpIHtcbiAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gYXJyYXlgXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIG9wZXJhdGlvbiA9PT0gJ29iamVjdCcgJiYgb3BlcmF0aW9uICE9PSBudWxsKSB7XG4gICAgICAvLyBvayB0byBwcm9jZWVkXG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gb2JqZWN0YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWU6IHN0cmluZywgZmllbGRzOiBPYmplY3QsIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gIC8vIFVzZXMgY29sbGVjdGlvbiBzY2hlbWEgdG8gZW5zdXJlIHRoZSBmaWVsZCBpcyBvZiB0eXBlOlxuICAvLyAtIFBvaW50ZXI8X1VzZXI+IChwb2ludGVycylcbiAgLy8gLSBBcnJheVxuICAvL1xuICAvLyAgICBJdCdzIG5vdCBwb3NzaWJsZSB0byBlbmZvcmNlIHR5cGUgb24gQXJyYXkncyBpdGVtcyBpbiBzY2hlbWFcbiAgLy8gIHNvIHdlIGFjY2VwdCBhbnkgQXJyYXkgZmllbGQsIGFuZCBsYXRlciB3aGVuIGFwcGx5aW5nIHBlcm1pc3Npb25zXG4gIC8vICBvbmx5IGl0ZW1zIHRoYXQgYXJlIHBvaW50ZXJzIHRvIF9Vc2VyIGFyZSBjb25zaWRlcmVkLlxuICBpZiAoXG4gICAgIShcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAoKGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInICYmIGZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ0FycmF5JylcbiAgICApXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtmaWVsZE5hbWV9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICk7XG4gIH1cbn1cblxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSwgY2xhc3NOYW1lKVxuICApO1xufVxuXG4vLyBWYWxpZCBmaWVsZHMgbXVzdCBiZSBhbHBoYS1udW1lcmljLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbi8vIG11c3Qgbm90IGJlIGEgcmVzZXJ2ZWQga2V5XG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoY2xhc3NOYW1lICYmIGNsYXNzTmFtZSAhPT0gJ19Ib29rcycpIHtcbiAgICBpZiAoZmllbGROYW1lID09PSAnY2xhc3NOYW1lJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY2xhc3NBbmRGaWVsZFJlZ2V4LnRlc3QoZmllbGROYW1lKSAmJiAhaW52YWxpZENvbHVtbnMuaW5jbHVkZXMoZmllbGROYW1lKTtcbn1cblxuLy8gQ2hlY2tzIHRoYXQgaXQncyBub3QgdHJ5aW5nIHRvIGNsb2JiZXIgb25lIG9mIHRoZSBkZWZhdWx0IGZpZWxkcyBvZiB0aGUgY2xhc3MuXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2ludmFsaWQgSlNPTicpO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKHRhcmdldENsYXNzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHN0cnVjdHVyZWRDbG9uZShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuXG4gICAgICAgICAgICBjb25zdCBjbGFzc1Byb3RlY3RlZEZpZWxkcyA9IHRoaXMuX19wcm90ZWN0ZWRGaWVsZHNbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgICAgICBpZiAoY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgIC4uLihkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB8fCBbXSksXG4gICAgICAgICAgICAgICAgICAuLi5jbGFzc1Byb3RlY3RlZEZpZWxkc1trZXldLFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBJbmplY3QgdGhlIGluLW1lbW9yeSBjbGFzc2VzXG4gICAgdm9sYXRpbGVDbGFzc2VzLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBjbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZHM6IHt9LFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgIHRoaXMuX19kYXRhW2NsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGluamVjdERlZmF1bHRTY2hlbWEgPSAoeyBjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBpbmRleGVzIH06IFNjaGVtYSkgPT4ge1xuICBjb25zdCBkZWZhdWx0U2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgY2xhc3NOYW1lLFxuICAgIGZpZWxkczoge1xuICAgICAgLi4uZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAuLi4oZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCB7fSksXG4gICAgICAuLi5maWVsZHMsXG4gICAgfSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIH07XG4gIGlmIChpbmRleGVzICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgIGRlZmF1bHRTY2hlbWEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRTY2hlbWE7XG59O1xuXG5jb25zdCBfSG9va3NTY2hlbWEgPSB7IGNsYXNzTmFtZTogJ19Ib29rcycsIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0hvb2tzIH07XG5jb25zdCBfR2xvYmFsQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR2xvYmFsQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR2xvYmFsQ29uZmlnLFxufTtcbmNvbnN0IF9HcmFwaFFMQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR3JhcGhRTENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dyYXBoUUxDb25maWcsXG59O1xuY29uc3QgX1B1c2hTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfUHVzaFN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlNjaGVkdWxlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlNjaGVkdWxlJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0F1ZGllbmNlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0F1ZGllbmNlJyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9BdWRpZW5jZSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9JZGVtcG90ZW5jeVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19JZGVtcG90ZW5jeScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzID0gW1xuICBfSG9va3NTY2hlbWEsXG4gIF9Kb2JTdGF0dXNTY2hlbWEsXG4gIF9Kb2JTY2hlZHVsZVNjaGVtYSxcbiAgX1B1c2hTdGF0dXNTY2hlbWEsXG4gIF9HbG9iYWxDb25maWdTY2hlbWEsXG4gIF9HcmFwaFFMQ29uZmlnU2NoZW1hLFxuICBfQXVkaWVuY2VTY2hlbWEsXG4gIF9JZGVtcG90ZW5jeVNjaGVtYSxcbl07XG5cbmNvbnN0IGRiVHlwZU1hdGNoZXNPYmplY3RUeXBlID0gKGRiVHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcsIG9iamVjdFR5cGU6IFNjaGVtYUZpZWxkKSA9PiB7XG4gIGlmIChkYlR5cGUudHlwZSAhPT0gb2JqZWN0VHlwZS50eXBlKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAoZGJUeXBlLnRhcmdldENsYXNzICE9PSBvYmplY3RUeXBlLnRhcmdldENsYXNzKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKGRiVHlwZS50eXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHsgcmV0dXJuIHRydWU7IH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuY29uc3QgdHlwZVRvU3RyaW5nID0gKHR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0eXBlO1xuICB9XG4gIGlmICh0eXBlLnRhcmdldENsYXNzKSB7XG4gICAgcmV0dXJuIGAke3R5cGUudHlwZX08JHt0eXBlLnRhcmdldENsYXNzfT5gO1xuICB9XG4gIHJldHVybiBgJHt0eXBlLnR5cGV9YDtcbn07XG4vLyBTdG9yZXMgdGhlIGVudGlyZSBzY2hlbWEgb2YgdGhlIGFwcCBpbiBhIHdlaXJkIGh5YnJpZCBmb3JtYXQgc29tZXdoZXJlIGJldHdlZW5cbi8vIHRoZSBtb25nbyBmb3JtYXQgYW5kIHRoZSBQYXJzZSBmb3JtYXQuIFNvb24sIHRoaXMgd2lsbCBhbGwgYmUgUGFyc2UgZm9ybWF0LlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2NoZW1hQ29udHJvbGxlciB7XG4gIF9kYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBfYXBwSWQ6IHN0cmluZztcbiAgX2NhY2hlOiBhbnk7XG4gIHNjaGVtYURhdGE6IHsgW3N0cmluZ106IFNjaGVtYSB9O1xuICByZWxvYWREYXRhUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIHVzZXJJZFJlZ0V4OiBSZWdFeHA7XG5cbiAgY29uc3RydWN0b3IoZGF0YWJhc2VBZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgYXBwSWQ/OiBzdHJpbmcpIHtcbiAgICB0aGlzLl9kYkFkYXB0ZXIgPSBkYXRhYmFzZUFkYXB0ZXI7XG4gICAgdGhpcy5fYXBwSWQgPSBhcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIHRoaXMuX2NhY2hlID0gU2NoZW1hQ2FjaGUuZm9yKGRhdGFiYXNlQWRhcHRlcik7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldCh0aGlzLl9hcHBJZCk7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEodGhpcy5fY2FjaGUuYWxsKCksIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IGNvbmZpZy5wcm90ZWN0ZWRGaWVsZHM7XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBjb25maWcuYWxsb3dDdXN0b21PYmplY3RJZDtcblxuICAgIGNvbnN0IGN1c3RvbUlkUmVnRXggPSAvXi57MSx9JC91OyAvLyAxKyBjaGFyc1xuICAgIGNvbnN0IGF1dG9JZFJlZ0V4ID0gL15bYS16QS1aMC05XXsxLH0kLztcblxuICAgIHRoaXMudXNlcklkUmVnRXggPSBjdXN0b21JZHMgPyBjdXN0b21JZFJlZ0V4IDogYXV0b0lkUmVnRXg7XG5cbiAgICB0aGlzLl9kYkFkYXB0ZXIud2F0Y2goKCkgPT4ge1xuICAgICAgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHJlbG9hZERhdGFJZk5lZWRlZCgpIHtcbiAgICBpZiAodGhpcy5fZGJBZGFwdGVyLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHR0bCA9IHRoaXMuX2NhY2hlLnR0bDtcbiAgICBjb25zdCB7IGRhdGUsIGR1cmF0aW9uIH0gPSB0dGw7XG4gICAgaWYgKCFkdXJhdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGlmIChub3cgLSBkYXRlID4gZHVyYXRpb24pIHtcbiAgICAgIHR0bC5kYXRlID0gbm93O1xuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cblxuICByZWxvYWREYXRhKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAodGhpcy5yZWxvYWREYXRhUHJvbWlzZSAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5yZWxvYWREYXRhUHJvbWlzZSA9IHRoaXMuZ2V0QWxsQ2xhc3NlcyhvcHRpb25zKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKGFsbFNjaGVtYXMsIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgZ2V0QWxsQ2xhc3NlcyhvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhSWZOZWVkZWQoKTtcbiAgICBjb25zdCBjYWNoZWQgPSB0aGlzLl9jYWNoZS5hbGwoKTtcbiAgICBpZiAoY2FjaGVkICYmIGNhY2hlZC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICB9XG5cbiAgc2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IGFsbFNjaGVtYXMubWFwKGluamVjdERlZmF1bHRTY2hlbWEpKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgIHRoaXMuX2NhY2hlLnB1dChhbGxTY2hlbWFzKTtcbiAgICAgICAgcmV0dXJuIGFsbFNjaGVtYXM7XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldE9uZVNjaGVtYShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhbGxvd1ZvbGF0aWxlQ2xhc3NlczogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hPiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgdGhpcy5fY2FjaGUuY2xlYXIoKTtcbiAgICB9XG4gICAgaWYgKGFsbG93Vm9sYXRpbGVDbGFzc2VzICYmIHZvbGF0aWxlQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSkge1xuICAgICAgY29uc3QgZGF0YSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgZmllbGRzOiBkYXRhLmZpZWxkcyxcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgaW5kZXhlczogZGF0YS5pbmRleGVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IHRoaXMuX2NhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCkudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgIGNvbnN0IG9uZVNjaGVtYSA9IGFsbFNjaGVtYXMuZmluZChzY2hlbWEgPT4gc2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgICAgIGlmICghb25lU2NoZW1hKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh1bmRlZmluZWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9uZVNjaGVtYTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG5ldyBjbGFzcyB0aGF0IGluY2x1ZGVzIHRoZSB0aHJlZSBkZWZhdWx0IGZpZWxkcy5cbiAgLy8gQUNMIGlzIGFuIGltcGxpY2l0IGNvbHVtbiB0aGF0IGRvZXMgbm90IGdldCBhbiBlbnRyeSBpbiB0aGVcbiAgLy8gX1NDSEVNQVMgZGF0YWJhc2UuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGVcbiAgLy8gY3JlYXRlZCBzY2hlbWEsIGluIG1vbmdvIGZvcm1hdC5cbiAgLy8gb24gc3VjY2VzcywgYW5kIHJlamVjdHMgd2l0aCBhbiBlcnJvciBvbiBmYWlsLiBFbnN1cmUgeW91XG4gIC8vIGhhdmUgYXV0aG9yaXphdGlvbiAobWFzdGVyIGtleSwgb3IgY2xpZW50IGNsYXNzIGNyZWF0aW9uXG4gIC8vIGVuYWJsZWQpIGJlZm9yZSBjYWxsaW5nIHRoaXMgZnVuY3Rpb24uXG4gIGFzeW5jIGFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnkgPSB7fVxuICApOiBQcm9taXNlPHZvaWQgfCBTY2hlbWE+IHtcbiAgICB2YXIgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAodmFsaWRhdGlvbkVycm9yLmNvZGUgJiYgdmFsaWRhdGlvbkVycm9yLmVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBhZGFwdGVyU2NoZW1hID0gYXdhaXQgdGhpcy5fZGJBZGFwdGVyLmNyZWF0ZUNsYXNzKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoe1xuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hKGFkYXB0ZXJTY2hlbWEpO1xuICAgICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB1cGRhdGVDbGFzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRGaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlclxuICApIHtcbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdGaWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRGaWVsZHNbbmFtZV07XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiZcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdLnR5cGUgIT09IGZpZWxkLnR5cGUgJiZcbiAgICAgICAgICAgIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl9ycGVybTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl93cGVybTtcbiAgICAgICAgY29uc3QgbmV3U2NoZW1hID0gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHMsIHN1Ym1pdHRlZEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRGaWVsZHMgPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0O1xuICAgICAgICBjb25zdCBmdWxsTmV3U2NoZW1hID0gT2JqZWN0LmFzc2lnbih7fSwgbmV3U2NoZW1hLCBkZWZhdWx0RmllbGRzKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIG5ld1NjaGVtYSxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdGaWVsZHMpXG4gICAgICAgICk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5IHdlIGhhdmUgY2hlY2tlZCB0byBtYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgdmFsaWQgYW5kIHdlIGNhbiBzdGFydCBkZWxldGluZyBmaWVsZHMuXG4gICAgICAgIC8vIERvIGFsbCBkZWxldGlvbnMgZmlyc3QsIHRoZW4gYSBzaW5nbGUgc2F2ZSB0byBfU0NIRU1BIGNvbGxlY3Rpb24gdG8gaGFuZGxlIGFsbCBhZGRpdGlvbnMuXG4gICAgICAgIGNvbnN0IGRlbGV0ZWRGaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IGluc2VydGVkRmllbGRzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgZGVsZXRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBkZWxldGVQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkZWxldGVkRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBkZWxldGVQcm9taXNlID0gdGhpcy5kZWxldGVGaWVsZHMoZGVsZXRlZEZpZWxkcywgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGVuZm9yY2VGaWVsZHMgPSBbXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBkZWxldGVQcm9taXNlIC8vIERlbGV0ZSBFdmVyeXRoaW5nXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKSAvLyBSZWxvYWQgb3VyIFNjaGVtYSwgc28gd2UgaGF2ZSBhbGwgdGhlIG5ldyB2YWx1ZXNcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBpbnNlcnRlZEZpZWxkcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlID0gc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgIGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRQZXJtaXNzaW9ucyhjbGFzc05hbWUsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbmV3U2NoZW1hKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLl9kYkFkYXB0ZXIuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAgICAgICAgZnVsbE5ld1NjaGVtYVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKVxuICAgICAgICAgICAgLy9UT0RPOiBNb3ZlIHRoaXMgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlclxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICAgICAgICAgIGNvbnN0IHJlbG9hZGVkU2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICByZWxvYWRlZFNjaGVtYS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbG9hZGVkU2NoZW1hO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IG9yIGZhaWxzIHdpdGggYSByZWFzb24uXG4gIGVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3QgaGF2ZSB0aGlzIGNsYXNzLiBVcGRhdGUgdGhlIHNjaGVtYVxuICAgIHJldHVybiAoXG4gICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBzdWNjZWVkZWQuIFJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICB0aGlzLmFkZENsYXNzSWZOb3RFeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0XG4gICAgICAgICAgLy8gaGF2ZSBmYWlsZWQgYmVjYXVzZSB0aGVyZSdzIGEgcmFjZSBjb25kaXRpb24gYW5kIGEgZGlmZmVyZW50XG4gICAgICAgICAgLy8gY2xpZW50IGlzIG1ha2luZyB0aGUgZXhhY3Qgc2FtZSBzY2hlbWEgdXBkYXRlIHRoYXQgd2Ugd2FudC5cbiAgICAgICAgICAvLyBTbyBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hLlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNjaGVtYSBub3cgdmFsaWRhdGVzXG4gICAgICAgICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYEZhaWxlZCB0byBhZGQgJHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgc3RpbGwgZG9lc24ndCB2YWxpZGF0ZS4gR2l2ZSB1cFxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdzY2hlbWEgY2xhc3MgbmFtZSBkb2VzIG5vdCByZXZhbGlkYXRlJyk7XG4gICAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55KTogYW55IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgfVxuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgIGVycm9yOiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIFtdKTtcbiAgfVxuXG4gIHZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICBleGlzdGluZ0ZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz5cbiAgKSB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgICBpZiAoZXhpc3RpbmdGaWVsZE5hbWVzLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgZXJyb3I6ICdpbnZhbGlkIGZpZWxkIG5hbWU6ICcgKyBmaWVsZE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogMTM2LFxuICAgICAgICAgICAgZXJyb3I6ICdmaWVsZCAnICsgZmllbGROYW1lICsgJyBjYW5ub3QgYmUgYWRkZWQnLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmllbGRUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGNvbnN0IGVycm9yID0gZmllbGRUeXBlSXNJbnZhbGlkKGZpZWxkVHlwZSk7XG4gICAgICAgIGlmIChlcnJvcikgeyByZXR1cm4geyBjb2RlOiBlcnJvci5jb2RlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9OyB9XG4gICAgICAgIGlmIChmaWVsZFR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ2RlZmF1bHQgdmFsdWUnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShmaWVsZFR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlXG4gICAgICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZS5yZXF1aXJlZCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZmllbGRUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdyZXF1aXJlZCcgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0pIHtcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdO1xuICAgIH1cblxuICAgIGNvbnN0IGdlb1BvaW50cyA9IE9iamVjdC5rZXlzKGZpZWxkcykuZmlsdGVyKFxuICAgICAga2V5ID0+IGZpZWxkc1trZXldICYmIGZpZWxkc1trZXldLnR5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICAgIGlmIChnZW9Qb2ludHMubGVuZ3RoID4gMSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgIGVycm9yOlxuICAgICAgICAgICdjdXJyZW50bHksIG9ubHkgb25lIEdlb1BvaW50IGZpZWxkIG1heSBleGlzdCBpbiBhbiBvYmplY3QuIEFkZGluZyAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMV0gK1xuICAgICAgICAgICcgd2hlbiAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMF0gK1xuICAgICAgICAgICcgYWxyZWFkeSBleGlzdHMuJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgfVxuXG4gIC8vIFNldHMgdGhlIENsYXNzLWxldmVsIHBlcm1pc3Npb25zIGZvciBhIGdpdmVuIGNsYXNzTmFtZSwgd2hpY2ggbXVzdCBleGlzdC5cbiAgYXN5bmMgc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIHBlcm1zOiBhbnksIG5ld1NjaGVtYTogU2NoZW1hRmllbGRzKSB7XG4gICAgaWYgKHR5cGVvZiBwZXJtcyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAocGVybXMsIG5ld1NjaGVtYSwgdGhpcy51c2VySWRSZWdFeCk7XG4gICAgYXdhaXQgdGhpcy5fZGJBZGFwdGVyLnNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUsIHBlcm1zKTtcbiAgICBjb25zdCBjYWNoZWQgPSB0aGlzLl9jYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICBjYWNoZWQuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gcGVybXM7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IGlmIHRoZSBwcm92aWRlZCBjbGFzc05hbWUtZmllbGROYW1lLXR5cGUgdHVwbGUgaXMgdmFsaWQuXG4gIC8vIFRoZSBjbGFzc05hbWUgbXVzdCBhbHJlYWR5IGJlIHZhbGlkYXRlZC5cbiAgLy8gSWYgJ2ZyZWV6ZScgaXMgdHJ1ZSwgcmVmdXNlIHRvIHVwZGF0ZSB0aGUgc2NoZW1hIGZvciB0aGlzIGZpZWxkLlxuICBlbmZvcmNlRmllbGRFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nIHwgU2NoZW1hRmllbGQsXG4gICAgaXNWYWxpZGF0aW9uPzogYm9vbGVhbixcbiAgICBtYWludGVuYW5jZT86IGJvb2xlYW5cbiAgKSB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICAvLyBcIjxhcnJheT4uPGluZGV4PlwiIGZvciBOZXN0ZWQgQXJyYXlzXG4gICAgICAvLyBcIjxlbWJlZGRlZCBkb2N1bWVudD4uPGZpZWxkPlwiIGZvciBOZXN0ZWQgT2JqZWN0c1xuICAgICAgLy8gSlNPTiBBcnJheXMgYXJlIHRyZWF0ZWQgYXMgTmVzdGVkIE9iamVjdHNcbiAgICAgIGNvbnN0IFt4LCB5XSA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgZmllbGROYW1lID0geDtcbiAgICAgIGNvbnN0IGlzQXJyYXlJbmRleCA9IEFycmF5LmZyb20oeSkuZXZlcnkoYyA9PiBjID49ICcwJyAmJiBjIDw9ICc5Jyk7XG4gICAgICBpZiAoaXNBcnJheUluZGV4ICYmICFbJ3NlbnRQZXJVVENPZmZzZXQnLCAnZmFpbGVkUGVyVVRDT2Zmc2V0J10uaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICB0eXBlID0gJ0FycmF5JztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGUgPSAnT2JqZWN0JztcbiAgICAgIH1cbiAgICB9XG4gICAgbGV0IGZpZWxkTmFtZVRvVmFsaWRhdGUgPSBgJHtmaWVsZE5hbWV9YDtcbiAgICBpZiAobWFpbnRlbmFuY2UgJiYgZmllbGROYW1lVG9WYWxpZGF0ZS5jaGFyQXQoMCkgPT09ICdfJykge1xuICAgICAgZmllbGROYW1lVG9WYWxpZGF0ZSA9IGZpZWxkTmFtZVRvVmFsaWRhdGUuc3Vic3RyaW5nKDEpO1xuICAgIH1cbiAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lVG9WYWxpZGF0ZSwgY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gKTtcbiAgICB9XG5cbiAgICAvLyBJZiBzb21lb25lIHRyaWVzIHRvIGNyZWF0ZSBhIG5ldyBmaWVsZCB3aXRoIG51bGwvdW5kZWZpbmVkIGFzIHRoZSB2YWx1ZSwgcmV0dXJuO1xuICAgIGlmICghdHlwZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgdHlwZSA9ICh7IHR5cGUgfTogU2NoZW1hRmllbGQpO1xuICAgIH1cblxuICAgIGlmICh0eXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUodHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKHR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgdHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHBlY3RlZFR5cGUpIHtcbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICBleHBlY3RlZFR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKHR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIElmIHR5cGUgb3B0aW9ucyBkbyBub3QgY2hhbmdlXG4gICAgICAvLyB3ZSBjYW4gc2FmZWx5IHJldHVyblxuICAgICAgaWYgKGlzVmFsaWRhdGlvbiB8fCBKU09OLnN0cmluZ2lmeShleHBlY3RlZFR5cGUpID09PSBKU09OLnN0cmluZ2lmeSh0eXBlKSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLy8gRmllbGQgb3B0aW9ucyBhcmUgbWF5IGJlIGNoYW5nZWRcbiAgICAgIC8vIGVuc3VyZSB0byBoYXZlIGFuIHVwZGF0ZSB0byBkYXRlIHNjaGVtYSBmaWVsZFxuICAgICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlci51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUpIHtcbiAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCB3ZSB0aHJvdyBlcnJvcnMgd2hlbiBpdCBpcyBhcHByb3ByaWF0ZSB0byBkbyBzby5cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0IGhhdmUgYmVlbiBhIHJhY2VcbiAgICAgICAgLy8gY29uZGl0aW9uIHdoZXJlIGFub3RoZXIgY2xpZW50IHVwZGF0ZWQgdGhlIHNjaGVtYSBpbiB0aGUgc2FtZVxuICAgICAgICAvLyB3YXkgdGhhdCB3ZSB3YW50ZWQgdG8uIFNvLCBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICB0eXBlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cblxuICBlbnN1cmVGaWVsZHMoZmllbGRzOiBhbnkpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9ID0gZmllbGRzW2ldO1xuICAgICAgbGV0IHsgdHlwZSB9ID0gZmllbGRzW2ldO1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0eXBlID0geyB0eXBlOiB0eXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWV4cGVjdGVkVHlwZSB8fCAhZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgQ291bGQgbm90IGFkZCBmaWVsZCAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBtYWludGFpbiBjb21wYXRpYmlsaXR5XG4gIGRlbGV0ZUZpZWxkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIHJldHVybiB0aGlzLmRlbGV0ZUZpZWxkcyhbZmllbGROYW1lXSwgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gIH1cblxuICAvLyBEZWxldGUgZmllbGRzLCBhbmQgcmVtb3ZlIHRoYXQgZGF0YSBmcm9tIGFsbCBvYmplY3RzLiBUaGlzIGlzIGludGVuZGVkXG4gIC8vIHRvIHJlbW92ZSB1bnVzZWQgZmllbGRzLCBpZiBvdGhlciB3cml0ZXJzIGFyZSB3cml0aW5nIG9iamVjdHMgdGhhdCBpbmNsdWRlXG4gIC8vIHRoaXMgZmllbGQsIHRoZSBmaWVsZCBtYXkgcmVhcHBlYXIuIFJldHVybnMgYSBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aFxuICAvLyBubyBvYmplY3Qgb24gc3VjY2Vzcywgb3IgcmVqZWN0cyB3aXRoIHsgY29kZSwgZXJyb3IgfSBvbiBmYWlsdXJlLlxuICAvLyBQYXNzaW5nIHRoZSBkYXRhYmFzZSBhbmQgcHJlZml4IGlzIG5lY2Vzc2FyeSBpbiBvcmRlciB0byBkcm9wIHJlbGF0aW9uIGNvbGxlY3Rpb25zXG4gIC8vIGFuZCByZW1vdmUgZmllbGRzIGZyb20gb2JqZWN0cy4gSWRlYWxseSB0aGUgZGF0YWJhc2Ugd291bGQgYmVsb25nIHRvXG4gIC8vIGEgZGF0YWJhc2UgYWRhcHRlciBhbmQgdGhpcyBmdW5jdGlvbiB3b3VsZCBjbG9zZSBvdmVyIGl0IG9yIGFjY2VzcyBpdCB2aWEgbWVtYmVyLlxuICBkZWxldGVGaWVsZHMoZmllbGROYW1lczogQXJyYXk8c3RyaW5nPiwgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSk7XG4gICAgfVxuXG4gICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgaW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICAgIC8vRG9uJ3QgYWxsb3cgZGVsZXRpbmcgdGhlIGRlZmF1bHQgZmllbGRzLlxuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsIGBmaWVsZCAke2ZpZWxkTmFtZX0gY2Fubm90IGJlIGNoYW5nZWRgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGZhbHNlLCB7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtmaWVsZE5hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hRmllbGRzID0geyAuLi5zY2hlbWEuZmllbGRzIH07XG4gICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUZpZWxkcyhjbGFzc05hbWUsIHNjaGVtYSwgZmllbGROYW1lcykudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWFGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgICAgICAvL0ZvciByZWxhdGlvbnMsIGRyb3AgdGhlIF9Kb2luIHRhYmxlXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5fY2FjaGUuY2xlYXIoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9iamVjdCBwcm92aWRlZCBpbiBSRVNUIGZvcm1hdC5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYSBpZiB0aGlzIG9iamVjdCBpc1xuICAvLyB2YWxpZC5cbiAgYXN5bmMgdmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55LCBtYWludGVuYW5jZTogYm9vbGVhbikge1xuICAgIGxldCBnZW9jb3VudCA9IDA7XG4gICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgdGhpcy5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgZ2V0VHlwZShvYmplY3RbZmllbGROYW1lXSkgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgZ2VvY291bnQrKztcbiAgICAgIH1cbiAgICAgIGlmIChnZW9jb3VudCA+IDEpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgJ3RoZXJlIGNhbiBvbmx5IGJlIG9uZSBnZW9wb2ludCBmaWVsZCBpbiBhIGNsYXNzJ1xuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGVjdGVkID0gZ2V0VHlwZShvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICBpZiAoIWV4cGVjdGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgLy8gRXZlcnkgb2JqZWN0IGhhcyBBQ0wgaW1wbGljaXRseS5cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBwcm9taXNlcy5wdXNoKHNjaGVtYS5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIGV4cGVjdGVkLCB0cnVlLCBtYWludGVuYW5jZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGNvbnN0IGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuXG4gICAgaWYgKGVuZm9yY2VGaWVsZHMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH1cbiAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcblxuICAgIGNvbnN0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgdGhhdCBhbGwgdGhlIHByb3BlcnRpZXMgYXJlIHNldCBmb3IgdGhlIG9iamVjdFxuICB2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVxdWlyZWRDb2x1bW5zLndyaXRlW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjb2x1bW5zIHx8IGNvbHVtbnMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2luZ0NvbHVtbnMgPSBjb2x1bW5zLmZpbHRlcihmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICBpZiAocXVlcnkgJiYgcXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKG9iamVjdFtjb2x1bW5dICYmIHR5cGVvZiBvYmplY3RbY29sdW1uXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAvLyBUcnlpbmcgdG8gZGVsZXRlIGEgcmVxdWlyZWQgY29sdW1uXG4gICAgICAgICAgcmV0dXJuIG9iamVjdFtjb2x1bW5dLl9fb3AgPT0gJ0RlbGV0ZSc7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm90IHRyeWluZyB0byBkbyBhbnl0aGluZyB0aGVyZVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gIW9iamVjdFtjb2x1bW5dO1xuICAgIH0pO1xuXG4gICAgaWYgKG1pc3NpbmdDb2x1bW5zLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgbWlzc2luZ0NvbHVtbnNbMF0gKyAnIGlzIHJlcXVpcmVkLicpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICB9XG5cbiAgdGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFRlc3RzIHRoYXQgdGhlIGNsYXNzIGxldmVsIHBlcm1pc3Npb24gbGV0IHBhc3MgdGhlIG9wZXJhdGlvbiBmb3IgYSBnaXZlbiBhY2xHcm91cFxuICBzdGF0aWMgdGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnM6ID9hbnksIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIGlmIChwZXJtc1snKiddKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgcGVybWlzc2lvbnMgYWdhaW5zdCB0aGUgYWNsR3JvdXAgcHJvdmlkZWQgKGFycmF5IG9mIHVzZXJJZC9yb2xlcylcbiAgICBpZiAoXG4gICAgICBhY2xHcm91cC5zb21lKGFjbCA9PiB7XG4gICAgICAgIHJldHVybiBwZXJtc1thY2xdID09PSB0cnVlO1xuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICBzdGF0aWMgdmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgIGNsYXNzUGVybWlzc2lvbnM6ID9hbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIGFjdGlvbj86IHN0cmluZyxcbiAgICBhcHBJZD86IHN0cmluZ1xuICApIHtcbiAgICBpZiAoU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9ucywgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoYXBwSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZClcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nLFxuICAgICAgICAgIGNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLicsXG4gICAgICAgICAgY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gLFxuICAgICAgICBjb25maWdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyB0aGUgcmVhZFVzZXJGaWVsZHMgbGF0ZXJcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkgJiZcbiAgICAgIGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXS5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpICYmIHBvaW50ZXJGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYW55IG9wIGV4Y2VwdCAnYWRkRmllbGQgYXMgcGFydCBvZiBjcmVhdGUnIGlzIG9rLlxuICAgICAgaWYgKG9wZXJhdGlvbiAhPT0gJ2FkZEZpZWxkJyB8fCBhY3Rpb24gPT09ICd1cGRhdGUnKSB7XG4gICAgICAgIC8vIFdlIGNhbiBhbGxvdyBhZGRpbmcgZmllbGQgb24gdXBkYXRlIGZsb3cgb25seS5cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYCxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcsIGFjdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvbixcbiAgICAgIGFjdGlvbixcbiAgICAgIHRoaXMuX2FwcElkXG4gICAgKTtcbiAgfVxuXG4gIGdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZyk6IGFueSB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdICYmIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgfVxuXG4gIC8vIFJldHVybnMgdGhlIGV4cGVjdGVkIHR5cGUgZm9yIGEgY2xhc3NOYW1lK2tleSBjb21iaW5hdGlvblxuICAvLyBvciB1bmRlZmluZWQgaWYgdGhlIHNjaGVtYSBpcyBub3Qgc2V0XG4gIGdldEV4cGVjdGVkVHlwZShjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBleHBlY3RlZFR5cGUgPT09ICdtYXAnID8gJ09iamVjdCcgOiBleHBlY3RlZFR5cGU7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICAvLyBDaGVja3MgaWYgYSBnaXZlbiBjbGFzcyBpcyBpbiB0aGUgc2NoZW1hLlxuICBoYXNDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSgpLnRoZW4oKCkgPT4gISF0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSk7XG4gIH1cbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbmV3IFNjaGVtYS5cbmNvbnN0IGxvYWQgPSAoXG4gIGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsXG4gIG9wdGlvbnM6IGFueSxcbiAgYXBwSWQ/OiBzdHJpbmdcbik6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIsIGFwcElkKTtcbiAgc2NoZW1hLl9jYWNoZS50dGwuZHVyYXRpb24gPSBkYkFkYXB0ZXIuc2NoZW1hQ2FjaGVUdGw7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG4gIHJlcXVpcmVkQ29sdW1ucyxcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQWtCQSxJQUFBQSxlQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxZQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxtQkFBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUssTUFBQSxHQUFBTCxPQUFBO0FBQWdELFNBQUFFLHVCQUFBSSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FB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