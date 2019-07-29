"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.extractKeysAndInclude = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

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

const getParseClassTypeConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.type || {};
};

const getInputFieldsAndConstraints = function (parseClass, parseClassConfig) {
  const classFields = Object.keys(parseClass.fields);
  const {
    inputFields: allowedInputFields,
    outputFields: allowedOutputFields,
    constraintFields: allowedConstraintFields,
    sortFields: allowedSortFields
  } = getParseClassTypeConfig(parseClassConfig);
  let classOutputFields;
  let classCreateFields;
  let classUpdateFields;
  let classConstraintFields;
  let classSortFields; // All allowed customs fields

  const classCustomFields = classFields.filter(field => {
    return !Object.keys(defaultGraphQLTypes.CLASS_FIELDS).includes(field);
  });

  if (allowedInputFields && allowedInputFields.create) {
    classCreateFields = classCustomFields.filter(field => {
      return allowedInputFields.create.includes(field);
    });
  } else {
    classCreateFields = classCustomFields;
  }

  if (allowedInputFields && allowedInputFields.update) {
    classUpdateFields = classCustomFields.filter(field => {
      return allowedInputFields.update.includes(field);
    });
  } else {
    classUpdateFields = classCustomFields;
  }

  if (allowedOutputFields) {
    classOutputFields = classCustomFields.filter(field => {
      return allowedOutputFields.includes(field);
    });
  } else {
    classOutputFields = classCustomFields;
  }

  if (allowedConstraintFields) {
    classConstraintFields = classCustomFields.filter(field => {
      return allowedConstraintFields.includes(field);
    });
  } else {
    classConstraintFields = classFields;
  }

  if (allowedSortFields) {
    classSortFields = allowedSortFields;

    if (!classSortFields.length) {
      // must have at least 1 order field
      // otherwise the FindArgs Input Type will throw.
      classSortFields.push({
        field: 'objectId',
        asc: true,
        desc: true
      });
    }
  } else {
    classSortFields = classFields.map(field => {
      return {
        field,
        asc: true,
        desc: true
      };
    });
  }

  return {
    classCreateFields,
    classUpdateFields,
    classConstraintFields,
    classOutputFields,
    classSortFields
  };
};

