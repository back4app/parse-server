"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MongoStorageAdapter = void 0;
var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));
var _MongoSchemaCollection = _interopRequireDefault(require("./MongoSchemaCollection"));
var _StorageAdapter = require("../StorageAdapter");
var _mongodbUrl = require("../../../vendor/mongodbUrl");
var _MongoTransform = require("./MongoTransform");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _defaults = _interopRequireDefault(require("../../../defaults"));
var _logger = _interopRequireDefault(require("../../../logger"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); } // -disable-next
// -disable-next
// -disable-next
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ReadPreference = mongodb.ReadPreference;
const MongoSchemaCollectionName = '_SCHEMA';
const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter.connect().then(() => mongoAdapter.database.collections()).then(collections => {
    return collections.filter(collection => {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      }
      // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.
      return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
    });
  });
};
const convertParseSchemaToMongoSchema = _ref => {
  let schema = _extends({}, _ref);
  delete schema.fields._rperm;
  delete schema.fields._wperm;
  if (schema.className === '_User') {
    // Legacy mongo adapter knows about the difference between password and _hashed_password.
    // Future database adapters will only know about _hashed_password.
    // Note: Parse Server will bring back password with injectDefaultSchema, so we don't need
    // to add _hashed_password back ever.
    delete schema.fields._hashed_password;
  }
  return schema;
};

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
const mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions, indexes) => {
  const mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
    _metadata: undefined
  };
  for (const fieldName in fields) {
    const _fields$fieldName = fields[fieldName],
      {
        type,
        targetClass
      } = _fields$fieldName,
      fieldOptions = _objectWithoutProperties(_fields$fieldName, ["type", "targetClass"]);
    mongoObject[fieldName] = _MongoSchemaCollection.default.parseFieldTypeToMongoFieldType({
      type,
      targetClass
    });
    if (fieldOptions && Object.keys(fieldOptions).length > 0) {
      mongoObject._metadata = mongoObject._metadata || {};
      mongoObject._metadata.fields_options = mongoObject._metadata.fields_options || {};
      mongoObject._metadata.fields_options[fieldName] = fieldOptions;
    }
  }
  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }
  if (indexes && typeof indexes === 'object' && Object.keys(indexes).length > 0) {
    mongoObject._metadata = mongoObject._metadata || {};
    mongoObject._metadata.indexes = indexes;
  }
  if (!mongoObject._metadata) {
    // cleanup the unused _metadata
    delete mongoObject._metadata;
  }
  return mongoObject;
};
function validateExplainValue(explain) {
  if (explain) {
    // The list of allowed explain values is from node-mongodb-native/lib/explain.js
    const explainAllowedValues = ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution', false, true];
    if (!explainAllowedValues.includes(explain)) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Invalid value for explain');
    }
  }
}
class MongoStorageAdapter {
  // Private

  // Public

