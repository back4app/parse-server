"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadArrayResult = exports.load = exports.ELEMENT = exports.ARRAY_RESULT = exports.FIND_RESULT = exports.POLYGON_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.FILE_WHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.DATE_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = exports.KEY_VALUE_INPUT = exports.ARRAY_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = exports.STRING_WHERE_INPUT = exports.options = exports.matchesRegex = exports.notInQueryKey = exports.inQueryKey = exports.exists = exports.notIn = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.lessThanOrEqualTo = exports.lessThan = exports.notEqualTo = exports.equalTo = exports.GEO_INTERSECTS_INPUT = exports.GEO_WITHIN_INPUT = exports.CENTER_SPHERE_INPUT = exports.WITHIN_INPUT = exports.BOX_INPUT = exports.TEXT_INPUT = exports.SEARCH_INPUT = exports.SELECT_INPUT = exports.SUBQUERY_INPUT = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.READ_OPTIONS_ATT = exports.READ_OPTIONS_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.SESSION_TOKEN_ATT = exports.PARSE_OBJECT = exports.PARSE_OBJECT_FIELDS = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.ACL_ATT = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.CLASS_NAME_ATT = exports.OBJECT_ID = exports.POLYGON = exports.POLYGON_INPUT = exports.GEO_POINT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.FILE_INFO = exports.FILE = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = void 0;

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
const OBJECT_ID = new _graphql.GraphQLNonNull(_graphql.GraphQLID);
exports.OBJECT_ID = OBJECT_ID;
const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.CLASS_NAME_ATT = CLASS_NAME_ATT;
const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID,
  resolve: ({
    objectId
  }) => objectId
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
  id: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
exports.CREATE_RESULT_FIELDS = CREATE_RESULT_FIELDS;
const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
exports.UPDATE_RESULT_FIELDS = UPDATE_RESULT_FIELDS;

const PARSE_OBJECT_FIELDS = _objectSpread({}, CREATE_RESULT_FIELDS, {}, UPDATE_RESULT_FIELDS, {}, INPUT_FIELDS);

exports.PARSE_OBJECT_FIELDS = PARSE_OBJECT_FIELDS;
const PARSE_OBJECT = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  description: 'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS
});
exports.PARSE_OBJECT = PARSE_OBJECT;
const SESSION_TOKEN_ATT = {
  description: 'The user session token',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.SESSION_TOKEN_ATT = SESSION_TOKEN_ATT;
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
const READ_OPTIONS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ReadOptionsInput',
  description: 'The ReadOptionsInputt type is used in queries in order to set the read preferences.',
  fields: {
    readPreference: READ_PREFERENCE_ATT,
    includeReadPreference: INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: SUBQUERY_READ_PREFERENCE_ATT
  }
});
exports.READ_OPTIONS_INPUT = READ_OPTIONS_INPUT;
const READ_OPTIONS_ATT = {
  description: 'The read options for the query to be executed.',
  type: READ_OPTIONS_INPUT
};
exports.READ_OPTIONS_ATT = READ_OPTIONS_ATT;
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
  description: 'The SubqueryInput type is used to specify a sub query to another class.',
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
  description: 'The SelectInput type is used to specify an inQueryKey or a notInQueryKey operation on a constraint.',
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
  description: 'The SearchInput type is used to specifiy a search operation on a full text search.',
  fields: {
    term: {
      description: 'This is the term to be searched.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    language: {
      description: 'This is the language to tetermine the list of stop words and the rules for tokenizer.',
      type: _graphql.GraphQLString
    },
    caseSensitive: {
      description: 'This is the flag to enable or disable case sensitive search.',
      type: _graphql.GraphQLBoolean
    },
    diacriticSensitive: {
      description: 'This is the flag to enable or disable diacritic sensitive search.',
      type: _graphql.GraphQLBoolean
    }
  }
});
exports.SEARCH_INPUT = SEARCH_INPUT;
const TEXT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a text operation on a constraint.',
  fields: {
    search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_INPUT)
    }
  }
});
exports.TEXT_INPUT = TEXT_INPUT;
const BOX_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BoxInput',
  description: 'The BoxInput type is used to specifiy a box operation on a within geo query.',
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
  description: 'The WithinInput type is used to specify a within operation on a constraint.',
  fields: {
    box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_INPUT)
    }
  }
});
exports.WITHIN_INPUT = WITHIN_INPUT;
const CENTER_SPHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'CenterSphereInput',
  description: 'The CenterSphereInput type is used to specifiy a centerSphere operation on a geoWithin query.',
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
  description: 'The GeoWithinInput type is used to specify a geoWithin operation on a constraint.',
  fields: {
    polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON_INPUT
    },
    centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_INPUT
    }
  }
});
exports.GEO_WITHIN_INPUT = GEO_WITHIN_INPUT;
const GEO_INTERSECTS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description: 'The GeoIntersectsInput type is used to specify a geoIntersects operation on a constraint.',
  fields: {
    point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT
    }
  }
});
exports.GEO_INTERSECTS_INPUT = GEO_INTERSECTS_INPUT;

const equalTo = type => ({
  description: 'This is the equalTo operator to specify a constraint to select the objects where the value of a field equals to a specified value.',
  type
});

exports.equalTo = equalTo;

const notEqualTo = type => ({
  description: 'This is the notEqualTo operator to specify a constraint to select the objects where the value of a field do not equal to a specified value.',
  type
});