const load = (parseGraphQLSchema, parseClass, parseClassConfig) => {
  const {
    className
  } = parseClass;
  const {
    classCreateFields,
    classUpdateFields,
    classOutputFields,
    classConstraintFields,
    classSortFields
  } = getInputFieldsAndConstraints(parseClass, parseClassConfig);
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
  const classGraphQLCreateTypeName = `${className}CreateFields`;
  const classGraphQLCreateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${className} class.`,
    fields: () => classCreateFields.reduce((fields, field) => {
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
  parseGraphQLSchema.graphQLTypes.push(classGraphQLCreateType);
  const classGraphQLUpdateTypeName = `${className}UpdateFields`;
  const classGraphQLUpdateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLUpdateTypeName,
    description: `The ${classGraphQLUpdateTypeName} input type is used in operations that involve creation of objects in the ${className} class.`,
    fields: () => classUpdateFields.reduce((fields, field) => {
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
  parseGraphQLSchema.graphQLTypes.push(classGraphQLUpdateType);
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
    fields: () => _objectSpread({}, classConstraintFields.reduce((fields, field) => {
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
    values: classSortFields.reduce((sortFields, fieldConfig) => {
      const {
        field,
        asc,
        desc
      } = fieldConfig;

      const updatedSortFields = _objectSpread({}, sortFields);

      if (asc) {
        updatedSortFields[`${field}_ASC`] = {
          value: field
        };
      }

      if (desc) {
        updatedSortFields[`${field}_DESC`] = {
          value: `-${field}`
        };
      }

      return updatedSortFields;
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
    return classOutputFields.reduce((fields, field) => {
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
    classGraphQLCreateType,
    classGraphQLUpdateType,
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
    const userSignUpInputTypeName = '_UserSignUpFields';
    const userSignUpInputType = new _graphql.GraphQLInputObjectType({
      name: userSignUpInputTypeName,
      description: `The ${userSignUpInputTypeName} input type is used in operations that involve inputting objects of ${className} class when signing up.`,
      fields: () => classCreateFields.reduce((fields, field) => {
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
      }, {})
    });
    parseGraphQLSchema.parseClassTypes['_User'].signUpInputType = userSignUpInputType;
    parseGraphQLSchema.graphQLTypes.push(userSignUpInputType);
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbIm1hcElucHV0VHlwZSIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiR3JhcGhRTFN0cmluZyIsIkdyYXBoUUxGbG9hdCIsIkdyYXBoUUxCb29sZWFuIiwiR3JhcGhRTExpc3QiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiQU5ZIiwiT0JKRUNUIiwiREFURSIsImNsYXNzR3JhcGhRTFNjYWxhclR5cGUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSIsIkZJTEUiLCJHRU9fUE9JTlQiLCJQT0xZR09OIiwiQllURVMiLCJ1bmRlZmluZWQiLCJtYXBPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJGSU5EX1JFU1VMVCIsIkZJTEVfSU5GTyIsIkdFT19QT0lOVF9JTkZPIiwiUE9MWUdPTl9JTkZPIiwibWFwQ29uc3RyYWludFR5cGUiLCJTVFJJTkdfQ09OU1RSQUlOVCIsIk5VTUJFUl9DT05TVFJBSU5UIiwiQk9PTEVBTl9DT05TVFJBSU5UIiwiQVJSQVlfQ09OU1RSQUlOVCIsIk9CSkVDVF9DT05TVFJBSU5UIiwiREFURV9DT05TVFJBSU5UIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUiLCJGSUxFX0NPTlNUUkFJTlQiLCJHRU9fUE9JTlRfQ09OU1RSQUlOVCIsIlBPTFlHT05fQ09OU1RSQUlOVCIsIkJZVEVTX0NPTlNUUkFJTlQiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJzZWxlY3RlZEZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiaW5jbHVkZXMiLCJrZXlzIiwiaW5jbHVkZSIsImxlbmd0aCIsImpvaW4iLCJyZWR1Y2UiLCJmaWVsZHMiLCJzbGljZSIsInBvaW50SW5kZXgiLCJsYXN0SW5kZXhPZiIsImxhc3RGaWVsZCIsInB1c2giLCJnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyIsInBhcnNlQ2xhc3NDb25maWciLCJ0eXBlIiwiZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyIsInBhcnNlQ2xhc3MiLCJjbGFzc0ZpZWxkcyIsIk9iamVjdCIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiQ0xBU1NfRklFTERTIiwiY3JlYXRlIiwidXBkYXRlIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJjbGFzc05hbWUiLCJjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZSIsInBhcnNlU2NhbGFyVmFsdWUiLCJ2YWx1ZSIsIl9fdHlwZSIsIm9iamVjdElkIiwiVHlwZVZhbGlkYXRpb25FcnJvciIsIkdyYXBoUUxTY2FsYXJUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwicGFyc2VWYWx1ZSIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiZmluZCIsImdyYXBoUUxUeXBlcyIsImNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJfb3AiLCJSRUxBVElPTl9PUCIsIm9wcyIsIm9iamVjdHMiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJBQ0wiLCJBQ0xfQVRUIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGVOYW1lIiwiX2VxIiwiX25lIiwiX2luIiwiX25pbiIsIl9leGlzdHMiLCJfc2VsZWN0IiwiX2RvbnRTZWxlY3QiLCJfaW5RdWVyeSIsIlNVQlFVRVJZIiwiX25vdEluUXVlcnkiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlIiwiX29yIiwiX2FuZCIsIl9ub3IiLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsImNsYXNzR3JhcGhRTEZpbmRBcmdzIiwid2hlcmUiLCJvcmRlciIsInNraXAiLCJTS0lQX0FUVCIsImxpbWl0IiwiTElNSVRfQVRUIiwicmVhZFByZWZlcmVuY2UiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsInRhcmdldFBhcnNlQ2xhc3NUeXBlcyIsImFyZ3MiLCJyZXNvbHZlIiwic291cmNlIiwiY29udGV4dCIsInF1ZXJ5SW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwiaW5kZXhPZiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCJfcmVsYXRlZFRvIiwib2JqZWN0Iiwia2V5Iiwic3BsaXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiaW50ZXJmYWNlcyIsIkNMQVNTIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVOYW1lIiwicmVzdWx0cyIsImNvdW50IiwiQ09VTlRfQVRUIiwibWVUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyU2lnblVwSW5wdXRUeXBlTmFtZSIsInVzZXJTaWduVXBJbnB1dFR5cGUiLCJzaWduVXBJbnB1dFR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFZQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsWUFBWSxHQUFHLENBQUNDLFNBQUQsRUFBWUMsV0FBWixFQUF5QkMsZUFBekIsS0FBNkM7QUFDaEUsVUFBUUYsU0FBUjtBQUNFLFNBQUssUUFBTDtBQUNFLGFBQU9HLHNCQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9DLHFCQUFQOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9DLHVCQUFQOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU8sSUFBSUMsb0JBQUosQ0FBZ0JDLG1CQUFtQixDQUFDQyxHQUFwQyxDQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9ELG1CQUFtQixDQUFDRSxNQUEzQjs7QUFDRixTQUFLLE1BQUw7QUFDRSxhQUFPRixtQkFBbUIsQ0FBQ0csSUFBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsVUFBSVIsZUFBZSxDQUFDRCxXQUFELENBQW5CLEVBQWtDO0FBQ2hDLGVBQU9DLGVBQWUsQ0FBQ0QsV0FBRCxDQUFmLENBQTZCVSxzQkFBcEM7QUFDRCxPQUZELE1BRU87QUFDTCxlQUFPSixtQkFBbUIsQ0FBQ0UsTUFBM0I7QUFDRDs7QUFDSCxTQUFLLFVBQUw7QUFDRSxVQUFJUCxlQUFlLENBQUNELFdBQUQsQ0FBbkIsRUFBa0M7QUFDaEMsZUFBT0MsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJXLDBCQUFwQztBQUNELE9BRkQsTUFFTztBQUNMLGVBQU9MLG1CQUFtQixDQUFDRSxNQUEzQjtBQUNEOztBQUNILFNBQUssTUFB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Q0FDdkIyRCxVQUFVLENBQUNWLE1BQVgsQ0FBa0JQLEtBQWxCLEVBQXlCZSxJQURGLEVBRXZCRSxVQUFVLENBQUNWLE1BQVgsQ0FBa0JQLEtBQWxCLEVBQXlCeEMsV0FGRixFQUd2QmlGLGtCQUFrQixDQUFDaEYsZUFISSxDQUF6Qjs7QUFLQSxZQUFJc0QsSUFBSixFQUFVO0FBQ1IsbUNBQ0tSLE1BREw7QUFFRSxhQUFDUCxLQUFELEdBQVM7QUFDUG1ELGNBQUFBLFdBQVcsRUFBRyxzQkFBcUJuRCxLQUFNLEdBRGxDO0FBRVBlLGNBQUFBLElBQUksRUFDRmYsS0FBSyxLQUFLLFVBQVYsSUFBd0JBLEtBQUssS0FBSyxVQUFsQyxHQUNJLElBQUlyQix1QkFBSixDQUFtQm9DLElBQW5CLENBREosR0FFSUE7QUFMQztBQUZYO0FBVUQsU0FYRCxNQVdPO0FBQ0wsaUJBQU9SLE1BQVA7QUFDRDtBQUNGLE9BcEJELEVBb0JHLEVBcEJIO0FBSm1ELEtBQTNCLENBQTVCO0FBMEJBa0MsSUFBQUEsa0JBQWtCLENBQUNoRixlQUFuQixDQUNFLE9BREYsRUFFRXNMLGVBRkYsR0FFb0JELG1CQUZwQjtBQUdBckcsSUFBQUEsa0JBQWtCLENBQUNtQixZQUFuQixDQUFnQ2hELElBQWhDLENBQXFDa0ksbUJBQXJDO0FBQ0Q7QUFDRixDQWxkRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEtpbmQsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMRmxvYXQsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxTY2FsYXJUeXBlLFxuICBHcmFwaFFMRW51bVR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5cbmNvbnN0IG1hcElucHV0VHlwZSA9IChwYXJzZVR5cGUsIHRhcmdldENsYXNzLCBwYXJzZUNsYXNzVHlwZXMpID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxTY2FsYXJUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgIGlmIChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRTtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmNvbnN0IG1hcE91dHB1dFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBHcmFwaFFMU3RyaW5nO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gR3JhcGhRTEZsb2F0O1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlkpO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgaWYgKHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10pIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSU5EX1JFU1VMVCk7XG4gICAgICB9XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk87XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UX0lORk87XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX0lORk87XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQllURVM7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuY29uc3QgbWFwQ29uc3RyYWludFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNUUklOR19DT05TVFJBSU5UO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5OVU1CRVJfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJPT0xFQU5fQ09OU1RSQUlOVDtcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5BUlJBWV9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEVfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIGlmIChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVF9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTX0NPTlNUUkFJTlQ7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuY29uc3QgZXh0cmFjdEtleXNBbmRJbmNsdWRlID0gc2VsZWN0ZWRGaWVsZHMgPT4ge1xuICBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzLmZpbHRlcihcbiAgICBmaWVsZCA9PiAhZmllbGQuaW5jbHVkZXMoJ19fdHlwZW5hbWUnKVxuICApO1xuICBsZXQga2V5cyA9IHVuZGVmaW5lZDtcbiAgbGV0IGluY2x1ZGUgPSB1bmRlZmluZWQ7XG4gIGlmIChzZWxlY3RlZEZpZWxkcyAmJiBzZWxlY3RlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAga2V5cyA9IHNlbGVjdGVkRmllbGRzLmpvaW4oJywnKTtcbiAgICBpbmNsdWRlID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAgIC5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgZmllbGRzID0gZmllbGRzLnNsaWNlKCk7XG4gICAgICAgIGxldCBwb2ludEluZGV4ID0gZmllbGQubGFzdEluZGV4T2YoJy4nKTtcbiAgICAgICAgd2hpbGUgKHBvaW50SW5kZXggPiAwKSB7XG4gICAgICAgICAgY29uc3QgbGFzdEZpZWxkID0gZmllbGQuc2xpY2UocG9pbnRJbmRleCArIDEpO1xuICAgICAgICAgIGZpZWxkID0gZmllbGQuc2xpY2UoMCwgcG9pbnRJbmRleCk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMuaW5jbHVkZXMoZmllbGQpICYmIGxhc3RGaWVsZCAhPT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgZmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwb2ludEluZGV4ID0gZmllbGQubGFzdEluZGV4T2YoJy4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfSwgW10pXG4gICAgICAuam9pbignLCcpO1xuICB9XG4gIHJldHVybiB7IGtleXMsIGluY2x1ZGUgfTtcbn07XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnID0gZnVuY3Rpb24oXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnR5cGUpIHx8IHt9O1xufTtcblxuY29uc3QgZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc0ZpZWxkcyA9IE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKTtcbiAgY29uc3Qge1xuICAgIGlucHV0RmllbGRzOiBhbGxvd2VkSW5wdXRGaWVsZHMsXG4gICAgb3V0cHV0RmllbGRzOiBhbGxvd2VkT3V0cHV0RmllbGRzLFxuICAgIGNvbnN0cmFpbnRGaWVsZHM6IGFsbG93ZWRDb25zdHJhaW50RmllbGRzLFxuICAgIHNvcnRGaWVsZHM6IGFsbG93ZWRTb3J0RmllbGRzLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgbGV0IGNsYXNzT3V0cHV0RmllbGRzO1xuICBsZXQgY2xhc3NDcmVhdGVGaWVsZHM7XG4gIGxldCBjbGFzc1VwZGF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzQ29uc3RyYWludEZpZWxkcztcbiAgbGV0IGNsYXNzU29ydEZpZWxkcztcblxuICAvLyBBbGwgYWxsb3dlZCBjdXN0b21zIGZpZWxkc1xuICBjb25zdCBjbGFzc0N1c3RvbUZpZWxkcyA9IGNsYXNzRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgcmV0dXJuICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLkNMQVNTX0ZJRUxEUykuaW5jbHVkZXMoZmllbGQpO1xuICB9KTtcblxuICBpZiAoYWxsb3dlZElucHV0RmllbGRzICYmIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUpIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZElucHV0RmllbGRzLmNyZWF0ZS5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuICBpZiAoYWxsb3dlZElucHV0RmllbGRzICYmIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUpIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZElucHV0RmllbGRzLnVwZGF0ZS5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuXG4gIGlmIChhbGxvd2VkT3V0cHV0RmllbGRzKSB7XG4gICAgY2xhc3NPdXRwdXRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRPdXRwdXRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMpIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRDb25zdHJhaW50RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0ZpZWxkcztcbiAgfVxuXG4gIGlmIChhbGxvd2VkU29ydEZpZWxkcykge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGFsbG93ZWRTb3J0RmllbGRzO1xuICAgIGlmICghY2xhc3NTb3J0RmllbGRzLmxlbmd0aCkge1xuICAgICAgLy8gbXVzdCBoYXZlIGF0IGxlYXN0IDEgb3JkZXIgZmllbGRcbiAgICAgIC8vIG90aGVyd2lzZSB0aGUgRmluZEFyZ3MgSW5wdXQgVHlwZSB3aWxsIHRocm93LlxuICAgICAgY2xhc3NTb3J0RmllbGRzLnB1c2goe1xuICAgICAgICBmaWVsZDogJ29iamVjdElkJyxcbiAgICAgICAgYXNjOiB0cnVlLFxuICAgICAgICBkZXNjOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGNsYXNzRmllbGRzLm1hcChmaWVsZCA9PiB7XG4gICAgICByZXR1cm4geyBmaWVsZCwgYXNjOiB0cnVlLCBkZXNjOiB0cnVlIH07XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH07XG59O1xuXG5jb25zdCBsb2FkID0gKFxuICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IHsgY2xhc3NOYW1lIH0gPSBwYXJzZUNsYXNzO1xuICBjb25zdCB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfSA9IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMocGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9UG9pbnRlcmA7XG4gIGNvbnN0IHBhcnNlU2NhbGFyVmFsdWUgPSB2YWx1ZSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIG9iamVjdElkOiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInICYmXG4gICAgICB2YWx1ZS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICB2YWx1ZSxcbiAgICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lXG4gICAgKTtcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZX0gaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSAke2NsYXNzTmFtZX0gcG9pbnRlcnMuYCxcbiAgICBwYXJzZVZhbHVlOiBwYXJzZVNjYWxhclZhbHVlLFxuICAgIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJyAmJlxuICAgICAgICB2YWx1ZS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSAmJlxuICAgICAgICB0eXBlb2YgdmFsdWUub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlLm9iamVjdElkO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgZGVmYXVsdEdyYXBoUUxUeXBlcy5UeXBlVmFsaWRhdGlvbkVycm9yKFxuICAgICAgICB2YWx1ZSxcbiAgICAgICAgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWVcbiAgICAgICk7XG4gICAgfSxcbiAgICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICAgIHJldHVybiBwYXJzZVNjYWxhclZhbHVlKGFzdC52YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBhc3QuZmllbGRzLmZpbmQoXG4gICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2NsYXNzTmFtZSdcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3Qgb2JqZWN0SWQgPSBhc3QuZmllbGRzLmZpbmQoXG4gICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ29iamVjdElkJ1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgX190eXBlICYmXG4gICAgICAgICAgX190eXBlLnZhbHVlICYmXG4gICAgICAgICAgY2xhc3NOYW1lICYmXG4gICAgICAgICAgY2xhc3NOYW1lLnZhbHVlICYmXG4gICAgICAgICAgb2JqZWN0SWQgJiZcbiAgICAgICAgICBvYmplY3RJZC52YWx1ZVxuICAgICAgICApIHtcbiAgICAgICAgICByZXR1cm4gcGFyc2VTY2FsYXJWYWx1ZSh7XG4gICAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLnZhbHVlLnZhbHVlLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdElkLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICAgIGFzdC5raW5kLFxuICAgICAgICBjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZVxuICAgICAgKTtcbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1SZWxhdGlvbk9wYDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgcmVsYXRpb25zIHdpdGggdGhlICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIF9vcDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9wZXJhdGlvbiB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUxBVElPTl9PUCksXG4gICAgICB9LFxuICAgICAgb3BzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdJbiB0aGUgY2FzZSBvZiBhIEJhdGNoIG9wZXJhdGlvbiwgdGhpcyBpcyB0aGUgbGlzdCBvZiBvcGVyYXRpb25zIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGUpKSxcbiAgICAgIH0sXG4gICAgICBvYmplY3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdJbiB0aGUgY2FzZSBvZiBhIEFkZFJlbGF0aW9uIG9yIFJlbW92ZVJlbGF0aW9uIG9wZXJhdGlvbiwgdGhpcyBpcyB0aGUgbGlzdCBvZiBvYmplY3RzIHRvIGJlIGFkZGVkL3JlbW92ZWQuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1DcmVhdGVGaWVsZHNgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc0NyZWF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IG1hcElucHV0VHlwZShcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9BVFQsXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9VXBkYXRlRmllbGRzYDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtjbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NVcGRhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSBtYXBJbnB1dFR5cGUoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfQVRULFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1Qb2ludGVyQ29uc3RyYWludGA7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgcG9pbnRlciBmaWVsZCB0byAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIF9lcTogZGVmYXVsdEdyYXBoUUxUeXBlcy5fZXEoY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSksXG4gICAgICBfbmU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25lKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpLFxuICAgICAgX2luOiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9uaW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9leGlzdHM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX2V4aXN0cyxcbiAgICAgIF9zZWxlY3Q6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX3NlbGVjdCxcbiAgICAgIF9kb250U2VsZWN0OiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9kb250U2VsZWN0LFxuICAgICAgX2luUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRpblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUlksXG4gICAgICB9LFxuICAgICAgX25vdEluUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRub3RJblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUlksXG4gICAgICB9LFxuICAgIH0sXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9Q29uc3RyYWludHNgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0NvbnN0cmFpbnRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSBtYXBDb25zdHJhaW50VHlwZShcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICApO1xuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgfSwge30pLFxuICAgICAgX29yOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJG9yIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgX2FuZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlICRhbmQgb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBfbm9yOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJG5vciBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9T3JkZXJgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIHdoZW4gc29ydGluZyBvYmplY3RzIG9mIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgaWYgKGFzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fQVNDYF0gPSB7IHZhbHVlOiBmaWVsZCB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHtmaWVsZH1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpLFxuICAgIH0sXG4gICAgc2tpcDogZGVmYXVsdEdyYXBoUUxUeXBlcy5TS0lQX0FUVCxcbiAgICBsaW1pdDogZGVmYXVsdEdyYXBoUUxUeXBlcy5MSU1JVF9BVFQsXG4gICAgcmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgfTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1DbGFzc2A7XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NPdXRwdXRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gbWFwT3V0cHV0VHlwZShcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3NcbiAgICAgICAgICBdO1xuICAgICAgICBjb25zdCBhcmdzID0gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3NcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5jbHVkZXMoJy4nKSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5zbGljZShmaWVsZC5pbmRleE9mKCcuJykgKyAxKSlcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgICAgICAgc291cmNlW2ZpZWxkXS5jbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIF9yZWxhdGVkVG86IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcy5tYXAoZmllbGQgPT4gZmllbGQuc3BsaXQoJy4nLCAxKVswXSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfVxuICAgIH0sIGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfRklFTERTKTtcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtjbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlczogW2RlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NdLFxuICAgIGZpZWxkczogb3V0cHV0RmllbGRzLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1GaW5kUmVzdWx0YDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgJHtjbGFzc05hbWV9IGZpbmQgcXVlcnkgdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSBtYXRjaGVkIG9iamVjdHMuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIHJlc3VsdHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3RzIHJldHVybmVkIGJ5IHRoZSBxdWVyeScsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpKVxuICAgICAgICApLFxuICAgICAgfSxcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gIH07XG5cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IG1lVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnTWUnLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgTWUgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIHRoZSBjdXJyZW50IHVzZXIgZGF0YS5gLFxuICAgICAgaW50ZXJmYWNlczogW2RlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NdLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICAuLi5vdXRwdXRGaWVsZHMoKSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNFU1NJT05fVE9LRU5fQVRULFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLm1lVHlwZSA9IG1lVHlwZTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2gobWVUeXBlKTtcblxuICAgIGNvbnN0IHVzZXJTaWduVXBJbnB1dFR5cGVOYW1lID0gJ19Vc2VyU2lnblVwRmllbGRzJztcbiAgICBjb25zdCB1c2VyU2lnblVwSW5wdXRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogdXNlclNpZ25VcElucHV0VHlwZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VzZXJTaWduVXBJbnB1dFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgaW5wdXR0aW5nIG9iamVjdHMgb2YgJHtjbGFzc05hbWV9IGNsYXNzIHdoZW4gc2lnbmluZyB1cC5gLFxuICAgICAgZmllbGRzOiAoKSA9PlxuICAgICAgICBjbGFzc0NyZWF0ZUZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gbWFwSW5wdXRUeXBlKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlOlxuICAgICAgICAgICAgICAgICAgZmllbGQgPT09ICd1c2VybmFtZScgfHwgZmllbGQgPT09ICdwYXNzd29yZCdcbiAgICAgICAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgICAgICAgOiB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sIHt9KSxcbiAgICB9KTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgJ19Vc2VyJ1xuICAgIF0uc2lnblVwSW5wdXRUeXBlID0gdXNlclNpZ25VcElucHV0VHlwZTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2godXNlclNpZ25VcElucHV0VHlwZSk7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgbG9hZCB9O1xuIl19