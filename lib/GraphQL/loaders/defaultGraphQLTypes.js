"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.SIGN_UP_RESULT = exports.FIND_RESULT = exports.POLYGON_CONSTRAINT = exports.GEO_POINT_CONSTRAINT = exports.FILE_CONSTRAINT = exports.BYTES_CONSTRAINT = exports.DATE_CONSTRAINT = exports.OBJECT_CONSTRAINT = exports.ARRAY_CONSTRAINT = exports.BOOLEAN_CONSTRAINT = exports.NUMBER_CONSTRAINT = exports.STRING_CONSTRAINT = exports._options = exports._regex = exports._dontSelect = exports._select = exports._exists = exports._nin = exports._in = exports._gte = exports._gt = exports._lte = exports._lt = exports._ne = exports._eq = exports.GEO_INTERSECTS = exports.GEO_WITHIN_OPERATOR = exports.CENTER_SPHERE_OPERATOR = exports.WITHIN_OPERATOR = exports.BOX_OPERATOR = exports.TEXT_OPERATOR = exports.SEARCH_OPERATOR = exports.SELECT_OPERATOR = exports.SUBQUERY = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.INCLUDE_ATT = exports.KEYS_ATT = exports.SESSION_TOKEN_ATT = exports.CLASS = exports.CLASS_FIELDS = exports.UPDATE_RESULT = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.ACL_ATT = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.FIELDS_ATT = exports.CLASS_NAME_ATT = exports.RELATION_OP = exports.POLYGON_INFO = exports.POLYGON = exports.GEO_POINT_INFO = exports.GEO_POINT = exports.GEO_POINT_FIELDS = exports.FILE_INFO = exports.FILE = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = void 0;

var _graphql = require("graphql");

var _graphqlUpload = require("graphql-upload");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class TypeValidationError extends Error {
  constructor(value, type) {
    super(`${value} is not a valid ${type}`);
  }

}

exports.TypeValidationError = TypeValidationError;

const parseStringValue = value => {
  if (typeof value === 'string') {
    return value;
  }

  throw new TypeValidationError(value, 'String');
};

exports.parseStringValue = parseStringValue;

const parseIntValue = value => {
  if (typeof value === 'string') {
    const int = Number(value);

    if (Number.isInteger(int)) {
      return int;
    }
  }

  throw new TypeValidationError(value, 'Int');
};

exports.parseIntValue = parseIntValue;

const parseFloatValue = value => {
  if (typeof value === 'string') {
    const float = Number(value);

    if (!isNaN(float)) {
      return float;
    }
  }

  throw new TypeValidationError(value, 'Float');
};

exports.parseFloatValue = parseFloatValue;

const parseBooleanValue = value => {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new TypeValidationError(value, 'Boolean');
};

exports.parseBooleanValue = parseBooleanValue;

const parseValue = value => {
  switch (value.kind) {
    case _graphql.Kind.STRING:
      return parseStringValue(value.value);

    case _graphql.Kind.INT:
      return parseIntValue(value.value);

    case _graphql.Kind.FLOAT:
      return parseFloatValue(value.value);

    case _graphql.Kind.BOOLEAN:
      return parseBooleanValue(value.value);

    case _graphql.Kind.LIST:
      return parseListValues(value.values);

    case _graphql.Kind.OBJECT:
      return parseObjectFields(value.fields);

    default:
      return value.value;
  }
};

exports.parseValue = parseValue;

const parseListValues = values => {
  if (Array.isArray(values)) {
    return values.map(value => parseValue(value));
  }

  throw new TypeValidationError(values, 'List');
};

exports.parseListValues = parseListValues;

const parseObjectFields = fields => {
  if (Array.isArray(fields)) {
    return fields.reduce((object, field) => _objectSpread({}, object, {
      [field.name.value]: parseValue(field.value)
    }), {});
  }

  throw new TypeValidationError(fields, 'Object');
};

exports.parseObjectFields = parseObjectFields;
const ANY = new _graphql.GraphQLScalarType({
  name: 'Any',
  description: 'The Any scalar type is used in operations and types that involve any type of value.',
  parseValue: value => value,
  serialize: value => value,
  parseLiteral: ast => parseValue(ast)
});
exports.ANY = ANY;
const OBJECT = new _graphql.GraphQLScalarType({
  name: 'Object',
  description: 'The Object scalar type is used in operations and types that involve objects.',

  parseValue(value) {
    if (typeof value === 'object') {
      return value;
    }

    throw new TypeValidationError(value, 'Object');
  },

  serialize(value) {
    if (typeof value === 'object') {
      return value;
    }

    throw new TypeValidationError(value, 'Object');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.OBJECT) {
      return parseObjectFields(ast.fields);
    }

    throw new TypeValidationError(ast.kind, 'Object');
  }

});
exports.OBJECT = OBJECT;

const parseDateIsoValue = value => {
  if (typeof value === 'string') {
    const date = new Date(value);

    if (!isNaN(date)) {
      return date;
    }
  } else if (value instanceof Date) {
    return value;
  }

  throw new TypeValidationError(value, 'Date');
};

exports.parseDateIsoValue = parseDateIsoValue;

const serializeDateIso = value => {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toUTCString();
  }

  throw new TypeValidationError(value, 'Date');
};

exports.serializeDateIso = serializeDateIso;

const parseDateIsoLiteral = ast => {
  if (ast.kind === _graphql.Kind.STRING) {
    return parseDateIsoValue(ast.value);
  }

  throw new TypeValidationError(ast.kind, 'Date');
};

const DATE = new _graphql.GraphQLScalarType({
  name: 'Date',
  description: 'The Date scalar type is used in operations and types that involve dates.',

  parseValue(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return {
        __type: 'Date',
        iso: parseDateIsoValue(value)
      };
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return {
        __type: value.__type,
        iso: parseDateIsoValue(value.iso)
      };
    }

    throw new TypeValidationError(value, 'Date');
  },

  serialize(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return serializeDateIso(value);
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return serializeDateIso(value.iso);
    }

    throw new TypeValidationError(value, 'Date');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Date',
        iso: parseDateIsoLiteral(ast)
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');

      const iso = ast.fields.find(field => field.name.value === 'iso');

      if (__type && __type.value && __type.value.value === 'Date' && iso) {
        return {
          __type: __type.value.value,
          iso: parseDateIsoLiteral(iso.value)
        };
      }
    }

    throw new TypeValidationError(ast.kind, 'Date');
  }

});
exports.DATE = DATE;
const BYTES = new _graphql.GraphQLScalarType({
  name: 'Bytes',
  description: 'The Bytes scalar type is used in operations and types that involve base 64 binary data.',

  parseValue(value) {
    if (typeof value === 'string') {
      return {
        __type: 'Bytes',
        base64: value
      };
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value;
    }

    throw new TypeValidationError(value, 'Bytes');
  },

  serialize(value) {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value.base64;
    }

    throw new TypeValidationError(value, 'Bytes');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Bytes',
        base64: ast.value
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');

      const base64 = ast.fields.find(field => field.name.value === 'base64');

      if (__type && __type.value && __type.value.value === 'Bytes' && base64 && base64.value && typeof base64.value.value === 'string') {
        return {
          __type: __type.value.value,
          base64: base64.value.value
        };
      }
    }

    throw new TypeValidationError(ast.kind, 'Bytes');
  }

});
exports.BYTES = BYTES;

const parseFileValue = value => {
  if (typeof value === 'string') {
    return {
      __type: 'File',
      name: value
    };
  } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
    return value;
  }

  throw new TypeValidationError(value, 'File');
};

exports.parseFileValue = parseFileValue;
const FILE = new _graphql.GraphQLScalarType({
  name: 'File',
  description: 'The File scalar type is used in operations and types that involve files.',
  parseValue: parseFileValue,
  serialize: value => {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
      return value.name;
    }

    throw new TypeValidationError(value, 'File');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return parseFileValue(ast.value);
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');

      const name = ast.fields.find(field => field.name.value === 'name');
      const url = ast.fields.find(field => field.name.value === 'url');

      if (__type && __type.value && name && name.value) {
        return parseFileValue({
          __type: __type.value.value,
          name: name.value.value,
          url: url && url.value ? url.value.value : undefined
        });
      }
    }

    throw new TypeValidationError(ast.kind, 'File');
  }

});
exports.FILE = FILE;
const FILE_INFO = new _graphql.GraphQLObjectType({
  name: 'FileInfo',
  description: 'The FileInfo object type is used to return the information about files.',
  fields: {
    name: {
      description: 'This is the file name.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    url: {
      description: 'This is the url in which the file can be downloaded.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
exports.FILE_INFO = FILE_INFO;
const GEO_POINT_FIELDS = {
  latitude: {
    description: 'This is the latitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  },
  longitude: {
    description: 'This is the longitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  }
};
exports.GEO_POINT_FIELDS = GEO_POINT_FIELDS;
const GEO_POINT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint input type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT = GEO_POINT;
const GEO_POINT_INFO = new _graphql.GraphQLObjectType({
  name: 'GeoPointInfo',
  description: 'The GeoPointInfo object type is used to return the information about geo points.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT_INFO = GEO_POINT_INFO;
const POLYGON = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT));
exports.POLYGON = POLYGON;
const POLYGON_INFO = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT_INFO));
exports.POLYGON_INFO = POLYGON_INFO;
const RELATION_OP = new _graphql.GraphQLEnumType({
  name: 'RelationOp',
  description: 'The RelationOp enum type is used to specify which kind of operation should be executed to a relation.',
  values: {
    Batch: {
      value: 'Batch'
    },
    AddRelation: {
      value: 'AddRelation'
    },
    RemoveRelation: {
      value: 'RemoveRelation'
    }
  }
});
exports.RELATION_OP = RELATION_OP;
const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.CLASS_NAME_ATT = CLASS_NAME_ATT;
const FIELDS_ATT = {
  description: 'These are the fields of the object.',
  type: OBJECT
};
exports.FIELDS_ATT = FIELDS_ATT;
const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
};
exports.OBJECT_ID_ATT = OBJECT_ID_ATT;
const CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.CREATED_AT_ATT = CREATED_AT_ATT;
const UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.UPDATED_AT_ATT = UPDATED_AT_ATT;
const ACL_ATT = {
  description: 'This is the access control list of the object.',
  type: OBJECT
};
exports.ACL_ATT = ACL_ATT;
const INPUT_FIELDS = {
  ACL: ACL_ATT
};
exports.INPUT_FIELDS = INPUT_FIELDS;
const CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
exports.CREATE_RESULT_FIELDS = CREATE_RESULT_FIELDS;
const CREATE_RESULT = new _graphql.GraphQLObjectType({
  name: 'CreateResult',
  description: 'The CreateResult object type is used in the create mutations to return the data of the recent created object.',
  fields: CREATE_RESULT_FIELDS
});
exports.CREATE_RESULT = CREATE_RESULT;
const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
exports.UPDATE_RESULT_FIELDS = UPDATE_RESULT_FIELDS;
const UPDATE_RESULT = new _graphql.GraphQLObjectType({
  name: 'UpdateResult',
  description: 'The UpdateResult object type is used in the update mutations to return the data of the recent updated object.',
  fields: UPDATE_RESULT_FIELDS
});
exports.UPDATE_RESULT = UPDATE_RESULT;

const CLASS_FIELDS = _objectSpread({}, CREATE_RESULT_FIELDS, {}, UPDATE_RESULT_FIELDS, {}, INPUT_FIELDS);

exports.CLASS_FIELDS = CLASS_FIELDS;
const CLASS = new _graphql.GraphQLInterfaceType({
  name: 'Class',
  description: 'The Class interface type is used as a base type for the auto generated class types.',
  fields: CLASS_FIELDS
});
exports.CLASS = CLASS;
const SESSION_TOKEN_ATT = {
  description: 'The user session token',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.SESSION_TOKEN_ATT = SESSION_TOKEN_ATT;
const KEYS_ATT = {
  description: 'The keys of the objects that will be returned.',
  type: _graphql.GraphQLString
};
exports.KEYS_ATT = KEYS_ATT;
const INCLUDE_ATT = {
  description: 'The pointers of the objects that will be returned.',
  type: _graphql.GraphQLString
};
exports.INCLUDE_ATT = INCLUDE_ATT;
const READ_PREFERENCE = new _graphql.GraphQLEnumType({
  name: 'ReadPreference',
  description: 'The ReadPreference enum type is used in queries in order to select in which database replica the operation must run.',
  values: {
    PRIMARY: {
      value: 'PRIMARY'
    },
    PRIMARY_PREFERRED: {
      value: 'PRIMARY_PREFERRED'
    },
    SECONDARY: {
      value: 'SECONDARY'
    },
    SECONDARY_PREFERRED: {
      value: 'SECONDARY_PREFERRED'
    },
    NEAREST: {
      value: 'NEAREST'
    }
  }
});
exports.READ_PREFERENCE = READ_PREFERENCE;
const READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed.',
  type: READ_PREFERENCE
};
exports.READ_PREFERENCE_ATT = READ_PREFERENCE_ATT;
const INCLUDE_READ_PREFERENCE_ATT = {
  description: 'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE
};
exports.INCLUDE_READ_PREFERENCE_ATT = INCLUDE_READ_PREFERENCE_ATT;
const SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE
};
exports.SUBQUERY_READ_PREFERENCE_ATT = SUBQUERY_READ_PREFERENCE_ATT;
const WHERE_ATT = {
  description: 'These are the conditions that the objects need to match in order to be found',
  type: OBJECT
};
exports.WHERE_ATT = WHERE_ATT;
const SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return.',
  type: _graphql.GraphQLInt
};
exports.SKIP_ATT = SKIP_ATT;
const LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned.',
  type: _graphql.GraphQLInt
};
exports.LIMIT_ATT = LIMIT_ATT;
const COUNT_ATT = {
  description: 'This is the total matched objecs count that is returned when the count flag is set.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
};
exports.COUNT_ATT = COUNT_ATT;
const SUBQUERY = new _graphql.GraphQLInputObjectType({
  name: 'Subquery',
  description: 'The Subquery input type is used to specific a different query to a different class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new _graphql.GraphQLNonNull(WHERE_ATT.type)
    })
  }
});
exports.SUBQUERY = SUBQUERY;
const SELECT_OPERATOR = new _graphql.GraphQLInputObjectType({
  name: 'SelectOperator',
  description: 'The SelectOperator input type is used to specify a $select operation on a constraint.',
  fields: {
    query: {
      description: 'This is the subquery to be executed.',
      type: new _graphql.GraphQLNonNull(SUBQUERY)
    },
    key: {
      description: 'This is the key in the result of the subquery that must match (not match) the field.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
exports.SELECT_OPERATOR = SELECT_OPERATOR;
const SEARCH_OPERATOR = new _graphql.GraphQLInputObjectType({
  name: 'SearchOperator',
  description: 'The SearchOperator input type is used to specifiy a $search operation on a full text search.',
  fields: {
    _term: {
      description: 'This is the term to be searched.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    _language: {
      description: 'This is the language to tetermine the list of stop words and the rules for tokenizer.',
      type: _graphql.GraphQLString
    },
    _caseSensitive: {
      description: 'This is the flag to enable or disable case sensitive search.',
      type: _graphql.GraphQLBoolean
    },
    _diacriticSensitive: {
      description: 'This is the flag to enable or disable diacritic sensitive search.',
      type: _graphql.GraphQLBoolean
    }
  }
});
exports.SEARCH_OPERATOR = SEARCH_OPERATOR;
const TEXT_OPERATOR = new _graphql.GraphQLInputObjectType({
  name: 'TextOperator',
  description: 'The TextOperator input type is used to specify a $text operation on a constraint.',
  fields: {
    _search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_OPERATOR)
    }
  }
});
exports.TEXT_OPERATOR = TEXT_OPERATOR;
const BOX_OPERATOR = new _graphql.GraphQLInputObjectType({
  name: 'BoxOperator',
  description: 'The BoxOperator input type is used to specifiy a $box operation on a within geo query.',
  fields: {
    bottomLeft: {
      description: 'This is the bottom left coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT)
    },
    upperRight: {
      description: 'This is the upper right coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT)
    }
  }
});
exports.BOX_OPERATOR = BOX_OPERATOR;
const WITHIN_OPERATOR = new _graphql.GraphQLInputObjectType({
  name: 'WithinOperator',
  description: 'The WithinOperator input type is used to specify a $within operation on a constraint.',
  fields: {
    _box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_OPERATOR)
    }
  }
});
exports.WITHIN_OPERATOR = WITHIN_OPERATOR;
const CENTER_SPHERE_OPERATOR = new _graphql.GraphQLInputObjectType({
  name: 'CenterSphereOperator',
  description: 'The CenterSphereOperator input type is used to specifiy a $centerSphere operation on a geoWithin query.',
  fields: {
    center: {
      description: 'This is the center of the sphere.',
      type: new _graphql.GraphQLNonNull(GEO_POINT)
    },
    distance: {
      description: 'This is the radius of the sphere.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
    }
  }
});
exports.CENTER_SPHERE_OPERATOR = CENTER_SPHERE_OPERATOR;
const GEO_WITHIN_OPERATOR = new _graphql.GraphQLInputObjectType({
  name: 'GeoWithinOperator',
  description: 'The GeoWithinOperator input type is used to specify a $geoWithin operation on a constraint.',
  fields: {
    _polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON
    },
    _centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_OPERATOR
    }
  }
});
exports.GEO_WITHIN_OPERATOR = GEO_WITHIN_OPERATOR;
const GEO_INTERSECTS = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsOperator',
  description: 'The GeoIntersectsOperator input type is used to specify a $geoIntersects operation on a constraint.',
  fields: {
    _point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT
    }
  }
});
exports.GEO_INTERSECTS = GEO_INTERSECTS;

