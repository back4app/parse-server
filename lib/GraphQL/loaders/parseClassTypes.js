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

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _inputType = require("../transformers/inputType");

var _outputType = require("../transformers/outputType");

var _constraintType = require("../transformers/constraintType");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const getParseClassTypeConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.type || {};
};

const getInputFieldsAndConstraints = function (parseClass, parseClassConfig) {
  const classFields = Object.keys(parseClass.fields).filter(field => field !== 'objectId').concat('id');
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
    return !Object.keys(defaultGraphQLTypes.PARSE_OBJECT_FIELDS).includes(field);
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
        field: 'id',
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
  const classGraphQLCreateTypeName = `Create${graphQLClassName}FieldsInput`;
  let classGraphQLCreateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () => classCreateFields.reduce((fields, field) => {
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

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
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

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
          type: _graphql.GraphQLID
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
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        },
        remove: {
          description: `Remove an existing object from the ${graphQLClassName} class out of the relation.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
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
      equalTo: defaultGraphQLTypes.equalTo(_graphql.GraphQLID),
      notEqualTo: defaultGraphQLTypes.notEqualTo(_graphql.GraphQLID),
      in: defaultGraphQLTypes.inOp(defaultGraphQLTypes.OBJECT_ID),
      notIn: defaultGraphQLTypes.notIn(defaultGraphQLTypes.OBJECT_ID),
      exists: defaultGraphQLTypes.exists,
      inQueryKey: defaultGraphQLTypes.inQueryKey,
      notInQueryKey: defaultGraphQLTypes.notInQueryKey,
      inQuery: {
        description: 'This is the inQuery operator to specify a constraint to select the objects where a field equals to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY_INPUT
      },
      notInQuery: {
        description: 'This is the notInQuery operator to specify a constraint to select the objects where a field do not equal to any of the ids in the result of a different query.',
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
      if (['OR', 'AND', 'NOR'].includes(field)) {
        parseGraphQLSchema.log.warn(`Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`);
        return fields;
      }

      const parseField = field === 'id' ? 'objectId' : field;
      const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes);

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
      OR: {
        description: 'This is the OR operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      AND: {
        description: 'This is the AND operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      NOR: {
        description: 'This is the NOR operator to compound constraints.',
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
    options: defaultGraphQLTypes.READ_OPTIONS_ATT
  };
  const classGraphQLOutputTypeName = `${graphQLClassName}`;

  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = (0, _outputType.transformOutputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

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
                  options
                } = args;
                const {
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference
                } = options || {};
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
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), order, skip, limit, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields.map(field => field.split('.', 1)[0]), parseClass.fields);
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
    }, defaultGraphQLTypes.PARSE_OBJECT_FIELDS);
  };

  let classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${graphQLClassName} class.`,
    interfaces: [defaultGraphQLTypes.PARSE_OBJECT],
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
      interfaces: [defaultGraphQLTypes.PARSE_OBJECT],
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
        const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiY29uY2F0IiwiaW5wdXRGaWVsZHMiLCJhbGxvd2VkSW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJhbGxvd2VkT3V0cHV0RmllbGRzIiwiY29uc3RyYWludEZpZWxkcyIsImFsbG93ZWRDb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImFsbG93ZWRTb3J0RmllbGRzIiwiY2xhc3NPdXRwdXRGaWVsZHMiLCJjbGFzc0NyZWF0ZUZpZWxkcyIsImNsYXNzVXBkYXRlRmllbGRzIiwiY2xhc3NDb25zdHJhaW50RmllbGRzIiwiY2xhc3NTb3J0RmllbGRzIiwiY2xhc3NDdXN0b21GaWVsZHMiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJsZW5ndGgiLCJwdXNoIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiQUNMIiwiQUNMX0FUVCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJsaW5rIiwiR3JhcGhRTElEIiwiT0JKRUNUIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsImFkZCIsIkdyYXBoUUxMaXN0IiwiT0JKRUNUX0lEIiwicmVtb3ZlIiwiR3JhcGhRTE5vbk51bGwiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZSIsImVxdWFsVG8iLCJub3RFcXVhbFRvIiwiaW4iLCJpbk9wIiwibm90SW4iLCJleGlzdHMiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsImluUXVlcnkiLCJTVUJRVUVSWV9JTlBVVCIsIm5vdEluUXVlcnkiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlIiwibG9nIiwid2FybiIsInBhcnNlRmllbGQiLCJPUiIsIkFORCIsIk5PUiIsImNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxPcmRlclR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJ2YWx1ZXMiLCJmaWVsZENvbmZpZyIsInVwZGF0ZWRTb3J0RmllbGRzIiwidmFsdWUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsIndoZXJlIiwib3JkZXIiLCJHcmFwaFFMU3RyaW5nIiwic2tpcCIsIlNLSVBfQVRUIiwibGltaXQiLCJMSU1JVF9BVFQiLCJvcHRpb25zIiwiUkVBRF9PUFRJT05TX0FUVCIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lIiwidGFyZ2V0UGFyc2VDbGFzc1R5cGVzIiwiYXJncyIsInVuZGVmaW5lZCIsInJlc29sdmUiLCJzb3VyY2UiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJzZWxlY3RlZEZpZWxkcyIsImluY2x1ZGUiLCJzbGljZSIsImluZGV4T2YiLCJvYmplY3RzUXVlcmllcyIsImZpbmRPYmplY3RzIiwiJHJlbGF0ZWRUbyIsIm9iamVjdCIsIl9fdHlwZSIsIm9iamVjdElkIiwia2V5Iiwic3BsaXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImVsZW0iLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJpbnRlcmZhY2VzIiwiUEFSU0VfT0JKRUNUIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJyZXN1bHRzIiwiY291bnQiLCJDT1VOVF9BVFQiLCJ2aWV3ZXJUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyU2lnblVwSW5wdXRUeXBlTmFtZSIsInVzZXJTaWduVXBJbnB1dFR5cGUiLCJ1c2VyTG9nSW5JbnB1dFR5cGVOYW1lIiwidXNlckxvZ0luSW5wdXRUeXBlIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsInNpZ25VcElucHV0VHlwZSIsImxvZ0luSW5wdXRUeXBlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBU0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBS0EsTUFBTUEsdUJBQXVCLEdBQUcsVUFDOUJDLGdCQUQ4QixFQUU5QjtBQUNBLFNBQVFBLGdCQUFnQixJQUFJQSxnQkFBZ0IsQ0FBQ0MsSUFBdEMsSUFBK0MsRUFBdEQ7QUFDRCxDQUpEOztBQU1BLE1BQU1DLDRCQUE0QixHQUFHLFVB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QU9NLE1BQVA7QUFDRDtBQUNGLE9BcEJELEVBb0JHLEVBcEJIO0FBSm1ELEtBQTNCLENBQTVCO0FBMEJBK0IsSUFBQUEsa0JBQWtCLENBQUNjLGNBQW5CLENBQWtDbUcsbUJBQWxDLEVBQXVELElBQXZELEVBQTZELElBQTdEO0FBRUEsVUFBTUMsc0JBQXNCLEdBQUcsa0JBQS9CO0FBQ0EsVUFBTUMsa0JBQWtCLEdBQUcsSUFBSTdHLCtCQUFKLENBQTJCO0FBQ3BEQyxNQUFBQSxJQUFJLEVBQUUyRyxzQkFEOEM7QUFFcEQxRyxNQUFBQSxXQUFXLEVBQUcsT0FBTTBHLHNCQUF1QiwrQkFGUztBQUdwRGpKLE1BQUFBLE1BQU0sRUFBRTtBQUNObUosUUFBQUEsUUFBUSxFQUFFO0FBQ1I1RyxVQUFBQSxXQUFXLEVBQUUsK0NBREw7QUFFUjdDLFVBQUFBLElBQUksRUFBRSxJQUFJaUUsdUJBQUosQ0FBbUJnQyxzQkFBbkI7QUFGRSxTQURKO0FBS055RCxRQUFBQSxRQUFRLEVBQUU7QUFDUjdHLFVBQUFBLFdBQVcsRUFBRSwrQ0FETDtBQUVSN0MsVUFBQUEsSUFBSSxFQUFFLElBQUlpRSx1QkFBSixDQUFtQmdDLHNCQUFuQjtBQUZFO0FBTEo7QUFINEMsS0FBM0IsQ0FBM0I7QUFjQTVELElBQUFBLGtCQUFrQixDQUFDYyxjQUFuQixDQUFrQ3FHLGtCQUFsQyxFQUFzRCxJQUF0RCxFQUE0RCxJQUE1RDtBQUVBbkgsSUFBQUEsa0JBQWtCLENBQUNXLGVBQW5CLENBQ0VuQixTQURGLEVBRUU4SCxlQUZGLEdBRW9CTCxtQkFGcEI7QUFHQWpILElBQUFBLGtCQUFrQixDQUFDVyxlQUFuQixDQUNFbkIsU0FERixFQUVFK0gsY0FGRixHQUVtQkosa0JBRm5CO0FBR0Q7QUFDRixDQTdlRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTEVudW1UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvaW5wdXRUeXBlJztcbmltcG9ydCB7IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvb3V0cHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jb25zdHJhaW50VHlwZSc7XG5pbXBvcnQge1xuICBleHRyYWN0S2V5c0FuZEluY2x1ZGUsXG4gIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy50eXBlKSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMgPSBmdW5jdGlvbihcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NGaWVsZHMgPSBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcylcbiAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkICE9PSAnb2JqZWN0SWQnKVxuICAgIC5jb25jYXQoJ2lkJyk7XG4gIGNvbnN0IHtcbiAgICBpbnB1dEZpZWxkczogYWxsb3dlZElucHV0RmllbGRzLFxuICAgIG91dHB1dEZpZWxkczogYWxsb3dlZE91dHB1dEZpZWxkcyxcbiAgICBjb25zdHJhaW50RmllbGRzOiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcyxcbiAgICBzb3J0RmllbGRzOiBhbGxvd2VkU29ydEZpZWxkcyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGxldCBjbGFzc091dHB1dEZpZWxkcztcbiAgbGV0IGNsYXNzQ3JlYXRlRmllbGRzO1xuICBsZXQgY2xhc3NVcGRhdGVGaWVsZHM7XG4gIGxldCBjbGFzc0NvbnN0cmFpbnRGaWVsZHM7XG4gIGxldCBjbGFzc1NvcnRGaWVsZHM7XG5cbiAgLy8gQWxsIGFsbG93ZWQgY3VzdG9tcyBmaWVsZHNcbiAgY29uc3QgY2xhc3NDdXN0b21GaWVsZHMgPSBjbGFzc0ZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgIHJldHVybiAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTKS5pbmNsdWRlcyhcbiAgICAgIGZpZWxkXG4gICAgKTtcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKFxuICAgICAgb3V0cHV0RmllbGQgPT4gb3V0cHV0RmllbGQgIT09ICdwYXNzd29yZCdcbiAgICApO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRDb25zdHJhaW50RmllbGRzKSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NGaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZFNvcnRGaWVsZHMpIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBhbGxvd2VkU29ydEZpZWxkcztcbiAgICBpZiAoIWNsYXNzU29ydEZpZWxkcy5sZW5ndGgpIHtcbiAgICAgIC8vIG11c3QgaGF2ZSBhdCBsZWFzdCAxIG9yZGVyIGZpZWxkXG4gICAgICAvLyBvdGhlcndpc2UgdGhlIEZpbmRBcmdzIElucHV0IFR5cGUgd2lsbCB0aHJvdy5cbiAgICAgIGNsYXNzU29ydEZpZWxkcy5wdXNoKHtcbiAgICAgICAgZmllbGQ6ICdpZCcsXG4gICAgICAgIGFzYzogdHJ1ZSxcbiAgICAgICAgZGVzYzogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBjbGFzc0ZpZWxkcy5tYXAoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIHsgZmllbGQsIGFzYzogdHJ1ZSwgZGVzYzogdHJ1ZSB9O1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9O1xufTtcblxuY29uc3QgbG9hZCA9IChcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfSA9IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMocGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUgPSBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc0NyZWF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9BVFQsXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSA9IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzVXBkYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0FUVCxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGxpbmsgT1IgYWRkIGFuZCBsaW5rIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBsaW5rOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBMaW5rIGFuIGV4aXN0aW5nIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZExpbmsnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgbGluayBhbiBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UmVsYXRpb25JbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGFkZCwgcmVtb3ZlLCBjcmVhdGVBbmRBZGQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIGEgcmVsYXRpb24gZmllbGQuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgYWRkOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBBZGQgYW4gZXhpc3Rpbmcgb2JqZWN0IGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBhbiBleGlzdGluZyBvYmplY3QgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBvdXQgb2YgdGhlIHJlbGF0aW9uLmAsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEKSxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgICAgIGZpZWxkc1snY3JlYXRlQW5kQWRkJ10gPSB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBDcmVhdGUgYW5kIGFkZCBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVBvaW50ZXJXaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgcG9pbnRlciBmaWVsZCB0byAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiB7XG4gICAgICBlcXVhbFRvOiBkZWZhdWx0R3JhcGhRTFR5cGVzLmVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICAgIG5vdEVxdWFsVG86IGRlZmF1bHRHcmFwaFFMVHlwZXMubm90RXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgICAgaW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuaW5PcChkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICBub3RJbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5ub3RJbihkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICBleGlzdHM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuZXhpc3RzLFxuICAgICAgaW5RdWVyeUtleTogZGVmYXVsdEdyYXBoUUxUeXBlcy5pblF1ZXJ5S2V5LFxuICAgICAgbm90SW5RdWVyeUtleTogZGVmYXVsdEdyYXBoUUxUeXBlcy5ub3RJblF1ZXJ5S2V5LFxuICAgICAgaW5RdWVyeToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhpcyBpcyB0aGUgaW5RdWVyeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBlcXVhbHMgdG8gYW55IG9mIHRoZSBpZHMgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNVQlFVRVJZX0lOUFVULFxuICAgICAgfSxcbiAgICAgIG5vdEluUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGFueSBvZiB0aGUgaWRzIGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgICAgICAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5TVUJRVUVSWV9JTlBVVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9V2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgLi4uY2xhc3NDb25zdHJhaW50RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICBpZiAoWydPUicsICdBTkQnLCAnTk9SJ10uaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmxvZy53YXJuKFxuICAgICAgICAgICAgYEZpZWxkICR7ZmllbGR9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3Rpbmcgb25lLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZCA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBPUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgQU5EOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgQU5EIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgTk9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgTk9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgaWYgKGFzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fQVNDYF0gPSB7IHZhbHVlOiBmaWVsZCB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHtmaWVsZH1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRBcmdzID0ge1xuICAgIHdoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICB9LFxuICAgIG9yZGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBmaWVsZHMgdG8gYmUgdXNlZCB3aGVuIHNvcnRpbmcgdGhlIGRhdGEgZmV0Y2hlZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMT3JkZXJUeXBlXG4gICAgICAgID8gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPcmRlclR5cGUpKVxuICAgICAgICA6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBza2lwOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNLSVBfQVRULFxuICAgIGxpbWl0OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkxJTUlUX0FUVCxcbiAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gIH07XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NPdXRwdXRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3NcbiAgICAgICAgICBdO1xuICAgICAgICBjb25zdCBhcmdzID0gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3NcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgd2hlcmUsIG9yZGVyLCBza2lwLCBsaW1pdCwgb3B0aW9ucyB9ID0gYXJncztcbiAgICAgICAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgfSA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5jbHVkZXMoJy4nKSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5zbGljZShmaWVsZC5pbmRleE9mKCcuJykgKyAxKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgICAgICAgIHNvdXJjZVtmaWVsZF0uY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAkcmVsYXRlZFRvOiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcy5tYXAoZmllbGQgPT4gZmllbGQuc3BsaXQoJy4nLCAxKVswXSksXG4gICAgICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmIChzb3VyY2VbZmllbGRdICYmIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcy5tYXAoY29vcmRpbmF0ZSA9PiAoe1xuICAgICAgICAgICAgICAgICAgbGF0aXR1ZGU6IGNvb3JkaW5hdGVbMF0sXG4gICAgICAgICAgICAgICAgICBsb25naXR1ZGU6IGNvb3JkaW5hdGVbMV0sXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzYCxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoIXNvdXJjZVtmaWVsZF0pIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5tYXAoYXN5bmMgZWxlbSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgZWxlbS5jbGFzc05hbWUgJiZcbiAgICAgICAgICAgICAgICAgIGVsZW0ub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgICAgIGVsZW0uX190eXBlID09PSAnT2JqZWN0J1xuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBlbGVtIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH1cbiAgICB9LCBkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMpO1xuICB9O1xuICBsZXQgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXM6IFtkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF0sXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfUZpbmRSZXN1bHRgO1xuICBsZXQgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBmaW5kIHF1ZXJ5IHRvIHJldHVybiB0aGUgZGF0YSBvZiB0aGUgbWF0Y2hlZCBvYmplY3RzLmAsXG4gICAgZmllbGRzOiB7XG4gICAgICByZXN1bHRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0cyByZXR1cm5lZCBieSB0aGUgcXVlcnknLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgbmV3IEdyYXBoUUxMaXN0KFxuICAgICAgICAgICAgbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICApLFxuICAgICAgfSxcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlLFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgICBjb25maWc6IHtcbiAgICAgIHBhcnNlQ2xhc3NDb25maWcsXG4gICAgICBpc0NyZWF0ZUVuYWJsZWQsXG4gICAgICBpc1VwZGF0ZUVuYWJsZWQsXG4gICAgfSxcbiAgfTtcblxuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3Qgdmlld2VyVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnVmlld2VyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlIFZpZXdlciBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgdGhlIGN1cnJlbnQgdXNlciBkYXRhLmAsXG4gICAgICBpbnRlcmZhY2VzOiBbZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RdLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICAuLi5vdXRwdXRGaWVsZHMoKSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNFU1NJT05fVE9LRU5fQVRULFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUgPSB2aWV3ZXJUeXBlO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh2aWV3ZXJUeXBlLCB0cnVlLCB0cnVlKTtcblxuICAgIGNvbnN0IHVzZXJTaWduVXBJbnB1dFR5cGVOYW1lID0gJ1NpZ25VcEZpZWxkc0lucHV0JztcbiAgICBjb25zdCB1c2VyU2lnblVwSW5wdXRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogdXNlclNpZ25VcElucHV0VHlwZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VzZXJTaWduVXBJbnB1dFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgaW5wdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyB3aGVuIHNpZ25pbmcgdXAuYCxcbiAgICAgIGZpZWxkczogKCkgPT5cbiAgICAgICAgY2xhc3NDcmVhdGVGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZTpcbiAgICAgICAgICAgICAgICAgIGZpZWxkID09PSAndXNlcm5hbWUnIHx8IGZpZWxkID09PSAncGFzc3dvcmQnXG4gICAgICAgICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LCB7fSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVzZXJTaWduVXBJbnB1dFR5cGUsIHRydWUsIHRydWUpO1xuXG4gICAgY29uc3QgdXNlckxvZ0luSW5wdXRUeXBlTmFtZSA9ICdMb2dJbkZpZWxkc0lucHV0JztcbiAgICBjb25zdCB1c2VyTG9nSW5JbnB1dFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiB1c2VyTG9nSW5JbnB1dFR5cGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1c2VyTG9nSW5JbnB1dFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgdG8gbG9naW4uYCxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICB1c2VybmFtZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgdGhlIHVzZXIgaW4uJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICAgIH0sXG4gICAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyB0aGUgdXNlciBpbi4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVzZXJMb2dJbklucHV0VHlwZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgY2xhc3NOYW1lXG4gICAgXS5zaWduVXBJbnB1dFR5cGUgPSB1c2VyU2lnblVwSW5wdXRUeXBlO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICBjbGFzc05hbWVcbiAgICBdLmxvZ0luSW5wdXRUeXBlID0gdXNlckxvZ0luSW5wdXRUeXBlO1xuICB9XG59O1xuXG5leHBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGxvYWQgfTtcbiJdfQ==