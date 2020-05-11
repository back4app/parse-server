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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

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

const convertParseSchemaToMongoSchema = (_ref) => {
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
    this._mongoOptions.useUnifiedTopology = true; // MaxTimeMS is not a global MongoDB client option, it is applied per operation.

    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    delete mongoOptions.maxTimeMS;
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

      database.on('error', () => {
        delete this.connectionPromise;
      });
      database.on('close', () => {
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
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => new _MongoSchemaCollection.default(collection));
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
          if (!Object.prototype.hasOwnProperty.call(fields, key)) {
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
    const schemaUpdate = {
      $unset: {}
    };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });
    return this._adaptiveCollection(className).then(collection => collection.updateMany({}, collectionUpdate)).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate)).catch(err => this.handleError(err));
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
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).catch(error => {
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
      result
    }) => {
      if (result.n === 0) {
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
      returnOriginal: false,
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

  ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, indexType = 1) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = indexType;
    });
    const defaultOptions = {
      background: true,
      sparse: true
    };
    const indexNameOptions = indexName ? {
      name: indexName
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};

    const indexOptions = _objectSpread(_objectSpread(_objectSpread({}, defaultOptions), caseInsensitiveOptions), indexNameOptions);

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

      if (stage.$geoNear) {
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
    return transactionalSection.commitTransaction().then(() => {
      transactionalSection.endSession();
    });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsibW9uZ29kYiIsInJlcXVpcmUiLCJNb25nb0NsaWVudCIsIlJlYWRQcmVmZXJlbmNlIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSIsInN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMiLCJtb25nb0FkYXB0ZXIiLCJjb25uZWN0IiwidGhlbiIsImRhdGFiYXNlIiwiY29sbGVjdGlvbnMiLCJmaWx0ZXIiLCJjb2xsZWN0aW9uIiwibmFtZXNwYWNlIiwibWF0Y2giLCJjb2xsZWN0aW9uTmFtZSIsImluZGV4T2YiLCJfY29sbGVjdGlvblByZWZpeCIsImNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEiLCJzY2hlbWEiLCJmaWVsZHMiLCJfcnBlcm0iLCJfd3Blcm0iLCJjbGFzc05hbWUiLCJfaGFzaGVkX3Bhc3N3b3JkIiwibW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsIm1vbmdvT2JqZWN0IiwiX2lkIiwib2JqZWN0SWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJfbWV0YWRhdGEiLCJ1bmRlZmluZWQiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmaWVsZE9wdGlvbnMiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJPYmplY3QiLCJrZXlzIiwibGVuZ3RoIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJjb25uZWN0aW9uUHJvbWlzZSIsImVuY29kZWRVcmkiLCJjbGllbnQiLCJvcHRpb25zIiwicyIsImRiIiwiZGJOYW1lIiwib24iLCJjYXRjaCIsImVyciIsIlByb21pc2UiLCJyZWplY3QiLCJoYW5kbGVFcnJvciIsImVycm9yIiwiY29kZSIsImxvZ2dlciIsImhhbmRsZVNodXRkb3duIiwicmVzb2x2ZSIsImNsb3NlIiwiX2FkYXB0aXZlQ29sbGVjdGlvbiIsIm5hbWUiLCJyYXdDb2xsZWN0aW9uIiwiTW9uZ29Db2xsZWN0aW9uIiwiX3NjaGVtYUNvbGxlY3Rpb24iLCJjbGFzc0V4aXN0cyIsImxpc3RDb2xsZWN0aW9ucyIsInRvQXJyYXkiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2NoZW1hQ29sbGVjdGlvbiIsInVwZGF0ZVNjaGVtYSIsIiRzZXQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmb3JFYWNoIiwiZmllbGQiLCJfX29wIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicHVzaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImluc2VydFByb21pc2UiLCJjcmVhdGVJbmRleGVzIiwiYWxsIiwic2V0SW5kZXhlc0Zyb21Nb25nbyIsImdldEluZGV4ZXMiLCJyZWR1Y2UiLCJvYmoiLCJpbmRleCIsIl9mdHMiLCJfZnRzeCIsIndlaWdodHMiLCJjcmVhdGVDbGFzcyIsImluc2VydFNjaGVtYSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJkZWxldGVDbGFzcyIsImRyb3AiLCJtZXNzYWdlIiwiZmluZEFuZERlbGV0ZVNjaGVtYSIsImRlbGV0ZUFsbENsYXNzZXMiLCJmYXN0IiwibWFwIiwiZGVsZXRlTWFueSIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJtb25nb0Zvcm1hdE5hbWVzIiwiY29sbGVjdGlvblVwZGF0ZSIsIiR1bnNldCIsInNjaGVtYVVwZGF0ZSIsInVwZGF0ZU1hbnkiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hc0NvbGxlY3Rpb24iLCJfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEiLCJnZXRDbGFzcyIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwiY3JlYXRlT2JqZWN0Iiwib2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJpbnNlcnRPbmUiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1bmRlcmx5aW5nRXJyb3IiLCJtYXRjaGVzIiwiQXJyYXkiLCJpc0FycmF5IiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJxdWVyeSIsIm1vbmdvV2hlcmUiLCJyZXN1bHQiLCJuIiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwiX21vbmdvQ29sbGVjdGlvbiIsInJldHVybk9yaWdpbmFsIiwic2Vzc2lvbiIsInZhbHVlIiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwibW9uZ29Tb3J0IiwiXyIsIm1hcEtleXMiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhUeXBlIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwiY2FzZUluc2Vuc2l0aXZlT3B0aW9ucyIsImNvbGxhdGlvbiIsImNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbiIsImluZGV4T3B0aW9ucyIsImNyZWF0ZUluZGV4IiwiZW5zdXJlVW5pcXVlbmVzcyIsIl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZCIsIl9yYXdGaW5kIiwiY291bnQiLCJkaXN0aW5jdCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtRmllbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsInN0YWdlIiwiJGdyb3VwIiwiX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzIiwiJG1hdGNoIiwiX3BhcnNlQWdncmVnYXRlQXJncyIsIiRwcm9qZWN0IiwiX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3MiLCIkZ2VvTmVhciIsInJlc3VsdHMiLCJzcGxpdCIsImluY2x1ZGVzIiwiaXNFbXB0eSIsInJldHVyblZhbHVlIiwiX2NvbnZlcnRUb0RhdGUiLCJzdWJzdHJpbmciLCJEYXRlIiwidG9VcHBlckNhc2UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIiR0ZXh0IiwidGV4dEluZGV4IiwiZHJvcEFsbEluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiY2xhc3NlcyIsInByb21pc2VzIiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2VjdGlvbiIsInN0YXJ0U2Vzc2lvbiIsInN0YXJ0VHJhbnNhY3Rpb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uIiwiZW5kU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBT0E7O0FBSUE7O0FBU0E7O0FBRUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQTtBQUNBLE1BQU1BLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBdkI7O0FBQ0EsTUFBTUMsV0FBVyxHQUFHRixPQUFPLENBQUNFLFdBQTVCO0FBQ0EsTUFBTUMsY0FBYyxHQUFHSCxPQUFPLENBQUNHLGNBQS9CO0FBRUEsTUFBTUMseUJBQXlCLEdBQUcsU0FBbEM7O0FBRUEsTUFBTUMsNEJBQTRCLEdBQUlDLFlBQUQsSUFBa0I7QUFDckQsU0FBT0EsWUFBWSxDQUNoQkMsT0FESSxHQUVKQyxJQUZJLENBRUMsTUFBTUYsWUFBWSxDQUFDRyxRQUFiLENBQXNCQyxXQUF0QixFQUZQLEVBR0pGLElBSEksQ0FHRUUsV0FBRCxJQUFpQjtBQUNyQixXQUFPQSxXQUFXLENBQUNDLE1BQVosQ0FBb0JDLFVBQUQsSUFBZ0I7QUFDeEMsVUFBSUEsVUFBVSxDQUFDQyxTQUFYLENBQXFCQyxLQUFyQixDQUEyQixZQUEzQixDQUFKLEVBQThDO0FBQzVDLGVBQU8sS0FBUDtBQUNELE9BSHVDLENBSXhDO0FBQ0E7OztBQUNBLGFBQ0VGLFVBQVUsQ0FBQ0csY0FBWCxDQUEwQkMsT0FBMUIsQ0FBa0NWLFlBQVksQ0FBQ1csaUJBQS9DLEtBQXFFLENBRHZFO0FBR0QsS0FUTSxDQUFQO0FBVUQsR0FkSSxDQUFQO0FBZUQsQ0FoQkQ7O0FBa0JBLE1BQU1DLCtCQUErQixHQUFHLFVBQW1CO0FBQUEsTUFBYkMsTUFBYTs7QUFDekQsU0FBT0EsTUFBTSxDQUFDQyxNQUFQLENBQWNDLE1BQXJCO0FBQ0EsU0FBT0YsTUFBTSxDQUFDQyxNQUFQLENBQWNFLE1BQXJCOztBQUVBLE1BQUlILE1BQU0s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O0FBQ3ZDLGVBQU8sS0FBSytGLG1CQUFMLENBQXlCL0YsTUFBTSxDQUFDSSxTQUFoQyxDQUFQO0FBQ0QsT0FGZ0IsQ0FBakI7QUFHQSxhQUFPK0MsT0FBTyxDQUFDMkMsR0FBUixDQUFZaUksUUFBWixDQUFQO0FBQ0QsS0FOSSxFQU9KOUssS0FQSSxDQU9HQyxHQUFELElBQVMsS0FBS0csV0FBTCxDQUFpQkgsR0FBakIsQ0FQWCxDQUFQO0FBUUQ7O0FBRUQ4SyxFQUFBQSwwQkFBMEIsR0FBaUI7QUFDekMsVUFBTUMsb0JBQW9CLEdBQUcsS0FBS3RMLE1BQUwsQ0FBWXVMLFlBQVosRUFBN0I7QUFDQUQsSUFBQUEsb0JBQW9CLENBQUNFLGdCQUFyQjtBQUNBLFdBQU9oTCxPQUFPLENBQUNPLE9BQVIsQ0FBZ0J1SyxvQkFBaEIsQ0FBUDtBQUNEOztBQUVERyxFQUFBQSwwQkFBMEIsQ0FBQ0gsb0JBQUQsRUFBMkM7QUFDbkUsV0FBT0Esb0JBQW9CLENBQUNJLGlCQUFyQixHQUF5Q2hQLElBQXpDLENBQThDLE1BQU07QUFDekQ0TyxNQUFBQSxvQkFBb0IsQ0FBQ0ssVUFBckI7QUFDRCxLQUZNLENBQVA7QUFHRDs7QUFFREMsRUFBQUEseUJBQXlCLENBQUNOLG9CQUFELEVBQTJDO0FBQ2xFLFdBQU9BLG9CQUFvQixDQUFDTyxnQkFBckIsR0FBd0NuUCxJQUF4QyxDQUE2QyxNQUFNO0FBQ3hENE8sTUFBQUEsb0JBQW9CLENBQUNLLFVBQXJCO0FBQ0QsS0FGTSxDQUFQO0FBR0Q7O0FBamlDd0Q7OztlQW9pQzVDM00sbUIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IE1vbmdvQ29sbGVjdGlvbiBmcm9tICcuL01vbmdvQ29sbGVjdGlvbic7XG5pbXBvcnQgTW9uZ29TY2hlbWFDb2xsZWN0aW9uIGZyb20gJy4vTW9uZ29TY2hlbWFDb2xsZWN0aW9uJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUge1xuICBTY2hlbWFUeXBlLFxuICBRdWVyeVR5cGUsXG4gIFN0b3JhZ2VDbGFzcyxcbiAgUXVlcnlPcHRpb25zLFxufSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQge1xuICBwYXJzZSBhcyBwYXJzZVVybCxcbiAgZm9ybWF0IGFzIGZvcm1hdFVybCxcbn0gZnJvbSAnLi4vLi4vLi4vdmVuZG9yL21vbmdvZGJVcmwnO1xuaW1wb3J0IHtcbiAgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlLFxuICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QsXG4gIHRyYW5zZm9ybUtleSxcbiAgdHJhbnNmb3JtV2hlcmUsXG4gIHRyYW5zZm9ybVVwZGF0ZSxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbn0gZnJvbSAnLi9Nb25nb1RyYW5zZm9ybSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLi8uLi8uLi9kZWZhdWx0cyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgbW9uZ29kYiA9IHJlcXVpcmUoJ21vbmdvZGInKTtcbmNvbnN0IE1vbmdvQ2xpZW50ID0gbW9uZ29kYi5Nb25nb0NsaWVudDtcbmNvbnN0IFJlYWRQcmVmZXJlbmNlID0gbW9uZ29kYi5SZWFkUHJlZmVyZW5jZTtcblxuY29uc3QgTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSA9ICdfU0NIRU1BJztcblxuY29uc3Qgc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyA9IChtb25nb0FkYXB0ZXIpID0+IHtcbiAgcmV0dXJuIG1vbmdvQWRhcHRlclxuICAgIC5jb25uZWN0KClcbiAgICAudGhlbigoKSA9PiBtb25nb0FkYXB0ZXIuZGF0YWJhc2UuY29sbGVjdGlvbnMoKSlcbiAgICAudGhlbigoY29sbGVjdGlvbnMpID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoKGNvbGxlY3Rpb24pID0+IHtcbiAgICAgICAgaWYgKGNvbGxlY3Rpb24ubmFtZXNwYWNlLm1hdGNoKC9cXC5zeXN0ZW1cXC4vKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPOiBJZiB5b3UgaGF2ZSBvbmUgYXBwIHdpdGggYSBjb2xsZWN0aW9uIHByZWZpeCB0aGF0IGhhcHBlbnMgdG8gYmUgYSBwcmVmaXggb2YgYW5vdGhlclxuICAgICAgICAvLyBhcHBzIHByZWZpeCwgdGhpcyB3aWxsIGdvIHZlcnkgdmVyeSBiYWRseS4gV2Ugc2hvdWxkIGZpeCB0aGF0IHNvbWVob3cuXG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hID0gKHsgLi4uc2NoZW1hIH0pID0+IHtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAvLyBMZWdhY3kgbW9uZ28gYWRhcHRlciBrbm93cyBhYm91dCB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHBhc3N3b3JkIGFuZCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIEZ1dHVyZSBkYXRhYmFzZSBhZGFwdGVycyB3aWxsIG9ubHkga25vdyBhYm91dCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIE5vdGU6IFBhcnNlIFNlcnZlciB3aWxsIGJyaW5nIGJhY2sgcGFzc3dvcmQgd2l0aCBpbmplY3REZWZhdWx0U2NoZW1hLCBzbyB3ZSBkb24ndCBuZWVkXG4gICAgLy8gdG8gYWRkIF9oYXNoZWRfcGFzc3dvcmQgYmFjayBldmVyLlxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuLy8gUmV0dXJucyB7IGNvZGUsIGVycm9yIH0gaWYgaW52YWxpZCwgb3IgeyByZXN1bHQgfSwgYW4gb2JqZWN0XG4vLyBzdWl0YWJsZSBmb3IgaW5zZXJ0aW5nIGludG8gX1NDSEVNQSBjb2xsZWN0aW9uLCBvdGhlcndpc2UuXG5jb25zdCBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAgPSAoXG4gIGZpZWxkcyxcbiAgY2xhc3NOYW1lLFxuICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIGluZGV4ZXNcbikgPT4ge1xuICBjb25zdCBtb25nb09iamVjdCA9IHtcbiAgICBfaWQ6IGNsYXNzTmFtZSxcbiAgICBvYmplY3RJZDogJ3N0cmluZycsXG4gICAgdXBkYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBjcmVhdGVkQXQ6ICdzdHJpbmcnLFxuICAgIF9tZXRhZGF0YTogdW5kZWZpbmVkLFxuICB9O1xuXG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgbW9uZ29PYmplY3RbXG4gICAgICBmaWVsZE5hbWVcbiAgICBdID0gTW9uZ29TY2hlbWFDb2xsZWN0aW9uLnBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICB0eXBlLFxuICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgfSk7XG4gICAgaWYgKGZpZWxkT3B0aW9ucyAmJiBPYmplY3Qua2V5cyhmaWVsZE9wdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyA9XG4gICAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyB8fCB7fTtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9uc1tmaWVsZE5hbWVdID0gZmllbGRPcHRpb25zO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0eXBlb2YgY2xhc3NMZXZlbFBlcm1pc3Npb25zICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICBpZiAoIWNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucztcbiAgICB9IGVsc2Uge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICBpbmRleGVzICYmXG4gICAgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmXG4gICAgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoID4gMFxuICApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmV4cG9ydCBjbGFzcyBNb25nb1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICAvLyBQcml2YXRlXG4gIF91cmk6IHN0cmluZztcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX21vbmdvT3B0aW9uczogT2JqZWN0O1xuICAvLyBQdWJsaWNcbiAgY29ubmVjdGlvblByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIGRhdGFiYXNlOiBhbnk7XG4gIGNsaWVudDogTW9uZ29DbGllbnQ7XG4gIF9tYXhUaW1lTVM6ID9udW1iZXI7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3Ioe1xuICAgIHVyaSA9IGRlZmF1bHRzLkRlZmF1bHRNb25nb1VSSSxcbiAgICBjb2xsZWN0aW9uUHJlZml4ID0gJycsXG4gICAgbW9uZ29PcHRpb25zID0ge30sXG4gIH06IGFueSkge1xuICAgIHRoaXMuX3VyaSA9IHVyaTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMgPSBtb25nb09wdGlvbnM7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zLnVzZU5ld1VybFBhcnNlciA9IHRydWU7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zLnVzZVVuaWZpZWRUb3BvbG9neSA9IHRydWU7XG5cbiAgICAvLyBNYXhUaW1lTVMgaXMgbm90IGEgZ2xvYmFsIE1vbmdvREIgY2xpZW50IG9wdGlvbiwgaXQgaXMgYXBwbGllZCBwZXIgb3BlcmF0aW9uLlxuICAgIHRoaXMuX21heFRpbWVNUyA9IG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gdHJ1ZTtcbiAgICBkZWxldGUgbW9uZ29PcHRpb25zLm1heFRpbWVNUztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuXG4gICAgdGhpcy5jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QoZW5jb2RlZFVyaSwgdGhpcy5fbW9uZ29PcHRpb25zKVxuICAgICAgLnRoZW4oKGNsaWVudCkgPT4ge1xuICAgICAgICAvLyBTdGFydGluZyBtb25nb0RCIDMuMCwgdGhlIE1vbmdvQ2xpZW50LmNvbm5lY3QgZG9uJ3QgcmV0dXJuIGEgREIgYW55bW9yZSBidXQgYSBjbGllbnRcbiAgICAgICAgLy8gRm9ydHVuYXRlbHksIHdlIGNhbiBnZXQgYmFjayB0aGUgb3B0aW9ucyBhbmQgdXNlIHRoZW0gdG8gc2VsZWN0IHRoZSBwcm9wZXIgREIuXG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9tb25nb2RiL25vZGUtbW9uZ29kYi1uYXRpdmUvYmxvYi8yYzM1ZDc2ZjA4NTc0MjI1YjhkYjAyZDdiZWY2ODcxMjNlNmJiMDE4L2xpYi9tb25nb19jbGllbnQuanMjTDg4NVxuICAgICAgICBjb25zdCBvcHRpb25zID0gY2xpZW50LnMub3B0aW9ucztcbiAgICAgICAgY29uc3QgZGF0YWJhc2UgPSBjbGllbnQuZGIob3B0aW9ucy5kYk5hbWUpO1xuICAgICAgICBpZiAoIWRhdGFiYXNlKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGRhdGFiYXNlLm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGRhdGFiYXNlLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgfVxuXG4gIGhhbmRsZUVycm9yPFQ+KGVycm9yOiA/KEVycm9yIHwgUGFyc2UuRXJyb3IpKTogUHJvbWlzZTxUPiB7XG4gICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IDEzKSB7XG4gICAgICAvLyBVbmF1dGhvcml6ZWQgZXJyb3JcbiAgICAgIGRlbGV0ZSB0aGlzLmNsaWVudDtcbiAgICAgIGRlbGV0ZSB0aGlzLmRhdGFiYXNlO1xuICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICBsb2dnZXIuZXJyb3IoJ1JlY2VpdmVkIHVuYXV0aG9yaXplZCBlcnJvcicsIHsgZXJyb3I6IGVycm9yIH0pO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICghdGhpcy5jbGllbnQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50LmNsb3NlKGZhbHNlKTtcbiAgfVxuXG4gIF9hZGFwdGl2ZUNvbGxlY3Rpb24obmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmRhdGFiYXNlLmNvbGxlY3Rpb24odGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUpKVxuICAgICAgLnRoZW4oKHJhd0NvbGxlY3Rpb24pID0+IG5ldyBNb25nb0NvbGxlY3Rpb24ocmF3Q29sbGVjdGlvbikpXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIF9zY2hlbWFDb2xsZWN0aW9uKCk6IFByb21pc2U8TW9uZ29TY2hlbWFDb2xsZWN0aW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSkpXG4gICAgICAudGhlbigoY29sbGVjdGlvbikgPT4gbmV3IE1vbmdvU2NoZW1hQ29sbGVjdGlvbihjb2xsZWN0aW9uKSk7XG4gIH1cblxuICBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YWJhc2VcbiAgICAgICAgICAubGlzdENvbGxlY3Rpb25zKHsgbmFtZTogdGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUgfSlcbiAgICAgICAgICAudG9BcnJheSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9ucykgPT4ge1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbnMubGVuZ3RoID4gMDtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oKHNjaGVtYUNvbGxlY3Rpb24pID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyc6IENMUHMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2goKG5hbWUpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBjb25zdCBwcm9taXNlID0gdGhpcy5kcm9wSW5kZXgoY2xhc3NOYW1lLCBuYW1lKTtcbiAgICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChwcm9taXNlKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBsZXQgaW5zZXJ0UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaW5zZXJ0UHJvbWlzZSA9IHRoaXMuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGVQcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IGluc2VydFByb21pc2UpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbigoc2NoZW1hQ29sbGVjdGlvbikgPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBleGlzdGluZ0luZGV4ZXMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldEluZGV4ZXMoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKGluZGV4ZXMpID0+IHtcbiAgICAgICAgaW5kZXhlcyA9IGluZGV4ZXMucmVkdWNlKChvYmosIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGluZGV4LmtleS5fZnRzKSB7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHM7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHN4O1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBpbmRleC53ZWlnaHRzKSB7XG4gICAgICAgICAgICAgIGluZGV4LmtleVtmaWVsZF0gPSAndGV4dCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9ialtpbmRleC5uYW1lXSA9IGluZGV4LmtleTtcbiAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkudGhlbigoc2NoZW1hQ29sbGVjdGlvbikgPT5cbiAgICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogaW5kZXhlcyB9LFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIC8vIElnbm9yZSBpZiBjb2xsZWN0aW9uIG5vdCBmb3VuZFxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAoXG4gICAgICBzY2hlbWEuZmllbGRzLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgIHNjaGVtYS5pbmRleGVzXG4gICAgKTtcbiAgICBtb25nb09iamVjdC5faWQgPSBjbGFzc05hbWU7XG4gICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgIHt9LFxuICAgICAgc2NoZW1hLmZpZWxkc1xuICAgIClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKChzY2hlbWFDb2xsZWN0aW9uKSA9PiBzY2hlbWFDb2xsZWN0aW9uLmluc2VydFNjaGVtYShtb25nb09iamVjdCkpXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKChzY2hlbWFDb2xsZWN0aW9uKSA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSkpXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PiBjb2xsZWN0aW9uLmRyb3AoKSlcbiAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgIC8vICducyBub3QgZm91bmQnIG1lYW5zIGNvbGxlY3Rpb24gd2FzIGFscmVhZHkgZ29uZS4gSWdub3JlIGRlbGV0aW9uIGF0dGVtcHQuXG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UgPT0gJ25zIG5vdCBmb3VuZCcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC8vIFdlJ3ZlIGRyb3BwZWQgdGhlIGNvbGxlY3Rpb24sIG5vdyByZW1vdmUgdGhlIF9TQ0hFTUEgZG9jdW1lbnRcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgICAudGhlbigoc2NoZW1hQ29sbGVjdGlvbikgPT5cbiAgICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLmZpbmRBbmREZWxldGVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICApXG4gICAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZUFsbENsYXNzZXMoZmFzdDogYm9vbGVhbikge1xuICAgIHJldHVybiBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zKHRoaXMpLnRoZW4oKGNvbGxlY3Rpb25zKSA9PlxuICAgICAgUHJvbWlzZS5hbGwoXG4gICAgICAgIGNvbGxlY3Rpb25zLm1hcCgoY29sbGVjdGlvbikgPT5cbiAgICAgICAgICBmYXN0ID8gY29sbGVjdGlvbi5kZWxldGVNYW55KHt9KSA6IGNvbGxlY3Rpb24uZHJvcCgpXG4gICAgICAgIClcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gUG9pbnRlciBmaWVsZCBuYW1lcyBhcmUgcGFzc2VkIGZvciBsZWdhY3kgcmVhc29uczogdGhlIG9yaWdpbmFsIG1vbmdvXG4gIC8vIGZvcm1hdCBzdG9yZWQgcG9pbnRlciBmaWVsZCBuYW1lcyBkaWZmZXJlbnRseSBpbiB0aGUgZGF0YWJhc2UsIGFuZCB0aGVyZWZvcmVcbiAgLy8gbmVlZGVkIHRvIGtub3cgdGhlIHR5cGUgb2YgdGhlIGZpZWxkIGJlZm9yZSBpdCBjb3VsZCBkZWxldGUgaXQuIEZ1dHVyZSBkYXRhYmFzZVxuICAvLyBhZGFwdGVycyBzaG91bGQgaWdub3JlIHRoZSBwb2ludGVyRmllbGROYW1lcyBhcmd1bWVudC4gQWxsIHRoZSBmaWVsZCBuYW1lcyBhcmUgaW5cbiAgLy8gZmllbGROYW1lcywgdGhleSBzaG93IHVwIGFkZGl0aW9uYWxseSBpbiB0aGUgcG9pbnRlckZpZWxkTmFtZXMgZGF0YWJhc2UgZm9yIHVzZVxuICAvLyBieSB0aGUgbW9uZ28gYWRhcHRlciwgd2hpY2ggZGVhbHMgd2l0aCB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBtb25nb0Zvcm1hdE5hbWVzID0gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSkgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGBfcF8ke2ZpZWxkTmFtZX1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBjb2xsZWN0aW9uVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKChuYW1lKSA9PiB7XG4gICAgICBjb2xsZWN0aW9uVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzY2hlbWFVcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBmaWVsZE5hbWVzLmZvckVhY2goKG5hbWUpID0+IHtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7bmFtZX1gXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkoe30sIGNvbGxlY3Rpb25VcGRhdGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oKHNjaGVtYUNvbGxlY3Rpb24pID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwgc2NoZW1hVXBkYXRlKVxuICAgICAgKVxuICAgICAgLmNhdGNoKChlcnIpID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgZ2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPFN0b3JhZ2VDbGFzc1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oKHNjaGVtYXNDb2xsZWN0aW9uKSA9PlxuICAgICAgICBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEoKVxuICAgICAgKVxuICAgICAgLmNhdGNoKChlcnIpID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U3RvcmFnZUNsYXNzPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oKHNjaGVtYXNDb2xsZWN0aW9uKSA9PlxuICAgICAgICBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpXG4gICAgICApXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRPRE86IEFzIHlldCBub3QgcGFydGljdWxhcmx5IHdlbGwgc3BlY2lmaWVkLiBDcmVhdGVzIGFuIG9iamVjdC4gTWF5YmUgc2hvdWxkbid0IGV2ZW4gbmVlZCB0aGUgc2NoZW1hLFxuICAvLyBhbmQgc2hvdWxkIGluZmVyIGZyb20gdGhlIHR5cGUuIE9yIG1heWJlIGRvZXMgbmVlZCB0aGUgc2NoZW1hIGZvciB2YWxpZGF0aW9ucy4gT3IgbWF5YmUgbmVlZHNcbiAgLy8gdGhlIHNjaGVtYSBvbmx5IGZvciB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC4gV2UnbGwgZmlndXJlIHRoYXQgb3V0IGxhdGVyLlxuICBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZShcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdCxcbiAgICAgIHNjaGVtYVxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbigoY29sbGVjdGlvbikgPT5cbiAgICAgICAgY29sbGVjdGlvbi5pbnNlcnRPbmUobW9uZ29PYmplY3QsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKVxuICAgICAgKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvLyBEdXBsaWNhdGUgdmFsdWVcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLm1lc3NhZ2UubWF0Y2goXG4gICAgICAgICAgICAgIC9pbmRleDpbXFxzYS16QS1aMC05X1xcLVxcLl0rXFwkPyhbYS16QS1aXy1dKylfMS9cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PiB7XG4gICAgICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5kZWxldGVNYW55KG1vbmdvV2hlcmUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLnRoZW4oXG4gICAgICAgICh7IHJlc3VsdCB9KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5uID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAgICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbigoY29sbGVjdGlvbikgPT5cbiAgICAgICAgY29sbGVjdGlvbi51cGRhdGVNYW55KG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbilcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kcyBhbmQgdXBkYXRlcyBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZFVwZGF0ZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwge1xuICAgICAgICAgIHJldHVybk9yaWdpbmFsOiBmYWxzZSxcbiAgICAgICAgICBzZXNzaW9uOiB0cmFuc2FjdGlvbmFsU2Vzc2lvbiB8fCB1bmRlZmluZWQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbigocmVzdWx0KSA9PlxuICAgICAgICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCByZXN1bHQudmFsdWUsIHNjaGVtYSlcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PlxuICAgICAgICBjb2xsZWN0aW9uLnVwc2VydE9uZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pXG4gICAgICApXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgZmluZC4gQWNjZXB0czogY2xhc3NOYW1lLCBxdWVyeSBpbiBQYXJzZSBmb3JtYXQsIGFuZCB7IHNraXAsIGxpbWl0LCBzb3J0IH0uXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICBleHBsYWluLFxuICAgIH06IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1NvcnQgPSBfLm1hcEtleXMoc29ydCwgKHZhbHVlLCBmaWVsZE5hbWUpID0+XG4gICAgICB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSlcbiAgICApO1xuICAgIGNvbnN0IG1vbmdvS2V5cyA9IF8ucmVkdWNlKFxuICAgICAga2V5cyxcbiAgICAgIChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vWydfcnBlcm0nXSA9IDE7XG4gICAgICAgICAgbWVtb1snX3dwZXJtJ10gPSAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1lbW9bdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwga2V5LCBzY2hlbWEpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LFxuICAgICAge31cbiAgICApO1xuXG4gICAgLy8gSWYgd2UgYXJlbid0IHJlcXVlc3RpbmcgdGhlIGBfaWRgIGZpZWxkLCB3ZSBuZWVkIHRvIGV4cGxpY2l0bHkgb3B0IG91dFxuICAgIC8vIG9mIGl0LiBEb2luZyBzbyBpbiBwYXJzZS1zZXJ2ZXIgaXMgdW51c3VhbCwgYnV0IGl0IGNhbiBhbGxvdyB1cyB0b1xuICAgIC8vIG9wdGltaXplIHNvbWUgcXVlcmllcyB3aXRoIGNvdmVyaW5nIGluZGV4ZXMuXG4gICAgaWYgKGtleXMgJiYgIW1vbmdvS2V5cy5faWQpIHtcbiAgICAgIG1vbmdvS2V5cy5faWQgPSAwO1xuICAgIH1cblxuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQobW9uZ29XaGVyZSwge1xuICAgICAgICAgIHNraXAsXG4gICAgICAgICAgbGltaXQsXG4gICAgICAgICAgc29ydDogbW9uZ29Tb3J0LFxuICAgICAgICAgIGtleXM6IG1vbmdvS2V5cyxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4oKG9iamVjdHMpID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAoKG9iamVjdCkgPT5cbiAgICAgICAgICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgaW5kZXhUeXBlOiBhbnkgPSAxXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSkgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goKGZpZWxkTmFtZSkgPT4ge1xuICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3RbZmllbGROYW1lXSA9IGluZGV4VHlwZTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zOiBPYmplY3QgPSB7IGJhY2tncm91bmQ6IHRydWUsIHNwYXJzZTogdHJ1ZSB9O1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9IGluZGV4TmFtZSA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7fTtcbiAgICBjb25zdCBjYXNlSW5zZW5zaXRpdmVPcHRpb25zOiBPYmplY3QgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8geyBjb2xsYXRpb246IE1vbmdvQ29sbGVjdGlvbi5jYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24oKSB9XG4gICAgICA6IHt9O1xuICAgIGNvbnN0IGluZGV4T3B0aW9uczogT2JqZWN0ID0ge1xuICAgICAgLi4uZGVmYXVsdE9wdGlvbnMsXG4gICAgICAuLi5jYXNlSW5zZW5zaXRpdmVPcHRpb25zLFxuICAgICAgLi4uaW5kZXhOYW1lT3B0aW9ucyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgKGNvbGxlY3Rpb24pID0+XG4gICAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChcbiAgICAgICAgICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3QsXG4gICAgICAgICAgICAgIGluZGV4T3B0aW9ucyxcbiAgICAgICAgICAgICAgKGVycm9yKSA9PiAoZXJyb3IgPyByZWplY3QoZXJyb3IpIDogcmVzb2x2ZSgpKVxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lKSA9PlxuICAgICAgdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpXG4gICAgKTtcbiAgICBtb25nb0ZpZWxkTmFtZXMuZm9yRWFjaCgoZmllbGROYW1lKSA9PiB7XG4gICAgICBpbmRleENyZWF0aW9uUmVxdWVzdFtmaWVsZE5hbWVdID0gMTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdClcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ1RyaWVkIHRvIGVuc3VyZSBmaWVsZCB1bmlxdWVuZXNzIGZvciBhIGNsYXNzIHRoYXQgYWxyZWFkeSBoYXMgZHVwbGljYXRlcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQocXVlcnksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKGNvbGxlY3Rpb24pID0+XG4gICAgICAgIGNvbGxlY3Rpb24uY291bnQodHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hLCB0cnVlKSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRpc3RpbmN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB0cmFuc2Zvcm1GaWVsZCA9IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKGNvbGxlY3Rpb24pID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QoXG4gICAgICAgICAgdHJhbnNmb3JtRmllbGQsXG4gICAgICAgICAgdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKVxuICAgICAgICApXG4gICAgICApXG4gICAgICAudGhlbigob2JqZWN0cykgPT4ge1xuICAgICAgICBvYmplY3RzID0gb2JqZWN0cy5maWx0ZXIoKG9iaikgPT4gb2JqICE9IG51bGwpO1xuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAoKG9iamVjdCkgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGxldCBpc1BvaW50ZXJGaWVsZCA9IGZhbHNlO1xuICAgIHBpcGVsaW5lID0gcGlwZWxpbmUubWFwKChzdGFnZSkgPT4ge1xuICAgICAgaWYgKHN0YWdlLiRncm91cCkge1xuICAgICAgICBzdGFnZS4kZ3JvdXAgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHN0YWdlLiRncm91cCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkICYmXG4gICAgICAgICAgdHlwZW9mIHN0YWdlLiRncm91cC5faWQgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZC5pbmRleE9mKCckX3BfJykgPj0gMFxuICAgICAgICApIHtcbiAgICAgICAgICBpc1BvaW50ZXJGaWVsZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgc3RhZ2UuJG1hdGNoID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJG1hdGNoKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBzdGFnZS4kcHJvamVjdCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3MoXG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHN0YWdlLiRwcm9qZWN0XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJGdlb05lYXIpIHtcbiAgICAgICAgc3RhZ2UuJGdlb05lYXIucXVlcnkgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3MoXG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhZ2U7XG4gICAgfSk7XG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKChjb2xsZWN0aW9uKSA9PlxuICAgICAgICBjb2xsZWN0aW9uLmFnZ3JlZ2F0ZShwaXBlbGluZSwge1xuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKChyZXN1bHRzKSA9PiB7XG4gICAgICAgIHJlc3VsdHMuZm9yRWFjaCgocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdfaWQnKSkge1xuICAgICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkICYmIHJlc3VsdC5faWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IHJlc3VsdC5faWQuc3BsaXQoJyQnKVsxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSBudWxsIHx8XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgIChbJ29iamVjdCcsICdzdHJpbmcnXS5pbmNsdWRlcyh0eXBlb2YgcmVzdWx0Ll9pZCkgJiZcbiAgICAgICAgICAgICAgICBfLmlzRW1wdHkocmVzdWx0Ll9pZCkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSByZXN1bHQuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdC5faWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKG9iamVjdHMpID0+XG4gICAgICAgIG9iamVjdHMubWFwKChvYmplY3QpID0+XG4gICAgICAgICAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpXG4gICAgICAgIClcbiAgICAgIClcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIHJlY3Vyc2l2ZWx5IHRyYXZlcnNlIHRoZSBwaXBlbGluZSBhbmQgY29udmVydCBhbnkgUG9pbnRlciBvciBEYXRlIGNvbHVtbnMuXG4gIC8vIElmIHdlIGRldGVjdCBhIHBvaW50ZXIgY29sdW1uIHdlIHdpbGwgcmVuYW1lIHRoZSBjb2x1bW4gYmVpbmcgcXVlcmllZCBmb3IgdG8gbWF0Y2ggdGhlIGNvbHVtblxuICAvLyBpbiB0aGUgZGF0YWJhc2UuIFdlIGFsc28gbW9kaWZ5IHRoZSB2YWx1ZSB0byB3aGF0IHdlIGV4cGVjdCB0aGUgdmFsdWUgdG8gYmUgaW4gdGhlIGRhdGFiYXNlXG4gIC8vIGFzIHdlbGwuXG4gIC8vIEZvciBkYXRlcywgdGhlIGRyaXZlciBleHBlY3RzIGEgRGF0ZSBvYmplY3QsIGJ1dCB3ZSBoYXZlIGEgc3RyaW5nIGNvbWluZyBpbi4gU28gd2UnbGwgY29udmVydFxuICAvLyB0aGUgc3RyaW5nIHRvIGEgRGF0ZSBzbyB0aGUgZHJpdmVyIGNhbiBwZXJmb3JtIHRoZSBuZWNlc3NhcnkgY29tcGFyaXNvbi5cbiAgLy9cbiAgLy8gVGhlIGdvYWwgb2YgdGhpcyBtZXRob2QgaXMgdG8gbG9vayBmb3IgdGhlIFwibGVhdmVzXCIgb2YgdGhlIHBpcGVsaW5lIGFuZCBkZXRlcm1pbmUgaWYgaXQgbmVlZHNcbiAgLy8gdG8gYmUgY29udmVydGVkLiBUaGUgcGlwZWxpbmUgY2FuIGhhdmUgYSBmZXcgZGlmZmVyZW50IGZvcm1zLiBGb3IgbW9yZSBkZXRhaWxzLCBzZWU6XG4gIC8vICAgICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvci9hZ2dyZWdhdGlvbi9cbiAgLy9cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIGFycmF5LCBpdCBtZWFucyB3ZSBhcmUgcHJvYmFibHkgcGFyc2luZyBhbiAnJGFuZCcgb3IgJyRvcicgb3BlcmF0b3IuIEluXG4gIC8vIHRoYXQgY2FzZSB3ZSBuZWVkIHRvIGxvb3AgdGhyb3VnaCBhbGwgb2YgaXQncyBjaGlsZHJlbiB0byBmaW5kIHRoZSBjb2x1bW5zIGJlaW5nIG9wZXJhdGVkIG9uLlxuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gb2JqZWN0LCB0aGVuIHdlJ2xsIGxvb3AgdGhyb3VnaCB0aGUga2V5cyBjaGVja2luZyB0byBzZWUgaWYgdGhlIGtleSBuYW1lXG4gIC8vIG1hdGNoZXMgb25lIG9mIHRoZSBzY2hlbWEgY29sdW1ucy4gSWYgaXQgZG9lcyBtYXRjaCBhIGNvbHVtbiBhbmQgdGhlIGNvbHVtbiBpcyBhIFBvaW50ZXIgb3JcbiAgLy8gYSBEYXRlLCB0aGVuIHdlJ2xsIGNvbnZlcnQgdGhlIHZhbHVlIGFzIGRlc2NyaWJlZCBhYm92ZS5cbiAgLy9cbiAgLy8gQXMgbXVjaCBhcyBJIGhhdGUgcmVjdXJzaW9uLi4udGhpcyBzZWVtZWQgbGlrZSBhIGdvb2QgZml0IGZvciBpdC4gV2UncmUgZXNzZW50aWFsbHkgdHJhdmVyc2luZ1xuICAvLyBkb3duIGEgdHJlZSB0byBmaW5kIGEgXCJsZWFmIG5vZGVcIiBhbmQgY2hlY2tpbmcgdG8gc2VlIGlmIGl0IG5lZWRzIHRvIGJlIGNvbnZlcnRlZC5cbiAgX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgaWYgKHBpcGVsaW5lID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICByZXR1cm4gcGlwZWxpbmUubWFwKCh2YWx1ZSkgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBpcGVsaW5lW2ZpZWxkXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIC8vIFBhc3Mgb2JqZWN0cyBkb3duIHRvIE1vbmdvREIuLi50aGlzIGlzIG1vcmUgdGhhbiBsaWtlbHkgYW4gJGV4aXN0cyBvcGVyYXRvci5cbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtcbiAgICAgICAgICAgICAgYF9wXyR7ZmllbGR9YFxuICAgICAgICAgICAgXSA9IGAke3NjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzfSQke3BpcGVsaW5lW2ZpZWxkXX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJlxuICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdEYXRlJ1xuICAgICAgICApIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9jb252ZXJ0VG9EYXRlKHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKFxuICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgcGlwZWxpbmVbZmllbGRdXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSBvbmUgYWJvdmUuIFJhdGhlciB0aGFuIHRyeWluZyB0byBjb21iaW5lIHRoZXNlXG4gIC8vIHR3byBmdW5jdGlvbnMgYW5kIG1ha2luZyB0aGUgY29kZSBldmVuIGhhcmRlciB0byB1bmRlcnN0YW5kLCBJIGRlY2lkZWQgdG8gc3BsaXQgaXQgdXAuIFRoZVxuICAvLyBkaWZmZXJlbmNlIHdpdGggdGhpcyBmdW5jdGlvbiBpcyB3ZSBhcmUgbm90IHRyYW5zZm9ybWluZyB0aGUgdmFsdWVzLCBvbmx5IHRoZSBrZXlzIG9mIHRoZVxuICAvLyBwaXBlbGluZS5cbiAgX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSB0d28gYWJvdmUuIE1vbmdvREIgJGdyb3VwIGFnZ3JlZ2F0ZSBsb29rcyBsaWtlOlxuICAvLyAgICAgeyAkZ3JvdXA6IHsgX2lkOiA8ZXhwcmVzc2lvbj4sIDxmaWVsZDE+OiB7IDxhY2N1bXVsYXRvcjE+IDogPGV4cHJlc3Npb24xPiB9LCAuLi4gfSB9XG4gIC8vIFRoZSA8ZXhwcmVzc2lvbj4gY291bGQgYmUgYSBjb2x1bW4gbmFtZSwgcHJlZml4ZWQgd2l0aCB0aGUgJyQnIGNoYXJhY3Rlci4gV2UnbGwgbG9vayBmb3JcbiAgLy8gdGhlc2UgPGV4cHJlc3Npb24+IGFuZCBjaGVjayB0byBzZWUgaWYgaXQgaXMgYSAnUG9pbnRlcicgb3IgaWYgaXQncyBvbmUgb2YgY3JlYXRlZEF0LFxuICAvLyB1cGRhdGVkQXQgb3Igb2JqZWN0SWQgYW5kIGNoYW5nZSBpdCBhY2NvcmRpbmdseS5cbiAgX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAoKHZhbHVlKSA9PlxuICAgICAgICB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHZhbHVlKVxuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKFxuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICBwaXBlbGluZVtmaWVsZF1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gcGlwZWxpbmUuc3Vic3RyaW5nKDEpO1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCRfcF8ke2ZpZWxkfWA7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF9jcmVhdGVkX2F0JztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX3VwZGF0ZWRfYXQnO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgYXR0ZW1wdCB0byBjb252ZXJ0IHRoZSBwcm92aWRlZCB2YWx1ZSB0byBhIERhdGUgb2JqZWN0LiBTaW5jZSB0aGlzIGlzIHBhcnRcbiAgLy8gb2YgYW4gYWdncmVnYXRpb24gcGlwZWxpbmUsIHRoZSB2YWx1ZSBjYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGl0IGNhbiBiZSBhbm90aGVyIG9iamVjdCB3aXRoXG4gIC8vIGFuIG9wZXJhdG9yIGluIGl0IChsaWtlICRndCwgJGx0LCBldGMpLiBCZWNhdXNlIG9mIHRoaXMgSSBmZWx0IGl0IHdhcyBlYXNpZXIgdG8gbWFrZSB0aGlzIGFcbiAgLy8gcmVjdXJzaXZlIG1ldGhvZCB0byB0cmF2ZXJzZSBkb3duIHRvIHRoZSBcImxlYWYgbm9kZVwiIHdoaWNoIGlzIGdvaW5nIHRvIGJlIHRoZSBzdHJpbmcuXG4gIF9jb252ZXJ0VG9EYXRlKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiB2YWx1ZSkge1xuICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZSh2YWx1ZVtmaWVsZF0pO1xuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICBfcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZTogP3N0cmluZyk6ID9zdHJpbmcge1xuICAgIGlmIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgcmVhZFByZWZlcmVuY2UgPSByZWFkUHJlZmVyZW5jZS50b1VwcGVyQ2FzZSgpO1xuICAgIH1cbiAgICBzd2l0Y2ggKHJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICBjYXNlICdQUklNQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BSSU1BUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUlknOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlNFQ09OREFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUllfUFJFRkVSUkVEO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ05FQVJFU1QnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLk5FQVJFU1Q7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSB1bmRlZmluZWQ6XG4gICAgICBjYXNlIG51bGw6XG4gICAgICBjYXNlICcnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICdOb3Qgc3VwcG9ydGVkIHJlYWQgcHJlZmVyZW5jZS4nXG4gICAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjcmVhdGVJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXgsIHsgYmFja2dyb3VuZDogdHJ1ZSB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleGVzKGluZGV4ZXMsIHsgYmFja2dyb3VuZDogdHJ1ZSB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgaWYgKHR5cGUgJiYgdHlwZS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0ge1xuICAgICAgICBbZmllbGROYW1lXTogJzJkc3BoZXJlJyxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVJbmRleChjbGFzc05hbWUsIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHNjaGVtYTogYW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgICBpZiAoIXF1ZXJ5W2ZpZWxkTmFtZV0gfHwgIXF1ZXJ5W2ZpZWxkTmFtZV0uJHRleHQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleGlzdGluZ0luZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGV4aXN0aW5nSW5kZXhlcykge1xuICAgICAgICBjb25zdCBpbmRleCA9IGV4aXN0aW5nSW5kZXhlc1trZXldO1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGluZGV4LCBmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBpbmRleE5hbWUgPSBgJHtmaWVsZE5hbWV9X3RleHRgO1xuICAgICAgY29uc3QgdGV4dEluZGV4ID0ge1xuICAgICAgICBbaW5kZXhOYW1lXTogeyBbZmllbGROYW1lXTogJ3RleHQnIH0sXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgdGV4dEluZGV4LFxuICAgICAgICBleGlzdGluZ0luZGV4ZXMsXG4gICAgICAgIHNjaGVtYS5maWVsZHNcbiAgICAgICkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSA4NSkge1xuICAgICAgICAgIC8vIEluZGV4IGV4aXN0IHdpdGggZGlmZmVyZW50IG9wdGlvbnNcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKGNvbGxlY3Rpb24pID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5pbmRleGVzKCkpXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRyb3BJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKGNvbGxlY3Rpb24pID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKChlcnIpID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wQWxsSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKGNvbGxlY3Rpb24pID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXhlcygpKVxuICAgICAgLmNhdGNoKChlcnIpID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiB0aGlzLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oKGNsYXNzZXMpID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBjbGFzc2VzLm1hcCgoc2NoZW1hKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc0Zyb21Nb25nbyhzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZWN0aW9uID0gdGhpcy5jbGllbnQuc3RhcnRTZXNzaW9uKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uc3RhcnRUcmFuc2FjdGlvbigpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlY3Rpb24pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvbi5jb21taXRUcmFuc2FjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmFib3J0VHJhbnNhY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmVuZFNlc3Npb24oKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuIl19