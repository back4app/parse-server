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
    readPreference
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
    }, {});

    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema).then(() => this._adaptiveCollection(className)).then(collection => collection.find(mongoWhere, {
      skip,
      limit,
      sort: mongoSort,
      keys: mongoKeys,
      maxTimeMS: this._maxTimeMS,
      readPreference
    })).then(objects => objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema))).catch(err => this.handleError(err));
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


  count(className, schema, query, readPreference) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference
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

  aggregate(className, schema, pipeline, readPreference) {
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

      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.aggregate(pipeline, {
      readPreference,
      maxTimeMS: this._maxTimeMS
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsibW9uZ29kYiIsInJlcXVpcmUiLCJNb25nb0NsaWVudCIsIlJlYWRQcmVmZXJlbmNlIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSIsInN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMiLCJtb25nb0FkYXB0ZXIiLCJjb25uZWN0IiwidGhlbiIsImRhdGFiYXNlIiwiY29sbGVjdGlvbnMiLCJmaWx0ZXIiLCJjb2xsZWN0aW9uIiwibmFtZXNwYWNlIiwibWF0Y2giLCJjb2xsZWN0aW9uTmFtZSIsImluZGV4T2YiLCJfY29sbGVjdGlvblByZWZpeCIsImNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEiLCJzY2hlbWEiLCJmaWVsZHMiLCJfcnBlcm0iLCJfd3Blcm0iLCJjbGFzc05hbWUiLCJfaGFzaGVkX3Bhc3N3b3JkIiwibW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsIm1vbmdvT2JqZWN0IiwiX2lkIiwib2JqZWN0SWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJfbWV0YWRhdGEiLCJ1bmRlZmluZWQiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmaWVsZE9wdGlvbnMiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJPYmplY3QiLCJrZXlzIiwibGVuZ3RoIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJjb25uZWN0aW9uUHJvbWlzZSIsImVuY29kZWRVcmkiLCJjbGllbnQiLCJvcHRpb25zIiwicyIsImRiIiwiZGJOYW1lIiwib24iLCJjYXRjaCIsImVyciIsIlByb21pc2UiLCJyZWplY3QiLCJoYW5kbGVFcnJvciIsImVycm9yIiwiY29kZSIsImxvZ2dlciIsImhhbmRsZVNodXRkb3duIiwicmVzb2x2ZSIsImNsb3NlIiwiX2FkYXB0aXZlQ29sbGVjdGlvbiIsIm5hbWUiLCJyYXdDb2xsZWN0aW9uIiwiTW9uZ29Db2xsZWN0aW9uIiwiX3NjaGVtYUNvbGxlY3Rpb24iLCJjbGFzc0V4aXN0cyIsImxpc3RDb2xsZWN0aW9ucyIsInRvQXJyYXkiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2NoZW1hQ29sbGVjdGlvbiIsInVwZGF0ZVNjaGVtYSIsIiRzZXQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmb3JFYWNoIiwiZmllbGQiLCJfX29wIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicHVzaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImluc2VydFByb21pc2UiLCJjcmVhdGVJbmRleGVzIiwiYWxsIiwic2V0SW5kZXhlc0Zyb21Nb25nbyIsImdldEluZGV4ZXMiLCJyZWR1Y2UiLCJvYmoiLCJpbmRleCIsIl9mdHMiLCJfZnRzeCIsIndlaWdodHMiLCJjcmVhdGVDbGFzcyIsImluc2VydFNjaGVtYSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJkZWxldGVDbGFzcyIsImRyb3AiLCJtZXNzYWdlIiwiZmluZEFuZERlbGV0ZVNjaGVtYSIsImRlbGV0ZUFsbENsYXNzZXMiLCJmYXN0IiwibWFwIiwiZGVsZXRlTWFueSIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJtb25nb0Zvcm1hdE5hbWVzIiwiY29sbGVjdGlvblVwZGF0ZSIsIiR1bnNldCIsInNjaGVtYVVwZGF0ZSIsInVwZGF0ZU1hbnkiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hc0NvbGxlY3Rpb24iLCJfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEiLCJnZXRDbGFzcyIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwiY3JlYXRlT2JqZWN0Iiwib2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJpbnNlcnRPbmUiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1bmRlcmx5aW5nRXJyb3IiLCJtYXRjaGVzIiwiQXJyYXkiLCJpc0FycmF5IiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJxdWVyeSIsIm1vbmdvV2hlcmUiLCJyZXN1bHQiLCJuIiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwiX21vbmdvQ29sbGVjdGlvbiIsInJldHVybk9yaWdpbmFsIiwic2Vzc2lvbiIsInZhbHVlIiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsIm1vbmdvU29ydCIsIl8iLCJtYXBLZXlzIiwibW9uZ29LZXlzIiwibWVtbyIsIl9wYXJzZVJlYWRQcmVmZXJlbmNlIiwiY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZCIsIm9iamVjdHMiLCJlbnN1cmVVbmlxdWVuZXNzIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJzdGFnZSIsIiRncm91cCIsIl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyIsIiRtYXRjaCIsIl9wYXJzZUFnZ3JlZ2F0ZUFyZ3MiLCIkcHJvamVjdCIsIl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzIiwicmVzdWx0cyIsInNwbGl0IiwiaW5jbHVkZXMiLCJpc0VtcHR5IiwicmV0dXJuVmFsdWUiLCJfY29udmVydFRvRGF0ZSIsInN1YnN0cmluZyIsIkRhdGUiLCJ0b1VwcGVyQ2FzZSIsIlBSSU1BUlkiLCJQUklNQVJZX1BSRUZFUlJFRCIsIlNFQ09OREFSWSIsIlNFQ09OREFSWV9QUkVGRVJSRUQiLCJORUFSRVNUIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiY3JlYXRlSW5kZXgiLCJiYWNrZ3JvdW5kIiwiJHRleHQiLCJpbmRleE5hbWUiLCJ0ZXh0SW5kZXgiLCJkcm9wQWxsSW5kZXhlcyIsImRyb3BJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJjbGFzc2VzIiwicHJvbWlzZXMiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZWN0aW9uIiwic3RhcnRTZXNzaW9uIiwic3RhcnRUcmFuc2FjdGlvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb24iLCJlbmRTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb24iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7QUFPQTs7QUFJQTs7QUFTQTs7QUFFQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVBO0FBQ0EsTUFBTUEsT0FB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TyxLQUFLK0YsbUJBQUwsQ0FBeUIvRixNQUFNLENBQUNJLFNBQWhDLENBQVA7QUFDRCxPQUZnQixDQUFqQjtBQUdBLGFBQU8rQyxPQUFPLENBQUMyQyxHQUFSLENBQVlvSCxRQUFaLENBQVA7QUFDRCxLQU5JLEVBT0pqSyxLQVBJLENBT0VDLEdBQUcsSUFBSSxLQUFLRyxXQUFMLENBQWlCSCxHQUFqQixDQVBULENBQVA7QUFRRDs7QUFFRGlLLEVBQUFBLDBCQUEwQixHQUFpQjtBQUN6QyxVQUFNQyxvQkFBb0IsR0FBRyxLQUFLekssTUFBTCxDQUFZMEssWUFBWixFQUE3QjtBQUNBRCxJQUFBQSxvQkFBb0IsQ0FBQ0UsZ0JBQXJCO0FBQ0EsV0FBT25LLE9BQU8sQ0FBQ08sT0FBUixDQUFnQjBKLG9CQUFoQixDQUFQO0FBQ0Q7O0FBRURHLEVBQUFBLDBCQUEwQixDQUFDSCxvQkFBRCxFQUEyQztBQUNuRSxXQUFPQSxvQkFBb0IsQ0FBQ0ksaUJBQXJCLEdBQXlDbk8sSUFBekMsQ0FBOEMsTUFBTTtBQUN6RCtOLE1BQUFBLG9CQUFvQixDQUFDSyxVQUFyQjtBQUNELEtBRk0sQ0FBUDtBQUdEOztBQUVEQyxFQUFBQSx5QkFBeUIsQ0FBQ04sb0JBQUQsRUFBMkM7QUFDbEUsV0FBT0Esb0JBQW9CLENBQUNPLGdCQUFyQixHQUF3Q3RPLElBQXhDLENBQTZDLE1BQU07QUFDeEQrTixNQUFBQSxvQkFBb0IsQ0FBQ0ssVUFBckI7QUFDRCxLQUZNLENBQVA7QUFHRDs7QUFuOUJ3RDs7O2VBczlCNUM5TCxtQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYVR5cGUsXG4gIFF1ZXJ5VHlwZSxcbiAgU3RvcmFnZUNsYXNzLFxuICBRdWVyeU9wdGlvbnMsXG59IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB7XG4gIHBhcnNlIGFzIHBhcnNlVXJsLFxuICBmb3JtYXQgYXMgZm9ybWF0VXJsLFxufSBmcm9tICcuLi8uLi8uLi92ZW5kb3IvbW9uZ29kYlVybCc7XG5pbXBvcnQge1xuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCxcbiAgdHJhbnNmb3JtS2V5LFxuICB0cmFuc2Zvcm1XaGVyZSxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nLFxufSBmcm9tICcuL01vbmdvVHJhbnNmb3JtJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uLy4uLy4uL2RlZmF1bHRzJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vLi4vLi4vbG9nZ2VyJztcblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBtb25nb2RiID0gcmVxdWlyZSgnbW9uZ29kYicpO1xuY29uc3QgTW9uZ29DbGllbnQgPSBtb25nb2RiLk1vbmdvQ2xpZW50O1xuY29uc3QgUmVhZFByZWZlcmVuY2UgPSBtb25nb2RiLlJlYWRQcmVmZXJlbmNlO1xuXG5jb25zdCBNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lID0gJ19TQ0hFTUEnO1xuXG5jb25zdCBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zID0gbW9uZ29BZGFwdGVyID0+IHtcbiAgcmV0dXJuIG1vbmdvQWRhcHRlclxuICAgIC5jb25uZWN0KClcbiAgICAudGhlbigoKSA9PiBtb25nb0FkYXB0ZXIuZGF0YWJhc2UuY29sbGVjdGlvbnMoKSlcbiAgICAudGhlbihjb2xsZWN0aW9ucyA9PiB7XG4gICAgICByZXR1cm4gY29sbGVjdGlvbnMuZmlsdGVyKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBpZiAoY29sbGVjdGlvbi5uYW1lc3BhY2UubWF0Y2goL1xcLnN5c3RlbVxcLi8pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRPRE86IElmIHlvdSBoYXZlIG9uZSBhcHAgd2l0aCBhIGNvbGxlY3Rpb24gcHJlZml4IHRoYXQgaGFwcGVucyB0byBiZSBhIHByZWZpeCBvZiBhbm90aGVyXG4gICAgICAgIC8vIGFwcHMgcHJlZml4LCB0aGlzIHdpbGwgZ28gdmVyeSB2ZXJ5IGJhZGx5LiBXZSBzaG91bGQgZml4IHRoYXQgc29tZWhvdy5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBjb2xsZWN0aW9uLmNvbGxlY3Rpb25OYW1lLmluZGV4T2YobW9uZ29BZGFwdGVyLl9jb2xsZWN0aW9uUHJlZml4KSA9PSAwXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIC8vIExlZ2FjeSBtb25nbyBhZGFwdGVyIGtub3dzIGFib3V0IHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gcGFzc3dvcmQgYW5kIF9oYXNoZWRfcGFzc3dvcmQuXG4gICAgLy8gRnV0dXJlIGRhdGFiYXNlIGFkYXB0ZXJzIHdpbGwgb25seSBrbm93IGFib3V0IF9oYXNoZWRfcGFzc3dvcmQuXG4gICAgLy8gTm90ZTogUGFyc2UgU2VydmVyIHdpbGwgYnJpbmcgYmFjayBwYXNzd29yZCB3aXRoIGluamVjdERlZmF1bHRTY2hlbWEsIHNvIHdlIGRvbid0IG5lZWRcbiAgICAvLyB0byBhZGQgX2hhc2hlZF9wYXNzd29yZCBiYWNrIGV2ZXIuXG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG4vLyBSZXR1cm5zIHsgY29kZSwgZXJyb3IgfSBpZiBpbnZhbGlkLCBvciB7IHJlc3VsdCB9LCBhbiBvYmplY3Rcbi8vIHN1aXRhYmxlIGZvciBpbnNlcnRpbmcgaW50byBfU0NIRU1BIGNvbGxlY3Rpb24sIG90aGVyd2lzZS5cbmNvbnN0IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUCA9IChcbiAgZmllbGRzLFxuICBjbGFzc05hbWUsXG4gIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgaW5kZXhlc1xuKSA9PiB7XG4gIGNvbnN0IG1vbmdvT2JqZWN0ID0ge1xuICAgIF9pZDogY2xhc3NOYW1lLFxuICAgIG9iamVjdElkOiAnc3RyaW5nJyxcbiAgICB1cGRhdGVkQXQ6ICdzdHJpbmcnLFxuICAgIGNyZWF0ZWRBdDogJ3N0cmluZycsXG4gICAgX21ldGFkYXRhOiB1bmRlZmluZWQsXG4gIH07XG5cbiAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgY29uc3QgeyB0eXBlLCB0YXJnZXRDbGFzcywgLi4uZmllbGRPcHRpb25zIH0gPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICBtb25nb09iamVjdFtcbiAgICAgIGZpZWxkTmFtZVxuICAgIF0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID1cbiAgICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgIGluZGV4ZXMgJiZcbiAgICB0eXBlb2YgaW5kZXhlcyA9PT0gJ29iamVjdCcgJiZcbiAgICBPYmplY3Qua2V5cyhpbmRleGVzKS5sZW5ndGggPiAwXG4gICkge1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cblxuICBpZiAoIW1vbmdvT2JqZWN0Ll9tZXRhZGF0YSkge1xuICAgIC8vIGNsZWFudXAgdGhlIHVudXNlZCBfbWV0YWRhdGFcbiAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhO1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvT2JqZWN0O1xufTtcblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZTxhbnk+O1xuICBkYXRhYmFzZTogYW55O1xuICBjbGllbnQ6IE1vbmdvQ2xpZW50O1xuICBfbWF4VGltZU1TOiA/bnVtYmVyO1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuXG4gIGNvbnN0cnVjdG9yKHtcbiAgICB1cmkgPSBkZWZhdWx0cy5EZWZhdWx0TW9uZ29VUkksXG4gICAgY29sbGVjdGlvblByZWZpeCA9ICcnLFxuICAgIG1vbmdvT3B0aW9ucyA9IHt9LFxuICB9OiBhbnkpIHtcbiAgICB0aGlzLl91cmkgPSB1cmk7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zID0gbW9uZ29PcHRpb25zO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VOZXdVcmxQYXJzZXIgPSB0cnVlO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VVbmlmaWVkVG9wb2xvZ3kgPSB0cnVlO1xuXG4gICAgLy8gTWF4VGltZU1TIGlzIG5vdCBhIGdsb2JhbCBNb25nb0RCIGNsaWVudCBvcHRpb24sIGl0IGlzIGFwcGxpZWQgcGVyIG9wZXJhdGlvbi5cbiAgICB0aGlzLl9tYXhUaW1lTVMgPSBtb25nb09wdGlvbnMubWF4VGltZU1TO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IHRydWU7XG4gICAgZGVsZXRlIG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gIH1cblxuICBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLmNvbm5lY3Rpb25Qcm9taXNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICB9XG5cbiAgICAvLyBwYXJzaW5nIGFuZCByZS1mb3JtYXR0aW5nIGNhdXNlcyB0aGUgYXV0aCB2YWx1ZSAoaWYgdGhlcmUpIHRvIGdldCBVUklcbiAgICAvLyBlbmNvZGVkXG4gICAgY29uc3QgZW5jb2RlZFVyaSA9IGZvcm1hdFVybChwYXJzZVVybCh0aGlzLl91cmkpKTtcblxuICAgIHRoaXMuY29ubmVjdGlvblByb21pc2UgPSBNb25nb0NsaWVudC5jb25uZWN0KGVuY29kZWRVcmksIHRoaXMuX21vbmdvT3B0aW9ucylcbiAgICAgIC50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIC8vIFN0YXJ0aW5nIG1vbmdvREIgMy4wLCB0aGUgTW9uZ29DbGllbnQuY29ubmVjdCBkb24ndCByZXR1cm4gYSBEQiBhbnltb3JlIGJ1dCBhIGNsaWVudFxuICAgICAgICAvLyBGb3J0dW5hdGVseSwgd2UgY2FuIGdldCBiYWNrIHRoZSBvcHRpb25zIGFuZCB1c2UgdGhlbSB0byBzZWxlY3QgdGhlIHByb3BlciBEQi5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vbmdvZGIvbm9kZS1tb25nb2RiLW5hdGl2ZS9ibG9iLzJjMzVkNzZmMDg1NzQyMjViOGRiMDJkN2JlZjY4NzEyM2U2YmIwMTgvbGliL21vbmdvX2NsaWVudC5qcyNMODg1XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjbGllbnQucy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkYXRhYmFzZSA9IGNsaWVudC5kYihvcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIGlmICghZGF0YWJhc2UpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZGF0YWJhc2Uub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgZGF0YWJhc2Uub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5jbGllbnQgPSBjbGllbnQ7XG4gICAgICAgIHRoaXMuZGF0YWJhc2UgPSBkYXRhYmFzZTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgfVxuXG4gIGhhbmRsZUVycm9yPFQ+KGVycm9yOiA/KEVycm9yIHwgUGFyc2UuRXJyb3IpKTogUHJvbWlzZTxUPiB7XG4gICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IDEzKSB7XG4gICAgICAvLyBVbmF1dGhvcml6ZWQgZXJyb3JcbiAgICAgIGRlbGV0ZSB0aGlzLmNsaWVudDtcbiAgICAgIGRlbGV0ZSB0aGlzLmRhdGFiYXNlO1xuICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICBsb2dnZXIuZXJyb3IoJ1JlY2VpdmVkIHVuYXV0aG9yaXplZCBlcnJvcicsIHsgZXJyb3I6IGVycm9yIH0pO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICghdGhpcy5jbGllbnQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50LmNsb3NlKGZhbHNlKTtcbiAgfVxuXG4gIF9hZGFwdGl2ZUNvbGxlY3Rpb24obmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmRhdGFiYXNlLmNvbGxlY3Rpb24odGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUpKVxuICAgICAgLnRoZW4ocmF3Q29sbGVjdGlvbiA9PiBuZXcgTW9uZ29Db2xsZWN0aW9uKHJhd0NvbGxlY3Rpb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgX3NjaGVtYUNvbGxlY3Rpb24oKTogUHJvbWlzZTxNb25nb1NjaGVtYUNvbGxlY3Rpb24+IHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gbmV3IE1vbmdvU2NoZW1hQ29sbGVjdGlvbihjb2xsZWN0aW9uKSk7XG4gIH1cblxuICBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YWJhc2VcbiAgICAgICAgICAubGlzdENvbGxlY3Rpb25zKHsgbmFtZTogdGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUgfSlcbiAgICAgICAgICAudG9BcnJheSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb25zLmxlbmd0aCA+IDA7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyc6IENMUHMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlUHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmRyb3BJbmRleChjbGFzc05hbWUsIG5hbWUpO1xuICAgICAgICBkZWxldGVQcm9taXNlcy5wdXNoKHByb21pc2UpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBsZXQgaW5zZXJ0UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaW5zZXJ0UHJvbWlzZSA9IHRoaXMuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGVQcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IGluc2VydFByb21pc2UpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogZXhpc3RpbmdJbmRleGVzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0SW5kZXhlcyhjbGFzc05hbWUpXG4gICAgICAudGhlbihpbmRleGVzID0+IHtcbiAgICAgICAgaW5kZXhlcyA9IGluZGV4ZXMucmVkdWNlKChvYmosIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGluZGV4LmtleS5fZnRzKSB7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHM7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHN4O1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBpbmRleC53ZWlnaHRzKSB7XG4gICAgICAgICAgICAgIGluZGV4LmtleVtmaWVsZF0gPSAndGV4dCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9ialtpbmRleC5uYW1lXSA9IGluZGV4LmtleTtcbiAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGluZGV4ZXMgfSxcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgLy8gSWdub3JlIGlmIGNvbGxlY3Rpb24gbm90IGZvdW5kXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUChcbiAgICAgIHNjaGVtYS5maWVsZHMsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgc2NoZW1hLmluZGV4ZXNcbiAgICApO1xuICAgIG1vbmdvT2JqZWN0Ll9pZCA9IGNsYXNzTmFtZTtcbiAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYS5pbmRleGVzLFxuICAgICAge30sXG4gICAgICBzY2hlbWEuZmllbGRzXG4gICAgKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmluc2VydFNjaGVtYShtb25nb09iamVjdCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBhZGRGaWVsZElmTm90RXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IGFueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24uYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSlcbiAgICAgIClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5kcm9wKCkpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gJ25zIG5vdCBmb3VuZCcgbWVhbnMgY29sbGVjdGlvbiB3YXMgYWxyZWFkeSBnb25lLiBJZ25vcmUgZGVsZXRpb24gYXR0ZW1wdC5cbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSA9PSAnbnMgbm90IGZvdW5kJykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLy8gV2UndmUgZHJvcHBlZCB0aGUgY29sbGVjdGlvbiwgbm93IHJlbW92ZSB0aGUgX1NDSEVNQSBkb2N1bWVudFxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLmZpbmRBbmREZWxldGVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICApXG4gICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICk7XG4gIH1cblxuICBkZWxldGVBbGxDbGFzc2VzKGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyh0aGlzKS50aGVuKGNvbGxlY3Rpb25zID0+XG4gICAgICBQcm9taXNlLmFsbChcbiAgICAgICAgY29sbGVjdGlvbnMubWFwKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgICBmYXN0ID8gY29sbGVjdGlvbi5kZWxldGVNYW55KHt9KSA6IGNvbGxlY3Rpb24uZHJvcCgpXG4gICAgICAgIClcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gUG9pbnRlciBmaWVsZCBuYW1lcyBhcmUgcGFzc2VkIGZvciBsZWdhY3kgcmVhc29uczogdGhlIG9yaWdpbmFsIG1vbmdvXG4gIC8vIGZvcm1hdCBzdG9yZWQgcG9pbnRlciBmaWVsZCBuYW1lcyBkaWZmZXJlbnRseSBpbiB0aGUgZGF0YWJhc2UsIGFuZCB0aGVyZWZvcmVcbiAgLy8gbmVlZGVkIHRvIGtub3cgdGhlIHR5cGUgb2YgdGhlIGZpZWxkIGJlZm9yZSBpdCBjb3VsZCBkZWxldGUgaXQuIEZ1dHVyZSBkYXRhYmFzZVxuICAvLyBhZGFwdGVycyBzaG91bGQgaWdub3JlIHRoZSBwb2ludGVyRmllbGROYW1lcyBhcmd1bWVudC4gQWxsIHRoZSBmaWVsZCBuYW1lcyBhcmUgaW5cbiAgLy8gZmllbGROYW1lcywgdGhleSBzaG93IHVwIGFkZGl0aW9uYWxseSBpbiB0aGUgcG9pbnRlckZpZWxkTmFtZXMgZGF0YWJhc2UgZm9yIHVzZVxuICAvLyBieSB0aGUgbW9uZ28gYWRhcHRlciwgd2hpY2ggZGVhbHMgd2l0aCB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBtb25nb0Zvcm1hdE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgX3BfJHtmaWVsZE5hbWV9YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZE5hbWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgY29sbGVjdGlvblVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25VcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNjaGVtYVVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7bmFtZX1gXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KHt9LCBjb2xsZWN0aW9uVXBkYXRlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCBzY2hlbWFVcGRhdGUpXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgZ2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPFN0b3JhZ2VDbGFzc1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hc0NvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hc0NvbGxlY3Rpb24uX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BKClcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3M+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUT0RPOiBBcyB5ZXQgbm90IHBhcnRpY3VsYXJseSB3ZWxsIHNwZWNpZmllZC4gQ3JlYXRlcyBhbiBvYmplY3QuIE1heWJlIHNob3VsZG4ndCBldmVuIG5lZWQgdGhlIHNjaGVtYSxcbiAgLy8gYW5kIHNob3VsZCBpbmZlciBmcm9tIHRoZSB0eXBlLiBPciBtYXliZSBkb2VzIG5lZWQgdGhlIHNjaGVtYSBmb3IgdmFsaWRhdGlvbnMuIE9yIG1heWJlIG5lZWRzXG4gIC8vIHRoZSBzY2hlbWEgb25seSBmb3IgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuIFdlJ2xsIGZpZ3VyZSB0aGF0IG91dCBsYXRlci5cbiAgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBvYmplY3QsXG4gICAgICBzY2hlbWFcbiAgICApO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmluc2VydE9uZShtb25nb09iamVjdCwgdHJhbnNhY3Rpb25hbFNlc3Npb24pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvLyBEdXBsaWNhdGUgdmFsdWVcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLm1lc3NhZ2UubWF0Y2goXG4gICAgICAgICAgICAgIC9pbmRleDpbXFxzYS16QS1aMC05X1xcLVxcLl0rXFwkPyhbYS16QS1aXy1dKylfMS9cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkobW9uZ29XaGVyZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLnRoZW4oXG4gICAgICAgICh7IHJlc3VsdCB9KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5uID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAgICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24udXBkYXRlTWFueShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmRzIGFuZCB1cGRhdGVzIGFuIG9iamVjdCBiYXNlZCBvbiBxdWVyeS5cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZFVwZGF0ZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwge1xuICAgICAgICAgIHJldHVybk9yaWdpbmFsOiBmYWxzZSxcbiAgICAgICAgICBzZXNzaW9uOiB0cmFuc2FjdGlvbmFsU2Vzc2lvbiB8fCB1bmRlZmluZWQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgcmVzdWx0LnZhbHVlLCBzY2hlbWEpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBIb3BlZnVsbHkgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24udXBzZXJ0T25lKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbilcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgZmluZC4gQWNjZXB0czogY2xhc3NOYW1lLCBxdWVyeSBpbiBQYXJzZSBmb3JtYXQsIGFuZCB7IHNraXAsIGxpbWl0LCBzb3J0IH0uXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgcmVhZFByZWZlcmVuY2UgfTogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvU29ydCA9IF8ubWFwS2V5cyhzb3J0LCAodmFsdWUsIGZpZWxkTmFtZSkgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgY29uc3QgbW9uZ29LZXlzID0gXy5yZWR1Y2UoXG4gICAgICBrZXlzLFxuICAgICAgKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW9bJ19ycGVybSddID0gMTtcbiAgICAgICAgICBtZW1vWydfd3Blcm0nXSA9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWVtb1t0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBrZXksIHNjaGVtYSldID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZmluZChtb25nb1doZXJlLCB7XG4gICAgICAgICAgc2tpcCxcbiAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICBzb3J0OiBtb25nb1NvcnQsXG4gICAgICAgICAga2V5czogbW9uZ29LZXlzLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICBvYmplY3RzLm1hcChvYmplY3QgPT5cbiAgICAgICAgICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdClcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdUcmllZCB0byBlbnN1cmUgZmllbGQgdW5pcXVlbmVzcyBmb3IgYSBjbGFzcyB0aGF0IGFscmVhZHkgaGFzIGR1cGxpY2F0ZXMuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVXNlZCBpbiB0ZXN0c1xuICBfcmF3RmluZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQocXVlcnksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmNvdW50KHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSwgdHJ1ZSksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRpc3RpbmN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB0cmFuc2Zvcm1GaWVsZCA9IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmRpc3RpbmN0KFxuICAgICAgICAgIHRyYW5zZm9ybUZpZWxkLFxuICAgICAgICAgIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSlcbiAgICAgICAgKVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIG9iamVjdHMgPSBvYmplY3RzLmZpbHRlcihvYmogPT4gb2JqICE9IG51bGwpO1xuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nKHNjaGVtYSwgZmllbGROYW1lLCBvYmplY3QpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZ1xuICApIHtcbiAgICBsZXQgaXNQb2ludGVyRmllbGQgPSBmYWxzZTtcbiAgICBwaXBlbGluZSA9IHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIHN0YWdlLiRncm91cCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgc3RhZ2UuJGdyb3VwKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQgJiZcbiAgICAgICAgICB0eXBlb2Ygc3RhZ2UuJGdyb3VwLl9pZCA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkLmluZGV4T2YoJyRfcF8nKSA+PSAwXG4gICAgICAgICkge1xuICAgICAgICAgIGlzUG9pbnRlckZpZWxkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBzdGFnZS4kbWF0Y2ggPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kbWF0Y2gpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIHN0YWdlLiRwcm9qZWN0ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgc3RhZ2UuJHByb2plY3RcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGFnZTtcbiAgICB9KTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmFnZ3JlZ2F0ZShwaXBlbGluZSwge1xuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnX2lkJykpIHtcbiAgICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCAmJiByZXN1bHQuX2lkKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSByZXN1bHQuX2lkLnNwbGl0KCckJylbMV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gbnVsbCB8fFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAoWydvYmplY3QnLCAnc3RyaW5nJ10uaW5jbHVkZXModHlwZW9mIHJlc3VsdC5faWQpICYmXG4gICAgICAgICAgICAgICAgXy5pc0VtcHR5KHJlc3VsdC5faWQpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gcmVzdWx0Ll9pZDtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHQuX2lkO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgfSlcbiAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+XG4gICAgICAgICAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpXG4gICAgICAgIClcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCByZWN1cnNpdmVseSB0cmF2ZXJzZSB0aGUgcGlwZWxpbmUgYW5kIGNvbnZlcnQgYW55IFBvaW50ZXIgb3IgRGF0ZSBjb2x1bW5zLlxuICAvLyBJZiB3ZSBkZXRlY3QgYSBwb2ludGVyIGNvbHVtbiB3ZSB3aWxsIHJlbmFtZSB0aGUgY29sdW1uIGJlaW5nIHF1ZXJpZWQgZm9yIHRvIG1hdGNoIHRoZSBjb2x1bW5cbiAgLy8gaW4gdGhlIGRhdGFiYXNlLiBXZSBhbHNvIG1vZGlmeSB0aGUgdmFsdWUgdG8gd2hhdCB3ZSBleHBlY3QgdGhlIHZhbHVlIHRvIGJlIGluIHRoZSBkYXRhYmFzZVxuICAvLyBhcyB3ZWxsLlxuICAvLyBGb3IgZGF0ZXMsIHRoZSBkcml2ZXIgZXhwZWN0cyBhIERhdGUgb2JqZWN0LCBidXQgd2UgaGF2ZSBhIHN0cmluZyBjb21pbmcgaW4uIFNvIHdlJ2xsIGNvbnZlcnRcbiAgLy8gdGhlIHN0cmluZyB0byBhIERhdGUgc28gdGhlIGRyaXZlciBjYW4gcGVyZm9ybSB0aGUgbmVjZXNzYXJ5IGNvbXBhcmlzb24uXG4gIC8vXG4gIC8vIFRoZSBnb2FsIG9mIHRoaXMgbWV0aG9kIGlzIHRvIGxvb2sgZm9yIHRoZSBcImxlYXZlc1wiIG9mIHRoZSBwaXBlbGluZSBhbmQgZGV0ZXJtaW5lIGlmIGl0IG5lZWRzXG4gIC8vIHRvIGJlIGNvbnZlcnRlZC4gVGhlIHBpcGVsaW5lIGNhbiBoYXZlIGEgZmV3IGRpZmZlcmVudCBmb3Jtcy4gRm9yIG1vcmUgZGV0YWlscywgc2VlOlxuICAvLyAgICAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvYWdncmVnYXRpb24vXG4gIC8vXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBhcnJheSwgaXQgbWVhbnMgd2UgYXJlIHByb2JhYmx5IHBhcnNpbmcgYW4gJyRhbmQnIG9yICckb3InIG9wZXJhdG9yLiBJblxuICAvLyB0aGF0IGNhc2Ugd2UgbmVlZCB0byBsb29wIHRocm91Z2ggYWxsIG9mIGl0J3MgY2hpbGRyZW4gdG8gZmluZCB0aGUgY29sdW1ucyBiZWluZyBvcGVyYXRlZCBvbi5cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIG9iamVjdCwgdGhlbiB3ZSdsbCBsb29wIHRocm91Z2ggdGhlIGtleXMgY2hlY2tpbmcgdG8gc2VlIGlmIHRoZSBrZXkgbmFtZVxuICAvLyBtYXRjaGVzIG9uZSBvZiB0aGUgc2NoZW1hIGNvbHVtbnMuIElmIGl0IGRvZXMgbWF0Y2ggYSBjb2x1bW4gYW5kIHRoZSBjb2x1bW4gaXMgYSBQb2ludGVyIG9yXG4gIC8vIGEgRGF0ZSwgdGhlbiB3ZSdsbCBjb252ZXJ0IHRoZSB2YWx1ZSBhcyBkZXNjcmliZWQgYWJvdmUuXG4gIC8vXG4gIC8vIEFzIG11Y2ggYXMgSSBoYXRlIHJlY3Vyc2lvbi4uLnRoaXMgc2VlbWVkIGxpa2UgYSBnb29kIGZpdCBmb3IgaXQuIFdlJ3JlIGVzc2VudGlhbGx5IHRyYXZlcnNpbmdcbiAgLy8gZG93biBhIHRyZWUgdG8gZmluZCBhIFwibGVhZiBub2RlXCIgYW5kIGNoZWNraW5nIHRvIHNlZSBpZiBpdCBuZWVkcyB0byBiZSBjb252ZXJ0ZWQuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChwaXBlbGluZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcGlwZWxpbmVbZmllbGRdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8gUGFzcyBvYmplY3RzIGRvd24gdG8gTW9uZ29EQi4uLnRoaXMgaXMgbW9yZSB0aGFuIGxpa2VseSBhbiAkZXhpc3RzIG9wZXJhdG9yLlxuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVyblZhbHVlW1xuICAgICAgICAgICAgICBgX3BfJHtmaWVsZH1gXG4gICAgICAgICAgICBdID0gYCR7c2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3N9JCR7cGlwZWxpbmVbZmllbGRdfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGRdICYmXG4gICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0RhdGUnXG4gICAgICAgICkge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUocGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3MoXG4gICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICBwaXBlbGluZVtmaWVsZF1cbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSBhYm92ZS4gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNvbWJpbmUgdGhlc2VcbiAgLy8gdHdvIGZ1bmN0aW9ucyBhbmQgbWFraW5nIHRoZSBjb2RlIGV2ZW4gaGFyZGVyIHRvIHVuZGVyc3RhbmQsIEkgZGVjaWRlZCB0byBzcGxpdCBpdCB1cC4gVGhlXG4gIC8vIGRpZmZlcmVuY2Ugd2l0aCB0aGlzIGZ1bmN0aW9uIGlzIHdlIGFyZSBub3QgdHJhbnNmb3JtaW5nIHRoZSB2YWx1ZXMsIG9ubHkgdGhlIGtleXMgb2YgdGhlXG4gIC8vIHBpcGVsaW5lLlxuICBfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIHR3byBhYm92ZS4gTW9uZ29EQiAkZ3JvdXAgYWdncmVnYXRlIGxvb2tzIGxpa2U6XG4gIC8vICAgICB7ICRncm91cDogeyBfaWQ6IDxleHByZXNzaW9uPiwgPGZpZWxkMT46IHsgPGFjY3VtdWxhdG9yMT4gOiA8ZXhwcmVzc2lvbjE+IH0sIC4uLiB9IH1cbiAgLy8gVGhlIDxleHByZXNzaW9uPiBjb3VsZCBiZSBhIGNvbHVtbiBuYW1lLCBwcmVmaXhlZCB3aXRoIHRoZSAnJCcgY2hhcmFjdGVyLiBXZSdsbCBsb29rIGZvclxuICAvLyB0aGVzZSA8ZXhwcmVzc2lvbj4gYW5kIGNoZWNrIHRvIHNlZSBpZiBpdCBpcyBhICdQb2ludGVyJyBvciBpZiBpdCdzIG9uZSBvZiBjcmVhdGVkQXQsXG4gIC8vIHVwZGF0ZWRBdCBvciBvYmplY3RJZCBhbmQgY2hhbmdlIGl0IGFjY29yZGluZ2x5LlxuICBfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PlxuICAgICAgICB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHZhbHVlKVxuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKFxuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICBwaXBlbGluZVtmaWVsZF1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gcGlwZWxpbmUuc3Vic3RyaW5nKDEpO1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCRfcF8ke2ZpZWxkfWA7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF9jcmVhdGVkX2F0JztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX3VwZGF0ZWRfYXQnO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgYXR0ZW1wdCB0byBjb252ZXJ0IHRoZSBwcm92aWRlZCB2YWx1ZSB0byBhIERhdGUgb2JqZWN0LiBTaW5jZSB0aGlzIGlzIHBhcnRcbiAgLy8gb2YgYW4gYWdncmVnYXRpb24gcGlwZWxpbmUsIHRoZSB2YWx1ZSBjYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGl0IGNhbiBiZSBhbm90aGVyIG9iamVjdCB3aXRoXG4gIC8vIGFuIG9wZXJhdG9yIGluIGl0IChsaWtlICRndCwgJGx0LCBldGMpLiBCZWNhdXNlIG9mIHRoaXMgSSBmZWx0IGl0IHdhcyBlYXNpZXIgdG8gbWFrZSB0aGlzIGFcbiAgLy8gcmVjdXJzaXZlIG1ldGhvZCB0byB0cmF2ZXJzZSBkb3duIHRvIHRoZSBcImxlYWYgbm9kZVwiIHdoaWNoIGlzIGdvaW5nIHRvIGJlIHRoZSBzdHJpbmcuXG4gIF9jb252ZXJ0VG9EYXRlKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiB2YWx1ZSkge1xuICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZSh2YWx1ZVtmaWVsZF0pO1xuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICBfcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZTogP3N0cmluZyk6ID9zdHJpbmcge1xuICAgIGlmIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgcmVhZFByZWZlcmVuY2UgPSByZWFkUHJlZmVyZW5jZS50b1VwcGVyQ2FzZSgpO1xuICAgIH1cbiAgICBzd2l0Y2ggKHJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICBjYXNlICdQUklNQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BSSU1BUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUlknOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlNFQ09OREFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUllfUFJFRkVSUkVEO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ05FQVJFU1QnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLk5FQVJFU1Q7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSB1bmRlZmluZWQ6XG4gICAgICBjYXNlIG51bGw6XG4gICAgICBjYXNlICcnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICdOb3Qgc3VwcG9ydGVkIHJlYWQgcHJlZmVyZW5jZS4nXG4gICAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjcmVhdGVJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXgsIHsgYmFja2dyb3VuZDogdHJ1ZSB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleGVzKGluZGV4ZXMsIHsgYmFja2dyb3VuZDogdHJ1ZSB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgaWYgKHR5cGUgJiYgdHlwZS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0ge1xuICAgICAgICBbZmllbGROYW1lXTogJzJkc3BoZXJlJyxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVJbmRleChjbGFzc05hbWUsIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHNjaGVtYTogYW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgICBpZiAoIXF1ZXJ5W2ZpZWxkTmFtZV0gfHwgIXF1ZXJ5W2ZpZWxkTmFtZV0uJHRleHQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleGlzdGluZ0luZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGV4aXN0aW5nSW5kZXhlcykge1xuICAgICAgICBjb25zdCBpbmRleCA9IGV4aXN0aW5nSW5kZXhlc1trZXldO1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGluZGV4LCBmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBpbmRleE5hbWUgPSBgJHtmaWVsZE5hbWV9X3RleHRgO1xuICAgICAgY29uc3QgdGV4dEluZGV4ID0ge1xuICAgICAgICBbaW5kZXhOYW1lXTogeyBbZmllbGROYW1lXTogJ3RleHQnIH0sXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgdGV4dEluZGV4LFxuICAgICAgICBleGlzdGluZ0luZGV4ZXMsXG4gICAgICAgIHNjaGVtYS5maWVsZHNcbiAgICAgICkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gODUpIHtcbiAgICAgICAgICAvLyBJbmRleCBleGlzdCB3aXRoIGRpZmZlcmVudCBvcHRpb25zXG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmluZGV4ZXMoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRyb3BJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZHJvcEluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRyb3BBbGxJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gdGhpcy5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGNsYXNzZXMgPT4ge1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IGNsYXNzZXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc0Zyb21Nb25nbyhzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2VjdGlvbiA9IHRoaXMuY2xpZW50LnN0YXJ0U2Vzc2lvbigpO1xuICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLnN0YXJ0VHJhbnNhY3Rpb24oKTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZWN0aW9uKTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb24uY29tbWl0VHJhbnNhY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmVuZFNlc3Npb24oKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvbi5hYm9ydFRyYW5zYWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiJdfQ==