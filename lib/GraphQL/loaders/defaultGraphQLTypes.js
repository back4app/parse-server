"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadArrayResult = exports.load = exports.RELATION_INPUT = exports.POINTER_INPUT = exports.ELEMENT = exports.ARRAY_RESULT = exports.SIGN_UP_RESULT = exports.FIND_RESULT = exports.POLYGON_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.FILE_WHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.DATE_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = exports.KEY_VALUE_INPUT = exports.ARRAY_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = exports.STRING_WHERE_INPUT = exports._options = exports._regex = exports._dontSelect = exports._select = exports._exists = exports._nin = exports._in = exports._gte = exports._gt = exports._lte = exports._lt = exports._ne = exports._eq = exports.GEO_INTERSECTS_INPUT = exports.GEO_WITHIN_INPUT = exports.CENTER_SPHERE_INPUT = exports.WITHIN_INPUT = exports.BOX_INPUT = exports.TEXT_INPUT = exports.SEARCH_INPUT = exports.SELECT_INPUT = exports.SUBQUERY_INPUT = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.INCLUDE_ATT = exports.KEYS_ATT = exports.SESSION_TOKEN_ATT = exports.CLASS = exports.CLASS_FIELDS = exports.UPDATE_RESULT = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.ACL_ATT = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.FIELDS_ATT = exports.CLASS_NAME_ATT = exports.POLYGON = exports.POLYGON_INPUT = exports.GEO_POINT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.FILE_INFO = exports.FILE = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = void 0;

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
const GEO_POINT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointInput',
  description: 'The GeoPointInput type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT_INPUT = GEO_POINT_INPUT;