exports.notEqualTo = notEqualTo;

const lessThan = type => ({
  description: 'This is the lessThan operator to specify a constraint to select the objects where the value of a field is less than a specified value.',
  type
});

exports.lessThan = lessThan;

const lessThanOrEqualTo = type => ({
  description: 'This is the lessThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is less than or equal to a specified value.',
  type
});

exports.lessThanOrEqualTo = lessThanOrEqualTo;

const greaterThan = type => ({
  description: 'This is the greaterThan operator to specify a constraint to select the objects where the value of a field is greater than a specified value.',
  type
});

exports.greaterThan = greaterThan;

const greaterThanOrEqualTo = type => ({
  description: 'This is the greaterThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is greater than or equal to a specified value.',
  type
});

exports.greaterThanOrEqualTo = greaterThanOrEqualTo;

const inOp = type => ({
  description: 'This is the in operator to specify a constraint to select the objects where the value of a field equals any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});

exports.inOp = inOp;

const notIn = type => ({
  description: 'This is the notIn operator to specify a constraint to select the objects where the value of a field do not equal any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});

exports.notIn = notIn;
const exists = {
  description: 'This is the exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: _graphql.GraphQLBoolean
};
exports.exists = exists;
const inQueryKey = {
  description: 'This is the inQueryKey operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.inQueryKey = inQueryKey;
const notInQueryKey = {
  description: 'This is the notInQueryKey operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.notInQueryKey = notInQueryKey;
const matchesRegex = {
  description: 'This is the matchesRegex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: _graphql.GraphQLString
};
exports.matchesRegex = matchesRegex;
const options = {
  description: 'This is the options operator to specify optional flags (such as "i" and "m") to be added to a matchesRegex operation in the same set of constraints.',
  type: _graphql.GraphQLString
};
exports.options = options;
const STRING_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'StringWhereInput',
  description: 'The StringWhereInput input type is used in operations that involve filtering objects by a field of type String.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLString),
    notEqualTo: notEqualTo(_graphql.GraphQLString),
    lessThan: lessThan(_graphql.GraphQLString),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLString),
    greaterThan: greaterThan(_graphql.GraphQLString),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLString),
    in: inOp(_graphql.GraphQLString),
    notIn: notIn(_graphql.GraphQLString),
    exists,
    inQueryKey,
    notInQueryKey,
    matchesRegex,
    options,
    text: {
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
    equalTo: equalTo(_graphql.GraphQLFloat),
    notEqualTo: notEqualTo(_graphql.GraphQLFloat),
    lessThan: lessThan(_graphql.GraphQLFloat),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLFloat),
    greaterThan: greaterThan(_graphql.GraphQLFloat),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLFloat),
    in: inOp(_graphql.GraphQLFloat),
    notIn: notIn(_graphql.GraphQLFloat),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.NUMBER_WHERE_INPUT = NUMBER_WHERE_INPUT;
const BOOLEAN_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BooleanWhereInput',
  description: 'The BooleanWhereInput input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLBoolean),
    notEqualTo: notEqualTo(_graphql.GraphQLBoolean),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.BOOLEAN_WHERE_INPUT = BOOLEAN_WHERE_INPUT;
const ARRAY_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ArrayWhereInput',
  description: 'The ArrayWhereInput input type is used in operations that involve filtering objects by a field of type Array.',
  fields: {
    equalTo: equalTo(ANY),
    notEqualTo: notEqualTo(ANY),
    lessThan: lessThan(ANY),
    lessThanOrEqualTo: lessThanOrEqualTo(ANY),
    greaterThan: greaterThan(ANY),
    greaterThanOrEqualTo: greaterThanOrEqualTo(ANY),
    in: inOp(ANY),
    notIn: notIn(ANY),
    exists,
    inQueryKey,
    notInQueryKey,
    containedBy: {
      description: 'This is the containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    contains: {
      description: 'This is the contains operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new _graphql.GraphQLList(ANY)
    }
  }
});
exports.ARRAY_WHERE_INPUT = ARRAY_WHERE_INPUT;
const KEY_VALUE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'KeyValueInput',
  description: 'An entry from an object, i.e., a pair of key and value.',
  fields: {
    key: {
      description: 'The key used to retrieve the value of this entry.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    value: {
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
    equalTo: equalTo(KEY_VALUE_INPUT),
    notEqualTo: notEqualTo(KEY_VALUE_INPUT),
    in: inOp(KEY_VALUE_INPUT),
    notIn: notIn(KEY_VALUE_INPUT),
    lessThan: lessThan(KEY_VALUE_INPUT),
    lessThanOrEqualTo: lessThanOrEqualTo(KEY_VALUE_INPUT),
    greaterThan: greaterThan(KEY_VALUE_INPUT),
    greaterThanOrEqualTo: greaterThanOrEqualTo(KEY_VALUE_INPUT),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.OBJECT_WHERE_INPUT = OBJECT_WHERE_INPUT;
const DATE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'DateWhereInput',
  description: 'The DateWhereInput input type is used in operations that involve filtering objects by a field of type Date.',
  fields: {
    equalTo: equalTo(DATE),
    notEqualTo: notEqualTo(DATE),
    lessThan: lessThan(DATE),
    lessThanOrEqualTo: lessThanOrEqualTo(DATE),
    greaterThan: greaterThan(DATE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(DATE),
    in: inOp(DATE),
    notIn: notIn(DATE),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.DATE_WHERE_INPUT = DATE_WHERE_INPUT;
const BYTES_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BytesWhereInput',
  description: 'The BytesWhereInput input type is used in operations that involve filtering objects by a field of type Bytes.',
  fields: {
    equalTo: equalTo(BYTES),
    notEqualTo: notEqualTo(BYTES),
    lessThan: lessThan(BYTES),
    lessThanOrEqualTo: lessThanOrEqualTo(BYTES),
    greaterThan: greaterThan(BYTES),
    greaterThanOrEqualTo: greaterThanOrEqualTo(BYTES),
    in: inOp(BYTES),
    notIn: notIn(BYTES),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.BYTES_WHERE_INPUT = BYTES_WHERE_INPUT;
const FILE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileWhereInput',
  description: 'The FileWhereInput input type is used in operations that involve filtering objects by a field of type File.',
  fields: {
    equalTo: equalTo(FILE),
    notEqualTo: notEqualTo(FILE),
    lessThan: lessThan(FILE),
    lessThanOrEqualTo: lessThanOrEqualTo(FILE),
    greaterThan: greaterThan(FILE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(FILE),
    in: inOp(FILE),
    notIn: notIn(FILE),
    exists,
    inQueryKey,
    notInQueryKey,
    matchesRegex,
    options
  }
});
exports.FILE_WHERE_INPUT = FILE_WHERE_INPUT;
const GEO_POINT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointWhereInput',
  description: 'The GeoPointWhereInput input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    exists,
    nearSphere: {
      description: 'This is the nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT_INPUT
    },
    maxDistance: {
      description: 'This is the maxDistance operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInRadians: {
      description: 'This is the maxDistanceInRadians operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInMiles: {
      description: 'This is the maxDistanceInMiles operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in miles) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInKilometers: {
      description: 'This is the maxDistanceInKilometers operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in kilometers) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    within: {
      description: 'This is the within operator to specify a constraint to select the objects where the values of a geo point field is within a specified box.',
      type: WITHIN_INPUT
    },
    geoWithin: {
      description: 'This is the geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_INPUT
    }
  }
});
exports.GEO_POINT_WHERE_INPUT = GEO_POINT_WHERE_INPUT;
const POLYGON_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PolygonWhereInput',
  description: 'The PolygonWhereInput input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    exists,
    geoIntersects: {
      description: 'This is the geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
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
const ELEMENT = new _graphql.GraphQLObjectType({
  name: 'Element',
  description: "The Element object type is used to return array items' value.",
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
  parseGraphQLSchema.addGraphQLType(PARSE_OBJECT, true);
  parseGraphQLSchema.addGraphQLType(READ_PREFERENCE, true);
  parseGraphQLSchema.addGraphQLType(READ_OPTIONS_INPUT, true);
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
  parseGraphQLSchema.addGraphQLType(ELEMENT, true);
  parseGraphQLSchema.addGraphQLType(OBJECT_ID, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9VVENTdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UX0lOUFVUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIkdFT19QT0lOVCIsIlBPTFlHT05fSU5QVVQiLCJHcmFwaFFMTGlzdCIsIlBPTFlHT04iLCJPQkpFQ1RfSUQiLCJHcmFwaFFMSUQiLCJDTEFTU19OQU1FX0FUVCIsIk9CSkVDVF9JRF9BVFQiLCJyZXNvbHZlIiwib2JqZWN0SWQiLCJDUkVBVEVEX0FUX0FUVCIsIlVQREFURURfQVRfQVRUIiwiQUNMX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkFDTCIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwiaWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiT2JqZWN0IiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJrZXkiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiR3JhcGhRTEJvb2xlYW4iLCJkaWFjcml0aWNTZW5zaXRpdmUiLCJURVhUX0lOUFVUIiwic2VhcmNoIiwiQk9YX0lOUFVUIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJXSVRISU5fSU5QVVQiLCJib3giLCJDRU5URVJfU1BIRVJFX0lOUFVUIiwiY2VudGVyIiwiZGlzdGFuY2UiLCJHRU9fV0lUSElOX0lOUFVUIiwicG9seWdvbiIsImNlbnRlclNwaGVyZSIsIkdFT19JTlRFUlNFQ1RTX0lOUFVUIiwicG9pbnQiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW5PcCIsIm5vdEluIiwiZXhpc3RzIiwiaW5RdWVyeUtleSIsIm5vdEluUXVlcnlLZXkiLCJtYXRjaGVzUmVnZXgiLCJvcHRpb25zIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwiaW4iLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJGSU5EX1JFU1VMVCIsInJlc3VsdHMiLCJjb3VudCIsIkVMRU1FTlQiLCJBUlJBWV9SRVNVTFQiLCJsb2FkQXJyYXlSZXN1bHQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJwYXJzZUNsYXNzZXMiLCJjbGFzc1R5cGVzIiwiZmlsdGVyIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMVW5pb25UeXBlIiwidHlwZXMiLCJyZXNvbHZlVHlwZSIsImdyYXBoUUxUeXBlcyIsInB1c2giLCJsb2FkIiwiYWRkR3JhcGhRTFR5cGUiLCJHcmFwaFFMVXBsb2FkIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBZ0JBOzs7Ozs7OztBQUVBLE1BQU1BLG1CQUFOLFNBQWtDQyxLQUFsQyxDQUF3QztBQUN0Q0MsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQVFDLElBQVIsRUFBYztBQUN2QixVQUFPLEdBQUVELEtBQU0sbUJBQWtCQyxJQUFLLEVBQXRDO0FBQ0Q7O0FBSHFDOzs7O0FBTXhDLE1BQU1DLGdCQUFnQixHQUFHRixLQUFLLElBQUk7QUFDaEMsTUFBSSxPQUFPQSxLQUFQLEtBQWlCLFFBQXJCLEVBQStCO0FBQzdCLFdBQU9BLEtBQVA7QUFDRDs7QUFFRCxRQUFNLElBQUlILG1CQUFKLENBQXdCRyxLQUF4QixFQUErQixRQUEvQixDQUFOO0FBQ0QsQ0FORDs7OztBQVFBLE1BQU1HLGFBQWEsR0FBR0gsS0FBSyxJQUFJO0FBQzdCLE1BQUksT0FBT0EsS0FBUCxLQUFpQixRQUFyQixFQUErQjtBQUM3QixVQUFNSSxHQUFHLEdBQUdDLE1BQU0sQ0FBQ0wsS0FBRCxDQUFsQjs7QUFDQSxRQUFJSyxNQUFNLENBQUNDLFNBQVAsQ0FBaUJGLEdBQWpCLENBQUosRUFBMkI7QUFDekIsYUFBT0EsR0FBUDtBQUNEO0FBQ0Y7O0FBRUQsUUFBTSxJQUFJUCxtQkFBSixDQUF3QkcsS0FBeEIsRUFBK0IsS0FBL0IsQ0FBTjtBQUNELENBVEQ7Ozs7QUFXQSxNQUFNTyxlQUFlLEdBQUdQLEtBQUssSUFBSTtBQUMvQixNQUFJLE9BQU9BLEtBQVAsS0FBaUIsUUFBckIsRUFBK0I7QUFDN0IsVUFBTVEsS0FBSyxHQUFHSCxNQUFNLENBQUNMLEtBQUQsQ0FBcEI7O0FBQ0EsUUFBSSxDQUFDUyxLQUFLLENBQUNELEtBQUQsQ0FBVixFQUFtQjtBQUNqQixhQUFPQSxLQUFQO0FBQ0Q7QUFDRjs7QUFFRCxR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ICBLaW5kLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTFNjYWxhclR5cGUsXG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxJbnRlcmZhY2VUeXBlLFxuICBHcmFwaFFMRW51bVR5cGUsXG4gIEdyYXBoUUxJbnQsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMVW5pb25UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdncmFwaHFsLXVwbG9hZCc7XG5cbmNsYXNzIFR5cGVWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHZhbHVlLCB0eXBlKSB7XG4gICAgc3VwZXIoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbGlkICR7dHlwZX1gKTtcbiAgfVxufVxuXG5jb25zdCBwYXJzZVN0cmluZ1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnU3RyaW5nJyk7XG59O1xuXG5jb25zdCBwYXJzZUludFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGZsb2F0KSkge1xuICAgICAgcmV0dXJuIGZsb2F0O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmxvYXQnKTtcbn07XG5cbmNvbnN0IHBhcnNlQm9vbGVhblZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Jvb2xlYW4nKTtcbn07XG5cbmNvbnN0IHBhcnNlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9IHZhbHVlcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICByZXR1cm4gdmFsdWVzLm1hcCh2YWx1ZSA9PiBwYXJzZVZhbHVlKHZhbHVlKSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZXMsICdMaXN0Jyk7XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IGZpZWxkcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6IHZhbHVlID0+IHZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHZhbHVlLFxuICBwYXJzZUxpdGVyYWw6IGFzdCA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIG9iamVjdHMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKGFzdC5maWVsZHMpO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnT2JqZWN0Jyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VEYXRlSXNvVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZGF0ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBzZXJpYWxpemVEYXRlSXNvID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvVVRDU3RyaW5nKCk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb0xpdGVyYWwgPSBhc3QgPT4ge1xuICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgcmV0dXJuIHBhcnNlRGF0ZUlzb1ZhbHVlKGFzdC52YWx1ZSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IERBVEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRGF0ZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBkYXRlcy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZSksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJlxuICAgICAgdmFsdWUuaXNvXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6IHZhbHVlLl9fdHlwZSxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZS5pc28pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmXG4gICAgICB2YWx1ZS5pc29cbiAgICApIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgaXNvID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdpc28nKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0RhdGUnICYmIGlzbykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChpc28udmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0J5dGVzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlcyBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBiYXNlIDY0IGJpbmFyeSBkYXRhLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLmJhc2U2NDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogYXN0LnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnYmFzZTY0Jyk7XG4gICAgICBpZiAoXG4gICAgICAgIF9fdHlwZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlLnZhbHVlID09PSAnQnl0ZXMnICYmXG4gICAgICAgIGJhc2U2NCAmJlxuICAgICAgICBiYXNlNjQudmFsdWUgJiZcbiAgICAgICAgdHlwZW9mIGJhc2U2NC52YWx1ZS52YWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGJhc2U2NDogYmFzZTY0LnZhbHVlLnZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnQnl0ZXMnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZUZpbGVWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiB2YWx1ZSxcbiAgICB9O1xuICB9IGVsc2UgaWYgKFxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG59O1xuXG5jb25zdCBGSUxFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0ZpbGUnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZmlsZXMuJyxcbiAgcGFyc2VWYWx1ZTogcGFyc2VGaWxlVmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKGFzdC52YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBuYW1lID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICduYW1lJyk7XG4gICAgICBjb25zdCB1cmwgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ3VybCcpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgbmFtZSAmJiBuYW1lLnZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZSh7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgbmFtZTogbmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB1cmw6IHVybCAmJiB1cmwudmFsdWUgPyB1cmwudmFsdWUudmFsdWUgOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRmlsZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5GTyA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5mbycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZUluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGZpbGVzLicsXG4gIGZpZWxkczoge1xuICAgIG5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmlsZSBuYW1lLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXJsIGluIHdoaWNoIHRoZSBmaWxlIGNhbiBiZSBkb3dubG9hZGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfRklFTERTID0ge1xuICBsYXRpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGF0aXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbiAgbG9uZ2l0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsb25naXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbn07XG5cbmNvbnN0IEdFT19QT0lOVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50SW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBmaWVsZHMgb2YgdHlwZSBnZW8gcG9pbnQuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGdlbyBwb2ludCBmaWVsZHMuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IFBPTFlHT05fSU5QVVQgPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCkpO1xuXG5jb25zdCBQT0xZR09OID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpKTtcblxuY29uc3QgT0JKRUNUX0lEID0gbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCk7XG5cbmNvbnN0IENMQVNTX05BTUVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNsYXNzIG5hbWUgb2YgdGhlIG9iamVjdC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBPQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBPQkpFQ1RfSUQsXG4gIHJlc29sdmU6ICh7IG9iamVjdElkIH0pID0+IG9iamVjdElkLFxufTtcblxuY29uc3QgQ1JFQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBjcmVhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IFVQREFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgbGFzIHVwZGF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgQUNMX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBhY2Nlc3MgY29udHJvbCBsaXN0IG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgSU5QVVRfRklFTERTID0ge1xuICBBQ0w6IEFDTF9BVFQsXG59O1xuXG5jb25zdCBDUkVBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgaWQ6IE9CSkVDVF9JRF9BVFQsXG4gIGNyZWF0ZWRBdDogQ1JFQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBVUERBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgdXBkYXRlZEF0OiBVUERBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFBBUlNFX09CSkVDVF9GSUVMRFMgPSB7XG4gIC4uLkNSRUFURV9SRVNVTFRfRklFTERTLFxuICAuLi5VUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uSU5QVVRfRklFTERTLFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUID0gbmV3IEdyYXBoUUxJbnRlcmZhY2VUeXBlKHtcbiAgbmFtZTogJ1BhcnNlT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBQYXJzZU9iamVjdCBpbnRlcmZhY2UgdHlwZSBpcyB1c2VkIGFzIGEgYmFzZSB0eXBlIGZvciB0aGUgYXV0byBnZW5lcmF0ZWQgb2JqZWN0IHR5cGVzLicsXG4gIGZpZWxkczogUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBTRVNTSU9OX1RPS0VOX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgdXNlciBzZXNzaW9uIHRva2VuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gIG5hbWU6ICdSZWFkUHJlZmVyZW5jZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZFByZWZlcmVuY2UgZW51bSB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZWxlY3QgaW4gd2hpY2ggZGF0YWJhc2UgcmVwbGljYSB0aGUgb3BlcmF0aW9uIG11c3QgcnVuLicsXG4gIHZhbHVlczoge1xuICAgIFBSSU1BUlk6IHsgdmFsdWU6ICdQUklNQVJZJyB9LFxuICAgIFBSSU1BUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnUFJJTUFSWV9QUkVGRVJSRUQnIH0sXG4gICAgU0VDT05EQVJZOiB7IHZhbHVlOiAnU0VDT05EQVJZJyB9LFxuICAgIFNFQ09OREFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdTRUNPTkRBUllfUFJFRkVSUkVEJyB9LFxuICAgIE5FQVJFU1Q6IHsgdmFsdWU6ICdORUFSRVNUJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIG1haW4gcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHF1ZXJpZXMgdG8gYmUgZXhlY3V0ZWQgdG8gaW5jbHVkZSBmaWVsZHMuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgc3VicXVlcmllcyB0aGF0IG1heSBiZSByZXF1aXJlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBSRUFEX09QVElPTlNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSZWFkT3B0aW9uc0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkT3B0aW9uc0lucHV0dCB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZXQgdGhlIHJlYWQgcHJlZmVyZW5jZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZFByZWZlcmVuY2U6IFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlOiBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZTogU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX09QVElPTlNfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIG9wdGlvbnMgZm9yIHRoZSBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX09QVElPTlNfSU5QVVQsXG59O1xuXG5jb25zdCBXSEVSRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgU0tJUF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHNraXBwZWQgdG8gcmV0dXJuLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBMSU1JVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGltaXQgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHJldHVybmVkLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBDT1VOVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSB0b3RhbCBtYXRjaGVkIG9iamVjcyBjb3VudCB0aGF0IGlzIHJldHVybmVkIHdoZW4gdGhlIGNvdW50IGZsYWcgaXMgc2V0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSW50KSxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3VicXVlcnlJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3VicXVlcnlJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHN1YiBxdWVyeSB0byBhbm90aGVyIGNsYXNzLicsXG4gIGZpZWxkczoge1xuICAgIGNsYXNzTmFtZTogQ0xBU1NfTkFNRV9BVFQsXG4gICAgd2hlcmU6IE9iamVjdC5hc3NpZ24oe30sIFdIRVJFX0FUVCwge1xuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFdIRVJFX0FUVC50eXBlKSxcbiAgICB9KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUxFQ1RfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWxlY3RJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VsZWN0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYW4gaW5RdWVyeUtleSBvciBhIG5vdEluUXVlcnlLZXkgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBxdWVyeToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzdWJxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNVQlFVRVJZX0lOUFVUKSxcbiAgICB9LFxuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBrZXkgaW4gdGhlIHJlc3VsdCBvZiB0aGUgc3VicXVlcnkgdGhhdCBtdXN0IG1hdGNoIChub3QgbWF0Y2gpIHRoZSBmaWVsZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgU0VBUkNIX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VhcmNoSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNlYXJjaElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIHNlYXJjaCBvcGVyYXRpb24gb24gYSBmdWxsIHRleHQgc2VhcmNoLicsXG4gIGZpZWxkczoge1xuICAgIHRlcm06IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdGVybSB0byBiZSBzZWFyY2hlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgbGFuZ3VhZ2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbGFuZ3VhZ2UgdG8gdGV0ZXJtaW5lIHRoZSBsaXN0IG9mIHN0b3Agd29yZHMgYW5kIHRoZSBydWxlcyBmb3IgdG9rZW5pemVyLicsXG4gICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgY2FzZVNlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGNhc2Ugc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICBkaWFjcml0aWNTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBkaWFjcml0aWMgc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBURVhUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVGV4dElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBUZXh0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB0ZXh0IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgc2VhcmNoOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNlYXJjaCB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNFQVJDSF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT1hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb3hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm94SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgYm94IG9wZXJhdGlvbiBvbiBhIHdpdGhpbiBnZW8gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgYm90dG9tTGVmdDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3R0b20gbGVmdCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIHVwcGVyUmlnaHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBwZXIgcmlnaHQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBXSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdXaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB3aXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBib3g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm94IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEJPWF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBDRU5URVJfU1BIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQ2VudGVyU3BoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENlbnRlclNwaGVyZUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIGNlbnRlclNwaGVyZSBvcGVyYXRpb24gb24gYSBnZW9XaXRoaW4gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgY2VudGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNlbnRlciBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIGRpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHJhZGl1cyBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19XSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9XaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9XaXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBwb2x5Z29uOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvbHlnb24gdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBQT0xZR09OX0lOUFVULFxuICAgIH0sXG4gICAgY2VudGVyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNwaGVyZSB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IENFTlRFUl9TUEhFUkVfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fSU5URVJTRUNUU19JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb0ludGVyc2VjdHNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvSW50ZXJzZWN0c0lucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgZ2VvSW50ZXJzZWN0cyBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvaW50OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvaW50IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5UX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgZXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IG5vdEVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBpbk9wID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyBhbnkgdmFsdWUgaW4gdGhlIHNwZWNpZmllZCBhcnJheS4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG59KTtcblxuY29uc3Qgbm90SW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBleGlzdHMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBleGlzdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXhpc3RzIChvciBkbyBub3QgZXhpc3QpLicsXG4gIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxufTtcblxuY29uc3QgaW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXF1YWxzIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3Qgbm90SW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3QgbWF0Y2hlc1JlZ2V4ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbWF0Y2hlc1JlZ2V4IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBtYXRjaGVzIGEgc3BlY2lmaWVkIHJlZ3VsYXIgZXhwcmVzc2lvbi4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3Qgb3B0aW9ucyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG9wdGlvbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBvcHRpb25hbCBmbGFncyAoc3VjaCBhcyBcImlcIiBhbmQgXCJtXCIpIHRvIGJlIGFkZGVkIHRvIGEgbWF0Y2hlc1JlZ2V4IG9wZXJhdGlvbiBpbiB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFNUUklOR19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N0cmluZ1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFN0cmluZ1doZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBTdHJpbmcuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMU3RyaW5nKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBpbjogaW5PcChHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTFN0cmluZyksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICB0ZXh0OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICR0ZXh0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBmdWxsIHRleHQgc2VhcmNoIGNvbnN0cmFpbnQuJyxcbiAgICAgIHR5cGU6IFRFWFRfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBOVU1CRVJfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdOdW1iZXJXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBOdW1iZXJXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgTnVtYmVyLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgaW46IGluT3AoR3JhcGhRTEZsb2F0KSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTEZsb2F0KSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPT0xFQU5fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb29sZWFuV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm9vbGVhbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCb29sZWFuLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQVJSQVlfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBcnJheVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFycmF5V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEFycmF5LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQU5ZKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEFOWSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEFOWSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEFOWSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgaW46IGluT3AoQU5ZKSxcbiAgICBub3RJbjogbm90SW4oQU5ZKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICAgIGNvbnRhaW5lZEJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGNvbnRhaW5lZEJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGlzIGNvbnRhaW5lZCBieSBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgICBjb250YWluczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWlucyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBjb250YWluIGFsbCBlbGVtZW50cyBvZiBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBLRVlfVkFMVUVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdLZXlWYWx1ZUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbiBlbnRyeSBmcm9tIGFuIG9iamVjdCwgaS5lLiwgYSBwYWlyIG9mIGtleSBhbmQgdmFsdWUuJyxcbiAgZmllbGRzOiB7XG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBrZXkgdXNlZCB0byByZXRyaWV2ZSB0aGUgdmFsdWUgb2YgdGhpcyBlbnRyeS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgdmFsdWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIHZhbHVlIG9mIHRoZSBlbnRyeS4gQ291bGQgYmUgYW55IHR5cGUgb2Ygc2NhbGFyIGRhdGEuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnT2JqZWN0V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIHJlc3VsdCBieSBhIGZpZWxkIG9mIHR5cGUgT2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgaW46IGluT3AoS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RJbjogbm90SW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IERBVEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdEYXRlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBEYXRlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oREFURSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhEQVRFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oREFURSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihEQVRFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oREFURSksXG4gICAgaW46IGluT3AoREFURSksXG4gICAgbm90SW46IG5vdEluKERBVEUpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQllURVNfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCeXRlc1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJ5dGVzLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQllURVMpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQllURVMpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihCWVRFUyksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhCWVRFUyksXG4gICAgaW46IGluT3AoQllURVMpLFxuICAgIG5vdEluOiBub3RJbihCWVRFUyksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGVXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRmlsZS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEZJTEUpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oRklMRSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEZJTEUpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhGSUxFKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oRklMRSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGluOiBpbk9wKEZJTEUpLFxuICAgIG5vdEluOiBub3RJbihGSUxFKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICAgIG1hdGNoZXNSZWdleCxcbiAgICBvcHRpb25zLFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgR2VvUG9pbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXhpc3RzLFxuICAgIG5lYXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbmVhclNwaGVyZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBuZWFyIHRvIGFub3RoZXIgZ2VvIHBvaW50LicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5SYWRpYW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5SYWRpYW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJbk1pbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5NaWxlcyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gbWlsZXMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluS2lsb21ldGVyczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluS2lsb21ldGVycyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4ga2lsb21ldGVycykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIHdpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSB3aXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIGJveC4nLFxuICAgICAgdHlwZTogV0lUSElOX0lOUFVULFxuICAgIH0sXG4gICAgZ2VvV2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb1dpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgcG9seWdvbiBvciBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IEdFT19XSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQT0xZR09OX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUG9seWdvbldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBvbHlnb25XaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgUG9seWdvbi4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgZ2VvSW50ZXJzZWN0czoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBnZW9JbnRlcnNlY3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgcG9seWdvbiBmaWVsZCBpbnRlcnNlY3QgYSBzcGVjaWZpZWQgcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19JTlRFUlNFQ1RTX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgRklORF9SRVNVTFQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmluZFJlc3VsdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmluZFJlc3VsdCBvYmplY3QgdHlwZSBpcyB1c2VkIGluIHRoZSBmaW5kIHF1ZXJpZXMgdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSBtYXRjaGVkIG9iamVjdHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVzdWx0czoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3RzIHJldHVybmVkIGJ5IHRoZSBxdWVyeScsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwobmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpKSksXG4gICAgfSxcbiAgICBjb3VudDogQ09VTlRfQVRULFxuICB9LFxufSk7XG5cbmNvbnN0IEVMRU1FTlQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRWxlbWVudCcsXG4gIGRlc2NyaXB0aW9uOiBcIlRoZSBFbGVtZW50IG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIGFycmF5IGl0ZW1zJyB2YWx1ZS5cIixcbiAgZmllbGRzOiB7XG4gICAgdmFsdWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmV0dXJuIHRoZSB2YWx1ZSBvZiB0aGUgZWxlbWVudCBpbiB0aGUgYXJyYXknLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG4vLyBEZWZhdWx0IHN0YXRpYyB1bmlvbiB0eXBlLCB3ZSB1cGRhdGUgdHlwZXMgYW5kIHJlc29sdmVUeXBlIGZ1bmN0aW9uIGxhdGVyXG5sZXQgQVJSQVlfUkVTVUxUO1xuXG5jb25zdCBsb2FkQXJyYXlSZXN1bHQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzZXMpID0+IHtcbiAgY29uc3QgY2xhc3NUeXBlcyA9IHBhcnNlQ2xhc3Nlc1xuICAgIC5maWx0ZXIocGFyc2VDbGFzcyA9PlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1twYXJzZUNsYXNzLmNsYXNzTmFtZV1cbiAgICAgICAgLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICAgICAgPyB0cnVlXG4gICAgICAgIDogZmFsc2VcbiAgICApXG4gICAgLm1hcChcbiAgICAgIHBhcnNlQ2xhc3MgPT5cbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1twYXJzZUNsYXNzLmNsYXNzTmFtZV1cbiAgICAgICAgICAuY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICAgICk7XG4gIEFSUkFZX1JFU1VMVCA9IG5ldyBHcmFwaFFMVW5pb25UeXBlKHtcbiAgICBuYW1lOiAnQXJyYXlSZXN1bHQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1VzZSBJbmxpbmUgRnJhZ21lbnQgb24gQXJyYXkgdG8gZ2V0IHJlc3VsdHM6IGh0dHBzOi8vZ3JhcGhxbC5vcmcvbGVhcm4vcXVlcmllcy8jaW5saW5lLWZyYWdtZW50cycsXG4gICAgdHlwZXM6ICgpID0+IFtFTEVNRU5ULCAuLi5jbGFzc1R5cGVzXSxcbiAgICByZXNvbHZlVHlwZTogdmFsdWUgPT4ge1xuICAgICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ09iamVjdCcgJiYgdmFsdWUuY2xhc3NOYW1lICYmIHZhbHVlLm9iamVjdElkKSB7XG4gICAgICAgIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3ZhbHVlLmNsYXNzTmFtZV0pIHtcbiAgICAgICAgICByZXR1cm4gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdXG4gICAgICAgICAgICAuY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gRUxFTUVOVDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIEVMRU1FTlQ7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChBUlJBWV9SRVNVTFQpO1xufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHcmFwaFFMVXBsb2FkLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFOWSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFUywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5GTywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fUE9JTlRfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5ULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBBUlNFX09CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShSRUFEX1BSRUZFUkVOQ0UsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9PUFRJT05TX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFNVQlFVRVJZX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFNFTEVDVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUFSQ0hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVEVYVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT1hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENFTlRFUl9TUEhFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1dJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fSU5URVJTRUNUU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVFJJTkdfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoTlVNQkVSX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPT0xFQU5fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQVJSQVlfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoS0VZX1ZBTFVFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBPTFlHT05fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklORF9SRVNVTFQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRUxFTUVOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1RfSUQsIHRydWUpO1xufTtcblxuZXhwb3J0IHtcbiAgVHlwZVZhbGlkYXRpb25FcnJvcixcbiAgcGFyc2VTdHJpbmdWYWx1ZSxcbiAgcGFyc2VJbnRWYWx1ZSxcbiAgcGFyc2VGbG9hdFZhbHVlLFxuICBwYXJzZUJvb2xlYW5WYWx1ZSxcbiAgcGFyc2VWYWx1ZSxcbiAgcGFyc2VMaXN0VmFsdWVzLFxuICBwYXJzZU9iamVjdEZpZWxkcyxcbiAgQU5ZLFxuICBPQkpFQ1QsXG4gIHBhcnNlRGF0ZUlzb1ZhbHVlLFxuICBzZXJpYWxpemVEYXRlSXNvLFxuICBEQVRFLFxuICBCWVRFUyxcbiAgcGFyc2VGaWxlVmFsdWUsXG4gIEZJTEUsXG4gIEZJTEVfSU5GTyxcbiAgR0VPX1BPSU5UX0ZJRUxEUyxcbiAgR0VPX1BPSU5UX0lOUFVULFxuICBHRU9fUE9JTlQsXG4gIFBPTFlHT05fSU5QVVQsXG4gIFBPTFlHT04sXG4gIE9CSkVDVF9JRCxcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIE9CSkVDVF9JRF9BVFQsXG4gIFVQREFURURfQVRfQVRULFxuICBDUkVBVEVEX0FUX0FUVCxcbiAgQUNMX0FUVCxcbiAgSU5QVVRfRklFTERTLFxuICBDUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFBBUlNFX09CSkVDVF9GSUVMRFMsXG4gIFBBUlNFX09CSkVDVCxcbiAgU0VTU0lPTl9UT0tFTl9BVFQsXG4gIFJFQURfUFJFRkVSRU5DRSxcbiAgUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBSRUFEX09QVElPTlNfSU5QVVQsXG4gIFJFQURfT1BUSU9OU19BVFQsXG4gIFdIRVJFX0FUVCxcbiAgU0tJUF9BVFQsXG4gIExJTUlUX0FUVCxcbiAgQ09VTlRfQVRULFxuICBTVUJRVUVSWV9JTlBVVCxcbiAgU0VMRUNUX0lOUFVULFxuICBTRUFSQ0hfSU5QVVQsXG4gIFRFWFRfSU5QVVQsXG4gIEJPWF9JTlBVVCxcbiAgV0lUSElOX0lOUFVULFxuICBDRU5URVJfU1BIRVJFX0lOUFVULFxuICBHRU9fV0lUSElOX0lOUFVULFxuICBHRU9fSU5URVJTRUNUU19JTlBVVCxcbiAgZXF1YWxUbyxcbiAgbm90RXF1YWxUbyxcbiAgbGVzc1RoYW4sXG4gIGxlc3NUaGFuT3JFcXVhbFRvLFxuICBncmVhdGVyVGhhbixcbiAgZ3JlYXRlclRoYW5PckVxdWFsVG8sXG4gIGluT3AsXG4gIG5vdEluLFxuICBleGlzdHMsXG4gIGluUXVlcnlLZXksXG4gIG5vdEluUXVlcnlLZXksXG4gIG1hdGNoZXNSZWdleCxcbiAgb3B0aW9ucyxcbiAgU1RSSU5HX1dIRVJFX0lOUFVULFxuICBOVU1CRVJfV0hFUkVfSU5QVVQsXG4gIEJPT0xFQU5fV0hFUkVfSU5QVVQsXG4gIEFSUkFZX1dIRVJFX0lOUFVULFxuICBLRVlfVkFMVUVfSU5QVVQsXG4gIE9CSkVDVF9XSEVSRV9JTlBVVCxcbiAgREFURV9XSEVSRV9JTlBVVCxcbiAgQllURVNfV0hFUkVfSU5QVVQsXG4gIEZJTEVfV0hFUkVfSU5QVVQsXG4gIEdFT19QT0lOVF9XSEVSRV9JTlBVVCxcbiAgUE9MWUdPTl9XSEVSRV9JTlBVVCxcbiAgRklORF9SRVNVTFQsXG4gIEFSUkFZX1JFU1VMVCxcbiAgRUxFTUVOVCxcbiAgbG9hZCxcbiAgbG9hZEFycmF5UmVzdWx0LFxufTtcbiJdfQ==