  constructor({
    uri = _defaults.default.DefaultMongoURI,
    collectionPrefix = '',
    mongoOptions = {}
  }) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = _objectSpread({}, mongoOptions);
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    this.schemaCacheTtl = mongoOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'maxTimeMS']) {
      delete mongoOptions[key];
      delete this._mongoOptions[key];
    }
  }
  watch(callback) {
    this._onchange = callback;
  }
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    const encodedUri = (0, _mongodbUrl.format)((0, _mongodbUrl.parse)(this._uri));
    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(client => {
      // Starting mongoDB 3.0, the MongoClient.connect don't return a DB anymore but a client
      // Fortunately, we can get back the options and use them to select the proper DB.
      // https://github.com/mongodb/node-mongodb-native/blob/2c35d76f08574225b8db02d7bef687123e6bb018/lib/mongo_client.js#L885
      const options = client.s.options;
      const database = client.db(options.dbName);
      if (!database) {
        delete this.connectionPromise;
        return;
      }
      client.on('error', () => {
        delete this.connectionPromise;
      });
      client.on('close', () => {
        delete this.connectionPromise;
      });
      this.client = client;
      this.database = database;
    }).catch(err => {
      delete this.connectionPromise;
      return Promise.reject(err);
    });
    return this.connectionPromise;
  }
  handleError(error) {
    if (error && error.code === 13) {
      // Unauthorized error
      delete this.client;
      delete this.database;
      delete this.connectionPromise;
      _logger.default.error('Received unauthorized error', {
        error: error
      });
    }
    throw error;
  }
  handleShutdown() {
    if (!this.client) {
      return Promise.resolve();
    }
    return this.client.close(false);
  }
  _adaptiveCollection(name) {
    return this.connect().then(() => this.database.collection(this._collectionPrefix + name)).then(rawCollection => new _MongoCollection.default(rawCollection)).catch(err => this.handleError(err));
  }
  _schemaCollection() {
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => {
      if (!this._stream && this.enableSchemaHooks) {
        this._stream = collection._mongoCollection.watch();
        this._stream.on('change', () => this._onchange());
      }
      return new _MongoSchemaCollection.default(collection);
    });
  }
  classExists(name) {
    return this.connect().then(() => {
      return this.database.listCollections({
        name: this._collectionPrefix + name
      }).toArray();
    }).then(collections => {
      return collections.length > 0;
    }).catch(err => this.handleError(err));
  }
  setClassLevelPermissions(className, CLPs) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.class_permissions': CLPs
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields) {
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletePromises = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        const promise = this.dropIndex(className, name);
        deletePromises.push(promise);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    let insertPromise = Promise.resolve();
    if (insertedIndexes.length > 0) {
      insertPromise = this.createIndexes(className, insertedIndexes);
    }
    return Promise.all(deletePromises).then(() => insertPromise).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.indexes': existingIndexes
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesFromMongo(className) {
    return this.getIndexes(className).then(indexes => {
      indexes = indexes.reduce((obj, index) => {
        if (index.key._fts) {
          delete index.key._fts;
          delete index.key._ftsx;
          for (const field in index.weights) {
            index.key[field] = 'text';
          }
        }
        obj[index.name] = index.key;
        return obj;
      }, {});
      return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
        $set: {
          '_metadata.indexes': indexes
        }
      }));
    }).catch(err => this.handleError(err)).catch(() => {
      // Ignore if collection not found
      return Promise.resolve();
    });
  }
  createClass(className, schema) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions, schema.indexes);
    mongoObject._id = className;
    return this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.insertSchema(mongoObject)).catch(err => this.handleError(err));
  }
  async updateFieldOptions(className, fieldName, type) {
    const schemaCollection = await this._schemaCollection();
    await schemaCollection.updateFieldOptions(className, fieldName, type);
  }
  addFieldIfNotExists(className, fieldName, type) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type)).then(() => this.createIndexesIfNeeded(className, fieldName, type)).catch(err => this.handleError(err));
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }
      throw error;
    })
    // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }
  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adapters should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className, schema, fieldNames) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`;
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = {
      $unset: {}
    };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });
    const collectionFilter = {
      $or: []
    };
    mongoFormatNames.forEach(name => {
      collectionFilter['$or'].push({
        [name]: {
          $exists: true
        }
      });
    });
    const schemaUpdate = {
      $unset: {}
    };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });
    return this._adaptiveCollection(className).then(collection => collection.updateMany(collectionFilter, collectionUpdate)).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate)).catch(err => this.handleError(err));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  }

  // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schema only for the legacy mongo format. We'll figure that out later.
  createObject(className, schema, object, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = (0, _MongoTransform.parseObjectToMongoObjectForCreate)(className, object, schema);
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).then(() => ({
      ops: [mongoObject]
    })).catch(error => {
      if (error.code === 11000) {
        // Duplicate value
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.message) {
          const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        throw err;
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className).then(collection => {
      const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return collection.deleteMany(mongoWhere, transactionalSession);
    }).catch(err => this.handleError(err)).then(({
      deletedCount
    }) => {
      if (deletedCount === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      return Promise.resolve();
    }, () => {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Atomically finds and updates an object based on query.
  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.findOneAndUpdate(mongoWhere, mongoUpdate, {
      returnDocument: 'after',
      session: transactionalSession || undefined
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result.value, schema)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    readPreference,
    hint,
    caseInsensitive,
    explain
  }) {
    validateExplainValue(explain);
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    const mongoSort = _lodash.default.mapKeys(sort, (value, fieldName) => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    const mongoKeys = _lodash.default.reduce(keys, (memo, key) => {
      if (key === 'ACL') {
        memo['_rperm'] = 1;
        memo['_wperm'] = 1;
      } else {
        memo[(0, _MongoTransform.transformKey)(className, key, schema)] = 1;
      }
      return memo;
    }, {});

    // If we aren't requesting the `_id` field, we need to explicitly opt out
    // of it. Doing so in parse-server is unusual, but it can allow us to
    // optimize some queries with covering indexes.
    if (keys && !mongoKeys._id) {
      mongoKeys._id = 0;
    }
    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema).then(() => this._adaptiveCollection(className)).then(collection => collection.find(mongoWhere, {
      skip,
      limit,
      sort: mongoSort,
      keys: mongoKeys,
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain
    })).then(objects => {
      if (explain) {
        return objects;
      }
      return objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema));
    }).catch(err => this.handleError(err));
  }
  ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = options.indexType !== undefined ? options.indexType : 1;
    });
    const defaultOptions = {
      background: true,
      sparse: true
    };
    const indexNameOptions = indexName ? {
      name: indexName
    } : {};
    const ttlOptions = options.ttl !== undefined ? {
      expireAfterSeconds: options.ttl
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};
    const indexOptions = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, defaultOptions), caseInsensitiveOptions), indexNameOptions), ttlOptions);
    return this._adaptiveCollection(className).then(collection => new Promise((resolve, reject) => collection._mongoCollection.createIndex(indexCreationRequest, indexOptions, error => error ? reject(error) : resolve()))).catch(err => this.handleError(err));
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className).then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Used in tests
  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  }

  // Executes a count.
  count(className, schema, query, readPreference, hint) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint
    })).catch(err => this.handleError(err));
  }
  distinct(className, schema, query, fieldName) {
    schema = convertParseSchemaToMongoSchema(schema);
    const isPointerField = schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const transformField = (0, _MongoTransform.transformKey)(className, fieldName, schema);
    return this._adaptiveCollection(className).then(collection => collection.distinct(transformField, (0, _MongoTransform.transformWhere)(className, query, schema))).then(objects => {
      objects = objects.filter(obj => obj != null);
      return objects.map(object => {
        if (isPointerField) {
          return (0, _MongoTransform.transformPointerString)(schema, fieldName, object);
        }
        return (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema);
      });
    }).catch(err => this.handleError(err));
  }
  aggregate(className, schema, pipeline, readPreference, hint, explain) {
    validateExplainValue(explain);
    let isPointerField = false;
    pipeline = pipeline.map(stage => {
      if (stage.$group) {
        stage.$group = this._parseAggregateGroupArgs(schema, stage.$group);
        if (stage.$group._id && typeof stage.$group._id === 'string' && stage.$group._id.indexOf('$_p_') >= 0) {
          isPointerField = true;
        }
      }
      if (stage.$match) {
        stage.$match = this._parseAggregateArgs(schema, stage.$match);
      }
      if (stage.$project) {
        stage.$project = this._parseAggregateProjectArgs(schema, stage.$project);
      }
      if (stage.$geoNear && stage.$geoNear.query) {
        stage.$geoNear.query = this._parseAggregateArgs(schema, stage.$geoNear.query);
      }
      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.aggregate(pipeline, {
      readPreference,
      maxTimeMS: this._maxTimeMS,
      hint,
      explain
    })).then(results => {
      results.forEach(result => {
        if (Object.prototype.hasOwnProperty.call(result, '_id')) {
          if (isPointerField && result._id) {
            result._id = result._id.split('$')[1];
          }
          if (result._id == null || result._id == undefined || ['object', 'string'].includes(typeof result._id) && _lodash.default.isEmpty(result._id)) {
            result._id = null;
          }
          result.objectId = result._id;
          delete result._id;
        }
      });
      return results;
    }).then(objects => objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema))).catch(err => this.handleError(err));
  }

  // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
  // If we detect a pointer column we will rename the column being queried for to match the column
  // in the database. We also modify the value to what we expect the value to be in the database
  // as well.
  // For dates, the driver expects a Date object, but we have a string coming in. So we'll convert
  // the string to a Date so the driver can perform the necessary comparison.
  //
  // The goal of this method is to look for the "leaves" of the pipeline and determine if it needs
  // to be converted. The pipeline can have a few different forms. For more details, see:
  //     https://docs.mongodb.com/manual/reference/operator/aggregation/
  //
  // If the pipeline is an array, it means we are probably parsing an '$and' or '$or' operator. In
  // that case we need to loop through all of it's children to find the columns being operated on.
  // If the pipeline is an object, then we'll loop through the keys checking to see if the key name
  // matches one of the schema columns. If it does match a column and the column is a Pointer or
  // a Date, then we'll convert the value as described above.
  //
  // As much as I hate recursion...this seemed like a good fit for it. We're essentially traversing
  // down a tree to find a "leaf node" and checking to see if it needs to be converted.
  _parseAggregateArgs(schema, pipeline) {
    if (pipeline === null) {
      return null;
    } else if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
          if (typeof pipeline[field] === 'object') {
            // Pass objects down to MongoDB...this is more than likely an $exists operator.
            returnValue[`_p_${field}`] = pipeline[field];
          } else {
            returnValue[`_p_${field}`] = `${schema.fields[field].targetClass}$${pipeline[field]}`;
          }
        } else if (schema.fields[field] && schema.fields[field].type === 'Date') {
          returnValue[field] = this._convertToDate(pipeline[field]);
        } else {
          returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
        }
        if (field === 'objectId') {
          returnValue['_id'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'createdAt') {
          returnValue['_created_at'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'updatedAt') {
          returnValue['_updated_at'] = returnValue[field];
          delete returnValue[field];
        }
      }
      return returnValue;
    }
    return pipeline;
  }

  // This function is slightly different than the one above. Rather than trying to combine these
  // two functions and making the code even harder to understand, I decided to split it up. The
  // difference with this function is we are not transforming the values, only the keys of the
  // pipeline.
  _parseAggregateProjectArgs(schema, pipeline) {
    const returnValue = {};
    for (const field in pipeline) {
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        returnValue[`_p_${field}`] = pipeline[field];
      } else {
        returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
      }
      if (field === 'objectId') {
        returnValue['_id'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'createdAt') {
        returnValue['_created_at'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'updatedAt') {
        returnValue['_updated_at'] = returnValue[field];
        delete returnValue[field];
      }
    }
    return returnValue;
  }

  // This function is slightly different than the two above. MongoDB $group aggregate looks like:
  //     { $group: { _id: <expression>, <field1>: { <accumulator1> : <expression1> }, ... } }
  // The <expression> could be a column name, prefixed with the '$' character. We'll look for
  // these <expression> and check to see if it is a 'Pointer' or if it's one of createdAt,
  // updatedAt or objectId and change it accordingly.
  _parseAggregateGroupArgs(schema, pipeline) {
    if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateGroupArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        returnValue[field] = this._parseAggregateGroupArgs(schema, pipeline[field]);
      }
      return returnValue;
    } else if (typeof pipeline === 'string') {
      const field = pipeline.substring(1);
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        return `$_p_${field}`;
      } else if (field == 'createdAt') {
        return '$_created_at';
      } else if (field == 'updatedAt') {
        return '$_updated_at';
      }
    }
    return pipeline;
  }

  // This function will attempt to convert the provided value to a Date object. Since this is part
  // of an aggregation pipeline, the value can either be a string or it can be another object with
  // an operator in it (like $gt, $lt, etc). Because of this I felt it was easier to make this a
  // recursive method to traverse down to the "leaf node" which is going to be the string.
  _convertToDate(value) {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    const returnValue = {};
    for (const field in value) {
      returnValue[field] = this._convertToDate(value[field]);
    }
    return returnValue;
  }
  _parseReadPreference(readPreference) {
    if (readPreference) {
      readPreference = readPreference.toUpperCase();
    }
    switch (readPreference) {
      case 'PRIMARY':
        readPreference = ReadPreference.PRIMARY;
        break;
      case 'PRIMARY_PREFERRED':
        readPreference = ReadPreference.PRIMARY_PREFERRED;
        break;
      case 'SECONDARY':
        readPreference = ReadPreference.SECONDARY;
        break;
      case 'SECONDARY_PREFERRED':
        readPreference = ReadPreference.SECONDARY_PREFERRED;
        break;
      case 'NEAREST':
        readPreference = ReadPreference.NEAREST;
        break;
      case undefined:
      case null:
      case '':
        break;
      default:
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Not supported read preference.');
    }
    return readPreference;
  }
  performInitialization() {
    return Promise.resolve();
  }
  createIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(index, {
      background: true
    })).catch(err => this.handleError(err));
  }
  createIndexes(className, indexes) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndexes(indexes, {
      background: true
    })).catch(err => this.handleError(err));
  }
  createIndexesIfNeeded(className, fieldName, type) {
    if (type && type.type === 'Polygon') {
      const index = {
        [fieldName]: '2dsphere'
      };
      return this.createIndex(className, index);
    }
    return Promise.resolve();
  }
  createTextIndexesIfNeeded(className, query, schema) {
    for (const fieldName in query) {
      if (!query[fieldName] || !query[fieldName].$text) {
        continue;
      }
      const existingIndexes = schema.indexes;
      for (const key in existingIndexes) {
        const index = existingIndexes[key];
        if (Object.prototype.hasOwnProperty.call(index, fieldName)) {
          return Promise.resolve();
        }
      }
      const indexName = `${fieldName}_text`;
      const textIndex = {
        [indexName]: {
          [fieldName]: 'text'
        }
      };
      return this.setIndexesWithSchemaFormat(className, textIndex, existingIndexes, schema.fields).catch(error => {
        if (error.code === 85) {
          // Index exist with different options
          return this.setIndexesFromMongo(className);
        }
        throw error;
      });
    }
    return Promise.resolve();
  }
  getIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.indexes()).catch(err => this.handleError(err));
  }
  dropIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndex(index)).catch(err => this.handleError(err));
  }
  dropAllIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndexes()).catch(err => this.handleError(err));
  }
  updateSchemaWithIndexes() {
    return this.getAllClasses().then(classes => {
      const promises = classes.map(schema => {
        return this.setIndexesFromMongo(schema.className);
      });
      return Promise.all(promises);
    }).catch(err => this.handleError(err));
  }
  createTransactionalSession() {
    const transactionalSection = this.client.startSession();
    transactionalSection.startTransaction();
    return Promise.resolve(transactionalSection);
  }
  commitTransactionalSession(transactionalSection) {
    const commit = retries => {
      return transactionalSection.commitTransaction().catch(error => {
        if (error && error.hasErrorLabel('TransientTransactionError') && retries > 0) {
          return commit(retries - 1);
        }
        throw error;
      }).then(() => {
        transactionalSection.endSession();
      });
    };
    return commit(5);
  }
  abortTransactionalSession(transactionalSection) {
    return transactionalSection.abortTransaction().then(() => {
      transactionalSection.endSession();
    });
  }
}
exports.MongoStorageAdapter = MongoStorageAdapter;
var _default = MongoStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX21vbmdvZGJVcmwiLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsImV4Y2x1ZGVkIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3RvdHlwZSIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsImhhc093blByb3BlcnR5IiwibW9uZ29kYiIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hIiwiX3JlZiIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsImZpZWxkTmFtZSIsIl9maWVsZHMkZmllbGROYW1lIiwidHlwZSIsInRhcmdldENsYXNzIiwiZmllbGRPcHRpb25zIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwicGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsInZhbGlkYXRlRXhwbGFpblZhbHVlIiwiZXhwbGFpbiIsImV4cGxhaW5BbGxvd2VkVmFsdWVzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9RVUVSWSIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX29uY2hhbmdlIiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJlbmFibGVTY2hlbWFIb29rcyIsInNjaGVtYUNhY2hlVHRsIiwid2F0Y2giLCJjYWxsYmFjayIsImNvbm5lY3Rpb25Qcm9taXNlIiwiZW5jb2RlZFVyaSIsImZvcm1hdFVybCIsInBhcnNlVXJsIiwiY2xpZW50Iiwib3B0aW9ucyIsInMiLCJkYiIsImRiTmFtZSIsIm9uIiwiY2F0Y2giLCJlcnIiLCJQcm9taXNlIiwicmVqZWN0IiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsImNvZGUiLCJsb2dnZXIiLCJoYW5kbGVTaHV0ZG93biIsInJlc29sdmUiLCJjbG9zZSIsIl9hZGFwdGl2ZUNvbGxlY3Rpb24iLCJuYW1lIiwicmF3Q29sbGVjdGlvbiIsIk1vbmdvQ29sbGVjdGlvbiIsIl9zY2hlbWFDb2xsZWN0aW9uIiwiX3N0cmVhbSIsIl9tb25nb0NvbGxlY3Rpb24iLCJjbGFzc0V4aXN0cyIsImxpc3RDb2xsZWN0aW9ucyIsInRvQXJyYXkiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2NoZW1hQ29sbGVjdGlvbiIsInVwZGF0ZVNjaGVtYSIsIiRzZXQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmaWVsZCIsIl9fb3AiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicmVwbGFjZSIsImluc2VydFByb21pc2UiLCJjcmVhdGVJbmRleGVzIiwiYWxsIiwic2V0SW5kZXhlc0Zyb21Nb25nbyIsImdldEluZGV4ZXMiLCJyZWR1Y2UiLCJpbmRleCIsIl9mdHMiLCJfZnRzeCIsIndlaWdodHMiLCJjcmVhdGVDbGFzcyIsImluc2VydFNjaGVtYSIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJkZWxldGVDbGFzcyIsImRyb3AiLCJtZXNzYWdlIiwiZmluZEFuZERlbGV0ZVNjaGVtYSIsImRlbGV0ZUFsbENsYXNzZXMiLCJmYXN0IiwibWFwIiwiZGVsZXRlTWFueSIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJtb25nb0Zvcm1hdE5hbWVzIiwiY29sbGVjdGlvblVwZGF0ZSIsIiR1bnNldCIsImNvbGxlY3Rpb25GaWx0ZXIiLCIkb3IiLCIkZXhpc3RzIiwic2NoZW1hVXBkYXRlIiwidXBkYXRlTWFueSIsImdldEFsbENsYXNzZXMiLCJzY2hlbWFzQ29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsImdldENsYXNzIiwiX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsImluc2VydE9uZSIsIm9wcyIsIkRVUExJQ0FURV9WQUxVRSIsInVuZGVybHlpbmdFcnJvciIsIm1hdGNoZXMiLCJBcnJheSIsImlzQXJyYXkiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInF1ZXJ5IiwibW9uZ29XaGVyZSIsInRyYW5zZm9ybVdoZXJlIiwiZGVsZXRlZENvdW50IiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwicmV0dXJuRG9jdW1lbnQiLCJzZXNzaW9uIiwicmVzdWx0IiwibW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0IiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsImNhc2VJbnNlbnNpdGl2ZSIsIm1vbmdvU29ydCIsIl8iLCJtYXBLZXlzIiwidHJhbnNmb3JtS2V5IiwibW9uZ29LZXlzIiwibWVtbyIsIl9wYXJzZVJlYWRQcmVmZXJlbmNlIiwiY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZCIsIm9iamVjdHMiLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsImluZGV4Q3JlYXRpb25SZXF1ZXN0IiwibW9uZ29GaWVsZE5hbWVzIiwiaW5kZXhUeXBlIiwiZGVmYXVsdE9wdGlvbnMiLCJiYWNrZ3JvdW5kIiwic3BhcnNlIiwiaW5kZXhOYW1lT3B0aW9ucyIsInR0bE9wdGlvbnMiLCJ0dGwiLCJleHBpcmVBZnRlclNlY29uZHMiLCJjYXNlSW5zZW5zaXRpdmVPcHRpb25zIiwiY29sbGF0aW9uIiwiY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uIiwiaW5kZXhPcHRpb25zIiwiY3JlYXRlSW5kZXgiLCJlbnN1cmVVbmlxdWVuZXNzIiwiX2Vuc3VyZVNwYXJzZVVuaXF1ZUluZGV4SW5CYWNrZ3JvdW5kIiwiX3Jhd0ZpbmQiLCJjb3VudCIsImRpc3RpbmN0IiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1GaWVsZCIsInRyYW5zZm9ybVBvaW50ZXJTdHJpbmciLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsInN0YWdlIiwiJGdyb3VwIiwiX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzIiwiJG1hdGNoIiwiX3BhcnNlQWdncmVnYXRlQXJncyIsIiRwcm9qZWN0IiwiX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3MiLCIkZ2VvTmVhciIsInJlc3VsdHMiLCJzcGxpdCIsImlzRW1wdHkiLCJyZXR1cm5WYWx1ZSIsIl9jb252ZXJ0VG9EYXRlIiwic3Vic3RyaW5nIiwiRGF0ZSIsInRvVXBwZXJDYXNlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCIkdGV4dCIsInRleHRJbmRleCIsImRyb3BBbGxJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsImNsYXNzZXMiLCJwcm9taXNlcyIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlY3Rpb24iLCJzdGFydFNlc3Npb24iLCJzdGFydFRyYW5zYWN0aW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXQiLCJyZXRyaWVzIiwiY29tbWl0VHJhbnNhY3Rpb24iLCJoYXNFcnJvckxhYmVsIiwiZW5kU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uIiwiZXhwb3J0cyIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IE1vbmdvQ29sbGVjdGlvbiBmcm9tICcuL01vbmdvQ29sbGVjdGlvbic7XG5pbXBvcnQgTW9uZ29TY2hlbWFDb2xsZWN0aW9uIGZyb20gJy4vTW9uZ29TY2hlbWFDb2xsZWN0aW9uJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFN0b3JhZ2VDbGFzcywgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHsgcGFyc2UgYXMgcGFyc2VVcmwsIGZvcm1hdCBhcyBmb3JtYXRVcmwgfSBmcm9tICcuLi8uLi8uLi92ZW5kb3IvbW9uZ29kYlVybCc7XG5pbXBvcnQge1xuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCxcbiAgdHJhbnNmb3JtS2V5LFxuICB0cmFuc2Zvcm1XaGVyZSxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nLFxufSBmcm9tICcuL01vbmdvVHJhbnNmb3JtJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uLy4uLy4uL2RlZmF1bHRzJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vLi4vLi4vbG9nZ2VyJztcblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBtb25nb2RiID0gcmVxdWlyZSgnbW9uZ29kYicpO1xuY29uc3QgTW9uZ29DbGllbnQgPSBtb25nb2RiLk1vbmdvQ2xpZW50O1xuY29uc3QgUmVhZFByZWZlcmVuY2UgPSBtb25nb2RiLlJlYWRQcmVmZXJlbmNlO1xuXG5jb25zdCBNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lID0gJ19TQ0hFTUEnO1xuXG5jb25zdCBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zID0gbW9uZ29BZGFwdGVyID0+IHtcbiAgcmV0dXJuIG1vbmdvQWRhcHRlclxuICAgIC5jb25uZWN0KClcbiAgICAudGhlbigoKSA9PiBtb25nb0FkYXB0ZXIuZGF0YWJhc2UuY29sbGVjdGlvbnMoKSlcbiAgICAudGhlbihjb2xsZWN0aW9ucyA9PiB7XG4gICAgICByZXR1cm4gY29sbGVjdGlvbnMuZmlsdGVyKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBpZiAoY29sbGVjdGlvbi5uYW1lc3BhY2UubWF0Y2goL1xcLnN5c3RlbVxcLi8pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRPRE86IElmIHlvdSBoYXZlIG9uZSBhcHAgd2l0aCBhIGNvbGxlY3Rpb24gcHJlZml4IHRoYXQgaGFwcGVucyB0byBiZSBhIHByZWZpeCBvZiBhbm90aGVyXG4gICAgICAgIC8vIGFwcHMgcHJlZml4LCB0aGlzIHdpbGwgZ28gdmVyeSB2ZXJ5IGJhZGx5LiBXZSBzaG91bGQgZml4IHRoYXQgc29tZWhvdy5cbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uY29sbGVjdGlvbk5hbWUuaW5kZXhPZihtb25nb0FkYXB0ZXIuX2NvbGxlY3Rpb25QcmVmaXgpID09IDA7XG4gICAgICB9KTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIC8vIExlZ2FjeSBtb25nbyBhZGFwdGVyIGtub3dzIGFib3V0IHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gcGFzc3dvcmQgYW5kIF9oYXNoZWRfcGFzc3dvcmQuXG4gICAgLy8gRnV0dXJlIGRhdGFiYXNlIGFkYXB0ZXJzIHdpbGwgb25seSBrbm93IGFib3V0IF9oYXNoZWRfcGFzc3dvcmQuXG4gICAgLy8gTm90ZTogUGFyc2UgU2VydmVyIHdpbGwgYnJpbmcgYmFjayBwYXNzd29yZCB3aXRoIGluamVjdERlZmF1bHRTY2hlbWEsIHNvIHdlIGRvbid0IG5lZWRcbiAgICAvLyB0byBhZGQgX2hhc2hlZF9wYXNzd29yZCBiYWNrIGV2ZXIuXG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG4vLyBSZXR1cm5zIHsgY29kZSwgZXJyb3IgfSBpZiBpbnZhbGlkLCBvciB7IHJlc3VsdCB9LCBhbiBvYmplY3Rcbi8vIHN1aXRhYmxlIGZvciBpbnNlcnRpbmcgaW50byBfU0NIRU1BIGNvbGxlY3Rpb24sIG90aGVyd2lzZS5cbmNvbnN0IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUCA9IChcbiAgZmllbGRzLFxuICBjbGFzc05hbWUsXG4gIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgaW5kZXhlc1xuKSA9PiB7XG4gIGNvbnN0IG1vbmdvT2JqZWN0ID0ge1xuICAgIF9pZDogY2xhc3NOYW1lLFxuICAgIG9iamVjdElkOiAnc3RyaW5nJyxcbiAgICB1cGRhdGVkQXQ6ICdzdHJpbmcnLFxuICAgIGNyZWF0ZWRBdDogJ3N0cmluZycsXG4gICAgX21ldGFkYXRhOiB1bmRlZmluZWQsXG4gIH07XG5cbiAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgY29uc3QgeyB0eXBlLCB0YXJnZXRDbGFzcywgLi4uZmllbGRPcHRpb25zIH0gPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICBtb25nb09iamVjdFtmaWVsZE5hbWVdID0gTW9uZ29TY2hlbWFDb2xsZWN0aW9uLnBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICB0eXBlLFxuICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgfSk7XG4gICAgaWYgKGZpZWxkT3B0aW9ucyAmJiBPYmplY3Qua2V5cyhmaWVsZE9wdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyB8fCB7fTtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9uc1tmaWVsZE5hbWVdID0gZmllbGRPcHRpb25zO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0eXBlb2YgY2xhc3NMZXZlbFBlcm1pc3Npb25zICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICBpZiAoIWNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucztcbiAgICB9IGVsc2Uge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbmRleGVzICYmIHR5cGVvZiBpbmRleGVzID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyhpbmRleGVzKS5sZW5ndGggPiAwKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuXG4gIGlmICghbW9uZ29PYmplY3QuX21ldGFkYXRhKSB7XG4gICAgLy8gY2xlYW51cCB0aGUgdW51c2VkIF9tZXRhZGF0YVxuICAgIGRlbGV0ZSBtb25nb09iamVjdC5fbWV0YWRhdGE7XG4gIH1cblxuICByZXR1cm4gbW9uZ29PYmplY3Q7XG59O1xuXG5mdW5jdGlvbiB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKSB7XG4gIGlmIChleHBsYWluKSB7XG4gICAgLy8gVGhlIGxpc3Qgb2YgYWxsb3dlZCBleHBsYWluIHZhbHVlcyBpcyBmcm9tIG5vZGUtbW9uZ29kYi1uYXRpdmUvbGliL2V4cGxhaW4uanNcbiAgICBjb25zdCBleHBsYWluQWxsb3dlZFZhbHVlcyA9IFtcbiAgICAgICdxdWVyeVBsYW5uZXInLFxuICAgICAgJ3F1ZXJ5UGxhbm5lckV4dGVuZGVkJyxcbiAgICAgICdleGVjdXRpb25TdGF0cycsXG4gICAgICAnYWxsUGxhbnNFeGVjdXRpb24nLFxuICAgICAgZmFsc2UsXG4gICAgICB0cnVlLFxuICAgIF07XG4gICAgaWYgKCFleHBsYWluQWxsb3dlZFZhbHVlcy5pbmNsdWRlcyhleHBsYWluKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdJbnZhbGlkIHZhbHVlIGZvciBleHBsYWluJyk7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNb25nb1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICAvLyBQcml2YXRlXG4gIF91cmk6IHN0cmluZztcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX21vbmdvT3B0aW9uczogT2JqZWN0O1xuICBfb25jaGFuZ2U6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICAvLyBQdWJsaWNcbiAgY29ubmVjdGlvblByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIGRhdGFiYXNlOiBhbnk7XG4gIGNsaWVudDogTW9uZ29DbGllbnQ7XG4gIF9tYXhUaW1lTVM6ID9udW1iZXI7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG4gIGVuYWJsZVNjaGVtYUhvb2tzOiBib29sZWFuO1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSA9IGRlZmF1bHRzLkRlZmF1bHRNb25nb1VSSSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBtb25nb09wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICB0aGlzLl91cmkgPSB1cmk7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zID0geyAuLi5tb25nb09wdGlvbnMgfTtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMudXNlTmV3VXJsUGFyc2VyID0gdHJ1ZTtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMudXNlVW5pZmllZFRvcG9sb2d5ID0gdHJ1ZTtcbiAgICB0aGlzLl9vbmNoYW5nZSA9ICgpID0+IHt9O1xuXG4gICAgLy8gTWF4VGltZU1TIGlzIG5vdCBhIGdsb2JhbCBNb25nb0RCIGNsaWVudCBvcHRpb24sIGl0IGlzIGFwcGxpZWQgcGVyIG9wZXJhdGlvbi5cbiAgICB0aGlzLl9tYXhUaW1lTVMgPSBtb25nb09wdGlvbnMubWF4VGltZU1TO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IHRydWU7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhbW9uZ29PcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGVUdGwgPSBtb25nb09wdGlvbnMuc2NoZW1hQ2FjaGVUdGw7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWydlbmFibGVTY2hlbWFIb29rcycsICdzY2hlbWFDYWNoZVR0bCcsICdtYXhUaW1lTVMnXSkge1xuICAgICAgZGVsZXRlIG1vbmdvT3B0aW9uc1trZXldO1xuICAgICAgZGVsZXRlIHRoaXMuX21vbmdvT3B0aW9uc1trZXldO1xuICAgIH1cbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuXG4gICAgdGhpcy5jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QoZW5jb2RlZFVyaSwgdGhpcy5fbW9uZ29PcHRpb25zKVxuICAgICAgLnRoZW4oY2xpZW50ID0+IHtcbiAgICAgICAgLy8gU3RhcnRpbmcgbW9uZ29EQiAzLjAsIHRoZSBNb25nb0NsaWVudC5jb25uZWN0IGRvbid0IHJldHVybiBhIERCIGFueW1vcmUgYnV0IGEgY2xpZW50XG4gICAgICAgIC8vIEZvcnR1bmF0ZWx5LCB3ZSBjYW4gZ2V0IGJhY2sgdGhlIG9wdGlvbnMgYW5kIHVzZSB0aGVtIHRvIHNlbGVjdCB0aGUgcHJvcGVyIERCLlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbW9uZ29kYi9ub2RlLW1vbmdvZGItbmF0aXZlL2Jsb2IvMmMzNWQ3NmYwODU3NDIyNWI4ZGIwMmQ3YmVmNjg3MTIzZTZiYjAxOC9saWIvbW9uZ29fY2xpZW50LmpzI0w4ODVcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IGNsaWVudC5zLm9wdGlvbnM7XG4gICAgICAgIGNvbnN0IGRhdGFiYXNlID0gY2xpZW50LmRiKG9wdGlvbnMuZGJOYW1lKTtcbiAgICAgICAgaWYgKCFkYXRhYmFzZSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgY2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBoYW5kbGVFcnJvcjxUPihlcnJvcjogPyhFcnJvciB8IFBhcnNlLkVycm9yKSk6IFByb21pc2U8VD4ge1xuICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAxMykge1xuICAgICAgLy8gVW5hdXRob3JpemVkIGVycm9yXG4gICAgICBkZWxldGUgdGhpcy5jbGllbnQ7XG4gICAgICBkZWxldGUgdGhpcy5kYXRhYmFzZTtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgbG9nZ2VyLmVycm9yKCdSZWNlaXZlZCB1bmF1dGhvcml6ZWQgZXJyb3InLCB7IGVycm9yOiBlcnJvciB9KTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNsaWVudC5jbG9zZShmYWxzZSk7XG4gIH1cblxuICBfYWRhcHRpdmVDb2xsZWN0aW9uKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5kYXRhYmFzZS5jb2xsZWN0aW9uKHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lKSlcbiAgICAgIC50aGVuKHJhd0NvbGxlY3Rpb24gPT4gbmV3IE1vbmdvQ29sbGVjdGlvbihyYXdDb2xsZWN0aW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIF9zY2hlbWFDb2xsZWN0aW9uKCk6IFByb21pc2U8TW9uZ29TY2hlbWFDb2xsZWN0aW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgICAgIHRoaXMuX3N0cmVhbSA9IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi53YXRjaCgpO1xuICAgICAgICAgIHRoaXMuX3N0cmVhbS5vbignY2hhbmdlJywgKCkgPT4gdGhpcy5fb25jaGFuZ2UoKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNb25nb1NjaGVtYUNvbGxlY3Rpb24oY29sbGVjdGlvbik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5saXN0Q29sbGVjdGlvbnMoeyBuYW1lOiB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSB9KS50b0FycmF5KCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbnMubGVuZ3RoID4gMDtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zJzogQ0xQcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuZHJvcEluZGV4KGNsYXNzTmFtZSwgbmFtZSk7XG4gICAgICAgIGRlbGV0ZVByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgICAga2V5LmluZGV4T2YoJ19wXycpID09PSAwID8ga2V5LnJlcGxhY2UoJ19wXycsICcnKSA6IGtleVxuICAgICAgICAgICAgKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGxldCBpbnNlcnRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICBpbnNlcnRQcm9taXNlID0gdGhpcy5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKGRlbGV0ZVByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4gaW5zZXJ0UHJvbWlzZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBleGlzdGluZ0luZGV4ZXMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldEluZGV4ZXNGcm9tTW9uZ28oY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRJbmRleGVzKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGluZGV4ZXMgPT4ge1xuICAgICAgICBpbmRleGVzID0gaW5kZXhlcy5yZWR1Y2UoKG9iaiwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoaW5kZXgua2V5Ll9mdHMpIHtcbiAgICAgICAgICAgIGRlbGV0ZSBpbmRleC5rZXkuX2Z0cztcbiAgICAgICAgICAgIGRlbGV0ZSBpbmRleC5rZXkuX2Z0c3g7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIGluZGV4LndlaWdodHMpIHtcbiAgICAgICAgICAgICAgaW5kZXgua2V5W2ZpZWxkXSA9ICd0ZXh0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqW2luZGV4Lm5hbWVdID0gaW5kZXgua2V5O1xuICAgICAgICAgIHJldHVybiBvYmo7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKS50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogaW5kZXhlcyB9LFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAvLyBJZ25vcmUgaWYgY29sbGVjdGlvbiBub3QgZm91bmRcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gIH1cblxuICBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvT2JqZWN0ID0gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQKFxuICAgICAgc2NoZW1hLmZpZWxkcyxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICBzY2hlbWEuaW5kZXhlc1xuICAgICk7XG4gICAgbW9uZ29PYmplY3QuX2lkID0gY2xhc3NOYW1lO1xuICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmluc2VydFNjaGVtYShtb25nb09iamVjdCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBjb25zdCBzY2hlbWFDb2xsZWN0aW9uID0gYXdhaXQgdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpO1xuICAgIGF3YWl0IHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgfVxuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSkpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uZHJvcCgpKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vICducyBub3QgZm91bmQnIG1lYW5zIGNvbGxlY3Rpb24gd2FzIGFscmVhZHkgZ29uZS4gSWdub3JlIGRlbGV0aW9uIGF0dGVtcHQuXG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UgPT0gJ25zIG5vdCBmb3VuZCcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC8vIFdlJ3ZlIGRyb3BwZWQgdGhlIGNvbGxlY3Rpb24sIG5vdyByZW1vdmUgdGhlIF9TQ0hFTUEgZG9jdW1lbnRcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uZmluZEFuZERlbGV0ZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICApO1xuICB9XG5cbiAgZGVsZXRlQWxsQ2xhc3NlcyhmYXN0OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnModGhpcykudGhlbihjb2xsZWN0aW9ucyA9PlxuICAgICAgUHJvbWlzZS5hbGwoXG4gICAgICAgIGNvbGxlY3Rpb25zLm1hcChjb2xsZWN0aW9uID0+IChmYXN0ID8gY29sbGVjdGlvbi5kZWxldGVNYW55KHt9KSA6IGNvbGxlY3Rpb24uZHJvcCgpKSlcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gUG9pbnRlciBmaWVsZCBuYW1lcyBhcmUgcGFzc2VkIGZvciBsZWdhY3kgcmVhc29uczogdGhlIG9yaWdpbmFsIG1vbmdvXG4gIC8vIGZvcm1hdCBzdG9yZWQgcG9pbnRlciBmaWVsZCBuYW1lcyBkaWZmZXJlbnRseSBpbiB0aGUgZGF0YWJhc2UsIGFuZCB0aGVyZWZvcmVcbiAgLy8gbmVlZGVkIHRvIGtub3cgdGhlIHR5cGUgb2YgdGhlIGZpZWxkIGJlZm9yZSBpdCBjb3VsZCBkZWxldGUgaXQuIEZ1dHVyZSBkYXRhYmFzZVxuICAvLyBhZGFwdGVycyBzaG91bGQgaWdub3JlIHRoZSBwb2ludGVyRmllbGROYW1lcyBhcmd1bWVudC4gQWxsIHRoZSBmaWVsZCBuYW1lcyBhcmUgaW5cbiAgLy8gZmllbGROYW1lcywgdGhleSBzaG93IHVwIGFkZGl0aW9uYWxseSBpbiB0aGUgcG9pbnRlckZpZWxkTmFtZXMgZGF0YWJhc2UgZm9yIHVzZVxuICAvLyBieSB0aGUgbW9uZ28gYWRhcHRlciwgd2hpY2ggZGVhbHMgd2l0aCB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBtb25nb0Zvcm1hdE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgX3BfJHtmaWVsZE5hbWV9YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZE5hbWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgY29sbGVjdGlvblVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25VcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbGxlY3Rpb25GaWx0ZXIgPSB7ICRvcjogW10gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uRmlsdGVyWyckb3InXS5wdXNoKHsgW25hbWVdOiB7ICRleGlzdHM6IHRydWUgfSB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNjaGVtYVVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7bmFtZX1gXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KGNvbGxlY3Rpb25GaWx0ZXIsIGNvbGxlY3Rpb25VcGRhdGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHNjaGVtYVVwZGF0ZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgZ2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPFN0b3JhZ2VDbGFzc1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hc0NvbGxlY3Rpb24gPT4gc2NoZW1hc0NvbGxlY3Rpb24uX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U3RvcmFnZUNsYXNzPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hc0NvbGxlY3Rpb24gPT4gc2NoZW1hc0NvbGxlY3Rpb24uX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEoY2xhc3NOYW1lKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRPRE86IEFzIHlldCBub3QgcGFydGljdWxhcmx5IHdlbGwgc3BlY2lmaWVkLiBDcmVhdGVzIGFuIG9iamVjdC4gTWF5YmUgc2hvdWxkbid0IGV2ZW4gbmVlZCB0aGUgc2NoZW1hLFxuICAvLyBhbmQgc2hvdWxkIGluZmVyIGZyb20gdGhlIHR5cGUuIE9yIG1heWJlIGRvZXMgbmVlZCB0aGUgc2NoZW1hIGZvciB2YWxpZGF0aW9ucy4gT3IgbWF5YmUgbmVlZHNcbiAgLy8gdGhlIHNjaGVtYSBvbmx5IGZvciB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC4gV2UnbGwgZmlndXJlIHRoYXQgb3V0IGxhdGVyLlxuICBjcmVhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgb2JqZWN0OiBhbnksIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55KSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvT2JqZWN0ID0gcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmluc2VydE9uZShtb25nb09iamVjdCwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbbW9uZ29PYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgLy8gRHVwbGljYXRlIHZhbHVlXG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5tZXNzYWdlLm1hdGNoKC9pbmRleDpbXFxzYS16QS1aMC05X1xcLVxcLl0rXFwkPyhbYS16QS1aXy1dKylfMS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5kZWxldGVNYW55KG1vbmdvV2hlcmUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC50aGVuKFxuICAgICAgICAoeyBkZWxldGVkQ291bnQgfSkgPT4ge1xuICAgICAgICAgIGlmIChkZWxldGVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9LFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0RhdGFiYXNlIGFkYXB0ZXIgZXJyb3InKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmRzIGFuZCB1cGRhdGVzIGFuIG9iamVjdCBiYXNlZCBvbiBxdWVyeS5cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZFVwZGF0ZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwge1xuICAgICAgICAgIHJldHVybkRvY3VtZW50OiAnYWZ0ZXInLFxuICAgICAgICAgIHNlc3Npb246IHRyYW5zYWN0aW9uYWxTZXNzaW9uIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCByZXN1bHQudmFsdWUsIHNjaGVtYSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cHNlcnRPbmUobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgZmluZC4gQWNjZXB0czogY2xhc3NOYW1lLCBxdWVyeSBpbiBQYXJzZSBmb3JtYXQsIGFuZCB7IHNraXAsIGxpbWl0LCBzb3J0IH0uXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgcmVhZFByZWZlcmVuY2UsIGhpbnQsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKTtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29Tb3J0ID0gXy5tYXBLZXlzKHNvcnQsICh2YWx1ZSwgZmllbGROYW1lKSA9PlxuICAgICAgdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpXG4gICAgKTtcbiAgICBjb25zdCBtb25nb0tleXMgPSBfLnJlZHVjZShcbiAgICAgIGtleXMsXG4gICAgICAobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtb1snX3JwZXJtJ10gPSAxO1xuICAgICAgICAgIG1lbW9bJ193cGVybSddID0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZW1vW3RyYW5zZm9ybUtleShjbGFzc05hbWUsIGtleSwgc2NoZW1hKV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSxcbiAgICAgIHt9XG4gICAgKTtcblxuICAgIC8vIElmIHdlIGFyZW4ndCByZXF1ZXN0aW5nIHRoZSBgX2lkYCBmaWVsZCwgd2UgbmVlZCB0byBleHBsaWNpdGx5IG9wdCBvdXRcbiAgICAvLyBvZiBpdC4gRG9pbmcgc28gaW4gcGFyc2Utc2VydmVyIGlzIHVudXN1YWwsIGJ1dCBpdCBjYW4gYWxsb3cgdXMgdG9cbiAgICAvLyBvcHRpbWl6ZSBzb21lIHF1ZXJpZXMgd2l0aCBjb3ZlcmluZyBpbmRleGVzLlxuICAgIGlmIChrZXlzICYmICFtb25nb0tleXMuX2lkKSB7XG4gICAgICBtb25nb0tleXMuX2lkID0gMDtcbiAgICB9XG5cbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZmluZChtb25nb1doZXJlLCB7XG4gICAgICAgICAgc2tpcCxcbiAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICBzb3J0OiBtb25nb1NvcnQsXG4gICAgICAgICAga2V5czogbW9uZ29LZXlzLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpKTtcbiAgICBtb25nb0ZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3RbZmllbGROYW1lXSA9IG9wdGlvbnMuaW5kZXhUeXBlICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmluZGV4VHlwZSA6IDE7XG4gICAgfSk7XG5cbiAgICBjb25zdCBkZWZhdWx0T3B0aW9uczogT2JqZWN0ID0geyBiYWNrZ3JvdW5kOiB0cnVlLCBzcGFyc2U6IHRydWUgfTtcbiAgICBjb25zdCBpbmRleE5hbWVPcHRpb25zOiBPYmplY3QgPSBpbmRleE5hbWUgPyB7IG5hbWU6IGluZGV4TmFtZSB9IDoge307XG4gICAgY29uc3QgdHRsT3B0aW9uczogT2JqZWN0ID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IHsgZXhwaXJlQWZ0ZXJTZWNvbmRzOiBvcHRpb25zLnR0bCB9IDoge307XG4gICAgY29uc3QgY2FzZUluc2Vuc2l0aXZlT3B0aW9uczogT2JqZWN0ID0gY2FzZUluc2Vuc2l0aXZlXG4gICAgICA/IHsgY29sbGF0aW9uOiBNb25nb0NvbGxlY3Rpb24uY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uKCkgfVxuICAgICAgOiB7fTtcbiAgICBjb25zdCBpbmRleE9wdGlvbnM6IE9iamVjdCA9IHtcbiAgICAgIC4uLmRlZmF1bHRPcHRpb25zLFxuICAgICAgLi4uY2FzZUluc2Vuc2l0aXZlT3B0aW9ucyxcbiAgICAgIC4uLmluZGV4TmFtZU9wdGlvbnMsXG4gICAgICAuLi50dGxPcHRpb25zLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKFxuICAgICAgICBjb2xsZWN0aW9uID0+XG4gICAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleENyZWF0aW9uUmVxdWVzdCwgaW5kZXhPcHRpb25zLCBlcnJvciA9PlxuICAgICAgICAgICAgICBlcnJvciA/IHJlamVjdChlcnJvcikgOiByZXNvbHZlKClcbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSB1bmlxdWUgaW5kZXguIFVuaXF1ZSBpbmRleGVzIG9uIG51bGxhYmxlIGZpZWxkcyBhcmUgbm90IGFsbG93ZWQuIFNpbmNlIHdlIGRvbid0XG4gIC8vIGN1cnJlbnRseSBrbm93IHdoaWNoIGZpZWxkcyBhcmUgbnVsbGFibGUgYW5kIHdoaWNoIGFyZW4ndCwgd2UgaWdub3JlIHRoYXQgY3JpdGVyaWEuXG4gIC8vIEFzIHN1Y2gsIHdlIHNob3VsZG4ndCBleHBvc2UgdGhpcyBmdW5jdGlvbiB0byB1c2VycyBvZiBwYXJzZSB1bnRpbCB3ZSBoYXZlIGFuIG91dC1vZi1iYW5kXG4gIC8vIFdheSBvZiBkZXRlcm1pbmluZyBpZiBhIGZpZWxkIGlzIG51bGxhYmxlLiBVbmRlZmluZWQgZG9lc24ndCBjb3VudCBhZ2FpbnN0IHVuaXF1ZW5lc3MsXG4gIC8vIHdoaWNoIGlzIHdoeSB3ZSB1c2Ugc3BhcnNlIGluZGV4ZXMuXG4gIGVuc3VyZVVuaXF1ZW5lc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpKTtcbiAgICBtb25nb0ZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3RbZmllbGROYW1lXSA9IDE7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX2Vuc3VyZVNwYXJzZVVuaXF1ZUluZGV4SW5CYWNrZ3JvdW5kKGluZGV4Q3JlYXRpb25SZXF1ZXN0KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdUcmllZCB0byBlbnN1cmUgZmllbGQgdW5pcXVlbmVzcyBmb3IgYSBjbGFzcyB0aGF0IGFscmVhZHkgaGFzIGR1cGxpY2F0ZXMuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVXNlZCBpbiB0ZXN0c1xuICBfcmF3RmluZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQocXVlcnksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZFxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5jb3VudCh0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEsIHRydWUpLCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRpc3RpbmN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIHF1ZXJ5OiBRdWVyeVR5cGUsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdHJhbnNmb3JtRmllbGQgPSB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5kaXN0aW5jdCh0cmFuc2Zvcm1GaWVsZCwgdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKSlcbiAgICAgIClcbiAgICAgIC50aGVuKG9iamVjdHMgPT4ge1xuICAgICAgICBvYmplY3RzID0gb2JqZWN0cy5maWx0ZXIob2JqID0+IG9iaiAhPSBudWxsKTtcbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtUG9pbnRlclN0cmluZyhzY2hlbWEsIGZpZWxkTmFtZSwgb2JqZWN0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIGxldCBpc1BvaW50ZXJGaWVsZCA9IGZhbHNlO1xuICAgIHBpcGVsaW5lID0gcGlwZWxpbmUubWFwKHN0YWdlID0+IHtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgc3RhZ2UuJGdyb3VwID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBzdGFnZS4kZ3JvdXApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZCAmJlxuICAgICAgICAgIHR5cGVvZiBzdGFnZS4kZ3JvdXAuX2lkID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQuaW5kZXhPZignJF9wXycpID49IDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgaXNQb2ludGVyRmllbGQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIHN0YWdlLiRtYXRjaCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRtYXRjaCk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgc3RhZ2UuJHByb2plY3QgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYSwgc3RhZ2UuJHByb2plY3QpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRnZW9OZWFyICYmIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KSB7XG4gICAgICAgIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJGdlb05lYXIucXVlcnkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YWdlO1xuICAgIH0pO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uYWdncmVnYXRlKHBpcGVsaW5lLCB7XG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnX2lkJykpIHtcbiAgICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCAmJiByZXN1bHQuX2lkKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSByZXN1bHQuX2lkLnNwbGl0KCckJylbMV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gbnVsbCB8fFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAoWydvYmplY3QnLCAnc3RyaW5nJ10uaW5jbHVkZXModHlwZW9mIHJlc3VsdC5faWQpICYmIF8uaXNFbXB0eShyZXN1bHQuX2lkKSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHJlc3VsdC5faWQ7XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0Ll9pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH0pXG4gICAgICAudGhlbihvYmplY3RzID0+IG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIHJlY3Vyc2l2ZWx5IHRyYXZlcnNlIHRoZSBwaXBlbGluZSBhbmQgY29udmVydCBhbnkgUG9pbnRlciBvciBEYXRlIGNvbHVtbnMuXG4gIC8vIElmIHdlIGRldGVjdCBhIHBvaW50ZXIgY29sdW1uIHdlIHdpbGwgcmVuYW1lIHRoZSBjb2x1bW4gYmVpbmcgcXVlcmllZCBmb3IgdG8gbWF0Y2ggdGhlIGNvbHVtblxuICAvLyBpbiB0aGUgZGF0YWJhc2UuIFdlIGFsc28gbW9kaWZ5IHRoZSB2YWx1ZSB0byB3aGF0IHdlIGV4cGVjdCB0aGUgdmFsdWUgdG8gYmUgaW4gdGhlIGRhdGFiYXNlXG4gIC8vIGFzIHdlbGwuXG4gIC8vIEZvciBkYXRlcywgdGhlIGRyaXZlciBleHBlY3RzIGEgRGF0ZSBvYmplY3QsIGJ1dCB3ZSBoYXZlIGEgc3RyaW5nIGNvbWluZyBpbi4gU28gd2UnbGwgY29udmVydFxuICAvLyB0aGUgc3RyaW5nIHRvIGEgRGF0ZSBzbyB0aGUgZHJpdmVyIGNhbiBwZXJmb3JtIHRoZSBuZWNlc3NhcnkgY29tcGFyaXNvbi5cbiAgLy9cbiAgLy8gVGhlIGdvYWwgb2YgdGhpcyBtZXRob2QgaXMgdG8gbG9vayBmb3IgdGhlIFwibGVhdmVzXCIgb2YgdGhlIHBpcGVsaW5lIGFuZCBkZXRlcm1pbmUgaWYgaXQgbmVlZHNcbiAgLy8gdG8gYmUgY29udmVydGVkLiBUaGUgcGlwZWxpbmUgY2FuIGhhdmUgYSBmZXcgZGlmZmVyZW50IGZvcm1zLiBGb3IgbW9yZSBkZXRhaWxzLCBzZWU6XG4gIC8vICAgICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvci9hZ2dyZWdhdGlvbi9cbiAgLy9cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIGFycmF5LCBpdCBtZWFucyB3ZSBhcmUgcHJvYmFibHkgcGFyc2luZyBhbiAnJGFuZCcgb3IgJyRvcicgb3BlcmF0b3IuIEluXG4gIC8vIHRoYXQgY2FzZSB3ZSBuZWVkIHRvIGxvb3AgdGhyb3VnaCBhbGwgb2YgaXQncyBjaGlsZHJlbiB0byBmaW5kIHRoZSBjb2x1bW5zIGJlaW5nIG9wZXJhdGVkIG9uLlxuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gb2JqZWN0LCB0aGVuIHdlJ2xsIGxvb3AgdGhyb3VnaCB0aGUga2V5cyBjaGVja2luZyB0byBzZWUgaWYgdGhlIGtleSBuYW1lXG4gIC8vIG1hdGNoZXMgb25lIG9mIHRoZSBzY2hlbWEgY29sdW1ucy4gSWYgaXQgZG9lcyBtYXRjaCBhIGNvbHVtbiBhbmQgdGhlIGNvbHVtbiBpcyBhIFBvaW50ZXIgb3JcbiAgLy8gYSBEYXRlLCB0aGVuIHdlJ2xsIGNvbnZlcnQgdGhlIHZhbHVlIGFzIGRlc2NyaWJlZCBhYm92ZS5cbiAgLy9cbiAgLy8gQXMgbXVjaCBhcyBJIGhhdGUgcmVjdXJzaW9uLi4udGhpcyBzZWVtZWQgbGlrZSBhIGdvb2QgZml0IGZvciBpdC4gV2UncmUgZXNzZW50aWFsbHkgdHJhdmVyc2luZ1xuICAvLyBkb3duIGEgdHJlZSB0byBmaW5kIGEgXCJsZWFmIG5vZGVcIiBhbmQgY2hlY2tpbmcgdG8gc2VlIGlmIGl0IG5lZWRzIHRvIGJlIGNvbnZlcnRlZC5cbiAgX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgaWYgKHBpcGVsaW5lID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICByZXR1cm4gcGlwZWxpbmUubWFwKHZhbHVlID0+IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwaXBlbGluZVtmaWVsZF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAvLyBQYXNzIG9iamVjdHMgZG93biB0byBNb25nb0RCLi4udGhpcyBpcyBtb3JlIHRoYW4gbGlrZWx5IGFuICRleGlzdHMgb3BlcmF0b3IuXG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBgJHtzY2hlbWEuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc30kJHtwaXBlbGluZVtmaWVsZF19YDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZShwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGQgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBzbGlnaHRseSBkaWZmZXJlbnQgdGhhbiB0aGUgb25lIGFib3ZlLiBSYXRoZXIgdGhhbiB0cnlpbmcgdG8gY29tYmluZSB0aGVzZVxuICAvLyB0d28gZnVuY3Rpb25zIGFuZCBtYWtpbmcgdGhlIGNvZGUgZXZlbiBoYXJkZXIgdG8gdW5kZXJzdGFuZCwgSSBkZWNpZGVkIHRvIHNwbGl0IGl0IHVwLiBUaGVcbiAgLy8gZGlmZmVyZW5jZSB3aXRoIHRoaXMgZnVuY3Rpb24gaXMgd2UgYXJlIG5vdCB0cmFuc2Zvcm1pbmcgdGhlIHZhbHVlcywgb25seSB0aGUga2V5cyBvZiB0aGVcbiAgLy8gcGlwZWxpbmUuXG4gIF9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoZmllbGQgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBzbGlnaHRseSBkaWZmZXJlbnQgdGhhbiB0aGUgdHdvIGFib3ZlLiBNb25nb0RCICRncm91cCBhZ2dyZWdhdGUgbG9va3MgbGlrZTpcbiAgLy8gICAgIHsgJGdyb3VwOiB7IF9pZDogPGV4cHJlc3Npb24+LCA8ZmllbGQxPjogeyA8YWNjdW11bGF0b3IxPiA6IDxleHByZXNzaW9uMT4gfSwgLi4uIH0gfVxuICAvLyBUaGUgPGV4cHJlc3Npb24+IGNvdWxkIGJlIGEgY29sdW1uIG5hbWUsIHByZWZpeGVkIHdpdGggdGhlICckJyBjaGFyYWN0ZXIuIFdlJ2xsIGxvb2sgZm9yXG4gIC8vIHRoZXNlIDxleHByZXNzaW9uPiBhbmQgY2hlY2sgdG8gc2VlIGlmIGl0IGlzIGEgJ1BvaW50ZXInIG9yIGlmIGl0J3Mgb25lIG9mIGNyZWF0ZWRBdCxcbiAgLy8gdXBkYXRlZEF0IG9yIG9iamVjdElkIGFuZCBjaGFuZ2UgaXQgYWNjb3JkaW5nbHkuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICByZXR1cm4gcGlwZWxpbmUubWFwKHZhbHVlID0+IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gcGlwZWxpbmUuc3Vic3RyaW5nKDEpO1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCRfcF8ke2ZpZWxkfWA7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF9jcmVhdGVkX2F0JztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX3VwZGF0ZWRfYXQnO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgYXR0ZW1wdCB0byBjb252ZXJ0IHRoZSBwcm92aWRlZCB2YWx1ZSB0byBhIERhdGUgb2JqZWN0LiBTaW5jZSB0aGlzIGlzIHBhcnRcbiAgLy8gb2YgYW4gYWdncmVnYXRpb24gcGlwZWxpbmUsIHRoZSB2YWx1ZSBjYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGl0IGNhbiBiZSBhbm90aGVyIG9iamVjdCB3aXRoXG4gIC8vIGFuIG9wZXJhdG9yIGluIGl0IChsaWtlICRndCwgJGx0LCBldGMpLiBCZWNhdXNlIG9mIHRoaXMgSSBmZWx0IGl0IHdhcyBlYXNpZXIgdG8gbWFrZSB0aGlzIGFcbiAgLy8gcmVjdXJzaXZlIG1ldGhvZCB0byB0cmF2ZXJzZSBkb3duIHRvIHRoZSBcImxlYWYgbm9kZVwiIHdoaWNoIGlzIGdvaW5nIHRvIGJlIHRoZSBzdHJpbmcuXG4gIF9jb252ZXJ0VG9EYXRlKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHZhbHVlKSB7XG4gICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9jb252ZXJ0VG9EYXRlKHZhbHVlW2ZpZWxkXSk7XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIF9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nKTogP3N0cmluZyB7XG4gICAgaWYgKHJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICByZWFkUHJlZmVyZW5jZSA9IHJlYWRQcmVmZXJlbmNlLnRvVXBwZXJDYXNlKCk7XG4gICAgfVxuICAgIHN3aXRjaCAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIGNhc2UgJ1BSSU1BUlknOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlBSSU1BUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUFJJTUFSWV9QUkVGRVJSRUQnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlBSSU1BUllfUFJFRkVSUkVEO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1NFQ09OREFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1NFQ09OREFSWV9QUkVGRVJSRUQnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlNFQ09OREFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnTkVBUkVTVCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuTkVBUkVTVDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIHVuZGVmaW5lZDpcbiAgICAgIGNhc2UgbnVsbDpcbiAgICAgIGNhc2UgJyc6XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdOb3Qgc3VwcG9ydGVkIHJlYWQgcHJlZmVyZW5jZS4nKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgcGVyZm9ybUluaXRpYWxpemF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleCwgeyBiYWNrZ3JvdW5kOiB0cnVlIH0pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleGVzKGluZGV4ZXMsIHsgYmFja2dyb3VuZDogdHJ1ZSB9KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGlmICh0eXBlICYmIHR5cGUudHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHtcbiAgICAgICAgW2ZpZWxkTmFtZV06ICcyZHNwaGVyZScsXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlSW5kZXgoY2xhc3NOYW1lLCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUsIHNjaGVtYTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gcXVlcnkpIHtcbiAgICAgIGlmICghcXVlcnlbZmllbGROYW1lXSB8fCAhcXVlcnlbZmllbGROYW1lXS4kdGV4dCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZXhpc3RpbmdJbmRleGVzKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gZXhpc3RpbmdJbmRleGVzW2tleV07XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5kZXgsIGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IGluZGV4TmFtZSA9IGAke2ZpZWxkTmFtZX1fdGV4dGA7XG4gICAgICBjb25zdCB0ZXh0SW5kZXggPSB7XG4gICAgICAgIFtpbmRleE5hbWVdOiB7IFtmaWVsZE5hbWVdOiAndGV4dCcgfSxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB0ZXh0SW5kZXgsXG4gICAgICAgIGV4aXN0aW5nSW5kZXhlcyxcbiAgICAgICAgc2NoZW1hLmZpZWxkc1xuICAgICAgKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSA4NSkge1xuICAgICAgICAgIC8vIEluZGV4IGV4aXN0IHdpdGggZGlmZmVyZW50IG9wdGlvbnNcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uaW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEFsbEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiB0aGlzLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oY2xhc3NlcyA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gY2xhc3Nlcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZWN0aW9uID0gdGhpcy5jbGllbnQuc3RhcnRTZXNzaW9uKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uc3RhcnRUcmFuc2FjdGlvbigpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlY3Rpb24pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbW1pdCA9IHJldHJpZXMgPT4ge1xuICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uXG4gICAgICAgIC5jb21taXRUcmFuc2FjdGlvbigpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmhhc0Vycm9yTGFiZWwoJ1RyYW5zaWVudFRyYW5zYWN0aW9uRXJyb3InKSAmJiByZXRyaWVzID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbW1pdChyZXRyaWVzIC0gMSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIHJldHVybiBjb21taXQoNSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb24uYWJvcnRUcmFuc2FjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLElBQUFBLGdCQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxzQkFBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsZUFBQSxHQUFBRixPQUFBO0FBRUEsSUFBQUcsV0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksZUFBQSxHQUFBSixPQUFBO0FBU0EsSUFBQUssS0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBRUEsSUFBQU0sT0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8sU0FBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsT0FBQSxHQUFBVCxzQkFBQSxDQUFBQyxPQUFBO0FBQXFDLFNBQUFELHVCQUFBVSxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsTUFBQSxFQUFBQyxjQUFBLFFBQUFDLElBQUEsR0FBQUMsTUFBQSxDQUFBRCxJQUFBLENBQUFGLE1BQUEsT0FBQUcsTUFBQSxDQUFBQyxxQkFBQSxRQUFBQyxPQUFBLEdBQUFGLE1BQUEsQ0FBQUMscUJBQUEsQ0FBQUosTUFBQSxHQUFBQyxjQUFBLEtBQUFJLE9BQUEsR0FBQUEsT0FBQSxDQUFBQyxNQUFBLFdBQUFDLEdBQUEsV0FBQUosTUFBQSxDQUFBSyx3QkFBQSxDQUFBUixNQUFBLEVBQUFPLEdBQUEsRUFBQUUsVUFBQSxPQUFBUCxJQUFBLENBQUFRLElBQUEsQ0FBQUMsS0FBQSxDQUFB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