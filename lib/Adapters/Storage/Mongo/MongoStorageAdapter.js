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

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

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
      } // TODO: If you have one app with a collection prefix that happens to be a prefix of another
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
}; // Returns { code, error } if invalid, or { result }, an object
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

    this._onchange = () => {}; // MaxTimeMS is not a global MongoDB client option, it is applied per operation.


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
    } // parsing and re-formatting causes the auth value (if there) to get URI
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
  } // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.


  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }

      throw error;
    }) // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }

  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
  } // Remove the column and all the data. For Relations, the _Join collection is handled
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
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  } // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.


  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  } // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
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
  } // Remove all objects that match the given Parse Query.
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
  } // Apply the update to all objects that match the given Parse Query.


  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  } // Atomically finds and updates an object based on query.
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
  } // Hopefully we can get rid of this. It's only used for config and hooks.


  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  } // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.


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
    }, {}); // If we aren't requesting the `_id` field, we need to explicitly opt out
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
  } // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
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
  } // Used in tests


  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  } // Executes a count.


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
  } // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
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
  } // This function is slightly different than the one above. Rather than trying to combine these
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
  } // This function is slightly different than the two above. MongoDB $group aggregate looks like:
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
  } // This function will attempt to convert the provided value to a Date object. Since this is part
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb25nb2RiIiwicmVxdWlyZSIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImZpbHRlciIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiaW5kZXhPZiIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsInVuZGVmaW5lZCIsImZpZWxkTmFtZSIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsImZpZWxkT3B0aW9ucyIsIk1vbmdvU2NoZW1hQ29sbGVjdGlvbiIsInBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJmaWVsZHNfb3B0aW9ucyIsImNsYXNzX3Blcm1pc3Npb25zIiwidmFsaWRhdGVFeHBsYWluVmFsdWUiLCJleHBsYWluIiwiZXhwbGFpbkFsbG93ZWRWYWx1ZXMiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiZGVmYXVsdHMiLCJEZWZhdWx0TW9uZ29VUkkiLCJjb2xsZWN0aW9uUHJlZml4IiwibW9uZ29PcHRpb25zIiwiX3VyaSIsIl9tb25nb09wdGlvbnMiLCJ1c2VOZXdVcmxQYXJzZXIiLCJ1c2VVbmlmaWVkVG9wb2xvZ3kiLCJfb25jaGFuZ2UiLCJfbWF4VGltZU1TIiwibWF4VGltZU1TIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsImVuYWJsZVNjaGVtYUhvb2tzIiwid2F0Y2giLCJjYWxsYmFjayIsImNvbm5lY3Rpb25Qcm9taXNlIiwiZW5jb2RlZFVyaSIsImZvcm1hdFVybCIsInBhcnNlVXJsIiwiY2xpZW50Iiwib3B0aW9ucyIsInMiLCJkYiIsImRiTmFtZSIsIm9uIiwiY2F0Y2giLCJlcnIiLCJQcm9taXNlIiwicmVqZWN0IiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsImNvZGUiLCJsb2dnZXIiLCJoYW5kbGVTaHV0ZG93biIsInJlc29sdmUiLCJjbG9zZSIsIl9hZGFwdGl2ZUNvbGxlY3Rpb24iLCJuYW1lIiwicmF3Q29sbGVjdGlvbiIsIk1vbmdvQ29sbGVjdGlvbiIsIl9zY2hlbWFDb2xsZWN0aW9uIiwiX3N0cmVhbSIsIl9tb25nb0NvbGxlY3Rpb24iLCJjbGFzc0V4aXN0cyIsImxpc3RDb2xsZWN0aW9ucyIsInRvQXJyYXkiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2NoZW1hQ29sbGVjdGlvbiIsInVwZGF0ZVNjaGVtYSIsIiRzZXQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmb3JFYWNoIiwiZmllbGQiLCJfX29wIiwicHJvbWlzZSIsImRyb3BJbmRleCIsInB1c2giLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJyZXBsYWNlIiwiaW5zZXJ0UHJvbWlzZSIsImNyZWF0ZUluZGV4ZXMiLCJhbGwiLCJzZXRJbmRleGVzRnJvbU1vbmdvIiwiZ2V0SW5kZXhlcyIsInJlZHVjZSIsIm9iaiIsImluZGV4IiwiX2Z0cyIsIl9mdHN4Iiwid2VpZ2h0cyIsImNyZWF0ZUNsYXNzIiwiaW5zZXJ0U2NoZW1hIiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImRlbGV0ZUNsYXNzIiwiZHJvcCIsIm1lc3NhZ2UiLCJmaW5kQW5kRGVsZXRlU2NoZW1hIiwiZGVsZXRlQWxsQ2xhc3NlcyIsImZhc3QiLCJtYXAiLCJkZWxldGVNYW55IiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsIm1vbmdvRm9ybWF0TmFtZXMiLCJjb2xsZWN0aW9uVXBkYXRlIiwiJHVuc2V0IiwiY29sbGVjdGlvbkZpbHRlciIsIiRvciIsIiRleGlzdHMiLCJzY2hlbWFVcGRhdGUiLCJ1cGRhdGVNYW55IiwiZ2V0QWxsQ2xhc3NlcyIsInNjaGVtYXNDb2xsZWN0aW9uIiwiX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BIiwiZ2V0Q2xhc3MiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlIiwiaW5zZXJ0T25lIiwib3BzIiwiRFVQTElDQVRFX1ZBTFVFIiwidW5kZXJseWluZ0Vycm9yIiwibWF0Y2hlcyIsIkFycmF5IiwiaXNBcnJheSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwicXVlcnkiLCJtb25nb1doZXJlIiwidHJhbnNmb3JtV2hlcmUiLCJkZWxldGVkQ291bnQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGUiLCJtb25nb1VwZGF0ZSIsInRyYW5zZm9ybVVwZGF0ZSIsImZpbmRPbmVBbmRVcGRhdGUiLCJyZXR1cm5Eb2N1bWVudCIsInNlc3Npb24iLCJyZXN1bHQiLCJtb25nb09iamVjdFRvUGFyc2VPYmplY3QiLCJ2YWx1ZSIsInVwc2VydE9uZU9iamVjdCIsInVwc2VydE9uZSIsImZpbmQiLCJza2lwIiwibGltaXQiLCJzb3J0IiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwibW9uZ29Tb3J0IiwiXyIsIm1hcEtleXMiLCJ0cmFuc2Zvcm1LZXkiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwic3RhZ2UiLCIkZ3JvdXAiLCJfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3MiLCIkbWF0Y2giLCJfcGFyc2VBZ2dyZWdhdGVBcmdzIiwiJHByb2plY3QiLCJfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyIsIiRnZW9OZWFyIiwicmVzdWx0cyIsInNwbGl0IiwiaXNFbXB0eSIsInJldHVyblZhbHVlIiwiX2NvbnZlcnRUb0RhdGUiLCJzdWJzdHJpbmciLCJEYXRlIiwidG9VcHBlckNhc2UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIiR0ZXh0IiwidGV4dEluZGV4IiwiZHJvcEFsbEluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiY2xhc3NlcyIsInByb21pc2VzIiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2VjdGlvbiIsInN0YXJ0U2Vzc2lvbiIsInN0YXJ0VHJhbnNhY3Rpb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdCIsInJldHJpZXMiLCJjb21taXRUcmFuc2FjdGlvbiIsImhhc0Vycm9yTGFiZWwiLCJlbmRTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb24iXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgU3RvcmFnZUNsYXNzLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCwgZm9ybWF0IGFzIGZvcm1hdFVybCB9IGZyb20gJy4uLy4uLy4uL3ZlbmRvci9tb25nb2RiVXJsJztcbmltcG9ydCB7XG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1LZXksXG4gIHRyYW5zZm9ybVdoZXJlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59IGZyb20gJy4vTW9uZ29UcmFuc2Zvcm0nO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG5jb25zdCBNb25nb0NsaWVudCA9IG1vbmdvZGIuTW9uZ29DbGllbnQ7XG5jb25zdCBSZWFkUHJlZmVyZW5jZSA9IG1vbmdvZGIuUmVhZFByZWZlcmVuY2U7XG5cbmNvbnN0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUgPSAnX1NDSEVNQSc7XG5cbmNvbnN0IHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMgPSBtb25nb0FkYXB0ZXIgPT4ge1xuICByZXR1cm4gbW9uZ29BZGFwdGVyXG4gICAgLmNvbm5lY3QoKVxuICAgIC50aGVuKCgpID0+IG1vbmdvQWRhcHRlci5kYXRhYmFzZS5jb2xsZWN0aW9ucygpKVxuICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uLm5hbWVzcGFjZS5tYXRjaCgvXFwuc3lzdGVtXFwuLykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogSWYgeW91IGhhdmUgb25lIGFwcCB3aXRoIGEgY29sbGVjdGlvbiBwcmVmaXggdGhhdCBoYXBwZW5zIHRvIGJlIGEgcHJlZml4IG9mIGFub3RoZXJcbiAgICAgICAgLy8gYXBwcyBwcmVmaXgsIHRoaXMgd2lsbCBnbyB2ZXJ5IHZlcnkgYmFkbHkuIFdlIHNob3VsZCBmaXggdGhhdCBzb21laG93LlxuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgLy8gTGVnYWN5IG1vbmdvIGFkYXB0ZXIga25vd3MgYWJvdXQgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBwYXNzd29yZCBhbmQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBGdXR1cmUgZGF0YWJhc2UgYWRhcHRlcnMgd2lsbCBvbmx5IGtub3cgYWJvdXQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBOb3RlOiBQYXJzZSBTZXJ2ZXIgd2lsbCBicmluZyBiYWNrIHBhc3N3b3JkIHdpdGggaW5qZWN0RGVmYXVsdFNjaGVtYSwgc28gd2UgZG9uJ3QgbmVlZFxuICAgIC8vIHRvIGFkZCBfaGFzaGVkX3Bhc3N3b3JkIGJhY2sgZXZlci5cbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8vIFJldHVybnMgeyBjb2RlLCBlcnJvciB9IGlmIGludmFsaWQsIG9yIHsgcmVzdWx0IH0sIGFuIG9iamVjdFxuLy8gc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIF9TQ0hFTUEgY29sbGVjdGlvbiwgb3RoZXJ3aXNlLlxuY29uc3QgbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQID0gKFxuICBmaWVsZHMsXG4gIGNsYXNzTmFtZSxcbiAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBpbmRleGVzXG4pID0+IHtcbiAgY29uc3QgbW9uZ29PYmplY3QgPSB7XG4gICAgX2lkOiBjbGFzc05hbWUsXG4gICAgb2JqZWN0SWQ6ICdzdHJpbmcnLFxuICAgIHVwZGF0ZWRBdDogJ3N0cmluZycsXG4gICAgY3JlYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBfbWV0YWRhdGE6IHVuZGVmaW5lZCxcbiAgfTtcblxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgIG1vbmdvT2JqZWN0W2ZpZWxkTmFtZV0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID0gbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZGV4ZXMgJiYgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCA+IDApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pIHtcbiAgaWYgKGV4cGxhaW4pIHtcbiAgICAvLyBUaGUgbGlzdCBvZiBhbGxvd2VkIGV4cGxhaW4gdmFsdWVzIGlzIGZyb20gbm9kZS1tb25nb2RiLW5hdGl2ZS9saWIvZXhwbGFpbi5qc1xuICAgIGNvbnN0IGV4cGxhaW5BbGxvd2VkVmFsdWVzID0gW1xuICAgICAgJ3F1ZXJ5UGxhbm5lcicsXG4gICAgICAncXVlcnlQbGFubmVyRXh0ZW5kZWQnLFxuICAgICAgJ2V4ZWN1dGlvblN0YXRzJyxcbiAgICAgICdhbGxQbGFuc0V4ZWN1dGlvbicsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgXTtcbiAgICBpZiAoIWV4cGxhaW5BbGxvd2VkVmFsdWVzLmluY2x1ZGVzKGV4cGxhaW4pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0ludmFsaWQgdmFsdWUgZm9yIGV4cGxhaW4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmkgPSBkZWZhdWx0cy5EZWZhdWx0TW9uZ29VUkksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgbW9uZ29PcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fdXJpID0gdXJpO1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucyA9IG1vbmdvT3B0aW9ucztcbiAgICB0aGlzLl9tb25nb09wdGlvbnMudXNlTmV3VXJsUGFyc2VyID0gdHJ1ZTtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMudXNlVW5pZmllZFRvcG9sb2d5ID0gdHJ1ZTtcbiAgICB0aGlzLl9vbmNoYW5nZSA9ICgpID0+IHt9O1xuXG4gICAgLy8gTWF4VGltZU1TIGlzIG5vdCBhIGdsb2JhbCBNb25nb0RCIGNsaWVudCBvcHRpb24sIGl0IGlzIGFwcGxpZWQgcGVyIG9wZXJhdGlvbi5cbiAgICB0aGlzLl9tYXhUaW1lTVMgPSBtb25nb09wdGlvbnMubWF4VGltZU1TO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IHRydWU7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhbW9uZ29PcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIGRlbGV0ZSBtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgZGVsZXRlIG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLmNvbm5lY3Rpb25Qcm9taXNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICB9XG5cbiAgICAvLyBwYXJzaW5nIGFuZCByZS1mb3JtYXR0aW5nIGNhdXNlcyB0aGUgYXV0aCB2YWx1ZSAoaWYgdGhlcmUpIHRvIGdldCBVUklcbiAgICAvLyBlbmNvZGVkXG4gICAgY29uc3QgZW5jb2RlZFVyaSA9IGZvcm1hdFVybChwYXJzZVVybCh0aGlzLl91cmkpKTtcblxuICAgIHRoaXMuY29ubmVjdGlvblByb21pc2UgPSBNb25nb0NsaWVudC5jb25uZWN0KGVuY29kZWRVcmksIHRoaXMuX21vbmdvT3B0aW9ucylcbiAgICAgIC50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIC8vIFN0YXJ0aW5nIG1vbmdvREIgMy4wLCB0aGUgTW9uZ29DbGllbnQuY29ubmVjdCBkb24ndCByZXR1cm4gYSBEQiBhbnltb3JlIGJ1dCBhIGNsaWVudFxuICAgICAgICAvLyBGb3J0dW5hdGVseSwgd2UgY2FuIGdldCBiYWNrIHRoZSBvcHRpb25zIGFuZCB1c2UgdGhlbSB0byBzZWxlY3QgdGhlIHByb3BlciBEQi5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vbmdvZGIvbm9kZS1tb25nb2RiLW5hdGl2ZS9ibG9iLzJjMzVkNzZmMDg1NzQyMjViOGRiMDJkN2JlZjY4NzEyM2U2YmIwMTgvbGliL21vbmdvX2NsaWVudC5qcyNMODg1XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjbGllbnQucy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkYXRhYmFzZSA9IGNsaWVudC5kYihvcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIGlmICghZGF0YWJhc2UpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2xpZW50Lm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNsaWVudC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICAgICAgdGhpcy5kYXRhYmFzZSA9IGRhdGFiYXNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG4gICAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICB9XG5cbiAgaGFuZGxlRXJyb3I8VD4oZXJyb3I6ID8oRXJyb3IgfCBQYXJzZS5FcnJvcikpOiBQcm9taXNlPFQ+IHtcbiAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gMTMpIHtcbiAgICAgIC8vIFVuYXV0aG9yaXplZCBlcnJvclxuICAgICAgZGVsZXRlIHRoaXMuY2xpZW50O1xuICAgICAgZGVsZXRlIHRoaXMuZGF0YWJhc2U7XG4gICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgIGxvZ2dlci5lcnJvcignUmVjZWl2ZWQgdW5hdXRob3JpemVkIGVycm9yJywgeyBlcnJvcjogZXJyb3IgfSk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jbGllbnQuY2xvc2UoZmFsc2UpO1xuICB9XG5cbiAgX2FkYXB0aXZlQ29sbGVjdGlvbihuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuZGF0YWJhc2UuY29sbGVjdGlvbih0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSkpXG4gICAgICAudGhlbihyYXdDb2xsZWN0aW9uID0+IG5ldyBNb25nb0NvbGxlY3Rpb24ocmF3Q29sbGVjdGlvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBfc2NoZW1hQ29sbGVjdGlvbigpOiBQcm9taXNlPE1vbmdvU2NoZW1hQ29sbGVjdGlvbj4ge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUpKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgICAgICB0aGlzLl9zdHJlYW0gPSBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24ud2F0Y2goKTtcbiAgICAgICAgICB0aGlzLl9zdHJlYW0ub24oJ2NoYW5nZScsICgpID0+IHRoaXMuX29uY2hhbmdlKCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgTW9uZ29TY2hlbWFDb2xsZWN0aW9uKGNvbGxlY3Rpb24pO1xuICAgICAgfSk7XG4gIH1cblxuICBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YWJhc2UubGlzdENvbGxlY3Rpb25zKHsgbmFtZTogdGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUgfSkudG9BcnJheSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb25zLmxlbmd0aCA+IDA7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyc6IENMUHMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlUHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmRyb3BJbmRleChjbGFzc05hbWUsIG5hbWUpO1xuICAgICAgICBkZWxldGVQcm9taXNlcy5wdXNoKHByb21pc2UpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKFxuICAgICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICAgIGtleS5pbmRleE9mKCdfcF8nKSA9PT0gMCA/IGtleS5yZXBsYWNlKCdfcF8nLCAnJykgOiBrZXlcbiAgICAgICAgICAgIClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBsZXQgaW5zZXJ0UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaW5zZXJ0UHJvbWlzZSA9IHRoaXMuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGVQcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IGluc2VydFByb21pc2UpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogZXhpc3RpbmdJbmRleGVzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0SW5kZXhlcyhjbGFzc05hbWUpXG4gICAgICAudGhlbihpbmRleGVzID0+IHtcbiAgICAgICAgaW5kZXhlcyA9IGluZGV4ZXMucmVkdWNlKChvYmosIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGluZGV4LmtleS5fZnRzKSB7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHM7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHN4O1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBpbmRleC53ZWlnaHRzKSB7XG4gICAgICAgICAgICAgIGluZGV4LmtleVtmaWVsZF0gPSAndGV4dCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9ialtpbmRleC5uYW1lXSA9IGluZGV4LmtleTtcbiAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGluZGV4ZXMgfSxcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgLy8gSWdub3JlIGlmIGNvbGxlY3Rpb24gbm90IGZvdW5kXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUChcbiAgICAgIHNjaGVtYS5maWVsZHMsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgc2NoZW1hLmluZGV4ZXNcbiAgICApO1xuICAgIG1vbmdvT2JqZWN0Ll9pZCA9IGNsYXNzTmFtZTtcbiAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcylcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5pbnNlcnRTY2hlbWEobW9uZ29PYmplY3QpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgY29uc3Qgc2NoZW1hQ29sbGVjdGlvbiA9IGF3YWl0IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKTtcbiAgICBhd2FpdCBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gIH1cblxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5jcmVhdGVJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmRyb3AoKSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyAnbnMgbm90IGZvdW5kJyBtZWFucyBjb2xsZWN0aW9uIHdhcyBhbHJlYWR5IGdvbmUuIElnbm9yZSBkZWxldGlvbiBhdHRlbXB0LlxuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlID09ICducyBub3QgZm91bmQnKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAvLyBXZSd2ZSBkcm9wcGVkIHRoZSBjb2xsZWN0aW9uLCBub3cgcmVtb3ZlIHRoZSBfU0NIRU1BIGRvY3VtZW50XG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmZpbmRBbmREZWxldGVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZUFsbENsYXNzZXMoZmFzdDogYm9vbGVhbikge1xuICAgIHJldHVybiBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zKHRoaXMpLnRoZW4oY29sbGVjdGlvbnMgPT5cbiAgICAgIFByb21pc2UuYWxsKFxuICAgICAgICBjb2xsZWN0aW9ucy5tYXAoY29sbGVjdGlvbiA9PiAoZmFzdCA/IGNvbGxlY3Rpb24uZGVsZXRlTWFueSh7fSkgOiBjb2xsZWN0aW9uLmRyb3AoKSkpXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFBvaW50ZXIgZmllbGQgbmFtZXMgYXJlIHBhc3NlZCBmb3IgbGVnYWN5IHJlYXNvbnM6IHRoZSBvcmlnaW5hbCBtb25nb1xuICAvLyBmb3JtYXQgc3RvcmVkIHBvaW50ZXIgZmllbGQgbmFtZXMgZGlmZmVyZW50bHkgaW4gdGhlIGRhdGFiYXNlLCBhbmQgdGhlcmVmb3JlXG4gIC8vIG5lZWRlZCB0byBrbm93IHRoZSB0eXBlIG9mIHRoZSBmaWVsZCBiZWZvcmUgaXQgY291bGQgZGVsZXRlIGl0LiBGdXR1cmUgZGF0YWJhc2VcbiAgLy8gYWRhcHRlcnMgc2hvdWxkIGlnbm9yZSB0aGUgcG9pbnRlckZpZWxkTmFtZXMgYXJndW1lbnQuIEFsbCB0aGUgZmllbGQgbmFtZXMgYXJlIGluXG4gIC8vIGZpZWxkTmFtZXMsIHRoZXkgc2hvdyB1cCBhZGRpdGlvbmFsbHkgaW4gdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGRhdGFiYXNlIGZvciB1c2VcbiAgLy8gYnkgdGhlIG1vbmdvIGFkYXB0ZXIsIHdoaWNoIGRlYWxzIHdpdGggdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgbW9uZ29Gb3JtYXROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYF9wXyR7ZmllbGROYW1lfWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGROYW1lO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGNvbGxlY3Rpb25VcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2xsZWN0aW9uRmlsdGVyID0geyAkb3I6IFtdIH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvbkZpbHRlclsnJG9yJ10ucHVzaCh7IFtuYW1lXTogeyAkZXhpc3RzOiB0cnVlIH0gfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzY2hlbWFVcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBmaWVsZE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bYF9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucy4ke25hbWV9YF0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShjb2xsZWN0aW9uRmlsdGVyLCBjb2xsZWN0aW9uVXBkYXRlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCBzY2hlbWFVcGRhdGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGdldEFsbENsYXNzZXMoKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3NbXT4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFN0b3JhZ2VDbGFzcz4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUT0RPOiBBcyB5ZXQgbm90IHBhcnRpY3VsYXJseSB3ZWxsIHNwZWNpZmllZC4gQ3JlYXRlcyBhbiBvYmplY3QuIE1heWJlIHNob3VsZG4ndCBldmVuIG5lZWQgdGhlIHNjaGVtYSxcbiAgLy8gYW5kIHNob3VsZCBpbmZlciBmcm9tIHRoZSB0eXBlLiBPciBtYXliZSBkb2VzIG5lZWQgdGhlIHNjaGVtYSBmb3IgdmFsaWRhdGlvbnMuIE9yIG1heWJlIG5lZWRzXG4gIC8vIHRoZSBzY2hlbWEgb25seSBmb3IgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuIFdlJ2xsIGZpZ3VyZSB0aGF0IG91dCBsYXRlci5cbiAgY3JlYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIG9iamVjdDogYW55LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5pbnNlcnRPbmUobW9uZ29PYmplY3QsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW21vbmdvT2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vIER1cGxpY2F0ZSB2YWx1ZVxuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IubWVzc2FnZS5tYXRjaCgvaW5kZXg6W1xcc2EtekEtWjAtOV9cXC1cXC5dK1xcJD8oW2EtekEtWl8tXSspXzEvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uZGVsZXRlTWFueShtb25nb1doZXJlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAudGhlbihcbiAgICAgICAgKHsgZGVsZXRlZENvdW50IH0pID0+IHtcbiAgICAgICAgICBpZiAoZGVsZXRlZENvdW50ID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yJyk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kcyBhbmQgdXBkYXRlcyBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmZpbmRPbmVBbmRVcGRhdGUobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHtcbiAgICAgICAgICByZXR1cm5Eb2N1bWVudDogJ2FmdGVyJyxcbiAgICAgICAgICBzZXNzaW9uOiB0cmFuc2FjdGlvbmFsU2Vzc2lvbiB8fCB1bmRlZmluZWQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgcmVzdWx0LnZhbHVlLCBzY2hlbWEpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBIb3BlZnVsbHkgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBzZXJ0T25lKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGZpbmQuIEFjY2VwdHM6IGNsYXNzTmFtZSwgcXVlcnkgaW4gUGFyc2UgZm9ybWF0LCBhbmQgeyBza2lwLCBsaW1pdCwgc29ydCB9LlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbik7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvU29ydCA9IF8ubWFwS2V5cyhzb3J0LCAodmFsdWUsIGZpZWxkTmFtZSkgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgY29uc3QgbW9uZ29LZXlzID0gXy5yZWR1Y2UoXG4gICAgICBrZXlzLFxuICAgICAgKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW9bJ19ycGVybSddID0gMTtcbiAgICAgICAgICBtZW1vWydfd3Blcm0nXSA9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWVtb1t0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBrZXksIHNjaGVtYSldID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBhcmVuJ3QgcmVxdWVzdGluZyB0aGUgYF9pZGAgZmllbGQsIHdlIG5lZWQgdG8gZXhwbGljaXRseSBvcHQgb3V0XG4gICAgLy8gb2YgaXQuIERvaW5nIHNvIGluIHBhcnNlLXNlcnZlciBpcyB1bnVzdWFsLCBidXQgaXQgY2FuIGFsbG93IHVzIHRvXG4gICAgLy8gb3B0aW1pemUgc29tZSBxdWVyaWVzIHdpdGggY292ZXJpbmcgaW5kZXhlcy5cbiAgICBpZiAoa2V5cyAmJiAhbW9uZ29LZXlzLl9pZCkge1xuICAgICAgbW9uZ29LZXlzLl9pZCA9IDA7XG4gICAgfVxuXG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQobW9uZ29XaGVyZSwge1xuICAgICAgICAgIHNraXAsXG4gICAgICAgICAgbGltaXQsXG4gICAgICAgICAgc29ydDogbW9uZ29Tb3J0LFxuICAgICAgICAgIGtleXM6IG1vbmdvS2V5cyxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSBvcHRpb25zLmluZGV4VHlwZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5pbmRleFR5cGUgOiAxO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnM6IE9iamVjdCA9IHsgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH07XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID0gaW5kZXhOYW1lID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHt9O1xuICAgIGNvbnN0IHR0bE9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyB7IGV4cGlyZUFmdGVyU2Vjb25kczogb3B0aW9ucy50dGwgfSA6IHt9O1xuICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZU9wdGlvbnM6IE9iamVjdCA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyB7IGNvbGxhdGlvbjogTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIH1cbiAgICAgIDoge307XG4gICAgY29uc3QgaW5kZXhPcHRpb25zOiBPYmplY3QgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLmNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMsXG4gICAgICAuLi5pbmRleE5hbWVPcHRpb25zLFxuICAgICAgLi4udHRsT3B0aW9ucyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgY29sbGVjdGlvbiA9PlxuICAgICAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXhDcmVhdGlvblJlcXVlc3QsIGluZGV4T3B0aW9ucywgZXJyb3IgPT5cbiAgICAgICAgICAgICAgZXJyb3IgPyByZWplY3QoZXJyb3IpIDogcmVzb2x2ZSgpXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdCkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWRcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uY291bnQodHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hLCB0cnVlKSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHRyYW5zZm9ybUZpZWxkID0gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QodHJhbnNmb3JtRmllbGQsIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSkpXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgb2JqZWN0cyA9IG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKTtcbiAgICBsZXQgaXNQb2ludGVyRmllbGQgPSBmYWxzZTtcbiAgICBwaXBlbGluZSA9IHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIHN0YWdlLiRncm91cCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgc3RhZ2UuJGdyb3VwKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQgJiZcbiAgICAgICAgICB0eXBlb2Ygc3RhZ2UuJGdyb3VwLl9pZCA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkLmluZGV4T2YoJyRfcF8nKSA+PSAwXG4gICAgICAgICkge1xuICAgICAgICAgIGlzUG9pbnRlckZpZWxkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBzdGFnZS4kbWF0Y2ggPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kbWF0Y2gpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIHN0YWdlLiRwcm9qZWN0ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWEsIHN0YWdlLiRwcm9qZWN0KTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kZ2VvTmVhciAmJiBzdGFnZS4kZ2VvTmVhci5xdWVyeSkge1xuICAgICAgICBzdGFnZS4kZ2VvTmVhci5xdWVyeSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGFnZTtcbiAgICB9KTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmFnZ3JlZ2F0ZShwaXBlbGluZSwge1xuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ19pZCcpKSB7XG4gICAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQgJiYgcmVzdWx0Ll9pZCkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gcmVzdWx0Ll9pZC5zcGxpdCgnJCcpWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IG51bGwgfHxcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKFsnb2JqZWN0JywgJ3N0cmluZyddLmluY2x1ZGVzKHR5cGVvZiByZXN1bHQuX2lkKSAmJiBfLmlzRW1wdHkocmVzdWx0Ll9pZCkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSByZXN1bHQuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdC5faWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiBvYmplY3RzLm1hcChvYmplY3QgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCByZWN1cnNpdmVseSB0cmF2ZXJzZSB0aGUgcGlwZWxpbmUgYW5kIGNvbnZlcnQgYW55IFBvaW50ZXIgb3IgRGF0ZSBjb2x1bW5zLlxuICAvLyBJZiB3ZSBkZXRlY3QgYSBwb2ludGVyIGNvbHVtbiB3ZSB3aWxsIHJlbmFtZSB0aGUgY29sdW1uIGJlaW5nIHF1ZXJpZWQgZm9yIHRvIG1hdGNoIHRoZSBjb2x1bW5cbiAgLy8gaW4gdGhlIGRhdGFiYXNlLiBXZSBhbHNvIG1vZGlmeSB0aGUgdmFsdWUgdG8gd2hhdCB3ZSBleHBlY3QgdGhlIHZhbHVlIHRvIGJlIGluIHRoZSBkYXRhYmFzZVxuICAvLyBhcyB3ZWxsLlxuICAvLyBGb3IgZGF0ZXMsIHRoZSBkcml2ZXIgZXhwZWN0cyBhIERhdGUgb2JqZWN0LCBidXQgd2UgaGF2ZSBhIHN0cmluZyBjb21pbmcgaW4uIFNvIHdlJ2xsIGNvbnZlcnRcbiAgLy8gdGhlIHN0cmluZyB0byBhIERhdGUgc28gdGhlIGRyaXZlciBjYW4gcGVyZm9ybSB0aGUgbmVjZXNzYXJ5IGNvbXBhcmlzb24uXG4gIC8vXG4gIC8vIFRoZSBnb2FsIG9mIHRoaXMgbWV0aG9kIGlzIHRvIGxvb2sgZm9yIHRoZSBcImxlYXZlc1wiIG9mIHRoZSBwaXBlbGluZSBhbmQgZGV0ZXJtaW5lIGlmIGl0IG5lZWRzXG4gIC8vIHRvIGJlIGNvbnZlcnRlZC4gVGhlIHBpcGVsaW5lIGNhbiBoYXZlIGEgZmV3IGRpZmZlcmVudCBmb3Jtcy4gRm9yIG1vcmUgZGV0YWlscywgc2VlOlxuICAvLyAgICAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvYWdncmVnYXRpb24vXG4gIC8vXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBhcnJheSwgaXQgbWVhbnMgd2UgYXJlIHByb2JhYmx5IHBhcnNpbmcgYW4gJyRhbmQnIG9yICckb3InIG9wZXJhdG9yLiBJblxuICAvLyB0aGF0IGNhc2Ugd2UgbmVlZCB0byBsb29wIHRocm91Z2ggYWxsIG9mIGl0J3MgY2hpbGRyZW4gdG8gZmluZCB0aGUgY29sdW1ucyBiZWluZyBvcGVyYXRlZCBvbi5cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIG9iamVjdCwgdGhlbiB3ZSdsbCBsb29wIHRocm91Z2ggdGhlIGtleXMgY2hlY2tpbmcgdG8gc2VlIGlmIHRoZSBrZXkgbmFtZVxuICAvLyBtYXRjaGVzIG9uZSBvZiB0aGUgc2NoZW1hIGNvbHVtbnMuIElmIGl0IGRvZXMgbWF0Y2ggYSBjb2x1bW4gYW5kIHRoZSBjb2x1bW4gaXMgYSBQb2ludGVyIG9yXG4gIC8vIGEgRGF0ZSwgdGhlbiB3ZSdsbCBjb252ZXJ0IHRoZSB2YWx1ZSBhcyBkZXNjcmliZWQgYWJvdmUuXG4gIC8vXG4gIC8vIEFzIG11Y2ggYXMgSSBoYXRlIHJlY3Vyc2lvbi4uLnRoaXMgc2VlbWVkIGxpa2UgYSBnb29kIGZpdCBmb3IgaXQuIFdlJ3JlIGVzc2VudGlhbGx5IHRyYXZlcnNpbmdcbiAgLy8gZG93biBhIHRyZWUgdG8gZmluZCBhIFwibGVhZiBub2RlXCIgYW5kIGNoZWNraW5nIHRvIHNlZSBpZiBpdCBuZWVkcyB0byBiZSBjb252ZXJ0ZWQuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChwaXBlbGluZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcGlwZWxpbmVbZmllbGRdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8gUGFzcyBvYmplY3RzIGRvd24gdG8gTW9uZ29EQi4uLnRoaXMgaXMgbW9yZSB0aGFuIGxpa2VseSBhbiAkZXhpc3RzIG9wZXJhdG9yLlxuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gYCR7c2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3N9JCR7cGlwZWxpbmVbZmllbGRdfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdEYXRlJykge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUocGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSBhYm92ZS4gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNvbWJpbmUgdGhlc2VcbiAgLy8gdHdvIGZ1bmN0aW9ucyBhbmQgbWFraW5nIHRoZSBjb2RlIGV2ZW4gaGFyZGVyIHRvIHVuZGVyc3RhbmQsIEkgZGVjaWRlZCB0byBzcGxpdCBpdCB1cC4gVGhlXG4gIC8vIGRpZmZlcmVuY2Ugd2l0aCB0aGlzIGZ1bmN0aW9uIGlzIHdlIGFyZSBub3QgdHJhbnNmb3JtaW5nIHRoZSB2YWx1ZXMsIG9ubHkgdGhlIGtleXMgb2YgdGhlXG4gIC8vIHBpcGVsaW5lLlxuICBfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIHR3byBhYm92ZS4gTW9uZ29EQiAkZ3JvdXAgYWdncmVnYXRlIGxvb2tzIGxpa2U6XG4gIC8vICAgICB7ICRncm91cDogeyBfaWQ6IDxleHByZXNzaW9uPiwgPGZpZWxkMT46IHsgPGFjY3VtdWxhdG9yMT4gOiA8ZXhwcmVzc2lvbjE+IH0sIC4uLiB9IH1cbiAgLy8gVGhlIDxleHByZXNzaW9uPiBjb3VsZCBiZSBhIGNvbHVtbiBuYW1lLCBwcmVmaXhlZCB3aXRoIHRoZSAnJCcgY2hhcmFjdGVyLiBXZSdsbCBsb29rIGZvclxuICAvLyB0aGVzZSA8ZXhwcmVzc2lvbj4gYW5kIGNoZWNrIHRvIHNlZSBpZiBpdCBpcyBhICdQb2ludGVyJyBvciBpZiBpdCdzIG9uZSBvZiBjcmVhdGVkQXQsXG4gIC8vIHVwZGF0ZWRBdCBvciBvYmplY3RJZCBhbmQgY2hhbmdlIGl0IGFjY29yZGluZ2x5LlxuICBfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHBpcGVsaW5lLnN1YnN0cmluZygxKTtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAkX3BfJHtmaWVsZH1gO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfY3JlYXRlZF9hdCc7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF91cGRhdGVkX2F0JztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIGF0dGVtcHQgdG8gY29udmVydCB0aGUgcHJvdmlkZWQgdmFsdWUgdG8gYSBEYXRlIG9iamVjdC4gU2luY2UgdGhpcyBpcyBwYXJ0XG4gIC8vIG9mIGFuIGFnZ3JlZ2F0aW9uIHBpcGVsaW5lLCB0aGUgdmFsdWUgY2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBpdCBjYW4gYmUgYW5vdGhlciBvYmplY3Qgd2l0aFxuICAvLyBhbiBvcGVyYXRvciBpbiBpdCAobGlrZSAkZ3QsICRsdCwgZXRjKS4gQmVjYXVzZSBvZiB0aGlzIEkgZmVsdCBpdCB3YXMgZWFzaWVyIHRvIG1ha2UgdGhpcyBhXG4gIC8vIHJlY3Vyc2l2ZSBtZXRob2QgdG8gdHJhdmVyc2UgZG93biB0byB0aGUgXCJsZWFmIG5vZGVcIiB3aGljaCBpcyBnb2luZyB0byBiZSB0aGUgc3RyaW5nLlxuICBfY29udmVydFRvRGF0ZSh2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gdmFsdWUpIHtcbiAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUodmFsdWVbZmllbGRdKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2U6ID9zdHJpbmcpOiA/c3RyaW5nIHtcbiAgICBpZiAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIHJlYWRQcmVmZXJlbmNlID0gcmVhZFByZWZlcmVuY2UudG9VcHBlckNhc2UoKTtcbiAgICB9XG4gICAgc3dpdGNoIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgY2FzZSAnUFJJTUFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQUklNQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdORUFSRVNUJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5ORUFSRVNUO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgdW5kZWZpbmVkOlxuICAgICAgY2FzZSBudWxsOlxuICAgICAgY2FzZSAnJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ05vdCBzdXBwb3J0ZWQgcmVhZCBwcmVmZXJlbmNlLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4LCB7IGJhY2tncm91bmQ6IHRydWUgfSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4ZXMoaW5kZXhlcywgeyBiYWNrZ3JvdW5kOiB0cnVlIH0pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgaWYgKHR5cGUgJiYgdHlwZS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0ge1xuICAgICAgICBbZmllbGROYW1lXTogJzJkc3BoZXJlJyxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVJbmRleChjbGFzc05hbWUsIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgICAgaWYgKCFxdWVyeVtmaWVsZE5hbWVdIHx8ICFxdWVyeVtmaWVsZE5hbWVdLiR0ZXh0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhpc3RpbmdJbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBleGlzdGluZ0luZGV4ZXMpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBleGlzdGluZ0luZGV4ZXNba2V5XTtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChpbmRleCwgZmllbGROYW1lKSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgaW5kZXhOYW1lID0gYCR7ZmllbGROYW1lfV90ZXh0YDtcbiAgICAgIGNvbnN0IHRleHRJbmRleCA9IHtcbiAgICAgICAgW2luZGV4TmFtZV06IHsgW2ZpZWxkTmFtZV06ICd0ZXh0JyB9LFxuICAgICAgfTtcbiAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHRleHRJbmRleCxcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzLFxuICAgICAgICBzY2hlbWEuZmllbGRzXG4gICAgICApLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDg1KSB7XG4gICAgICAgICAgLy8gSW5kZXggZXhpc3Qgd2l0aCBkaWZmZXJlbnQgb3B0aW9uc1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5pbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleChpbmRleCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wQWxsSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZHJvcEluZGV4ZXMoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihjbGFzc2VzID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBjbGFzc2VzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oc2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgdHJhbnNhY3Rpb25hbFNlY3Rpb24gPSB0aGlzLmNsaWVudC5zdGFydFNlc3Npb24oKTtcbiAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5zdGFydFRyYW5zYWN0aW9uKCk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2VjdGlvbik7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY29tbWl0ID0gcmV0cmllcyA9PiB7XG4gICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb25cbiAgICAgICAgLmNvbW1pdFRyYW5zYWN0aW9uKClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuaGFzRXJyb3JMYWJlbCgnVHJhbnNpZW50VHJhbnNhY3Rpb25FcnJvcicpICYmIHJldHJpZXMgPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gY29tbWl0KHJldHJpZXMgLSAxKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgcmV0dXJuIGNvbW1pdCg1KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvbi5hYm9ydFRyYW5zYWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUNBOztBQVNBOztBQUVBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUE7QUFDQSxNQUFNQSxPQUFPLEdBQUdDLE9BQU8sQ0FBQyxTQUFELENBQXZCOztBQUNBLE1BQU1DLFdBQVcsR0FBR0YsT0FBTyxDQUFDRSxXQUE1QjtBQUNBLE1BQU1DLGNBQWMsR0FBR0gsT0FBTyxDQUFDRyxjQUEvQjtBQUVBLE1BQU1DLHlCQUF5QixHQUFHLFNBQWxDOztBQUVBLE1BQU1DLDRCQUE0QixHQUFHQyxZQUFZLElBQUk7RUFDbkQsT0FBT0EsWUFBWSxDQUNoQkMsT0FESSxHQUVKQyxJQUZJLENBRUMsTUFBTUYsWUFBWSxDQUFDRyxRQUFiLENBQXNCQyxXQUF0QixFQUZQLEVBR0pGLElBSEksQ0FHQ0UsV0FBVyxJQUFJO0lBQ25CLE9BQU9BLFdBQVcsQ0FBQ0MsTUFBWixDQUFtQkMsVUFBVSxJQUFJO01BQ3RDLElBQUlBLFVBQVUsQ0FBQ0MsU0FBWCxDQUFxQkMsS0FBckIsQ0FBMkIsWUFBM0IsQ0FBSixFQUE4QztRQUM1QyxPQUFPLEtBQVA7TUFDRCxDQUhxQyxDQUl0QztNQUNBOzs7TUFDQSxPQUFPRixVQUFVLENBQUNHLGNBQVgsQ0FBMEJDLE9BQTFCLENBQWtDVixZQUFZLENBQUNXLGlCQUEvQyxLQUFxRSxDQUE1RTtJQUNELENBUE0sQ0FBUDtFQVFELENBWkksQ0FBUDtBQWFELENBZEQ7O0FBZ0JBLE1BQU1DLCtCQUErQixHQUFHLFFBQW1CO0VBQUEsSUFBYkMsTUFBYTs7RUFDekQsT0FBT0EsTUFBTSxDQUFDQyxNQUFQLENBQWNDLE1BQXJCO0VBQ0EsT0FBT0YsTUFBTSxDQUFDQyxNQUFQLENBQWNFLE1BQXJCOztFQUVBLElBQUlILE1BQU0sQ0FBQ0ksU0FBUCxLQUFxQixPQUF6QixFQUFrQztJQUNo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