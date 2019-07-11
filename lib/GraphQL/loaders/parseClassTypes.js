"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.extractKeysAndInclude = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { keys.push.apply(keys, Object.getOwnPropertySymbols(object)); } if (enumerableOnly) keys = keys.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const mapInputType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return _graphql.GraphQLString;

    case 'Number':
      return _graphql.GraphQLFloat;

    case 'Boolean':
      return _graphql.GraphQLBoolean;

    case 'Array':
      return new _graphql.GraphQLList(defaultGraphQLTypes.ANY);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLScalarType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLRelationOpType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT;

    default:
      return undefined;
  }
};

const mapOutputType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return _graphql.GraphQLString;

    case 'Number':
      return _graphql.GraphQLFloat;

    case 'Boolean':
      return _graphql.GraphQLBoolean;

    case 'Array':
      return new _graphql.GraphQLList(defaultGraphQLTypes.ANY);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLOutputType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes[targetClass]) {
        return new _graphql.GraphQLNonNull(parseClassTypes[targetClass].classGraphQLFindResultType);
      } else {
        return new _graphql.GraphQLNonNull(defaultGraphQLTypes.FIND_RESULT);
      }

    case 'File':
      return defaultGraphQLTypes.FILE_INFO;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_INFO;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_INFO;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT;

    default:
      return undefined;
  }
};

const mapConstraintType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_CONSTRAINT;

    case 'Number':
      return defaultGraphQLTypes.NUMBER_CONSTRAINT;

    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_CONSTRAINT;

    case 'Array':
      return defaultGraphQLTypes.ARRAY_CONSTRAINT;

    case 'Object':
      return defaultGraphQLTypes.OBJECT_CONSTRAINT;

    case 'Date':
      return defaultGraphQLTypes.DATE_CONSTRAINT;

    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLConstraintType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE_CONSTRAINT;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_CONSTRAINT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_CONSTRAINT;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES_CONSTRAINT;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT_CONSTRAINT;

    case 'Relation':
    default:
      return undefined;
  }
};

const extractKeysAndInclude = selectedFields => {
  selectedFields = selectedFields.filter(field => !field.includes('__typename'));
  let keys = undefined;
  let include = undefined;

  if (selectedFields && selectedFields.length > 0) {
    keys = selectedFields.join(',');
    include = selectedFields.reduce((fields, field) => {
      fields = fields.slice();
      let pointIndex = field.lastIndexOf('.');

      while (pointIndex > 0) {
        const lastField = field.slice(pointIndex + 1);
        field = field.slice(0, pointIndex);

        if (!fields.includes(field) && lastField !== 'objectId') {
          fields.push(field);
        }

        pointIndex = field.lastIndexOf('.');
      }

      return fields;
    }, []).join(',');
  }

  return {
    keys,
    include
  };
};

