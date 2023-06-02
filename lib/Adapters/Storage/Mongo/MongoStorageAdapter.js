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
    this._mongoOptions = mongoOptions;
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    delete mongoOptions.enableSchemaHooks;
    delete mongoOptions.maxTimeMS;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX21vbmdvZGJVcmwiLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsImV4Y2x1ZGVkIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3RvdHlwZSIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsImhhc093blByb3BlcnR5IiwibW9uZ29kYiIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hIiwiX3JlZiIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsImZpZWxkTmFtZSIsIl9maWVsZHMkZmllbGROYW1lIiwidHlwZSIsInRhcmdldENsYXNzIiwiZmllbGRPcHRpb25zIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwicGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsInZhbGlkYXRlRXhwbGFpblZhbHVlIiwiZXhwbGFpbiIsImV4cGxhaW5BbGxvd2VkVmFsdWVzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9RVUVSWSIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX29uY2hhbmdlIiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJlbmFibGVTY2hlbWFIb29rcyIsIndhdGNoIiwiY2FsbGJhY2siLCJjb25uZWN0aW9uUHJvbWlzZSIsImVuY29kZWRVcmkiLCJmb3JtYXRVcmwiLCJwYXJzZVVybCIsImNsaWVudCIsIm9wdGlvbnMiLCJzIiwiZGIiLCJkYk5hbWUiLCJvbiIsImNhdGNoIiwiZXJyIiwiUHJvbWlzZSIsInJlamVjdCIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJjb2RlIiwibG9nZ2VyIiwiaGFuZGxlU2h1dGRvd24iLCJyZXNvbHZlIiwiY2xvc2UiLCJfYWRhcHRpdmVDb2xsZWN0aW9uIiwibmFtZSIsInJhd0NvbGxlY3Rpb24iLCJNb25nb0NvbGxlY3Rpb24iLCJfc2NoZW1hQ29sbGVjdGlvbiIsIl9zdHJlYW0iLCJfbW9uZ29Db2xsZWN0aW9uIiwiY2xhc3NFeGlzdHMiLCJsaXN0Q29sbGVjdGlvbnMiLCJ0b0FycmF5Iiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInNjaGVtYUNvbGxlY3Rpb24iLCJ1cGRhdGVTY2hlbWEiLCIkc2V0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwiX2lkXyIsImRlbGV0ZVByb21pc2VzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiZmllbGQiLCJfX29wIiwicHJvbWlzZSIsImRyb3BJbmRleCIsInJlcGxhY2UiLCJpbnNlcnRQcm9taXNlIiwiY3JlYXRlSW5kZXhlcyIsImFsbCIsInNldEluZGV4ZXNGcm9tTW9uZ28iLCJnZXRJbmRleGVzIiwicmVkdWNlIiwiaW5kZXgiLCJfZnRzIiwiX2Z0c3giLCJ3ZWlnaHRzIiwiY3JlYXRlQ2xhc3MiLCJpbnNlcnRTY2hlbWEiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZGVsZXRlQ2xhc3MiLCJkcm9wIiwibWVzc2FnZSIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJkZWxldGVBbGxDbGFzc2VzIiwiZmFzdCIsIm1hcCIsImRlbGV0ZU1hbnkiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwibW9uZ29Gb3JtYXROYW1lcyIsImNvbGxlY3Rpb25VcGRhdGUiLCIkdW5zZXQiLCJjb2xsZWN0aW9uRmlsdGVyIiwiJG9yIiwiJGV4aXN0cyIsInNjaGVtYVVwZGF0ZSIsInVwZGF0ZU1hbnkiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hc0NvbGxlY3Rpb24iLCJfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEiLCJnZXRDbGFzcyIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUiLCJpbnNlcnRPbmUiLCJvcHMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1bmRlcmx5aW5nRXJyb3IiLCJtYXRjaGVzIiwiQXJyYXkiLCJpc0FycmF5IiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJxdWVyeSIsIm1vbmdvV2hlcmUiLCJ0cmFuc2Zvcm1XaGVyZSIsImRlbGV0ZWRDb3VudCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZSIsIm1vbmdvVXBkYXRlIiwidHJhbnNmb3JtVXBkYXRlIiwiZmluZE9uZUFuZFVwZGF0ZSIsInJldHVybkRvY3VtZW50Iiwic2Vzc2lvbiIsInJlc3VsdCIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsInVwc2VydE9uZU9iamVjdCIsInVwc2VydE9uZSIsImZpbmQiLCJza2lwIiwibGltaXQiLCJzb3J0IiwicmVhZFByZWZlcmVuY2UiLCJjYXNlSW5zZW5zaXRpdmUiLCJtb25nb1NvcnQiLCJfIiwibWFwS2V5cyIsInRyYW5zZm9ybUtleSIsIm1vbmdvS2V5cyIsIm1lbW8iLCJfcGFyc2VSZWFkUHJlZmVyZW5jZSIsImNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQiLCJvYmplY3RzIiwiZW5zdXJlSW5kZXgiLCJpbmRleE5hbWUiLCJpbmRleENyZWF0aW9uUmVxdWVzdCIsIm1vbmdvRmllbGROYW1lcyIsImluZGV4VHlwZSIsImRlZmF1bHRPcHRpb25zIiwiYmFja2dyb3VuZCIsInNwYXJzZSIsImluZGV4TmFtZU9wdGlvbnMiLCJ0dGxPcHRpb25zIiwidHRsIiwiZXhwaXJlQWZ0ZXJTZWNvbmRzIiwiY2FzZUluc2Vuc2l0aXZlT3B0aW9ucyIsImNvbGxhdGlvbiIsImNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbiIsImluZGV4T3B0aW9ucyIsImNyZWF0ZUluZGV4IiwiZW5zdXJlVW5pcXVlbmVzcyIsIl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZCIsIl9yYXdGaW5kIiwiY291bnQiLCJkaXN0aW5jdCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtRmllbGQiLCJ0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJzdGFnZSIsIiRncm91cCIsIl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyIsIiRtYXRjaCIsIl9wYXJzZUFnZ3JlZ2F0ZUFyZ3MiLCIkcHJvamVjdCIsIl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzIiwiJGdlb05lYXIiLCJyZXN1bHRzIiwic3BsaXQiLCJpc0VtcHR5IiwicmV0dXJuVmFsdWUiLCJfY29udmVydFRvRGF0ZSIsInN1YnN0cmluZyIsIkRhdGUiLCJ0b1VwcGVyQ2FzZSIsIlBSSU1BUlkiLCJQUklNQVJZX1BSRUZFUlJFRCIsIlNFQ09OREFSWSIsIlNFQ09OREFSWV9QUkVGRVJSRUQiLCJORUFSRVNUIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiJHRleHQiLCJ0ZXh0SW5kZXgiLCJkcm9wQWxsSW5kZXhlcyIsImRyb3BJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJjbGFzc2VzIiwicHJvbWlzZXMiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZWN0aW9uIiwic3RhcnRTZXNzaW9uIiwic3RhcnRUcmFuc2FjdGlvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0IiwicmV0cmllcyIsImNvbW1pdFRyYW5zYWN0aW9uIiwiaGFzRXJyb3JMYWJlbCIsImVuZFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbiIsImV4cG9ydHMiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmltcG9ydCBNb25nb0NvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb0NvbGxlY3Rpb24nO1xuaW1wb3J0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbiBmcm9tICcuL01vbmdvU2NoZW1hQ29sbGVjdGlvbic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hVHlwZSwgUXVlcnlUeXBlLCBTdG9yYWdlQ2xhc3MsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB7IHBhcnNlIGFzIHBhcnNlVXJsLCBmb3JtYXQgYXMgZm9ybWF0VXJsIH0gZnJvbSAnLi4vLi4vLi4vdmVuZG9yL21vbmdvZGJVcmwnO1xuaW1wb3J0IHtcbiAgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlLFxuICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QsXG4gIHRyYW5zZm9ybUtleSxcbiAgdHJhbnNmb3JtV2hlcmUsXG4gIHRyYW5zZm9ybVVwZGF0ZSxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbn0gZnJvbSAnLi9Nb25nb1RyYW5zZm9ybSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLi8uLi8uLi9kZWZhdWx0cyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgbW9uZ29kYiA9IHJlcXVpcmUoJ21vbmdvZGInKTtcbmNvbnN0IE1vbmdvQ2xpZW50ID0gbW9uZ29kYi5Nb25nb0NsaWVudDtcbmNvbnN0IFJlYWRQcmVmZXJlbmNlID0gbW9uZ29kYi5SZWFkUHJlZmVyZW5jZTtcblxuY29uc3QgTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSA9ICdfU0NIRU1BJztcblxuY29uc3Qgc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyA9IG1vbmdvQWRhcHRlciA9PiB7XG4gIHJldHVybiBtb25nb0FkYXB0ZXJcbiAgICAuY29ubmVjdCgpXG4gICAgLnRoZW4oKCkgPT4gbW9uZ29BZGFwdGVyLmRhdGFiYXNlLmNvbGxlY3Rpb25zKCkpXG4gICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgcmV0dXJuIGNvbGxlY3Rpb25zLmZpbHRlcihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKGNvbGxlY3Rpb24ubmFtZXNwYWNlLm1hdGNoKC9cXC5zeXN0ZW1cXC4vKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPOiBJZiB5b3UgaGF2ZSBvbmUgYXBwIHdpdGggYSBjb2xsZWN0aW9uIHByZWZpeCB0aGF0IGhhcHBlbnMgdG8gYmUgYSBwcmVmaXggb2YgYW5vdGhlclxuICAgICAgICAvLyBhcHBzIHByZWZpeCwgdGhpcyB3aWxsIGdvIHZlcnkgdmVyeSBiYWRseS4gV2Ugc2hvdWxkIGZpeCB0aGF0IHNvbWVob3cuXG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uLmNvbGxlY3Rpb25OYW1lLmluZGV4T2YobW9uZ29BZGFwdGVyLl9jb2xsZWN0aW9uUHJlZml4KSA9PSAwO1xuICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hID0gKHsgLi4uc2NoZW1hIH0pID0+IHtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAvLyBMZWdhY3kgbW9uZ28gYWRhcHRlciBrbm93cyBhYm91dCB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHBhc3N3b3JkIGFuZCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIEZ1dHVyZSBkYXRhYmFzZSBhZGFwdGVycyB3aWxsIG9ubHkga25vdyBhYm91dCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIE5vdGU6IFBhcnNlIFNlcnZlciB3aWxsIGJyaW5nIGJhY2sgcGFzc3dvcmQgd2l0aCBpbmplY3REZWZhdWx0U2NoZW1hLCBzbyB3ZSBkb24ndCBuZWVkXG4gICAgLy8gdG8gYWRkIF9oYXNoZWRfcGFzc3dvcmQgYmFjayBldmVyLlxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuLy8gUmV0dXJucyB7IGNvZGUsIGVycm9yIH0gaWYgaW52YWxpZCwgb3IgeyByZXN1bHQgfSwgYW4gb2JqZWN0XG4vLyBzdWl0YWJsZSBmb3IgaW5zZXJ0aW5nIGludG8gX1NDSEVNQSBjb2xsZWN0aW9uLCBvdGhlcndpc2UuXG5jb25zdCBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAgPSAoXG4gIGZpZWxkcyxcbiAgY2xhc3NOYW1lLFxuICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIGluZGV4ZXNcbikgPT4ge1xuICBjb25zdCBtb25nb09iamVjdCA9IHtcbiAgICBfaWQ6IGNsYXNzTmFtZSxcbiAgICBvYmplY3RJZDogJ3N0cmluZycsXG4gICAgdXBkYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBjcmVhdGVkQXQ6ICdzdHJpbmcnLFxuICAgIF9tZXRhZGF0YTogdW5kZWZpbmVkLFxuICB9O1xuXG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgbW9uZ29PYmplY3RbZmllbGROYW1lXSA9IE1vbmdvU2NoZW1hQ29sbGVjdGlvbi5wYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgdHlwZSxcbiAgICAgIHRhcmdldENsYXNzLFxuICAgIH0pO1xuICAgIGlmIChmaWVsZE9wdGlvbnMgJiYgT2JqZWN0LmtleXMoZmllbGRPcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgPSBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgfHwge307XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkT3B0aW9ucztcbiAgICB9XG4gIH1cblxuICBpZiAodHlwZW9mIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgaWYgKCFjbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICB9XG4gIH1cblxuICBpZiAoaW5kZXhlcyAmJiB0eXBlb2YgaW5kZXhlcyA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoID4gMCkge1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cblxuICBpZiAoIW1vbmdvT2JqZWN0Ll9tZXRhZGF0YSkge1xuICAgIC8vIGNsZWFudXAgdGhlIHVudXNlZCBfbWV0YWRhdGFcbiAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhO1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvT2JqZWN0O1xufTtcblxuZnVuY3Rpb24gdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbikge1xuICBpZiAoZXhwbGFpbikge1xuICAgIC8vIFRoZSBsaXN0IG9mIGFsbG93ZWQgZXhwbGFpbiB2YWx1ZXMgaXMgZnJvbSBub2RlLW1vbmdvZGItbmF0aXZlL2xpYi9leHBsYWluLmpzXG4gICAgY29uc3QgZXhwbGFpbkFsbG93ZWRWYWx1ZXMgPSBbXG4gICAgICAncXVlcnlQbGFubmVyJyxcbiAgICAgICdxdWVyeVBsYW5uZXJFeHRlbmRlZCcsXG4gICAgICAnZXhlY3V0aW9uU3RhdHMnLFxuICAgICAgJ2FsbFBsYW5zRXhlY3V0aW9uJyxcbiAgICAgIGZhbHNlLFxuICAgICAgdHJ1ZSxcbiAgICBdO1xuICAgIGlmICghZXhwbGFpbkFsbG93ZWRWYWx1ZXMuaW5jbHVkZXMoZXhwbGFpbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnSW52YWxpZCB2YWx1ZSBmb3IgZXhwbGFpbicpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTW9uZ29TdG9yYWdlQWRhcHRlciBpbXBsZW1lbnRzIFN0b3JhZ2VBZGFwdGVyIHtcbiAgLy8gUHJpdmF0ZVxuICBfdXJpOiBzdHJpbmc7XG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9tb25nb09wdGlvbnM6IE9iamVjdDtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9zdHJlYW06IGFueTtcbiAgLy8gUHVibGljXG4gIGNvbm5lY3Rpb25Qcm9taXNlOiA/UHJvbWlzZTxhbnk+O1xuICBkYXRhYmFzZTogYW55O1xuICBjbGllbnQ6IE1vbmdvQ2xpZW50O1xuICBfbWF4VGltZU1TOiA/bnVtYmVyO1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSA9IGRlZmF1bHRzLkRlZmF1bHRNb25nb1VSSSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBtb25nb09wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICB0aGlzLl91cmkgPSB1cmk7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zID0gbW9uZ29PcHRpb25zO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VOZXdVcmxQYXJzZXIgPSB0cnVlO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VVbmlmaWVkVG9wb2xvZ3kgPSB0cnVlO1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG5cbiAgICAvLyBNYXhUaW1lTVMgaXMgbm90IGEgZ2xvYmFsIE1vbmdvREIgY2xpZW50IG9wdGlvbiwgaXQgaXMgYXBwbGllZCBwZXIgb3BlcmF0aW9uLlxuICAgIHRoaXMuX21heFRpbWVNUyA9IG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gdHJ1ZTtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgZGVsZXRlIG1vbmdvT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICBkZWxldGUgbW9uZ29PcHRpb25zLm1heFRpbWVNUztcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuXG4gICAgdGhpcy5jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QoZW5jb2RlZFVyaSwgdGhpcy5fbW9uZ29PcHRpb25zKVxuICAgICAgLnRoZW4oY2xpZW50ID0+IHtcbiAgICAgICAgLy8gU3RhcnRpbmcgbW9uZ29EQiAzLjAsIHRoZSBNb25nb0NsaWVudC5jb25uZWN0IGRvbid0IHJldHVybiBhIERCIGFueW1vcmUgYnV0IGEgY2xpZW50XG4gICAgICAgIC8vIEZvcnR1bmF0ZWx5LCB3ZSBjYW4gZ2V0IGJhY2sgdGhlIG9wdGlvbnMgYW5kIHVzZSB0aGVtIHRvIHNlbGVjdCB0aGUgcHJvcGVyIERCLlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbW9uZ29kYi9ub2RlLW1vbmdvZGItbmF0aXZlL2Jsb2IvMmMzNWQ3NmYwODU3NDIyNWI4ZGIwMmQ3YmVmNjg3MTIzZTZiYjAxOC9saWIvbW9uZ29fY2xpZW50LmpzI0w4ODVcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IGNsaWVudC5zLm9wdGlvbnM7XG4gICAgICAgIGNvbnN0IGRhdGFiYXNlID0gY2xpZW50LmRiKG9wdGlvbnMuZGJOYW1lKTtcbiAgICAgICAgaWYgKCFkYXRhYmFzZSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgY2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBoYW5kbGVFcnJvcjxUPihlcnJvcjogPyhFcnJvciB8IFBhcnNlLkVycm9yKSk6IFByb21pc2U8VD4ge1xuICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAxMykge1xuICAgICAgLy8gVW5hdXRob3JpemVkIGVycm9yXG4gICAgICBkZWxldGUgdGhpcy5jbGllbnQ7XG4gICAgICBkZWxldGUgdGhpcy5kYXRhYmFzZTtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgbG9nZ2VyLmVycm9yKCdSZWNlaXZlZCB1bmF1dGhvcml6ZWQgZXJyb3InLCB7IGVycm9yOiBlcnJvciB9KTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNsaWVudC5jbG9zZShmYWxzZSk7XG4gIH1cblxuICBfYWRhcHRpdmVDb2xsZWN0aW9uKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5kYXRhYmFzZS5jb2xsZWN0aW9uKHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lKSlcbiAgICAgIC50aGVuKHJhd0NvbGxlY3Rpb24gPT4gbmV3IE1vbmdvQ29sbGVjdGlvbihyYXdDb2xsZWN0aW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIF9zY2hlbWFDb2xsZWN0aW9uKCk6IFByb21pc2U8TW9uZ29TY2hlbWFDb2xsZWN0aW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgICAgIHRoaXMuX3N0cmVhbSA9IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi53YXRjaCgpO1xuICAgICAgICAgIHRoaXMuX3N0cmVhbS5vbignY2hhbmdlJywgKCkgPT4gdGhpcy5fb25jaGFuZ2UoKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNb25nb1NjaGVtYUNvbGxlY3Rpb24oY29sbGVjdGlvbik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5saXN0Q29sbGVjdGlvbnMoeyBuYW1lOiB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSB9KS50b0FycmF5KCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbnMubGVuZ3RoID4gMDtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zJzogQ0xQcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuZHJvcEluZGV4KGNsYXNzTmFtZSwgbmFtZSk7XG4gICAgICAgIGRlbGV0ZVByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgICAga2V5LmluZGV4T2YoJ19wXycpID09PSAwID8ga2V5LnJlcGxhY2UoJ19wXycsICcnKSA6IGtleVxuICAgICAgICAgICAgKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGxldCBpbnNlcnRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICBpbnNlcnRQcm9taXNlID0gdGhpcy5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKGRlbGV0ZVByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4gaW5zZXJ0UHJvbWlzZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBleGlzdGluZ0luZGV4ZXMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldEluZGV4ZXNGcm9tTW9uZ28oY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRJbmRleGVzKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGluZGV4ZXMgPT4ge1xuICAgICAgICBpbmRleGVzID0gaW5kZXhlcy5yZWR1Y2UoKG9iaiwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoaW5kZXgua2V5Ll9mdHMpIHtcbiAgICAgICAgICAgIGRlbGV0ZSBpbmRleC5rZXkuX2Z0cztcbiAgICAgICAgICAgIGRlbGV0ZSBpbmRleC5rZXkuX2Z0c3g7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIGluZGV4LndlaWdodHMpIHtcbiAgICAgICAgICAgICAgaW5kZXgua2V5W2ZpZWxkXSA9ICd0ZXh0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqW2luZGV4Lm5hbWVdID0gaW5kZXgua2V5O1xuICAgICAgICAgIHJldHVybiBvYmo7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKS50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogaW5kZXhlcyB9LFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAvLyBJZ25vcmUgaWYgY29sbGVjdGlvbiBub3QgZm91bmRcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gIH1cblxuICBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvT2JqZWN0ID0gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQKFxuICAgICAgc2NoZW1hLmZpZWxkcyxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICBzY2hlbWEuaW5kZXhlc1xuICAgICk7XG4gICAgbW9uZ29PYmplY3QuX2lkID0gY2xhc3NOYW1lO1xuICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmluc2VydFNjaGVtYShtb25nb09iamVjdCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBjb25zdCBzY2hlbWFDb2xsZWN0aW9uID0gYXdhaXQgdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpO1xuICAgIGF3YWl0IHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgfVxuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSkpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uZHJvcCgpKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vICducyBub3QgZm91bmQnIG1lYW5zIGNvbGxlY3Rpb24gd2FzIGFscmVhZHkgZ29uZS4gSWdub3JlIGRlbGV0aW9uIGF0dGVtcHQuXG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UgPT0gJ25zIG5vdCBmb3VuZCcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC8vIFdlJ3ZlIGRyb3BwZWQgdGhlIGNvbGxlY3Rpb24sIG5vdyByZW1vdmUgdGhlIF9TQ0hFTUEgZG9jdW1lbnRcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uZmluZEFuZERlbGV0ZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICApO1xuICB9XG5cbiAgZGVsZXRlQWxsQ2xhc3NlcyhmYXN0OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnModGhpcykudGhlbihjb2xsZWN0aW9ucyA9PlxuICAgICAgUHJvbWlzZS5hbGwoXG4gICAgICAgIGNvbGxlY3Rpb25zLm1hcChjb2xsZWN0aW9uID0+IChmYXN0ID8gY29sbGVjdGlvbi5kZWxldGVNYW55KHt9KSA6IGNvbGxlY3Rpb24uZHJvcCgpKSlcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gUG9pbnRlciBmaWVsZCBuYW1lcyBhcmUgcGFzc2VkIGZvciBsZWdhY3kgcmVhc29uczogdGhlIG9yaWdpbmFsIG1vbmdvXG4gIC8vIGZvcm1hdCBzdG9yZWQgcG9pbnRlciBmaWVsZCBuYW1lcyBkaWZmZXJlbnRseSBpbiB0aGUgZGF0YWJhc2UsIGFuZCB0aGVyZWZvcmVcbiAgLy8gbmVlZGVkIHRvIGtub3cgdGhlIHR5cGUgb2YgdGhlIGZpZWxkIGJlZm9yZSBpdCBjb3VsZCBkZWxldGUgaXQuIEZ1dHVyZSBkYXRhYmFzZVxuICAvLyBhZGFwdGVycyBzaG91bGQgaWdub3JlIHRoZSBwb2ludGVyRmllbGROYW1lcyBhcmd1bWVudC4gQWxsIHRoZSBmaWVsZCBuYW1lcyBhcmUgaW5cbiAgLy8gZmllbGROYW1lcywgdGhleSBzaG93IHVwIGFkZGl0aW9uYWxseSBpbiB0aGUgcG9pbnRlckZpZWxkTmFtZXMgZGF0YWJhc2UgZm9yIHVzZVxuICAvLyBieSB0aGUgbW9uZ28gYWRhcHRlciwgd2hpY2ggZGVhbHMgd2l0aCB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBtb25nb0Zvcm1hdE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgX3BfJHtmaWVsZE5hbWV9YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZE5hbWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgY29sbGVjdGlvblVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25VcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbGxlY3Rpb25GaWx0ZXIgPSB7ICRvcjogW10gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uRmlsdGVyWyckb3InXS5wdXNoKHsgW25hbWVdOiB7ICRleGlzdHM6IHRydWUgfSB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNjaGVtYVVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7bmFtZX1gXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KGNvbGxlY3Rpb25GaWx0ZXIsIGNvbGxlY3Rpb25VcGRhdGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHNjaGVtYVVwZGF0ZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgZ2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPFN0b3JhZ2VDbGFzc1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hc0NvbGxlY3Rpb24gPT4gc2NoZW1hc0NvbGxlY3Rpb24uX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U3RvcmFnZUNsYXNzPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hc0NvbGxlY3Rpb24gPT4gc2NoZW1hc0NvbGxlY3Rpb24uX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEoY2xhc3NOYW1lKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRPRE86IEFzIHlldCBub3QgcGFydGljdWxhcmx5IHdlbGwgc3BlY2lmaWVkLiBDcmVhdGVzIGFuIG9iamVjdC4gTWF5YmUgc2hvdWxkbid0IGV2ZW4gbmVlZCB0aGUgc2NoZW1hLFxuICAvLyBhbmQgc2hvdWxkIGluZmVyIGZyb20gdGhlIHR5cGUuIE9yIG1heWJlIGRvZXMgbmVlZCB0aGUgc2NoZW1hIGZvciB2YWxpZGF0aW9ucy4gT3IgbWF5YmUgbmVlZHNcbiAgLy8gdGhlIHNjaGVtYSBvbmx5IGZvciB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC4gV2UnbGwgZmlndXJlIHRoYXQgb3V0IGxhdGVyLlxuICBjcmVhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgb2JqZWN0OiBhbnksIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55KSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvT2JqZWN0ID0gcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmluc2VydE9uZShtb25nb09iamVjdCwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbbW9uZ29PYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgLy8gRHVwbGljYXRlIHZhbHVlXG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5tZXNzYWdlLm1hdGNoKC9pbmRleDpbXFxzYS16QS1aMC05X1xcLVxcLl0rXFwkPyhbYS16QS1aXy1dKylfMS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5kZWxldGVNYW55KG1vbmdvV2hlcmUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC50aGVuKFxuICAgICAgICAoeyBkZWxldGVkQ291bnQgfSkgPT4ge1xuICAgICAgICAgIGlmIChkZWxldGVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9LFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0RhdGFiYXNlIGFkYXB0ZXIgZXJyb3InKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmRzIGFuZCB1cGRhdGVzIGFuIG9iamVjdCBiYXNlZCBvbiBxdWVyeS5cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZFVwZGF0ZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwge1xuICAgICAgICAgIHJldHVybkRvY3VtZW50OiAnYWZ0ZXInLFxuICAgICAgICAgIHNlc3Npb246IHRyYW5zYWN0aW9uYWxTZXNzaW9uIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCByZXN1bHQudmFsdWUsIHNjaGVtYSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cHNlcnRPbmUobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgZmluZC4gQWNjZXB0czogY2xhc3NOYW1lLCBxdWVyeSBpbiBQYXJzZSBmb3JtYXQsIGFuZCB7IHNraXAsIGxpbWl0LCBzb3J0IH0uXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgcmVhZFByZWZlcmVuY2UsIGhpbnQsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKTtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29Tb3J0ID0gXy5tYXBLZXlzKHNvcnQsICh2YWx1ZSwgZmllbGROYW1lKSA9PlxuICAgICAgdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpXG4gICAgKTtcbiAgICBjb25zdCBtb25nb0tleXMgPSBfLnJlZHVjZShcbiAgICAgIGtleXMsXG4gICAgICAobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtb1snX3JwZXJtJ10gPSAxO1xuICAgICAgICAgIG1lbW9bJ193cGVybSddID0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZW1vW3RyYW5zZm9ybUtleShjbGFzc05hbWUsIGtleSwgc2NoZW1hKV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSxcbiAgICAgIHt9XG4gICAgKTtcblxuICAgIC8vIElmIHdlIGFyZW4ndCByZXF1ZXN0aW5nIHRoZSBgX2lkYCBmaWVsZCwgd2UgbmVlZCB0byBleHBsaWNpdGx5IG9wdCBvdXRcbiAgICAvLyBvZiBpdC4gRG9pbmcgc28gaW4gcGFyc2Utc2VydmVyIGlzIHVudXN1YWwsIGJ1dCBpdCBjYW4gYWxsb3cgdXMgdG9cbiAgICAvLyBvcHRpbWl6ZSBzb21lIHF1ZXJpZXMgd2l0aCBjb3ZlcmluZyBpbmRleGVzLlxuICAgIGlmIChrZXlzICYmICFtb25nb0tleXMuX2lkKSB7XG4gICAgICBtb25nb0tleXMuX2lkID0gMDtcbiAgICB9XG5cbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZmluZChtb25nb1doZXJlLCB7XG4gICAgICAgICAgc2tpcCxcbiAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICBzb3J0OiBtb25nb1NvcnQsXG4gICAgICAgICAga2V5czogbW9uZ29LZXlzLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpKTtcbiAgICBtb25nb0ZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3RbZmllbGROYW1lXSA9IG9wdGlvbnMuaW5kZXhUeXBlICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmluZGV4VHlwZSA6IDE7XG4gICAgfSk7XG5cbiAgICBjb25zdCBkZWZhdWx0T3B0aW9uczogT2JqZWN0ID0geyBiYWNrZ3JvdW5kOiB0cnVlLCBzcGFyc2U6IHRydWUgfTtcbiAgICBjb25zdCBpbmRleE5hbWVPcHRpb25zOiBPYmplY3QgPSBpbmRleE5hbWUgPyB7IG5hbWU6IGluZGV4TmFtZSB9IDoge307XG4gICAgY29uc3QgdHRsT3B0aW9uczogT2JqZWN0ID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IHsgZXhwaXJlQWZ0ZXJTZWNvbmRzOiBvcHRpb25zLnR0bCB9IDoge307XG4gICAgY29uc3QgY2FzZUluc2Vuc2l0aXZlT3B0aW9uczogT2JqZWN0ID0gY2FzZUluc2Vuc2l0aXZlXG4gICAgICA/IHsgY29sbGF0aW9uOiBNb25nb0NvbGxlY3Rpb24uY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uKCkgfVxuICAgICAgOiB7fTtcbiAgICBjb25zdCBpbmRleE9wdGlvbnM6IE9iamVjdCA9IHtcbiAgICAgIC4uLmRlZmF1bHRPcHRpb25zLFxuICAgICAgLi4uY2FzZUluc2Vuc2l0aXZlT3B0aW9ucyxcbiAgICAgIC4uLmluZGV4TmFtZU9wdGlvbnMsXG4gICAgICAuLi50dGxPcHRpb25zLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKFxuICAgICAgICBjb2xsZWN0aW9uID0+XG4gICAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleENyZWF0aW9uUmVxdWVzdCwgaW5kZXhPcHRpb25zLCBlcnJvciA9PlxuICAgICAgICAgICAgICBlcnJvciA/IHJlamVjdChlcnJvcikgOiByZXNvbHZlKClcbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSB1bmlxdWUgaW5kZXguIFVuaXF1ZSBpbmRleGVzIG9uIG51bGxhYmxlIGZpZWxkcyBhcmUgbm90IGFsbG93ZWQuIFNpbmNlIHdlIGRvbid0XG4gIC8vIGN1cnJlbnRseSBrbm93IHdoaWNoIGZpZWxkcyBhcmUgbnVsbGFibGUgYW5kIHdoaWNoIGFyZW4ndCwgd2UgaWdub3JlIHRoYXQgY3JpdGVyaWEuXG4gIC8vIEFzIHN1Y2gsIHdlIHNob3VsZG4ndCBleHBvc2UgdGhpcyBmdW5jdGlvbiB0byB1c2VycyBvZiBwYXJzZSB1bnRpbCB3ZSBoYXZlIGFuIG91dC1vZi1iYW5kXG4gIC8vIFdheSBvZiBkZXRlcm1pbmluZyBpZiBhIGZpZWxkIGlzIG51bGxhYmxlLiBVbmRlZmluZWQgZG9lc24ndCBjb3VudCBhZ2FpbnN0IHVuaXF1ZW5lc3MsXG4gIC8vIHdoaWNoIGlzIHdoeSB3ZSB1c2Ugc3BhcnNlIGluZGV4ZXMuXG4gIGVuc3VyZVVuaXF1ZW5lc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpKTtcbiAgICBtb25nb0ZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3RbZmllbGROYW1lXSA9IDE7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX2Vuc3VyZVNwYXJzZVVuaXF1ZUluZGV4SW5CYWNrZ3JvdW5kKGluZGV4Q3JlYXRpb25SZXF1ZXN0KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdUcmllZCB0byBlbnN1cmUgZmllbGQgdW5pcXVlbmVzcyBmb3IgYSBjbGFzcyB0aGF0IGFscmVhZHkgaGFzIGR1cGxpY2F0ZXMuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVXNlZCBpbiB0ZXN0c1xuICBfcmF3RmluZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQocXVlcnksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZFxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5jb3VudCh0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEsIHRydWUpLCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRpc3RpbmN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIHF1ZXJ5OiBRdWVyeVR5cGUsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdHJhbnNmb3JtRmllbGQgPSB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5kaXN0aW5jdCh0cmFuc2Zvcm1GaWVsZCwgdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKSlcbiAgICAgIClcbiAgICAgIC50aGVuKG9iamVjdHMgPT4ge1xuICAgICAgICBvYmplY3RzID0gb2JqZWN0cy5maWx0ZXIob2JqID0+IG9iaiAhPSBudWxsKTtcbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtUG9pbnRlclN0cmluZyhzY2hlbWEsIGZpZWxkTmFtZSwgb2JqZWN0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIGxldCBpc1BvaW50ZXJGaWVsZCA9IGZhbHNlO1xuICAgIHBpcGVsaW5lID0gcGlwZWxpbmUubWFwKHN0YWdlID0+IHtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgc3RhZ2UuJGdyb3VwID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBzdGFnZS4kZ3JvdXApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZCAmJlxuICAgICAgICAgIHR5cGVvZiBzdGFnZS4kZ3JvdXAuX2lkID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQuaW5kZXhPZignJF9wXycpID49IDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgaXNQb2ludGVyRmllbGQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIHN0YWdlLiRtYXRjaCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRtYXRjaCk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgc3RhZ2UuJHByb2plY3QgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYSwgc3RhZ2UuJHByb2plY3QpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRnZW9OZWFyICYmIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KSB7XG4gICAgICAgIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJGdlb05lYXIucXVlcnkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YWdlO1xuICAgIH0pO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uYWdncmVnYXRlKHBpcGVsaW5lLCB7XG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnX2lkJykpIHtcbiAgICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCAmJiByZXN1bHQuX2lkKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSByZXN1bHQuX2lkLnNwbGl0KCckJylbMV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gbnVsbCB8fFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAoWydvYmplY3QnLCAnc3RyaW5nJ10uaW5jbHVkZXModHlwZW9mIHJlc3VsdC5faWQpICYmIF8uaXNFbXB0eShyZXN1bHQuX2lkKSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHJlc3VsdC5faWQ7XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0Ll9pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH0pXG4gICAgICAudGhlbihvYmplY3RzID0+IG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIHJlY3Vyc2l2ZWx5IHRyYXZlcnNlIHRoZSBwaXBlbGluZSBhbmQgY29udmVydCBhbnkgUG9pbnRlciBvciBEYXRlIGNvbHVtbnMuXG4gIC8vIElmIHdlIGRldGVjdCBhIHBvaW50ZXIgY29sdW1uIHdlIHdpbGwgcmVuYW1lIHRoZSBjb2x1bW4gYmVpbmcgcXVlcmllZCBmb3IgdG8gbWF0Y2ggdGhlIGNvbHVtblxuICAvLyBpbiB0aGUgZGF0YWJhc2UuIFdlIGFsc28gbW9kaWZ5IHRoZSB2YWx1ZSB0byB3aGF0IHdlIGV4cGVjdCB0aGUgdmFsdWUgdG8gYmUgaW4gdGhlIGRhdGFiYXNlXG4gIC8vIGFzIHdlbGwuXG4gIC8vIEZvciBkYXRlcywgdGhlIGRyaXZlciBleHBlY3RzIGEgRGF0ZSBvYmplY3QsIGJ1dCB3ZSBoYXZlIGEgc3RyaW5nIGNvbWluZyBpbi4gU28gd2UnbGwgY29udmVydFxuICAvLyB0aGUgc3RyaW5nIHRvIGEgRGF0ZSBzbyB0aGUgZHJpdmVyIGNhbiBwZXJmb3JtIHRoZSBuZWNlc3NhcnkgY29tcGFyaXNvbi5cbiAgLy9cbiAgLy8gVGhlIGdvYWwgb2YgdGhpcyBtZXRob2QgaXMgdG8gbG9vayBmb3IgdGhlIFwibGVhdmVzXCIgb2YgdGhlIHBpcGVsaW5lIGFuZCBkZXRlcm1pbmUgaWYgaXQgbmVlZHNcbiAgLy8gdG8gYmUgY29udmVydGVkLiBUaGUgcGlwZWxpbmUgY2FuIGhhdmUgYSBmZXcgZGlmZmVyZW50IGZvcm1zLiBGb3IgbW9yZSBkZXRhaWxzLCBzZWU6XG4gIC8vICAgICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvci9hZ2dyZWdhdGlvbi9cbiAgLy9cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIGFycmF5LCBpdCBtZWFucyB3ZSBhcmUgcHJvYmFibHkgcGFyc2luZyBhbiAnJGFuZCcgb3IgJyRvcicgb3BlcmF0b3IuIEluXG4gIC8vIHRoYXQgY2FzZSB3ZSBuZWVkIHRvIGxvb3AgdGhyb3VnaCBhbGwgb2YgaXQncyBjaGlsZHJlbiB0byBmaW5kIHRoZSBjb2x1bW5zIGJlaW5nIG9wZXJhdGVkIG9uLlxuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gb2JqZWN0LCB0aGVuIHdlJ2xsIGxvb3AgdGhyb3VnaCB0aGUga2V5cyBjaGVja2luZyB0byBzZWUgaWYgdGhlIGtleSBuYW1lXG4gIC8vIG1hdGNoZXMgb25lIG9mIHRoZSBzY2hlbWEgY29sdW1ucy4gSWYgaXQgZG9lcyBtYXRjaCBhIGNvbHVtbiBhbmQgdGhlIGNvbHVtbiBpcyBhIFBvaW50ZXIgb3JcbiAgLy8gYSBEYXRlLCB0aGVuIHdlJ2xsIGNvbnZlcnQgdGhlIHZhbHVlIGFzIGRlc2NyaWJlZCBhYm92ZS5cbiAgLy9cbiAgLy8gQXMgbXVjaCBhcyBJIGhhdGUgcmVjdXJzaW9uLi4udGhpcyBzZWVtZWQgbGlrZSBhIGdvb2QgZml0IGZvciBpdC4gV2UncmUgZXNzZW50aWFsbHkgdHJhdmVyc2luZ1xuICAvLyBkb3duIGEgdHJlZSB0byBmaW5kIGEgXCJsZWFmIG5vZGVcIiBhbmQgY2hlY2tpbmcgdG8gc2VlIGlmIGl0IG5lZWRzIHRvIGJlIGNvbnZlcnRlZC5cbiAgX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgaWYgKHBpcGVsaW5lID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICByZXR1cm4gcGlwZWxpbmUubWFwKHZhbHVlID0+IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwaXBlbGluZVtmaWVsZF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAvLyBQYXNzIG9iamVjdHMgZG93biB0byBNb25nb0RCLi4udGhpcyBpcyBtb3JlIHRoYW4gbGlrZWx5IGFuICRleGlzdHMgb3BlcmF0b3IuXG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBgJHtzY2hlbWEuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc30kJHtwaXBlbGluZVtmaWVsZF19YDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZShwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGQgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBzbGlnaHRseSBkaWZmZXJlbnQgdGhhbiB0aGUgb25lIGFib3ZlLiBSYXRoZXIgdGhhbiB0cnlpbmcgdG8gY29tYmluZSB0aGVzZVxuICAvLyB0d28gZnVuY3Rpb25zIGFuZCBtYWtpbmcgdGhlIGNvZGUgZXZlbiBoYXJkZXIgdG8gdW5kZXJzdGFuZCwgSSBkZWNpZGVkIHRvIHNwbGl0IGl0IHVwLiBUaGVcbiAgLy8gZGlmZmVyZW5jZSB3aXRoIHRoaXMgZnVuY3Rpb24gaXMgd2UgYXJlIG5vdCB0cmFuc2Zvcm1pbmcgdGhlIHZhbHVlcywgb25seSB0aGUga2V5cyBvZiB0aGVcbiAgLy8gcGlwZWxpbmUuXG4gIF9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoZmllbGQgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBzbGlnaHRseSBkaWZmZXJlbnQgdGhhbiB0aGUgdHdvIGFib3ZlLiBNb25nb0RCICRncm91cCBhZ2dyZWdhdGUgbG9va3MgbGlrZTpcbiAgLy8gICAgIHsgJGdyb3VwOiB7IF9pZDogPGV4cHJlc3Npb24+LCA8ZmllbGQxPjogeyA8YWNjdW11bGF0b3IxPiA6IDxleHByZXNzaW9uMT4gfSwgLi4uIH0gfVxuICAvLyBUaGUgPGV4cHJlc3Npb24+IGNvdWxkIGJlIGEgY29sdW1uIG5hbWUsIHByZWZpeGVkIHdpdGggdGhlICckJyBjaGFyYWN0ZXIuIFdlJ2xsIGxvb2sgZm9yXG4gIC8vIHRoZXNlIDxleHByZXNzaW9uPiBhbmQgY2hlY2sgdG8gc2VlIGlmIGl0IGlzIGEgJ1BvaW50ZXInIG9yIGlmIGl0J3Mgb25lIG9mIGNyZWF0ZWRBdCxcbiAgLy8gdXBkYXRlZEF0IG9yIG9iamVjdElkIGFuZCBjaGFuZ2UgaXQgYWNjb3JkaW5nbHkuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICByZXR1cm4gcGlwZWxpbmUubWFwKHZhbHVlID0+IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gcGlwZWxpbmUuc3Vic3RyaW5nKDEpO1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCRfcF8ke2ZpZWxkfWA7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF9jcmVhdGVkX2F0JztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX3VwZGF0ZWRfYXQnO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgYXR0ZW1wdCB0byBjb252ZXJ0IHRoZSBwcm92aWRlZCB2YWx1ZSB0byBhIERhdGUgb2JqZWN0LiBTaW5jZSB0aGlzIGlzIHBhcnRcbiAgLy8gb2YgYW4gYWdncmVnYXRpb24gcGlwZWxpbmUsIHRoZSB2YWx1ZSBjYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGl0IGNhbiBiZSBhbm90aGVyIG9iamVjdCB3aXRoXG4gIC8vIGFuIG9wZXJhdG9yIGluIGl0IChsaWtlICRndCwgJGx0LCBldGMpLiBCZWNhdXNlIG9mIHRoaXMgSSBmZWx0IGl0IHdhcyBlYXNpZXIgdG8gbWFrZSB0aGlzIGFcbiAgLy8gcmVjdXJzaXZlIG1ldGhvZCB0byB0cmF2ZXJzZSBkb3duIHRvIHRoZSBcImxlYWYgbm9kZVwiIHdoaWNoIGlzIGdvaW5nIHRvIGJlIHRoZSBzdHJpbmcuXG4gIF9jb252ZXJ0VG9EYXRlKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiB2YWx1ZSkge1xuICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZSh2YWx1ZVtmaWVsZF0pO1xuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICBfcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZTogP3N0cmluZyk6ID9zdHJpbmcge1xuICAgIGlmIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgcmVhZFByZWZlcmVuY2UgPSByZWFkUHJlZmVyZW5jZS50b1VwcGVyQ2FzZSgpO1xuICAgIH1cbiAgICBzd2l0Y2ggKHJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICBjYXNlICdQUklNQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BSSU1BUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUlknOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlNFQ09OREFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUllfUFJFRkVSUkVEO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ05FQVJFU1QnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLk5FQVJFU1Q7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSB1bmRlZmluZWQ6XG4gICAgICBjYXNlIG51bGw6XG4gICAgICBjYXNlICcnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnTm90IHN1cHBvcnRlZCByZWFkIHByZWZlcmVuY2UuJyk7XG4gICAgfVxuICAgIHJldHVybiByZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjcmVhdGVJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXgsIHsgYmFja2dyb3VuZDogdHJ1ZSB9KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhlcyhpbmRleGVzLCB7IGJhY2tncm91bmQ6IHRydWUgfSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBpZiAodHlwZSAmJiB0eXBlLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgaW5kZXggPSB7XG4gICAgICAgIFtmaWVsZE5hbWVdOiAnMmRzcGhlcmUnLFxuICAgICAgfTtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZUluZGV4KGNsYXNzTmFtZSwgaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogUXVlcnlUeXBlLCBzY2hlbWE6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgICBpZiAoIXF1ZXJ5W2ZpZWxkTmFtZV0gfHwgIXF1ZXJ5W2ZpZWxkTmFtZV0uJHRleHQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleGlzdGluZ0luZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGV4aXN0aW5nSW5kZXhlcykge1xuICAgICAgICBjb25zdCBpbmRleCA9IGV4aXN0aW5nSW5kZXhlc1trZXldO1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGluZGV4LCBmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBpbmRleE5hbWUgPSBgJHtmaWVsZE5hbWV9X3RleHRgO1xuICAgICAgY29uc3QgdGV4dEluZGV4ID0ge1xuICAgICAgICBbaW5kZXhOYW1lXTogeyBbZmllbGROYW1lXTogJ3RleHQnIH0sXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgdGV4dEluZGV4LFxuICAgICAgICBleGlzdGluZ0luZGV4ZXMsXG4gICAgICAgIHNjaGVtYS5maWVsZHNcbiAgICAgICkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gODUpIHtcbiAgICAgICAgICAvLyBJbmRleCBleGlzdCB3aXRoIGRpZmZlcmVudCBvcHRpb25zXG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmluZGV4ZXMoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRyb3BJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZHJvcEluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRyb3BBbGxJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gdGhpcy5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGNsYXNzZXMgPT4ge1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IGNsYXNzZXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc0Zyb21Nb25nbyhzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2VjdGlvbiA9IHRoaXMuY2xpZW50LnN0YXJ0U2Vzc2lvbigpO1xuICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLnN0YXJ0VHJhbnNhY3Rpb24oKTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZWN0aW9uKTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjb21taXQgPSByZXRyaWVzID0+IHtcbiAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvblxuICAgICAgICAuY29tbWl0VHJhbnNhY3Rpb24oKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5oYXNFcnJvckxhYmVsKCdUcmFuc2llbnRUcmFuc2FjdGlvbkVycm9yJykgJiYgcmV0cmllcyA+IDApIHtcbiAgICAgICAgICAgIHJldHVybiBjb21taXQocmV0cmllcyAtIDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmVuZFNlc3Npb24oKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICByZXR1cm4gY29tbWl0KDUpO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmFib3J0VHJhbnNhY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmVuZFNlc3Npb24oKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxJQUFBQSxnQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFB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