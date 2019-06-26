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

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

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
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbIm1hcElucHV0VHlwZSIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiR3JhcGhRTFN0cmluZyIsIkdyYXBoUUxGbG9hdCIsIkdyYXBoUUxCb29sZWFuIiwiR3JhcGhRTExpc3QiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiQU5ZIiwiT0JKRUNUIiwiREFURSIsImNsYXNzR3JhcGhRTFNjYWxhclR5cGUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSIsIkZJTEUiLCJHRU9fUE9JTlQiLCJQT0xZR09OIiwiQllURVMiLCJ1bmRlZmluZWQiLCJtYXBPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJGSU5EX1JFU1VMVCIsIkZJTEVfSU5GTyIsIkdFT19QT0lOVF9JTkZPIiwiUE9MWUdPTl9JTkZPIiwibWFwQ29uc3RyYWludFR5cGUiLCJTVFJJTkdfQ09OU1RSQUlOVCIsIk5VTUJFUl9DT05TVFJBSU5UIiwiQk9PTEVBTl9DT05TVFJBSU5UIiwiQVJSQVlfQ09OU1RSQUlOVCIsIk9CSkVDVF9DT05TVFJBSU5UIiwiREFURV9DT05TVFJBSU5UIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUiLCJGSUxFX0NPTlNUUkFJTlQiLCJHRU9fUE9JTlRfQ09OU1RSQUlOVCIsIlBPTFlHT05fQ09OU1RSQUlOVCIsIkJZVEVTX0NPTlNUUkFJTlQiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJzZWxlY3RlZEZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiaW5jbHVkZXMiLCJrZXlzIiwiaW5jbHVkZSIsImxlbmd0aCIsImpvaW4iLCJyZWR1Y2UiLCJmaWVsZHMiLCJzbGljZSIsInBvaW50SW5kZXgiLCJsYXN0SW5kZXhPZiIsImxhc3RGaWVsZCIsInB1c2giLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsImNsYXNzRmllbGRzIiwiT2JqZWN0IiwiY2xhc3NDdXN0b21GaWVsZHMiLCJDTEFTU19GSUVMRFMiLCJjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZSIsInBhcnNlU2NhbGFyVmFsdWUiLCJ2YWx1ZSIsIl9fdHlwZSIsIm9iamVjdElkIiwiVHlwZVZhbGlkYXRpb25FcnJvciIsIkdyYXBoUUxTY2FsYXJUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwicGFyc2VWYWx1ZSIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiZmluZCIsImdyYXBoUUxUeXBlcyIsImNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJfb3AiLCJ0eXBlIiwiUkVMQVRJT05fT1AiLCJvcHMiLCJvYmplY3RzIiwiY2xhc3NHcmFwaFFMSW5wdXRUeXBlTmFtZSIsImNsYXNzR3JhcGhRTElucHV0VHlwZSIsIkFDTCIsIkFDTF9BVFQiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWUiLCJfZXEiLCJfbmUiLCJfaW4iLCJfbmluIiwiX2V4aXN0cyIsIl9zZWxlY3QiLCJfZG9udFNlbGVjdCIsIl9pblF1ZXJ5IiwiU1VCUVVFUlkiLCJfbm90SW5RdWVyeSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJfb3IiLCJfYW5kIiwiX25vciIsImNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxPcmRlclR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJ2YWx1ZXMiLCJvcmRlckZpZWxkcyIsImNsYXNzR3JhcGhRTEZpbmRBcmdzIiwid2hlcmUiLCJvcmRlciIsInNraXAiLCJTS0lQX0FUVCIsImxpbWl0IiwiTElNSVRfQVRUIiwicmVhZFByZWZlcmVuY2UiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsIm91dHB1dEZpZWxkcyIsInRhcmdldFBhcnNlQ2xhc3NUeXBlcyIsImFyZ3MiLCJyZXNvbHZlIiwic291cmNlIiwiY29udGV4dCIsInF1ZXJ5SW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwibWFwIiwiaW5kZXhPZiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCJfcmVsYXRlZFRvIiwib2JqZWN0Iiwia2V5Iiwic3BsaXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiaW50ZXJmYWNlcyIsIkNMQVNTIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVOYW1lIiwicmVzdWx0cyIsImNvdW50IiwiQ09VTlRfQVRUIiwibWVUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFZQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVBLE1BQU1BLFlBQVksR0FBRyxDQUFDQyxTQUFELEVBQVlDLFdBQVosRUFBeUJDLGVBQXpCLEtBQTZDO0FBQ2hFLFVBQVFGLFNBQVI7QUFDRSxTQUFLLFFBQUw7QUFDRSxhQUFPRyxzQkFBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPQyxxQkFBUDs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPQyx1QkFBUDs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPLElBQUlDLG9CQUFKLENBQWdCQyxtQkFBbUIsQ0FBQ0MsR0FBcEMsQ0FBUDs7QUFD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cUo7QUFQckI7QUFIK0MsR0FBdEIsQ0FBbkM7QUFhQXJHLEVBQUFBLGtCQUFrQixDQUFDd0IsWUFBbkIsQ0FBZ0MxQixJQUFoQyxDQUFxQ2hDLDBCQUFyQztBQUVBa0MsRUFBQUEsa0JBQWtCLENBQUNyRCxlQUFuQixDQUFtQ3VELFNBQW5DLElBQWdEO0FBQzlDOUMsSUFBQUEsc0JBRDhDO0FBRTlDQyxJQUFBQSwwQkFGOEM7QUFHOUM0RSxJQUFBQSxxQkFIOEM7QUFJOUN2RCxJQUFBQSwwQkFKOEM7QUFLOUNzRSxJQUFBQSwyQkFMOEM7QUFNOUNTLElBQUFBLG9CQU44QztBQU85QzdGLElBQUFBLHNCQVA4QztBQVE5Q0UsSUFBQUE7QUFSOEMsR0FBaEQ7O0FBV0EsTUFBSW9DLFNBQVMsS0FBSyxPQUFsQixFQUEyQjtBQUN6QixVQUFNb0csTUFBTSxHQUFHLElBQUlQLDBCQUFKLENBQXNCO0FBQ25DakYsTUFBQUEsSUFBSSxFQUFFLElBRDZCO0FBRW5DQyxNQUFBQSxXQUFXLEVBQUcseUZBRnFCO0FBR25DaUYsTUFBQUEsVUFBVSxFQUFFLENBQUNoSixtQkFBbUIsQ0FBQ2lKLEtBQXJCLENBSHVCO0FBSW5DeEcsTUFBQUEsTUFBTSxFQUFFLHdCQUNIOEUsWUFBWSxFQURUO0FBRU5nQyxRQUFBQSxZQUFZLEVBQUV2SixtQkFBbUIsQ0FBQ3dKO0FBRjVCO0FBSjJCLEtBQXRCLENBQWY7QUFTQXhHLElBQUFBLGtCQUFrQixDQUFDc0csTUFBbkIsR0FBNEJBLE1BQTVCO0FBQ0F0RyxJQUFBQSxrQkFBa0IsQ0FBQ3dCLFlBQW5CLENBQWdDMUIsSUFBaEMsQ0FBcUN3RyxNQUFyQztBQUNEO0FBQ0YsQ0F2WUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMU2NhbGFyVHlwZSxcbiAgR3JhcGhRTEVudW1UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi9vYmplY3RzUXVlcmllcyc7XG5cbmNvbnN0IG1hcElucHV0VHlwZSA9IChwYXJzZVR5cGUsIHRhcmdldENsYXNzLCBwYXJzZUNsYXNzVHlwZXMpID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxTY2FsYXJUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgIGlmIChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRTtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmNvbnN0IG1hcE91dHB1dFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBHcmFwaFFMU3RyaW5nO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gR3JhcGhRTEZsb2F0O1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlkpO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgaWYgKHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10pIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSU5EX1JFU1VMVCk7XG4gICAgICB9XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk87XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UX0lORk87XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX0lORk87XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQllURVM7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuY29uc3QgbWFwQ29uc3RyYWludFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNUUklOR19DT05TVFJBSU5UO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5OVU1CRVJfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJPT0xFQU5fQ09OU1RSQUlOVDtcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5BUlJBWV9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEVfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIGlmIChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVF9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTX0NPTlNUUkFJTlQ7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuY29uc3QgZXh0cmFjdEtleXNBbmRJbmNsdWRlID0gc2VsZWN0ZWRGaWVsZHMgPT4ge1xuICBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzLmZpbHRlcihcbiAgICBmaWVsZCA9PiAhZmllbGQuaW5jbHVkZXMoJ19fdHlwZW5hbWUnKVxuICApO1xuICBsZXQga2V5cyA9IHVuZGVmaW5lZDtcbiAgbGV0IGluY2x1ZGUgPSB1bmRlZmluZWQ7XG4gIGlmIChzZWxlY3RlZEZpZWxkcyAmJiBzZWxlY3RlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAga2V5cyA9IHNlbGVjdGVkRmllbGRzLmpvaW4oJywnKTtcbiAgICBpbmNsdWRlID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAgIC5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgZmllbGRzID0gZmllbGRzLnNsaWNlKCk7XG4gICAgICAgIGxldCBwb2ludEluZGV4ID0gZmllbGQubGFzdEluZGV4T2YoJy4nKTtcbiAgICAgICAgd2hpbGUgKHBvaW50SW5kZXggPiAwKSB7XG4gICAgICAgICAgY29uc3QgbGFzdEZpZWxkID0gZmllbGQuc2xpY2UocG9pbnRJbmRleCArIDEpO1xuICAgICAgICAgIGZpZWxkID0gZmllbGQuc2xpY2UoMCwgcG9pbnRJbmRleCk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMuaW5jbHVkZXMoZmllbGQpICYmIGxhc3RGaWVsZCAhPT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgZmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwb2ludEluZGV4ID0gZmllbGQubGFzdEluZGV4T2YoJy4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfSwgW10pXG4gICAgICAuam9pbignLCcpO1xuICB9XG4gIHJldHVybiB7IGtleXMsIGluY2x1ZGUgfTtcbn07XG5cbmNvbnN0IGxvYWQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzKSA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuXG4gIGNvbnN0IGNsYXNzRmllbGRzID0gT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpO1xuXG4gIGNvbnN0IGNsYXNzQ3VzdG9tRmllbGRzID0gY2xhc3NGaWVsZHMuZmlsdGVyKFxuICAgIGZpZWxkID0+ICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLkNMQVNTX0ZJRUxEUykuaW5jbHVkZXMoZmllbGQpXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9UG9pbnRlcmA7XG4gIGNvbnN0IHBhcnNlU2NhbGFyVmFsdWUgPSB2YWx1ZSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIG9iamVjdElkOiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInICYmXG4gICAgICB2YWx1ZS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICB2YWx1ZSxcbiAgICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lXG4gICAgKTtcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZX0gaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSAke2NsYXNzTmFtZX0gcG9pbnRlcnMuYCxcbiAgICBwYXJzZVZhbHVlOiBwYXJzZVNjYWxhclZhbHVlLFxuICAgIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJyAmJlxuICAgICAgICB2YWx1ZS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSAmJlxuICAgICAgICB0eXBlb2YgdmFsdWUub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlLm9iamVjdElkO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgZGVmYXVsdEdyYXBoUUxUeXBlcy5UeXBlVmFsaWRhdGlvbkVycm9yKFxuICAgICAgICB2YWx1ZSxcbiAgICAgICAgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWVcbiAgICAgICk7XG4gICAgfSxcbiAgICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICAgIHJldHVybiBwYXJzZVNjYWxhclZhbHVlKGFzdC52YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBhc3QuZmllbGRzLmZpbmQoXG4gICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2NsYXNzTmFtZSdcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3Qgb2JqZWN0SWQgPSBhc3QuZmllbGRzLmZpbmQoXG4gICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ29iamVjdElkJ1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgX190eXBlICYmXG4gICAgICAgICAgX190eXBlLnZhbHVlICYmXG4gICAgICAgICAgY2xhc3NOYW1lICYmXG4gICAgICAgICAgY2xhc3NOYW1lLnZhbHVlICYmXG4gICAgICAgICAgb2JqZWN0SWQgJiZcbiAgICAgICAgICBvYmplY3RJZC52YWx1ZVxuICAgICAgICApIHtcbiAgICAgICAgICByZXR1cm4gcGFyc2VTY2FsYXJWYWx1ZSh7XG4gICAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLnZhbHVlLnZhbHVlLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdElkLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICAgIGFzdC5raW5kLFxuICAgICAgICBjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZVxuICAgICAgKTtcbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1SZWxhdGlvbk9wYDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgcmVsYXRpb25zIHdpdGggdGhlICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIF9vcDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9wZXJhdGlvbiB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUxBVElPTl9PUCksXG4gICAgICB9LFxuICAgICAgb3BzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdJbiB0aGUgY2FzZSBvZiBhIEJhdGNoIG9wZXJhdGlvbiwgdGhpcyBpcyB0aGUgbGlzdCBvZiBvcGVyYXRpb25zIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGUpKSxcbiAgICAgIH0sXG4gICAgICBvYmplY3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdJbiB0aGUgY2FzZSBvZiBhIEFkZFJlbGF0aW9uIG9yIFJlbW92ZVJlbGF0aW9uIG9wZXJhdGlvbiwgdGhpcyBpcyB0aGUgbGlzdCBvZiBvYmplY3RzIHRvIGJlIGFkZGVkL3JlbW92ZWQuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxJbnB1dFR5cGVOYW1lID0gYCR7Y2xhc3NOYW1lfUZpZWxkc2A7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTElucHV0VHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxJbnB1dFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMSW5wdXRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBvYmplY3RzIG9mICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzQ3VzdG9tRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gbWFwSW5wdXRUeXBlKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0FUVCxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxJbnB1dFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1Qb2ludGVyQ29uc3RyYWludGA7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgcG9pbnRlciBmaWVsZCB0byAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIF9lcTogZGVmYXVsdEdyYXBoUUxUeXBlcy5fZXEoY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSksXG4gICAgICBfbmU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25lKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpLFxuICAgICAgX2luOiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9uaW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9leGlzdHM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX2V4aXN0cyxcbiAgICAgIF9zZWxlY3Q6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX3NlbGVjdCxcbiAgICAgIF9kb250U2VsZWN0OiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9kb250U2VsZWN0LFxuICAgICAgX2luUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRpblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUlksXG4gICAgICB9LFxuICAgICAgX25vdEluUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRub3RJblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUlksXG4gICAgICB9LFxuICAgIH0sXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9Q29uc3RyYWludHNgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0ZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgY29uc3QgdHlwZSA9IG1hcENvbnN0cmFpbnRUeXBlKFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBfb3I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkb3Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBfYW5kOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJGFuZCBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICAgIF9ub3I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkbm9yIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1PcmRlcmA7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIHZhbHVlczogY2xhc3NGaWVsZHMucmVkdWNlKChvcmRlckZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm9yZGVyRmllbGRzLFxuICAgICAgICBbYCR7ZmllbGR9X0FTQ2BdOiB7IHZhbHVlOiBmaWVsZCB9LFxuICAgICAgICBbYCR7ZmllbGR9X0RFU0NgXTogeyB2YWx1ZTogYC0ke2ZpZWxkfWAgfSxcbiAgICAgIH07XG4gICAgfSwge30pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpLFxuICAgIH0sXG4gICAgc2tpcDogZGVmYXVsdEdyYXBoUUxUeXBlcy5TS0lQX0FUVCxcbiAgICBsaW1pdDogZGVmYXVsdEdyYXBoUUxUeXBlcy5MSU1JVF9BVFQsXG4gICAgcmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgfTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1DbGFzc2A7XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NDdXN0b21GaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gbWFwT3V0cHV0VHlwZShcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3NcbiAgICAgICAgICBdO1xuICAgICAgICBjb25zdCBhcmdzID0gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3NcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5jbHVkZXMoJy4nKSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5zbGljZShmaWVsZC5pbmRleE9mKCcuJykgKyAxKSlcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgICAgICAgc291cmNlW2ZpZWxkXS5jbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIF9yZWxhdGVkVG86IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcy5tYXAoZmllbGQgPT4gZmllbGQuc3BsaXQoJy4nLCAxKVswXSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfVxuICAgIH0sIGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfRklFTERTKTtcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtjbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlczogW2RlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NdLFxuICAgIGZpZWxkczogb3V0cHV0RmllbGRzLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1GaW5kUmVzdWx0YDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgJHtjbGFzc05hbWV9IGZpbmQgcXVlcnkgdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSBtYXRjaGVkIG9iamVjdHMuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIHJlc3VsdHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3RzIHJldHVybmVkIGJ5IHRoZSBxdWVyeScsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpKVxuICAgICAgICApLFxuICAgICAgfSxcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxJbnB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gIH07XG5cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IG1lVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnTWUnLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgTWUgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIHRoZSBjdXJyZW50IHVzZXIgZGF0YS5gLFxuICAgICAgaW50ZXJmYWNlczogW2RlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NdLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICAuLi5vdXRwdXRGaWVsZHMoKSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNFU1NJT05fVE9LRU5fQVRULFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLm1lVHlwZSA9IG1lVHlwZTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2gobWVUeXBlKTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBsb2FkIH07XG4iXX0=