exports.extractKeysAndInclude = extractKeysAndInclude;

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;
  const classFields = Object.keys(parseClass.fields);
  const classCustomFields = classFields.filter(field => !Object.keys(defaultGraphQLTypes.CLASS_FIELDS).includes(field));
  const classGraphQLScalarTypeName = `${className}Pointer`;

  const parseScalarValue = value => {
    if (typeof value === 'string') {
      return {
        __type: 'Pointer',
        className,
        objectId: value
      };
    } else if (typeof value === 'object' && value.__type === 'Pointer' && value.className === className && typeof value.objectId === 'string') {
      return value;
    }

    throw new defaultGraphQLTypes.TypeValidationError(value, classGraphQLScalarTypeName);
  };

  const classGraphQLScalarType = new _graphql.GraphQLScalarType({
    name: classGraphQLScalarTypeName,
    description: `The ${classGraphQLScalarTypeName} is used in operations that involve ${className} pointers.`,
    parseValue: parseScalarValue,

    serialize(value) {
      if (typeof value === 'string') {
        return value;
      } else if (typeof value === 'object' && value.__type === 'Pointer' && value.className === className && typeof value.objectId === 'string') {
        return value.objectId;
      }

      throw new defaultGraphQLTypes.TypeValidationError(value, classGraphQLScalarTypeName);
    },

    parseLiteral(ast) {
      if (ast.kind === _graphql.Kind.STRING) {
        return parseScalarValue(ast.value);
      } else if (ast.kind === _graphql.Kind.OBJECT) {
        const __type = ast.fields.find(field => field.name.value === '__type');

        const className = ast.fields.find(field => field.name.value === 'className');
        const objectId = ast.fields.find(field => field.name.value === 'objectId');

        if (__type && __type.value && className && className.value && objectId && objectId.value) {
          return parseScalarValue({
            __type: __type.value.value,
            className: className.value.value,
            objectId: objectId.value.value
          });
        }
      }

      throw new defaultGraphQLTypes.TypeValidationError(ast.kind, classGraphQLScalarTypeName);
    }

  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLScalarType);
  const classGraphQLRelationOpTypeName = `${className}RelationOp`;
  const classGraphQLRelationOpType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationOpTypeName,
    description: `The ${classGraphQLRelationOpTypeName} input type is used in operations that involve relations with the ${className} class.`,
    fields: () => ({
      _op: {
        description: 'This is the operation to be executed.',
        type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.RELATION_OP)
      },
      ops: {
        description: 'In the case of a Batch operation, this is the list of operations to be executed.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLRelationOpType))
      },
      objects: {
        description: 'In the case of a AddRelation or RemoveRelation operation, this is the list of objects to be added/removed.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLScalarType))
      }
    })
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLRelationOpType);
  const classGraphQLInputTypeName = `${className}Fields`;
  const classGraphQLInputType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLInputTypeName,
    description: `The ${classGraphQLInputTypeName} input type is used in operations that involve inputting objects of ${className} class.`,
    fields: () => classCustomFields.reduce((fields, field) => {
      const type = mapInputType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (type) {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: defaultGraphQLTypes.ACL_ATT
    })
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLInputType);
  const classGraphQLConstraintTypeName = `${className}PointerConstraint`;
  const classGraphQLConstraintType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintTypeName,
    description: `The ${classGraphQLConstraintTypeName} input type is used in operations that involve filtering objects by a pointer field to ${className} class.`,
    fields: {
      _eq: defaultGraphQLTypes._eq(classGraphQLScalarType),
      _ne: defaultGraphQLTypes._ne(classGraphQLScalarType),
      _in: defaultGraphQLTypes._in(classGraphQLScalarType),
      _nin: defaultGraphQLTypes._nin(classGraphQLScalarType),
      _exists: defaultGraphQLTypes._exists,
      _select: defaultGraphQLTypes._select,
      _dontSelect: defaultGraphQLTypes._dontSelect,
      _inQuery: {
        description: 'This is the $inQuery operator to specify a constraint to select the objects where a field equals to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY
      },
      _notInQuery: {
        description: 'This is the $notInQuery operator to specify a constraint to select the objects where a field do not equal to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLConstraintType);
  const classGraphQLConstraintsTypeName = `${className}Constraints`;
  const classGraphQLConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${className} class.`,
    fields: () => _objectSpread({}, classFields.reduce((fields, field) => {
      const type = mapConstraintType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (type) {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {}), {
      _or: {
        description: 'This is the $or operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      _and: {
        description: 'This is the $and operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      _nor: {
        description: 'This is the $nor operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      }
    })
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLConstraintsType);
  const classGraphQLOrderTypeName = `${className}Order`;
  const classGraphQLOrderType = new _graphql.GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${className} class.`,
    values: classFields.reduce((orderFields, field) => {
      return _objectSpread({}, orderFields, {
        [`${field}_ASC`]: {
          value: field
        },
        [`${field}_DESC`]: {
          value: `-${field}`
        }
      });
    }, {})
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOrderType);
  const classGraphQLFindArgs = {
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType))
    },
    skip: defaultGraphQLTypes.SKIP_ATT,
    limit: defaultGraphQLTypes.LIMIT_ATT,
    readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
    includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: defaultGraphQLTypes.SUBQUERY_READ_PREFERENCE_ATT
  };
  const classGraphQLOutputTypeName = `${className}Class`;

  const outputFields = () => {
    return classCustomFields.reduce((fields, field) => {
      const type = mapOutputType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes = parseGraphQLSchema.parseClassTypes[parseClass.fields[field].targetClass];
        const args = targetParseClassTypes ? targetParseClassTypes.classGraphQLFindArgs : undefined;
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type,

            async resolve(source, args, context, queryInfo) {
              try {
                const {
                  where,
                  order,
                  skip,
                  limit,
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference
                } = args;
                const {
                  config,
                  auth,
                  info
                } = context;
                const selectedFields = (0, _graphqlListFields.default)(queryInfo);
                const {
                  keys,
                  include
                } = extractKeysAndInclude(selectedFields.filter(field => field.includes('.')).map(field => field.slice(field.indexOf('.') + 1)));
                return await objectsQueries.findObjects(source[field].className, _objectSpread({
                  _relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), order, skip, limit, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields.map(field => field.split('.', 1)[0]));
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            }

          }
        });
      } else if (parseClass.fields[field].type === 'Polygon') {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type,

            async resolve(source) {
              if (source[field] && source[field].coordinates) {
                return source[field].coordinates.map(coordinate => ({
                  latitude: coordinate[0],
                  longitude: coordinate[1]
                }));
              } else {
                return null;
              }
            }

          }
        });
      } else if (type) {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, defaultGraphQLTypes.CLASS_FIELDS);
  };

  const classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${className} class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: outputFields
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOutputType);
  const classGraphQLFindResultTypeName = `${className}FindResult`;
  const classGraphQLFindResultType = new _graphql.GraphQLObjectType({
    name: classGraphQLFindResultTypeName,
    description: `The ${classGraphQLFindResultTypeName} object type is used in the ${className} find query to return the data of the matched objects.`,
    fields: {
      results: {
        description: 'This is the objects returned by the query',
        type: new _graphql.GraphQLNonNull(new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOutputType)))
      },
      count: defaultGraphQLTypes.COUNT_ATT
    }
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLFindResultType);
  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLScalarType,
    classGraphQLRelationOpType,
    classGraphQLInputType,
    classGraphQLConstraintType,
    classGraphQLConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType
  };

  if (className === '_User') {
    const meType = new _graphql.GraphQLObjectType({
      name: 'Me',
      description: `The Me object type is used in operations that involve outputting the current user data.`,
      interfaces: [defaultGraphQLTypes.CLASS],
      fields: () => _objectSpread({}, outputFields(), {
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT
      })
    });
    parseGraphQLSchema.meType = meType;
    parseGraphQLSchema.graphQLTypes.push(meType);
    const userSignUpInputTypeName = `_UserSignUpFields`;
    const userSignUpInputType = new _graphql.GraphQLInputObjectType({
      name: userSignUpInputTypeName,
      description: `The ${userSignUpInputTypeName} input type is used in operations that involve inputting objects of ${className} class when signing up.`,
      fields: () => classCustomFields.reduce((fields, field) => {
        const type = mapInputType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

        if (type) {
          return _objectSpread({}, fields, {
            [field]: {
              description: `This is the object ${field}.`,
              type: field === 'username' || field === 'password' ? new _graphql.GraphQLNonNull(type) : type
            }
          });
        } else {
          return fields;
        }
      }, {
        ACL: defaultGraphQLTypes.ACL_ATT
      })
    });
    parseGraphQLSchema.parseClassTypes['_User'].signUpInputType = userSignUpInputType;
    parseGraphQLSchema.graphQLTypes.push(userSignUpInputType);
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbIm1hcElucHV0VHlwZSIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiR3JhcGhRTFN0cmluZyIsIkdyYXBoUUxGbG9hdCIsIkdyYXBoUUxCb29sZWFuIiwiR3JhcGhRTExpc3QiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiQU5ZIiwiT0JKRUNUIiwiREFURSIsImNsYXNzR3JhcGhRTFNjYWxhclR5cGUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSIsIkZJTEUiLCJHRU9fUE9JTlQiLCJQT0xZR09OIiwiQllURVMiLCJ1bmRlZmluZWQiLCJtYXBPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJGSU5EX1JFU1VMVCIsIkZJTEVfSU5GTyIsIkdFT19QT0lOVF9JTkZPIiwiUE9MWUdPTl9JTkZPIiwibWFwQ29uc3RyYWludFR5cGUiLCJTVFJJTkdfQ09OU1RSQUlOVCIsIk5VTUJFUl9DT05TVFJBSU5UIiwiQk9PTEVBTl9DT05TVFJBSU5UIiwiQVJSQVlfQ09OU1RSQUlOVCIsIk9CSkVDVF9DT05TVFJBSU5UIiwiREFURV9DT05TVFJBSU5UIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUiLCJGSUxFX0NPTlNUUkFJTlQiLCJHRU9fUE9JTlRfQ09OU1RSQUlOVCIsIlBPTFlHT05fQ09OU1RSQUlOVCIsIkJZVEVTX0NPTlNUUkFJTlQiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJzZWxlY3RlZEZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiaW5jbHVkZXMiLCJrZXlzIiwiaW5jbHVkZSIsImxlbmd0aCIsImpvaW4iLCJyZWR1Y2UiLCJmaWVsZHMiLCJzbGljZSIsInBvaW50SW5kZXgiLCJsYXN0SW5kZXhPZiIsImxhc3RGaWVsZCIsInB1c2giLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsImNsYXNzRmllbGRzIiwiT2JqZWN0IiwiY2xhc3NDdXN0b21GaWVsZHMiLCJDTEFTU19GSUVMRFMiLCJjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZSIsInBhcnNlU2NhbGFyVmFsdWUiLCJ2YWx1ZSIsIl9fdHlwZSIsIm9iamVjdElkIiwiVHlwZVZhbGlkYXRpb25FcnJvciIsIkdyYXBoUUxTY2FsYXJUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwicGFyc2VWYWx1ZSIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiZmluZCIsImdyYXBoUUxUeXBlcyIsImNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJfb3AiLCJ0eXBlIiwiUkVMQVRJT05fT1AiLCJvcHMiLCJvYmplY3RzIiwiY2xhc3NHcmFwaFFMSW5wdXRUeXBlTmFtZSIsImNsYXNzR3JhcGhRTElucHV0VHlwZSIsIkFDTCIsIkFDTF9BVFQiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWUiLCJfZXEiLCJfbmUiLCJfaW4iLCJfbmluIiwiX2V4aXN0cyIsIl9zZWxlY3QiLCJfZG9udFNlbGVjdCIsIl9pblF1ZXJ5IiwiU1VCUVVFUlkiLCJfbm90SW5RdWVyeSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJfb3IiLCJfYW5kIiwiX25vciIsImNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxPcmRlclR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJ2YWx1ZXMiLCJvcmRlckZpZWxkcyIsImNsYXNzR3JhcGhRTEZpbmRBcmdzIiwid2hlcmUiLCJvcmRlciIsInNraXAiLCJTS0lQX0FUVCIsImxpbWl0IiwiTElNSVRfQVRUIiwicmVhZFByZWZlcmVuY2UiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsIm91dHB1dEZpZWxkcyIsInRhcmdldFBhcnNlQ2xhc3NUeXBlcyIsImFyZ3MiLCJyZXNvbHZlIiwic291cmNlIiwiY29udGV4dCIsInF1ZXJ5SW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwibWFwIiwiaW5kZXhPZiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCJfcmVsYXRlZFRvIiwib2JqZWN0Iiwia2V5Iiwic3BsaXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiaW50ZXJmYWNlcyIsIkNMQVNTIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVOYW1lIiwicmVzdWx0cyIsImNvdW50IiwiQ09VTlRfQVRUIiwibWVUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyU2lnblVwSW5wdXRUeXBlTmFtZSIsInVzZXJTaWduVXBJbnB1dFR5cGUiLCJzaWduVXBJbnB1dFR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFZQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsWUFBWSxHQUFHLENBQUNDLFNBQUQsRUFBWUMsV0FBWixFQUF5QkMsZUFBekIsS0FBNkM7QUFDaEUsVUFBUUYsU0FBUjtBQUNFLFNBQUssUUFBTDtBQUNFLGFBQU9HLHNCQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9DLHFCQUFQOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9DLHVCQUFQOztBQUNG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QSxXQUFXLEVBQUcsT0FBTTBGLHVCQUF3Qix1RUFBc0V2RyxTQUFVLHlCQUZ2RTtBQUdyRFQsTUFBQUEsTUFBTSxFQUFFLE1BQ05ZLGlCQUFpQixDQUFDYixNQUFsQixDQUNFLENBQUNDLE1BQUQsRUFBU1AsS0FBVCxLQUFtQjtBQUNqQixjQUFNMEMsSUFBSSxHQUFHcEYsWUFBWSxDQUN2QnlELFVBQVUsQ0FBQ1IsTUFBWCxDQUFrQlAsS0FBbEIsRUFBeUIwQyxJQURGLEVBRXZCM0IsVUFBVSxDQUFDUixNQUFYLENBQWtCUCxLQUFsQixFQUF5QnhDLFdBRkYsRUFHdkJzRCxrQkFBa0IsQ0FBQ3JELGVBSEksQ0FBekI7O0FBS0EsWUFBSWlGLElBQUosRUFBVTtBQUNSLG1DQUNLbkMsTUFETDtBQUVFLGFBQUNQLEtBQUQsR0FBUztBQUNQNkIsY0FBQUEsV0FBVyxFQUFHLHNCQUFxQjdCLEtBQU0sR0FEbEM7QUFFUDBDLGNBQUFBLElBQUksRUFDRjFDLEtBQUssS0FBSyxVQUFWLElBQXdCQSxLQUFLLEtBQUssVUFBbEMsR0FDSSxJQUFJckIsdUJBQUosQ0FBbUIrRCxJQUFuQixDQURKLEdBRUlBO0FBTEM7QUFGWDtBQVVELFNBWEQsTUFXTztBQUNMLGlCQUFPbkMsTUFBUDtBQUNEO0FBQ0YsT0FyQkgsRUFzQkU7QUFDRXlDLFFBQUFBLEdBQUcsRUFBRWxGLG1CQUFtQixDQUFDbUY7QUFEM0IsT0F0QkY7QUFKbUQsS0FBM0IsQ0FBNUI7QUErQkFuQyxJQUFBQSxrQkFBa0IsQ0FBQ3JELGVBQW5CLENBQ0UsT0FERixFQUVFZ0ssZUFGRixHQUVvQkQsbUJBRnBCO0FBR0ExRyxJQUFBQSxrQkFBa0IsQ0FBQ3dCLFlBQW5CLENBQWdDMUIsSUFBaEMsQ0FBcUM0RyxtQkFBckM7QUFDRDtBQUNGLENBNWFEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgS2luZCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTFNjYWxhclR5cGUsXG4gIEdyYXBoUUxFbnVtVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4vb2JqZWN0c1F1ZXJpZXMnO1xuXG5jb25zdCBtYXBJbnB1dFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBHcmFwaFFMU3RyaW5nO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gR3JhcGhRTEZsb2F0O1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlkpO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgaWYgKHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10pIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMU2NhbGFyVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEU7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTjtcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5CWVRFUztcbiAgICBjYXNlICdBQ0wnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59O1xuXG5jb25zdCBtYXBPdXRwdXRUeXBlID0gKHBhcnNlVHlwZSwgdGFyZ2V0Q2xhc3MsIHBhcnNlQ2xhc3NUeXBlcykgPT4ge1xuICBzd2l0Y2ggKHBhcnNlVHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gR3JhcGhRTFN0cmluZztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuIEdyYXBoUUxGbG9hdDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBHcmFwaFFMQm9vbGVhbjtcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gbmV3IEdyYXBoUUxMaXN0KGRlZmF1bHRHcmFwaFFMVHlwZXMuQU5ZKTtcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuREFURTtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIGlmIChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgICB9XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgaWYgKHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuRklORF9SRVNVTFQpO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVF9JTkZPO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9JTkZPO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmNvbnN0IG1hcENvbnN0cmFpbnRUeXBlID0gKHBhcnNlVHlwZSwgdGFyZ2V0Q2xhc3MsIHBhcnNlQ2xhc3NUeXBlcykgPT4ge1xuICBzd2l0Y2ggKHBhcnNlVHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5TVFJJTkdfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuTlVNQkVSX0NPTlNUUkFJTlQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5CT09MRUFOX0NPTlNUUkFJTlQ7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQVJSQVlfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0NPTlNUUkFJTlQ7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFX0NPTlNUUkFJTlQ7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fQ09OU1RSQUlOVDtcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5CWVRFU19DT05TVFJBSU5UO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmNvbnN0IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSA9IHNlbGVjdGVkRmllbGRzID0+IHtcbiAgc2VsZWN0ZWRGaWVsZHMgPSBzZWxlY3RlZEZpZWxkcy5maWx0ZXIoXG4gICAgZmllbGQgPT4gIWZpZWxkLmluY2x1ZGVzKCdfX3R5cGVuYW1lJylcbiAgKTtcbiAgbGV0IGtleXMgPSB1bmRlZmluZWQ7XG4gIGxldCBpbmNsdWRlID0gdW5kZWZpbmVkO1xuICBpZiAoc2VsZWN0ZWRGaWVsZHMgJiYgc2VsZWN0ZWRGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgIGtleXMgPSBzZWxlY3RlZEZpZWxkcy5qb2luKCcsJyk7XG4gICAgaW5jbHVkZSA9IHNlbGVjdGVkRmllbGRzXG4gICAgICAucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGZpZWxkcyA9IGZpZWxkcy5zbGljZSgpO1xuICAgICAgICBsZXQgcG9pbnRJbmRleCA9IGZpZWxkLmxhc3RJbmRleE9mKCcuJyk7XG4gICAgICAgIHdoaWxlIChwb2ludEluZGV4ID4gMCkge1xuICAgICAgICAgIGNvbnN0IGxhc3RGaWVsZCA9IGZpZWxkLnNsaWNlKHBvaW50SW5kZXggKyAxKTtcbiAgICAgICAgICBmaWVsZCA9IGZpZWxkLnNsaWNlKDAsIHBvaW50SW5kZXgpO1xuICAgICAgICAgIGlmICghZmllbGRzLmluY2x1ZGVzKGZpZWxkKSAmJiBsYXN0RmllbGQgIT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIGZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcG9pbnRJbmRleCA9IGZpZWxkLmxhc3RJbmRleE9mKCcuJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH0sIFtdKVxuICAgICAgLmpvaW4oJywnKTtcbiAgfVxuICByZXR1cm4geyBrZXlzLCBpbmNsdWRlIH07XG59O1xuXG5jb25zdCBsb2FkID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcykgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcblxuICBjb25zdCBjbGFzc0ZpZWxkcyA9IE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKTtcblxuICBjb25zdCBjbGFzc0N1c3RvbUZpZWxkcyA9IGNsYXNzRmllbGRzLmZpbHRlcihcbiAgICBmaWVsZCA9PiAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5DTEFTU19GSUVMRFMpLmluY2x1ZGVzKGZpZWxkKVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lID0gYCR7Y2xhc3NOYW1lfVBvaW50ZXJgO1xuICBjb25zdCBwYXJzZVNjYWxhclZhbHVlID0gdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBvYmplY3RJZDogdmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJyAmJlxuICAgICAgdmFsdWUuY2xhc3NOYW1lID09PSBjbGFzc05hbWUgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgZGVmYXVsdEdyYXBoUUxUeXBlcy5UeXBlVmFsaWRhdGlvbkVycm9yKFxuICAgICAgdmFsdWUsXG4gICAgICBjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZVxuICAgICk7XG4gIH07XG4gIGNvbnN0IGNsYXNzR3JhcGhRTFNjYWxhclR5cGUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWV9IGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgJHtjbGFzc05hbWV9IHBvaW50ZXJzLmAsXG4gICAgcGFyc2VWYWx1ZTogcGFyc2VTY2FsYXJWYWx1ZSxcbiAgICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicgJiZcbiAgICAgICAgdmFsdWUuY2xhc3NOYW1lID09PSBjbGFzc05hbWUgJiZcbiAgICAgICAgdHlwZW9mIHZhbHVlLm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZS5vYmplY3RJZDtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IGRlZmF1bHRHcmFwaFFMVHlwZXMuVHlwZVZhbGlkYXRpb25FcnJvcihcbiAgICAgICAgdmFsdWUsXG4gICAgICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lXG4gICAgICApO1xuICAgIH0sXG4gICAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgICByZXR1cm4gcGFyc2VTY2FsYXJWYWx1ZShhc3QudmFsdWUpO1xuICAgICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gYXN0LmZpZWxkcy5maW5kKFxuICAgICAgICAgIGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdjbGFzc05hbWUnXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IG9iamVjdElkID0gYXN0LmZpZWxkcy5maW5kKFxuICAgICAgICAgIGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdvYmplY3RJZCdcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIF9fdHlwZSAmJlxuICAgICAgICAgIF9fdHlwZS52YWx1ZSAmJlxuICAgICAgICAgIGNsYXNzTmFtZSAmJlxuICAgICAgICAgIGNsYXNzTmFtZS52YWx1ZSAmJlxuICAgICAgICAgIG9iamVjdElkICYmXG4gICAgICAgICAgb2JqZWN0SWQudmFsdWVcbiAgICAgICAgKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlU2NhbGFyVmFsdWUoe1xuICAgICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RJZC52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgZGVmYXVsdEdyYXBoUUxUeXBlcy5UeXBlVmFsaWRhdGlvbkVycm9yKFxuICAgICAgICBhc3Qua2luZCxcbiAgICAgICAgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWVcbiAgICAgICk7XG4gICAgfSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9UmVsYXRpb25PcGA7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIHJlbGF0aW9ucyB3aXRoIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICBfb3A6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvcGVyYXRpb24gdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVMQVRJT05fT1ApLFxuICAgICAgfSxcbiAgICAgIG9wczoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnSW4gdGhlIGNhc2Ugb2YgYSBCYXRjaCBvcGVyYXRpb24sIHRoaXMgaXMgdGhlIGxpc3Qgb2Ygb3BlcmF0aW9ucyB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlKSksXG4gICAgICB9LFxuICAgICAgb2JqZWN0czoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnSW4gdGhlIGNhc2Ugb2YgYSBBZGRSZWxhdGlvbiBvciBSZW1vdmVSZWxhdGlvbiBvcGVyYXRpb24sIHRoaXMgaXMgdGhlIGxpc3Qgb2Ygb2JqZWN0cyB0byBiZSBhZGRlZC9yZW1vdmVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSkpLFxuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMSW5wdXRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1GaWVsZHNgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxJbnB1dFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMSW5wdXRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTElucHV0VHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBpbnB1dHRpbmcgb2JqZWN0cyBvZiAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc0N1c3RvbUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IG1hcElucHV0VHlwZShcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9BVFQsXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goY2xhc3NHcmFwaFFMSW5wdXRUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9UG9pbnRlckNvbnN0cmFpbnRgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIHBvaW50ZXIgZmllbGQgdG8gJHtjbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiB7XG4gICAgICBfZXE6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX2VxKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpLFxuICAgICAgX25lOiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9uZShjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9pbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5faW4oY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSksXG4gICAgICBfbmluOiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9uaW4oY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSksXG4gICAgICBfZXhpc3RzOiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9leGlzdHMsXG4gICAgICBfc2VsZWN0OiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9zZWxlY3QsXG4gICAgICBfZG9udFNlbGVjdDogZGVmYXVsdEdyYXBoUUxUeXBlcy5fZG9udFNlbGVjdCxcbiAgICAgIF9pblF1ZXJ5OiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGlzIGlzIHRoZSAkaW5RdWVyeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBlcXVhbHMgdG8gYW55IG9mIHRoZSBpZHMgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNVQlFVRVJZLFxuICAgICAgfSxcbiAgICAgIF9ub3RJblF1ZXJ5OiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGlzIGlzIHRoZSAkbm90SW5RdWVyeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYW55IG9mIHRoZSBpZHMgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNVQlFVRVJZLFxuICAgICAgfSxcbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lID0gYCR7Y2xhc3NOYW1lfUNvbnN0cmFpbnRzYDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtjbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgLi4uY2xhc3NGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSBtYXBDb25zdHJhaW50VHlwZShcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICApO1xuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgfSwge30pLFxuICAgICAgX29yOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJG9yIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgX2FuZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlICRhbmQgb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBfbm9yOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJG5vciBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9T3JkZXJgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIHdoZW4gc29ydGluZyBvYmplY3RzIG9mIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzRmllbGRzLnJlZHVjZSgob3JkZXJGaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5vcmRlckZpZWxkcyxcbiAgICAgICAgW2Ake2ZpZWxkfV9BU0NgXTogeyB2YWx1ZTogZmllbGQgfSxcbiAgICAgICAgW2Ake2ZpZWxkfV9ERVNDYF06IHsgdmFsdWU6IGAtJHtmaWVsZH1gIH0sXG4gICAgICB9O1xuICAgIH0sIHt9KSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxPcmRlclR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRBcmdzID0ge1xuICAgIHdoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICB9LFxuICAgIG9yZGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBmaWVsZHMgdG8gYmUgdXNlZCB3aGVuIHNvcnRpbmcgdGhlIGRhdGEgZmV0Y2hlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPcmRlclR5cGUpKSxcbiAgICB9LFxuICAgIHNraXA6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0tJUF9BVFQsXG4gICAgbGltaXQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuTElNSVRfQVRULFxuICAgIHJlYWRQcmVmZXJlbmNlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLklOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIH07XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9Q2xhc3NgO1xuICBjb25zdCBvdXRwdXRGaWVsZHMgPSAoKSA9PiB7XG4gICAgcmV0dXJuIGNsYXNzQ3VzdG9tRmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgdHlwZSA9IG1hcE91dHB1dFR5cGUoXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICk7XG4gICAgICBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID1cbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzXG4gICAgICAgICAgXTtcbiAgICAgICAgY29uc3QgYXJncyA9IHRhcmdldFBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgID8gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzLmNsYXNzR3JhcGhRTEZpbmRBcmdzXG4gICAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgIH0gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluY2x1ZGVzKCcuJykpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQuc2xpY2UoZmllbGQuaW5kZXhPZignLicpICsgMSkpXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgICAgICAgIHNvdXJjZVtmaWVsZF0uY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBfcmVsYXRlZFRvOiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdElkOiBzb3VyY2Uub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAuLi4od2hlcmUgfHwge30pLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMubWFwKGZpZWxkID0+IGZpZWxkLnNwbGl0KCcuJywgMSlbMF0pXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKHNvdXJjZVtmaWVsZF0gJiYgc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzLm1hcChjb29yZGluYXRlID0+ICh7XG4gICAgICAgICAgICAgICAgICBsYXRpdHVkZTogY29vcmRpbmF0ZVswXSxcbiAgICAgICAgICAgICAgICAgIGxvbmdpdHVkZTogY29vcmRpbmF0ZVsxXSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH1cbiAgICB9LCBkZWZhdWx0R3JhcGhRTFR5cGVzLkNMQVNTX0ZJRUxEUyk7XG4gIH07XG4gIGNvbnN0IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWV9IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyBvYmplY3RzIG9mICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXM6IFtkZWZhdWx0R3JhcGhRTFR5cGVzLkNMQVNTXSxcbiAgICBmaWVsZHM6IG91dHB1dEZpZWxkcyxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9RmluZFJlc3VsdGA7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZU5hbWV9IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gdGhlICR7Y2xhc3NOYW1lfSBmaW5kIHF1ZXJ5IHRvIHJldHVybiB0aGUgZGF0YSBvZiB0aGUgbWF0Y2hlZCBvYmplY3RzLmAsXG4gICAgZmllbGRzOiB7XG4gICAgICByZXN1bHRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0cyByZXR1cm5lZCBieSB0aGUgcXVlcnknLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKSlcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgICBjb3VudDogZGVmYXVsdEdyYXBoUUxUeXBlcy5DT1VOVF9BVFQsXG4gICAgfSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdID0ge1xuICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMSW5wdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICB9O1xuXG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCBtZVR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogJ01lJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlIE1lIG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyB0aGUgY3VycmVudCB1c2VyIGRhdGEuYCxcbiAgICAgIGludGVyZmFjZXM6IFtkZWZhdWx0R3JhcGhRTFR5cGVzLkNMQVNTXSxcbiAgICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgICAgLi4ub3V0cHV0RmllbGRzKCksXG4gICAgICAgIHNlc3Npb25Ub2tlbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5TRVNTSU9OX1RPS0VOX0FUVCxcbiAgICAgIH0pLFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5tZVR5cGUgPSBtZVR5cGU7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKG1lVHlwZSk7XG5cbiAgICBjb25zdCB1c2VyU2lnblVwSW5wdXRUeXBlTmFtZSA9IGBfVXNlclNpZ25VcEZpZWxkc2A7XG4gICAgY29uc3QgdXNlclNpZ25VcElucHV0VHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICAgIG5hbWU6IHVzZXJTaWduVXBJbnB1dFR5cGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1c2VyU2lnblVwSW5wdXRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBvYmplY3RzIG9mICR7Y2xhc3NOYW1lfSBjbGFzcyB3aGVuIHNpZ25pbmcgdXAuYCxcbiAgICAgIGZpZWxkczogKCkgPT5cbiAgICAgICAgY2xhc3NDdXN0b21GaWVsZHMucmVkdWNlKFxuICAgICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gbWFwSW5wdXRUeXBlKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICAgIHR5cGU6XG4gICAgICAgICAgICAgICAgICAgIGZpZWxkID09PSAndXNlcm5hbWUnIHx8IGZpZWxkID09PSAncGFzc3dvcmQnXG4gICAgICAgICAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBQ0w6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0FUVCxcbiAgICAgICAgICB9XG4gICAgICAgICksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICdfVXNlcidcbiAgICBdLnNpZ25VcElucHV0VHlwZSA9IHVzZXJTaWduVXBJbnB1dFR5cGU7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKHVzZXJTaWduVXBJbnB1dFR5cGUpO1xuICB9XG59O1xuXG5leHBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGxvYWQgfTtcbiJdfQ==