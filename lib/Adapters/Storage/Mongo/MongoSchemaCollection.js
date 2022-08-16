"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function mongoFieldToParseSchemaField(type) {
  if (type[0] === '*') {
    return {
      type: 'Pointer',
      targetClass: type.slice(1)
    };
  }

  if (type.startsWith('relation<')) {
    return {
      type: 'Relation',
      targetClass: type.slice('relation<'.length, type.length - 1)
    };
  }

  switch (type) {
    case 'number':
      return {
        type: 'Number'
      };

    case 'string':
      return {
        type: 'String'
      };

    case 'boolean':
      return {
        type: 'Boolean'
      };

    case 'date':
      return {
        type: 'Date'
      };

    case 'map':
    case 'object':
      return {
        type: 'Object'
      };

    case 'array':
      return {
        type: 'Array'
      };

    case 'geopoint':
      return {
        type: 'GeoPoint'
      };

    case 'file':
      return {
        type: 'File'
      };

    case 'bytes':
      return {
        type: 'Bytes'
      };

    case 'polygon':
      return {
        type: 'Polygon'
      };
  }
}

const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];

function mongoSchemaFieldsToParseSchemaFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = mongoFieldToParseSchemaField(schema[fieldName]);

    if (schema._metadata && schema._metadata.fields_options && schema._metadata.fields_options[fieldName]) {
      obj[fieldName] = Object.assign({}, obj[fieldName], schema._metadata.fields_options[fieldName]);
    }

    return obj;
  }, {});
  response.ACL = {
    type: 'ACL'
  };
  response.createdAt = {
    type: 'Date'
  };
  response.updatedAt = {
    type: 'Date'
  };
  response.objectId = {
    type: 'String'
  };
  return response;
}

const emptyCLPS = Object.freeze({
  find: {},
  count: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  count: {
    '*': true
  },
  get: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});

function mongoSchemaToParseSchema(mongoSchema) {
  let clps = defaultCLPS;
  let indexes = {};

  if (mongoSchema._metadata) {
    if (mongoSchema._metadata.class_permissions) {
      clps = _objectSpread(_objectSpread({}, emptyCLPS), mongoSchema._metadata.class_permissions);
    }

    if (mongoSchema._metadata.indexes) {
      indexes = _objectSpread({}, mongoSchema._metadata.indexes);
    }
  }

  return {
    className: mongoSchema._id,
    fields: mongoSchemaFieldsToParseSchemaFields(mongoSchema),
    classLevelPermissions: clps,
    indexes: indexes
  };
}

function _mongoSchemaQueryFromNameQuery(name, query) {
  const object = {
    _id: name
  };

  if (query) {
    Object.keys(query).forEach(key => {
      object[key] = query[key];
    });
  }

  return object;
} // Returns a type suitable for inserting into mongo _SCHEMA collection.
// Does no validation. That is expected to be done in Parse Server.


function parseFieldTypeToMongoFieldType({
  type,
  targetClass
}) {
  switch (type) {
    case 'Pointer':
      return `*${targetClass}`;

    case 'Relation':
      return `relation<${targetClass}>`;

    case 'Number':
      return 'number';

    case 'String':
      return 'string';

    case 'Boolean':
      return 'boolean';

    case 'Date':
      return 'date';

    case 'Object':
      return 'object';

    case 'Array':
      return 'array';

    case 'GeoPoint':
      return 'geopoint';

    case 'File':
      return 'file';

    case 'Bytes':
      return 'bytes';

    case 'Polygon':
      return 'polygon';
  }
}

class MongoSchemaCollection {
  constructor(collection) {
    this._collection = collection;
  }

  _fetchAllSchemasFrom_SCHEMA() {
    return this._collection._rawFind({}).then(schemas => schemas.map(mongoSchemaToParseSchema));
  }

  _fetchOneSchemaFrom_SCHEMA(name) {
    return this._collection._rawFind(_mongoSchemaQueryFromNameQuery(name), {
      limit: 1
    }).then(results => {
      if (results.length === 1) {
        return mongoSchemaToParseSchema(results[0]);
      } else {
        throw undefined;
      }
    });
  } // Atomically find and delete an object based on query.


  findAndDeleteSchema(name) {
    return this._collection._mongoCollection.findOneAndDelete(_mongoSchemaQueryFromNameQuery(name));
  }

  insertSchema(schema) {
    return this._collection.insertOne(schema).then(() => mongoSchemaToParseSchema(schema)).catch(error => {
      if (error.code === 11000) {
        //Mongo's duplicate key error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Class already exists.');
      } else {
        throw error;
      }
    });
  }

  updateSchema(name, update) {
    return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
  }

  upsertSchema(name, query, update) {
    return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
  } // Add a field to the schema. If database does not support the field
  // type (e.g. mongo doesn't support more than one GeoPoint in a class) reject with an "Incorrect Type"
  // Parse error with a desciptive message. If the field already exists, this function must
  // not modify the schema, and must reject with DUPLICATE_VALUE error.
  // If this is called for a class that doesn't exist, this function must create that class.
  // TODO: throw an error if an unsupported field type is passed. Deciding whether a type is supported
  // should be the job of the adapter. Some adapters may not support GeoPoint at all. Others may
  // Support additional types that Mongo doesn't, like Money, or something.
  // TODO: don't spend an extra query on finding the schema if the type we are trying to add isn't a GeoPoint.


  addFieldIfNotExists(className, fieldName, fieldType) {
    return this._fetchOneSchemaFrom_SCHEMA(className).then(schema => {
      // If a field with this name already exists, it will be handled elsewhere.
      if (schema.fields[fieldName] !== undefined) {
        return;
      } // The schema exists. Check for existing GeoPoints.


      if (fieldType.type === 'GeoPoint') {
        // Make sure there are not other geopoint fields
        if (Object.keys(schema.fields).some(existingField => schema.fields[existingField].type === 'GeoPoint')) {
          throw new _node.default.Error(_node.default.Error.INCORRECT_TYPE, 'MongoDB only supports one GeoPoint field in a class.');
        }
      }

      return;
    }, error => {
      // If error is undefined, the schema doesn't exist, and we can create the schema with the field.
      // If some other error, reject with it.
      if (error === undefined) {
        return;
      }

      throw error;
    }).then(() => {
      const {
        type,
        targetClass
      } = fieldType,
            fieldOptions = _objectWithoutProperties(fieldType, ["type", "targetClass"]); // We use $exists and $set to avoid overwriting the field type if it
      // already exists. (it could have added inbetween the last query and the update)


      if (fieldOptions && Object.keys(fieldOptions).length > 0) {
        return this.upsertSchema(className, {
          [fieldName]: {
            $exists: false
          }
        }, {
          $set: {
            [fieldName]: parseFieldTypeToMongoFieldType({
              type,
              targetClass
            }),
            [`_metadata.fields_options.${fieldName}`]: fieldOptions
          }
        });
      } else {
        return this.upsertSchema(className, {
          [fieldName]: {
            $exists: false
          }
        }, {
          $set: {
            [fieldName]: parseFieldTypeToMongoFieldType({
              type,
              targetClass
            })
          }
        });
      }
    });
  }

  async updateFieldOptions(className, fieldName, fieldType) {
    const fieldOptions = _extends({}, fieldType);

    delete fieldOptions.type;
    delete fieldOptions.targetClass;
    await this.upsertSchema(className, {
      [fieldName]: {
        $exists: true
      }
    }, {
      $set: {
        [`_metadata.fields_options.${fieldName}`]: fieldOptions
      }
    });
  }

} // Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.


MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema;
MongoSchemaCollection.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;
var _default = MongoSchemaCollection;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJfbWV0YWRhdGEiLCJmaWVsZHNfb3B0aW9ucyIsImFzc2lnbiIsIkFDTCIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiZnJlZXplIiwiZmluZCIsImNvdW50IiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsIm1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSIsIm1vbmdvU2NoZW1hIiwiY2xwcyIsImluZGV4ZXMiLCJjbGFzc19wZXJtaXNzaW9ucyIsImNsYXNzTmFtZSIsIl9pZCIsImZpZWxkcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeSIsIm5hbWUiLCJxdWVyeSIsIm9iamVjdCIsImZvckVhY2giLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsImNvbGxlY3Rpb24iLCJfY29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsIl9yYXdGaW5kIiwidGhlbiIsInNjaGVtYXMiLCJtYXAiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImxpbWl0IiwicmVzdWx0cyIsInVuZGVmaW5lZCIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJfbW9uZ29Db2xsZWN0aW9uIiwiZmluZE9uZUFuZERlbGV0ZSIsImluc2VydFNjaGVtYSIsImluc2VydE9uZSIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZVNjaGVtYSIsInVwZGF0ZU9uZSIsInVwc2VydFNjaGVtYSIsInVwc2VydE9uZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJmaWVsZFR5cGUiLCJzb21lIiwiZXhpc3RpbmdGaWVsZCIsIklOQ09SUkVDVF9UWVBFIiwiZmllbGRPcHRpb25zIiwiJGV4aXN0cyIsIiRzZXQiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJfVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuZnVuY3Rpb24gbW9uZ29GaWVsZFRvUGFyc2VTY2hlbWFGaWVsZCh0eXBlKSB7XG4gIGlmICh0eXBlWzBdID09PSAnKicpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ1BvaW50ZXInLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoMSksXG4gICAgfTtcbiAgfVxuICBpZiAodHlwZS5zdGFydHNXaXRoKCdyZWxhdGlvbjwnKSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoJ3JlbGF0aW9uPCcubGVuZ3RoLCB0eXBlLmxlbmd0aCAtIDEpLFxuICAgIH07XG4gIH1cbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQm9vbGVhbicgfTtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdEYXRlJyB9O1xuICAgIGNhc2UgJ21hcCc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIGNhc2UgJ2dlb3BvaW50JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdHZW9Qb2ludCcgfTtcbiAgICBjYXNlICdmaWxlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdGaWxlJyB9O1xuICAgIGNhc2UgJ2J5dGVzJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdCeXRlcycgfTtcbiAgICBjYXNlICdwb2x5Z29uJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdQb2x5Z29uJyB9O1xuICB9XG59XG5cbmNvbnN0IG5vbkZpZWxkU2NoZW1hS2V5cyA9IFsnX2lkJywgJ19tZXRhZGF0YScsICdfY2xpZW50X3Blcm1pc3Npb25zJ107XG5mdW5jdGlvbiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMoc2NoZW1hKSB7XG4gIHZhciBmaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hKS5maWx0ZXIoa2V5ID0+IG5vbkZpZWxkU2NoZW1hS2V5cy5pbmRleE9mKGtleSkgPT09IC0xKTtcbiAgdmFyIHJlc3BvbnNlID0gZmllbGROYW1lcy5yZWR1Y2UoKG9iaiwgZmllbGROYW1lKSA9PiB7XG4gICAgb2JqW2ZpZWxkTmFtZV0gPSBtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkKHNjaGVtYVtmaWVsZE5hbWVdKTtcbiAgICBpZiAoXG4gICAgICBzY2hlbWEuX21ldGFkYXRhICYmXG4gICAgICBzY2hlbWEuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zICYmXG4gICAgICBzY2hlbWEuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIG9ialtmaWVsZE5hbWVdID0gT2JqZWN0LmFzc2lnbihcbiAgICAgICAge30sXG4gICAgICAgIG9ialtmaWVsZE5hbWVdLFxuICAgICAgICBzY2hlbWEuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV1cbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH0sIHt9KTtcbiAgcmVzcG9uc2UuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuICByZXNwb25zZS5jcmVhdGVkQXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICByZXNwb25zZS51cGRhdGVkQXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICByZXNwb25zZS5vYmplY3RJZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgcmV0dXJuIHJlc3BvbnNlO1xufVxuXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGNvdW50OiB7fSxcbiAgZ2V0OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGNvdW50OiB7ICcqJzogdHJ1ZSB9LFxuICBnZXQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmZ1bmN0aW9uIG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShtb25nb1NjaGVtYSkge1xuICBsZXQgY2xwcyA9IGRlZmF1bHRDTFBTO1xuICBsZXQgaW5kZXhlcyA9IHt9O1xuICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhKSB7XG4gICAgaWYgKG1vbmdvU2NoZW1hLl9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucykge1xuICAgICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5tb25nb1NjaGVtYS5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgfTtcbiAgICB9XG4gICAgaWYgKG1vbmdvU2NoZW1hLl9tZXRhZGF0YS5pbmRleGVzKSB7XG4gICAgICBpbmRleGVzID0geyAuLi5tb25nb1NjaGVtYS5fbWV0YWRhdGEuaW5kZXhlcyB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogbW9uZ29TY2hlbWEuX2lkLFxuICAgIGZpZWxkczogbW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzKG1vbmdvU2NoZW1hKSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGNscHMsXG4gICAgaW5kZXhlczogaW5kZXhlcyxcbiAgfTtcbn1cblxuZnVuY3Rpb24gX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWU6IHN0cmluZywgcXVlcnkpIHtcbiAgY29uc3Qgb2JqZWN0ID0geyBfaWQ6IG5hbWUgfTtcbiAgaWYgKHF1ZXJ5KSB7XG4gICAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIG9iamVjdFtrZXldID0gcXVlcnlba2V5XTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb2JqZWN0O1xufVxuXG4vLyBSZXR1cm5zIGEgdHlwZSBzdWl0YWJsZSBmb3IgaW5zZXJ0aW5nIGludG8gbW9uZ28gX1NDSEVNQSBjb2xsZWN0aW9uLlxuLy8gRG9lcyBubyB2YWxpZGF0aW9uLiBUaGF0IGlzIGV4cGVjdGVkIHRvIGJlIGRvbmUgaW4gUGFyc2UgU2VydmVyLlxuZnVuY3Rpb24gcGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkge1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiBgKiR7dGFyZ2V0Q2xhc3N9YDtcbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICByZXR1cm4gYHJlbGF0aW9uPCR7dGFyZ2V0Q2xhc3N9PmA7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnbnVtYmVyJztcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICdzdHJpbmcnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAnZGF0ZSc7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiAnb2JqZWN0JztcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gJ2FycmF5JztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ2dlb3BvaW50JztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAnZmlsZSc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdieXRlcyc7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICB9XG59XG5cbmNsYXNzIE1vbmdvU2NoZW1hQ29sbGVjdGlvbiB7XG4gIF9jb2xsZWN0aW9uOiBNb25nb0NvbGxlY3Rpb247XG5cbiAgY29uc3RydWN0b3IoY29sbGVjdGlvbjogTW9uZ29Db2xsZWN0aW9uKSB7XG4gICAgdGhpcy5fY29sbGVjdGlvbiA9IGNvbGxlY3Rpb247XG4gIH1cblxuICBfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uX3Jhd0ZpbmQoe30pLnRoZW4oc2NoZW1hcyA9PiBzY2hlbWFzLm1hcChtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEpKTtcbiAgfVxuXG4gIF9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uXG4gICAgICAuX3Jhd0ZpbmQoX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUpLCB7IGxpbWl0OiAxIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgcmV0dXJuIG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShyZXN1bHRzWzBdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kIGFuZCBkZWxldGUgYW4gb2JqZWN0IGJhc2VkIG9uIHF1ZXJ5LlxuICBmaW5kQW5kRGVsZXRlU2NoZW1hKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZERlbGV0ZShfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSkpO1xuICB9XG5cbiAgaW5zZXJ0U2NoZW1hKHNjaGVtYTogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb25cbiAgICAgIC5pbnNlcnRPbmUoc2NoZW1hKVxuICAgICAgLnRoZW4oKCkgPT4gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKHNjaGVtYSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvL01vbmdvJ3MgZHVwbGljYXRlIGtleSBlcnJvclxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsICdDbGFzcyBhbHJlYWR5IGV4aXN0cy4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWEobmFtZTogc3RyaW5nLCB1cGRhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi51cGRhdGVPbmUoX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUpLCB1cGRhdGUpO1xuICB9XG5cbiAgdXBzZXJ0U2NoZW1hKG5hbWU6IHN0cmluZywgcXVlcnk6IHN0cmluZywgdXBkYXRlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24udXBzZXJ0T25lKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lLCBxdWVyeSksIHVwZGF0ZSk7XG4gIH1cblxuICAvLyBBZGQgYSBmaWVsZCB0byB0aGUgc2NoZW1hLiBJZiBkYXRhYmFzZSBkb2VzIG5vdCBzdXBwb3J0IHRoZSBmaWVsZFxuICAvLyB0eXBlIChlLmcuIG1vbmdvIGRvZXNuJ3Qgc3VwcG9ydCBtb3JlIHRoYW4gb25lIEdlb1BvaW50IGluIGEgY2xhc3MpIHJlamVjdCB3aXRoIGFuIFwiSW5jb3JyZWN0IFR5cGVcIlxuICAvLyBQYXJzZSBlcnJvciB3aXRoIGEgZGVzY2lwdGl2ZSBtZXNzYWdlLiBJZiB0aGUgZmllbGQgYWxyZWFkeSBleGlzdHMsIHRoaXMgZnVuY3Rpb24gbXVzdFxuICAvLyBub3QgbW9kaWZ5IHRoZSBzY2hlbWEsIGFuZCBtdXN0IHJlamVjdCB3aXRoIERVUExJQ0FURV9WQUxVRSBlcnJvci5cbiAgLy8gSWYgdGhpcyBpcyBjYWxsZWQgZm9yIGEgY2xhc3MgdGhhdCBkb2Vzbid0IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIG11c3QgY3JlYXRlIHRoYXQgY2xhc3MuXG5cbiAgLy8gVE9ETzogdGhyb3cgYW4gZXJyb3IgaWYgYW4gdW5zdXBwb3J0ZWQgZmllbGQgdHlwZSBpcyBwYXNzZWQuIERlY2lkaW5nIHdoZXRoZXIgYSB0eXBlIGlzIHN1cHBvcnRlZFxuICAvLyBzaG91bGQgYmUgdGhlIGpvYiBvZiB0aGUgYWRhcHRlci4gU29tZSBhZGFwdGVycyBtYXkgbm90IHN1cHBvcnQgR2VvUG9pbnQgYXQgYWxsLiBPdGhlcnMgbWF5XG4gIC8vIFN1cHBvcnQgYWRkaXRpb25hbCB0eXBlcyB0aGF0IE1vbmdvIGRvZXNuJ3QsIGxpa2UgTW9uZXksIG9yIHNvbWV0aGluZy5cblxuICAvLyBUT0RPOiBkb24ndCBzcGVuZCBhbiBleHRyYSBxdWVyeSBvbiBmaW5kaW5nIHRoZSBzY2hlbWEgaWYgdGhlIHR5cGUgd2UgYXJlIHRyeWluZyB0byBhZGQgaXNuJ3QgYSBHZW9Qb2ludC5cbiAgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkVHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oXG4gICAgICAgIHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gSWYgYSBmaWVsZCB3aXRoIHRoaXMgbmFtZSBhbHJlYWR5IGV4aXN0cywgaXQgd2lsbCBiZSBoYW5kbGVkIGVsc2V3aGVyZS5cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBleGlzdHMuIENoZWNrIGZvciBleGlzdGluZyBHZW9Qb2ludHMuXG4gICAgICAgICAgaWYgKGZpZWxkVHlwZS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhlcmUgYXJlIG5vdCBvdGhlciBnZW9wb2ludCBmaWVsZHNcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuc29tZShcbiAgICAgICAgICAgICAgICBleGlzdGluZ0ZpZWxkID0+IHNjaGVtYS5maWVsZHNbZXhpc3RpbmdGaWVsZF0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICAgICdNb25nb0RCIG9ubHkgc3VwcG9ydHMgb25lIEdlb1BvaW50IGZpZWxkIGluIGEgY2xhc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICAvLyBJZiBlcnJvciBpcyB1bmRlZmluZWQsIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgYW5kIHdlIGNhbiBjcmVhdGUgdGhlIHNjaGVtYSB3aXRoIHRoZSBmaWVsZC5cbiAgICAgICAgICAvLyBJZiBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBpdC5cbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkVHlwZTtcbiAgICAgICAgLy8gV2UgdXNlICRleGlzdHMgYW5kICRzZXQgdG8gYXZvaWQgb3ZlcndyaXRpbmcgdGhlIGZpZWxkIHR5cGUgaWYgaXRcbiAgICAgICAgLy8gYWxyZWFkeSBleGlzdHMuIChpdCBjb3VsZCBoYXZlIGFkZGVkIGluYmV0d2VlbiB0aGUgbGFzdCBxdWVyeSBhbmQgdGhlIHVwZGF0ZSlcbiAgICAgICAgaWYgKGZpZWxkT3B0aW9ucyAmJiBPYmplY3Qua2V5cyhmaWVsZE9wdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy51cHNlcnRTY2hlbWEoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB7IFtmaWVsZE5hbWVdOiB7ICRleGlzdHM6IGZhbHNlIH0gfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgJHNldDoge1xuICAgICAgICAgICAgICAgIFtmaWVsZE5hbWVdOiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIFtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7ZmllbGROYW1lfWBdOiBmaWVsZE9wdGlvbnMsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy51cHNlcnRTY2hlbWEoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB7IFtmaWVsZE5hbWVdOiB7ICRleGlzdHM6IGZhbHNlIH0gfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgJHNldDoge1xuICAgICAgICAgICAgICAgIFtmaWVsZE5hbWVdOiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGRUeXBlOiBhbnkpIHtcbiAgICBjb25zdCB7IC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRUeXBlO1xuICAgIGRlbGV0ZSBmaWVsZE9wdGlvbnMudHlwZTtcbiAgICBkZWxldGUgZmllbGRPcHRpb25zLnRhcmdldENsYXNzO1xuXG4gICAgYXdhaXQgdGhpcy51cHNlcnRTY2hlbWEoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB7IFtmaWVsZE5hbWVdOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAge1xuICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtmaWVsZE5hbWV9YF06IGZpZWxkT3B0aW9ucyxcbiAgICAgICAgfSxcbiAgICAgIH1cbiAgICApO1xuICB9XG59XG5cbi8vIEV4cG9ydGVkIGZvciB0ZXN0aW5nIHJlYXNvbnMgYW5kIGJlY2F1c2Ugd2UgaGF2ZW4ndCBtb3ZlZCBhbGwgbW9uZ28gc2NoZW1hIGZvcm1hdFxuLy8gcmVsYXRlZCBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyIHlldC5cbk1vbmdvU2NoZW1hQ29sbGVjdGlvbi5fVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSA9IG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYTtcbk1vbmdvU2NoZW1hQ29sbGVjdGlvbi5wYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUgPSBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGU7XG5cbmV4cG9ydCBkZWZhdWx0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsU0FBU0EsNEJBQVQsQ0FBc0NDLElBQXRDLEVBQTRDO0VBQzFDLElBQUlBLElBQUksQ0FBQyxDQUFELENBQUosS0FBWSxHQUFoQixFQUFxQjtJQUNuQixPQUFPO01BQ0xBLElBQUksRUFBRSxT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