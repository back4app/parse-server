"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.serializeDateIso = exports.parseValue = exports.parseStringValue = exports.parseObjectFields = exports.parseListValues = exports.parseIntValue = exports.parseFloatValue = exports.parseFileValue = exports.parseDateIsoValue = exports.parseBooleanValue = exports.options = exports.notInQueryKey = exports.notIn = exports.notEqualTo = exports.matchesRegex = exports.loadArrayResult = exports.load = exports.lessThanOrEqualTo = exports.lessThan = exports.inQueryKey = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.exists = exports.equalTo = exports.WITHIN_INPUT = exports.WHERE_ATT = exports.USER_ACL_INPUT = exports.USER_ACL = exports.UPDATE_RESULT_FIELDS = exports.UPDATED_AT_ATT = exports.TypeValidationError = exports.TEXT_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.SUBQUERY_INPUT = exports.STRING_WHERE_INPUT = exports.SKIP_ATT = exports.SESSION_TOKEN_ATT = exports.SELECT_INPUT = exports.SEARCH_INPUT = exports.ROLE_ACL_INPUT = exports.ROLE_ACL = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.READ_OPTIONS_INPUT = exports.READ_OPTIONS_ATT = exports.PUBLIC_ACL_INPUT = exports.PUBLIC_ACL = exports.POLYGON_WHERE_INPUT = exports.POLYGON_INPUT = exports.POLYGON = exports.PARSE_OBJECT_FIELDS = exports.PARSE_OBJECT = exports.OBJECT_WHERE_INPUT = exports.OBJECT_ID_ATT = exports.OBJECT_ID = exports.OBJECT = exports.NUMBER_WHERE_INPUT = exports.LIMIT_ATT = exports.KEY_VALUE_INPUT = exports.INPUT_FIELDS = exports.INCLUDE_READ_PREFERENCE_ATT = exports.ID_WHERE_INPUT = exports.GLOBAL_OR_OBJECT_ID_ATT = exports.GEO_WITHIN_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.GEO_POINT = exports.GEO_INTERSECTS_INPUT = exports.FILE_WHERE_INPUT = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.ELEMENT = exports.DATE_WHERE_INPUT = exports.DATE = exports.CREATE_RESULT_FIELDS = exports.CREATED_AT_ATT = exports.COUNT_ATT = exports.CLASS_NAME_ATT = exports.CENTER_SPHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.BYTES = exports.BOX_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.ARRAY_WHERE_INPUT = exports.ARRAY_RESULT = exports.ANY = exports.ACL_INPUT = exports.ACL = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _links = require("@graphql-tools/links");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
    return fields.reduce((object, field) => _objectSpread(_objectSpread({}, object), {}, {
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
    return value.toISOString();
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
const FILE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  description: 'If this field is set to null the file will be unlinked (the file will not be deleted on cloud storage).',
  fields: {
    file: {
      description: 'A File Scalar can be an url or a FileInfo object.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: _links.GraphQLUpload
    }
  }
});
exports.FILE_INPUT = FILE_INPUT;
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
const USER_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'UserACLInput',
  description: 'Allow to manage users in ACL.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.USER_ACL_INPUT = USER_ACL_INPUT;
const ROLE_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'RoleACLInput',
  description: 'Allow to manage roles in ACL.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.ROLE_ACL_INPUT = ROLE_ACL_INPUT;
const PUBLIC_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PublicACLInput',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.PUBLIC_ACL_INPUT = PUBLIC_ACL_INPUT;
const ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ACLInput',
  description: 'Allow to manage access rights. If not provided object will be publicly readable and writable',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL_INPUT))
    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL_INPUT))
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL_INPUT
    }
  }
});
exports.ACL_INPUT = ACL_INPUT;
const USER_ACL = new _graphql.GraphQLObjectType({
  name: 'UserACL',
  description: 'Allow to manage users in ACL. If read and write are null the users have read and write rights.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.USER_ACL = USER_ACL;
const ROLE_ACL = new _graphql.GraphQLObjectType({
  name: 'RoleACL',
  description: 'Allow to manage roles in ACL. If read and write are null the role have read and write rights.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.ROLE_ACL = ROLE_ACL;
const PUBLIC_ACL = new _graphql.GraphQLObjectType({
  name: 'PublicACL',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: _graphql.GraphQLBoolean
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: _graphql.GraphQLBoolean
    }
  }
});
exports.PUBLIC_ACL = PUBLIC_ACL;
const ACL = new _graphql.GraphQLObjectType({
  name: 'ACL',
  description: 'Current access control list of the current object.',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL)),
      resolve(p) {
        const users = [];
        Object.keys(p).forEach(rule => {
          if (rule !== '*' && rule.indexOf('role:') !== 0) {
            users.push({
              userId: (0, _graphqlRelay.toGlobalId)('_User', rule),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return users.length ? users : null;
      }
    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL)),
      resolve(p) {
        const roles = [];
        Object.keys(p).forEach(rule => {
          if (rule.indexOf('role:') === 0) {
            roles.push({
              roleName: rule.replace('role:', ''),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return roles.length ? roles : null;
      }
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL,
      resolve(p) {
        /* eslint-disable */
        return p['*'] ? {
          read: p['*'].read ? true : false,
          write: p['*'].write ? true : false
        } : null;
      }
    }
  }
});
exports.ACL = ACL;
const OBJECT_ID = new _graphql.GraphQLNonNull(_graphql.GraphQLID);
exports.OBJECT_ID = OBJECT_ID;
const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.CLASS_NAME_ATT = CLASS_NAME_ATT;
const GLOBAL_OR_OBJECT_ID_ATT = {
  description: 'This is the object id. You can use either the global or the object id.',
  type: OBJECT_ID
};
exports.GLOBAL_OR_OBJECT_ID_ATT = GLOBAL_OR_OBJECT_ID_ATT;
const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID
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
const INPUT_FIELDS = {
  ACL: {
    type: ACL
  }
};
exports.INPUT_FIELDS = INPUT_FIELDS;
const CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
exports.CREATE_RESULT_FIELDS = CREATE_RESULT_FIELDS;
const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
exports.UPDATE_RESULT_FIELDS = UPDATE_RESULT_FIELDS;
const PARSE_OBJECT_FIELDS = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, CREATE_RESULT_FIELDS), UPDATE_RESULT_FIELDS), INPUT_FIELDS), {}, {
  ACL: {
    type: new _graphql.GraphQLNonNull(ACL),
    resolve: ({
      ACL
    }) => ACL ? ACL : {
      '*': {
        read: true,
        write: true
      }
    }
  }
});
exports.PARSE_OBJECT_FIELDS = PARSE_OBJECT_FIELDS;
const PARSE_OBJECT = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  description: 'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS
});
exports.PARSE_OBJECT = PARSE_OBJECT;
const SESSION_TOKEN_ATT = {
  description: 'The current user session token.',
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
const ID_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'IdWhereInput',
  description: 'The IdWhereInput input type is used in operations that involve filtering objects by an id.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLID),
    notEqualTo: notEqualTo(_graphql.GraphQLID),
    lessThan: lessThan(_graphql.GraphQLID),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLID),
    greaterThan: greaterThan(_graphql.GraphQLID),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLID),
    in: inOp(_graphql.GraphQLID),
    notIn: notIn(_graphql.GraphQLID),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.ID_WHERE_INPUT = ID_WHERE_INPUT;
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
    matchesRegex,
    options,
    text: {
      description: 'This is the $text operator to specify a full text search constraint.',
      type: TEXT_INPUT
    },
    inQueryKey,
    notInQueryKey
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
    containedBy: {
      description: 'This is the containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    contains: {
      description: 'This is the contains operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    inQueryKey,
    notInQueryKey
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
    matchesRegex,
    options,
    inQueryKey,
    notInQueryKey
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
const ELEMENT = new _graphql.GraphQLObjectType({
  name: 'Element',
  description: "The Element object type is used to return array items' value.",
  fields: {
    value: {
      description: 'Return the value of the element in the array',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
});

// Default static union type, we update types and resolveType function later
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
  parseGraphQLSchema.addGraphQLType(_links.GraphQLUpload, true);
  parseGraphQLSchema.addGraphQLType(ANY, true);
  parseGraphQLSchema.addGraphQLType(OBJECT, true);
  parseGraphQLSchema.addGraphQLType(DATE, true);
  parseGraphQLSchema.addGraphQLType(BYTES, true);
  parseGraphQLSchema.addGraphQLType(FILE, true);
  parseGraphQLSchema.addGraphQLType(FILE_INFO, true);
  parseGraphQLSchema.addGraphQLType(FILE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT, true);
  parseGraphQLSchema.addGraphQLType(PARSE_OBJECT, true);
  parseGraphQLSchema.addGraphQLType(READ_PREFERENCE, true);
  parseGraphQLSchema.addGraphQLType(READ_OPTIONS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SEARCH_INPUT, true);
  parseGraphQLSchema.addGraphQLType(TEXT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOX_INPUT, true);
  parseGraphQLSchema.addGraphQLType(WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(CENTER_SPHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_INTERSECTS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ID_WHERE_INPUT, true);
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
  parseGraphQLSchema.addGraphQLType(ELEMENT, true);
  parseGraphQLSchema.addGraphQLType(ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ACL, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL, true);
  parseGraphQLSchema.addGraphQLType(SUBQUERY_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SELECT_INPUT, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2xpbmtzIiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsIm9iaiIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInR5cGUiLCJleHBvcnRzIiwicGFyc2VTdHJpbmdWYWx1ZSIsInBhcnNlSW50VmFsdWUiLCJpbnQiLCJpc0ludGVnZXIiLCJwYXJzZUZsb2F0VmFsdWUiLCJmbG9hdCIsImlzTmFOIiwicGFyc2VCb29sZWFuVmFsdWUiLCJwYXJzZVZhbHVlIiwia2luZCIsIktpbmQiLCJTVFJJTkciLCJJTlQiLCJGTE9BVCIsIkJPT0xFQU4iLCJMSVNUIiwicGFyc2VMaXN0VmFsdWVzIiwidmFsdWVzIiwiT0JKRUNUIiwicGFyc2VPYmplY3RGaWVsZHMiLCJmaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJtYXAiLCJyZWR1Y2UiLCJmaWVsZCIsIm5hbWUiLCJBTlkiLCJHcmFwaFFMU2NhbGFyVHlwZSIsImRlc2NyaXB0aW9uIiwic2VyaWFsaXplIiwicGFyc2VMaXRlcmFsIiwiYXN0IiwicGFyc2VEYXRlSXNvVmFsdWUiLCJkYXRlIiwiRGF0ZSIsInNlcmlhbGl6ZURhdGVJc28iLCJ0b0lTT1N0cmluZyIsInBhcnNlRGF0ZUlzb0xpdGVyYWwiLCJEQVRFIiwiX190eXBlIiwiaXNvIiwiZmluZCIsIkJZVEVTIiwiYmFzZTY0IiwicGFyc2VGaWxlVmFsdWUiLCJ1cmwiLCJGSUxFIiwiRklMRV9JTkZPIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkdyYXBoUUxTdHJpbmciLCJGSUxFX0lOUFVUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsImZpbGUiLCJ1cGxvYWQiLCJHcmFwaFFMVXBsb2FkIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UX0lOUFVUIiwiR0VPX1BPSU5UIiwiUE9MWUdPTl9JTlBVVCIsIkdyYXBoUUxMaXN0IiwiUE9MWUdPTiIsIlVTRVJfQUNMX0lOUFVUIiwidXNlcklkIiwiR3JhcGhRTElEIiwicmVhZCIsIkdyYXBoUUxCb29sZWFuIiwid3JpdGUiLCJST0xFX0FDTF9JTlBVVCIsInJvbGVOYW1lIiwiUFVCTElDX0FDTF9JTlBVVCIsIkFDTF9JTlBVVCIsInVzZXJzIiwicm9sZXMiLCJwdWJsaWMiLCJVU0VSX0FDTCIsIlJPTEVfQUNMIiwiUFVCTElDX0FDTCIsIkFDTCIsInJlc29sdmUiLCJwIiwicnVsZSIsImluZGV4T2YiLCJ0b0dsb2JhbElkIiwicmVwbGFjZSIsIk9CSkVDVF9JRCIsIkNMQVNTX05BTUVfQVRUIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJPQkpFQ1RfSURfQVRUIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwib2JqZWN0SWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwiVEVYVF9JTlBVVCIsInNlYXJjaCIsIkJPWF9JTlBVVCIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiV0lUSElOX0lOUFVUIiwiYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJHRU9fSU5URVJTRUNUU19JTlBVVCIsInBvaW50IiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJsZXNzVGhhbiIsImxlc3NUaGFuT3JFcXVhbFRvIiwiZ3JlYXRlclRoYW4iLCJncmVhdGVyVGhhbk9yRXF1YWxUbyIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsIm1hdGNoZXNSZWdleCIsIm9wdGlvbnMiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsIklEX1dIRVJFX0lOUFVUIiwiaW4iLCJTVFJJTkdfV0hFUkVfSU5QVVQiLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzIiwiY2xhc3NUeXBlcyIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTFVuaW9uVHlwZSIsInR5cGVzIiwicmVzb2x2ZVR5cGUiLCJncmFwaFFMVHlwZXMiLCJsb2FkIiwiYWRkR3JhcGhRTFR5cGUiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgS2luZCxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxTY2FsYXJUeXBlLFxuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMSW50ZXJmYWNlVHlwZSxcbiAgR3JhcGhRTEVudW1UeXBlLFxuICBHcmFwaFFMSW50LFxuICBHcmFwaFFMRmxvYXQsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTFVuaW9uVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyB0b0dsb2JhbElkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgeyBHcmFwaFFMVXBsb2FkIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvbGlua3MnO1xuXG5jbGFzcyBUeXBlVmFsaWRhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih2YWx1ZSwgdHlwZSkge1xuICAgIHN1cGVyKGAke3ZhbHVlfSBpcyBub3QgYSB2YWxpZCAke3R5cGV9YCk7XG4gIH1cbn1cblxuY29uc3QgcGFyc2VTdHJpbmdWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ1N0cmluZycpO1xufTtcblxuY29uc3QgcGFyc2VJbnRWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBpbnQgPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmIChOdW1iZXIuaXNJbnRlZ2VyKGludCkpIHtcbiAgICAgIHJldHVybiBpbnQ7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdJbnQnKTtcbn07XG5cbmNvbnN0IHBhcnNlRmxvYXRWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBmbG9hdCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKCFpc05hTihmbG9hdCkpIHtcbiAgICAgIHJldHVybiBmbG9hdDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Zsb2F0Jyk7XG59O1xuXG5jb25zdCBwYXJzZUJvb2xlYW5WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCb29sZWFuJyk7XG59O1xuXG5jb25zdCBwYXJzZVZhbHVlID0gdmFsdWUgPT4ge1xuICBzd2l0Y2ggKHZhbHVlLmtpbmQpIHtcbiAgICBjYXNlIEtpbmQuU1RSSU5HOlxuICAgICAgcmV0dXJuIHBhcnNlU3RyaW5nVmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLklOVDpcbiAgICAgIHJldHVybiBwYXJzZUludFZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5GTE9BVDpcbiAgICAgIHJldHVybiBwYXJzZUZsb2F0VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkJPT0xFQU46XG4gICAgICByZXR1cm4gcGFyc2VCb29sZWFuVmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkxJU1Q6XG4gICAgICByZXR1cm4gcGFyc2VMaXN0VmFsdWVzKHZhbHVlLnZhbHVlcyk7XG5cbiAgICBjYXNlIEtpbmQuT0JKRUNUOlxuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKHZhbHVlLmZpZWxkcyk7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHZhbHVlLnZhbHVlO1xuICB9XG59O1xuXG5jb25zdCBwYXJzZUxpc3RWYWx1ZXMgPSB2YWx1ZXMgPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB7XG4gICAgcmV0dXJuIHZhbHVlcy5tYXAodmFsdWUgPT4gcGFyc2VWYWx1ZSh2YWx1ZSkpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWVzLCAnTGlzdCcpO1xufTtcblxuY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSBmaWVsZHMgPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZHMpKSB7XG4gICAgcmV0dXJuIGZpZWxkcy5yZWR1Y2UoXG4gICAgICAob2JqZWN0LCBmaWVsZCkgPT4gKHtcbiAgICAgICAgLi4ub2JqZWN0LFxuICAgICAgICBbZmllbGQubmFtZS52YWx1ZV06IHBhcnNlVmFsdWUoZmllbGQudmFsdWUpLFxuICAgICAgfSksXG4gICAgICB7fVxuICAgICk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihmaWVsZHMsICdPYmplY3QnKTtcbn07XG5cbmNvbnN0IEFOWSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdBbnknLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFueSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBhbnkgdHlwZSBvZiB2YWx1ZS4nLFxuICBwYXJzZVZhbHVlOiB2YWx1ZSA9PiB2YWx1ZSxcbiAgc2VyaWFsaXplOiB2YWx1ZSA9PiB2YWx1ZSxcbiAgcGFyc2VMaXRlcmFsOiBhc3QgPT4gcGFyc2VWYWx1ZShhc3QpLFxufSk7XG5cbmNvbnN0IE9CSkVDVCA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdPYmplY3QnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBPYmplY3Qgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgb2JqZWN0cy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnT2JqZWN0Jyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHMoYXN0LmZpZWxkcyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdPYmplY3QnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZURhdGVJc29WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZGF0ZSkpIHtcbiAgICAgIHJldHVybiBkYXRlO1xuICAgIH1cbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHNlcmlhbGl6ZURhdGVJc28gPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWUudG9JU09TdHJpbmcoKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xufTtcblxuY29uc3QgcGFyc2VEYXRlSXNvTGl0ZXJhbCA9IGFzdCA9PiB7XG4gIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICByZXR1cm4gcGFyc2VEYXRlSXNvVmFsdWUoYXN0LnZhbHVlKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xufTtcblxuY29uc3QgREFURSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdEYXRlJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgRGF0ZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBkYXRlcy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZSksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJiB2YWx1ZS5pc28pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogdmFsdWUuX190eXBlLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb1ZhbHVlKHZhbHVlLmlzbyksXG4gICAgICB9O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnRGF0ZScgJiYgdmFsdWUuaXNvKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZS5pc28pO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChhc3QpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGlzbyA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnaXNvJyk7XG4gICAgICBpZiAoX190eXBlICYmIF9fdHlwZS52YWx1ZSAmJiBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdEYXRlJyAmJiBpc28pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBpc286IHBhcnNlRGF0ZUlzb0xpdGVyYWwoaXNvLnZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFUyA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdCeXRlcycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXMgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgYmFzZSA2NCBiaW5hcnkgZGF0YS4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgICAgYmFzZTY0OiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5iYXNlNjQ7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCeXRlcycpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IGFzdC52YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBiYXNlNjQgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2Jhc2U2NCcpO1xuICAgICAgaWYgKFxuICAgICAgICBfX3R5cGUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlICYmXG4gICAgICAgIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgICBiYXNlNjQgJiZcbiAgICAgICAgYmFzZTY0LnZhbHVlICYmXG4gICAgICAgIHR5cGVvZiBiYXNlNjQudmFsdWUudmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBiYXNlNjQ6IGJhc2U2NC52YWx1ZS52YWx1ZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0J5dGVzJyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VGaWxlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgbmFtZTogdmFsdWUsXG4gICAgfTtcbiAgfSBlbHNlIGlmIChcbiAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgdmFsdWUuX190eXBlID09PSAnRmlsZScgJiZcbiAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xufTtcblxuY29uc3QgRklMRSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdGaWxlJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgRmlsZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBmaWxlcy4nLFxuICBwYXJzZVZhbHVlOiBwYXJzZUZpbGVWYWx1ZSxcbiAgc2VyaWFsaXplOiB2YWx1ZSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnRmlsZScgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICAgKHZhbHVlLnVybCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2YWx1ZS51cmwgPT09ICdzdHJpbmcnKVxuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4gcGFyc2VGaWxlVmFsdWUoYXN0LnZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IG5hbWUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ25hbWUnKTtcbiAgICAgIGNvbnN0IHVybCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAndXJsJyk7XG4gICAgICBpZiAoX190eXBlICYmIF9fdHlwZS52YWx1ZSAmJiBuYW1lICYmIG5hbWUudmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBuYW1lOiBuYW1lLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIHVybDogdXJsICYmIHVybC52YWx1ZSA/IHVybC52YWx1ZS52YWx1ZSA6IHVuZGVmaW5lZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdGaWxlJyk7XG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9JTkZPID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVJbmZvJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgRmlsZUluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGZpbGVzLicsXG4gIGZpZWxkczoge1xuICAgIG5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmlsZSBuYW1lLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXJsIGluIHdoaWNoIHRoZSBmaWxlIGNhbiBiZSBkb3dubG9hZGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0lmIHRoaXMgZmllbGQgaXMgc2V0IHRvIG51bGwgdGhlIGZpbGUgd2lsbCBiZSB1bmxpbmtlZCAodGhlIGZpbGUgd2lsbCBub3QgYmUgZGVsZXRlZCBvbiBjbG91ZCBzdG9yYWdlKS4nLFxuICBmaWVsZHM6IHtcbiAgICBmaWxlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0EgRmlsZSBTY2FsYXIgY2FuIGJlIGFuIHVybCBvciBhIEZpbGVJbmZvIG9iamVjdC4nLFxuICAgICAgdHlwZTogRklMRSxcbiAgICB9LFxuICAgIHVwbG9hZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdVc2UgdGhpcyBmaWVsZCBpZiB5b3Ugd2FudCB0byBjcmVhdGUgYSBuZXcgZmlsZS4nLFxuICAgICAgdHlwZTogR3JhcGhRTFVwbG9hZCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9GSUVMRFMgPSB7XG4gIGxhdGl0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsYXRpdHVkZS4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICB9LFxuICBsb25naXR1ZGU6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxvbmdpdHVkZS4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICB9LFxufTtcblxuY29uc3QgR0VPX1BPSU5UX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRJbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgaW5wdXR0aW5nIGZpZWxkcyBvZiB0eXBlIGdlbyBwb2ludC4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgR0VPX1BPSU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgR2VvUG9pbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGdlbyBwb2ludCBmaWVsZHMuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IFBPTFlHT05fSU5QVVQgPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCkpO1xuXG5jb25zdCBQT0xZR09OID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpKTtcblxuY29uc3QgVVNFUl9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdVc2VyQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSB1c2VycyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSb2xlQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSByb2xlcyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBVQkxJQ19BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIGFjY2VzcyByaWdodHMuIElmIG5vdCBwcm92aWRlZCBvYmplY3Qgd2lsbCBiZSBwdWJsaWNseSByZWFkYWJsZSBhbmQgd3JpdGFibGUnLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0xfSU5QVVQpKSxcbiAgICB9LFxuICAgIHB1YmxpYzoge1xuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIGNvbnRyb2wgbGlzdC4nLFxuICAgICAgdHlwZTogUFVCTElDX0FDTF9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFVTRVJfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHVzZXJzIGhhdmUgcmVhZCBhbmQgd3JpdGUgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJJZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgdGFyZ2V0dGVkIFVzZXIuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJPTEVfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHJvbGUgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0wnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSBwdWJsaWMgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQ3VycmVudCBhY2Nlc3MgY29udHJvbCBsaXN0IG9mIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTCkpLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIGNvbnN0IHVzZXJzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHApLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgICAgaWYgKHJ1bGUgIT09ICcqJyAmJiBydWxlLmluZGV4T2YoJ3JvbGU6JykgIT09IDApIHtcbiAgICAgICAgICAgIHVzZXJzLnB1c2goe1xuICAgICAgICAgICAgICB1c2VySWQ6IHRvR2xvYmFsSWQoJ19Vc2VyJywgcnVsZSksXG4gICAgICAgICAgICAgIHJlYWQ6IHBbcnVsZV0ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbcnVsZV0ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdXNlcnMubGVuZ3RoID8gdXNlcnMgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICAgIHJvbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHJvbGVzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFJPTEVfQUNMKSksXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgY29uc3Qgcm9sZXMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMocCkuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICBpZiAocnVsZS5pbmRleE9mKCdyb2xlOicpID09PSAwKSB7XG4gICAgICAgICAgICByb2xlcy5wdXNoKHtcbiAgICAgICAgICAgICAgcm9sZU5hbWU6IHJ1bGUucmVwbGFjZSgncm9sZTonLCAnJyksXG4gICAgICAgICAgICAgIHJlYWQ6IHBbcnVsZV0ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbcnVsZV0ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcm9sZXMubGVuZ3RoID8gcm9sZXMgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICAgIHB1YmxpYzoge1xuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIGNvbnRyb2wgbGlzdC4nLFxuICAgICAgdHlwZTogUFVCTElDX0FDTCxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSAqL1xuICAgICAgICByZXR1cm4gcFsnKiddXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICAgIHJlYWQ6IHBbJyonXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFsnKiddLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfSUQgPSBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKTtcblxuY29uc3QgQ0xBU1NfTkFNRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY2xhc3MgbmFtZSBvZiB0aGUgb2JqZWN0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBPQkpFQ1RfSUQsXG59O1xuXG5jb25zdCBPQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBPQkpFQ1RfSUQsXG59O1xuXG5jb25zdCBDUkVBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGNyZWF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgVVBEQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBsYXMgdXBkYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBJTlBVVF9GSUVMRFMgPSB7XG4gIEFDTDoge1xuICAgIHR5cGU6IEFDTCxcbiAgfSxcbn07XG5cbmNvbnN0IENSRUFURV9SRVNVTFRfRklFTERTID0ge1xuICBvYmplY3RJZDogT0JKRUNUX0lEX0FUVCxcbiAgY3JlYXRlZEF0OiBDUkVBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFVQREFURV9SRVNVTFRfRklFTERTID0ge1xuICB1cGRhdGVkQXQ6IFVQREFURURfQVRfQVRULFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUX0ZJRUxEUyA9IHtcbiAgLi4uQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLlVQREFURV9SRVNVTFRfRklFTERTLFxuICAuLi5JTlBVVF9GSUVMRFMsXG4gIEFDTDoge1xuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBQ0wpLFxuICAgIHJlc29sdmU6ICh7IEFDTCB9KSA9PiAoQUNMID8gQUNMIDogeyAnKic6IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfSB9KSxcbiAgfSxcbn07XG5cbmNvbnN0IFBBUlNFX09CSkVDVCA9IG5ldyBHcmFwaFFMSW50ZXJmYWNlVHlwZSh7XG4gIG5hbWU6ICdQYXJzZU9iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUGFyc2VPYmplY3QgaW50ZXJmYWNlIHR5cGUgaXMgdXNlZCBhcyBhIGJhc2UgdHlwZSBmb3IgdGhlIGF1dG8gZ2VuZXJhdGVkIG9iamVjdCB0eXBlcy4nLFxuICBmaWVsZHM6IFBBUlNFX09CSkVDVF9GSUVMRFMsXG59KTtcblxuY29uc3QgU0VTU0lPTl9UT0tFTl9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIGN1cnJlbnQgdXNlciBzZXNzaW9uIHRva2VuLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICBuYW1lOiAnUmVhZFByZWZlcmVuY2UnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFJlYWRQcmVmZXJlbmNlIGVudW0gdHlwZSBpcyB1c2VkIGluIHF1ZXJpZXMgaW4gb3JkZXIgdG8gc2VsZWN0IGluIHdoaWNoIGRhdGFiYXNlIHJlcGxpY2EgdGhlIG9wZXJhdGlvbiBtdXN0IHJ1bi4nLFxuICB2YWx1ZXM6IHtcbiAgICBQUklNQVJZOiB7IHZhbHVlOiAnUFJJTUFSWScgfSxcbiAgICBQUklNQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1BSSU1BUllfUFJFRkVSUkVEJyB9LFxuICAgIFNFQ09OREFSWTogeyB2YWx1ZTogJ1NFQ09OREFSWScgfSxcbiAgICBTRUNPTkRBUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnU0VDT05EQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBORUFSRVNUOiB7IHZhbHVlOiAnTkVBUkVTVCcgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBtYWluIHF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgcXVlcmllcyB0byBiZSBleGVjdXRlZCB0byBpbmNsdWRlIGZpZWxkcy4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBzdWJxdWVyaWVzIHRoYXQgbWF5IGJlIHJlcXVpcmVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFJFQURfT1BUSU9OU19JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JlYWRPcHRpb25zSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFJlYWRPcHRpb25zSW5wdXR0IHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNldCB0aGUgcmVhZCBwcmVmZXJlbmNlcy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkUHJlZmVyZW5jZTogUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlOiBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfT1BUSU9OU19BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgb3B0aW9ucyBmb3IgdGhlIHF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gIHR5cGU6IFJFQURfT1BUSU9OU19JTlBVVCxcbn07XG5cbmNvbnN0IFdIRVJFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgU0tJUF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHNraXBwZWQgdG8gcmV0dXJuLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBMSU1JVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGltaXQgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHJldHVybmVkLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBDT1VOVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSB0b3RhbCBtYXRjaGVkIG9iamVjcyBjb3VudCB0aGF0IGlzIHJldHVybmVkIHdoZW4gdGhlIGNvdW50IGZsYWcgaXMgc2V0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSW50KSxcbn07XG5cbmNvbnN0IFNFQVJDSF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1NlYXJjaElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgU2VhcmNoSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgc2VhcmNoIG9wZXJhdGlvbiBvbiBhIGZ1bGwgdGV4dCBzZWFyY2guJyxcbiAgZmllbGRzOiB7XG4gICAgdGVybToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB0ZXJtIHRvIGJlIHNlYXJjaGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICBsYW5ndWFnZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBsYW5ndWFnZSB0byB0ZXRlcm1pbmUgdGhlIGxpc3Qgb2Ygc3RvcCB3b3JkcyBhbmQgdGhlIHJ1bGVzIGZvciB0b2tlbml6ZXIuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBjYXNlU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgY2FzZSBzZW5zaXRpdmUgc2VhcmNoLicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIGRpYWNyaXRpY1NlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGRpYWNyaXRpYyBzZW5zaXRpdmUgc2VhcmNoLicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFRFWFRfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdUZXh0SW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBUZXh0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB0ZXh0IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgc2VhcmNoOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNlYXJjaCB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNFQVJDSF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT1hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb3hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEJveElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIGJveCBvcGVyYXRpb24gb24gYSB3aXRoaW4gZ2VvIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGJvdHRvbUxlZnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm90dG9tIGxlZnQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICB1cHBlclJpZ2h0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwcGVyIHJpZ2h0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBXaXRoaW5JbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHdpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIGJveDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3ggdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQk9YX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IENFTlRFUl9TUEhFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdDZW50ZXJTcGhlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQ2VudGVyU3BoZXJlSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgY2VudGVyU3BoZXJlIG9wZXJhdGlvbiBvbiBhIGdlb1dpdGhpbiBxdWVyeS4nLFxuICBmaWVsZHM6IHtcbiAgICBjZW50ZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY2VudGVyIG9mIHRoZSBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gICAgZGlzdGFuY2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcmFkaXVzIG9mIHRoZSBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1dJVEhJTl9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1dpdGhpbklucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgR2VvV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9XaXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBwb2x5Z29uOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvbHlnb24gdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBQT0xZR09OX0lOUFVULFxuICAgIH0sXG4gICAgY2VudGVyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNwaGVyZSB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IENFTlRFUl9TUEhFUkVfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fSU5URVJTRUNUU19JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb0ludGVyc2VjdHNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvSW50ZXJzZWN0c0lucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgZ2VvSW50ZXJzZWN0cyBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvaW50OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvaW50IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5UX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgZXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IG5vdEVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBpbk9wID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyBhbnkgdmFsdWUgaW4gdGhlIHNwZWNpZmllZCBhcnJheS4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG59KTtcblxuY29uc3Qgbm90SW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBleGlzdHMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBleGlzdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXhpc3RzIChvciBkbyBub3QgZXhpc3QpLicsXG4gIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxufTtcblxuY29uc3QgbWF0Y2hlc1JlZ2V4ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbWF0Y2hlc1JlZ2V4IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBtYXRjaGVzIGEgc3BlY2lmaWVkIHJlZ3VsYXIgZXhwcmVzc2lvbi4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3Qgb3B0aW9ucyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG9wdGlvbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBvcHRpb25hbCBmbGFncyAoc3VjaCBhcyBcImlcIiBhbmQgXCJtXCIpIHRvIGJlIGFkZGVkIHRvIGEgbWF0Y2hlc1JlZ2V4IG9wZXJhdGlvbiBpbiB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3VicXVlcnlJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFN1YnF1ZXJ5SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBzdWIgcXVlcnkgdG8gYW5vdGhlciBjbGFzcy4nLFxuICBmaWVsZHM6IHtcbiAgICBjbGFzc05hbWU6IENMQVNTX05BTUVfQVRULFxuICAgIHdoZXJlOiBPYmplY3QuYXNzaWduKHt9LCBXSEVSRV9BVFQsIHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChXSEVSRV9BVFQudHlwZSksXG4gICAgfSksXG4gIH0sXG59KTtcblxuY29uc3QgU0VMRUNUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VsZWN0SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNlbGVjdElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGFuIGluUXVlcnlLZXkgb3IgYSBub3RJblF1ZXJ5S2V5IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcXVlcnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3VicXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChTVUJRVUVSWV9JTlBVVCksXG4gICAgfSxcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUga2V5IGluIHRoZSByZXN1bHQgb2YgdGhlIHN1YnF1ZXJ5IHRoYXQgbXVzdCBtYXRjaCAobm90IG1hdGNoKSB0aGUgZmllbGQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IGluUXVlcnlLZXkgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBpblF1ZXJ5S2V5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9JTlBVVCxcbn07XG5cbmNvbnN0IG5vdEluUXVlcnlLZXkgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJblF1ZXJ5S2V5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9JTlBVVCxcbn07XG5cbmNvbnN0IElEX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnSWRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBJZFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGFuIGlkLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxJRCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxJRCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgaW46IGluT3AoR3JhcGhRTElEKSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTElEKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IFNUUklOR19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N0cmluZ1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFN0cmluZ1doZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBTdHJpbmcuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMU3RyaW5nKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBpbjogaW5PcChHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTFN0cmluZyksXG4gICAgZXhpc3RzLFxuICAgIG1hdGNoZXNSZWdleCxcbiAgICBvcHRpb25zLFxuICAgIHRleHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJHRleHQgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGZ1bGwgdGV4dCBzZWFyY2ggY29uc3RyYWludC4nLFxuICAgICAgdHlwZTogVEVYVF9JTlBVVCxcbiAgICB9LFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBOVU1CRVJfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdOdW1iZXJXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBOdW1iZXJXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgTnVtYmVyLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgaW46IGluT3AoR3JhcGhRTEZsb2F0KSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTEZsb2F0KSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPT0xFQU5fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb29sZWFuV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm9vbGVhbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCb29sZWFuLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQVJSQVlfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBcnJheVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFycmF5V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEFycmF5LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQU5ZKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEFOWSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEFOWSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEFOWSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgaW46IGluT3AoQU5ZKSxcbiAgICBub3RJbjogbm90SW4oQU5ZKSxcbiAgICBleGlzdHMsXG4gICAgY29udGFpbmVkQnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbmVkQnkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgaXMgY29udGFpbmVkIGJ5IGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICAgIGNvbnRhaW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGNvbnRhaW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGNvbnRhaW4gYWxsIGVsZW1lbnRzIG9mIGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBLRVlfVkFMVUVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdLZXlWYWx1ZUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbiBlbnRyeSBmcm9tIGFuIG9iamVjdCwgaS5lLiwgYSBwYWlyIG9mIGtleSBhbmQgdmFsdWUuJyxcbiAgZmllbGRzOiB7XG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBrZXkgdXNlZCB0byByZXRyaWV2ZSB0aGUgdmFsdWUgb2YgdGhpcyBlbnRyeS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgdmFsdWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIHZhbHVlIG9mIHRoZSBlbnRyeS4gQ291bGQgYmUgYW55IHR5cGUgb2Ygc2NhbGFyIGRhdGEuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnT2JqZWN0V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIHJlc3VsdCBieSBhIGZpZWxkIG9mIHR5cGUgT2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgaW46IGluT3AoS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RJbjogbm90SW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IERBVEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdEYXRlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBEYXRlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oREFURSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhEQVRFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oREFURSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihEQVRFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oREFURSksXG4gICAgaW46IGluT3AoREFURSksXG4gICAgbm90SW46IG5vdEluKERBVEUpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQllURVNfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCeXRlc1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJ5dGVzLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQllURVMpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQllURVMpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihCWVRFUyksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhCWVRFUyksXG4gICAgaW46IGluT3AoQllURVMpLFxuICAgIG5vdEluOiBub3RJbihCWVRFUyksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGVXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRmlsZS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEZJTEUpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oRklMRSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEZJTEUpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhGSUxFKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oRklMRSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGluOiBpbk9wKEZJTEUpLFxuICAgIG5vdEluOiBub3RJbihGSUxFKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgR2VvUG9pbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXhpc3RzLFxuICAgIG5lYXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbmVhclNwaGVyZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBuZWFyIHRvIGFub3RoZXIgZ2VvIHBvaW50LicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5SYWRpYW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5SYWRpYW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJbk1pbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5NaWxlcyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gbWlsZXMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluS2lsb21ldGVyczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluS2lsb21ldGVycyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4ga2lsb21ldGVycykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIHdpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSB3aXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIGJveC4nLFxuICAgICAgdHlwZTogV0lUSElOX0lOUFVULFxuICAgIH0sXG4gICAgZ2VvV2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb1dpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgcG9seWdvbiBvciBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IEdFT19XSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQT0xZR09OX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUG9seWdvbldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBvbHlnb25XaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgUG9seWdvbi4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgZ2VvSW50ZXJzZWN0czoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBnZW9JbnRlcnNlY3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgcG9seWdvbiBmaWVsZCBpbnRlcnNlY3QgYSBzcGVjaWZpZWQgcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19JTlRFUlNFQ1RTX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgRUxFTUVOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdFbGVtZW50JyxcbiAgZGVzY3JpcHRpb246IFwiVGhlIEVsZW1lbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gYXJyYXkgaXRlbXMnIHZhbHVlLlwiLFxuICBmaWVsZHM6IHtcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdSZXR1cm4gdGhlIHZhbHVlIG9mIHRoZSBlbGVtZW50IGluIHRoZSBhcnJheScsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQU5ZKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbi8vIERlZmF1bHQgc3RhdGljIHVuaW9uIHR5cGUsIHdlIHVwZGF0ZSB0eXBlcyBhbmQgcmVzb2x2ZVR5cGUgZnVuY3Rpb24gbGF0ZXJcbmxldCBBUlJBWV9SRVNVTFQ7XG5cbmNvbnN0IGxvYWRBcnJheVJlc3VsdCA9IChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3NlcykgPT4ge1xuICBjb25zdCBjbGFzc1R5cGVzID0gcGFyc2VDbGFzc2VzXG4gICAgLmZpbHRlcihwYXJzZUNsYXNzID0+XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlID8gdHJ1ZSA6IGZhbHNlXG4gICAgKVxuICAgIC5tYXAoXG4gICAgICBwYXJzZUNsYXNzID0+IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5jbGFzc05hbWVdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICApO1xuICBBUlJBWV9SRVNVTFQgPSBuZXcgR3JhcGhRTFVuaW9uVHlwZSh7XG4gICAgbmFtZTogJ0FycmF5UmVzdWx0JyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHMnLFxuICAgIHR5cGVzOiAoKSA9PiBbRUxFTUVOVCwgLi4uY2xhc3NUeXBlc10sXG4gICAgcmVzb2x2ZVR5cGU6IHZhbHVlID0+IHtcbiAgICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdPYmplY3QnICYmIHZhbHVlLmNsYXNzTmFtZSAmJiB2YWx1ZS5vYmplY3RJZCkge1xuICAgICAgICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBFTEVNRU5UO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gRUxFTUVOVDtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFSUkFZX1JFU1VMVCk7XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdyYXBoUUxVcGxvYWQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQU5ZLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9JTkZPLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQQVJTRV9PQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9QUkVGRVJFTkNFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfT1BUSU9OU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUFSQ0hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVEVYVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT1hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENFTlRFUl9TUEhFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1dJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fSU5URVJTRUNUU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShJRF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVFJJTkdfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoTlVNQkVSX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPT0xFQU5fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQVJSQVlfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoS0VZX1ZBTFVFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBPTFlHT05fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRUxFTUVOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVUJRVUVSWV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUxFQ1RfSU5QVVQsIHRydWUpO1xufTtcblxuZXhwb3J0IHtcbiAgVHlwZVZhbGlkYXRpb25FcnJvcixcbiAgcGFyc2VTdHJpbmdWYWx1ZSxcbiAgcGFyc2VJbnRWYWx1ZSxcbiAgcGFyc2VGbG9hdFZhbHVlLFxuICBwYXJzZUJvb2xlYW5WYWx1ZSxcbiAgcGFyc2VWYWx1ZSxcbiAgcGFyc2VMaXN0VmFsdWVzLFxuICBwYXJzZU9iamVjdEZpZWxkcyxcbiAgQU5ZLFxuICBPQkpFQ1QsXG4gIHBhcnNlRGF0ZUlzb1ZhbHVlLFxuICBzZXJpYWxpemVEYXRlSXNvLFxuICBEQVRFLFxuICBCWVRFUyxcbiAgcGFyc2VGaWxlVmFsdWUsXG4gIFNVQlFVRVJZX0lOUFVULFxuICBTRUxFQ1RfSU5QVVQsXG4gIEZJTEUsXG4gIEZJTEVfSU5GTyxcbiAgRklMRV9JTlBVVCxcbiAgR0VPX1BPSU5UX0ZJRUxEUyxcbiAgR0VPX1BPSU5UX0lOUFVULFxuICBHRU9fUE9JTlQsXG4gIFBPTFlHT05fSU5QVVQsXG4gIFBPTFlHT04sXG4gIE9CSkVDVF9JRCxcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICBPQkpFQ1RfSURfQVRULFxuICBVUERBVEVEX0FUX0FUVCxcbiAgQ1JFQVRFRF9BVF9BVFQsXG4gIElOUFVUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFVQREFURV9SRVNVTFRfRklFTERTLFxuICBQQVJTRV9PQkpFQ1RfRklFTERTLFxuICBQQVJTRV9PQkpFQ1QsXG4gIFNFU1NJT05fVE9LRU5fQVRULFxuICBSRUFEX1BSRUZFUkVOQ0UsXG4gIFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gIElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgUkVBRF9PUFRJT05TX0lOUFVULFxuICBSRUFEX09QVElPTlNfQVRULFxuICBXSEVSRV9BVFQsXG4gIFNLSVBfQVRULFxuICBMSU1JVF9BVFQsXG4gIENPVU5UX0FUVCxcbiAgU0VBUkNIX0lOUFVULFxuICBURVhUX0lOUFVULFxuICBCT1hfSU5QVVQsXG4gIFdJVEhJTl9JTlBVVCxcbiAgQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgR0VPX1dJVEhJTl9JTlBVVCxcbiAgR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gIGVxdWFsVG8sXG4gIG5vdEVxdWFsVG8sXG4gIGxlc3NUaGFuLFxuICBsZXNzVGhhbk9yRXF1YWxUbyxcbiAgZ3JlYXRlclRoYW4sXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvLFxuICBpbk9wLFxuICBub3RJbixcbiAgZXhpc3RzLFxuICBtYXRjaGVzUmVnZXgsXG4gIG9wdGlvbnMsXG4gIGluUXVlcnlLZXksXG4gIG5vdEluUXVlcnlLZXksXG4gIElEX1dIRVJFX0lOUFVULFxuICBTVFJJTkdfV0hFUkVfSU5QVVQsXG4gIE5VTUJFUl9XSEVSRV9JTlBVVCxcbiAgQk9PTEVBTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfV0hFUkVfSU5QVVQsXG4gIEtFWV9WQUxVRV9JTlBVVCxcbiAgT0JKRUNUX1dIRVJFX0lOUFVULFxuICBEQVRFX1dIRVJFX0lOUFVULFxuICBCWVRFU19XSEVSRV9JTlBVVCxcbiAgRklMRV9XSEVSRV9JTlBVVCxcbiAgR0VPX1BPSU5UX1dIRVJFX0lOUFVULFxuICBQT0xZR09OX1dIRVJFX0lOUFVULFxuICBBUlJBWV9SRVNVTFQsXG4gIEVMRU1FTlQsXG4gIEFDTF9JTlBVVCxcbiAgVVNFUl9BQ0xfSU5QVVQsXG4gIFJPTEVfQUNMX0lOUFVULFxuICBQVUJMSUNfQUNMX0lOUFVULFxuICBBQ0wsXG4gIFVTRVJfQUNMLFxuICBST0xFX0FDTCxcbiAgUFVCTElDX0FDTCxcbiAgbG9hZCxcbiAgbG9hZEFycmF5UmVzdWx0LFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBZ0JBLElBQUFDLGFBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLE1BQUEsR0FBQUYsT0FBQTtBQUFxRCxTQUFBRyxRQUFBQyxNQUFBLEVBQUFDLGNBQUEsUUFBQUMsSUFBQSxHQUFBQyxNQUFBLENBQUFELElBQUEsQ0FBQUYsTUFBQSxPQUFBRyxNQUFBLENBQUFDLHFCQUFBLFFBQUFDLE9BQUEsR0FBQUYsTUFBQSxDQUFBQyxxQkFBQSxDQUFBSixNQUFBLEdBQUFDLGNBQUEsS0FBQUksT0FBQSxHQUFBQSxPQUFBLENBQUFDLE1BQUEsV0FBQUMsR0FBQSxXQUFBSixNQUFBLENBQUFLLHdCQUFBLENBQUFSLE1BQUEsRUFBQU8sR0FBQSxFQUFBRSxVQUFBLE9BQUFQLElBQUEsQ0FBQVEsSUFBQSxDQUFBQyxLQUFBLENBQUFULElBQUEsRUFBQUcsT0FBQSxZQUFBSCxJQUFBO0FBQUEsU0FBQVUsY0FBQUMsTUFBQSxh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