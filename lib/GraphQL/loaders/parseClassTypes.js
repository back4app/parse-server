"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "extractKeysAndInclude", {
  enumerable: true,
  get: function () {
    return _parseGraphQLUtils.extractKeysAndInclude;
  }
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

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
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLPointerType) {
        return parseClassTypes[targetClass].classGraphQLPointerType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLRelationType) {
        return parseClassTypes[targetClass].classGraphQLRelationType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_INPUT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_INPUT;

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
      return new _graphql.GraphQLList(defaultGraphQLTypes.ARRAY_RESULT);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLOutputType) {
        return parseClassTypes[targetClass].classGraphQLOutputType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLFindResultType) {
        return new _graphql.GraphQLNonNull(parseClassTypes[targetClass].classGraphQLFindResultType);
      } else {
        return new _graphql.GraphQLNonNull(defaultGraphQLTypes.FIND_RESULT);
      }

    case 'File':
      return defaultGraphQLTypes.FILE_INFO;

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

const mapConstraintType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_WHERE_INPUT;

    case 'Number':
      return defaultGraphQLTypes.NUMBER_WHERE_INPUT;

    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_WHERE_INPUT;

    case 'Array':
      return defaultGraphQLTypes.ARRAY_WHERE_INPUT;

    case 'Object':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;

    case 'Date':
      return defaultGraphQLTypes.DATE_WHERE_INPUT;

    case 'Pointer':
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLConstraintType) {
        return parseClassTypes[targetClass].classGraphQLConstraintType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE_WHERE_INPUT;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_WHERE_INPUT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_WHERE_INPUT;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES_WHERE_INPUT;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;

    case 'Relation':
    default:
      return undefined;
  }
};

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
  } // Filters the "password" field from class _User


  if (parseClass.className === '_User') {
    classOutputFields = classOutputFields.filter(outputField => outputField !== 'password');
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
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const {
    classCreateFields,
    classUpdateFields,
    classOutputFields,
    classConstraintFields,
    classSortFields
  } = getInputFieldsAndConstraints(parseClass, parseClassConfig);
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const classGraphQLScalarTypeName = `${graphQLClassName}Pointer`;

  const parseScalarValue = value => {
    if (typeof value === 'string') {
      return {
        __type: 'Pointer',
        className: className,
        objectId: value
      };
    } else if (typeof value === 'object' && value.__type === 'Pointer' && value.className === className && typeof value.objectId === 'string') {
      return _objectSpread({}, value, {
        className
      });
    }

    throw new defaultGraphQLTypes.TypeValidationError(value, classGraphQLScalarTypeName);
  };

  let classGraphQLScalarType = new _graphql.GraphQLScalarType({
    name: classGraphQLScalarTypeName,
    description: `The ${classGraphQLScalarTypeName} is used in operations that involve ${graphQLClassName} pointers.`,
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
  classGraphQLScalarType = parseGraphQLSchema.addGraphQLType(classGraphQLScalarType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLCreateTypeName = `Create${graphQLClassName}FieldsInput`;
  let classGraphQLCreateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
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
  classGraphQLCreateType = parseGraphQLSchema.addGraphQLType(classGraphQLCreateType);
  const classGraphQLUpdateTypeName = `Update${graphQLClassName}FieldsInput`;
  let classGraphQLUpdateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLUpdateTypeName,
    description: `The ${classGraphQLUpdateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
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
  classGraphQLUpdateType = parseGraphQLSchema.addGraphQLType(classGraphQLUpdateType);
  const classGraphQLPointerTypeName = `${graphQLClassName}PointerInput`;
  let classGraphQLPointerType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLPointerTypeName,
    description: `Allow to link OR add and link an object of the ${graphQLClassName} class.`,
    fields: () => {
      const fields = {
        link: {
          description: `Link an existing object from ${graphQLClassName} class.`,
          type: defaultGraphQLTypes.POINTER_INPUT
        }
      };

      if (isCreateEnabled) {
        fields['createAndLink'] = {
          description: `Create and link an object from ${graphQLClassName} class.`,
          type: classGraphQLCreateType
        };
      }

      return fields;
    }
  });
  classGraphQLPointerType = parseGraphQLSchema.addGraphQLType(classGraphQLPointerType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLRelationTypeName = `${graphQLClassName}RelationInput`;
  let classGraphQLRelationType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationTypeName,
    description: `Allow to add, remove, createAndAdd objects of the ${graphQLClassName} class into a relation field.`,
    fields: () => {
      const fields = {
        add: {
          description: `Add an existing object from the ${graphQLClassName} class into the relation.`,
          type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(defaultGraphQLTypes.RELATION_INPUT))
        },
        remove: {
          description: `Remove an existing object from the ${graphQLClassName} class out of the relation.`,
          type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(defaultGraphQLTypes.RELATION_INPUT))
        }
      };

      if (isCreateEnabled) {
        fields['createAndAdd'] = {
          description: `Create and add an object of the ${graphQLClassName} class into the relation.`,
          type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLCreateType))
        };
      }

      return fields;
    }
  });
  classGraphQLRelationType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLConstraintTypeName = `${graphQLClassName}PointerWhereInput`;
  let classGraphQLConstraintType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintTypeName,
    description: `The ${classGraphQLConstraintTypeName} input type is used in operations that involve filtering objects by a pointer field to ${graphQLClassName} class.`,
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
        type: defaultGraphQLTypes.SUBQUERY_INPUT
      },
      _notInQuery: {
        description: 'This is the $notInQuery operator to specify a constraint to select the objects where a field do not equal to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY_INPUT
      }
    }
  });
  classGraphQLConstraintType = parseGraphQLSchema.addGraphQLType(classGraphQLConstraintType);
  const classGraphQLConstraintsTypeName = `${graphQLClassName}WhereInput`;
  let classGraphQLConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
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
  classGraphQLConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLConstraintsType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLOrderTypeName = `${graphQLClassName}Order`;
  let classGraphQLOrderType = new _graphql.GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${graphQLClassName} class.`,
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
  classGraphQLOrderType = parseGraphQLSchema.addGraphQLType(classGraphQLOrderType);
  const classGraphQLFindArgs = {
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT,
    limit: defaultGraphQLTypes.LIMIT_ATT,
    readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
    includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: defaultGraphQLTypes.SUBQUERY_READ_PREFERENCE_ATT
  };
  const classGraphQLOutputTypeName = `${graphQLClassName}`;

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
                } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.includes('.')).map(field => field.slice(field.indexOf('.') + 1)));
                return await objectsQueries.findObjects(source[field].className, _objectSpread({
                  _relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
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
      } else if (parseClass.fields[field].type === 'Array') {
        return _objectSpread({}, fields, {
          [field]: {
            description: `Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments`,
            type,

            async resolve(source) {
              if (!source[field]) return null;
              return source[field].map(async elem => {
                if (elem.className && elem.objectId && elem.__type === 'Object') {
                  return elem;
                } else {
                  return {
                    value: elem
                  };
                }
              });
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

  let classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${graphQLClassName} class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: outputFields
  });
  classGraphQLOutputType = parseGraphQLSchema.addGraphQLType(classGraphQLOutputType);
  const classGraphQLFindResultTypeName = `${graphQLClassName}FindResult`;
  let classGraphQLFindResultType = new _graphql.GraphQLObjectType({
    name: classGraphQLFindResultTypeName,
    description: `The ${classGraphQLFindResultTypeName} object type is used in the ${graphQLClassName} find query to return the data of the matched objects.`,
    fields: {
      results: {
        description: 'This is the objects returned by the query',
        type: new _graphql.GraphQLNonNull(new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)))
      },
      count: defaultGraphQLTypes.COUNT_ATT
    }
  });
  classGraphQLFindResultType = parseGraphQLSchema.addGraphQLType(classGraphQLFindResultType);
  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLPointerType,
    classGraphQLRelationType,
    classGraphQLScalarType,
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLConstraintType,
    classGraphQLConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType,
    config: {
      parseClassConfig,
      isCreateEnabled,
      isUpdateEnabled
    }
  };

  if (className === '_User') {
    const viewerType = new _graphql.GraphQLObjectType({
      name: 'Viewer',
      description: `The Viewer object type is used in operations that involve outputting the current user data.`,
      interfaces: [defaultGraphQLTypes.CLASS],
      fields: () => _objectSpread({}, outputFields(), {
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT
      })
    });
    parseGraphQLSchema.viewerType = viewerType;
    parseGraphQLSchema.addGraphQLType(viewerType, true, true);
    const userSignUpInputTypeName = 'SignUpFieldsInput';
    const userSignUpInputType = new _graphql.GraphQLInputObjectType({
      name: userSignUpInputTypeName,
      description: `The ${userSignUpInputTypeName} input type is used in operations that involve inputting objects of ${graphQLClassName} class when signing up.`,
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
    parseGraphQLSchema.addGraphQLType(userSignUpInputType, true, true);
    const userLogInInputTypeName = 'LogInFieldsInput';
    const userLogInInputType = new _graphql.GraphQLInputObjectType({
      name: userLogInInputTypeName,
      description: `The ${userLogInInputTypeName} input type is used to login.`,
      fields: {
        username: {
          description: 'This is the username used to log the user in.',
          type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
        },
        password: {
          description: 'This is the password used to log the user in.',
          type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
        }
      }
    });
    parseGraphQLSchema.addGraphQLType(userLogInInputType, true, true);
    parseGraphQLSchema.parseClassTypes[className].signUpInputType = userSignUpInputType;
    parseGraphQLSchema.parseClassTypes[className].logInInputType = userLogInInputType;
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbIm1hcElucHV0VHlwZSIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiR3JhcGhRTFN0cmluZyIsIkdyYXBoUUxGbG9hdCIsIkdyYXBoUUxCb29sZWFuIiwiR3JhcGhRTExpc3QiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiQU5ZIiwiT0JKRUNUIiwiREFURSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlIiwiRklMRSIsIkdFT19QT0lOVF9JTlBVVCIsIlBPTFlHT05fSU5QVVQiLCJCWVRFUyIsInVuZGVmaW5lZCIsIm1hcE91dHB1dFR5cGUiLCJBUlJBWV9SRVNVTFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkZJTkRfUkVTVUxUIiwiRklMRV9JTkZPIiwiR0VPX1BPSU5UIiwiUE9MWUdPTiIsIm1hcENvbnN0cmFpbnRUeXBlIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiT0JKRUNUX1dIRVJFX0lOUFVUIiwiREFURV9XSEVSRV9JTlBVVCIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlIiwiRklMRV9XSEVSRV9JTlBVVCIsIkdFT19QT0lOVF9XSEVSRV9JTlBVVCIsIlBPTFlHT05fV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiZmlsdGVyIiwiZmllbGQiLCJDTEFTU19GSUVMRFMiLCJpbmNsdWRlcyIsImNyZWF0ZSIsInVwZGF0ZSIsImNsYXNzTmFtZSIsIm91dHB1dEZpZWxkIiwibGVuZ3RoIiwicHVzaCIsImFzYyIsImRlc2MiLCJtYXAiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZ3JhcGhRTENsYXNzTmFtZSIsImlzQ3JlYXRlRW5hYmxlZCIsImlzVXBkYXRlRW5hYmxlZCIsImNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lIiwicGFyc2VTY2FsYXJWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwib2JqZWN0SWQiLCJUeXBlVmFsaWRhdGlvbkVycm9yIiwiY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSIsIkdyYXBoUUxTY2FsYXJUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwicGFyc2VWYWx1ZSIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiZmluZCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsInJlZHVjZSIsIkFDTCIsIkFDTF9BVFQiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUiLCJsaW5rIiwiUE9JTlRFUl9JTlBVVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUiLCJhZGQiLCJSRUxBVElPTl9JTlBVVCIsInJlbW92ZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSIsIl9lcSIsIl9uZSIsIl9pbiIsIl9uaW4iLCJfZXhpc3RzIiwiX3NlbGVjdCIsIl9kb250U2VsZWN0IiwiX2luUXVlcnkiLCJTVUJRVUVSWV9JTlBVVCIsIl9ub3RJblF1ZXJ5IiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSIsIl9vciIsIl9hbmQiLCJfbm9yIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTE9yZGVyVHlwZSIsIkdyYXBoUUxFbnVtVHlwZSIsInZhbHVlcyIsImZpZWxkQ29uZmlnIiwidXBkYXRlZFNvcnRGaWVsZHMiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwiU0tJUF9BVFQiLCJsaW1pdCIsIkxJTUlUX0FUVCIsInJlYWRQcmVmZXJlbmNlIiwiUkVBRF9QUkVGRVJFTkNFX0FUVCIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsIklOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiaW5jbHVkZSIsInNsaWNlIiwiaW5kZXhPZiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCJfcmVsYXRlZFRvIiwib2JqZWN0Iiwia2V5Iiwic3BsaXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImVsZW0iLCJHcmFwaFFMT2JqZWN0VHlwZSIsImludGVyZmFjZXMiLCJDTEFTUyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSIsInJlc3VsdHMiLCJjb3VudCIsIkNPVU5UX0FUVCIsInZpZXdlclR5cGUiLCJzZXNzaW9uVG9rZW4iLCJTRVNTSU9OX1RPS0VOX0FUVCIsInVzZXJTaWduVXBJbnB1dFR5cGVOYW1lIiwidXNlclNpZ25VcElucHV0VHlwZSIsInVzZXJMb2dJbklucHV0VHlwZU5hbWUiLCJ1c2VyTG9nSW5JbnB1dFR5cGUiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwic2lnblVwSW5wdXRUeXBlIiwibG9nSW5JbnB1dFR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFZQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7O0FBS0EsTUFBTUEsWUFBWSxHQUFHLENBQUNDLFNBQUQsRUFBWUMsV0FBWixFQUF5QkMsZUFBekIsS0FBNkM7QUFDaEUsVUFBUUYsU0FBUjtBQUNFLFNBQUssUUFBTDtBQUNFLGFBQU9HLHNCQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9DLHFCQUFQOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9DLHVCQUFQOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU8sSUFBSUMsb0JBQUosQ0FBZ0JDLG1CQUFtQixDQUFDQyxHQUFwQyxDQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9ELG1CQUFtQixDQUFDRSxNQUEzQjs7QUFDRixTQUFLLE1BQUw7QUFDRSxhQUFPRixtQkFBbUIsQ0FBQ0csSUFBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsVUFDRVIsZUFBZSxDQUFDRCxXQUFELENBQWYsSUFDQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJVLHVCQUYvQixFQUdFO0FBQ0Es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QW1CbUIsSUFBbkIsQ0FESixHQUVJQTtBQUxDO0FBRlg7QUFVRCxTQVhELE1BV087QUFDTCxpQkFBT00sTUFBUDtBQUNEO0FBQ0YsT0FwQkQsRUFvQkcsRUFwQkg7QUFKbUQsS0FBM0IsQ0FBNUI7QUEwQkE2QixJQUFBQSxrQkFBa0IsQ0FBQ3NCLGNBQW5CLENBQWtDeUYsbUJBQWxDLEVBQXVELElBQXZELEVBQTZELElBQTdEO0FBRUEsVUFBTUMsc0JBQXNCLEdBQUcsa0JBQS9CO0FBQ0EsVUFBTUMsa0JBQWtCLEdBQUcsSUFBSXhGLCtCQUFKLENBQTJCO0FBQ3BEYixNQUFBQSxJQUFJLEVBQUVvRyxzQkFEOEM7QUFFcERuRyxNQUFBQSxXQUFXLEVBQUcsT0FBTW1HLHNCQUF1QiwrQkFGUztBQUdwRDdJLE1BQUFBLE1BQU0sRUFBRTtBQUNOK0ksUUFBQUEsUUFBUSxFQUFFO0FBQ1JyRyxVQUFBQSxXQUFXLEVBQUUsK0NBREw7QUFFUmhELFVBQUFBLElBQUksRUFBRSxJQUFJbkIsdUJBQUosQ0FBbUJuQixzQkFBbkI7QUFGRSxTQURKO0FBS040TCxRQUFBQSxRQUFRLEVBQUU7QUFDUnRHLFVBQUFBLFdBQVcsRUFBRSwrQ0FETDtBQUVSaEQsVUFBQUEsSUFBSSxFQUFFLElBQUluQix1QkFBSixDQUFtQm5CLHNCQUFuQjtBQUZFO0FBTEo7QUFINEMsS0FBM0IsQ0FBM0I7QUFjQXlFLElBQUFBLGtCQUFrQixDQUFDc0IsY0FBbkIsQ0FBa0MyRixrQkFBbEMsRUFBc0QsSUFBdEQsRUFBNEQsSUFBNUQ7QUFFQWpILElBQUFBLGtCQUFrQixDQUFDMUUsZUFBbkIsQ0FDRWtFLFNBREYsRUFFRTRILGVBRkYsR0FFb0JMLG1CQUZwQjtBQUdBL0csSUFBQUEsa0JBQWtCLENBQUMxRSxlQUFuQixDQUNFa0UsU0FERixFQUVFNkgsY0FGRixHQUVtQkosa0JBRm5CO0FBR0Q7QUFDRixDQS9qQkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMU2NhbGFyVHlwZSxcbiAgR3JhcGhRTEVudW1UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQge1xuICBleHRyYWN0S2V5c0FuZEluY2x1ZGUsXG4gIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBtYXBJbnB1dFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBHcmFwaFFMU3RyaW5nO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gR3JhcGhRTEZsb2F0O1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlkpO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxQb2ludGVyVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxSZWxhdGlvblR5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxSZWxhdGlvblR5cGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgICB9XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVF9JTlBVVDtcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fSU5QVVQ7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQllURVM7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuY29uc3QgbWFwT3V0cHV0VHlwZSA9IChwYXJzZVR5cGUsIHRhcmdldENsYXNzLCBwYXJzZUNsYXNzVHlwZXMpID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFSUkFZX1JFU1VMVCk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTkRfUkVTVUxUKTtcbiAgICAgIH1cbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmNvbnN0IG1hcENvbnN0cmFpbnRUeXBlID0gKHBhcnNlVHlwZSwgdGFyZ2V0Q2xhc3MsIHBhcnNlQ2xhc3NUeXBlcykgPT4ge1xuICBzd2l0Y2ggKHBhcnNlVHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5TVFJJTkdfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk5VTUJFUl9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJPT0xFQU5fV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQVJSQVlfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEVfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59O1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy50eXBlKSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMgPSBmdW5jdGlvbihcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NGaWVsZHMgPSBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcyk7XG4gIGNvbnN0IHtcbiAgICBpbnB1dEZpZWxkczogYWxsb3dlZElucHV0RmllbGRzLFxuICAgIG91dHB1dEZpZWxkczogYWxsb3dlZE91dHB1dEZpZWxkcyxcbiAgICBjb25zdHJhaW50RmllbGRzOiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcyxcbiAgICBzb3J0RmllbGRzOiBhbGxvd2VkU29ydEZpZWxkcyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGxldCBjbGFzc091dHB1dEZpZWxkcztcbiAgbGV0IGNsYXNzQ3JlYXRlRmllbGRzO1xuICBsZXQgY2xhc3NVcGRhdGVGaWVsZHM7XG4gIGxldCBjbGFzc0NvbnN0cmFpbnRGaWVsZHM7XG4gIGxldCBjbGFzc1NvcnRGaWVsZHM7XG5cbiAgLy8gQWxsIGFsbG93ZWQgY3VzdG9tcyBmaWVsZHNcbiAgY29uc3QgY2xhc3NDdXN0b21GaWVsZHMgPSBjbGFzc0ZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgIHJldHVybiAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5DTEFTU19GSUVMRFMpLmluY2x1ZGVzKGZpZWxkKTtcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKFxuICAgICAgb3V0cHV0RmllbGQgPT4gb3V0cHV0RmllbGQgIT09ICdwYXNzd29yZCdcbiAgICApO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRDb25zdHJhaW50RmllbGRzKSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NGaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZFNvcnRGaWVsZHMpIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBhbGxvd2VkU29ydEZpZWxkcztcbiAgICBpZiAoIWNsYXNzU29ydEZpZWxkcy5sZW5ndGgpIHtcbiAgICAgIC8vIG11c3QgaGF2ZSBhdCBsZWFzdCAxIG9yZGVyIGZpZWxkXG4gICAgICAvLyBvdGhlcndpc2UgdGhlIEZpbmRBcmdzIElucHV0IFR5cGUgd2lsbCB0aHJvdy5cbiAgICAgIGNsYXNzU29ydEZpZWxkcy5wdXNoKHtcbiAgICAgICAgZmllbGQ6ICdvYmplY3RJZCcsXG4gICAgICAgIGFzYzogdHJ1ZSxcbiAgICAgICAgZGVzYzogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBjbGFzc0ZpZWxkcy5tYXAoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIHsgZmllbGQsIGFzYzogdHJ1ZSwgZGVzYzogdHJ1ZSB9O1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9O1xufTtcblxuY29uc3QgbG9hZCA9IChcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfSA9IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMocGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVBvaW50ZXJgO1xuICBjb25zdCBwYXJzZVNjYWxhclZhbHVlID0gdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgIG9iamVjdElkOiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInICYmXG4gICAgICB2YWx1ZS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHsgLi4udmFsdWUsIGNsYXNzTmFtZSB9O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICB2YWx1ZSxcbiAgICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lXG4gICAgKTtcbiAgfTtcbiAgbGV0IGNsYXNzR3JhcGhRTFNjYWxhclR5cGUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWV9IGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgJHtncmFwaFFMQ2xhc3NOYW1lfSBwb2ludGVycy5gLFxuICAgIHBhcnNlVmFsdWU6IHBhcnNlU2NhbGFyVmFsdWUsXG4gICAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInICYmXG4gICAgICAgIHZhbHVlLmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lICYmXG4gICAgICAgIHR5cGVvZiB2YWx1ZS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICAgIHZhbHVlLFxuICAgICAgICBjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZVxuICAgICAgKTtcbiAgICB9LFxuICAgIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlU2NhbGFyVmFsdWUoYXN0LnZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICAgIGNvbnN0IGNsYXNzTmFtZSA9IGFzdC5maWVsZHMuZmluZChcbiAgICAgICAgICBmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnY2xhc3NOYW1lJ1xuICAgICAgICApO1xuICAgICAgICBjb25zdCBvYmplY3RJZCA9IGFzdC5maWVsZHMuZmluZChcbiAgICAgICAgICBmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnb2JqZWN0SWQnXG4gICAgICAgICk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBfX3R5cGUgJiZcbiAgICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgICBjbGFzc05hbWUgJiZcbiAgICAgICAgICBjbGFzc05hbWUudmFsdWUgJiZcbiAgICAgICAgICBvYmplY3RJZCAmJlxuICAgICAgICAgIG9iamVjdElkLnZhbHVlXG4gICAgICAgICkge1xuICAgICAgICAgIHJldHVybiBwYXJzZVNjYWxhclZhbHVlKHtcbiAgICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUudmFsdWUudmFsdWUsXG4gICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0SWQudmFsdWUudmFsdWUsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IGRlZmF1bHRHcmFwaFFMVHlwZXMuVHlwZVZhbGlkYXRpb25FcnJvcihcbiAgICAgICAgYXN0LmtpbmQsXG4gICAgICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lXG4gICAgICApO1xuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxTY2FsYXJUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSA9IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzQ3JlYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gbWFwSW5wdXRUeXBlKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0FUVCxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lID0gYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NVcGRhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSBtYXBJbnB1dFR5cGUoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfQVRULFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1Qb2ludGVySW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgQWxsb3cgdG8gbGluayBPUiBhZGQgYW5kIGxpbmsgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGxpbms6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYExpbmsgYW4gZXhpc3Rpbmcgb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9JTlRFUl9JTlBVVCxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgICAgIGZpZWxkc1snY3JlYXRlQW5kTGluayddID0ge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQ3JlYXRlIGFuZCBsaW5rIGFuIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1SZWxhdGlvbklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgQWxsb3cgdG8gYWRkLCByZW1vdmUsIGNyZWF0ZUFuZEFkZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gYSByZWxhdGlvbiBmaWVsZC5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBhZGQ6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYEFkZCBhbiBleGlzdGluZyBvYmplY3QgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChcbiAgICAgICAgICAgIG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLlJFTEFUSU9OX0lOUFVUKVxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgUmVtb3ZlIGFuIGV4aXN0aW5nIG9iamVjdCBmcm9tIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIG91dCBvZiB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoXG4gICAgICAgICAgICBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUxBVElPTl9JTlBVVClcbiAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSkpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcldoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBwb2ludGVyIGZpZWxkIHRvICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIF9lcTogZGVmYXVsdEdyYXBoUUxUeXBlcy5fZXEoY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSksXG4gICAgICBfbmU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25lKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpLFxuICAgICAgX2luOiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9uaW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9leGlzdHM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX2V4aXN0cyxcbiAgICAgIF9zZWxlY3Q6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX3NlbGVjdCxcbiAgICAgIF9kb250U2VsZWN0OiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9kb250U2VsZWN0LFxuICAgICAgX2luUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRpblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUllfSU5QVVQsXG4gICAgICB9LFxuICAgICAgX25vdEluUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRub3RJblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUllfSU5QVVQsXG4gICAgICB9LFxuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVdoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIC4uLmNsYXNzQ29uc3RyYWludEZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgY29uc3QgdHlwZSA9IG1hcENvbnN0cmFpbnRUeXBlKFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBfb3I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkb3Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBfYW5kOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJGFuZCBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICAgIF9ub3I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkbm9yIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgaWYgKGFzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fQVNDYF0gPSB7IHZhbHVlOiBmaWVsZCB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHtmaWVsZH1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRBcmdzID0ge1xuICAgIHdoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICB9LFxuICAgIG9yZGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBmaWVsZHMgdG8gYmUgdXNlZCB3aGVuIHNvcnRpbmcgdGhlIGRhdGEgZmV0Y2hlZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMT3JkZXJUeXBlXG4gICAgICAgID8gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPcmRlclR5cGUpKVxuICAgICAgICA6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBza2lwOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNLSVBfQVRULFxuICAgIGxpbWl0OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkxJTUlUX0FUVCxcbiAgICByZWFkUHJlZmVyZW5jZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5JTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5TVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICB9O1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICBjb25zdCBvdXRwdXRGaWVsZHMgPSAoKSA9PiB7XG4gICAgcmV0dXJuIGNsYXNzT3V0cHV0RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgdHlwZSA9IG1hcE91dHB1dFR5cGUoXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICk7XG4gICAgICBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID1cbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzXG4gICAgICAgICAgXTtcbiAgICAgICAgY29uc3QgYXJncyA9IHRhcmdldFBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgID8gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzLmNsYXNzR3JhcGhRTEZpbmRBcmdzXG4gICAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgIH0gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluY2x1ZGVzKCcuJykpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQuc2xpY2UoZmllbGQuaW5kZXhPZignLicpICsgMSkpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICAgICAgICBzb3VyY2VbZmllbGRdLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgX3JlbGF0ZWRUbzoge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdElkOiBzb3VyY2Uub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAuLi4od2hlcmUgfHwge30pLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMubWFwKGZpZWxkID0+IGZpZWxkLnNwbGl0KCcuJywgMSlbMF0pXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKHNvdXJjZVtmaWVsZF0gJiYgc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzLm1hcChjb29yZGluYXRlID0+ICh7XG4gICAgICAgICAgICAgICAgICBsYXRpdHVkZTogY29vcmRpbmF0ZVswXSxcbiAgICAgICAgICAgICAgICAgIGxvbmdpdHVkZTogY29vcmRpbmF0ZVsxXSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHNgLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmICghc291cmNlW2ZpZWxkXSkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLm1hcChhc3luYyBlbGVtID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICBlbGVtLmNsYXNzTmFtZSAmJlxuICAgICAgICAgICAgICAgICAgZWxlbS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICAgICAgZWxlbS5fX3R5cGUgPT09ICdPYmplY3QnXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZWxlbTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgdmFsdWU6IGVsZW0gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfVxuICAgIH0sIGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfRklFTERTKTtcbiAgfTtcbiAgbGV0IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWV9IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBpbnRlcmZhY2VzOiBbZGVmYXVsdEdyYXBoUUxUeXBlcy5DTEFTU10sXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfUZpbmRSZXN1bHRgO1xuICBsZXQgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBmaW5kIHF1ZXJ5IHRvIHJldHVybiB0aGUgZGF0YSBvZiB0aGUgbWF0Y2hlZCBvYmplY3RzLmAsXG4gICAgZmllbGRzOiB7XG4gICAgICByZXN1bHRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0cyByZXR1cm5lZCBieSB0aGUgcXVlcnknLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgbmV3IEdyYXBoUUxMaXN0KFxuICAgICAgICAgICAgbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICApLFxuICAgICAgfSxcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlLFxuICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICAgIGNvbmZpZzoge1xuICAgICAgcGFyc2VDbGFzc0NvbmZpZyxcbiAgICAgIGlzQ3JlYXRlRW5hYmxlZCxcbiAgICAgIGlzVXBkYXRlRW5hYmxlZCxcbiAgICB9LFxuICB9O1xuXG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB2aWV3ZXJUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgIG5hbWU6ICdWaWV3ZXInLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgVmlld2VyIG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyB0aGUgY3VycmVudCB1c2VyIGRhdGEuYCxcbiAgICAgIGludGVyZmFjZXM6IFtkZWZhdWx0R3JhcGhRTFR5cGVzLkNMQVNTXSxcbiAgICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgICAgLi4ub3V0cHV0RmllbGRzKCksXG4gICAgICAgIHNlc3Npb25Ub2tlbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5TRVNTSU9OX1RPS0VOX0FUVCxcbiAgICAgIH0pLFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlID0gdmlld2VyVHlwZTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodmlld2VyVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICBjb25zdCB1c2VyU2lnblVwSW5wdXRUeXBlTmFtZSA9ICdTaWduVXBGaWVsZHNJbnB1dCc7XG4gICAgY29uc3QgdXNlclNpZ25VcElucHV0VHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICAgIG5hbWU6IHVzZXJTaWduVXBJbnB1dFR5cGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1c2VyU2lnblVwSW5wdXRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgd2hlbiBzaWduaW5nIHVwLmAsXG4gICAgICBmaWVsZHM6ICgpID0+XG4gICAgICAgIGNsYXNzQ3JlYXRlRmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSBtYXBJbnB1dFR5cGUoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGU6XG4gICAgICAgICAgICAgICAgICBmaWVsZCA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZCA9PT0gJ3Bhc3N3b3JkJ1xuICAgICAgICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwge30pLFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1c2VyU2lnblVwSW5wdXRUeXBlLCB0cnVlLCB0cnVlKTtcblxuICAgIGNvbnN0IHVzZXJMb2dJbklucHV0VHlwZU5hbWUgPSAnTG9nSW5GaWVsZHNJbnB1dCc7XG4gICAgY29uc3QgdXNlckxvZ0luSW5wdXRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogdXNlckxvZ0luSW5wdXRUeXBlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7dXNlckxvZ0luSW5wdXRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIHRvIGxvZ2luLmAsXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVzZXJuYW1lIHVzZWQgdG8gbG9nIHRoZSB1c2VyIGluLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgICB9LFxuICAgICAgICBwYXNzd29yZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgdGhlIHVzZXIgaW4uJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1c2VyTG9nSW5JbnB1dFR5cGUsIHRydWUsIHRydWUpO1xuXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgIGNsYXNzTmFtZVxuICAgIF0uc2lnblVwSW5wdXRUeXBlID0gdXNlclNpZ25VcElucHV0VHlwZTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgY2xhc3NOYW1lXG4gICAgXS5sb2dJbklucHV0VHlwZSA9IHVzZXJMb2dJbklucHV0VHlwZTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBsb2FkIH07XG4iXX0=