const GEO_POINT = new _graphql.GraphQLObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT = GEO_POINT;
const POLYGON_INPUT = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT_INPUT));
exports.POLYGON_INPUT = POLYGON_INPUT;
const POLYGON = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT));
exports.POLYGON = POLYGON;
const RELATION_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'RelationInput',
  description: 'Object involved into a relation',
  fields: {
    objectId: {
      description: 'Id of the object involved.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    }
  }
});
exports.RELATION_INPUT = RELATION_INPUT;
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
const POINTER_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PointerInput',
  description: 'Allow to link an object to another object',
  fields: {
    objectId: {
      description: 'Id of the object involved.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    }
  }
});
exports.POINTER_INPUT = POINTER_INPUT;
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
const SUBQUERY_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SubqueryInput',
  description: 'The SubqueryInput type is used to specific a different query to a different class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new _graphql.GraphQLNonNull(WHERE_ATT.type)
    })
  }
});
exports.SUBQUERY_INPUT = SUBQUERY_INPUT;
const SELECT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SelectInput',
  description: 'The SelectInput type is used to specify a $select operation on a constraint.',
  fields: {
    query: {
      description: 'This is the subquery to be executed.',
      type: new _graphql.GraphQLNonNull(SUBQUERY_INPUT)
    },
    key: {
      description: 'This is the key in the result of the subquery that must match (not match) the field.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
exports.SELECT_INPUT = SELECT_INPUT;
const SEARCH_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SearchInput',
  description: 'The SearchInput type is used to specifiy a $search operation on a full text search.',
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
exports.SEARCH_INPUT = SEARCH_INPUT;
const TEXT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a $text operation on a constraint.',
  fields: {
    _search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_INPUT)
    }
  }
});
exports.TEXT_INPUT = TEXT_INPUT;
const BOX_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BoxInput',
  description: 'The BoxInput type is used to specifiy a $box operation on a within geo query.',
  fields: {
    bottomLeft: {
      description: 'This is the bottom left coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    upperRight: {
      description: 'This is the upper right coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    }
  }
});
exports.BOX_INPUT = BOX_INPUT;
const WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'WithinInput',
  description: 'The WithinInput type is used to specify a $within operation on a constraint.',
  fields: {
    _box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_INPUT)
    }
  }
});
exports.WITHIN_INPUT = WITHIN_INPUT;
const CENTER_SPHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'CenterSphereInput',
  description: 'The CenterSphereInput type is used to specifiy a $centerSphere operation on a geoWithin query.',
  fields: {
    center: {
      description: 'This is the center of the sphere.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    distance: {
      description: 'This is the radius of the sphere.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
    }
  }
});
exports.CENTER_SPHERE_INPUT = CENTER_SPHERE_INPUT;
const GEO_WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoWithinInput',
  description: 'The GeoWithinInput type is used to specify a $geoWithin operation on a constraint.',
  fields: {
    _polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON_INPUT
    },
    _centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_INPUT
    }
  }
});
exports.GEO_WITHIN_INPUT = GEO_WITHIN_INPUT;
const GEO_INTERSECTS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description: 'The GeoIntersectsInput type is used to specify a $geoIntersects operation on a constraint.',
  fields: {
    _point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT
    }
  }
});
exports.GEO_INTERSECTS_INPUT = GEO_INTERSECTS_INPUT;

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
  type: SELECT_INPUT
};
exports._select = _select;
const _dontSelect = {
  description: 'This is the $dontSelect operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT
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
const STRING_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'StringWhereInput',
  description: 'The StringWhereInput input type is used in operations that involve filtering objects by a field of type String.',
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
      type: TEXT_INPUT
    }
  }
});
exports.STRING_WHERE_INPUT = STRING_WHERE_INPUT;
const NUMBER_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'NumberWhereInput',
  description: 'The NumberWhereInput input type is used in operations that involve filtering objects by a field of type Number.',
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
exports.NUMBER_WHERE_INPUT = NUMBER_WHERE_INPUT;
const BOOLEAN_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BooleanWhereInput',
  description: 'The BooleanWhereInput input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    _eq: _eq(_graphql.GraphQLBoolean),
    _ne: _ne(_graphql.GraphQLBoolean),
    _exists,
    _select,
    _dontSelect
  }
});
exports.BOOLEAN_WHERE_INPUT = BOOLEAN_WHERE_INPUT;
const ARRAY_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ArrayWhereInput',
  description: 'The ArrayWhereInput input type is used in operations that involve filtering objects by a field of type Array.',
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
exports.ARRAY_WHERE_INPUT = ARRAY_WHERE_INPUT;
const KEY_VALUE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'KeyValueInput',
  description: 'An entry from an object, i.e., a pair of key and value.',
  fields: {
    _key: {
      description: 'The key used to retrieve the value of this entry.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    _value: {
      description: 'The value of the entry. Could be any type of scalar data.',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
});
exports.KEY_VALUE_INPUT = KEY_VALUE_INPUT;
const OBJECT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ObjectWhereInput',
  description: 'The ObjectWhereInput input type is used in operations that involve filtering result by a field of type Object.',
  fields: {
    _eq: _eq(KEY_VALUE_INPUT),
    _ne: _ne(KEY_VALUE_INPUT),
    _in: _in(KEY_VALUE_INPUT),
    _nin: _nin(KEY_VALUE_INPUT),
    _lt: _lt(KEY_VALUE_INPUT),
    _lte: _lte(KEY_VALUE_INPUT),
    _gt: _gt(KEY_VALUE_INPUT),
    _gte: _gte(KEY_VALUE_INPUT),
    _exists,
    _select,
    _dontSelect
  }
});
exports.OBJECT_WHERE_INPUT = OBJECT_WHERE_INPUT;
const DATE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'DateWhereInput',
  description: 'The DateWhereInput input type is used in operations that involve filtering objects by a field of type Date.',
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
exports.DATE_WHERE_INPUT = DATE_WHERE_INPUT;
const BYTES_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BytesWhereInput',
  description: 'The BytesWhereInput input type is used in operations that involve filtering objects by a field of type Bytes.',
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
exports.BYTES_WHERE_INPUT = BYTES_WHERE_INPUT;
const FILE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileWhereInput',
  description: 'The FileWhereInput input type is used in operations that involve filtering objects by a field of type File.',
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
exports.FILE_WHERE_INPUT = FILE_WHERE_INPUT;
const GEO_POINT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointWhereInput',
  description: 'The GeoPointWhereInput input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    _exists,
    _nearSphere: {
      description: 'This is the $nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT_INPUT
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
      type: WITHIN_INPUT
    },
    _geoWithin: {
      description: 'This is the $geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_INPUT
    }
  }
});
exports.GEO_POINT_WHERE_INPUT = GEO_POINT_WHERE_INPUT;
const POLYGON_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PolygonWhereInput',
  description: 'The PolygonWhereInput input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    _exists,
    _geoIntersects: {
      description: 'This is the $geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
      type: GEO_INTERSECTS_INPUT
    }
  }
});
exports.POLYGON_WHERE_INPUT = POLYGON_WHERE_INPUT;
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
const ELEMENT = new _graphql.GraphQLObjectType({
  name: 'Element',
  description: 'The SignUpResult object type is used in the users sign up mutation to return the data of the recent created user.',
  fields: {
    value: {
      description: 'Return the value of the element in the array',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
}); // Default static union type, we update types and resolveType function later

exports.ELEMENT = ELEMENT;
let ARRAY_RESULT;
exports.ARRAY_RESULT = ARRAY_RESULT;

const loadArrayResult = (parseGraphQLSchema, parseClasses) => {
  const classTypes = parseClasses.filter(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false).map(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType);
  exports.ARRAY_RESULT = ARRAY_RESULT = new _graphql.GraphQLUnionType({
    name: 'ArrayResult',
    description: 'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className].classGraphQLOutputType;
        } else {
          return ELEMENT;
        }
      } else {
        return ELEMENT;
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};

exports.loadArrayResult = loadArrayResult;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(_graphqlUpload.GraphQLUpload, true);
  parseGraphQLSchema.addGraphQLType(ANY, true);
  parseGraphQLSchema.addGraphQLType(OBJECT, true);
  parseGraphQLSchema.addGraphQLType(DATE, true);
  parseGraphQLSchema.addGraphQLType(BYTES, true);
  parseGraphQLSchema.addGraphQLType(FILE, true);
  parseGraphQLSchema.addGraphQLType(FILE_INFO, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT, true);
  parseGraphQLSchema.addGraphQLType(CREATE_RESULT, true);
  parseGraphQLSchema.addGraphQLType(UPDATE_RESULT, true);
  parseGraphQLSchema.addGraphQLType(CLASS, true);
  parseGraphQLSchema.addGraphQLType(READ_PREFERENCE, true);
  parseGraphQLSchema.addGraphQLType(SUBQUERY_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SELECT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SEARCH_INPUT, true);
  parseGraphQLSchema.addGraphQLType(TEXT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOX_INPUT, true);
  parseGraphQLSchema.addGraphQLType(WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(CENTER_SPHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_INTERSECTS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(STRING_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(NUMBER_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOOLEAN_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ARRAY_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(KEY_VALUE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(OBJECT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(DATE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BYTES_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(FILE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(POLYGON_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(FIND_RESULT, true);
  parseGraphQLSchema.addGraphQLType(SIGN_UP_RESULT, true);
  parseGraphQLSchema.addGraphQLType(ELEMENT, true);
  parseGraphQLSchema.addGraphQLType(RELATION_INPUT, true);
  parseGraphQLSchema.addGraphQLType(POINTER_INPUT, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9VVENTdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UX0lOUFVUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIkdFT19QT0lOVCIsIlBPTFlHT05fSU5QVVQiLCJHcmFwaFFMTGlzdCIsIlBPTFlHT04iLCJSRUxBVElPTl9JTlBVVCIsIm9iamVjdElkIiwiR3JhcGhRTElEIiwiQ0xBU1NfTkFNRV9BVFQiLCJGSUVMRFNfQVRUIiwiT0JKRUNUX0lEX0FUVCIsIkNSRUFURURfQVRfQVRUIiwiVVBEQVRFRF9BVF9BVFQiLCJBQ0xfQVRUIiwiSU5QVVRfRklFTERTIiwiQUNMIiwiQ1JFQVRFX1JFU1VMVF9GSUVMRFMiLCJjcmVhdGVkQXQiLCJDUkVBVEVfUkVTVUxUIiwiVVBEQVRFX1JFU1VMVF9GSUVMRFMiLCJ1cGRhdGVkQXQiLCJVUERBVEVfUkVTVUxUIiwiQ0xBU1NfRklFTERTIiwiQ0xBU1MiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiS0VZU19BVFQiLCJJTkNMVURFX0FUVCIsIlBPSU5URVJfSU5QVVQiLCJSRUFEX1BSRUZFUkVOQ0UiLCJHcmFwaFFMRW51bVR5cGUiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsIlJFQURfUFJFRkVSRU5DRV9BVFQiLCJJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiV0hFUkVfQVRUIiwiU0tJUF9BVFQiLCJHcmFwaFFMSW50IiwiTElNSVRfQVRUIiwiQ09VTlRfQVRUIiwiU1VCUVVFUllfSU5QVVQiLCJjbGFzc05hbWUiLCJ3aGVyZSIsIk9iamVjdCIsImFzc2lnbiIsIlNFTEVDVF9JTlBVVCIsInF1ZXJ5Iiwia2V5IiwiU0VBUkNIX0lOUFVUIiwiX3Rlcm0iLCJfbGFuZ3VhZ2UiLCJfY2FzZVNlbnNpdGl2ZSIsIkdyYXBoUUxCb29sZWFuIiwiX2RpYWNyaXRpY1NlbnNpdGl2ZSIsIlRFWFRfSU5QVVQiLCJfc2VhcmNoIiwiQk9YX0lOUFVUIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJXSVRISU5fSU5QVVQiLCJfYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsIl9wb2x5Z29uIiwiX2NlbnRlclNwaGVyZSIsIkdFT19JTlRFUlNFQ1RTX0lOUFVUIiwiX3BvaW50IiwiX2VxIiwiX25lIiwiX2x0IiwiX2x0ZSIsIl9ndCIsIl9ndGUiLCJfaW4iLCJfbmluIiwiX2V4aXN0cyIsIl9zZWxlY3QiLCJfZG9udFNlbGVjdCIsIl9yZWdleCIsIl9vcHRpb25zIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwiX3RleHQiLCJOVU1CRVJfV0hFUkVfSU5QVVQiLCJCT09MRUFOX1dIRVJFX0lOUFVUIiwiQVJSQVlfV0hFUkVfSU5QVVQiLCJfY29udGFpbmVkQnkiLCJfYWxsIiwiS0VZX1ZBTFVFX0lOUFVUIiwiX2tleSIsIl92YWx1ZSIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJfbmVhclNwaGVyZSIsIl9tYXhEaXN0YW5jZSIsIl9tYXhEaXN0YW5jZUluUmFkaWFucyIsIl9tYXhEaXN0YW5jZUluTWlsZXMiLCJfbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMiLCJfd2l0aGluIiwiX2dlb1dpdGhpbiIsIlBPTFlHT05fV0hFUkVfSU5QVVQiLCJfZ2VvSW50ZXJzZWN0cyIsIkZJTkRfUkVTVUxUIiwicmVzdWx0cyIsImNvdW50IiwiU0lHTl9VUF9SRVNVTFQiLCJzZXNzaW9uVG9rZW4iLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzIiwiY2xhc3NUeXBlcyIsImZpbHRlciIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTFVuaW9uVHlwZSIsInR5cGVzIiwicmVzb2x2ZVR5cGUiLCJncmFwaFFM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QkFBa0IsQ0FBQ2EsY0FBbkIsQ0FBa0MxQyxtQkFBbEMsRUFBdUQsSUFBdkQ7QUFDQTZCLEVBQUFBLGtCQUFrQixDQUFDYSxjQUFuQixDQUFrQ3pDLGlCQUFsQyxFQUFxRCxJQUFyRDtBQUNBNEIsRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDdEMsZUFBbEMsRUFBbUQsSUFBbkQ7QUFDQXlCLEVBQUFBLGtCQUFrQixDQUFDYSxjQUFuQixDQUFrQ25DLGtCQUFsQyxFQUFzRCxJQUF0RDtBQUNBc0IsRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDbEMsZ0JBQWxDLEVBQW9ELElBQXBEO0FBQ0FxQixFQUFBQSxrQkFBa0IsQ0FBQ2EsY0FBbkIsQ0FBa0NqQyxpQkFBbEMsRUFBcUQsSUFBckQ7QUFDQW9CLEVBQUFBLGtCQUFrQixDQUFDYSxjQUFuQixDQUFrQ2hDLGdCQUFsQyxFQUFvRCxJQUFwRDtBQUNBbUIsRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDL0IscUJBQWxDLEVBQXlELElBQXpEO0FBQ0FrQixFQUFBQSxrQkFBa0IsQ0FBQ2EsY0FBbkIsQ0FBa0N2QixtQkFBbEMsRUFBdUQsSUFBdkQ7QUFDQVUsRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDckIsV0FBbEMsRUFBK0MsSUFBL0M7QUFDQVEsRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDbEIsY0FBbEMsRUFBa0QsSUFBbEQ7QUFDQUssRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDaEIsT0FBbEMsRUFBMkMsSUFBM0M7QUFDQUcsRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDOUgsY0FBbEMsRUFBa0QsSUFBbEQ7QUFDQWlILEVBQUFBLGtCQUFrQixDQUFDYSxjQUFuQixDQUFrQ3ZHLGFBQWxDLEVBQWlELElBQWpEO0FBQ0QsQ0F2Q0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTFNjYWxhclR5cGUsXG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxJbnRlcmZhY2VUeXBlLFxuICBHcmFwaFFMRW51bVR5cGUsXG4gIEdyYXBoUUxJbnQsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMVW5pb25UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdncmFwaHFsLXVwbG9hZCc7XG5cbmNsYXNzIFR5cGVWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHZhbHVlLCB0eXBlKSB7XG4gICAgc3VwZXIoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbGlkICR7dHlwZX1gKTtcbiAgfVxufVxuXG5jb25zdCBwYXJzZVN0cmluZ1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnU3RyaW5nJyk7XG59O1xuXG5jb25zdCBwYXJzZUludFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGZsb2F0KSkge1xuICAgICAgcmV0dXJuIGZsb2F0O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmxvYXQnKTtcbn07XG5cbmNvbnN0IHBhcnNlQm9vbGVhblZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Jvb2xlYW4nKTtcbn07XG5cbmNvbnN0IHBhcnNlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9IHZhbHVlcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICByZXR1cm4gdmFsdWVzLm1hcCh2YWx1ZSA9PiBwYXJzZVZhbHVlKHZhbHVlKSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZXMsICdMaXN0Jyk7XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IGZpZWxkcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6IHZhbHVlID0+IHZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHZhbHVlLFxuICBwYXJzZUxpdGVyYWw6IGFzdCA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIG9iamVjdHMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKGFzdC5maWVsZHMpO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnT2JqZWN0Jyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VEYXRlSXNvVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZGF0ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBzZXJpYWxpemVEYXRlSXNvID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvVVRDU3RyaW5nKCk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb0xpdGVyYWwgPSBhc3QgPT4ge1xuICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgcmV0dXJuIHBhcnNlRGF0ZUlzb1ZhbHVlKGFzdC52YWx1ZSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IERBVEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRGF0ZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBkYXRlcy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZSksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJlxuICAgICAgdmFsdWUuaXNvXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6IHZhbHVlLl9fdHlwZSxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZS5pc28pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmXG4gICAgICB2YWx1ZS5pc29cbiAgICApIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgaXNvID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdpc28nKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0RhdGUnICYmIGlzbykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChpc28udmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0J5dGVzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlcyBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBiYXNlIDY0IGJpbmFyeSBkYXRhLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLmJhc2U2NDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogYXN0LnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnYmFzZTY0Jyk7XG4gICAgICBpZiAoXG4gICAgICAgIF9fdHlwZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlLnZhbHVlID09PSAnQnl0ZXMnICYmXG4gICAgICAgIGJhc2U2NCAmJlxuICAgICAgICBiYXNlNjQudmFsdWUgJiZcbiAgICAgICAgdHlwZW9mIGJhc2U2NC52YWx1ZS52YWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGJhc2U2NDogYmFzZTY0LnZhbHVlLnZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnQnl0ZXMnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZUZpbGVWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiB2YWx1ZSxcbiAgICB9O1xuICB9IGVsc2UgaWYgKFxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG59O1xuXG5jb25zdCBGSUxFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0ZpbGUnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZmlsZXMuJyxcbiAgcGFyc2VWYWx1ZTogcGFyc2VGaWxlVmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKGFzdC52YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBuYW1lID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICduYW1lJyk7XG4gICAgICBjb25zdCB1cmwgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ3VybCcpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgbmFtZSAmJiBuYW1lLnZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZSh7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgbmFtZTogbmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB1cmw6IHVybCAmJiB1cmwudmFsdWUgPyB1cmwudmFsdWUudmFsdWUgOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRmlsZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5GTyA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5mbycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZUluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGZpbGVzLicsXG4gIGZpZWxkczoge1xuICAgIG5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmlsZSBuYW1lLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXJsIGluIHdoaWNoIHRoZSBmaWxlIGNhbiBiZSBkb3dubG9hZGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfRklFTERTID0ge1xuICBsYXRpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGF0aXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbiAgbG9uZ2l0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsb25naXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbn07XG5cbmNvbnN0IEdFT19QT0lOVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50SW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBmaWVsZHMgb2YgdHlwZSBnZW8gcG9pbnQuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGdlbyBwb2ludCBmaWVsZHMuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IFBPTFlHT05fSU5QVVQgPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCkpO1xuXG5jb25zdCBQT0xZR09OID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpKTtcblxuY29uc3QgUkVMQVRJT05fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSZWxhdGlvbklucHV0JyxcbiAgZGVzY3JpcHRpb246ICdPYmplY3QgaW52b2x2ZWQgaW50byBhIHJlbGF0aW9uJyxcbiAgZmllbGRzOiB7XG4gICAgb2JqZWN0SWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSWQgb2YgdGhlIG9iamVjdCBpbnZvbHZlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBDTEFTU19OQU1FX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjbGFzcyBuYW1lIG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgRklFTERTX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgb2JqZWN0LicsXG4gIHR5cGU6IE9CSkVDVCxcbn07XG5cbmNvbnN0IE9CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxufTtcblxuY29uc3QgQ1JFQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBjcmVhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IFVQREFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgbGFzIHVwZGF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgQUNMX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBhY2Nlc3MgY29udHJvbCBsaXN0IG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgSU5QVVRfRklFTERTID0ge1xuICBBQ0w6IEFDTF9BVFQsXG59O1xuXG5jb25zdCBDUkVBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgb2JqZWN0SWQ6IE9CSkVDVF9JRF9BVFQsXG4gIGNyZWF0ZWRBdDogQ1JFQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBDUkVBVEVfUkVTVUxUID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0NyZWF0ZVJlc3VsdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQ3JlYXRlUmVzdWx0IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gdGhlIGNyZWF0ZSBtdXRhdGlvbnMgdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSByZWNlbnQgY3JlYXRlZCBvYmplY3QuJyxcbiAgZmllbGRzOiBDUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBVUERBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgdXBkYXRlZEF0OiBVUERBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFVQREFURV9SRVNVTFQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVXBkYXRlUmVzdWx0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBVcGRhdGVSZXN1bHQgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgdXBkYXRlIG11dGF0aW9ucyB0byByZXR1cm4gdGhlIGRhdGEgb2YgdGhlIHJlY2VudCB1cGRhdGVkIG9iamVjdC4nLFxuICBmaWVsZHM6IFVQREFURV9SRVNVTFRfRklFTERTLFxufSk7XG5cbmNvbnN0IENMQVNTX0ZJRUxEUyA9IHtcbiAgLi4uQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLlVQREFURV9SRVNVTFRfRklFTERTLFxuICAuLi5JTlBVVF9GSUVMRFMsXG59O1xuXG5jb25zdCBDTEFTUyA9IG5ldyBHcmFwaFFMSW50ZXJmYWNlVHlwZSh7XG4gIG5hbWU6ICdDbGFzcycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQ2xhc3MgaW50ZXJmYWNlIHR5cGUgaXMgdXNlZCBhcyBhIGJhc2UgdHlwZSBmb3IgdGhlIGF1dG8gZ2VuZXJhdGVkIGNsYXNzIHR5cGVzLicsXG4gIGZpZWxkczogQ0xBU1NfRklFTERTLFxufSk7XG5cbmNvbnN0IFNFU1NJT05fVE9LRU5fQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSB1c2VyIHNlc3Npb24gdG9rZW4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBLRVlTX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUga2V5cyBvZiB0aGUgb2JqZWN0cyB0aGF0IHdpbGwgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IElOQ0xVREVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSBwb2ludGVycyBvZiB0aGUgb2JqZWN0cyB0aGF0IHdpbGwgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFBPSU5URVJfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2ludGVySW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIGxpbmsgYW4gb2JqZWN0IHRvIGFub3RoZXIgb2JqZWN0JyxcbiAgZmllbGRzOiB7XG4gICAgb2JqZWN0SWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSWQgb2YgdGhlIG9iamVjdCBpbnZvbHZlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0UgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgbmFtZTogJ1JlYWRQcmVmZXJlbmNlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkUHJlZmVyZW5jZSBlbnVtIHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNlbGVjdCBpbiB3aGljaCBkYXRhYmFzZSByZXBsaWNhIHRoZSBvcGVyYXRpb24gbXVzdCBydW4uJyxcbiAgdmFsdWVzOiB7XG4gICAgUFJJTUFSWTogeyB2YWx1ZTogJ1BSSU1BUlknIH0sXG4gICAgUFJJTUFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdQUklNQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBTRUNPTkRBUlk6IHsgdmFsdWU6ICdTRUNPTkRBUlknIH0sXG4gICAgU0VDT05EQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1NFQ09OREFSWV9QUkVGRVJSRUQnIH0sXG4gICAgTkVBUkVTVDogeyB2YWx1ZTogJ05FQVJFU1QnIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgbWFpbiBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgcXVlcmllcyB0byBiZSBleGVjdXRlZCB0byBpbmNsdWRlIGZpZWxkcy4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBzdWJxdWVyaWVzIHRoYXQgbWF5IGJlIHJlcXVpcmVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFdIRVJFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQnLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBTS0lQX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgc2tpcHBlZCB0byByZXR1cm4uJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IExJTUlUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsaW1pdCBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IENPVU5UX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIHRvdGFsIG1hdGNoZWQgb2JqZWNzIGNvdW50IHRoYXQgaXMgcmV0dXJuZWQgd2hlbiB0aGUgY291bnQgZmxhZyBpcyBzZXQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJbnQpLFxufTtcblxuY29uc3QgU1VCUVVFUllfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdWJxdWVyeUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTdWJxdWVyeUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpYyBhIGRpZmZlcmVudCBxdWVyeSB0byBhIGRpZmZlcmVudCBjbGFzcy4nLFxuICBmaWVsZHM6IHtcbiAgICBjbGFzc05hbWU6IENMQVNTX05BTUVfQVRULFxuICAgIHdoZXJlOiBPYmplY3QuYXNzaWduKHt9LCBXSEVSRV9BVFQsIHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChXSEVSRV9BVFQudHlwZSksXG4gICAgfSksXG4gIH0sXG59KTtcblxuY29uc3QgU0VMRUNUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VsZWN0SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNlbGVjdElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJHNlbGVjdCBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHF1ZXJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHN1YnF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU1VCUVVFUllfSU5QVVQpLFxuICAgIH0sXG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGtleSBpbiB0aGUgcmVzdWx0IG9mIHRoZSBzdWJxdWVyeSB0aGF0IG11c3QgbWF0Y2ggKG5vdCBtYXRjaCkgdGhlIGZpZWxkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUFSQ0hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWFyY2hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VhcmNoSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgJHNlYXJjaCBvcGVyYXRpb24gb24gYSBmdWxsIHRleHQgc2VhcmNoLicsXG4gIGZpZWxkczoge1xuICAgIF90ZXJtOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRlcm0gdG8gYmUgc2VhcmNoZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIF9sYW5ndWFnZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBsYW5ndWFnZSB0byB0ZXRlcm1pbmUgdGhlIGxpc3Qgb2Ygc3RvcCB3b3JkcyBhbmQgdGhlIHJ1bGVzIGZvciB0b2tlbml6ZXIuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBfY2FzZVNlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGNhc2Ugc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICBfZGlhY3JpdGljU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgZGlhY3JpdGljIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVEVYVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1RleHRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgVGV4dElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJHRleHQgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBfc2VhcmNoOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNlYXJjaCB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNFQVJDSF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT1hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb3hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm94SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgJGJveCBvcGVyYXRpb24gb24gYSB3aXRoaW4gZ2VvIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGJvdHRvbUxlZnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm90dG9tIGxlZnQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICB1cHBlclJpZ2h0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwcGVyIHJpZ2h0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFdpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJHdpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIF9ib3g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm94IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEJPWF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBDRU5URVJfU1BIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQ2VudGVyU3BoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENlbnRlclNwaGVyZUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhICRjZW50ZXJTcGhlcmUgb3BlcmF0aW9uIG9uIGEgZ2VvV2l0aGluIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGNlbnRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjZW50ZXIgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICBkaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1dpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJGdlb1dpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIF9wb2x5Z29uOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvbHlnb24gdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBQT0xZR09OX0lOUFVULFxuICAgIH0sXG4gICAgX2NlbnRlclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzcGhlcmUgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBDRU5URVJfU1BIRVJFX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX0lOVEVSU0VDVFNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9JbnRlcnNlY3RzSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb0ludGVyc2VjdHNJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhICRnZW9JbnRlcnNlY3RzIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgX3BvaW50OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvaW50IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5UX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgX2VxID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGVxIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBfbmUgPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSAkbmUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IF9sdCA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRsdCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgX2x0ZSA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRsdGUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IF9ndCA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRndCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgX2d0ZSA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRndGUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IF9pbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBfbmluID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJG5pbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBfZXhpc3RzID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGV4aXN0cyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBleGlzdHMgKG9yIGRvIG5vdCBleGlzdCkuJyxcbiAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG59O1xuXG5jb25zdCBfc2VsZWN0ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJHNlbGVjdCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBlcXVhbHMgdG8gYSBrZXkgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICB0eXBlOiBTRUxFQ1RfSU5QVVQsXG59O1xuXG5jb25zdCBfZG9udFNlbGVjdCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRkb250U2VsZWN0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9JTlBVVCxcbn07XG5cbmNvbnN0IF9yZWdleCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRyZWdleCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgbWF0Y2hlcyBhIHNwZWNpZmllZCByZWd1bGFyIGV4cHJlc3Npb24uJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IF9vcHRpb25zID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJG9wdGlvbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBvcHRpb25hbCBmbGFncyAoc3VjaCBhcyBcImlcIiBhbmQgXCJtXCIpIHRvIGJlIGFkZGVkIHRvIGEgJHJlZ2V4IG9wZXJhdGlvbiBpbiB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFNUUklOR19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N0cmluZ1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFN0cmluZ1doZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBTdHJpbmcuJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoR3JhcGhRTFN0cmluZyksXG4gICAgX25lOiBfbmUoR3JhcGhRTFN0cmluZyksXG4gICAgX2x0OiBfbHQoR3JhcGhRTFN0cmluZyksXG4gICAgX2x0ZTogX2x0ZShHcmFwaFFMU3RyaW5nKSxcbiAgICBfZ3Q6IF9ndChHcmFwaFFMU3RyaW5nKSxcbiAgICBfZ3RlOiBfZ3RlKEdyYXBoUUxTdHJpbmcpLFxuICAgIF9pbjogX2luKEdyYXBoUUxTdHJpbmcpLFxuICAgIF9uaW46IF9uaW4oR3JhcGhRTFN0cmluZyksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICAgIF9yZWdleCxcbiAgICBfb3B0aW9ucyxcbiAgICBfdGV4dDoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkdGV4dCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgZnVsbCB0ZXh0IHNlYXJjaCBjb25zdHJhaW50LicsXG4gICAgICB0eXBlOiBURVhUX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgTlVNQkVSX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnTnVtYmVyV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgTnVtYmVyV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIE51bWJlci4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXE6IF9lcShHcmFwaFFMRmxvYXQpLFxuICAgIF9uZTogX25lKEdyYXBoUUxGbG9hdCksXG4gICAgX2x0OiBfbHQoR3JhcGhRTEZsb2F0KSxcbiAgICBfbHRlOiBfbHRlKEdyYXBoUUxGbG9hdCksXG4gICAgX2d0OiBfZ3QoR3JhcGhRTEZsb2F0KSxcbiAgICBfZ3RlOiBfZ3RlKEdyYXBoUUxGbG9hdCksXG4gICAgX2luOiBfaW4oR3JhcGhRTEZsb2F0KSxcbiAgICBfbmluOiBfbmluKEdyYXBoUUxGbG9hdCksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPT0xFQU5fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb29sZWFuV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm9vbGVhbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCb29sZWFuLicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEdyYXBoUUxCb29sZWFuKSxcbiAgICBfbmU6IF9uZShHcmFwaFFMQm9vbGVhbiksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IEFSUkFZX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQXJyYXlXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBBcnJheVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBBcnJheS4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXE6IF9lcShBTlkpLFxuICAgIF9uZTogX25lKEFOWSksXG4gICAgX2x0OiBfbHQoQU5ZKSxcbiAgICBfbHRlOiBfbHRlKEFOWSksXG4gICAgX2d0OiBfZ3QoQU5ZKSxcbiAgICBfZ3RlOiBfZ3RlKEFOWSksXG4gICAgX2luOiBfaW4oQU5ZKSxcbiAgICBfbmluOiBfbmluKEFOWSksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICAgIF9jb250YWluZWRCeToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkY29udGFpbmVkQnkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgaXMgY29udGFpbmVkIGJ5IGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICAgIF9hbGw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJGFsbCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBjb250YWluIGFsbCBlbGVtZW50cyBvZiBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBLRVlfVkFMVUVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdLZXlWYWx1ZUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbiBlbnRyeSBmcm9tIGFuIG9iamVjdCwgaS5lLiwgYSBwYWlyIG9mIGtleSBhbmQgdmFsdWUuJyxcbiAgZmllbGRzOiB7XG4gICAgX2tleToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUga2V5IHVzZWQgdG8gcmV0cmlldmUgdGhlIHZhbHVlIG9mIHRoaXMgZW50cnkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIF92YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgdmFsdWUgb2YgdGhlIGVudHJ5LiBDb3VsZCBiZSBhbnkgdHlwZSBvZiBzY2FsYXIgZGF0YS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdPYmplY3RXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3RXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgcmVzdWx0IGJ5IGEgZmllbGQgb2YgdHlwZSBPYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBfbmU6IF9uZShLRVlfVkFMVUVfSU5QVVQpLFxuICAgIF9pbjogX2luKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgX25pbjogX25pbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIF9sdDogX2x0KEtFWV9WQUxVRV9JTlBVVCksXG4gICAgX2x0ZTogX2x0ZShLRVlfVkFMVUVfSU5QVVQpLFxuICAgIF9ndDogX2d0KEtFWV9WQUxVRV9JTlBVVCksXG4gICAgX2d0ZTogX2d0ZShLRVlfVkFMVUVfSU5QVVQpLFxuICAgIF9leGlzdHMsXG4gICAgX3NlbGVjdCxcbiAgICBfZG9udFNlbGVjdCxcbiAgfSxcbn0pO1xuXG5jb25zdCBEQVRFX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRGF0ZVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIERhdGVXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRGF0ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXE6IF9lcShEQVRFKSxcbiAgICBfbmU6IF9uZShEQVRFKSxcbiAgICBfbHQ6IF9sdChEQVRFKSxcbiAgICBfbHRlOiBfbHRlKERBVEUpLFxuICAgIF9ndDogX2d0KERBVEUpLFxuICAgIF9ndGU6IF9ndGUoREFURSksXG4gICAgX2luOiBfaW4oREFURSksXG4gICAgX25pbjogX25pbihEQVRFKSxcbiAgICBfZXhpc3RzLFxuICAgIF9zZWxlY3QsXG4gICAgX2RvbnRTZWxlY3QsXG4gIH0sXG59KTtcblxuY29uc3QgQllURVNfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCeXRlc1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJ5dGVzLicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEJZVEVTKSxcbiAgICBfbmU6IF9uZShCWVRFUyksXG4gICAgX2x0OiBfbHQoQllURVMpLFxuICAgIF9sdGU6IF9sdGUoQllURVMpLFxuICAgIF9ndDogX2d0KEJZVEVTKSxcbiAgICBfZ3RlOiBfZ3RlKEJZVEVTKSxcbiAgICBfaW46IF9pbihCWVRFUyksXG4gICAgX25pbjogX25pbihCWVRFUyksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBGaWxlLicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEZJTEUpLFxuICAgIF9uZTogX25lKEZJTEUpLFxuICAgIF9sdDogX2x0KEZJTEUpLFxuICAgIF9sdGU6IF9sdGUoRklMRSksXG4gICAgX2d0OiBfZ3QoRklMRSksXG4gICAgX2d0ZTogX2d0ZShGSUxFKSxcbiAgICBfaW46IF9pbihGSUxFKSxcbiAgICBfbmluOiBfbmluKEZJTEUpLFxuICAgIF9leGlzdHMsXG4gICAgX3NlbGVjdCxcbiAgICBfZG9udFNlbGVjdCxcbiAgICBfcmVnZXgsXG4gICAgX29wdGlvbnMsXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBHZW9Qb2ludC4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXhpc3RzLFxuICAgIF9uZWFyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIG5lYXIgdG8gYW5vdGhlciBnZW8gcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICAgIF9tYXhEaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkbWF4RGlzdGFuY2Ugb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBfbWF4RGlzdGFuY2VJblJhZGlhbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJG1heERpc3RhbmNlSW5SYWRpYW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgX21heERpc3RhbmNlSW5NaWxlczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkbWF4RGlzdGFuY2VJbk1pbGVzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBtaWxlcykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIF9tYXhEaXN0YW5jZUluS2lsb21ldGVyczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIGtpbG9tZXRlcnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBfd2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICR3aXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIGJveC4nLFxuICAgICAgdHlwZTogV0lUSElOX0lOUFVULFxuICAgIH0sXG4gICAgX2dlb1dpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkZ2VvV2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBwb2x5Z29uIG9yIHNwaGVyZS4nLFxuICAgICAgdHlwZTogR0VPX1dJVEhJTl9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBPTFlHT05fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2x5Z29uV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUG9seWdvbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBQb2x5Z29uLicsXG4gIGZpZWxkczoge1xuICAgIF9leGlzdHMsXG4gICAgX2dlb0ludGVyc2VjdHM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJGdlb0ludGVyc2VjdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBwb2x5Z29uIGZpZWxkIGludGVyc2VjdCBhIHNwZWNpZmllZCBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSU5EX1JFU1VMVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaW5kUmVzdWx0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGaW5kUmVzdWx0IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gdGhlIGZpbmQgcXVlcmllcyB0byByZXR1cm4gdGhlIGRhdGEgb2YgdGhlIG1hdGNoZWQgb2JqZWN0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZXN1bHRzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdHMgcmV0dXJuZWQgYnkgdGhlIHF1ZXJ5JyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKE9CSkVDVCkpKSxcbiAgICB9LFxuICAgIGNvdW50OiBDT1VOVF9BVFQsXG4gIH0sXG59KTtcblxuY29uc3QgU0lHTl9VUF9SRVNVTFQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2lnblVwUmVzdWx0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTaWduVXBSZXN1bHQgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgdXNlcnMgc2lnbiB1cCBtdXRhdGlvbiB0byByZXR1cm4gdGhlIGRhdGEgb2YgdGhlIHJlY2VudCBjcmVhdGVkIHVzZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgLi4uQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gICAgc2Vzc2lvblRva2VuOiBTRVNTSU9OX1RPS0VOX0FUVCxcbiAgfSxcbn0pO1xuXG5jb25zdCBFTEVNRU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0VsZW1lbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNpZ25VcFJlc3VsdCBvYmplY3QgdHlwZSBpcyB1c2VkIGluIHRoZSB1c2VycyBzaWduIHVwIG11dGF0aW9uIHRvIHJldHVybiB0aGUgZGF0YSBvZiB0aGUgcmVjZW50IGNyZWF0ZWQgdXNlci4nLFxuICBmaWVsZHM6IHtcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdSZXR1cm4gdGhlIHZhbHVlIG9mIHRoZSBlbGVtZW50IGluIHRoZSBhcnJheScsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQU5ZKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbi8vIERlZmF1bHQgc3RhdGljIHVuaW9uIHR5cGUsIHdlIHVwZGF0ZSB0eXBlcyBhbmQgcmVzb2x2ZVR5cGUgZnVuY3Rpb24gbGF0ZXJcbmxldCBBUlJBWV9SRVNVTFQ7XG5cbmNvbnN0IGxvYWRBcnJheVJlc3VsdCA9IChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3NlcykgPT4ge1xuICBjb25zdCBjbGFzc1R5cGVzID0gcGFyc2VDbGFzc2VzXG4gICAgLmZpbHRlcihwYXJzZUNsYXNzID0+XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXVxuICAgICAgICAuY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICAgICAgICA/IHRydWVcbiAgICAgICAgOiBmYWxzZVxuICAgIClcbiAgICAubWFwKFxuICAgICAgcGFyc2VDbGFzcyA9PlxuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXVxuICAgICAgICAgIC5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgKTtcbiAgQVJSQVlfUkVTVUxUID0gbmV3IEdyYXBoUUxVbmlvblR5cGUoe1xuICAgIG5hbWU6ICdBcnJheVJlc3VsdCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzJyxcbiAgICB0eXBlczogKCkgPT4gW0VMRU1FTlQsIC4uLmNsYXNzVHlwZXNdLFxuICAgIHJlc29sdmVUeXBlOiB2YWx1ZSA9PiB7XG4gICAgICBpZiAodmFsdWUuX190eXBlID09PSAnT2JqZWN0JyAmJiB2YWx1ZS5jbGFzc05hbWUgJiYgdmFsdWUub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXSkge1xuICAgICAgICAgIHJldHVybiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3ZhbHVlLmNsYXNzTmFtZV1cbiAgICAgICAgICAgIC5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBFTEVNRU5UO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gRUxFTUVOVDtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFSUkFZX1JFU1VMVCk7XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdyYXBoUUxVcGxvYWQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQU5ZLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9JTkZPLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fUE9JTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQ1JFQVRFX1JFU1VMVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShVUERBVEVfUkVTVUxULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENMQVNTLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfUFJFRkVSRU5DRSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVUJRVUVSWV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUxFQ1RfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU0VBUkNIX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFRFWFRfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQk9YX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFdJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShDRU5URVJfU1BIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19XSVRISU5fSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX0lOVEVSU0VDVFNfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU1RSSU5HX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE5VTUJFUl9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT09MRUFOX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFSUkFZX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEtFWV9WQUxVRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1RfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURV9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFU19XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQT0xZR09OX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTkRfUkVTVUxULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFNJR05fVVBfUkVTVUxULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEVMRU1FTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVMQVRJT05fSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUE9JTlRFUl9JTlBVVCwgdHJ1ZSk7XG59O1xuXG5leHBvcnQge1xuICBUeXBlVmFsaWRhdGlvbkVycm9yLFxuICBwYXJzZVN0cmluZ1ZhbHVlLFxuICBwYXJzZUludFZhbHVlLFxuICBwYXJzZUZsb2F0VmFsdWUsXG4gIHBhcnNlQm9vbGVhblZhbHVlLFxuICBwYXJzZVZhbHVlLFxuICBwYXJzZUxpc3RWYWx1ZXMsXG4gIHBhcnNlT2JqZWN0RmllbGRzLFxuICBBTlksXG4gIE9CSkVDVCxcbiAgcGFyc2VEYXRlSXNvVmFsdWUsXG4gIHNlcmlhbGl6ZURhdGVJc28sXG4gIERBVEUsXG4gIEJZVEVTLFxuICBwYXJzZUZpbGVWYWx1ZSxcbiAgRklMRSxcbiAgRklMRV9JTkZPLFxuICBHRU9fUE9JTlRfRklFTERTLFxuICBHRU9fUE9JTlRfSU5QVVQsXG4gIEdFT19QT0lOVCxcbiAgUE9MWUdPTl9JTlBVVCxcbiAgUE9MWUdPTixcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIEZJRUxEU19BVFQsXG4gIE9CSkVDVF9JRF9BVFQsXG4gIFVQREFURURfQVRfQVRULFxuICBDUkVBVEVEX0FUX0FUVCxcbiAgQUNMX0FUVCxcbiAgSU5QVVRfRklFTERTLFxuICBDUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVCxcbiAgVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFVQREFURV9SRVNVTFQsXG4gIENMQVNTX0ZJRUxEUyxcbiAgQ0xBU1MsXG4gIFNFU1NJT05fVE9LRU5fQVRULFxuICBLRVlTX0FUVCxcbiAgSU5DTFVERV9BVFQsXG4gIFJFQURfUFJFRkVSRU5DRSxcbiAgUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBXSEVSRV9BVFQsXG4gIFNLSVBfQVRULFxuICBMSU1JVF9BVFQsXG4gIENPVU5UX0FUVCxcbiAgU1VCUVVFUllfSU5QVVQsXG4gIFNFTEVDVF9JTlBVVCxcbiAgU0VBUkNIX0lOUFVULFxuICBURVhUX0lOUFVULFxuICBCT1hfSU5QVVQsXG4gIFdJVEhJTl9JTlBVVCxcbiAgQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgR0VPX1dJVEhJTl9JTlBVVCxcbiAgR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gIF9lcSxcbiAgX25lLFxuICBfbHQsXG4gIF9sdGUsXG4gIF9ndCxcbiAgX2d0ZSxcbiAgX2luLFxuICBfbmluLFxuICBfZXhpc3RzLFxuICBfc2VsZWN0LFxuICBfZG9udFNlbGVjdCxcbiAgX3JlZ2V4LFxuICBfb3B0aW9ucyxcbiAgU1RSSU5HX1dIRVJFX0lOUFVULFxuICBOVU1CRVJfV0hFUkVfSU5QVVQsXG4gIEJPT0xFQU5fV0hFUkVfSU5QVVQsXG4gIEFSUkFZX1dIRVJFX0lOUFVULFxuICBLRVlfVkFMVUVfSU5QVVQsXG4gIE9CSkVDVF9XSEVSRV9JTlBVVCxcbiAgREFURV9XSEVSRV9JTlBVVCxcbiAgQllURVNfV0hFUkVfSU5QVVQsXG4gIEZJTEVfV0hFUkVfSU5QVVQsXG4gIEdFT19QT0lOVF9XSEVSRV9JTlBVVCxcbiAgUE9MWUdPTl9XSEVSRV9JTlBVVCxcbiAgRklORF9SRVNVTFQsXG4gIFNJR05fVVBfUkVTVUxULFxuICBBUlJBWV9SRVNVTFQsXG4gIEVMRU1FTlQsXG4gIFBPSU5URVJfSU5QVVQsXG4gIFJFTEFUSU9OX0lOUFVULFxuICBsb2FkLFxuICBsb2FkQXJyYXlSZXN1bHQsXG59O1xuIl19