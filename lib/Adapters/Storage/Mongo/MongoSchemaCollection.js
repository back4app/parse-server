"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { keys.push.apply(keys, Object.getOwnPropertySymbols(object)); } if (enumerableOnly) keys = keys.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

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
      clps = _objectSpread({}, emptyCLPS, {}, mongoSchema._metadata.class_permissions);
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
    return this._collection._mongoCollection.findAndRemove(_mongoSchemaQueryFromNameQuery(name), []);
  }

  insertSchema(schema) {
    return this._collection.insertOne(schema).then(result => mongoSchemaToParseSchema(result.ops[0])).catch(error => {
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


  addFieldIfNotExists(className, fieldName, type) {
    return this._fetchOneSchemaFrom_SCHEMA(className).then(schema => {
      // If a field with this name already exists, it will be handled elsewhere.
      if (schema.fields[fieldName] != undefined) {
        return;
      } // The schema exists. Check for existing GeoPoints.


      if (type.type === 'GeoPoint') {
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
      // We use $exists and $set to avoid overwriting the field type if it
      // already exists. (it could have added inbetween the last query and the update)
      return this.upsertSchema(className, {
        [fieldName]: {
          $exists: false
        }
      }, {
        $set: {
          [fieldName]: parseFieldTypeToMongoFieldType(type)
        }
      });
    });
  }

} // Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.


MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema;
MongoSchemaCollection.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;
var _default = MongoSchemaCollection;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJBQ0wiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjcmVhdGUiLCJ1cGRhdGUiLCJkZWxldGUiLCJhZGRGaWVsZCIsInByb3RlY3RlZEZpZWxkcyIsImRlZmF1bHRDTFBTIiwibW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hIiwibW9uZ29TY2hlbWEiLCJjbHBzIiwiaW5kZXhlcyIsIl9tZXRhZGF0YSIsImNsYXNzX3Blcm1pc3Npb25zIiwiY2xhc3NOYW1lIiwiX2lkIiwiZmllbGRzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5IiwibmFtZSIsInF1ZXJ5Iiwib2JqZWN0IiwiZm9yRWFjaCIsInBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSIsIk1vbmdvU2NoZW1hQ29sbGVjdGlvbiIsImNvbnN0cnVjdG9yIiwiY29sbGVjdGlvbiIsIl9jb2xsZWN0aW9uIiwiX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BIiwiX3Jhd0ZpbmQiLCJ0aGVuIiwic2NoZW1hcyIsIm1hcCIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwibGltaXQiLCJyZXN1bHRzIiwidW5kZWZpbmVkIiwiZmluZEFuZERlbGV0ZVNjaGVtYSIsIl9tb25nb0NvbGxlY3Rpb24iLCJmaW5kQW5kUmVtb3ZlIiwiaW5zZXJ0U2NoZW1hIiwiaW5zZXJ0T25lIiwicmVzdWx0Iiwib3BzIiwiY2F0Y2giLCJlcnJvciIsImNvZGUiLCJQYXJzZSIsIkVycm9yIiwiRFVQTElDQVRFX1ZBTFVFIiwidXBkYXRlU2NoZW1hIiwidXBkYXRlT25lIiwidXBzZXJ0U2NoZW1hIiwidXBzZXJ0T25lIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInNvbWUiLCJleGlzdGluZ0ZpZWxkIiwiSU5DT1JSRUNUX1RZUEUiLCIkZXhpc3RzIiwiJHNldCIsIl9URVNUbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7Ozs7Ozs7QUFFQSxTQUFTQSw0QkFBVCxDQUFzQ0MsSUFBdEMsRUFBNEM7QUFDMUMsTUFBSUEsSUFBSSxDQUFDLENBQUQsQ0FBSixLQUFZLEdBQWhCLEVBQXFCO0FBQ25CLFdBQU87QUFDTEEsTUFBQUEsSUFBSSxFQUFFLFNBREQ7QUFFTEMsTUFBQUEsV0FBVyxFQUFFRCxJQUFJLENBQUNFLEtBQUwsQ0FBVyxDQUFYO0FBRlIsS0FBUDtBQUlEOztBQUNELE1BQUlGLElBQUksQ0FBQ0csVUFBTCxDQUFnQixXQUFoQixDQUFKLEVBQWtDO0FBQ2hDLFdBQU87QUFDTEgsTUFBQUEsSUFBSSxFQUFFLFVBREQ7QUFFTEMsTUFBQUEsV0FBVyxFQUFFRCxJQUFJLENBQUNFLEtBQUwsQ0FBVyxZQUFZRSxNQUF2QixFQUErQkosSUFBSSxDQUFDSSxNQUFMLEdBQWMsQ0FBN0M7QUFGUixLQUFQO0FBSUQ7O0FBQ0QsVUFBUUosSUFBUjtBQUNFLFNBQUssUUFBTDtBQUNFLGFBQU87QUFBRUEsUUFBQUEsSUFBSSxFQUFFO0FBQVIsT0FBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPO0FBQUVBLFFBQUFBLElBQUksRUFBRTtBQUFSLE9BQVA7O0FBQ0YsU0FB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YThCLDhCQUE4QixDQUFDL0MsSUFBRDtBQUE3QztBQUFSLE9BSEssQ0FBUDtBQUtELEtBekNJLENBQVA7QUEwQ0Q7O0FBdEh5QixDLENBeUg1QjtBQUNBOzs7QUFDQWdELHFCQUFxQixDQUFDb0MsNkJBQXRCLEdBQXNEcEQsd0JBQXREO0FBQ0FnQixxQkFBcUIsQ0FBQ0QsOEJBQXRCLEdBQXVEQSw4QkFBdkQ7ZUFFZUMscUIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuZnVuY3Rpb24gbW9uZ29GaWVsZFRvUGFyc2VTY2hlbWFGaWVsZCh0eXBlKSB7XG4gIGlmICh0eXBlWzBdID09PSAnKicpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ1BvaW50ZXInLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoMSksXG4gICAgfTtcbiAgfVxuICBpZiAodHlwZS5zdGFydHNXaXRoKCdyZWxhdGlvbjwnKSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoJ3JlbGF0aW9uPCcubGVuZ3RoLCB0eXBlLmxlbmd0aCAtIDEpLFxuICAgIH07XG4gIH1cbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQm9vbGVhbicgfTtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdEYXRlJyB9O1xuICAgIGNhc2UgJ21hcCc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIGNhc2UgJ2dlb3BvaW50JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdHZW9Qb2ludCcgfTtcbiAgICBjYXNlICdmaWxlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdGaWxlJyB9O1xuICAgIGNhc2UgJ2J5dGVzJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdCeXRlcycgfTtcbiAgICBjYXNlICdwb2x5Z29uJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdQb2x5Z29uJyB9O1xuICB9XG59XG5cbmNvbnN0IG5vbkZpZWxkU2NoZW1hS2V5cyA9IFsnX2lkJywgJ19tZXRhZGF0YScsICdfY2xpZW50X3Blcm1pc3Npb25zJ107XG5mdW5jdGlvbiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMoc2NoZW1hKSB7XG4gIHZhciBmaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hKS5maWx0ZXIoXG4gICAga2V5ID0+IG5vbkZpZWxkU2NoZW1hS2V5cy5pbmRleE9mKGtleSkgPT09IC0xXG4gICk7XG4gIHZhciByZXNwb25zZSA9IGZpZWxkTmFtZXMucmVkdWNlKChvYmosIGZpZWxkTmFtZSkgPT4ge1xuICAgIG9ialtmaWVsZE5hbWVdID0gbW9uZ29GaWVsZFRvUGFyc2VTY2hlbWFGaWVsZChzY2hlbWFbZmllbGROYW1lXSk7XG4gICAgcmV0dXJuIG9iajtcbiAgfSwge30pO1xuICByZXNwb25zZS5BQ0wgPSB7IHR5cGU6ICdBQ0wnIH07XG4gIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLm9iamVjdElkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgZ2V0OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuZnVuY3Rpb24gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKG1vbmdvU2NoZW1hKSB7XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEpIHtcbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zKSB7XG4gICAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyB9O1xuICAgIH1cbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmluZGV4ZXMpIHtcbiAgICAgIGluZGV4ZXMgPSB7IC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5pbmRleGVzIH07XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBtb25nb1NjaGVtYS5faWQsXG4gICAgZmllbGRzOiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMobW9uZ29TY2hlbWEpLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzOiBpbmRleGVzLFxuICB9O1xufVxuXG5mdW5jdGlvbiBfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZTogc3RyaW5nLCBxdWVyeSkge1xuICBjb25zdCBvYmplY3QgPSB7IF9pZDogbmFtZSB9O1xuICBpZiAocXVlcnkpIHtcbiAgICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgb2JqZWN0W2tleV0gPSBxdWVyeVtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBvYmplY3Q7XG59XG5cbi8vIFJldHVybnMgYSB0eXBlIHN1aXRhYmxlIGZvciBpbnNlcnRpbmcgaW50byBtb25nbyBfU0NIRU1BIGNvbGxlY3Rpb24uXG4vLyBEb2VzIG5vIHZhbGlkYXRpb24uIFRoYXQgaXMgZXhwZWN0ZWQgdG8gYmUgZG9uZSBpbiBQYXJzZSBTZXJ2ZXIuXG5mdW5jdGlvbiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoeyB0eXBlLCB0YXJnZXRDbGFzcyB9KSB7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuIGAqJHt0YXJnZXRDbGFzc31gO1xuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgIHJldHVybiBgcmVsYXRpb248JHt0YXJnZXRDbGFzc30+YDtcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdudW1iZXInO1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3N0cmluZyc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICdkYXRlJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdvYmplY3QnO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiAnYXJyYXknO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiAnZ2VvcG9pbnQnO1xuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuICdmaWxlJztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2J5dGVzJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gIH1cbn1cblxuY2xhc3MgTW9uZ29TY2hlbWFDb2xsZWN0aW9uIHtcbiAgX2NvbGxlY3Rpb246IE1vbmdvQ29sbGVjdGlvbjtcblxuICBjb25zdHJ1Y3Rvcihjb2xsZWN0aW9uOiBNb25nb0NvbGxlY3Rpb24pIHtcbiAgICB0aGlzLl9jb2xsZWN0aW9uID0gY29sbGVjdGlvbjtcbiAgfVxuXG4gIF9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvblxuICAgICAgLl9yYXdGaW5kKHt9KVxuICAgICAgLnRoZW4oc2NoZW1hcyA9PiBzY2hlbWFzLm1hcChtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEpKTtcbiAgfVxuXG4gIF9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uXG4gICAgICAuX3Jhd0ZpbmQoX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUpLCB7IGxpbWl0OiAxIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgcmV0dXJuIG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShyZXN1bHRzWzBdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kIGFuZCBkZWxldGUgYW4gb2JqZWN0IGJhc2VkIG9uIHF1ZXJ5LlxuICBmaW5kQW5kRGVsZXRlU2NoZW1hKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZEFuZFJlbW92ZShcbiAgICAgIF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSxcbiAgICAgIFtdXG4gICAgKTtcbiAgfVxuXG4gIGluc2VydFNjaGVtYShzY2hlbWE6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uXG4gICAgICAuaW5zZXJ0T25lKHNjaGVtYSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEocmVzdWx0Lm9wc1swXSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvL01vbmdvJ3MgZHVwbGljYXRlIGtleSBlcnJvclxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdDbGFzcyBhbHJlYWR5IGV4aXN0cy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWEobmFtZTogc3RyaW5nLCB1cGRhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi51cGRhdGVPbmUoXG4gICAgICBfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSksXG4gICAgICB1cGRhdGVcbiAgICApO1xuICB9XG5cbiAgdXBzZXJ0U2NoZW1hKG5hbWU6IHN0cmluZywgcXVlcnk6IHN0cmluZywgdXBkYXRlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24udXBzZXJ0T25lKFxuICAgICAgX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUsIHF1ZXJ5KSxcbiAgICAgIHVwZGF0ZVxuICAgICk7XG4gIH1cblxuICAvLyBBZGQgYSBmaWVsZCB0byB0aGUgc2NoZW1hLiBJZiBkYXRhYmFzZSBkb2VzIG5vdCBzdXBwb3J0IHRoZSBmaWVsZFxuICAvLyB0eXBlIChlLmcuIG1vbmdvIGRvZXNuJ3Qgc3VwcG9ydCBtb3JlIHRoYW4gb25lIEdlb1BvaW50IGluIGEgY2xhc3MpIHJlamVjdCB3aXRoIGFuIFwiSW5jb3JyZWN0IFR5cGVcIlxuICAvLyBQYXJzZSBlcnJvciB3aXRoIGEgZGVzY2lwdGl2ZSBtZXNzYWdlLiBJZiB0aGUgZmllbGQgYWxyZWFkeSBleGlzdHMsIHRoaXMgZnVuY3Rpb24gbXVzdFxuICAvLyBub3QgbW9kaWZ5IHRoZSBzY2hlbWEsIGFuZCBtdXN0IHJlamVjdCB3aXRoIERVUExJQ0FURV9WQUxVRSBlcnJvci5cbiAgLy8gSWYgdGhpcyBpcyBjYWxsZWQgZm9yIGEgY2xhc3MgdGhhdCBkb2Vzbid0IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIG11c3QgY3JlYXRlIHRoYXQgY2xhc3MuXG5cbiAgLy8gVE9ETzogdGhyb3cgYW4gZXJyb3IgaWYgYW4gdW5zdXBwb3J0ZWQgZmllbGQgdHlwZSBpcyBwYXNzZWQuIERlY2lkaW5nIHdoZXRoZXIgYSB0eXBlIGlzIHN1cHBvcnRlZFxuICAvLyBzaG91bGQgYmUgdGhlIGpvYiBvZiB0aGUgYWRhcHRlci4gU29tZSBhZGFwdGVycyBtYXkgbm90IHN1cHBvcnQgR2VvUG9pbnQgYXQgYWxsLiBPdGhlcnMgbWF5XG4gIC8vIFN1cHBvcnQgYWRkaXRpb25hbCB0eXBlcyB0aGF0IE1vbmdvIGRvZXNuJ3QsIGxpa2UgTW9uZXksIG9yIHNvbWV0aGluZy5cblxuICAvLyBUT0RPOiBkb24ndCBzcGVuZCBhbiBleHRyYSBxdWVyeSBvbiBmaW5kaW5nIHRoZSBzY2hlbWEgaWYgdGhlIHR5cGUgd2UgYXJlIHRyeWluZyB0byBhZGQgaXNuJ3QgYSBHZW9Qb2ludC5cbiAgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKFxuICAgICAgICBzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIElmIGEgZmllbGQgd2l0aCB0aGlzIG5hbWUgYWxyZWFkeSBleGlzdHMsIGl0IHdpbGwgYmUgaGFuZGxlZCBlbHNld2hlcmUuXG4gICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAhPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBleGlzdHMuIENoZWNrIGZvciBleGlzdGluZyBHZW9Qb2ludHMuXG4gICAgICAgICAgaWYgKHR5cGUudHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHRoZXJlIGFyZSBub3Qgb3RoZXIgZ2VvcG9pbnQgZmllbGRzXG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLnNvbWUoXG4gICAgICAgICAgICAgICAgZXhpc3RpbmdGaWVsZCA9PlxuICAgICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tleGlzdGluZ0ZpZWxkXS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgICAgJ01vbmdvREIgb25seSBzdXBwb3J0cyBvbmUgR2VvUG9pbnQgZmllbGQgaW4gYSBjbGFzcy4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIElmIGVycm9yIGlzIHVuZGVmaW5lZCwgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBhbmQgd2UgY2FuIGNyZWF0ZSB0aGUgc2NoZW1hIHdpdGggdGhlIGZpZWxkLlxuICAgICAgICAgIC8vIElmIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIGl0LlxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIC8vIFdlIHVzZSAkZXhpc3RzIGFuZCAkc2V0IHRvIGF2b2lkIG92ZXJ3cml0aW5nIHRoZSBmaWVsZCB0eXBlIGlmIGl0XG4gICAgICAgIC8vIGFscmVhZHkgZXhpc3RzLiAoaXQgY291bGQgaGF2ZSBhZGRlZCBpbmJldHdlZW4gdGhlIGxhc3QgcXVlcnkgYW5kIHRoZSB1cGRhdGUpXG4gICAgICAgIHJldHVybiB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgeyBbZmllbGROYW1lXTogeyAkZXhpc3RzOiBmYWxzZSB9IH0sXG4gICAgICAgICAgeyAkc2V0OiB7IFtmaWVsZE5hbWVdOiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUodHlwZSkgfSB9XG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgfVxufVxuXG4vLyBFeHBvcnRlZCBmb3IgdGVzdGluZyByZWFzb25zIGFuZCBiZWNhdXNlIHdlIGhhdmVuJ3QgbW92ZWQgYWxsIG1vbmdvIHNjaGVtYSBmb3JtYXRcbi8vIHJlbGF0ZWQgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlciB5ZXQuXG5Nb25nb1NjaGVtYUNvbGxlY3Rpb24uX1RFU1Rtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEgPSBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWE7XG5Nb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlID0gcGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlO1xuXG5leHBvcnQgZGVmYXVsdCBNb25nb1NjaGVtYUNvbGxlY3Rpb247XG4iXX0=