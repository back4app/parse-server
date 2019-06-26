"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.SIGN_UP_RESULT = exports.FIND_RESULT = exports.POLYGON_CONSTRAINT = exports.GEO_POINT_CONSTRAINT = exports.FILE_CONSTRAINT = exports.BYTES_CONSTRAINT = exports.DATE_CONSTRAINT = exports.OBJECT_CONSTRAINT = exports.ARRAY_CONSTRAINT = exports.BOOLEAN_CONSTRAINT = exports.NUMBER_CONSTRAINT = exports.STRING_CONSTRAINT = exports._options = exports._regex = exports._dontSelect = exports._select = exports._exists = exports._nin = exports._in = exports._gte = exports._gt = exports._lte = exports._lt = exports._ne = exports._eq = exports.GEO_INTERSECTS = exports.GEO_WITHIN_OPERATOR = exports.CENTER_SPHERE_OPERATOR = exports.WITHIN_OPERATOR = exports.BOX_OPERATOR = exports.TEXT_OPERATOR = exports.SEARCH_OPERATOR = exports.SELECT_OPERATOR = exports.SUBQUERY = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.INCLUDE_ATT = exports.KEYS_ATT = exports.SESSION_TOKEN_ATT = exports.CLASS = exports.CLASS_FIELDS = exports.UPDATE_RESULT = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.ACL_ATT = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.FIELDS_ATT = exports.CLASS_NAME_ATT = exports.RELATION_OP = exports.POLYGON_INFO = exports.POLYGON = exports.GEO_POINT_INFO = exports.GEO_POINT = exports.GEO_POINT_FIELDS = exports.FILE_INFO = exports.FILE = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = void 0;

var _graphql = require("graphql");

var _graphqlUpload = require("graphql-upload");

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

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