const _eq = type => ({
  description: 'This is the $eq operator to specify a constraint to select the objects where the value of a field equals to a specified value.',
  type
});

exports._eq = _eq;

const _ne = type => ({
  description: 'This is the $ne operator to specify a constraint to select the objects where the value of a field do not equal to a specified value.',
  type
});

exports._ne = _ne;

const _lt = type => ({
  description: 'This is the $lt operator to specify a constraint to select the objects where the value of a field is less than a specified value.',
  type
});

exports._lt = _lt;

const _lte = type => ({
  description: 'This is the $lte operator to specify a constraint to select the objects where the value of a field is less than or equal to a specified value.',
  type
});

exports._lte = _lte;

const _gt = type => ({
  description: 'This is the $gt operator to specify a constraint to select the objects where the value of a field is greater than a specified value.',
  type
});

exports._gt = _gt;

const _gte = type => ({
  description: 'This is the $gte operator to specify a constraint to select the objects where the value of a field is greater than or equal to a specified value.',
  type
});

exports._gte = _gte;

const _in = type => ({
  description: 'This is the $in operator to specify a constraint to select the objects where the value of a field equals any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});

exports._in = _in;

const _nin = type => ({
  description: 'This is the $nin operator to specify a constraint to select the objects where the value of a field do not equal any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});

exports._nin = _nin;
const _exists = {
  description: 'This is the $exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: _graphql.GraphQLBoolean
};
exports._exists = _exists;
const _select = {
  description: 'This is the $select operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_OPERATOR
};
exports._select = _select;
const _dontSelect = {
  description: 'This is the $dontSelect operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_OPERATOR
};
exports._dontSelect = _dontSelect;
const _regex = {
  description: 'This is the $regex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: _graphql.GraphQLString
};
exports._regex = _regex;
const _options = {
  description: 'This is the $options operator to specify optional flags (such as "i" and "m") to be added to a $regex operation in the same set of constraints.',
  type: _graphql.GraphQLString
};
exports._options = _options;
const STRING_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'StringConstraint',
  description: 'The StringConstraint input type is used in operations that involve filtering objects by a field of type String.',
  fields: {
    _eq: _eq(_graphql.GraphQLString),
    _ne: _ne(_graphql.GraphQLString),
    _lt: _lt(_graphql.GraphQLString),
    _lte: _lte(_graphql.GraphQLString),
    _gt: _gt(_graphql.GraphQLString),
    _gte: _gte(_graphql.GraphQLString),
    _in: _in(_graphql.GraphQLString),
    _nin: _nin(_graphql.GraphQLString),
    _exists,
    _select,
    _dontSelect,
    _regex,
    _options,
    _text: {
      description: 'This is the $text operator to specify a full text search constraint.',
      type: TEXT_OPERATOR
    }
  }
});
exports.STRING_CONSTRAINT = STRING_CONSTRAINT;
const NUMBER_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'NumberConstraint',
  description: 'The NumberConstraint input type is used in operations that involve filtering objects by a field of type Number.',
  fields: {
    _eq: _eq(_graphql.GraphQLFloat),
    _ne: _ne(_graphql.GraphQLFloat),
    _lt: _lt(_graphql.GraphQLFloat),
    _lte: _lte(_graphql.GraphQLFloat),
    _gt: _gt(_graphql.GraphQLFloat),
    _gte: _gte(_graphql.GraphQLFloat),
    _in: _in(_graphql.GraphQLFloat),
    _nin: _nin(_graphql.GraphQLFloat),
    _exists,
    _select,
    _dontSelect
  }
});
exports.NUMBER_CONSTRAINT = NUMBER_CONSTRAINT;
const BOOLEAN_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'BooleanConstraint',
  description: 'The BooleanConstraint input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    _eq: _eq(_graphql.GraphQLBoolean),
    _ne: _ne(_graphql.GraphQLBoolean),
    _exists,
    _select,
    _dontSelect
  }
});
exports.BOOLEAN_CONSTRAINT = BOOLEAN_CONSTRAINT;
const ARRAY_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'ArrayConstraint',
  description: 'The ArrayConstraint input type is used in operations that involve filtering objects by a field of type Array.',
  fields: {
    _eq: _eq(ANY),
    _ne: _ne(ANY),
    _lt: _lt(ANY),
    _lte: _lte(ANY),
    _gt: _gt(ANY),
    _gte: _gte(ANY),
    _in: _in(ANY),
    _nin: _nin(ANY),
    _exists,
    _select,
    _dontSelect,
    _containedBy: {
      description: 'This is the $containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    _all: {
      description: 'This is the $all operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new _graphql.GraphQLList(ANY)
    }
  }
});
exports.ARRAY_CONSTRAINT = ARRAY_CONSTRAINT;
const OBJECT_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'ObjectConstraint',
  description: 'The ObjectConstraint input type is used in operations that involve filtering objects by a field of type Object.',
  fields: {
    _eq: _eq(OBJECT),
    _ne: _ne(OBJECT),
    _in: _in(OBJECT),
    _nin: _nin(OBJECT),
    _exists,
    _select,
    _dontSelect
  }
});
exports.OBJECT_CONSTRAINT = OBJECT_CONSTRAINT;
const DATE_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'DateConstraint',
  description: 'The DateConstraint input type is used in operations that involve filtering objects by a field of type Date.',
  fields: {
    _eq: _eq(DATE),
    _ne: _ne(DATE),
    _lt: _lt(DATE),
    _lte: _lte(DATE),
    _gt: _gt(DATE),
    _gte: _gte(DATE),
    _in: _in(DATE),
    _nin: _nin(DATE),
    _exists,
    _select,
    _dontSelect
  }
});
exports.DATE_CONSTRAINT = DATE_CONSTRAINT;
const BYTES_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'BytesConstraint',
  description: 'The BytesConstraint input type is used in operations that involve filtering objects by a field of type Bytes.',
  fields: {
    _eq: _eq(BYTES),
    _ne: _ne(BYTES),
    _lt: _lt(BYTES),
    _lte: _lte(BYTES),
    _gt: _gt(BYTES),
    _gte: _gte(BYTES),
    _in: _in(BYTES),
    _nin: _nin(BYTES),
    _exists,
    _select,
    _dontSelect
  }
});
exports.BYTES_CONSTRAINT = BYTES_CONSTRAINT;
const FILE_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'FileConstraint',
  description: 'The FILE_CONSTRAINT input type is used in operations that involve filtering objects by a field of type File.',
  fields: {
    _eq: _eq(FILE),
    _ne: _ne(FILE),
    _lt: _lt(FILE),
    _lte: _lte(FILE),
    _gt: _gt(FILE),
    _gte: _gte(FILE),
    _in: _in(FILE),
    _nin: _nin(FILE),
    _exists,
    _select,
    _dontSelect,
    _regex,
    _options
  }
});
exports.FILE_CONSTRAINT = FILE_CONSTRAINT;
const GEO_POINT_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointConstraint',
  description: 'The GeoPointConstraint input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    _exists,
    _nearSphere: {
      description: 'This is the $nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT
    },
    _maxDistance: {
      description: 'This is the $maxDistance operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    _maxDistanceInRadians: {
      description: 'This is the $maxDistanceInRadians operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    _maxDistanceInMiles: {
      description: 'This is the $maxDistanceInMiles operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in miles) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    _maxDistanceInKilometers: {
      description: 'This is the $maxDistanceInKilometers operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in kilometers) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    _within: {
      description: 'This is the $within operator to specify a constraint to select the objects where the values of a geo point field is within a specified box.',
      type: WITHIN_OPERATOR
    },
    _geoWithin: {
      description: 'This is the $geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_OPERATOR
    }
  }
});
exports.GEO_POINT_CONSTRAINT = GEO_POINT_CONSTRAINT;
const POLYGON_CONSTRAINT = new _graphql.GraphQLInputObjectType({
  name: 'PolygonConstraint',
  description: 'The PolygonConstraint input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    _exists,
    _geoIntersects: {
      description: 'This is the $geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
      type: GEO_INTERSECTS
    }
  }
});
exports.POLYGON_CONSTRAINT = POLYGON_CONSTRAINT;
const FIND_RESULT = new _graphql.GraphQLObjectType({
  name: 'FindResult',
  description: 'The FindResult object type is used in the find queries to return the data of the matched objects.',
  fields: {
    results: {
      description: 'This is the objects returned by the query',
      type: new _graphql.GraphQLNonNull(new _graphql.GraphQLList(new _graphql.GraphQLNonNull(OBJECT)))
    },
    count: COUNT_ATT
  }
});
exports.FIND_RESULT = FIND_RESULT;
const SIGN_UP_RESULT = new _graphql.GraphQLObjectType({
  name: 'SignUpResult',
  description: 'The SignUpResult object type is used in the users sign up mutation to return the data of the recent created user.',
  fields: _objectSpread({}, CREATE_RESULT_FIELDS, {
    sessionToken: SESSION_TOKEN_ATT
  })
});
exports.SIGN_UP_RESULT = SIGN_UP_RESULT;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLTypes.push(_graphqlUpload.GraphQLUpload);
  parseGraphQLSchema.graphQLTypes.push(ANY);
  parseGraphQLSchema.graphQLTypes.push(OBJECT);
  parseGraphQLSchema.graphQLTypes.push(DATE);
  parseGraphQLSchema.graphQLTypes.push(BYTES);
  parseGraphQLSchema.graphQLTypes.push(FILE);
  parseGraphQLSchema.graphQLTypes.push(FILE_INFO);
  parseGraphQLSchema.graphQLTypes.push(GEO_POINT);
  parseGraphQLSchema.graphQLTypes.push(GEO_POINT_INFO);
  parseGraphQLSchema.graphQLTypes.push(RELATION_OP);
  parseGraphQLSchema.graphQLTypes.push(CREATE_RESULT);
  parseGraphQLSchema.graphQLTypes.push(UPDATE_RESULT);
  parseGraphQLSchema.graphQLTypes.push(CLASS);
  parseGraphQLSchema.graphQLTypes.push(READ_PREFERENCE);
  parseGraphQLSchema.graphQLTypes.push(SUBQUERY);
  parseGraphQLSchema.graphQLTypes.push(SELECT_OPERATOR);
  parseGraphQLSchema.graphQLTypes.push(SEARCH_OPERATOR);
  parseGraphQLSchema.graphQLTypes.push(TEXT_OPERATOR);
  parseGraphQLSchema.graphQLTypes.push(BOX_OPERATOR);
  parseGraphQLSchema.graphQLTypes.push(WITHIN_OPERATOR);
  parseGraphQLSchema.graphQLTypes.push(CENTER_SPHERE_OPERATOR);
  parseGraphQLSchema.graphQLTypes.push(GEO_WITHIN_OPERATOR);
  parseGraphQLSchema.graphQLTypes.push(GEO_INTERSECTS);
  parseGraphQLSchema.graphQLTypes.push(STRING_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(NUMBER_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(BOOLEAN_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(ARRAY_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(OBJECT_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(DATE_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(BYTES_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(FILE_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(GEO_POINT_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(POLYGON_CONSTRAINT);
  parseGraphQLSchema.graphQLTypes.push(FIND_RESULT);
  parseGraphQLSchema.graphQLTypes.push(SIGN_UP_RESULT);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9VVENTdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIkdFT19QT0lOVF9JTkZPIiwiUE9MWUdPTiIsIkdyYXBoUUxMaXN0IiwiUE9MWUdPTl9JTkZPIiwiUkVMQVRJT05fT1AiLCJHcmFwaFFMRW51bVR5cGUiLCJCYXRjaCIsIkFkZFJlbGF0aW9uIiwiUmVtb3ZlUmVsYXRpb24iLCJDTEFTU19OQU1FX0FUVCIsIkZJRUxEU19BVFQiLCJPQkpFQ1RfSURfQVRUIiwiR3JhcGhRTElEIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIkFDTF9BVFQiLCJJTlBVVF9GSUVMRFMiLCJBQ0wiLCJDUkVBVEVfUkVTVUxUX0ZJRUxEUyIsIm9iamVjdElkIiwiY3JlYXRlZEF0IiwiQ1JFQVRFX1JFU1VMVCIsIlVQREFURV9SRVNVTFRfRklFTERTIiwidXBkYXRlZEF0IiwiVVBEQVRFX1JFU1VMVCIsIkNMQVNTX0ZJRUxEUyIsIkNMQVNTIiwiR3JhcGhRTEludGVyZmFjZVR5cGUiLCJTRVNTSU9OX1RPS0VOX0FUVCIsIktFWVNfQVRUIiwiSU5DTFVERV9BVFQiLCJSRUFEX1BSRUZFUkVOQ0UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsIlJFQURfUFJFRkVSRU5DRV9BVFQiLCJJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiV0hFUkVfQVRUIiwiU0tJUF9BVFQiLCJHcmFwaFFMSW50IiwiTElNSVRfQVRUIiwiQ09VTlRfQVRUIiwiU1VCUVVFUlkiLCJjbGFzc05hbWUiLCJ3aGVyZSIsIk9iamVjdCIsImFzc2lnbiIsIlNFTEVDVF9PUEVSQVRPUiIsInF1ZXJ5Iiwia2V5IiwiU0VBUkNIX09QRVJBVE9SIiwiX3Rlcm0iLCJfbGFuZ3VhZ2UiLCJfY2FzZVNlbnNpdGl2ZSIsIkdyYXBoUUxCb29sZWFuIiwiX2RpYWNyaXRpY1NlbnNpdGl2ZSIsIlRFWFRfT1BFUkFUT1IiLCJfc2VhcmNoIiwiQk9YX09QRVJBVE9SIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJXSVRISU5fT1BFUkFUT1IiLCJfYm94IiwiQ0VOVEVSX1NQSEVSRV9PUEVSQVRPUiIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9PUEVSQVRPUiIsIl9wb2x5Z29uIiwiX2NlbnRlclNwaGVyZSIsIkdFT19JTlRFUlNFQ1RTIiwiX3BvaW50IiwiX2VxIiwiX25lIiwiX2x0IiwiX2x0ZSIsIl9ndCIsIl9ndGUiLCJfaW4iLCJfbmluIiwiX2V4aXN0cyIsIl9zZWxlY3QiLCJfZG9udFNlbGVjdCIsIl9yZWdleCIsIl9vcHRpb25zIiwiU1RSSU5HX0NPTlNUUkFJTlQiLCJfdGV4dCIsIk5VTUJFUl9DT05TVFJBSU5UIiwiQk9PTEVBTl9DT05TVFJBSU5UIiwiQVJSQVlfQ09OU1RSQUlOVCIsIl9jb250YWluZWRCeSIsIl9hbGwiLCJPQkpFQ1RfQ09OU1RSQUlOVCIsIkRBVEVfQ09OU1RSQUlOVCIsIkJZVEVTX0NPTlNUUkFJTlQiLCJGSUxFX0NPTlNUUkFJTlQiLCJHRU9fUE9JTlRfQ09OU1RSQUlOVCIsIl9uZWFyU3BoZXJlIiwiX21heERpc3RhbmNlIiwiX21heERpc3RhbmNlSW5SYWRpYW5zIiwiX21heERpc3RhbmNlSW5NaWxlcyIsIl9tYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIl93aXRoaW4iLCJfZ2VvV2l0aGluIiwiUE9MWUdPTl9DT05TVFJBSU5UIiwiX2dlb0ludGVyc2VjdHMiLCJGSU5EX1JFU1VMVCIsInJlc3VsdHMiLCJjb3VudCIsIlNJR05fVVBfUkVTVUxUIiwic2Vzc2lvblRva2VuIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImdyYXBoUUxUeXBlcyIsInB1c2giLCJHcmFwaFFMVXBsb2FkIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBZUE7Ozs7Ozs7O0FBRUEsTUFBTUEsbUJBQU4sU0FBa0NDLEtBQWxDLENBQXdDO0FBQ3RDQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBUUMsSUFBUixFQUFjO0FBQ3ZCLFVBQU8sR0FBRUQsS0FBTSxtQkFBa0JDLElBQUssRUFB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QixDQUFDQyxZQUFuQixDQUFnQ0MsSUFBaEMsQ0FBcUNwQixnQkFBckM7QUFDQWtCLEVBQUFBLGtCQUFrQixDQUFDQyxZQUFuQixDQUFnQ0MsSUFBaEMsQ0FBcUNuQixlQUFyQztBQUNBaUIsRUFBQUEsa0JBQWtCLENBQUNDLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ2xCLG9CQUFyQztBQUNBZ0IsRUFBQUEsa0JBQWtCLENBQUNDLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ1Ysa0JBQXJDO0FBQ0FRLEVBQUFBLGtCQUFrQixDQUFDQyxZQUFuQixDQUFnQ0MsSUFBaEMsQ0FBcUNSLFdBQXJDO0FBQ0FNLEVBQUFBLGtCQUFrQixDQUFDQyxZQUFuQixDQUFnQ0MsSUFBaEMsQ0FBcUNMLGNBQXJDO0FBQ0QsQ0FwQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTFNjYWxhclR5cGUsXG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxJbnRlcmZhY2VUeXBlLFxuICBHcmFwaFFMRW51bVR5cGUsXG4gIEdyYXBoUUxJbnQsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxCb29sZWFuLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdncmFwaHFsLXVwbG9hZCc7XG5cbmNsYXNzIFR5cGVWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHZhbHVlLCB0eXBlKSB7XG4gICAgc3VwZXIoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbGlkICR7dHlwZX1gKTtcbiAgfVxufVxuXG5jb25zdCBwYXJzZVN0cmluZ1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnU3RyaW5nJyk7XG59O1xuXG5jb25zdCBwYXJzZUludFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGZsb2F0KSkge1xuICAgICAgcmV0dXJuIGZsb2F0O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmxvYXQnKTtcbn07XG5cbmNvbnN0IHBhcnNlQm9vbGVhblZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Jvb2xlYW4nKTtcbn07XG5cbmNvbnN0IHBhcnNlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9IHZhbHVlcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICByZXR1cm4gdmFsdWVzLm1hcCh2YWx1ZSA9PiBwYXJzZVZhbHVlKHZhbHVlKSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZXMsICdMaXN0Jyk7XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IGZpZWxkcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6IHZhbHVlID0+IHZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHZhbHVlLFxuICBwYXJzZUxpdGVyYWw6IGFzdCA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIG9iamVjdHMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKGFzdC5maWVsZHMpO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnT2JqZWN0Jyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VEYXRlSXNvVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZGF0ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBzZXJpYWxpemVEYXRlSXNvID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvVVRDU3RyaW5nKCk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb0xpdGVyYWwgPSBhc3QgPT4ge1xuICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgcmV0dXJuIHBhcnNlRGF0ZUlzb1ZhbHVlKGFzdC52YWx1ZSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IERBVEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRGF0ZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBkYXRlcy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZSksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJlxuICAgICAgdmFsdWUuaXNvXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6IHZhbHVlLl9fdHlwZSxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZS5pc28pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmXG4gICAgICB2YWx1ZS5pc29cbiAgICApIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgaXNvID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdpc28nKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0RhdGUnICYmIGlzbykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChpc28udmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0J5dGVzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlcyBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBiYXNlIDY0IGJpbmFyeSBkYXRhLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLmJhc2U2NDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogYXN0LnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnYmFzZTY0Jyk7XG4gICAgICBpZiAoXG4gICAgICAgIF9fdHlwZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlLnZhbHVlID09PSAnQnl0ZXMnICYmXG4gICAgICAgIGJhc2U2NCAmJlxuICAgICAgICBiYXNlNjQudmFsdWUgJiZcbiAgICAgICAgdHlwZW9mIGJhc2U2NC52YWx1ZS52YWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGJhc2U2NDogYmFzZTY0LnZhbHVlLnZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnQnl0ZXMnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZUZpbGVWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiB2YWx1ZSxcbiAgICB9O1xuICB9IGVsc2UgaWYgKFxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG59O1xuXG5jb25zdCBGSUxFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0ZpbGUnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZmlsZXMuJyxcbiAgcGFyc2VWYWx1ZTogcGFyc2VGaWxlVmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKGFzdC52YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBuYW1lID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICduYW1lJyk7XG4gICAgICBjb25zdCB1cmwgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ3VybCcpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgbmFtZSAmJiBuYW1lLnZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZSh7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgbmFtZTogbmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB1cmw6IHVybCAmJiB1cmwudmFsdWUgPyB1cmwudmFsdWUudmFsdWUgOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRmlsZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5GTyA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5mbycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZUluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGZpbGVzLicsXG4gIGZpZWxkczoge1xuICAgIG5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmlsZSBuYW1lLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXJsIGluIHdoaWNoIHRoZSBmaWxlIGNhbiBiZSBkb3dubG9hZGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfRklFTERTID0ge1xuICBsYXRpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGF0aXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbiAgbG9uZ2l0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsb25naXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbn07XG5cbmNvbnN0IEdFT19QT0lOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgaW5wdXR0aW5nIGZpZWxkcyBvZiB0eXBlIGdlbyBwb2ludC4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX0lORk8gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRJbmZvJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludEluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGdlbyBwb2ludHMuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IFBPTFlHT04gPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCkpO1xuXG5jb25zdCBQT0xZR09OX0lORk8gPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTkZPKSk7XG5cbmNvbnN0IFJFTEFUSU9OX09QID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gIG5hbWU6ICdSZWxhdGlvbk9wJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWxhdGlvbk9wIGVudW0gdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgd2hpY2gga2luZCBvZiBvcGVyYXRpb24gc2hvdWxkIGJlIGV4ZWN1dGVkIHRvIGEgcmVsYXRpb24uJyxcbiAgdmFsdWVzOiB7XG4gICAgQmF0Y2g6IHsgdmFsdWU6ICdCYXRjaCcgfSxcbiAgICBBZGRSZWxhdGlvbjogeyB2YWx1ZTogJ0FkZFJlbGF0aW9uJyB9LFxuICAgIFJlbW92ZVJlbGF0aW9uOiB7IHZhbHVlOiAnUmVtb3ZlUmVsYXRpb24nIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQ0xBU1NfTkFNRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY2xhc3MgbmFtZSBvZiB0aGUgb2JqZWN0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IEZJRUxEU19BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIG9iamVjdC4nLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBPQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbn07XG5cbmNvbnN0IENSRUFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgY3JlYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBVUERBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGxhcyB1cGRhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IEFDTF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYWNjZXNzIGNvbnRyb2wgbGlzdCBvZiB0aGUgb2JqZWN0LicsXG4gIHR5cGU6IE9CSkVDVCxcbn07XG5cbmNvbnN0IElOUFVUX0ZJRUxEUyA9IHtcbiAgQUNMOiBBQ0xfQVRULFxufTtcblxuY29uc3QgQ1JFQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIG9iamVjdElkOiBPQkpFQ1RfSURfQVRULFxuICBjcmVhdGVkQXQ6IENSRUFURURfQVRfQVRULFxufTtcblxuY29uc3QgQ1JFQVRFX1JFU1VMVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdDcmVhdGVSZXN1bHQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENyZWF0ZVJlc3VsdCBvYmplY3QgdHlwZSBpcyB1c2VkIGluIHRoZSBjcmVhdGUgbXV0YXRpb25zIHRvIHJldHVybiB0aGUgZGF0YSBvZiB0aGUgcmVjZW50IGNyZWF0ZWQgb2JqZWN0LicsXG4gIGZpZWxkczogQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG59KTtcblxuY29uc3QgVVBEQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIHVwZGF0ZWRBdDogVVBEQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBVUERBVEVfUkVTVUxUID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VwZGF0ZVJlc3VsdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgVXBkYXRlUmVzdWx0IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gdGhlIHVwZGF0ZSBtdXRhdGlvbnMgdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSByZWNlbnQgdXBkYXRlZCBvYmplY3QuJyxcbiAgZmllbGRzOiBVUERBVEVfUkVTVUxUX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBDTEFTU19GSUVMRFMgPSB7XG4gIC4uLkNSRUFURV9SRVNVTFRfRklFTERTLFxuICAuLi5VUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uSU5QVVRfRklFTERTLFxufTtcblxuY29uc3QgQ0xBU1MgPSBuZXcgR3JhcGhRTEludGVyZmFjZVR5cGUoe1xuICBuYW1lOiAnQ2xhc3MnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENsYXNzIGludGVyZmFjZSB0eXBlIGlzIHVzZWQgYXMgYSBiYXNlIHR5cGUgZm9yIHRoZSBhdXRvIGdlbmVyYXRlZCBjbGFzcyB0eXBlcy4nLFxuICBmaWVsZHM6IENMQVNTX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBTRVNTSU9OX1RPS0VOX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgdXNlciBzZXNzaW9uIHRva2VuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgS0VZU19BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIGtleXMgb2YgdGhlIG9iamVjdHMgdGhhdCB3aWxsIGJlIHJldHVybmVkLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBJTkNMVURFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcG9pbnRlcnMgb2YgdGhlIG9iamVjdHMgdGhhdCB3aWxsIGJlIHJldHVybmVkLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0UgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgbmFtZTogJ1JlYWRQcmVmZXJlbmNlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkUHJlZmVyZW5jZSBlbnVtIHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNlbGVjdCBpbiB3aGljaCBkYXRhYmFzZSByZXBsaWNhIHRoZSBvcGVyYXRpb24gbXVzdCBydW4uJyxcbiAgdmFsdWVzOiB7XG4gICAgUFJJTUFSWTogeyB2YWx1ZTogJ1BSSU1BUlknIH0sXG4gICAgUFJJTUFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdQUklNQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBTRUNPTkRBUlk6IHsgdmFsdWU6ICdTRUNPTkRBUlknIH0sXG4gICAgU0VDT05EQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1NFQ09OREFSWV9QUkVGRVJSRUQnIH0sXG4gICAgTkVBUkVTVDogeyB2YWx1ZTogJ05FQVJFU1QnIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgbWFpbiBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgcXVlcmllcyB0byBiZSBleGVjdXRlZCB0byBpbmNsdWRlIGZpZWxkcy4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBzdWJxdWVyaWVzIHRoYXQgbWF5IGJlIHJlcXVpcmVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFdIRVJFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQnLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBTS0lQX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgc2tpcHBlZCB0byByZXR1cm4uJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IExJTUlUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsaW1pdCBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IENPVU5UX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIHRvdGFsIG1hdGNoZWQgb2JqZWNzIGNvdW50IHRoYXQgaXMgcmV0dXJuZWQgd2hlbiB0aGUgY291bnQgZmxhZyBpcyBzZXQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJbnQpLFxufTtcblxuY29uc3QgU1VCUVVFUlkgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdWJxdWVyeScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3VicXVlcnkgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZmljIGEgZGlmZmVyZW50IHF1ZXJ5IHRvIGEgZGlmZmVyZW50IGNsYXNzLicsXG4gIGZpZWxkczoge1xuICAgIGNsYXNzTmFtZTogQ0xBU1NfTkFNRV9BVFQsXG4gICAgd2hlcmU6IE9iamVjdC5hc3NpZ24oe30sIFdIRVJFX0FUVCwge1xuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFdIRVJFX0FUVC50eXBlKSxcbiAgICB9KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUxFQ1RfT1BFUkFUT1IgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWxlY3RPcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VsZWN0T3BlcmF0b3IgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSAkc2VsZWN0IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcXVlcnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3VicXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChTVUJRVUVSWSksXG4gICAgfSxcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUga2V5IGluIHRoZSByZXN1bHQgb2YgdGhlIHN1YnF1ZXJ5IHRoYXQgbXVzdCBtYXRjaCAobm90IG1hdGNoKSB0aGUgZmllbGQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFNFQVJDSF9PUEVSQVRPUiA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1NlYXJjaE9wZXJhdG9yJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTZWFyY2hPcGVyYXRvciBpbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSAkc2VhcmNoIG9wZXJhdGlvbiBvbiBhIGZ1bGwgdGV4dCBzZWFyY2guJyxcbiAgZmllbGRzOiB7XG4gICAgX3Rlcm06IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdGVybSB0byBiZSBzZWFyY2hlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgX2xhbmd1YWdlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGxhbmd1YWdlIHRvIHRldGVybWluZSB0aGUgbGlzdCBvZiBzdG9wIHdvcmRzIGFuZCB0aGUgcnVsZXMgZm9yIHRva2VuaXplci4nLFxuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIF9jYXNlU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgY2FzZSBzZW5zaXRpdmUgc2VhcmNoLicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIF9kaWFjcml0aWNTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBkaWFjcml0aWMgc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBURVhUX09QRVJBVE9SID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVGV4dE9wZXJhdG9yJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBUZXh0T3BlcmF0b3IgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSAkdGV4dCBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIF9zZWFyY2g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc2VhcmNoIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU0VBUkNIX09QRVJBVE9SKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPWF9PUEVSQVRPUiA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0JveE9wZXJhdG9yJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb3hPcGVyYXRvciBpbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSAkYm94IG9wZXJhdGlvbiBvbiBhIHdpdGhpbiBnZW8gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgYm90dG9tTGVmdDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3R0b20gbGVmdCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UKSxcbiAgICB9LFxuICAgIHVwcGVyUmlnaHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBwZXIgcmlnaHQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBXSVRISU5fT1BFUkFUT1IgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdXaXRoaW5PcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgV2l0aGluT3BlcmF0b3IgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSAkd2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgX2JveDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3ggdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQk9YX09QRVJBVE9SKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IENFTlRFUl9TUEhFUkVfT1BFUkFUT1IgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdDZW50ZXJTcGhlcmVPcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQ2VudGVyU3BoZXJlT3BlcmF0b3IgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgJGNlbnRlclNwaGVyZSBvcGVyYXRpb24gb24gYSBnZW9XaXRoaW4gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgY2VudGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNlbnRlciBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UKSxcbiAgICB9LFxuICAgIGRpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHJhZGl1cyBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19XSVRISU5fT1BFUkFUT1IgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9XaXRoaW5PcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvV2l0aGluT3BlcmF0b3IgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSAkZ2VvV2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgX3BvbHlnb246IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9seWdvbiB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IFBPTFlHT04sXG4gICAgfSxcbiAgICBfY2VudGVyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNwaGVyZSB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IENFTlRFUl9TUEhFUkVfT1BFUkFUT1IsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fSU5URVJTRUNUUyA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb0ludGVyc2VjdHNPcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvSW50ZXJzZWN0c09wZXJhdG9yIGlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJGdlb0ludGVyc2VjdHMgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBfcG9pbnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9pbnQgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBfZXEgPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSAkZXEgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IF9uZSA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRuZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgX2x0ID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGx0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBfbHRlID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGx0ZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgX2d0ID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGd0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBfZ3RlID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGd0ZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgX2luID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IF9uaW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSAkbmluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IF9leGlzdHMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSAkZXhpc3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGV4aXN0cyAob3IgZG8gbm90IGV4aXN0KS4nLFxuICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbn07XG5cbmNvbnN0IF9zZWxlY3QgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSAkc2VsZWN0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9PUEVSQVRPUixcbn07XG5cbmNvbnN0IF9kb250U2VsZWN0ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGRvbnRTZWxlY3Qgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX09QRVJBVE9SLFxufTtcblxuY29uc3QgX3JlZ2V4ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJHJlZ2V4IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBtYXRjaGVzIGEgc3BlY2lmaWVkIHJlZ3VsYXIgZXhwcmVzc2lvbi4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3QgX29wdGlvbnMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSAkb3B0aW9ucyBvcGVyYXRvciB0byBzcGVjaWZ5IG9wdGlvbmFsIGZsYWdzIChzdWNoIGFzIFwiaVwiIGFuZCBcIm1cIikgdG8gYmUgYWRkZWQgdG8gYSAkcmVnZXggb3BlcmF0aW9uIGluIHRoZSBzYW1lIHNldCBvZiBjb25zdHJhaW50cy4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3QgU1RSSU5HX0NPTlNUUkFJTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdHJpbmdDb25zdHJhaW50JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTdHJpbmdDb25zdHJhaW50IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgU3RyaW5nLicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEdyYXBoUUxTdHJpbmcpLFxuICAgIF9uZTogX25lKEdyYXBoUUxTdHJpbmcpLFxuICAgIF9sdDogX2x0KEdyYXBoUUxTdHJpbmcpLFxuICAgIF9sdGU6IF9sdGUoR3JhcGhRTFN0cmluZyksXG4gICAgX2d0OiBfZ3QoR3JhcGhRTFN0cmluZyksXG4gICAgX2d0ZTogX2d0ZShHcmFwaFFMU3RyaW5nKSxcbiAgICBfaW46IF9pbihHcmFwaFFMU3RyaW5nKSxcbiAgICBfbmluOiBfbmluKEdyYXBoUUxTdHJpbmcpLFxuICAgIF9leGlzdHMsXG4gICAgX3NlbGVjdCxcbiAgICBfZG9udFNlbGVjdCxcbiAgICBfcmVnZXgsXG4gICAgX29wdGlvbnMsXG4gICAgX3RleHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJHRleHQgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGZ1bGwgdGV4dCBzZWFyY2ggY29uc3RyYWludC4nLFxuICAgICAgdHlwZTogVEVYVF9PUEVSQVRPUixcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE5VTUJFUl9DT05TVFJBSU5UID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnTnVtYmVyQ29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgTnVtYmVyQ29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIE51bWJlci4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXE6IF9lcShHcmFwaFFMRmxvYXQpLFxuICAgIF9uZTogX25lKEdyYXBoUUxGbG9hdCksXG4gICAgX2x0OiBfbHQoR3JhcGhRTEZsb2F0KSxcbiAgICBfbHRlOiBfbHRlKEdyYXBoUUxGbG9hdCksXG4gICAgX2d0OiBfZ3QoR3JhcGhRTEZsb2F0KSxcbiAgICBfZ3RlOiBfZ3RlKEdyYXBoUUxGbG9hdCksXG4gICAgX2luOiBfaW4oR3JhcGhRTEZsb2F0KSxcbiAgICBfbmluOiBfbmluKEdyYXBoUUxGbG9hdCksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPT0xFQU5fQ09OU1RSQUlOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0Jvb2xlYW5Db25zdHJhaW50JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb29sZWFuQ29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJvb2xlYW4uJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoR3JhcGhRTEJvb2xlYW4pLFxuICAgIF9uZTogX25lKEdyYXBoUUxCb29sZWFuKSxcbiAgICBfZXhpc3RzLFxuICAgIF9zZWxlY3QsXG4gICAgX2RvbnRTZWxlY3QsXG4gIH0sXG59KTtcblxuY29uc3QgQVJSQVlfQ09OU1RSQUlOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FycmF5Q29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQXJyYXlDb25zdHJhaW50IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQXJyYXkuJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoQU5ZKSxcbiAgICBfbmU6IF9uZShBTlkpLFxuICAgIF9sdDogX2x0KEFOWSksXG4gICAgX2x0ZTogX2x0ZShBTlkpLFxuICAgIF9ndDogX2d0KEFOWSksXG4gICAgX2d0ZTogX2d0ZShBTlkpLFxuICAgIF9pbjogX2luKEFOWSksXG4gICAgX25pbjogX25pbihBTlkpLFxuICAgIF9leGlzdHMsXG4gICAgX3NlbGVjdCxcbiAgICBfZG9udFNlbGVjdCxcbiAgICBfY29udGFpbmVkQnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJGNvbnRhaW5lZEJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGlzIGNvbnRhaW5lZCBieSBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgICBfYWxsOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRhbGwgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgY29udGFpbiBhbGwgZWxlbWVudHMgb2YgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX0NPTlNUUkFJTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdPYmplY3RDb25zdHJhaW50JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3RDb25zdHJhaW50IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgT2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKE9CSkVDVCksXG4gICAgX25lOiBfbmUoT0JKRUNUKSxcbiAgICBfaW46IF9pbihPQkpFQ1QpLFxuICAgIF9uaW46IF9uaW4oT0JKRUNUKSxcbiAgICBfZXhpc3RzLFxuICAgIF9zZWxlY3QsXG4gICAgX2RvbnRTZWxlY3QsXG4gIH0sXG59KTtcblxuY29uc3QgREFURV9DT05TVFJBSU5UID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRGF0ZUNvbnN0cmFpbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIERhdGVDb25zdHJhaW50IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRGF0ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXE6IF9lcShEQVRFKSxcbiAgICBfbmU6IF9uZShEQVRFKSxcbiAgICBfbHQ6IF9sdChEQVRFKSxcbiAgICBfbHRlOiBfbHRlKERBVEUpLFxuICAgIF9ndDogX2d0KERBVEUpLFxuICAgIF9ndGU6IF9ndGUoREFURSksXG4gICAgX2luOiBfaW4oREFURSksXG4gICAgX25pbjogX25pbihEQVRFKSxcbiAgICBfZXhpc3RzLFxuICAgIF9zZWxlY3QsXG4gICAgX2RvbnRTZWxlY3QsXG4gIH0sXG59KTtcblxuY29uc3QgQllURVNfQ09OU1RSQUlOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0J5dGVzQ29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXNDb25zdHJhaW50IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQnl0ZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoQllURVMpLFxuICAgIF9uZTogX25lKEJZVEVTKSxcbiAgICBfbHQ6IF9sdChCWVRFUyksXG4gICAgX2x0ZTogX2x0ZShCWVRFUyksXG4gICAgX2d0OiBfZ3QoQllURVMpLFxuICAgIF9ndGU6IF9ndGUoQllURVMpLFxuICAgIF9pbjogX2luKEJZVEVTKSxcbiAgICBfbmluOiBfbmluKEJZVEVTKSxcbiAgICBfZXhpc3RzLFxuICAgIF9zZWxlY3QsXG4gICAgX2RvbnRTZWxlY3QsXG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9DT05TVFJBSU5UID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUNvbnN0cmFpbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZJTEVfQ09OU1RSQUlOVCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEZpbGUuJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoRklMRSksXG4gICAgX25lOiBfbmUoRklMRSksXG4gICAgX2x0OiBfbHQoRklMRSksXG4gICAgX2x0ZTogX2x0ZShGSUxFKSxcbiAgICBfZ3Q6IF9ndChGSUxFKSxcbiAgICBfZ3RlOiBfZ3RlKEZJTEUpLFxuICAgIF9pbjogX2luKEZJTEUpLFxuICAgIF9uaW46IF9uaW4oRklMRSksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICAgIF9yZWdleCxcbiAgICBfb3B0aW9ucyxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfQ09OU1RSQUlOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50Q29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRDb25zdHJhaW50IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgR2VvUG9pbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgX2V4aXN0cyxcbiAgICBfbmVhclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBuZWFyIHRvIGFub3RoZXIgZ2VvIHBvaW50LicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlQsXG4gICAgfSxcbiAgICBfbWF4RGlzdGFuY2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJG1heERpc3RhbmNlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgX21heERpc3RhbmNlSW5SYWRpYW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRtYXhEaXN0YW5jZUluUmFkaWFucyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIF9tYXhEaXN0YW5jZUluTWlsZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJG1heERpc3RhbmNlSW5NaWxlcyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gbWlsZXMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBfbWF4RGlzdGFuY2VJbktpbG9tZXRlcnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBraWxvbWV0ZXJzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgX3dpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkd2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBib3guJyxcbiAgICAgIHR5cGU6IFdJVEhJTl9PUEVSQVRPUixcbiAgICB9LFxuICAgIF9nZW9XaXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJGdlb1dpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgcG9seWdvbiBvciBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IEdFT19XSVRISU5fT1BFUkFUT1IsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQT0xZR09OX0NPTlNUUkFJTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2x5Z29uQ29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUG9seWdvbkNvbnN0cmFpbnQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBQb2x5Z29uLicsXG4gIGZpZWxkczoge1xuICAgIF9leGlzdHMsXG4gICAgX2dlb0ludGVyc2VjdHM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJGdlb0ludGVyc2VjdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBwb2x5Z29uIGZpZWxkIGludGVyc2VjdCBhIHNwZWNpZmllZCBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX0lOVEVSU0VDVFMsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSU5EX1JFU1VMVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaW5kUmVzdWx0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGaW5kUmVzdWx0IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gdGhlIGZpbmQgcXVlcmllcyB0byByZXR1cm4gdGhlIGRhdGEgb2YgdGhlIG1hdGNoZWQgb2JqZWN0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZXN1bHRzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdHMgcmV0dXJuZWQgYnkgdGhlIHF1ZXJ5JyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKE9CSkVDVCkpKSxcbiAgICB9LFxuICAgIGNvdW50OiBDT1VOVF9BVFQsXG4gIH0sXG59KTtcblxuY29uc3QgU0lHTl9VUF9SRVNVTFQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2lnblVwUmVzdWx0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTaWduVXBSZXN1bHQgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgdXNlcnMgc2lnbiB1cCBtdXRhdGlvbiB0byByZXR1cm4gdGhlIGRhdGEgb2YgdGhlIHJlY2VudCBjcmVhdGVkIHVzZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgLi4uQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gICAgc2Vzc2lvblRva2VuOiBTRVNTSU9OX1RPS0VOX0FUVCxcbiAgfSxcbn0pO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEdyYXBoUUxVcGxvYWQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQU5ZKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKE9CSkVDVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChEQVRFKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEJZVEVTKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEZJTEUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goRklMRV9JTkZPKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEdFT19QT0lOVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChHRU9fUE9JTlRfSU5GTyk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChSRUxBVElPTl9PUCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChDUkVBVEVfUkVTVUxUKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFVQREFURV9SRVNVTFQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQ0xBU1MpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goUkVBRF9QUkVGRVJFTkNFKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFNVQlFVRVJZKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFNFTEVDVF9PUEVSQVRPUik7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChTRUFSQ0hfT1BFUkFUT1IpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goVEVYVF9PUEVSQVRPUik7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChCT1hfT1BFUkFUT1IpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goV0lUSElOX09QRVJBVE9SKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKENFTlRFUl9TUEhFUkVfT1BFUkFUT1IpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goR0VPX1dJVEhJTl9PUEVSQVRPUik7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChHRU9fSU5URVJTRUNUUyk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChTVFJJTkdfQ09OU1RSQUlOVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChOVU1CRVJfQ09OU1RSQUlOVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChCT09MRUFOX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQVJSQVlfQ09OU1RSQUlOVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChPQkpFQ1RfQ09OU1RSQUlOVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChEQVRFX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQllURVNfQ09OU1RSQUlOVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChGSUxFX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goR0VPX1BPSU5UX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goUE9MWUdPTl9DT05TVFJBSU5UKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEZJTkRfUkVTVUxUKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFNJR05fVVBfUkVTVUxUKTtcbn07XG5cbmV4cG9ydCB7XG4gIFR5cGVWYWxpZGF0aW9uRXJyb3IsXG4gIHBhcnNlU3RyaW5nVmFsdWUsXG4gIHBhcnNlSW50VmFsdWUsXG4gIHBhcnNlRmxvYXRWYWx1ZSxcbiAgcGFyc2VCb29sZWFuVmFsdWUsXG4gIHBhcnNlVmFsdWUsXG4gIHBhcnNlTGlzdFZhbHVlcyxcbiAgcGFyc2VPYmplY3RGaWVsZHMsXG4gIEFOWSxcbiAgT0JKRUNULFxuICBwYXJzZURhdGVJc29WYWx1ZSxcbiAgc2VyaWFsaXplRGF0ZUlzbyxcbiAgREFURSxcbiAgQllURVMsXG4gIHBhcnNlRmlsZVZhbHVlLFxuICBGSUxFLFxuICBGSUxFX0lORk8sXG4gIEdFT19QT0lOVF9GSUVMRFMsXG4gIEdFT19QT0lOVCxcbiAgR0VPX1BPSU5UX0lORk8sXG4gIFBPTFlHT04sXG4gIFBPTFlHT05fSU5GTyxcbiAgUkVMQVRJT05fT1AsXG4gIENMQVNTX05BTUVfQVRULFxuICBGSUVMRFNfQVRULFxuICBPQkpFQ1RfSURfQVRULFxuICBVUERBVEVEX0FUX0FUVCxcbiAgQ1JFQVRFRF9BVF9BVFQsXG4gIEFDTF9BVFQsXG4gIElOUFVUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIENSRUFURV9SRVNVTFQsXG4gIFVQREFURV9SRVNVTFRfRklFTERTLFxuICBVUERBVEVfUkVTVUxULFxuICBDTEFTU19GSUVMRFMsXG4gIENMQVNTLFxuICBTRVNTSU9OX1RPS0VOX0FUVCxcbiAgS0VZU19BVFQsXG4gIElOQ0xVREVfQVRULFxuICBSRUFEX1BSRUZFUkVOQ0UsXG4gIFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gIElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgV0hFUkVfQVRULFxuICBTS0lQX0FUVCxcbiAgTElNSVRfQVRULFxuICBDT1VOVF9BVFQsXG4gIFNVQlFVRVJZLFxuICBTRUxFQ1RfT1BFUkFUT1IsXG4gIFNFQVJDSF9PUEVSQVRPUixcbiAgVEVYVF9PUEVSQVRPUixcbiAgQk9YX09QRVJBVE9SLFxuICBXSVRISU5fT1BFUkFUT1IsXG4gIENFTlRFUl9TUEhFUkVfT1BFUkFUT1IsXG4gIEdFT19XSVRISU5fT1BFUkFUT1IsXG4gIEdFT19JTlRFUlNFQ1RTLFxuICBfZXEsXG4gIF9uZSxcbiAgX2x0LFxuICBfbHRlLFxuICBfZ3QsXG4gIF9ndGUsXG4gIF9pbixcbiAgX25pbixcbiAgX2V4aXN0cyxcbiAgX3NlbGVjdCxcbiAgX2RvbnRTZWxlY3QsXG4gIF9yZWdleCxcbiAgX29wdGlvbnMsXG4gIFNUUklOR19DT05TVFJBSU5ULFxuICBOVU1CRVJfQ09OU1RSQUlOVCxcbiAgQk9PTEVBTl9DT05TVFJBSU5ULFxuICBBUlJBWV9DT05TVFJBSU5ULFxuICBPQkpFQ1RfQ09OU1RSQUlOVCxcbiAgREFURV9DT05TVFJBSU5ULFxuICBCWVRFU19DT05TVFJBSU5ULFxuICBGSUxFX0NPTlNUUkFJTlQsXG4gIEdFT19QT0lOVF9DT05TVFJBSU5ULFxuICBQT0xZR09OX0NPTlNUUkFJTlQsXG4gIEZJTkRfUkVTVUxULFxuICBTSUdOX1VQX1JFU1VMVCxcbiAgbG9hZCxcbn07XG4iXX0=