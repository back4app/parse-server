"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GLOBAL_OR_OBJECT_ID_ATT = exports.GEO_WITHIN_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.GEO_POINT = exports.GEO_INTERSECTS_INPUT = exports.FILE_WHERE_INPUT = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.ELEMENT = exports.DATE_WHERE_INPUT = exports.DATE = exports.CREATE_RESULT_FIELDS = exports.CREATED_AT_ATT = exports.COUNT_ATT = exports.CLASS_NAME_ATT = exports.CENTER_SPHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.BYTES = exports.BOX_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.ARRAY_WHERE_INPUT = exports.ARRAY_RESULT = exports.ANY = exports.ACL_INPUT = exports.ACL = void 0;
Object.defineProperty(exports, "GraphQLUpload", {
  enumerable: true,
  get: function () {
    return _GraphQLUpload.default;
  }
});
exports.serializeDateIso = exports.parseValue = exports.parseStringValue = exports.parseObjectFields = exports.parseListValues = exports.parseIntValue = exports.parseFloatValue = exports.parseFileValue = exports.parseDateIsoValue = exports.parseBooleanValue = exports.options = exports.notInQueryKey = exports.notIn = exports.notEqualTo = exports.matchesRegex = exports.loadArrayResult = exports.load = exports.lessThanOrEqualTo = exports.lessThan = exports.inQueryKey = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.exists = exports.equalTo = exports.WITHIN_INPUT = exports.WHERE_ATT = exports.USER_ACL_INPUT = exports.USER_ACL = exports.UPDATE_RESULT_FIELDS = exports.UPDATED_AT_ATT = exports.TypeValidationError = exports.TEXT_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.SUBQUERY_INPUT = exports.STRING_WHERE_INPUT = exports.SKIP_ATT = exports.SESSION_TOKEN_ATT = exports.SELECT_INPUT = exports.SEARCH_INPUT = exports.ROLE_ACL_INPUT = exports.ROLE_ACL = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.READ_OPTIONS_INPUT = exports.READ_OPTIONS_ATT = exports.PUBLIC_ACL_INPUT = exports.PUBLIC_ACL = exports.POLYGON_WHERE_INPUT = exports.POLYGON_INPUT = exports.POLYGON = exports.PARSE_OBJECT_FIELDS = exports.PARSE_OBJECT = exports.OBJECT_WHERE_INPUT = exports.OBJECT_ID_ATT = exports.OBJECT_ID = exports.OBJECT = exports.NUMBER_WHERE_INPUT = exports.LIMIT_ATT = exports.KEY_VALUE_INPUT = exports.INPUT_FIELDS = exports.INCLUDE_READ_PREFERENCE_ATT = exports.ID_WHERE_INPUT = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _GraphQLUpload = _interopRequireDefault(require("graphql-upload/GraphQLUpload.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
    return fields.reduce((object, field) => ({
      ...object,
      [field.name.value]: parseValue(field.value)
    }), {});
  }
  throw new TypeValidationError(fields, 'Object');
};
exports.parseObjectFields = parseObjectFields;
const ANY = exports.ANY = new _graphql.GraphQLScalarType({
  name: 'Any',
  description: 'The Any scalar type is used in operations and types that involve any type of value.',
  parseValue: value => value,
  serialize: value => value,
  parseLiteral: ast => parseValue(ast)
});
const OBJECT = exports.OBJECT = new _graphql.GraphQLScalarType({
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
const DATE = exports.DATE = new _graphql.GraphQLScalarType({
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
const BYTES = exports.BYTES = new _graphql.GraphQLScalarType({
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
const FILE = exports.FILE = new _graphql.GraphQLScalarType({
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
const FILE_INFO = exports.FILE_INFO = new _graphql.GraphQLObjectType({
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
const FILE_INPUT = exports.FILE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  description: 'If this field is set to null the file will be unlinked (the file will not be deleted on cloud storage).',
  fields: {
    file: {
      description: 'A File Scalar can be an url or a FileInfo object.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: _GraphQLUpload.default
    }
  }
});
const GEO_POINT_FIELDS = exports.GEO_POINT_FIELDS = {
  latitude: {
    description: 'This is the latitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  },
  longitude: {
    description: 'This is the longitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  }
};
const GEO_POINT_INPUT = exports.GEO_POINT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointInput',
  description: 'The GeoPointInput type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS
});
const GEO_POINT = exports.GEO_POINT = new _graphql.GraphQLObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS
});
const POLYGON_INPUT = exports.POLYGON_INPUT = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT_INPUT));
const POLYGON = exports.POLYGON = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT));
const USER_ACL_INPUT = exports.USER_ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
const ROLE_ACL_INPUT = exports.ROLE_ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
const PUBLIC_ACL_INPUT = exports.PUBLIC_ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
const ACL_INPUT = exports.ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
const USER_ACL = exports.USER_ACL = new _graphql.GraphQLObjectType({
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
const ROLE_ACL = exports.ROLE_ACL = new _graphql.GraphQLObjectType({
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
const PUBLIC_ACL = exports.PUBLIC_ACL = new _graphql.GraphQLObjectType({
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
const ACL = exports.ACL = new _graphql.GraphQLObjectType({
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
const OBJECT_ID = exports.OBJECT_ID = new _graphql.GraphQLNonNull(_graphql.GraphQLID);
const CLASS_NAME_ATT = exports.CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
const GLOBAL_OR_OBJECT_ID_ATT = exports.GLOBAL_OR_OBJECT_ID_ATT = {
  description: 'This is the object id. You can use either the global or the object id.',
  type: OBJECT_ID
};
const OBJECT_ID_ATT = exports.OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID
};
const CREATED_AT_ATT = exports.CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new _graphql.GraphQLNonNull(DATE)
};
const UPDATED_AT_ATT = exports.UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new _graphql.GraphQLNonNull(DATE)
};
const INPUT_FIELDS = exports.INPUT_FIELDS = {
  ACL: {
    type: ACL
  }
};
const CREATE_RESULT_FIELDS = exports.CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
const UPDATE_RESULT_FIELDS = exports.UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
const PARSE_OBJECT_FIELDS = exports.PARSE_OBJECT_FIELDS = {
  ...CREATE_RESULT_FIELDS,
  ...UPDATE_RESULT_FIELDS,
  ...INPUT_FIELDS,
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
};
const PARSE_OBJECT = exports.PARSE_OBJECT = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  description: 'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS
});
const SESSION_TOKEN_ATT = exports.SESSION_TOKEN_ATT = {
  description: 'The current user session token.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
const READ_PREFERENCE = exports.READ_PREFERENCE = new _graphql.GraphQLEnumType({
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
const READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed.',
  type: READ_PREFERENCE
};
const INCLUDE_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = {
  description: 'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE
};
const SUBQUERY_READ_PREFERENCE_ATT = exports.SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE
};
const READ_OPTIONS_INPUT = exports.READ_OPTIONS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ReadOptionsInput',
  description: 'The ReadOptionsInputt type is used in queries in order to set the read preferences.',
  fields: {
    readPreference: READ_PREFERENCE_ATT,
    includeReadPreference: INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: SUBQUERY_READ_PREFERENCE_ATT
  }
});
const READ_OPTIONS_ATT = exports.READ_OPTIONS_ATT = {
  description: 'The read options for the query to be executed.',
  type: READ_OPTIONS_INPUT
};
const WHERE_ATT = exports.WHERE_ATT = {
  description: 'These are the conditions that the objects need to match in order to be found',
  type: OBJECT
};
const SKIP_ATT = exports.SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return.',
  type: _graphql.GraphQLInt
};
const LIMIT_ATT = exports.LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned.',
  type: _graphql.GraphQLInt
};
const COUNT_ATT = exports.COUNT_ATT = {
  description: 'This is the total matched objecs count that is returned when the count flag is set.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
};
const SEARCH_INPUT = exports.SEARCH_INPUT = new _graphql.GraphQLInputObjectType({
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
const TEXT_INPUT = exports.TEXT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a text operation on a constraint.',
  fields: {
    search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_INPUT)
    }
  }
});
const BOX_INPUT = exports.BOX_INPUT = new _graphql.GraphQLInputObjectType({
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
const WITHIN_INPUT = exports.WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'WithinInput',
  description: 'The WithinInput type is used to specify a within operation on a constraint.',
  fields: {
    box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_INPUT)
    }
  }
});
const CENTER_SPHERE_INPUT = exports.CENTER_SPHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const GEO_WITHIN_INPUT = exports.GEO_WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
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
const GEO_INTERSECTS_INPUT = exports.GEO_INTERSECTS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description: 'The GeoIntersectsInput type is used to specify a geoIntersects operation on a constraint.',
  fields: {
    point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT
    }
  }
});
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
const exists = exports.exists = {
  description: 'This is the exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: _graphql.GraphQLBoolean
};
const matchesRegex = exports.matchesRegex = {
  description: 'This is the matchesRegex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: _graphql.GraphQLString
};
const options = exports.options = {
  description: 'This is the options operator to specify optional flags (such as "i" and "m") to be added to a matchesRegex operation in the same set of constraints.',
  type: _graphql.GraphQLString
};
const SUBQUERY_INPUT = exports.SUBQUERY_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SubqueryInput',
  description: 'The SubqueryInput type is used to specify a sub query to another class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new _graphql.GraphQLNonNull(WHERE_ATT.type)
    })
  }
});
const SELECT_INPUT = exports.SELECT_INPUT = new _graphql.GraphQLInputObjectType({
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
const inQueryKey = exports.inQueryKey = {
  description: 'This is the inQueryKey operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT
};
const notInQueryKey = exports.notInQueryKey = {
  description: 'This is the notInQueryKey operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT
};
const ID_WHERE_INPUT = exports.ID_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const STRING_WHERE_INPUT = exports.STRING_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const NUMBER_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const BOOLEAN_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const ARRAY_WHERE_INPUT = exports.ARRAY_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const KEY_VALUE_INPUT = exports.KEY_VALUE_INPUT = new _graphql.GraphQLInputObjectType({
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
const OBJECT_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const DATE_WHERE_INPUT = exports.DATE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const BYTES_WHERE_INPUT = exports.BYTES_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const FILE_WHERE_INPUT = exports.FILE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const GEO_POINT_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const POLYGON_WHERE_INPUT = exports.POLYGON_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
const ELEMENT = exports.ELEMENT = new _graphql.GraphQLObjectType({
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
let ARRAY_RESULT = exports.ARRAY_RESULT = void 0;
const loadArrayResult = (parseGraphQLSchema, parseClassesArray) => {
  const classTypes = parseClassesArray.filter(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false).map(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType);
  exports.ARRAY_RESULT = ARRAY_RESULT = new _graphql.GraphQLUnionType({
    name: 'ArrayResult',
    description: 'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className].classGraphQLOutputType.name;
        } else {
          return ELEMENT.name;
        }
      } else {
        return ELEMENT.name;
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};
exports.loadArrayResult = loadArrayResult;
const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(_GraphQLUpload.default, true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX0dyYXBoUUxVcGxvYWQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiVHlwZVZhbGlkYXRpb25FcnJvciIsIkVycm9yIiwiY29uc3RydWN0b3IiLCJ2YWx1ZSIsInR5cGUiLCJleHBvcnRzIiwicGFyc2VTdHJpbmdWYWx1ZSIsInBhcnNlSW50VmFsdWUiLCJpbnQiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJwYXJzZUZsb2F0VmFsdWUiLCJmbG9hdCIsImlzTmFOIiwicGFyc2VCb29sZWFuVmFsdWUiLCJwYXJzZVZhbHVlIiwia2luZCIsIktpbmQiLCJTVFJJTkciLCJJTlQiLCJGTE9BVCIsIkJPT0xFQU4iLCJMSVNUIiwicGFyc2VMaXN0VmFsdWVzIiwidmFsdWVzIiwiT0JKRUNUIiwicGFyc2VPYmplY3RGaWVsZHMiLCJmaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJtYXAiLCJyZWR1Y2UiLCJvYmplY3QiLCJmaWVsZCIsIm5hbWUiLCJBTlkiLCJHcmFwaFFMU2NhbGFyVHlwZSIsImRlc2NyaXB0aW9uIiwic2VyaWFsaXplIiwicGFyc2VMaXRlcmFsIiwiYXN0IiwicGFyc2VEYXRlSXNvVmFsdWUiLCJkYXRlIiwiRGF0ZSIsInNlcmlhbGl6ZURhdGVJc28iLCJ0b0lTT1N0cmluZyIsInBhcnNlRGF0ZUlzb0xpdGVyYWwiLCJEQVRFIiwiX190eXBlIiwiaXNvIiwiZmluZCIsIkJZVEVTIiwiYmFzZTY0IiwicGFyc2VGaWxlVmFsdWUiLCJ1cmwiLCJ1bmRlZmluZWQiLCJGSUxFIiwiRklMRV9JTkZPIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkdyYXBoUUxTdHJpbmciLCJGSUxFX0lOUFVUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsImZpbGUiLCJ1cGxvYWQiLCJHcmFwaFFMVXBsb2FkIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UX0lOUFVUIiwiR0VPX1BPSU5UIiwiUE9MWUdPTl9JTlBVVCIsIkdyYXBoUUxMaXN0IiwiUE9MWUdPTiIsIlVTRVJfQUNMX0lOUFVUIiwidXNlcklkIiwiR3JhcGhRTElEIiwicmVhZCIsIkdyYXBoUUxCb29sZWFuIiwid3JpdGUiLCJST0xFX0FDTF9JTlBVVCIsInJvbGVOYW1lIiwiUFVCTElDX0FDTF9JTlBVVCIsIkFDTF9JTlBVVCIsInVzZXJzIiwicm9sZXMiLCJwdWJsaWMiLCJVU0VSX0FDTCIsIlJPTEVfQUNMIiwiUFVCTElDX0FDTCIsIkFDTCIsInJlc29sdmUiLCJwIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJydWxlIiwiaW5kZXhPZiIsInB1c2giLCJ0b0dsb2JhbElkIiwibGVuZ3RoIiwicmVwbGFjZSIsIk9CSkVDVF9JRCIsIkNMQVNTX05BTUVfQVRUIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJPQkpFQ1RfSURfQVRUIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwib2JqZWN0SWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwiVEVYVF9JTlBVVCIsInNlYXJjaCIsIkJPWF9JTlBVVCIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiV0lUSElOX0lOUFVUIiwiYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJHRU9fSU5URVJTRUNUU19JTlBVVCIsInBvaW50IiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJsZXNzVGhhbiIsImxlc3NUaGFuT3JFcXVhbFRvIiwiZ3JlYXRlclRoYW4iLCJncmVhdGVyVGhhbk9yRXF1YWxUbyIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsIm1hdGNoZXNSZWdleCIsIm9wdGlvbnMiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJrZXkiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsIklEX1dIRVJFX0lOUFVUIiwiaW4iLCJTVFJJTkdfV0hFUkVfSU5QVVQiLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzQXJyYXkiLCJjbGFzc1R5cGVzIiwiZmlsdGVyIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMVW5pb25UeXBlIiwidHlwZXMiLCJyZXNvbHZlVHlwZSIsImdyYXBoUUxUeXBlcyIsImxvYWQiLCJhZGRHcmFwaFFMVHlwZSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTFNjYWxhclR5cGUsXG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxJbnRlcmZhY2VUeXBlLFxuICBHcmFwaFFMRW51bVR5cGUsXG4gIEdyYXBoUUxJbnQsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMVW5pb25UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHRvR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBHcmFwaFFMVXBsb2FkIGZyb20gJ2dyYXBocWwtdXBsb2FkL0dyYXBoUUxVcGxvYWQuanMnO1xuXG5jbGFzcyBUeXBlVmFsaWRhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih2YWx1ZSwgdHlwZSkge1xuICAgIHN1cGVyKGAke3ZhbHVlfSBpcyBub3QgYSB2YWxpZCAke3R5cGV9YCk7XG4gIH1cbn1cblxuY29uc3QgcGFyc2VTdHJpbmdWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ1N0cmluZycpO1xufTtcblxuY29uc3QgcGFyc2VJbnRWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBpbnQgPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmIChOdW1iZXIuaXNJbnRlZ2VyKGludCkpIHtcbiAgICAgIHJldHVybiBpbnQ7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdJbnQnKTtcbn07XG5cbmNvbnN0IHBhcnNlRmxvYXRWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBmbG9hdCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKCFpc05hTihmbG9hdCkpIHtcbiAgICAgIHJldHVybiBmbG9hdDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Zsb2F0Jyk7XG59O1xuXG5jb25zdCBwYXJzZUJvb2xlYW5WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCb29sZWFuJyk7XG59O1xuXG5jb25zdCBwYXJzZVZhbHVlID0gdmFsdWUgPT4ge1xuICBzd2l0Y2ggKHZhbHVlLmtpbmQpIHtcbiAgICBjYXNlIEtpbmQuU1RSSU5HOlxuICAgICAgcmV0dXJuIHBhcnNlU3RyaW5nVmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLklOVDpcbiAgICAgIHJldHVybiBwYXJzZUludFZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5GTE9BVDpcbiAgICAgIHJldHVybiBwYXJzZUZsb2F0VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkJPT0xFQU46XG4gICAgICByZXR1cm4gcGFyc2VCb29sZWFuVmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkxJU1Q6XG4gICAgICByZXR1cm4gcGFyc2VMaXN0VmFsdWVzKHZhbHVlLnZhbHVlcyk7XG5cbiAgICBjYXNlIEtpbmQuT0JKRUNUOlxuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKHZhbHVlLmZpZWxkcyk7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHZhbHVlLnZhbHVlO1xuICB9XG59O1xuXG5jb25zdCBwYXJzZUxpc3RWYWx1ZXMgPSB2YWx1ZXMgPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB7XG4gICAgcmV0dXJuIHZhbHVlcy5tYXAodmFsdWUgPT4gcGFyc2VWYWx1ZSh2YWx1ZSkpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWVzLCAnTGlzdCcpO1xufTtcblxuY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSBmaWVsZHMgPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZHMpKSB7XG4gICAgcmV0dXJuIGZpZWxkcy5yZWR1Y2UoXG4gICAgICAob2JqZWN0LCBmaWVsZCkgPT4gKHtcbiAgICAgICAgLi4ub2JqZWN0LFxuICAgICAgICBbZmllbGQubmFtZS52YWx1ZV06IHBhcnNlVmFsdWUoZmllbGQudmFsdWUpLFxuICAgICAgfSksXG4gICAgICB7fVxuICAgICk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihmaWVsZHMsICdPYmplY3QnKTtcbn07XG5cbmNvbnN0IEFOWSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdBbnknLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFueSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBhbnkgdHlwZSBvZiB2YWx1ZS4nLFxuICBwYXJzZVZhbHVlOiB2YWx1ZSA9PiB2YWx1ZSxcbiAgc2VyaWFsaXplOiB2YWx1ZSA9PiB2YWx1ZSxcbiAgcGFyc2VMaXRlcmFsOiBhc3QgPT4gcGFyc2VWYWx1ZShhc3QpLFxufSk7XG5cbmNvbnN0IE9CSkVDVCA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdPYmplY3QnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBPYmplY3Qgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgb2JqZWN0cy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnT2JqZWN0Jyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHMoYXN0LmZpZWxkcyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdPYmplY3QnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZURhdGVJc29WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZGF0ZSkpIHtcbiAgICAgIHJldHVybiBkYXRlO1xuICAgIH1cbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHNlcmlhbGl6ZURhdGVJc28gPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWUudG9JU09TdHJpbmcoKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xufTtcblxuY29uc3QgcGFyc2VEYXRlSXNvTGl0ZXJhbCA9IGFzdCA9PiB7XG4gIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICByZXR1cm4gcGFyc2VEYXRlSXNvVmFsdWUoYXN0LnZhbHVlKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xufTtcblxuY29uc3QgREFURSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdEYXRlJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgRGF0ZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBkYXRlcy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZSksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJiB2YWx1ZS5pc28pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogdmFsdWUuX190eXBlLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb1ZhbHVlKHZhbHVlLmlzbyksXG4gICAgICB9O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnRGF0ZScgJiYgdmFsdWUuaXNvKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZS5pc28pO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChhc3QpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGlzbyA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnaXNvJyk7XG4gICAgICBpZiAoX190eXBlICYmIF9fdHlwZS52YWx1ZSAmJiBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdEYXRlJyAmJiBpc28pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBpc286IHBhcnNlRGF0ZUlzb0xpdGVyYWwoaXNvLnZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFUyA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdCeXRlcycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXMgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgYmFzZSA2NCBiaW5hcnkgZGF0YS4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgICAgYmFzZTY0OiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5iYXNlNjQ7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCeXRlcycpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IGFzdC52YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBiYXNlNjQgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2Jhc2U2NCcpO1xuICAgICAgaWYgKFxuICAgICAgICBfX3R5cGUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlICYmXG4gICAgICAgIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgICBiYXNlNjQgJiZcbiAgICAgICAgYmFzZTY0LnZhbHVlICYmXG4gICAgICAgIHR5cGVvZiBiYXNlNjQudmFsdWUudmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBiYXNlNjQ6IGJhc2U2NC52YWx1ZS52YWx1ZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0J5dGVzJyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VGaWxlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgbmFtZTogdmFsdWUsXG4gICAgfTtcbiAgfSBlbHNlIGlmIChcbiAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgdmFsdWUuX190eXBlID09PSAnRmlsZScgJiZcbiAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xufTtcblxuY29uc3QgRklMRSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdGaWxlJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgRmlsZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBmaWxlcy4nLFxuICBwYXJzZVZhbHVlOiBwYXJzZUZpbGVWYWx1ZSxcbiAgc2VyaWFsaXplOiB2YWx1ZSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnRmlsZScgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICAgKHZhbHVlLnVybCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2YWx1ZS51cmwgPT09ICdzdHJpbmcnKVxuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4gcGFyc2VGaWxlVmFsdWUoYXN0LnZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IG5hbWUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ25hbWUnKTtcbiAgICAgIGNvbnN0IHVybCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAndXJsJyk7XG4gICAgICBpZiAoX190eXBlICYmIF9fdHlwZS52YWx1ZSAmJiBuYW1lICYmIG5hbWUudmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBuYW1lOiBuYW1lLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIHVybDogdXJsICYmIHVybC52YWx1ZSA/IHVybC52YWx1ZS52YWx1ZSA6IHVuZGVmaW5lZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdGaWxlJyk7XG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9JTkZPID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVJbmZvJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgRmlsZUluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGZpbGVzLicsXG4gIGZpZWxkczoge1xuICAgIG5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmlsZSBuYW1lLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXJsIGluIHdoaWNoIHRoZSBmaWxlIGNhbiBiZSBkb3dubG9hZGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0lmIHRoaXMgZmllbGQgaXMgc2V0IHRvIG51bGwgdGhlIGZpbGUgd2lsbCBiZSB1bmxpbmtlZCAodGhlIGZpbGUgd2lsbCBub3QgYmUgZGVsZXRlZCBvbiBjbG91ZCBzdG9yYWdlKS4nLFxuICBmaWVsZHM6IHtcbiAgICBmaWxlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0EgRmlsZSBTY2FsYXIgY2FuIGJlIGFuIHVybCBvciBhIEZpbGVJbmZvIG9iamVjdC4nLFxuICAgICAgdHlwZTogRklMRSxcbiAgICB9LFxuICAgIHVwbG9hZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdVc2UgdGhpcyBmaWVsZCBpZiB5b3Ugd2FudCB0byBjcmVhdGUgYSBuZXcgZmlsZS4nLFxuICAgICAgdHlwZTogR3JhcGhRTFVwbG9hZCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9GSUVMRFMgPSB7XG4gIGxhdGl0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsYXRpdHVkZS4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICB9LFxuICBsb25naXR1ZGU6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxvbmdpdHVkZS4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICB9LFxufTtcblxuY29uc3QgR0VPX1BPSU5UX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRJbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgaW5wdXR0aW5nIGZpZWxkcyBvZiB0eXBlIGdlbyBwb2ludC4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgR0VPX1BPSU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgR2VvUG9pbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGdlbyBwb2ludCBmaWVsZHMuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IFBPTFlHT05fSU5QVVQgPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCkpO1xuXG5jb25zdCBQT0xZR09OID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpKTtcblxuY29uc3QgVVNFUl9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdVc2VyQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSB1c2VycyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSb2xlQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSByb2xlcyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBVQkxJQ19BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIGFjY2VzcyByaWdodHMuIElmIG5vdCBwcm92aWRlZCBvYmplY3Qgd2lsbCBiZSBwdWJsaWNseSByZWFkYWJsZSBhbmQgd3JpdGFibGUnLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0xfSU5QVVQpKSxcbiAgICB9LFxuICAgIHB1YmxpYzoge1xuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIGNvbnRyb2wgbGlzdC4nLFxuICAgICAgdHlwZTogUFVCTElDX0FDTF9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFVTRVJfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHVzZXJzIGhhdmUgcmVhZCBhbmQgd3JpdGUgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJJZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgdGFyZ2V0dGVkIFVzZXIuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJPTEVfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHJvbGUgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0wnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSBwdWJsaWMgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQ3VycmVudCBhY2Nlc3MgY29udHJvbCBsaXN0IG9mIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTCkpLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIGNvbnN0IHVzZXJzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHApLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgICAgaWYgKHJ1bGUgIT09ICcqJyAmJiBydWxlLmluZGV4T2YoJ3JvbGU6JykgIT09IDApIHtcbiAgICAgICAgICAgIHVzZXJzLnB1c2goe1xuICAgICAgICAgICAgICB1c2VySWQ6IHRvR2xvYmFsSWQoJ19Vc2VyJywgcnVsZSksXG4gICAgICAgICAgICAgIHJlYWQ6IHBbcnVsZV0ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbcnVsZV0ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdXNlcnMubGVuZ3RoID8gdXNlcnMgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICAgIHJvbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHJvbGVzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFJPTEVfQUNMKSksXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgY29uc3Qgcm9sZXMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMocCkuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICBpZiAocnVsZS5pbmRleE9mKCdyb2xlOicpID09PSAwKSB7XG4gICAgICAgICAgICByb2xlcy5wdXNoKHtcbiAgICAgICAgICAgICAgcm9sZU5hbWU6IHJ1bGUucmVwbGFjZSgncm9sZTonLCAnJyksXG4gICAgICAgICAgICAgIHJlYWQ6IHBbcnVsZV0ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbcnVsZV0ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcm9sZXMubGVuZ3RoID8gcm9sZXMgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICAgIHB1YmxpYzoge1xuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIGNvbnRyb2wgbGlzdC4nLFxuICAgICAgdHlwZTogUFVCTElDX0FDTCxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSAqL1xuICAgICAgICByZXR1cm4gcFsnKiddXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICAgIHJlYWQ6IHBbJyonXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFsnKiddLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfSUQgPSBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKTtcblxuY29uc3QgQ0xBU1NfTkFNRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY2xhc3MgbmFtZSBvZiB0aGUgb2JqZWN0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBPQkpFQ1RfSUQsXG59O1xuXG5jb25zdCBPQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBPQkpFQ1RfSUQsXG59O1xuXG5jb25zdCBDUkVBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGNyZWF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgVVBEQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBsYXMgdXBkYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBJTlBVVF9GSUVMRFMgPSB7XG4gIEFDTDoge1xuICAgIHR5cGU6IEFDTCxcbiAgfSxcbn07XG5cbmNvbnN0IENSRUFURV9SRVNVTFRfRklFTERTID0ge1xuICBvYmplY3RJZDogT0JKRUNUX0lEX0FUVCxcbiAgY3JlYXRlZEF0OiBDUkVBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFVQREFURV9SRVNVTFRfRklFTERTID0ge1xuICB1cGRhdGVkQXQ6IFVQREFURURfQVRfQVRULFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUX0ZJRUxEUyA9IHtcbiAgLi4uQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLlVQREFURV9SRVNVTFRfRklFTERTLFxuICAuLi5JTlBVVF9GSUVMRFMsXG4gIEFDTDoge1xuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBQ0wpLFxuICAgIHJlc29sdmU6ICh7IEFDTCB9KSA9PiAoQUNMID8gQUNMIDogeyAnKic6IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfSB9KSxcbiAgfSxcbn07XG5cbmNvbnN0IFBBUlNFX09CSkVDVCA9IG5ldyBHcmFwaFFMSW50ZXJmYWNlVHlwZSh7XG4gIG5hbWU6ICdQYXJzZU9iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUGFyc2VPYmplY3QgaW50ZXJmYWNlIHR5cGUgaXMgdXNlZCBhcyBhIGJhc2UgdHlwZSBmb3IgdGhlIGF1dG8gZ2VuZXJhdGVkIG9iamVjdCB0eXBlcy4nLFxuICBmaWVsZHM6IFBBUlNFX09CSkVDVF9GSUVMRFMsXG59KTtcblxuY29uc3QgU0VTU0lPTl9UT0tFTl9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIGN1cnJlbnQgdXNlciBzZXNzaW9uIHRva2VuLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICBuYW1lOiAnUmVhZFByZWZlcmVuY2UnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFJlYWRQcmVmZXJlbmNlIGVudW0gdHlwZSBpcyB1c2VkIGluIHF1ZXJpZXMgaW4gb3JkZXIgdG8gc2VsZWN0IGluIHdoaWNoIGRhdGFiYXNlIHJlcGxpY2EgdGhlIG9wZXJhdGlvbiBtdXN0IHJ1bi4nLFxuICB2YWx1ZXM6IHtcbiAgICBQUklNQVJZOiB7IHZhbHVlOiAnUFJJTUFSWScgfSxcbiAgICBQUklNQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1BSSU1BUllfUFJFRkVSUkVEJyB9LFxuICAgIFNFQ09OREFSWTogeyB2YWx1ZTogJ1NFQ09OREFSWScgfSxcbiAgICBTRUNPTkRBUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnU0VDT05EQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBORUFSRVNUOiB7IHZhbHVlOiAnTkVBUkVTVCcgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBtYWluIHF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgcXVlcmllcyB0byBiZSBleGVjdXRlZCB0byBpbmNsdWRlIGZpZWxkcy4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBzdWJxdWVyaWVzIHRoYXQgbWF5IGJlIHJlcXVpcmVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFJFQURfT1BUSU9OU19JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JlYWRPcHRpb25zSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFJlYWRPcHRpb25zSW5wdXR0IHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNldCB0aGUgcmVhZCBwcmVmZXJlbmNlcy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkUHJlZmVyZW5jZTogUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlOiBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfT1BUSU9OU19BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgb3B0aW9ucyBmb3IgdGhlIHF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gIHR5cGU6IFJFQURfT1BUSU9OU19JTlBVVCxcbn07XG5cbmNvbnN0IFdIRVJFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgU0tJUF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHNraXBwZWQgdG8gcmV0dXJuLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBMSU1JVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGltaXQgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHJldHVybmVkLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBDT1VOVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSB0b3RhbCBtYXRjaGVkIG9iamVjcyBjb3VudCB0aGF0IGlzIHJldHVybmVkIHdoZW4gdGhlIGNvdW50IGZsYWcgaXMgc2V0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSW50KSxcbn07XG5cbmNvbnN0IFNFQVJDSF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1NlYXJjaElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgU2VhcmNoSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgc2VhcmNoIG9wZXJhdGlvbiBvbiBhIGZ1bGwgdGV4dCBzZWFyY2guJyxcbiAgZmllbGRzOiB7XG4gICAgdGVybToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB0ZXJtIHRvIGJlIHNlYXJjaGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICBsYW5ndWFnZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBsYW5ndWFnZSB0byB0ZXRlcm1pbmUgdGhlIGxpc3Qgb2Ygc3RvcCB3b3JkcyBhbmQgdGhlIHJ1bGVzIGZvciB0b2tlbml6ZXIuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBjYXNlU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgY2FzZSBzZW5zaXRpdmUgc2VhcmNoLicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIGRpYWNyaXRpY1NlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGRpYWNyaXRpYyBzZW5zaXRpdmUgc2VhcmNoLicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFRFWFRfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdUZXh0SW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBUZXh0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB0ZXh0IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgc2VhcmNoOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNlYXJjaCB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNFQVJDSF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT1hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb3hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEJveElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIGJveCBvcGVyYXRpb24gb24gYSB3aXRoaW4gZ2VvIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGJvdHRvbUxlZnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm90dG9tIGxlZnQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICB1cHBlclJpZ2h0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwcGVyIHJpZ2h0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBXaXRoaW5JbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHdpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIGJveDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3ggdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQk9YX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IENFTlRFUl9TUEhFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdDZW50ZXJTcGhlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQ2VudGVyU3BoZXJlSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgY2VudGVyU3BoZXJlIG9wZXJhdGlvbiBvbiBhIGdlb1dpdGhpbiBxdWVyeS4nLFxuICBmaWVsZHM6IHtcbiAgICBjZW50ZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY2VudGVyIG9mIHRoZSBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gICAgZGlzdGFuY2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcmFkaXVzIG9mIHRoZSBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1dJVEhJTl9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1dpdGhpbklucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgR2VvV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9XaXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBwb2x5Z29uOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvbHlnb24gdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBQT0xZR09OX0lOUFVULFxuICAgIH0sXG4gICAgY2VudGVyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNwaGVyZSB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IENFTlRFUl9TUEhFUkVfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fSU5URVJTRUNUU19JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb0ludGVyc2VjdHNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvSW50ZXJzZWN0c0lucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgZ2VvSW50ZXJzZWN0cyBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvaW50OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvaW50IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5UX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgZXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IG5vdEVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBpbk9wID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyBhbnkgdmFsdWUgaW4gdGhlIHNwZWNpZmllZCBhcnJheS4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG59KTtcblxuY29uc3Qgbm90SW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBleGlzdHMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBleGlzdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXhpc3RzIChvciBkbyBub3QgZXhpc3QpLicsXG4gIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxufTtcblxuY29uc3QgbWF0Y2hlc1JlZ2V4ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbWF0Y2hlc1JlZ2V4IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBtYXRjaGVzIGEgc3BlY2lmaWVkIHJlZ3VsYXIgZXhwcmVzc2lvbi4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3Qgb3B0aW9ucyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG9wdGlvbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBvcHRpb25hbCBmbGFncyAoc3VjaCBhcyBcImlcIiBhbmQgXCJtXCIpIHRvIGJlIGFkZGVkIHRvIGEgbWF0Y2hlc1JlZ2V4IG9wZXJhdGlvbiBpbiB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3VicXVlcnlJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFN1YnF1ZXJ5SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBzdWIgcXVlcnkgdG8gYW5vdGhlciBjbGFzcy4nLFxuICBmaWVsZHM6IHtcbiAgICBjbGFzc05hbWU6IENMQVNTX05BTUVfQVRULFxuICAgIHdoZXJlOiBPYmplY3QuYXNzaWduKHt9LCBXSEVSRV9BVFQsIHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChXSEVSRV9BVFQudHlwZSksXG4gICAgfSksXG4gIH0sXG59KTtcblxuY29uc3QgU0VMRUNUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VsZWN0SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNlbGVjdElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGFuIGluUXVlcnlLZXkgb3IgYSBub3RJblF1ZXJ5S2V5IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcXVlcnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3VicXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChTVUJRVUVSWV9JTlBVVCksXG4gICAgfSxcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUga2V5IGluIHRoZSByZXN1bHQgb2YgdGhlIHN1YnF1ZXJ5IHRoYXQgbXVzdCBtYXRjaCAobm90IG1hdGNoKSB0aGUgZmllbGQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IGluUXVlcnlLZXkgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBpblF1ZXJ5S2V5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9JTlBVVCxcbn07XG5cbmNvbnN0IG5vdEluUXVlcnlLZXkgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJblF1ZXJ5S2V5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9JTlBVVCxcbn07XG5cbmNvbnN0IElEX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnSWRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBJZFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGFuIGlkLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxJRCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxJRCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgaW46IGluT3AoR3JhcGhRTElEKSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTElEKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IFNUUklOR19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N0cmluZ1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFN0cmluZ1doZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBTdHJpbmcuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMU3RyaW5nKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBpbjogaW5PcChHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTFN0cmluZyksXG4gICAgZXhpc3RzLFxuICAgIG1hdGNoZXNSZWdleCxcbiAgICBvcHRpb25zLFxuICAgIHRleHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJHRleHQgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGZ1bGwgdGV4dCBzZWFyY2ggY29uc3RyYWludC4nLFxuICAgICAgdHlwZTogVEVYVF9JTlBVVCxcbiAgICB9LFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBOVU1CRVJfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdOdW1iZXJXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBOdW1iZXJXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgTnVtYmVyLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgaW46IGluT3AoR3JhcGhRTEZsb2F0KSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTEZsb2F0KSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPT0xFQU5fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb29sZWFuV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm9vbGVhbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCb29sZWFuLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQVJSQVlfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBcnJheVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFycmF5V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEFycmF5LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQU5ZKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEFOWSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEFOWSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEFOWSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgaW46IGluT3AoQU5ZKSxcbiAgICBub3RJbjogbm90SW4oQU5ZKSxcbiAgICBleGlzdHMsXG4gICAgY29udGFpbmVkQnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbmVkQnkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgaXMgY29udGFpbmVkIGJ5IGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICAgIGNvbnRhaW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGNvbnRhaW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGNvbnRhaW4gYWxsIGVsZW1lbnRzIG9mIGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBLRVlfVkFMVUVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdLZXlWYWx1ZUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbiBlbnRyeSBmcm9tIGFuIG9iamVjdCwgaS5lLiwgYSBwYWlyIG9mIGtleSBhbmQgdmFsdWUuJyxcbiAgZmllbGRzOiB7XG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBrZXkgdXNlZCB0byByZXRyaWV2ZSB0aGUgdmFsdWUgb2YgdGhpcyBlbnRyeS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgdmFsdWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIHZhbHVlIG9mIHRoZSBlbnRyeS4gQ291bGQgYmUgYW55IHR5cGUgb2Ygc2NhbGFyIGRhdGEuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnT2JqZWN0V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIHJlc3VsdCBieSBhIGZpZWxkIG9mIHR5cGUgT2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgaW46IGluT3AoS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RJbjogbm90SW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IERBVEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdEYXRlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBEYXRlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oREFURSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhEQVRFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oREFURSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihEQVRFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oREFURSksXG4gICAgaW46IGluT3AoREFURSksXG4gICAgbm90SW46IG5vdEluKERBVEUpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQllURVNfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCeXRlc1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJ5dGVzLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQllURVMpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQllURVMpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihCWVRFUyksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhCWVRFUyksXG4gICAgaW46IGluT3AoQllURVMpLFxuICAgIG5vdEluOiBub3RJbihCWVRFUyksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGVXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRmlsZS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEZJTEUpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oRklMRSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEZJTEUpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhGSUxFKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oRklMRSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGluOiBpbk9wKEZJTEUpLFxuICAgIG5vdEluOiBub3RJbihGSUxFKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgR2VvUG9pbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXhpc3RzLFxuICAgIG5lYXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbmVhclNwaGVyZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBuZWFyIHRvIGFub3RoZXIgZ2VvIHBvaW50LicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5SYWRpYW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5SYWRpYW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJbk1pbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5NaWxlcyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gbWlsZXMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluS2lsb21ldGVyczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluS2lsb21ldGVycyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4ga2lsb21ldGVycykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIHdpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSB3aXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIGJveC4nLFxuICAgICAgdHlwZTogV0lUSElOX0lOUFVULFxuICAgIH0sXG4gICAgZ2VvV2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb1dpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgcG9seWdvbiBvciBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IEdFT19XSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQT0xZR09OX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUG9seWdvbldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBvbHlnb25XaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgUG9seWdvbi4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgZ2VvSW50ZXJzZWN0czoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBnZW9JbnRlcnNlY3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgcG9seWdvbiBmaWVsZCBpbnRlcnNlY3QgYSBzcGVjaWZpZWQgcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19JTlRFUlNFQ1RTX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgRUxFTUVOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdFbGVtZW50JyxcbiAgZGVzY3JpcHRpb246IFwiVGhlIEVsZW1lbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gYXJyYXkgaXRlbXMnIHZhbHVlLlwiLFxuICBmaWVsZHM6IHtcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdSZXR1cm4gdGhlIHZhbHVlIG9mIHRoZSBlbGVtZW50IGluIHRoZSBhcnJheScsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQU5ZKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbi8vIERlZmF1bHQgc3RhdGljIHVuaW9uIHR5cGUsIHdlIHVwZGF0ZSB0eXBlcyBhbmQgcmVzb2x2ZVR5cGUgZnVuY3Rpb24gbGF0ZXJcbmxldCBBUlJBWV9SRVNVTFQ7XG5cbmNvbnN0IGxvYWRBcnJheVJlc3VsdCA9IChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3Nlc0FycmF5KSA9PiB7XG4gIGNvbnN0IGNsYXNzVHlwZXMgPSBwYXJzZUNsYXNzZXNBcnJheVxuICAgIC5maWx0ZXIocGFyc2VDbGFzcyA9PlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1twYXJzZUNsYXNzLmNsYXNzTmFtZV0uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA/IHRydWUgOiBmYWxzZVxuICAgIClcbiAgICAubWFwKFxuICAgICAgcGFyc2VDbGFzcyA9PiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgKTtcbiAgQVJSQVlfUkVTVUxUID0gbmV3IEdyYXBoUUxVbmlvblR5cGUoe1xuICAgIG5hbWU6ICdBcnJheVJlc3VsdCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzJyxcbiAgICB0eXBlczogKCkgPT4gW0VMRU1FTlQsIC4uLmNsYXNzVHlwZXNdLFxuICAgIHJlc29sdmVUeXBlOiB2YWx1ZSA9PiB7XG4gICAgICBpZiAodmFsdWUuX190eXBlID09PSAnT2JqZWN0JyAmJiB2YWx1ZS5jbGFzc05hbWUgJiYgdmFsdWUub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXSkge1xuICAgICAgICAgIHJldHVybiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3ZhbHVlLmNsYXNzTmFtZV0uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZS5uYW1lO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBFTEVNRU5ULm5hbWU7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBFTEVNRU5ULm5hbWU7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChBUlJBWV9SRVNVTFQpO1xufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHcmFwaFFMVXBsb2FkLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFOWSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFUywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5GTywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fUE9JTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUEFSU0VfT0JKRUNULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfUFJFRkVSRU5DRSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShSRUFEX09QVElPTlNfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU0VBUkNIX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFRFWFRfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQk9YX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFdJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShDRU5URVJfU1BIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19XSVRISU5fSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX0lOVEVSU0VDVFNfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoSURfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU1RSSU5HX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE5VTUJFUl9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT09MRUFOX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFSUkFZX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEtFWV9WQUxVRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1RfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURV9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFU19XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQT0xZR09OX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEVMRU1FTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFVTRVJfQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJPTEVfQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBVQkxJQ19BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFVTRVJfQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJPTEVfQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBVQkxJQ19BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU1VCUVVFUllfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU0VMRUNUX0lOUFVULCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7XG4gIEdyYXBoUUxVcGxvYWQsXG4gIFR5cGVWYWxpZGF0aW9uRXJyb3IsXG4gIHBhcnNlU3RyaW5nVmFsdWUsXG4gIHBhcnNlSW50VmFsdWUsXG4gIHBhcnNlRmxvYXRWYWx1ZSxcbiAgcGFyc2VCb29sZWFuVmFsdWUsXG4gIHBhcnNlVmFsdWUsXG4gIHBhcnNlTGlzdFZhbHVlcyxcbiAgcGFyc2VPYmplY3RGaWVsZHMsXG4gIEFOWSxcbiAgT0JKRUNULFxuICBwYXJzZURhdGVJc29WYWx1ZSxcbiAgc2VyaWFsaXplRGF0ZUlzbyxcbiAgREFURSxcbiAgQllURVMsXG4gIHBhcnNlRmlsZVZhbHVlLFxuICBTVUJRVUVSWV9JTlBVVCxcbiAgU0VMRUNUX0lOUFVULFxuICBGSUxFLFxuICBGSUxFX0lORk8sXG4gIEZJTEVfSU5QVVQsXG4gIEdFT19QT0lOVF9GSUVMRFMsXG4gIEdFT19QT0lOVF9JTlBVVCxcbiAgR0VPX1BPSU5ULFxuICBQT0xZR09OX0lOUFVULFxuICBQT0xZR09OLFxuICBPQkpFQ1RfSUQsXG4gIENMQVNTX05BTUVfQVRULFxuICBHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgT0JKRUNUX0lEX0FUVCxcbiAgVVBEQVRFRF9BVF9BVFQsXG4gIENSRUFURURfQVRfQVRULFxuICBJTlBVVF9GSUVMRFMsXG4gIENSRUFURV9SRVNVTFRfRklFTERTLFxuICBVUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbiAgUEFSU0VfT0JKRUNULFxuICBTRVNTSU9OX1RPS0VOX0FUVCxcbiAgUkVBRF9QUkVGRVJFTkNFLFxuICBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFJFQURfT1BUSU9OU19JTlBVVCxcbiAgUkVBRF9PUFRJT05TX0FUVCxcbiAgV0hFUkVfQVRULFxuICBTS0lQX0FUVCxcbiAgTElNSVRfQVRULFxuICBDT1VOVF9BVFQsXG4gIFNFQVJDSF9JTlBVVCxcbiAgVEVYVF9JTlBVVCxcbiAgQk9YX0lOUFVULFxuICBXSVRISU5fSU5QVVQsXG4gIENFTlRFUl9TUEhFUkVfSU5QVVQsXG4gIEdFT19XSVRISU5fSU5QVVQsXG4gIEdFT19JTlRFUlNFQ1RTX0lOUFVULFxuICBlcXVhbFRvLFxuICBub3RFcXVhbFRvLFxuICBsZXNzVGhhbixcbiAgbGVzc1RoYW5PckVxdWFsVG8sXG4gIGdyZWF0ZXJUaGFuLFxuICBncmVhdGVyVGhhbk9yRXF1YWxUbyxcbiAgaW5PcCxcbiAgbm90SW4sXG4gIGV4aXN0cyxcbiAgbWF0Y2hlc1JlZ2V4LFxuICBvcHRpb25zLFxuICBpblF1ZXJ5S2V5LFxuICBub3RJblF1ZXJ5S2V5LFxuICBJRF9XSEVSRV9JTlBVVCxcbiAgU1RSSU5HX1dIRVJFX0lOUFVULFxuICBOVU1CRVJfV0hFUkVfSU5QVVQsXG4gIEJPT0xFQU5fV0hFUkVfSU5QVVQsXG4gIEFSUkFZX1dIRVJFX0lOUFVULFxuICBLRVlfVkFMVUVfSU5QVVQsXG4gIE9CSkVDVF9XSEVSRV9JTlBVVCxcbiAgREFURV9XSEVSRV9JTlBVVCxcbiAgQllURVNfV0hFUkVfSU5QVVQsXG4gIEZJTEVfV0hFUkVfSU5QVVQsXG4gIEdFT19QT0lOVF9XSEVSRV9JTlBVVCxcbiAgUE9MWUdPTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfUkVTVUxULFxuICBFTEVNRU5ULFxuICBBQ0xfSU5QVVQsXG4gIFVTRVJfQUNMX0lOUFVULFxuICBST0xFX0FDTF9JTlBVVCxcbiAgUFVCTElDX0FDTF9JTlBVVCxcbiAgQUNMLFxuICBVU0VSX0FDTCxcbiAgUk9MRV9BQ0wsXG4gIFBVQkxJQ19BQ0wsXG4gIGxvYWQsXG4gIGxvYWRBcnJheVJlc3VsdCxcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFnQkEsSUFBQUMsYUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsY0FBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQTRELFNBQUFHLHVCQUFBQyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRTVELE1BQU1HLG1CQUFtQixTQUFTQyxLQUFLLENBQUM7RUFDdENDLFdBQVdBLENBQUNDLEtBQUssRUFBRUMsSUFBSSxFQUFFO0lBQ3ZCLEtBQUssQ0FBQyxHQUFHRCxLQUFLLG1CQUFtQkMsSUFBSSxFQUFFLENBQUM7RUFDMUM7QUFDRjtBQUFDQyxPQUFBLENBQUFMLG1CQUFBLEdBQUFBLG1CQUFBO0FBRUQsTUFBTU0sZ0JBQWdCLEdBQUdILEtBQUssSUFBSTtFQUNoQyxJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLEVBQUU7SUFDN0IsT0FBT0EsS0FBSztFQUNkO0VBRUEsTUFBTSxJQUFJSCxtQkFBbUIsQ0FBQ0csS0FBSyxFQUFFLFFBQVEsQ0FBQztBQUNoRCxDQUFDO0FBQUNFLE9BQUEsQ0FBQUMsZ0JBQUEsR0FBQUEsZ0JBQUE7QUFFRixNQUFNQyxhQUFhLEdBQUdKLEtBQUssSUFBSTtFQUM3QixJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLEVBQUU7SUFDN0IsTUFBTUssR0FBRyxHQUFHQyxNQUFNLENBQUNOLEtBQUssQ0FBQztJQUN6QixJQUFJTSxNQUFNLENBQUNDLFNBQVMsQ0FBQ0YsR0FBRyxDQUFDLEVB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