const CLASS_FIELDS = _objectSpread({}, CREATE_RESULT_FIELDS, UPDATE_RESULT_FIELDS, INPUT_FIELDS);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9VVENTdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIkdFT19QT0lOVF9JTkZPIiwiUE9MWUdPTiIsIkdyYXBoUUxMaXN0IiwiUE9MWUdPTl9JTkZPIiwiUkVMQVRJT05fT1AiLCJHcmFwaFFMRW51bVR5cGUiLCJCYXRjaCIsIkFkZFJlbGF0aW9uIiwiUmVtb3ZlUmVsYXRpb24iLCJDTEFTU19OQU1FX0FUVCIsIkZJRUxEU19BVFQiLCJPQkpFQ1RfSURfQVRUIiwiR3JhcGhRTElEIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIkFDTF9BVFQiLCJJTlBVVF9GSUVMRFMiLCJBQ0wiLCJDUkVBVEVfUkVTVUxUX0ZJRUxEUyIsIm9iamVjdElkIiwiY3JlYXRlZEF0IiwiQ1JFQVRFX1JFU1VMVCIsIlVQREFURV9SRVNVTFRfRklFTERTIiwidXBkYXRlZEF0IiwiVVBEQVRFX1JFU1VMVCIsIkNMQVNTX0ZJRUxEUyIsIkNMQVNTIiwiR3JhcGhRTEludGVyZmFjZVR5cGUiLCJTRVNTSU9OX1RPS0VOX0FUVCIsIktFWVNfQVRUIiwiSU5DTFVERV9BVFQiLCJSRUFEX1BSRUZFUkVOQ0UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsIlJFQURfUFJFRkVSRU5DRV9BVFQiLCJJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiV0hFUkVfQVRUIiwiU0tJUF9BVFQiLCJHcmFwaFFMSW50IiwiTElNSVRfQVRUIiwiQ09VTlRfQVRUIiwiU1VCUVVFUlkiLCJjbGFzc05hbWUiLCJ3aGVyZSIsIk9iamVjdCIsImFzc2lnbiIsIlNFTEVDVF9PUEVSQVRPUiIsInF1ZXJ5Iiwia2V5IiwiU0VBUkNIX09QRVJBVE9SIiwiX3Rlcm0iLCJfbGFuZ3VhZ2UiLCJfY2FzZVNlbnNpdGl2ZSIsIkdyYXBoUUxCb29sZWFuIiwiX2RpYWNyaXRpY1NlbnNpdGl2ZSIsIlRFWFRfT1BFUkFUT1IiLCJfc2VhcmNoIiwiQk9YX09QRVJBVE9SIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJXSVRISU5fT1BFUkFUT1IiLCJfYm94IiwiQ0VOVEVSX1NQSEVSRV9PUEVSQVRPUiIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9PUEVSQVRPUiIsIl9wb2x5Z29uIiwiX2NlbnRlclNwaGVyZSIsIkdFT19JTlRFUlNFQ1RTIiwiX3BvaW50IiwiX2VxIiwiX25lIiwiX2x0IiwiX2x0ZSIsIl9ndCIsIl9ndGUiLCJfaW4iLCJfbmluIiwiX2V4aXN0cyIsIl9zZWxlY3QiLCJfZG9udFNlbGVjdCIsIl9yZWdleCIsIl9vcHRpb25zIiwiU1RSSU5HX0NPTlNUUkFJTlQiLCJfdGV4dCIsIk5VTUJFUl9DT05TVFJBSU5UIiwiQk9PTEVBTl9DT05TVFJBSU5UIiwiQVJSQVlfQ09OU1RSQUlOVCIsIl9jb250YWluZWRCeSIsIl9hbGwiLCJPQkpFQ1RfQ09OU1RSQUlOVCIsIkRBVEVfQ09OU1RSQUlOVCIsIkJZVEVTX0NPTlNUUkFJTlQiLCJGSUxFX0NPTlNUUkFJTlQiLCJHRU9fUE9JTlRfQ09OU1RSQUlOVCIsIl9uZWFyU3BoZXJlIiwiX21heERpc3RhbmNlIiwiX21heERpc3RhbmNlSW5SYWRpYW5zIiwiX21heERpc3RhbmNlSW5NaWxlcyIsIl9tYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIl93aXRoaW4iLCJfZ2VvV2l0aGluIiwiUE9MWUdPTl9DT05TVFJBSU5UIiwiX2dlb0ludGVyc2VjdHMiLCJGSU5EX1JFU1VMVCIsInJlc3VsdHMiLCJjb3VudCIsIlNJR05fVVBfUkVTVUxUIiwic2Vzc2lvblRva2VuIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImdyYXBoUUxUeXBlcyIsInB1c2giLCJHcmFwaFFMVXBsb2FkIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBZUE7Ozs7OztBQUVBLE1BQU1BLG1CQUFOLFNBQWtDQyxLQUFsQyxDQUF3QztBQUN0Q0MsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQVFDLElBQVIsRUFBYztBQUN2QixVQUFPLEdBQUVELEtBQU0sbUJBQWtCQyxJQUFLLEVBQXRD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Q0FBQ0MsWUFBbkIsQ0FBZ0NDLElBQWhDLENBQXFDcEIsZ0JBQXJDO0FBQ0FrQixFQUFBQSxrQkFBa0IsQ0FBQ0MsWUFBbkIsQ0FBZ0NDLElBQWhDLENBQXFDbkIsZUFBckM7QUFDQWlCLEVBQUFBLGtCQUFrQixDQUFDQyxZQUFuQixDQUFnQ0MsSUFBaEMsQ0FBcUNsQixvQkFBckM7QUFDQWdCLEVBQUFBLGtCQUFrQixDQUFDQyxZQUFuQixDQUFnQ0MsSUFBaEMsQ0FBcUNWLGtCQUFyQztBQUNBUSxFQUFBQSxrQkFBa0IsQ0FBQ0MsWUFBbkIsQ0FBZ0NDLElBQWhDLENBQXFDUixXQUFyQztBQUNBTSxFQUFBQSxrQkFBa0IsQ0FBQ0MsWUFBbkIsQ0FBZ0NDLElBQWhDLENBQXFDTCxjQUFyQztBQUNELENBcENEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgS2luZCxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxTY2FsYXJUeXBlLFxuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMSW50ZXJmYWNlVHlwZSxcbiAgR3JhcGhRTEVudW1UeXBlLFxuICBHcmFwaFFMSW50LFxuICBHcmFwaFFMRmxvYXQsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMQm9vbGVhbixcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBHcmFwaFFMVXBsb2FkIH0gZnJvbSAnZ3JhcGhxbC11cGxvYWQnO1xuXG5jbGFzcyBUeXBlVmFsaWRhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih2YWx1ZSwgdHlwZSkge1xuICAgIHN1cGVyKGAke3ZhbHVlfSBpcyBub3QgYSB2YWxpZCAke3R5cGV9YCk7XG4gIH1cbn1cblxuY29uc3QgcGFyc2VTdHJpbmdWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ1N0cmluZycpO1xufTtcblxuY29uc3QgcGFyc2VJbnRWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBpbnQgPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmIChOdW1iZXIuaXNJbnRlZ2VyKGludCkpIHtcbiAgICAgIHJldHVybiBpbnQ7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdJbnQnKTtcbn07XG5cbmNvbnN0IHBhcnNlRmxvYXRWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBmbG9hdCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKCFpc05hTihmbG9hdCkpIHtcbiAgICAgIHJldHVybiBmbG9hdDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Zsb2F0Jyk7XG59O1xuXG5jb25zdCBwYXJzZUJvb2xlYW5WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCb29sZWFuJyk7XG59O1xuXG5jb25zdCBwYXJzZVZhbHVlID0gdmFsdWUgPT4ge1xuICBzd2l0Y2ggKHZhbHVlLmtpbmQpIHtcbiAgICBjYXNlIEtpbmQuU1RSSU5HOlxuICAgICAgcmV0dXJuIHBhcnNlU3RyaW5nVmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLklOVDpcbiAgICAgIHJldHVybiBwYXJzZUludFZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5GTE9BVDpcbiAgICAgIHJldHVybiBwYXJzZUZsb2F0VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkJPT0xFQU46XG4gICAgICByZXR1cm4gcGFyc2VCb29sZWFuVmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkxJU1Q6XG4gICAgICByZXR1cm4gcGFyc2VMaXN0VmFsdWVzKHZhbHVlLnZhbHVlcyk7XG5cbiAgICBjYXNlIEtpbmQuT0JKRUNUOlxuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKHZhbHVlLmZpZWxkcyk7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHZhbHVlLnZhbHVlO1xuICB9XG59O1xuXG5jb25zdCBwYXJzZUxpc3RWYWx1ZXMgPSB2YWx1ZXMgPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB7XG4gICAgcmV0dXJuIHZhbHVlcy5tYXAodmFsdWUgPT4gcGFyc2VWYWx1ZSh2YWx1ZSkpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWVzLCAnTGlzdCcpO1xufTtcblxuY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSBmaWVsZHMgPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZHMpKSB7XG4gICAgcmV0dXJuIGZpZWxkcy5yZWR1Y2UoXG4gICAgICAob2JqZWN0LCBmaWVsZCkgPT4gKHtcbiAgICAgICAgLi4ub2JqZWN0LFxuICAgICAgICBbZmllbGQubmFtZS52YWx1ZV06IHBhcnNlVmFsdWUoZmllbGQudmFsdWUpLFxuICAgICAgfSksXG4gICAgICB7fVxuICAgICk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihmaWVsZHMsICdPYmplY3QnKTtcbn07XG5cbmNvbnN0IEFOWSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdBbnknLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFueSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBhbnkgdHlwZSBvZiB2YWx1ZS4nLFxuICBwYXJzZVZhbHVlOiB2YWx1ZSA9PiB2YWx1ZSxcbiAgc2VyaWFsaXplOiB2YWx1ZSA9PiB2YWx1ZSxcbiAgcGFyc2VMaXRlcmFsOiBhc3QgPT4gcGFyc2VWYWx1ZShhc3QpLFxufSk7XG5cbmNvbnN0IE9CSkVDVCA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdPYmplY3QnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE9iamVjdCBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBvYmplY3RzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnT2JqZWN0Jyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdEZpZWxkcyhhc3QuZmllbGRzKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ09iamVjdCcpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgaWYgKCFpc05hTihkYXRlKSkge1xuICAgICAgcmV0dXJuIGRhdGU7XG4gICAgfVxuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xufTtcblxuY29uc3Qgc2VyaWFsaXplRGF0ZUlzbyA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZS50b1VUQ1N0cmluZygpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBwYXJzZURhdGVJc29MaXRlcmFsID0gYXN0ID0+IHtcbiAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgIHJldHVybiBwYXJzZURhdGVJc29WYWx1ZShhc3QudmFsdWUpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdEYXRlJyk7XG59O1xuXG5jb25zdCBEQVRFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0RhdGUnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIERhdGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZGF0ZXMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvVmFsdWUodmFsdWUpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnRGF0ZScgJiZcbiAgICAgIHZhbHVlLmlzb1xuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiB2YWx1ZS5fX3R5cGUsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvVmFsdWUodmFsdWUuaXNvKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHNlcmlhbGl6ZURhdGVJc28odmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJlxuICAgICAgdmFsdWUuaXNvXG4gICAgKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZS5pc28pO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChhc3QpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGlzbyA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnaXNvJyk7XG4gICAgICBpZiAoX190eXBlICYmIF9fdHlwZS52YWx1ZSAmJiBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdEYXRlJyAmJiBpc28pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBpc286IHBhcnNlRGF0ZUlzb0xpdGVyYWwoaXNvLnZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFUyA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdCeXRlcycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXMgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgYmFzZSA2NCBiaW5hcnkgZGF0YS4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgICAgYmFzZTY0OiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5iYXNlNjQ7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCeXRlcycpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IGFzdC52YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBiYXNlNjQgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2Jhc2U2NCcpO1xuICAgICAgaWYgKFxuICAgICAgICBfX3R5cGUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlICYmXG4gICAgICAgIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgICBiYXNlNjQgJiZcbiAgICAgICAgYmFzZTY0LnZhbHVlICYmXG4gICAgICAgIHR5cGVvZiBiYXNlNjQudmFsdWUudmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBiYXNlNjQ6IGJhc2U2NC52YWx1ZS52YWx1ZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0J5dGVzJyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VGaWxlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgbmFtZTogdmFsdWUsXG4gICAgfTtcbiAgfSBlbHNlIGlmIChcbiAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgdmFsdWUuX190eXBlID09PSAnRmlsZScgJiZcbiAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xufTtcblxuY29uc3QgRklMRSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdGaWxlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGaWxlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGZpbGVzLicsXG4gIHBhcnNlVmFsdWU6IHBhcnNlRmlsZVZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWUubmFtZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ZpbGUnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZShhc3QudmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgbmFtZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnbmFtZScpO1xuICAgICAgY29uc3QgdXJsID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICd1cmwnKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIG5hbWUgJiYgbmFtZS52YWx1ZSkge1xuICAgICAgICByZXR1cm4gcGFyc2VGaWxlVmFsdWUoe1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIG5hbWU6IG5hbWUudmFsdWUudmFsdWUsXG4gICAgICAgICAgdXJsOiB1cmwgJiYgdXJsLnZhbHVlID8gdXJsLnZhbHVlLnZhbHVlIDogdW5kZWZpbmVkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0ZpbGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lORk8gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUluZm8nLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGVJbmZvIG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIHRoZSBpbmZvcm1hdGlvbiBhYm91dCBmaWxlcy4nLFxuICBmaWVsZHM6IHtcbiAgICBuYW1lOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZpbGUgbmFtZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgdXJsOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVybCBpbiB3aGljaCB0aGUgZmlsZSBjYW4gYmUgZG93bmxvYWRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX0ZJRUxEUyA9IHtcbiAgbGF0aXR1ZGU6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxhdGl0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG4gIGxvbmdpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbG9uZ2l0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG59O1xuXG5jb25zdCBHRU9fUE9JTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBmaWVsZHMgb2YgdHlwZSBnZW8gcG9pbnQuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9JTkZPID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50SW5mbycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRJbmZvIG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIHRoZSBpbmZvcm1hdGlvbiBhYm91dCBnZW8gcG9pbnRzLicsXG4gIGZpZWxkczogR0VPX1BPSU5UX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBQT0xZR09OID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpKTtcblxuY29uc3QgUE9MWUdPTl9JTkZPID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5GTykpO1xuXG5jb25zdCBSRUxBVElPTl9PUCA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICBuYW1lOiAnUmVsYXRpb25PcCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVsYXRpb25PcCBlbnVtIHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IHdoaWNoIGtpbmQgb2Ygb3BlcmF0aW9uIHNob3VsZCBiZSBleGVjdXRlZCB0byBhIHJlbGF0aW9uLicsXG4gIHZhbHVlczoge1xuICAgIEJhdGNoOiB7IHZhbHVlOiAnQmF0Y2gnIH0sXG4gICAgQWRkUmVsYXRpb246IHsgdmFsdWU6ICdBZGRSZWxhdGlvbicgfSxcbiAgICBSZW1vdmVSZWxhdGlvbjogeyB2YWx1ZTogJ1JlbW92ZVJlbGF0aW9uJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IENMQVNTX05BTUVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNsYXNzIG5hbWUgb2YgdGhlIG9iamVjdC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBGSUVMRFNfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgT0JKRUNUX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3QgaWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG59O1xuXG5jb25zdCBDUkVBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGNyZWF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgVVBEQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBsYXMgdXBkYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBBQ0xfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGFjY2VzcyBjb250cm9sIGxpc3Qgb2YgdGhlIG9iamVjdC4nLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBJTlBVVF9GSUVMRFMgPSB7XG4gIEFDTDogQUNMX0FUVCxcbn07XG5cbmNvbnN0IENSRUFURV9SRVNVTFRfRklFTERTID0ge1xuICBvYmplY3RJZDogT0JKRUNUX0lEX0FUVCxcbiAgY3JlYXRlZEF0OiBDUkVBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IENSRUFURV9SRVNVTFQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQ3JlYXRlUmVzdWx0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBDcmVhdGVSZXN1bHQgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgY3JlYXRlIG11dGF0aW9ucyB0byByZXR1cm4gdGhlIGRhdGEgb2YgdGhlIHJlY2VudCBjcmVhdGVkIG9iamVjdC4nLFxuICBmaWVsZHM6IENSRUFURV9SRVNVTFRfRklFTERTLFxufSk7XG5cbmNvbnN0IFVQREFURV9SRVNVTFRfRklFTERTID0ge1xuICB1cGRhdGVkQXQ6IFVQREFURURfQVRfQVRULFxufTtcblxuY29uc3QgVVBEQVRFX1JFU1VMVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdVcGRhdGVSZXN1bHQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFVwZGF0ZVJlc3VsdCBvYmplY3QgdHlwZSBpcyB1c2VkIGluIHRoZSB1cGRhdGUgbXV0YXRpb25zIHRvIHJldHVybiB0aGUgZGF0YSBvZiB0aGUgcmVjZW50IHVwZGF0ZWQgb2JqZWN0LicsXG4gIGZpZWxkczogVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG59KTtcblxuY29uc3QgQ0xBU1NfRklFTERTID0ge1xuICAuLi5DUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLklOUFVUX0ZJRUxEUyxcbn07XG5cbmNvbnN0IENMQVNTID0gbmV3IEdyYXBoUUxJbnRlcmZhY2VUeXBlKHtcbiAgbmFtZTogJ0NsYXNzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBDbGFzcyBpbnRlcmZhY2UgdHlwZSBpcyB1c2VkIGFzIGEgYmFzZSB0eXBlIGZvciB0aGUgYXV0byBnZW5lcmF0ZWQgY2xhc3MgdHlwZXMuJyxcbiAgZmllbGRzOiBDTEFTU19GSUVMRFMsXG59KTtcblxuY29uc3QgU0VTU0lPTl9UT0tFTl9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHVzZXIgc2Vzc2lvbiB0b2tlbicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IEtFWVNfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSBrZXlzIG9mIHRoZSBvYmplY3RzIHRoYXQgd2lsbCBiZSByZXR1cm5lZC4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3QgSU5DTFVERV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHBvaW50ZXJzIG9mIHRoZSBvYmplY3RzIHRoYXQgd2lsbCBiZSByZXR1cm5lZC4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gIG5hbWU6ICdSZWFkUHJlZmVyZW5jZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZFByZWZlcmVuY2UgZW51bSB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZWxlY3QgaW4gd2hpY2ggZGF0YWJhc2UgcmVwbGljYSB0aGUgb3BlcmF0aW9uIG11c3QgcnVuLicsXG4gIHZhbHVlczoge1xuICAgIFBSSU1BUlk6IHsgdmFsdWU6ICdQUklNQVJZJyB9LFxuICAgIFBSSU1BUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnUFJJTUFSWV9QUkVGRVJSRUQnIH0sXG4gICAgU0VDT05EQVJZOiB7IHZhbHVlOiAnU0VDT05EQVJZJyB9LFxuICAgIFNFQ09OREFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdTRUNPTkRBUllfUFJFRkVSUkVEJyB9LFxuICAgIE5FQVJFU1Q6IHsgdmFsdWU6ICdORUFSRVNUJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIG1haW4gcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHF1ZXJpZXMgdG8gYmUgZXhlY3V0ZWQgdG8gaW5jbHVkZSBmaWVsZHMuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgc3VicXVlcmllcyB0aGF0IG1heSBiZSByZXF1aXJlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBXSEVSRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgU0tJUF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHNraXBwZWQgdG8gcmV0dXJuLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBMSU1JVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGltaXQgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHJldHVybmVkLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBDT1VOVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSB0b3RhbCBtYXRjaGVkIG9iamVjcyBjb3VudCB0aGF0IGlzIHJldHVybmVkIHdoZW4gdGhlIGNvdW50IGZsYWcgaXMgc2V0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSW50KSxcbn07XG5cbmNvbnN0IFNVQlFVRVJZID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3VicXVlcnknLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFN1YnF1ZXJ5IGlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpYyBhIGRpZmZlcmVudCBxdWVyeSB0byBhIGRpZmZlcmVudCBjbGFzcy4nLFxuICBmaWVsZHM6IHtcbiAgICBjbGFzc05hbWU6IENMQVNTX05BTUVfQVRULFxuICAgIHdoZXJlOiBPYmplY3QuYXNzaWduKHt9LCBXSEVSRV9BVFQsIHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChXSEVSRV9BVFQudHlwZSksXG4gICAgfSksXG4gIH0sXG59KTtcblxuY29uc3QgU0VMRUNUX09QRVJBVE9SID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VsZWN0T3BlcmF0b3InLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNlbGVjdE9wZXJhdG9yIGlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJHNlbGVjdCBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHF1ZXJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHN1YnF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU1VCUVVFUlkpLFxuICAgIH0sXG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGtleSBpbiB0aGUgcmVzdWx0IG9mIHRoZSBzdWJxdWVyeSB0aGF0IG11c3QgbWF0Y2ggKG5vdCBtYXRjaCkgdGhlIGZpZWxkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUFSQ0hfT1BFUkFUT1IgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWFyY2hPcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VhcmNoT3BlcmF0b3IgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgJHNlYXJjaCBvcGVyYXRpb24gb24gYSBmdWxsIHRleHQgc2VhcmNoLicsXG4gIGZpZWxkczoge1xuICAgIF90ZXJtOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRlcm0gdG8gYmUgc2VhcmNoZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIF9sYW5ndWFnZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBsYW5ndWFnZSB0byB0ZXRlcm1pbmUgdGhlIGxpc3Qgb2Ygc3RvcCB3b3JkcyBhbmQgdGhlIHJ1bGVzIGZvciB0b2tlbml6ZXIuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBfY2FzZVNlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGNhc2Ugc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICBfZGlhY3JpdGljU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgZGlhY3JpdGljIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVEVYVF9PUEVSQVRPUiA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1RleHRPcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgVGV4dE9wZXJhdG9yIGlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJHRleHQgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBfc2VhcmNoOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNlYXJjaCB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNFQVJDSF9PUEVSQVRPUiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT1hfT1BFUkFUT1IgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb3hPcGVyYXRvcicsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm94T3BlcmF0b3IgaW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgJGJveCBvcGVyYXRpb24gb24gYSB3aXRoaW4gZ2VvIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGJvdHRvbUxlZnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm90dG9tIGxlZnQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCksXG4gICAgfSxcbiAgICB1cHBlclJpZ2h0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwcGVyIHJpZ2h0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgV0lUSElOX09QRVJBVE9SID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnV2l0aGluT3BlcmF0b3InLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFdpdGhpbk9wZXJhdG9yIGlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJHdpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIF9ib3g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm94IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEJPWF9PUEVSQVRPUiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBDRU5URVJfU1BIRVJFX09QRVJBVE9SID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQ2VudGVyU3BoZXJlT3BlcmF0b3InLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENlbnRlclNwaGVyZU9wZXJhdG9yIGlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhICRjZW50ZXJTcGhlcmUgb3BlcmF0aW9uIG9uIGEgZ2VvV2l0aGluIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGNlbnRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjZW50ZXIgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCksXG4gICAgfSxcbiAgICBkaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fV0lUSElOX09QRVJBVE9SID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvV2l0aGluT3BlcmF0b3InLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1dpdGhpbk9wZXJhdG9yIGlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgJGdlb1dpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIF9wb2x5Z29uOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvbHlnb24gdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBQT0xZR09OLFxuICAgIH0sXG4gICAgX2NlbnRlclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzcGhlcmUgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBDRU5URVJfU1BIRVJFX09QRVJBVE9SLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX0lOVEVSU0VDVFMgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9JbnRlcnNlY3RzT3BlcmF0b3InLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb0ludGVyc2VjdHNPcGVyYXRvciBpbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhICRnZW9JbnRlcnNlY3RzIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgX3BvaW50OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvaW50IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5ULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgX2VxID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGVxIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBfbmUgPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSAkbmUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IF9sdCA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRsdCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgX2x0ZSA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRsdGUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IF9ndCA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRndCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgX2d0ZSA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRndGUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IF9pbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBfbmluID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJG5pbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBfZXhpc3RzID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJGV4aXN0cyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBleGlzdHMgKG9yIGRvIG5vdCBleGlzdCkuJyxcbiAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG59O1xuXG5jb25zdCBfc2VsZWN0ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJHNlbGVjdCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBlcXVhbHMgdG8gYSBrZXkgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICB0eXBlOiBTRUxFQ1RfT1BFUkFUT1IsXG59O1xuXG5jb25zdCBfZG9udFNlbGVjdCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRkb250U2VsZWN0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9PUEVSQVRPUixcbn07XG5cbmNvbnN0IF9yZWdleCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlICRyZWdleCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgbWF0Y2hlcyBhIHNwZWNpZmllZCByZWd1bGFyIGV4cHJlc3Npb24uJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IF9vcHRpb25zID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgJG9wdGlvbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBvcHRpb25hbCBmbGFncyAoc3VjaCBhcyBcImlcIiBhbmQgXCJtXCIpIHRvIGJlIGFkZGVkIHRvIGEgJHJlZ2V4IG9wZXJhdGlvbiBpbiB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFNUUklOR19DT05TVFJBSU5UID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3RyaW5nQ29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3RyaW5nQ29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFN0cmluZy4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXE6IF9lcShHcmFwaFFMU3RyaW5nKSxcbiAgICBfbmU6IF9uZShHcmFwaFFMU3RyaW5nKSxcbiAgICBfbHQ6IF9sdChHcmFwaFFMU3RyaW5nKSxcbiAgICBfbHRlOiBfbHRlKEdyYXBoUUxTdHJpbmcpLFxuICAgIF9ndDogX2d0KEdyYXBoUUxTdHJpbmcpLFxuICAgIF9ndGU6IF9ndGUoR3JhcGhRTFN0cmluZyksXG4gICAgX2luOiBfaW4oR3JhcGhRTFN0cmluZyksXG4gICAgX25pbjogX25pbihHcmFwaFFMU3RyaW5nKSxcbiAgICBfZXhpc3RzLFxuICAgIF9zZWxlY3QsXG4gICAgX2RvbnRTZWxlY3QsXG4gICAgX3JlZ2V4LFxuICAgIF9vcHRpb25zLFxuICAgIF90ZXh0OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICR0ZXh0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBmdWxsIHRleHQgc2VhcmNoIGNvbnN0cmFpbnQuJyxcbiAgICAgIHR5cGU6IFRFWFRfT1BFUkFUT1IsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBOVU1CRVJfQ09OU1RSQUlOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ051bWJlckNvbnN0cmFpbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE51bWJlckNvbnN0cmFpbnQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBOdW1iZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoR3JhcGhRTEZsb2F0KSxcbiAgICBfbmU6IF9uZShHcmFwaFFMRmxvYXQpLFxuICAgIF9sdDogX2x0KEdyYXBoUUxGbG9hdCksXG4gICAgX2x0ZTogX2x0ZShHcmFwaFFMRmxvYXQpLFxuICAgIF9ndDogX2d0KEdyYXBoUUxGbG9hdCksXG4gICAgX2d0ZTogX2d0ZShHcmFwaFFMRmxvYXQpLFxuICAgIF9pbjogX2luKEdyYXBoUUxGbG9hdCksXG4gICAgX25pbjogX25pbihHcmFwaFFMRmxvYXQpLFxuICAgIF9leGlzdHMsXG4gICAgX3NlbGVjdCxcbiAgICBfZG9udFNlbGVjdCxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT09MRUFOX0NPTlNUUkFJTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb29sZWFuQ29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm9vbGVhbkNvbnN0cmFpbnQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCb29sZWFuLicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEdyYXBoUUxCb29sZWFuKSxcbiAgICBfbmU6IF9uZShHcmFwaFFMQm9vbGVhbiksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IEFSUkFZX0NPTlNUUkFJTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBcnJheUNvbnN0cmFpbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFycmF5Q29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEFycmF5LicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEFOWSksXG4gICAgX25lOiBfbmUoQU5ZKSxcbiAgICBfbHQ6IF9sdChBTlkpLFxuICAgIF9sdGU6IF9sdGUoQU5ZKSxcbiAgICBfZ3Q6IF9ndChBTlkpLFxuICAgIF9ndGU6IF9ndGUoQU5ZKSxcbiAgICBfaW46IF9pbihBTlkpLFxuICAgIF9uaW46IF9uaW4oQU5ZKSxcbiAgICBfZXhpc3RzLFxuICAgIF9zZWxlY3QsXG4gICAgX2RvbnRTZWxlY3QsXG4gICAgX2NvbnRhaW5lZEJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRjb250YWluZWRCeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBpcyBjb250YWluZWQgYnkgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgX2FsbDoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkYWxsIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGNvbnRhaW4gYWxsIGVsZW1lbnRzIG9mIGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE9CSkVDVF9DT05TVFJBSU5UID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnT2JqZWN0Q29uc3RyYWludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0Q29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIE9iamVjdC4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXE6IF9lcShPQkpFQ1QpLFxuICAgIF9uZTogX25lKE9CSkVDVCksXG4gICAgX2luOiBfaW4oT0JKRUNUKSxcbiAgICBfbmluOiBfbmluKE9CSkVDVCksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IERBVEVfQ09OU1RSQUlOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0RhdGVDb25zdHJhaW50JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBEYXRlQ29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIERhdGUuJyxcbiAgZmllbGRzOiB7XG4gICAgX2VxOiBfZXEoREFURSksXG4gICAgX25lOiBfbmUoREFURSksXG4gICAgX2x0OiBfbHQoREFURSksXG4gICAgX2x0ZTogX2x0ZShEQVRFKSxcbiAgICBfZ3Q6IF9ndChEQVRFKSxcbiAgICBfZ3RlOiBfZ3RlKERBVEUpLFxuICAgIF9pbjogX2luKERBVEUpLFxuICAgIF9uaW46IF9uaW4oREFURSksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTX0NPTlNUUkFJTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCeXRlc0NvbnN0cmFpbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzQ29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJ5dGVzLicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEJZVEVTKSxcbiAgICBfbmU6IF9uZShCWVRFUyksXG4gICAgX2x0OiBfbHQoQllURVMpLFxuICAgIF9sdGU6IF9sdGUoQllURVMpLFxuICAgIF9ndDogX2d0KEJZVEVTKSxcbiAgICBfZ3RlOiBfZ3RlKEJZVEVTKSxcbiAgICBfaW46IF9pbihCWVRFUyksXG4gICAgX25pbjogX25pbihCWVRFUyksXG4gICAgX2V4aXN0cyxcbiAgICBfc2VsZWN0LFxuICAgIF9kb250U2VsZWN0LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfQ09OU1RSQUlOVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVDb25zdHJhaW50JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGSUxFX0NPTlNUUkFJTlQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBGaWxlLicsXG4gIGZpZWxkczoge1xuICAgIF9lcTogX2VxKEZJTEUpLFxuICAgIF9uZTogX25lKEZJTEUpLFxuICAgIF9sdDogX2x0KEZJTEUpLFxuICAgIF9sdGU6IF9sdGUoRklMRSksXG4gICAgX2d0OiBfZ3QoRklMRSksXG4gICAgX2d0ZTogX2d0ZShGSUxFKSxcbiAgICBfaW46IF9pbihGSUxFKSxcbiAgICBfbmluOiBfbmluKEZJTEUpLFxuICAgIF9leGlzdHMsXG4gICAgX3NlbGVjdCxcbiAgICBfZG9udFNlbGVjdCxcbiAgICBfcmVnZXgsXG4gICAgX29wdGlvbnMsXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX0NPTlNUUkFJTlQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludENvbnN0cmFpbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50Q29uc3RyYWludCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEdlb1BvaW50LicsXG4gIGZpZWxkczoge1xuICAgIF9leGlzdHMsXG4gICAgX25lYXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgbmVhciB0byBhbm90aGVyIGdlbyBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5ULFxuICAgIH0sXG4gICAgX21heERpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRtYXhEaXN0YW5jZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIF9tYXhEaXN0YW5jZUluUmFkaWFuczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkbWF4RGlzdGFuY2VJblJhZGlhbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBfbWF4RGlzdGFuY2VJbk1pbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRtYXhEaXN0YW5jZUluTWlsZXMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIG1pbGVzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgX21heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRtYXhEaXN0YW5jZUluS2lsb21ldGVycyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4ga2lsb21ldGVycykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIF93aXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJHdpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgYm94LicsXG4gICAgICB0eXBlOiBXSVRISU5fT1BFUkFUT1IsXG4gICAgfSxcbiAgICBfZ2VvV2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRnZW9XaXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIHBvbHlnb24gb3Igc3BoZXJlLicsXG4gICAgICB0eXBlOiBHRU9fV0lUSElOX09QRVJBVE9SLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUE9MWUdPTl9DT05TVFJBSU5UID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUG9seWdvbkNvbnN0cmFpbnQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBvbHlnb25Db25zdHJhaW50IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgUG9seWdvbi4nLFxuICBmaWVsZHM6IHtcbiAgICBfZXhpc3RzLFxuICAgIF9nZW9JbnRlcnNlY3RzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlICRnZW9JbnRlcnNlY3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgcG9seWdvbiBmaWVsZCBpbnRlcnNlY3QgYSBzcGVjaWZpZWQgcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19JTlRFUlNFQ1RTLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgRklORF9SRVNVTFQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmluZFJlc3VsdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmluZFJlc3VsdCBvYmplY3QgdHlwZSBpcyB1c2VkIGluIHRoZSBmaW5kIHF1ZXJpZXMgdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSBtYXRjaGVkIG9iamVjdHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVzdWx0czoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3RzIHJldHVybmVkIGJ5IHRoZSBxdWVyeScsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwobmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpKSksXG4gICAgfSxcbiAgICBjb3VudDogQ09VTlRfQVRULFxuICB9LFxufSk7XG5cbmNvbnN0IFNJR05fVVBfUkVTVUxUID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1NpZ25VcFJlc3VsdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2lnblVwUmVzdWx0IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gdGhlIHVzZXJzIHNpZ24gdXAgbXV0YXRpb24gdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSByZWNlbnQgY3JlYXRlZCB1c2VyLicsXG4gIGZpZWxkczoge1xuICAgIC4uLkNSRUFURV9SRVNVTFRfRklFTERTLFxuICAgIHNlc3Npb25Ub2tlbjogU0VTU0lPTl9UT0tFTl9BVFQsXG4gIH0sXG59KTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChHcmFwaFFMVXBsb2FkKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFOWSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChPQkpFQ1QpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goREFURSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChCWVRFUyk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChGSUxFKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEZJTEVfSU5GTyk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChHRU9fUE9JTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goR0VPX1BPSU5UX0lORk8pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goUkVMQVRJT05fT1ApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQ1JFQVRFX1JFU1VMVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChVUERBVEVfUkVTVUxUKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKENMQVNTKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFJFQURfUFJFRkVSRU5DRSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChTVUJRVUVSWSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChTRUxFQ1RfT1BFUkFUT1IpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goU0VBUkNIX09QRVJBVE9SKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFRFWFRfT1BFUkFUT1IpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQk9YX09QRVJBVE9SKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFdJVEhJTl9PUEVSQVRPUik7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChDRU5URVJfU1BIRVJFX09QRVJBVE9SKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEdFT19XSVRISU5fT1BFUkFUT1IpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goR0VPX0lOVEVSU0VDVFMpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goU1RSSU5HX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goTlVNQkVSX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQk9PTEVBTl9DT05TVFJBSU5UKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFSUkFZX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goT0JKRUNUX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goREFURV9DT05TVFJBSU5UKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEJZVEVTX0NPTlNUUkFJTlQpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goRklMRV9DT05TVFJBSU5UKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEdFT19QT0lOVF9DT05TVFJBSU5UKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKFBPTFlHT05fQ09OU1RSQUlOVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChGSU5EX1JFU1VMVCk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChTSUdOX1VQX1JFU1VMVCk7XG59O1xuXG5leHBvcnQge1xuICBUeXBlVmFsaWRhdGlvbkVycm9yLFxuICBwYXJzZVN0cmluZ1ZhbHVlLFxuICBwYXJzZUludFZhbHVlLFxuICBwYXJzZUZsb2F0VmFsdWUsXG4gIHBhcnNlQm9vbGVhblZhbHVlLFxuICBwYXJzZVZhbHVlLFxuICBwYXJzZUxpc3RWYWx1ZXMsXG4gIHBhcnNlT2JqZWN0RmllbGRzLFxuICBBTlksXG4gIE9CSkVDVCxcbiAgcGFyc2VEYXRlSXNvVmFsdWUsXG4gIHNlcmlhbGl6ZURhdGVJc28sXG4gIERBVEUsXG4gIEJZVEVTLFxuICBwYXJzZUZpbGVWYWx1ZSxcbiAgRklMRSxcbiAgRklMRV9JTkZPLFxuICBHRU9fUE9JTlRfRklFTERTLFxuICBHRU9fUE9JTlQsXG4gIEdFT19QT0lOVF9JTkZPLFxuICBQT0xZR09OLFxuICBQT0xZR09OX0lORk8sXG4gIFJFTEFUSU9OX09QLFxuICBDTEFTU19OQU1FX0FUVCxcbiAgRklFTERTX0FUVCxcbiAgT0JKRUNUX0lEX0FUVCxcbiAgVVBEQVRFRF9BVF9BVFQsXG4gIENSRUFURURfQVRfQVRULFxuICBBQ0xfQVRULFxuICBJTlBVVF9GSUVMRFMsXG4gIENSRUFURV9SRVNVTFRfRklFTERTLFxuICBDUkVBVEVfUkVTVUxULFxuICBVUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgVVBEQVRFX1JFU1VMVCxcbiAgQ0xBU1NfRklFTERTLFxuICBDTEFTUyxcbiAgU0VTU0lPTl9UT0tFTl9BVFQsXG4gIEtFWVNfQVRULFxuICBJTkNMVURFX0FUVCxcbiAgUkVBRF9QUkVGRVJFTkNFLFxuICBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFdIRVJFX0FUVCxcbiAgU0tJUF9BVFQsXG4gIExJTUlUX0FUVCxcbiAgQ09VTlRfQVRULFxuICBTVUJRVUVSWSxcbiAgU0VMRUNUX09QRVJBVE9SLFxuICBTRUFSQ0hfT1BFUkFUT1IsXG4gIFRFWFRfT1BFUkFUT1IsXG4gIEJPWF9PUEVSQVRPUixcbiAgV0lUSElOX09QRVJBVE9SLFxuICBDRU5URVJfU1BIRVJFX09QRVJBVE9SLFxuICBHRU9fV0lUSElOX09QRVJBVE9SLFxuICBHRU9fSU5URVJTRUNUUyxcbiAgX2VxLFxuICBfbmUsXG4gIF9sdCxcbiAgX2x0ZSxcbiAgX2d0LFxuICBfZ3RlLFxuICBfaW4sXG4gIF9uaW4sXG4gIF9leGlzdHMsXG4gIF9zZWxlY3QsXG4gIF9kb250U2VsZWN0LFxuICBfcmVnZXgsXG4gIF9vcHRpb25zLFxuICBTVFJJTkdfQ09OU1RSQUlOVCxcbiAgTlVNQkVSX0NPTlNUUkFJTlQsXG4gIEJPT0xFQU5fQ09OU1RSQUlOVCxcbiAgQVJSQVlfQ09OU1RSQUlOVCxcbiAgT0JKRUNUX0NPTlNUUkFJTlQsXG4gIERBVEVfQ09OU1RSQUlOVCxcbiAgQllURVNfQ09OU1RSQUlOVCxcbiAgRklMRV9DT05TVFJBSU5ULFxuICBHRU9fUE9JTlRfQ09OU1RSQUlOVCxcbiAgUE9MWUdPTl9DT05TVFJBSU5ULFxuICBGSU5EX1JFU1VMVCxcbiAgU0lHTl9VUF9SRVNVTFQsXG4gIGxvYWQsXG59O1xuIl19