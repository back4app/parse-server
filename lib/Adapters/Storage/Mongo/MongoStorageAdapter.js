"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MongoStorageAdapter = void 0;
var _mongodbUrl = require("../../../vendor/mongodbUrl");
var _StorageAdapter = require("../StorageAdapter");
var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));
var _MongoSchemaCollection = _interopRequireDefault(require("./MongoSchemaCollection"));
var _MongoTransform = require("./MongoTransform");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _defaults = _interopRequireWildcard(require("../../../defaults"));
var _logger = _interopRequireDefault(require("../../../logger"));
var _Utils = _interopRequireDefault(require("../../../Utils"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// -disable-next
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
const convertParseSchemaToMongoSchema = ({
  ...schema
}) => {
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
    const {
      type,
      targetClass,
      ...fieldOptions
    } = fields[fieldName];
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
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    this.schemaCacheTtl = mongoOptions.schemaCacheTtl;
    this.disableIndexFieldValidation = !!mongoOptions.disableIndexFieldValidation;
    this._logClientEvents = mongoOptions.logClientEvents;

    // Create a copy of mongoOptions and remove Parse Server-specific options that should not
    // be passed to MongoDB client. Note: We only delete from this._mongoOptions, not from the
    // original mongoOptions object, because other components (like DatabaseController) need
    // access to these options.
    this._mongoOptions = {
      ...mongoOptions
    };
    for (const key of _defaults.ParseServerDatabaseOptions) {
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

      // Set up client event logging if configured
      if (this._logClientEvents && Array.isArray(this._logClientEvents)) {
        this._logClientEvents.forEach(eventConfig => {
          client.on(eventConfig.name, event => {
            let logData = {};
            if (!eventConfig.keys || eventConfig.keys.length === 0) {
              logData = event;
            } else {
              eventConfig.keys.forEach(keyPath => {
                logData[keyPath] = _lodash.default.get(event, keyPath);
              });
            }

            // Validate log level exists, fallback to 'info'
            const logLevel = typeof _logger.default[eventConfig.logLevel] === 'function' ? eventConfig.logLevel : 'info';

            // Safe JSON serialization with Map/Set and circular reference support
            const logMessage = `MongoDB client event ${eventConfig.name}: ${JSON.stringify(logData, _Utils.default.getCircularReplacer())}`;
            _logger.default[logLevel](logMessage);
          });
        });
      }
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
  async handleShutdown() {
    if (!this.client) {
      return;
    }
    await this.client.close(false);
    delete this.connectionPromise;
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
          if (!this.disableIndexFieldValidation && !Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
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
          // Check for authData unique index violations
          if (!err.userInfo) {
            const authDataMatch = error.message.match(/index:\s+(_auth_data_[a-zA-Z0-9_]+_id)/);
            if (authDataMatch) {
              err.userInfo = {
                duplicated_field: authDataMatch[1]
              };
            }
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
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result, schema)).catch(error => {
      if (error.code === 11000) {
        _logger.default.error('Duplicate key error:', error.message);
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.message) {
          const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
          if (!err.userInfo) {
            const authDataMatch = error.message.match(/index:\s+(_auth_data_[a-zA-Z0-9_]+_id)/);
            if (authDataMatch) {
              err.userInfo = {
                duplicated_field: authDataMatch[1]
              };
            }
          }
        }
        throw err;
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
    explain,
    comment
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
      explain,
      comment
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
    const sparseOptions = options.sparse !== undefined ? {
      sparse: options.sparse
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};
    const indexOptions = {
      ...defaultOptions,
      ...caseInsensitiveOptions,
      ...indexNameOptions,
      ...ttlOptions,
      ...sparseOptions
    };
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(indexCreationRequest, indexOptions)).catch(err => this.handleError(err));
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

  // Creates a unique sparse index on _auth_data_<provider>.id to prevent
  // race conditions during concurrent signups with the same authData.
  ensureAuthDataUniqueness(provider) {
    return this._adaptiveCollection('_User').then(collection => collection._mongoCollection.createIndex({
      [`_auth_data_${provider}.id`]: 1
    }, {
      unique: true,
      sparse: true,
      background: true,
      name: `_auth_data_${provider}_id`
    })).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      }
      // Ignore "index already exists with same name" or "index already exists with different options"
      if (error.code === 85 || error.code === 86) {
        return;
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
  count(className, schema, query, readPreference, _estimate, hint, comment) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      comment
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
  aggregate(className, schema, pipeline, readPreference, hint, explain, comment) {
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
      explain,
      comment
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

  /**
   * Recursively converts values to Date objects. Since the passed object is part of an aggregation
   * pipeline and can contain various logic operators (like $gt, $lt, etc), this function will
   * traverse the object and convert any strings that can be parsed as dates into Date objects.
   * @param {any} value The value to convert.
   * @returns {any} The original value if not convertible to Date, or a Date object if it is.
   */
  _convertToDate(value) {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return isNaN(Date.parse(value)) ? value : new Date(value);
    }
    if (typeof value === 'object') {
      const returnValue = {};
      for (const field in value) {
        returnValue[field] = this._convertToDate(value[field]);
      }
      return returnValue;
    }
    return value;
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
var _default = exports.default = MongoStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbW9uZ29kYlVybCIsInJlcXVpcmUiLCJfU3RvcmFnZUFkYXB0ZXIiLCJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9Nb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9sb2dnZXIiLCJfVXRpbHMiLCJlIiwidCIsIldlYWtNYXAiLCJyIiwibiIsIl9fZXNNb2R1bGUiLCJvIiwiaSIsImYiLCJfX3Byb3RvX18iLCJkZWZhdWx0IiwiaGFzIiwiZ2V0Iiwic2V0IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJtb25nb2RiIiwiTW9uZ29DbGllbnQiLCJSZWFkUHJlZmVyZW5jZSIsIk1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUiLCJzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zIiwibW9uZ29BZGFwdGVyIiwiY29ubmVjdCIsInRoZW4iLCJkYXRhYmFzZSIsImNvbGxlY3Rpb25zIiwiZmlsdGVyIiwiY29sbGVjdGlvbiIsIm5hbWVzcGFjZSIsIm1hdGNoIiwiY29sbGVjdGlvbk5hbWUiLCJpbmRleE9mIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hIiwic2NoZW1hIiwiZmllbGRzIiwiX3JwZXJtIiwiX3dwZXJtIiwiY2xhc3NOYW1lIiwiX2hhc2hlZF9wYXNzd29yZCIsIm1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUCIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImluZGV4ZXMiLCJtb25nb09iamVjdCIsIl9pZCIsIm9iamVjdElkIiwidXBkYXRlZEF0IiwiY3JlYXRlZEF0IiwiX21ldGFkYXRhIiwidW5kZWZpbmVkIiwiZmllbGROYW1lIiwidHlwZSIsInRhcmdldENsYXNzIiwiZmllbGRPcHRpb25zIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwicGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlIiwia2V5cyIsImxlbmd0aCIsImZpZWxkc19vcHRpb25zIiwiY2xhc3NfcGVybWlzc2lvbnMiLCJ2YWxpZGF0ZUV4cGxhaW5WYWx1ZSIsImV4cGxhaW4iLCJleHBsYWluQWxsb3dlZFZhbHVlcyIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJ1cmkiLCJkZWZhdWx0cyIsIkRlZmF1bHRNb25nb1VSSSIsImNvbGxlY3Rpb25QcmVmaXgiLCJtb25nb09wdGlvbnMiLCJfdXJpIiwiX29uY2hhbmdlIiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJlbmFibGVTY2hlbWFIb29rcyIsInNjaGVtYUNhY2hlVHRsIiwiZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uIiwiX2xvZ0NsaWVudEV2ZW50cyIsImxvZ0NsaWVudEV2ZW50cyIsIl9tb25nb09wdGlvbnMiLCJrZXkiLCJQYXJzZVNlcnZlckRhdGFiYXNlT3B0aW9ucyIsIndhdGNoIiwiY2FsbGJhY2siLCJjb25uZWN0aW9uUHJvbWlzZSIsImVuY29kZWRVcmkiLCJmb3JtYXRVcmwiLCJwYXJzZVVybCIsImNsaWVudCIsIm9wdGlvbnMiLCJzIiwiZGIiLCJkYk5hbWUiLCJvbiIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJldmVudENvbmZpZyIsIm5hbWUiLCJldmVudCIsImxvZ0RhdGEiLCJrZXlQYXRoIiwiXyIsImxvZ0xldmVsIiwibG9nZ2VyIiwibG9nTWVzc2FnZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJVdGlscyIsImdldENpcmN1bGFyUmVwbGFjZXIiLCJjYXRjaCIsImVyciIsIlByb21pc2UiLCJyZWplY3QiLCJoYW5kbGVFcnJvciIsImVycm9yIiwiY29kZSIsImhhbmRsZVNodXRkb3duIiwiY2xvc2UiLCJfYWRhcHRpdmVDb2xsZWN0aW9uIiwicmF3Q29sbGVjdGlvbiIsIk1vbmdvQ29sbGVjdGlvbiIsIl9zY2hlbWFDb2xsZWN0aW9uIiwiX3N0cmVhbSIsIl9tb25nb0NvbGxlY3Rpb24iLCJjbGFzc0V4aXN0cyIsImxpc3RDb2xsZWN0aW9ucyIsInRvQXJyYXkiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2NoZW1hQ29sbGVjdGlvbiIsInVwZGF0ZVNjaGVtYSIsIiRzZXQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJyZXNvbHZlIiwiX2lkXyIsImRlbGV0ZVByb21pc2VzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiZmllbGQiLCJfX29wIiwicHJvbWlzZSIsImRyb3BJbmRleCIsInB1c2giLCJwcm90b3R5cGUiLCJyZXBsYWNlIiwiaW5zZXJ0UHJvbWlzZSIsImNyZWF0ZUluZGV4ZXMiLCJhbGwiLCJzZXRJbmRleGVzRnJvbU1vbmdvIiwiZ2V0SW5kZXhlcyIsInJlZHVjZSIsIm9iaiIsImluZGV4IiwiX2Z0cyIsIl9mdHN4Iiwid2VpZ2h0cyIsImNyZWF0ZUNsYXNzIiwiaW5zZXJ0U2NoZW1hIiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImRlbGV0ZUNsYXNzIiwiZHJvcCIsIm1lc3NhZ2UiLCJmaW5kQW5kRGVsZXRlU2NoZW1hIiwiZGVsZXRlQWxsQ2xhc3NlcyIsImZhc3QiLCJtYXAiLCJkZWxldGVNYW55IiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsIm1vbmdvRm9ybWF0TmFtZXMiLCJjb2xsZWN0aW9uVXBkYXRlIiwiJHVuc2V0IiwiY29sbGVjdGlvbkZpbHRlciIsIiRvciIsIiRleGlzdHMiLCJzY2hlbWFVcGRhdGUiLCJ1cGRhdGVNYW55IiwiZ2V0QWxsQ2xhc3NlcyIsInNjaGVtYXNDb2xsZWN0aW9uIiwiX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BIiwiZ2V0Q2xhc3MiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlIiwiaW5zZXJ0T25lIiwib3BzIiwiRFVQTElDQVRFX1ZBTFVFIiwidW5kZXJseWluZ0Vycm9yIiwibWF0Y2hlcyIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImF1dGhEYXRhTWF0Y2giLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInF1ZXJ5IiwibW9uZ29XaGVyZSIsInRyYW5zZm9ybVdoZXJlIiwiZGVsZXRlZENvdW50IiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwicmV0dXJuRG9jdW1lbnQiLCJzZXNzaW9uIiwicmVzdWx0IiwibW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0IiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJjb21tZW50IiwibW9uZ29Tb3J0IiwibWFwS2V5cyIsInZhbHVlIiwidHJhbnNmb3JtS2V5IiwibW9uZ29LZXlzIiwibWVtbyIsIl9wYXJzZVJlYWRQcmVmZXJlbmNlIiwiY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZCIsIm9iamVjdHMiLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsImluZGV4Q3JlYXRpb25SZXF1ZXN0IiwibW9uZ29GaWVsZE5hbWVzIiwiaW5kZXhUeXBlIiwiZGVmYXVsdE9wdGlvbnMiLCJiYWNrZ3JvdW5kIiwic3BhcnNlIiwiaW5kZXhOYW1lT3B0aW9ucyIsInR0bE9wdGlvbnMiLCJ0dGwiLCJleHBpcmVBZnRlclNlY29uZHMiLCJzcGFyc2VPcHRpb25zIiwiY2FzZUluc2Vuc2l0aXZlT3B0aW9ucyIsImNvbGxhdGlvbiIsImNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbiIsImluZGV4T3B0aW9ucyIsImNyZWF0ZUluZGV4IiwiZW5zdXJlVW5pcXVlbmVzcyIsIl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZCIsImVuc3VyZUF1dGhEYXRhVW5pcXVlbmVzcyIsInByb3ZpZGVyIiwidW5pcXVlIiwiX3Jhd0ZpbmQiLCJjb3VudCIsIl9lc3RpbWF0ZSIsImRpc3RpbmN0IiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1GaWVsZCIsInRyYW5zZm9ybVBvaW50ZXJTdHJpbmciLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsInN0YWdlIiwiJGdyb3VwIiwiX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzIiwiJG1hdGNoIiwiX3BhcnNlQWdncmVnYXRlQXJncyIsIiRwcm9qZWN0IiwiX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3MiLCIkZ2VvTmVhciIsInJlc3VsdHMiLCJzcGxpdCIsImlzRW1wdHkiLCJyZXR1cm5WYWx1ZSIsIl9jb252ZXJ0VG9EYXRlIiwic3Vic3RyaW5nIiwiRGF0ZSIsImlzTmFOIiwicGFyc2UiLCJ0b1VwcGVyQ2FzZSIsIlBSSU1BUlkiLCJQUklNQVJZX1BSRUZFUlJFRCIsIlNFQ09OREFSWSIsIlNFQ09OREFSWV9QUkVGRVJSRUQiLCJORUFSRVNUIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiJHRleHQiLCJ0ZXh0SW5kZXgiLCJkcm9wQWxsSW5kZXhlcyIsImRyb3BJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJjbGFzc2VzIiwicHJvbWlzZXMiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZWN0aW9uIiwic3RhcnRTZXNzaW9uIiwic3RhcnRUcmFuc2FjdGlvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0IiwicmV0cmllcyIsImNvbW1pdFRyYW5zYWN0aW9uIiwiaGFzRXJyb3JMYWJlbCIsImVuZFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbiIsImV4cG9ydHMiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmltcG9ydCB7IGZvcm1hdCBhcyBmb3JtYXRVcmwsIHBhcnNlIGFzIHBhcnNlVXJsIH0gZnJvbSAnLi4vLi4vLi4vdmVuZG9yL21vbmdvZGJVcmwnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIFF1ZXJ5VHlwZSwgU2NoZW1hVHlwZSwgU3RvcmFnZUNsYXNzIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHtcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIHRyYW5zZm9ybUtleSxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1XaGVyZSxcbn0gZnJvbSAnLi9Nb25nb1RyYW5zZm9ybSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBkZWZhdWx0cywgeyBQYXJzZVNlcnZlckRhdGFiYXNlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2RlZmF1bHRzJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vLi4vLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi8uLi8uLi9VdGlscyc7XG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgbW9uZ29kYiA9IHJlcXVpcmUoJ21vbmdvZGInKTtcbmNvbnN0IE1vbmdvQ2xpZW50ID0gbW9uZ29kYi5Nb25nb0NsaWVudDtcbmNvbnN0IFJlYWRQcmVmZXJlbmNlID0gbW9uZ29kYi5SZWFkUHJlZmVyZW5jZTtcblxuY29uc3QgTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSA9ICdfU0NIRU1BJztcblxuY29uc3Qgc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyA9IG1vbmdvQWRhcHRlciA9PiB7XG4gIHJldHVybiBtb25nb0FkYXB0ZXJcbiAgICAuY29ubmVjdCgpXG4gICAgLnRoZW4oKCkgPT4gbW9uZ29BZGFwdGVyLmRhdGFiYXNlLmNvbGxlY3Rpb25zKCkpXG4gICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgcmV0dXJuIGNvbGxlY3Rpb25zLmZpbHRlcihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKGNvbGxlY3Rpb24ubmFtZXNwYWNlLm1hdGNoKC9cXC5zeXN0ZW1cXC4vKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPOiBJZiB5b3UgaGF2ZSBvbmUgYXBwIHdpdGggYSBjb2xsZWN0aW9uIHByZWZpeCB0aGF0IGhhcHBlbnMgdG8gYmUgYSBwcmVmaXggb2YgYW5vdGhlclxuICAgICAgICAvLyBhcHBzIHByZWZpeCwgdGhpcyB3aWxsIGdvIHZlcnkgdmVyeSBiYWRseS4gV2Ugc2hvdWxkIGZpeCB0aGF0IHNvbWVob3cuXG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uLmNvbGxlY3Rpb25OYW1lLmluZGV4T2YobW9uZ29BZGFwdGVyLl9jb2xsZWN0aW9uUHJlZml4KSA9PSAwO1xuICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hID0gKHsgLi4uc2NoZW1hIH0pID0+IHtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAvLyBMZWdhY3kgbW9uZ28gYWRhcHRlciBrbm93cyBhYm91dCB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHBhc3N3b3JkIGFuZCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIEZ1dHVyZSBkYXRhYmFzZSBhZGFwdGVycyB3aWxsIG9ubHkga25vdyBhYm91dCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIE5vdGU6IFBhcnNlIFNlcnZlciB3aWxsIGJyaW5nIGJhY2sgcGFzc3dvcmQgd2l0aCBpbmplY3REZWZhdWx0U2NoZW1hLCBzbyB3ZSBkb24ndCBuZWVkXG4gICAgLy8gdG8gYWRkIF9oYXNoZWRfcGFzc3dvcmQgYmFjayBldmVyLlxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuLy8gUmV0dXJucyB7IGNvZGUsIGVycm9yIH0gaWYgaW52YWxpZCwgb3IgeyByZXN1bHQgfSwgYW4gb2JqZWN0XG4vLyBzdWl0YWJsZSBmb3IgaW5zZXJ0aW5nIGludG8gX1NDSEVNQSBjb2xsZWN0aW9uLCBvdGhlcndpc2UuXG5jb25zdCBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAgPSAoXG4gIGZpZWxkcyxcbiAgY2xhc3NOYW1lLFxuICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIGluZGV4ZXNcbikgPT4ge1xuICBjb25zdCBtb25nb09iamVjdCA9IHtcbiAgICBfaWQ6IGNsYXNzTmFtZSxcbiAgICBvYmplY3RJZDogJ3N0cmluZycsXG4gICAgdXBkYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBjcmVhdGVkQXQ6ICdzdHJpbmcnLFxuICAgIF9tZXRhZGF0YTogdW5kZWZpbmVkLFxuICB9O1xuXG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgbW9uZ29PYmplY3RbZmllbGROYW1lXSA9IE1vbmdvU2NoZW1hQ29sbGVjdGlvbi5wYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgdHlwZSxcbiAgICAgIHRhcmdldENsYXNzLFxuICAgIH0pO1xuICAgIGlmIChmaWVsZE9wdGlvbnMgJiYgT2JqZWN0LmtleXMoZmllbGRPcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgPSBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgfHwge307XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkT3B0aW9ucztcbiAgICB9XG4gIH1cblxuICBpZiAodHlwZW9mIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgaWYgKCFjbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICB9XG4gIH1cblxuICBpZiAoaW5kZXhlcyAmJiB0eXBlb2YgaW5kZXhlcyA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoID4gMCkge1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cblxuICBpZiAoIW1vbmdvT2JqZWN0Ll9tZXRhZGF0YSkge1xuICAgIC8vIGNsZWFudXAgdGhlIHVudXNlZCBfbWV0YWRhdGFcbiAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhO1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvT2JqZWN0O1xufTtcblxuZnVuY3Rpb24gdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbikge1xuICBpZiAoZXhwbGFpbikge1xuICAgIC8vIFRoZSBsaXN0IG9mIGFsbG93ZWQgZXhwbGFpbiB2YWx1ZXMgaXMgZnJvbSBub2RlLW1vbmdvZGItbmF0aXZlL2xpYi9leHBsYWluLmpzXG4gICAgY29uc3QgZXhwbGFpbkFsbG93ZWRWYWx1ZXMgPSBbXG4gICAgICAncXVlcnlQbGFubmVyJyxcbiAgICAgICdxdWVyeVBsYW5uZXJFeHRlbmRlZCcsXG4gICAgICAnZXhlY3V0aW9uU3RhdHMnLFxuICAgICAgJ2FsbFBsYW5zRXhlY3V0aW9uJyxcbiAgICAgIGZhbHNlLFxuICAgICAgdHJ1ZSxcbiAgICBdO1xuICAgIGlmICghZXhwbGFpbkFsbG93ZWRWYWx1ZXMuaW5jbHVkZXMoZXhwbGFpbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnSW52YWxpZCB2YWx1ZSBmb3IgZXhwbGFpbicpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTW9uZ29TdG9yYWdlQWRhcHRlciBpbXBsZW1lbnRzIFN0b3JhZ2VBZGFwdGVyIHtcbiAgLy8gUHJpdmF0ZVxuICBfdXJpOiBzdHJpbmc7XG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9tb25nb09wdGlvbnM6IE9iamVjdDtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9zdHJlYW06IGFueTtcbiAgX2xvZ0NsaWVudEV2ZW50czogP0FycmF5PGFueT47XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuICBkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb246IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmkgPSBkZWZhdWx0cy5EZWZhdWx0TW9uZ29VUkksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgbW9uZ29PcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fdXJpID0gdXJpO1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG5cbiAgICAvLyBNYXhUaW1lTVMgaXMgbm90IGEgZ2xvYmFsIE1vbmdvREIgY2xpZW50IG9wdGlvbiwgaXQgaXMgYXBwbGllZCBwZXIgb3BlcmF0aW9uLlxuICAgIHRoaXMuX21heFRpbWVNUyA9IG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gdHJ1ZTtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IG1vbmdvT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICB0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiA9ICEhbW9uZ29PcHRpb25zLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjtcbiAgICB0aGlzLl9sb2dDbGllbnRFdmVudHMgPSBtb25nb09wdGlvbnMubG9nQ2xpZW50RXZlbnRzO1xuXG4gICAgLy8gQ3JlYXRlIGEgY29weSBvZiBtb25nb09wdGlvbnMgYW5kIHJlbW92ZSBQYXJzZSBTZXJ2ZXItc3BlY2lmaWMgb3B0aW9ucyB0aGF0IHNob3VsZCBub3RcbiAgICAvLyBiZSBwYXNzZWQgdG8gTW9uZ29EQiBjbGllbnQuIE5vdGU6IFdlIG9ubHkgZGVsZXRlIGZyb20gdGhpcy5fbW9uZ29PcHRpb25zLCBub3QgZnJvbSB0aGVcbiAgICAvLyBvcmlnaW5hbCBtb25nb09wdGlvbnMgb2JqZWN0LCBiZWNhdXNlIG90aGVyIGNvbXBvbmVudHMgKGxpa2UgRGF0YWJhc2VDb250cm9sbGVyKSBuZWVkXG4gICAgLy8gYWNjZXNzIHRvIHRoZXNlIG9wdGlvbnMuXG4gICAgdGhpcy5fbW9uZ29PcHRpb25zID0geyAuLi5tb25nb09wdGlvbnMgfTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBQYXJzZVNlcnZlckRhdGFiYXNlT3B0aW9ucykge1xuICAgICAgZGVsZXRlIHRoaXMuX21vbmdvT3B0aW9uc1trZXldO1xuICAgIH1cbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuICAgIHRoaXMuY29ubmVjdGlvblByb21pc2UgPSBNb25nb0NsaWVudC5jb25uZWN0KGVuY29kZWRVcmksIHRoaXMuX21vbmdvT3B0aW9ucylcbiAgICAgIC50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIC8vIFN0YXJ0aW5nIG1vbmdvREIgMy4wLCB0aGUgTW9uZ29DbGllbnQuY29ubmVjdCBkb24ndCByZXR1cm4gYSBEQiBhbnltb3JlIGJ1dCBhIGNsaWVudFxuICAgICAgICAvLyBGb3J0dW5hdGVseSwgd2UgY2FuIGdldCBiYWNrIHRoZSBvcHRpb25zIGFuZCB1c2UgdGhlbSB0byBzZWxlY3QgdGhlIHByb3BlciBEQi5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vbmdvZGIvbm9kZS1tb25nb2RiLW5hdGl2ZS9ibG9iLzJjMzVkNzZmMDg1NzQyMjViOGRiMDJkN2JlZjY4NzEyM2U2YmIwMTgvbGliL21vbmdvX2NsaWVudC5qcyNMODg1XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjbGllbnQucy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkYXRhYmFzZSA9IGNsaWVudC5kYihvcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIGlmICghZGF0YWJhc2UpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2xpZW50Lm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNsaWVudC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFNldCB1cCBjbGllbnQgZXZlbnQgbG9nZ2luZyBpZiBjb25maWd1cmVkXG4gICAgICAgIGlmICh0aGlzLl9sb2dDbGllbnRFdmVudHMgJiYgQXJyYXkuaXNBcnJheSh0aGlzLl9sb2dDbGllbnRFdmVudHMpKSB7XG4gICAgICAgICAgdGhpcy5fbG9nQ2xpZW50RXZlbnRzLmZvckVhY2goZXZlbnRDb25maWcgPT4ge1xuICAgICAgICAgICAgY2xpZW50Lm9uKGV2ZW50Q29uZmlnLm5hbWUsIGV2ZW50ID0+IHtcbiAgICAgICAgICAgICAgbGV0IGxvZ0RhdGEgPSB7fTtcbiAgICAgICAgICAgICAgaWYgKCFldmVudENvbmZpZy5rZXlzIHx8IGV2ZW50Q29uZmlnLmtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgbG9nRGF0YSA9IGV2ZW50O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGV2ZW50Q29uZmlnLmtleXMuZm9yRWFjaChrZXlQYXRoID0+IHtcbiAgICAgICAgICAgICAgICAgIGxvZ0RhdGFba2V5UGF0aF0gPSBfLmdldChldmVudCwga2V5UGF0aCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSBsb2cgbGV2ZWwgZXhpc3RzLCBmYWxsYmFjayB0byAnaW5mbydcbiAgICAgICAgICAgICAgY29uc3QgbG9nTGV2ZWwgPSB0eXBlb2YgbG9nZ2VyW2V2ZW50Q29uZmlnLmxvZ0xldmVsXSA9PT0gJ2Z1bmN0aW9uJyA/IGV2ZW50Q29uZmlnLmxvZ0xldmVsIDogJ2luZm8nO1xuXG4gICAgICAgICAgICAgIC8vIFNhZmUgSlNPTiBzZXJpYWxpemF0aW9uIHdpdGggTWFwL1NldCBhbmQgY2lyY3VsYXIgcmVmZXJlbmNlIHN1cHBvcnRcbiAgICAgICAgICAgICAgY29uc3QgbG9nTWVzc2FnZSA9IGBNb25nb0RCIGNsaWVudCBldmVudCAke2V2ZW50Q29uZmlnLm5hbWV9OiAke0pTT04uc3RyaW5naWZ5KGxvZ0RhdGEsIFV0aWxzLmdldENpcmN1bGFyUmVwbGFjZXIoKSl9YDtcblxuICAgICAgICAgICAgICBsb2dnZXJbbG9nTGV2ZWxdKGxvZ01lc3NhZ2UpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICAgICAgdGhpcy5kYXRhYmFzZSA9IGRhdGFiYXNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG4gICAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICB9XG5cbiAgaGFuZGxlRXJyb3I8VD4oZXJyb3I6ID8oRXJyb3IgfCBQYXJzZS5FcnJvcikpOiBQcm9taXNlPFQ+IHtcbiAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gMTMpIHtcbiAgICAgIC8vIFVuYXV0aG9yaXplZCBlcnJvclxuICAgICAgZGVsZXRlIHRoaXMuY2xpZW50O1xuICAgICAgZGVsZXRlIHRoaXMuZGF0YWJhc2U7XG4gICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgIGxvZ2dlci5lcnJvcignUmVjZWl2ZWQgdW5hdXRob3JpemVkIGVycm9yJywgeyBlcnJvcjogZXJyb3IgfSk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmNsaWVudC5jbG9zZShmYWxzZSk7XG4gICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBfYWRhcHRpdmVDb2xsZWN0aW9uKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5kYXRhYmFzZS5jb2xsZWN0aW9uKHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lKSlcbiAgICAgIC50aGVuKHJhd0NvbGxlY3Rpb24gPT4gbmV3IE1vbmdvQ29sbGVjdGlvbihyYXdDb2xsZWN0aW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIF9zY2hlbWFDb2xsZWN0aW9uKCk6IFByb21pc2U8TW9uZ29TY2hlbWFDb2xsZWN0aW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgICAgIHRoaXMuX3N0cmVhbSA9IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi53YXRjaCgpO1xuICAgICAgICAgIHRoaXMuX3N0cmVhbS5vbignY2hhbmdlJywgKCkgPT4gdGhpcy5fb25jaGFuZ2UoKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNb25nb1NjaGVtYUNvbGxlY3Rpb24oY29sbGVjdGlvbik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5saXN0Q29sbGVjdGlvbnMoeyBuYW1lOiB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSB9KS50b0FycmF5KCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbnMubGVuZ3RoID4gMDtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zJzogQ0xQcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuZHJvcEluZGV4KGNsYXNzTmFtZSwgbmFtZSk7XG4gICAgICAgIGRlbGV0ZVByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiAmJlxuICAgICAgICAgICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChcbiAgICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAgICBrZXkuaW5kZXhPZignX3BfJykgPT09IDAgPyBrZXkucmVwbGFjZSgnX3BfJywgJycpIDoga2V5XG4gICAgICAgICAgICApXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgbGV0IGluc2VydFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGluc2VydFByb21pc2UgPSB0aGlzLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoZGVsZXRlUHJvbWlzZXMpXG4gICAgICAudGhlbigoKSA9PiBpbnNlcnRQcm9taXNlKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGV4aXN0aW5nSW5kZXhlcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldEluZGV4ZXMoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oaW5kZXhlcyA9PiB7XG4gICAgICAgIGluZGV4ZXMgPSBpbmRleGVzLnJlZHVjZSgob2JqLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChpbmRleC5rZXkuX2Z0cykge1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzO1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzeDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gaW5kZXgud2VpZ2h0cykge1xuICAgICAgICAgICAgICBpbmRleC5rZXlbZmllbGRdID0gJ3RleHQnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmpbaW5kZXgubmFtZV0gPSBpbmRleC5rZXk7XG4gICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgfSwge30pO1xuICAgICAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBpbmRleGVzIH0sXG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIC8vIElnbm9yZSBpZiBjb2xsZWN0aW9uIG5vdCBmb3VuZFxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAoXG4gICAgICBzY2hlbWEuZmllbGRzLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgIHNjaGVtYS5pbmRleGVzXG4gICAgKTtcbiAgICBtb25nb09iamVjdC5faWQgPSBjbGFzc05hbWU7XG4gICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uaW5zZXJ0U2NoZW1hKG1vbmdvT2JqZWN0KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGNvbnN0IHNjaGVtYUNvbGxlY3Rpb24gPSBhd2FpdCB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCk7XG4gICAgYXdhaXQgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICB9XG5cbiAgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5kcm9wKCkpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gJ25zIG5vdCBmb3VuZCcgbWVhbnMgY29sbGVjdGlvbiB3YXMgYWxyZWFkeSBnb25lLiBJZ25vcmUgZGVsZXRpb24gYXR0ZW1wdC5cbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSA9PSAnbnMgbm90IGZvdW5kJykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLy8gV2UndmUgZHJvcHBlZCB0aGUgY29sbGVjdGlvbiwgbm93IHJlbW92ZSB0aGUgX1NDSEVNQSBkb2N1bWVudFxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5maW5kQW5kRGVsZXRlU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICk7XG4gIH1cblxuICBkZWxldGVBbGxDbGFzc2VzKGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyh0aGlzKS50aGVuKGNvbGxlY3Rpb25zID0+XG4gICAgICBQcm9taXNlLmFsbChcbiAgICAgICAgY29sbGVjdGlvbnMubWFwKGNvbGxlY3Rpb24gPT4gKGZhc3QgPyBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkoe30pIDogY29sbGVjdGlvbi5kcm9wKCkpKVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBQb2ludGVyIGZpZWxkIG5hbWVzIGFyZSBwYXNzZWQgZm9yIGxlZ2FjeSByZWFzb25zOiB0aGUgb3JpZ2luYWwgbW9uZ29cbiAgLy8gZm9ybWF0IHN0b3JlZCBwb2ludGVyIGZpZWxkIG5hbWVzIGRpZmZlcmVudGx5IGluIHRoZSBkYXRhYmFzZSwgYW5kIHRoZXJlZm9yZVxuICAvLyBuZWVkZWQgdG8ga25vdyB0aGUgdHlwZSBvZiB0aGUgZmllbGQgYmVmb3JlIGl0IGNvdWxkIGRlbGV0ZSBpdC4gRnV0dXJlIGRhdGFiYXNlXG4gIC8vIGFkYXB0ZXJzIHNob3VsZCBpZ25vcmUgdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGFyZ3VtZW50LiBBbGwgdGhlIGZpZWxkIG5hbWVzIGFyZSBpblxuICAvLyBmaWVsZE5hbWVzLCB0aGV5IHNob3cgdXAgYWRkaXRpb25hbGx5IGluIHRoZSBwb2ludGVyRmllbGROYW1lcyBkYXRhYmFzZSBmb3IgdXNlXG4gIC8vIGJ5IHRoZSBtb25nbyBhZGFwdGVyLCB3aGljaCBkZWFscyB3aXRoIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IG1vbmdvRm9ybWF0TmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGBfcF8ke2ZpZWxkTmFtZX1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBjb2xsZWN0aW9uVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvblVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sbGVjdGlvbkZpbHRlciA9IHsgJG9yOiBbXSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25GaWx0ZXJbJyRvciddLnB1c2goeyBbbmFtZV06IHsgJGV4aXN0czogdHJ1ZSB9IH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc2NoZW1hVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgZmllbGROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtuYW1lfWBdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkoY29sbGVjdGlvbkZpbHRlciwgY29sbGVjdGlvblVwZGF0ZSkpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwgc2NoZW1hVXBkYXRlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBnZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8U3RvcmFnZUNsYXNzW10+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3M+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVE9ETzogQXMgeWV0IG5vdCBwYXJ0aWN1bGFybHkgd2VsbCBzcGVjaWZpZWQuIENyZWF0ZXMgYW4gb2JqZWN0LiBNYXliZSBzaG91bGRuJ3QgZXZlbiBuZWVkIHRoZSBzY2hlbWEsXG4gIC8vIGFuZCBzaG91bGQgaW5mZXIgZnJvbSB0aGUgdHlwZS4gT3IgbWF5YmUgZG9lcyBuZWVkIHRoZSBzY2hlbWEgZm9yIHZhbGlkYXRpb25zLiBPciBtYXliZSBuZWVkc1xuICAvLyB0aGUgc2NoZW1hIG9ubHkgZm9yIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LiBXZSdsbCBmaWd1cmUgdGhhdCBvdXQgbGF0ZXIuXG4gIGNyZWF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBvYmplY3Q6IGFueSwgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnkpIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uaW5zZXJ0T25lKG1vbmdvT2JqZWN0LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFttb25nb09iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvLyBEdXBsaWNhdGUgdmFsdWVcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLm1lc3NhZ2UubWF0Y2goL2luZGV4OltcXHNhLXpBLVowLTlfXFwtXFwuXStcXCQ/KFthLXpBLVpfLV0rKV8xLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGF1dGhEYXRhIHVuaXF1ZSBpbmRleCB2aW9sYXRpb25zXG4gICAgICAgICAgICBpZiAoIWVyci51c2VySW5mbykge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZXJyb3IubWVzc2FnZS5tYXRjaCgvaW5kZXg6XFxzKyhfYXV0aF9kYXRhX1thLXpBLVowLTlfXStfaWQpLyk7XG4gICAgICAgICAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBhdXRoRGF0YU1hdGNoWzFdIH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5kZWxldGVNYW55KG1vbmdvV2hlcmUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC50aGVuKFxuICAgICAgICAoeyBkZWxldGVkQ291bnQgfSkgPT4ge1xuICAgICAgICAgIGlmIChkZWxldGVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9LFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0RhdGFiYXNlIGFkYXB0ZXIgZXJyb3InKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmRzIGFuZCB1cGRhdGVzIGFuIG9iamVjdCBiYXNlZCBvbiBxdWVyeS5cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZFVwZGF0ZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwge1xuICAgICAgICAgIHJldHVybkRvY3VtZW50OiAnYWZ0ZXInLFxuICAgICAgICAgIHNlc3Npb246IHRyYW5zYWN0aW9uYWxTZXNzaW9uIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCByZXN1bHQsIHNjaGVtYSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0R1cGxpY2F0ZSBrZXkgZXJyb3I6JywgZXJyb3IubWVzc2FnZSk7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5tZXNzYWdlLm1hdGNoKFxuICAgICAgICAgICAgICAvaW5kZXg6W1xcc2EtekEtWjAtOV9cXC1cXC5dK1xcJD8oW2EtekEtWl8tXSspXzEvXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZXJyLnVzZXJJbmZvKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBlcnJvci5tZXNzYWdlLm1hdGNoKC9pbmRleDpcXHMrKF9hdXRoX2RhdGFfW2EtekEtWjAtOV9dK19pZCkvKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IGF1dGhEYXRhTWF0Y2hbMV0gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5IHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwc2VydE9uZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBmaW5kLiBBY2NlcHRzOiBjbGFzc05hbWUsIHF1ZXJ5IGluIFBhcnNlIGZvcm1hdCwgYW5kIHsgc2tpcCwgbGltaXQsIHNvcnQgfS5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBzb3J0LFxuICAgICAga2V5cyxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgICBjb21tZW50LFxuICAgIH06IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1NvcnQgPSBfLm1hcEtleXMoc29ydCwgKHZhbHVlLCBmaWVsZE5hbWUpID0+XG4gICAgICB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSlcbiAgICApO1xuICAgIGNvbnN0IG1vbmdvS2V5cyA9IF8ucmVkdWNlKFxuICAgICAga2V5cyxcbiAgICAgIChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vWydfcnBlcm0nXSA9IDE7XG4gICAgICAgICAgbWVtb1snX3dwZXJtJ10gPSAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1lbW9bdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwga2V5LCBzY2hlbWEpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LFxuICAgICAge31cbiAgICApO1xuXG4gICAgLy8gSWYgd2UgYXJlbid0IHJlcXVlc3RpbmcgdGhlIGBfaWRgIGZpZWxkLCB3ZSBuZWVkIHRvIGV4cGxpY2l0bHkgb3B0IG91dFxuICAgIC8vIG9mIGl0LiBEb2luZyBzbyBpbiBwYXJzZS1zZXJ2ZXIgaXMgdW51c3VhbCwgYnV0IGl0IGNhbiBhbGxvdyB1cyB0b1xuICAgIC8vIG9wdGltaXplIHNvbWUgcXVlcmllcyB3aXRoIGNvdmVyaW5nIGluZGV4ZXMuXG4gICAgaWYgKGtleXMgJiYgIW1vbmdvS2V5cy5faWQpIHtcbiAgICAgIG1vbmdvS2V5cy5faWQgPSAwO1xuICAgIH1cblxuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKG1vbmdvV2hlcmUsIHtcbiAgICAgICAgICBza2lwLFxuICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgIHNvcnQ6IG1vbmdvU29ydCxcbiAgICAgICAgICBrZXlzOiBtb25nb0tleXMsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICBjb21tZW50LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSBvcHRpb25zLmluZGV4VHlwZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5pbmRleFR5cGUgOiAxO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnM6IE9iamVjdCA9IHsgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH07XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID0gaW5kZXhOYW1lID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHt9O1xuICAgIGNvbnN0IHR0bE9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyB7IGV4cGlyZUFmdGVyU2Vjb25kczogb3B0aW9ucy50dGwgfSA6IHt9O1xuICAgIGNvbnN0IHNwYXJzZU9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMuc3BhcnNlICE9PSB1bmRlZmluZWQgPyB7IHNwYXJzZTogb3B0aW9ucy5zcGFyc2UgfSA6IHt9O1xuICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZU9wdGlvbnM6IE9iamVjdCA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyB7IGNvbGxhdGlvbjogTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIH1cbiAgICAgIDoge307XG4gICAgY29uc3QgaW5kZXhPcHRpb25zOiBPYmplY3QgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLmNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMsXG4gICAgICAuLi5pbmRleE5hbWVPcHRpb25zLFxuICAgICAgLi4udHRsT3B0aW9ucyxcbiAgICAgIC4uLnNwYXJzZU9wdGlvbnMsXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXhDcmVhdGlvblJlcXVlc3QsIGluZGV4T3B0aW9ucylcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpbmRleENyZWF0aW9uUmVxdWVzdCA9IHt9O1xuICAgIGNvbnN0IG1vbmdvRmllbGROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSkpO1xuICAgIG1vbmdvRmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpbmRleENyZWF0aW9uUmVxdWVzdFtmaWVsZE5hbWVdID0gMTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQoaW5kZXhDcmVhdGlvblJlcXVlc3QpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ1RyaWVkIHRvIGVuc3VyZSBmaWVsZCB1bmlxdWVuZXNzIGZvciBhIGNsYXNzIHRoYXQgYWxyZWFkeSBoYXMgZHVwbGljYXRlcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBDcmVhdGVzIGEgdW5pcXVlIHNwYXJzZSBpbmRleCBvbiBfYXV0aF9kYXRhXzxwcm92aWRlcj4uaWQgdG8gcHJldmVudFxuICAvLyByYWNlIGNvbmRpdGlvbnMgZHVyaW5nIGNvbmN1cnJlbnQgc2lnbnVwcyB3aXRoIHRoZSBzYW1lIGF1dGhEYXRhLlxuICBlbnN1cmVBdXRoRGF0YVVuaXF1ZW5lc3MocHJvdmlkZXI6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oJ19Vc2VyJylcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KFxuICAgICAgICAgIHsgW2BfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9LmlkYF06IDEgfSxcbiAgICAgICAgICB7IHVuaXF1ZTogdHJ1ZSwgc3BhcnNlOiB0cnVlLCBiYWNrZ3JvdW5kOiB0cnVlLCBuYW1lOiBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfV9pZGAgfVxuICAgICAgICApXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIElnbm9yZSBcImluZGV4IGFscmVhZHkgZXhpc3RzIHdpdGggc2FtZSBuYW1lXCIgb3IgXCJpbmRleCBhbHJlYWR5IGV4aXN0cyB3aXRoIGRpZmZlcmVudCBvcHRpb25zXCJcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDg1IHx8IGVycm9yLmNvZGUgPT09IDg2KSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBfZXN0aW1hdGU6ID9ib29sZWFuLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBjb21tZW50OiA/c3RyaW5nXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmNvdW50KHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSwgdHJ1ZSksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHRyYW5zZm9ybUZpZWxkID0gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QodHJhbnNmb3JtRmllbGQsIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSkpXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgb2JqZWN0cyA9IG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhbixcbiAgICBjb21tZW50OiA/c3RyaW5nXG4gICkge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIGxldCBpc1BvaW50ZXJGaWVsZCA9IGZhbHNlO1xuICAgIHBpcGVsaW5lID0gcGlwZWxpbmUubWFwKHN0YWdlID0+IHtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgc3RhZ2UuJGdyb3VwID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBzdGFnZS4kZ3JvdXApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZCAmJlxuICAgICAgICAgIHR5cGVvZiBzdGFnZS4kZ3JvdXAuX2lkID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQuaW5kZXhPZignJF9wXycpID49IDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgaXNQb2ludGVyRmllbGQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIHN0YWdlLiRtYXRjaCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRtYXRjaCk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgc3RhZ2UuJHByb2plY3QgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYSwgc3RhZ2UuJHByb2plY3QpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRnZW9OZWFyICYmIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KSB7XG4gICAgICAgIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJGdlb05lYXIucXVlcnkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YWdlO1xuICAgIH0pO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uYWdncmVnYXRlKHBpcGVsaW5lLCB7XG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdfaWQnKSkge1xuICAgICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkICYmIHJlc3VsdC5faWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IHJlc3VsdC5faWQuc3BsaXQoJyQnKVsxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSBudWxsIHx8XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgIChbJ29iamVjdCcsICdzdHJpbmcnXS5pbmNsdWRlcyh0eXBlb2YgcmVzdWx0Ll9pZCkgJiYgXy5pc0VtcHR5KHJlc3VsdC5faWQpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gcmVzdWx0Ll9pZDtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHQuX2lkO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgfSlcbiAgICAgIC50aGVuKG9iamVjdHMgPT4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgcmVjdXJzaXZlbHkgdHJhdmVyc2UgdGhlIHBpcGVsaW5lIGFuZCBjb252ZXJ0IGFueSBQb2ludGVyIG9yIERhdGUgY29sdW1ucy5cbiAgLy8gSWYgd2UgZGV0ZWN0IGEgcG9pbnRlciBjb2x1bW4gd2Ugd2lsbCByZW5hbWUgdGhlIGNvbHVtbiBiZWluZyBxdWVyaWVkIGZvciB0byBtYXRjaCB0aGUgY29sdW1uXG4gIC8vIGluIHRoZSBkYXRhYmFzZS4gV2UgYWxzbyBtb2RpZnkgdGhlIHZhbHVlIHRvIHdoYXQgd2UgZXhwZWN0IHRoZSB2YWx1ZSB0byBiZSBpbiB0aGUgZGF0YWJhc2VcbiAgLy8gYXMgd2VsbC5cbiAgLy8gRm9yIGRhdGVzLCB0aGUgZHJpdmVyIGV4cGVjdHMgYSBEYXRlIG9iamVjdCwgYnV0IHdlIGhhdmUgYSBzdHJpbmcgY29taW5nIGluLiBTbyB3ZSdsbCBjb252ZXJ0XG4gIC8vIHRoZSBzdHJpbmcgdG8gYSBEYXRlIHNvIHRoZSBkcml2ZXIgY2FuIHBlcmZvcm0gdGhlIG5lY2Vzc2FyeSBjb21wYXJpc29uLlxuICAvL1xuICAvLyBUaGUgZ29hbCBvZiB0aGlzIG1ldGhvZCBpcyB0byBsb29rIGZvciB0aGUgXCJsZWF2ZXNcIiBvZiB0aGUgcGlwZWxpbmUgYW5kIGRldGVybWluZSBpZiBpdCBuZWVkc1xuICAvLyB0byBiZSBjb252ZXJ0ZWQuIFRoZSBwaXBlbGluZSBjYW4gaGF2ZSBhIGZldyBkaWZmZXJlbnQgZm9ybXMuIEZvciBtb3JlIGRldGFpbHMsIHNlZTpcbiAgLy8gICAgIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL29wZXJhdG9yL2FnZ3JlZ2F0aW9uL1xuICAvL1xuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gYXJyYXksIGl0IG1lYW5zIHdlIGFyZSBwcm9iYWJseSBwYXJzaW5nIGFuICckYW5kJyBvciAnJG9yJyBvcGVyYXRvci4gSW5cbiAgLy8gdGhhdCBjYXNlIHdlIG5lZWQgdG8gbG9vcCB0aHJvdWdoIGFsbCBvZiBpdCdzIGNoaWxkcmVuIHRvIGZpbmQgdGhlIGNvbHVtbnMgYmVpbmcgb3BlcmF0ZWQgb24uXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBvYmplY3QsIHRoZW4gd2UnbGwgbG9vcCB0aHJvdWdoIHRoZSBrZXlzIGNoZWNraW5nIHRvIHNlZSBpZiB0aGUga2V5IG5hbWVcbiAgLy8gbWF0Y2hlcyBvbmUgb2YgdGhlIHNjaGVtYSBjb2x1bW5zLiBJZiBpdCBkb2VzIG1hdGNoIGEgY29sdW1uIGFuZCB0aGUgY29sdW1uIGlzIGEgUG9pbnRlciBvclxuICAvLyBhIERhdGUsIHRoZW4gd2UnbGwgY29udmVydCB0aGUgdmFsdWUgYXMgZGVzY3JpYmVkIGFib3ZlLlxuICAvL1xuICAvLyBBcyBtdWNoIGFzIEkgaGF0ZSByZWN1cnNpb24uLi50aGlzIHNlZW1lZCBsaWtlIGEgZ29vZCBmaXQgZm9yIGl0LiBXZSdyZSBlc3NlbnRpYWxseSB0cmF2ZXJzaW5nXG4gIC8vIGRvd24gYSB0cmVlIHRvIGZpbmQgYSBcImxlYWYgbm9kZVwiIGFuZCBjaGVja2luZyB0byBzZWUgaWYgaXQgbmVlZHMgdG8gYmUgY29udmVydGVkLlxuICBfcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAocGlwZWxpbmUgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBpcGVsaW5lW2ZpZWxkXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIC8vIFBhc3Mgb2JqZWN0cyBkb3duIHRvIE1vbmdvREIuLi50aGlzIGlzIG1vcmUgdGhhbiBsaWtlbHkgYW4gJGV4aXN0cyBvcGVyYXRvci5cbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IGAke3NjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzfSQke3BpcGVsaW5lW2ZpZWxkXX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9jb252ZXJ0VG9EYXRlKHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSBvbmUgYWJvdmUuIFJhdGhlciB0aGFuIHRyeWluZyB0byBjb21iaW5lIHRoZXNlXG4gIC8vIHR3byBmdW5jdGlvbnMgYW5kIG1ha2luZyB0aGUgY29kZSBldmVuIGhhcmRlciB0byB1bmRlcnN0YW5kLCBJIGRlY2lkZWQgdG8gc3BsaXQgaXQgdXAuIFRoZVxuICAvLyBkaWZmZXJlbmNlIHdpdGggdGhpcyBmdW5jdGlvbiBpcyB3ZSBhcmUgbm90IHRyYW5zZm9ybWluZyB0aGUgdmFsdWVzLCBvbmx5IHRoZSBrZXlzIG9mIHRoZVxuICAvLyBwaXBlbGluZS5cbiAgX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSB0d28gYWJvdmUuIE1vbmdvREIgJGdyb3VwIGFnZ3JlZ2F0ZSBsb29rcyBsaWtlOlxuICAvLyAgICAgeyAkZ3JvdXA6IHsgX2lkOiA8ZXhwcmVzc2lvbj4sIDxmaWVsZDE+OiB7IDxhY2N1bXVsYXRvcjE+IDogPGV4cHJlc3Npb24xPiB9LCAuLi4gfSB9XG4gIC8vIFRoZSA8ZXhwcmVzc2lvbj4gY291bGQgYmUgYSBjb2x1bW4gbmFtZSwgcHJlZml4ZWQgd2l0aCB0aGUgJyQnIGNoYXJhY3Rlci4gV2UnbGwgbG9vayBmb3JcbiAgLy8gdGhlc2UgPGV4cHJlc3Npb24+IGFuZCBjaGVjayB0byBzZWUgaWYgaXQgaXMgYSAnUG9pbnRlcicgb3IgaWYgaXQncyBvbmUgb2YgY3JlYXRlZEF0LFxuICAvLyB1cGRhdGVkQXQgb3Igb2JqZWN0SWQgYW5kIGNoYW5nZSBpdCBhY2NvcmRpbmdseS5cbiAgX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3QgZmllbGQgPSBwaXBlbGluZS5zdWJzdHJpbmcoMSk7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJF9wXyR7ZmllbGR9YDtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX2NyZWF0ZWRfYXQnO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAndXBkYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfdXBkYXRlZF9hdCc7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWN1cnNpdmVseSBjb252ZXJ0cyB2YWx1ZXMgdG8gRGF0ZSBvYmplY3RzLiBTaW5jZSB0aGUgcGFzc2VkIG9iamVjdCBpcyBwYXJ0IG9mIGFuIGFnZ3JlZ2F0aW9uXG4gICAqIHBpcGVsaW5lIGFuZCBjYW4gY29udGFpbiB2YXJpb3VzIGxvZ2ljIG9wZXJhdG9ycyAobGlrZSAkZ3QsICRsdCwgZXRjKSwgdGhpcyBmdW5jdGlvbiB3aWxsXG4gICAqIHRyYXZlcnNlIHRoZSBvYmplY3QgYW5kIGNvbnZlcnQgYW55IHN0cmluZ3MgdGhhdCBjYW4gYmUgcGFyc2VkIGFzIGRhdGVzIGludG8gRGF0ZSBvYmplY3RzLlxuICAgKiBAcGFyYW0ge2FueX0gdmFsdWUgVGhlIHZhbHVlIHRvIGNvbnZlcnQuXG4gICAqIEByZXR1cm5zIHthbnl9IFRoZSBvcmlnaW5hbCB2YWx1ZSBpZiBub3QgY29udmVydGlibGUgdG8gRGF0ZSwgb3IgYSBEYXRlIG9iamVjdCBpZiBpdCBpcy5cbiAgICovXG4gIF9jb252ZXJ0VG9EYXRlKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBpc05hTihEYXRlLnBhcnNlKHZhbHVlKSkgPyB2YWx1ZSA6IG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHZhbHVlKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUodmFsdWVbZmllbGRdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2U6ID9zdHJpbmcpOiA/c3RyaW5nIHtcbiAgICBpZiAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIHJlYWRQcmVmZXJlbmNlID0gcmVhZFByZWZlcmVuY2UudG9VcHBlckNhc2UoKTtcbiAgICB9XG4gICAgc3dpdGNoIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgY2FzZSAnUFJJTUFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQUklNQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdORUFSRVNUJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5ORUFSRVNUO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgdW5kZWZpbmVkOlxuICAgICAgY2FzZSBudWxsOlxuICAgICAgY2FzZSAnJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ05vdCBzdXBwb3J0ZWQgcmVhZCBwcmVmZXJlbmNlLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4LCB7IGJhY2tncm91bmQ6IHRydWUgfSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4ZXMoaW5kZXhlcywgeyBiYWNrZ3JvdW5kOiB0cnVlIH0pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgaWYgKHR5cGUgJiYgdHlwZS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0ge1xuICAgICAgICBbZmllbGROYW1lXTogJzJkc3BoZXJlJyxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVJbmRleChjbGFzc05hbWUsIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgICAgaWYgKCFxdWVyeVtmaWVsZE5hbWVdIHx8ICFxdWVyeVtmaWVsZE5hbWVdLiR0ZXh0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhpc3RpbmdJbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBleGlzdGluZ0luZGV4ZXMpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBleGlzdGluZ0luZGV4ZXNba2V5XTtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChpbmRleCwgZmllbGROYW1lKSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgaW5kZXhOYW1lID0gYCR7ZmllbGROYW1lfV90ZXh0YDtcbiAgICAgIGNvbnN0IHRleHRJbmRleCA9IHtcbiAgICAgICAgW2luZGV4TmFtZV06IHsgW2ZpZWxkTmFtZV06ICd0ZXh0JyB9LFxuICAgICAgfTtcbiAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHRleHRJbmRleCxcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzLFxuICAgICAgICBzY2hlbWEuZmllbGRzXG4gICAgICApLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDg1KSB7XG4gICAgICAgICAgLy8gSW5kZXggZXhpc3Qgd2l0aCBkaWZmZXJlbnQgb3B0aW9uc1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5pbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleChpbmRleCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wQWxsSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZHJvcEluZGV4ZXMoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihjbGFzc2VzID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBjbGFzc2VzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oc2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgdHJhbnNhY3Rpb25hbFNlY3Rpb24gPSB0aGlzLmNsaWVudC5zdGFydFNlc3Npb24oKTtcbiAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5zdGFydFRyYW5zYWN0aW9uKCk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2VjdGlvbik7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY29tbWl0ID0gcmV0cmllcyA9PiB7XG4gICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb25cbiAgICAgICAgLmNvbW1pdFRyYW5zYWN0aW9uKClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuaGFzRXJyb3JMYWJlbCgnVHJhbnNpZW50VHJhbnNhY3Rpb25FcnJvcicpICYmIHJldHJpZXMgPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gY29tbWl0KHJldHJpZXMgLSAxKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgcmV0dXJuIGNvbW1pdCg1KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvbi5hYm9ydFRyYW5zYWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsV0FBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsZUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsZ0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLHNCQUFBLEdBQUFELHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSyxlQUFBLEdBQUFMLE9BQUE7QUFTQSxJQUFBTSxLQUFBLEdBQUFILHNCQUFBLENBQUFILE9BQUE7QUFFQSxJQUFBTyxPQUFBLEdBQUFKLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBUSxTQUFBLEdBQUFDLHVCQUFBLENBQUFULE9BQUE7QUFDQSxJQUFBVSxPQUFBLEdBQUFQLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBVyxNQUFBLEdBQUFSLHNCQUFBLENBQUFILE9BQUE7QUFBbUMsU0FBQVMsd0JBQUFHLENBQUEsRUFBQUMsQ0FBQSw2QkFBQUMsT0FBQSxNQUFBQyxDQUFBLE9BQUFELE9BQUEsSUFBQUUsQ0FBQSxP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