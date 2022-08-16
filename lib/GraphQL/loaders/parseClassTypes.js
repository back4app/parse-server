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

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _inputType = require("../transformers/inputType");

var _outputType = require("../transformers/outputType");

var _constraintType = require("../transformers/constraintType");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const getParseClassTypeConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.type || {};
};

const getInputFieldsAndConstraints = function (parseClass, parseClassConfig) {
  const classFields = Object.keys(parseClass.fields).concat('id');
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
    return !Object.keys(defaultGraphQLTypes.PARSE_OBJECT_FIELDS).includes(field) && field !== 'id';
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
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: className === '_User' && (field === 'username' || field === 'password') || parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
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
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
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
          description: `Link an existing object from ${graphQLClassName} class. You can use either the global or the object id.`,
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
          description: `Add existing objects from the ${graphQLClassName} class into the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        },
        remove: {
          description: `Remove existing objects from the ${graphQLClassName} class out of the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        }
      };

      if (isCreateEnabled) {
        fields['createAndAdd'] = {
          description: `Create and add objects of the ${graphQLClassName} class into the relation.`,
          type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLCreateType))
        };
      }

      return fields;
    }
  });
  classGraphQLRelationType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLConstraintsTypeName = `${graphQLClassName}WhereInput`;
  let classGraphQLConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => _objectSpread(_objectSpread({}, classConstraintFields.reduce((fields, field) => {
      if (['OR', 'AND', 'NOR'].includes(field)) {
        parseGraphQLSchema.log.warn(`Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`);
        return fields;
      }

      const parseField = field === 'id' ? 'objectId' : field;
      const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes, field);

      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {})), {}, {
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
  const classGraphQLRelationConstraintsTypeName = `${graphQLClassName}RelationWhereInput`;
  let classGraphQLRelationConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationConstraintsTypeName,
    description: `The ${classGraphQLRelationConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => ({
      have: {
        description: 'Run a relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      haveNot: {
        description: 'Run an inverted relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      exists: {
        description: 'Check if the relation/pointer contains objects.',
        type: _graphql.GraphQLBoolean
      }
    })
  });
  classGraphQLRelationConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationConstraintsType) || defaultGraphQLTypes.OBJECT;
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

      const value = field === 'id' ? 'objectId' : field;

      if (asc) {
        updatedSortFields[`${field}_ASC`] = {
          value
        };
      }

      if (desc) {
        updatedSortFields[`${field}_DESC`] = {
          value: `-${value}`
        };
      }

      return updatedSortFields;
    }, {})
  });
  classGraphQLOrderType = parseGraphQLSchema.addGraphQLType(classGraphQLOrderType);

  const classGraphQLFindArgs = _objectSpread(_objectSpread({
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT
  }, _graphqlRelay.connectionArgs), {}, {
    options: defaultGraphQLTypes.READ_OPTIONS_ATT
  });

  const classGraphQLOutputTypeName = `${graphQLClassName}`;
  const interfaces = [defaultGraphQLTypes.PARSE_OBJECT, parseGraphQLSchema.relayNodeInterface];

  const parseObjectFields = _objectSpread({
    id: (0, _graphqlRelay.globalIdField)(className, obj => obj.objectId)
  }, defaultGraphQLTypes.PARSE_OBJECT_FIELDS);

  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = (0, _outputType.transformOutputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes = parseGraphQLSchema.parseClassTypes[parseClass.fields[field].targetClass];
        const args = targetParseClassTypes ? targetParseClassTypes.classGraphQLFindArgs : undefined;
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,

            async resolve(source, args, context, queryInfo) {
              try {
                const {
                  where,
                  order,
                  skip,
                  first,
                  after,
                  last,
                  before,
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
                } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')).filter(field => field.indexOf('edges.node') < 0));
                const parseOrder = order && order.join(',');
                return objectsQueries.findObjects(source[field].className, _objectSpread({
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            }

          }
        });
      } else if (parseClass.fields[field].type === 'Polygon') {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,

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
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,

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
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
      } else {
        return fields;
      }
    }, parseObjectFields);
  };

  let classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${graphQLClassName} class.`,
    interfaces,
    fields: outputFields
  });
  classGraphQLOutputType = parseGraphQLSchema.addGraphQLType(classGraphQLOutputType);
  const {
    connectionType,
    edgeType
  } = (0, _graphqlRelay.connectionDefinitions)({
    name: graphQLClassName,
    connectionFields: {
      count: defaultGraphQLTypes.COUNT_ATT
    },
    nodeType: classGraphQLOutputType || defaultGraphQLTypes.OBJECT
  });
  let classGraphQLFindResultType = undefined;

  if (parseGraphQLSchema.addGraphQLType(edgeType) && parseGraphQLSchema.addGraphQLType(connectionType, false, false, true)) {
    classGraphQLFindResultType = connectionType;
  }

  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLPointerType,
    classGraphQLRelationType,
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLConstraintsType,
    classGraphQLRelationConstraintsType,
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
      fields: () => ({
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT,
        user: {
          description: 'This is the current user.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType)
        }
      })
    });
    parseGraphQLSchema.addGraphQLType(viewerType, true, true);
    parseGraphQLSchema.viewerType = viewerType;
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyIsInBhcnNlQ2xhc3NDb25maWciLCJ0eXBlIiwiZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyIsInBhcnNlQ2xhc3MiLCJjbGFzc0ZpZWxkcyIsIk9iamVjdCIsImtleXMiLCJmaWVsZHMiLCJjb25jYXQiLCJpbnB1dEZpZWxkcyIsImFsbG93ZWRJbnB1dEZpZWxkcyIsIm91dHB1dEZpZWxkcyIsImFsbG93ZWRPdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwiYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMiLCJzb3J0RmllbGRzIiwiYWxsb3dlZFNvcnRGaWVsZHMiLCJjbGFzc091dHB1dEZpZWxkcyIsImNsYXNzQ3JlYXRlRmllbGRzIiwiY2xhc3NVcGRhdGVGaWVsZHMiLCJjbGFzc0NvbnN0cmFpbnRGaWVsZHMiLCJjbGFzc1NvcnRGaWVsZHMiLCJjbGFzc0N1c3RvbUZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJpbmNsdWRlcyIsImNyZWF0ZSIsInVwZGF0ZSIsImNsYXNzTmFtZSIsIm91dHB1dEZpZWxkIiwibGVuZ3RoIiwicHVzaCIsImFzYyIsImRlc2MiLCJtYXAiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZ3JhcGhRTENsYXNzTmFtZSIsInRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCIsImlzQ3JlYXRlRW5hYmxlZCIsImlzVXBkYXRlRW5hYmxlZCIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJyZWR1Y2UiLCJ0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsInJlcXVpcmVkIiwiR3JhcGhRTE5vbk51bGwiLCJBQ0wiLCJBQ0xfSU5QVVQiLCJhZGRHcmFwaFFMVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlIiwibGluayIsIkdyYXBoUUxJRCIsIk9CSkVDVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJhZGQiLCJHcmFwaFFMTGlzdCIsIk9CSkVDVF9JRCIsInJlbW92ZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJsb2ciLCJ3YXJuIiwicGFyc2VGaWVsZCIsInRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwiZ2xvYmFsSWRGaWVsZCIsIm9iaiIsIm9iamVjdElkIiwidHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCIsInRhcmdldFBhcnNlQ2xhc3NUeXBlcyIsImFyZ3MiLCJ1bmRlZmluZWQiLCJyZXNvbHZlIiwic291cmNlIiwiY29udGV4dCIsInF1ZXJ5SW5mbyIsImZpcnN0IiwiYWZ0ZXIiLCJsYXN0IiwiYmVmb3JlIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJzZWxlY3RlZEZpZWxkcyIsImdldEZpZWxkTmFtZXMiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwic3RhcnRzV2l0aCIsInJlcGxhY2UiLCJpbmRleE9mIiwicGFyc2VPcmRlciIsImpvaW4iLCJvYmplY3RzUXVlcmllcyIsImZpbmRPYmplY3RzIiwiJHJlbGF0ZWRUbyIsIm9iamVjdCIsIl9fdHlwZSIsImtleSIsInBhcnNlQ2xhc3NlcyIsImUiLCJoYW5kbGVFcnJvciIsImNvb3JkaW5hdGVzIiwiY29vcmRpbmF0ZSIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiZWxlbSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMT2JqZWN0VHlwZSIsImNvbm5lY3Rpb25UeXBlIiwiZWRnZVR5cGUiLCJjb25uZWN0aW9uRGVmaW5pdGlvbnMiLCJjb25uZWN0aW9uRmllbGRzIiwiY291bnQiLCJDT1VOVF9BVFQiLCJub2RlVHlwZSIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwidmlld2VyVHlwZSIsInNlc3Npb25Ub2tlbiIsIlNFU1NJT05fVE9LRU5fQVRUIiwidXNlciJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxFbnVtVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBnbG9iYWxJZEZpZWxkLCBjb25uZWN0aW9uQXJncywgY29ubmVjdGlvbkRlZmluaXRpb25zIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2lucHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL291dHB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY29uc3RyYWludFR5cGUnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy50eXBlKSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMgPSBmdW5jdGlvbiAoXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIGNvbnN0IGNsYXNzRmllbGRzID0gT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmNvbmNhdCgnaWQnKTtcbiAgY29uc3Qge1xuICAgIGlucHV0RmllbGRzOiBhbGxvd2VkSW5wdXRGaWVsZHMsXG4gICAgb3V0cHV0RmllbGRzOiBhbGxvd2VkT3V0cHV0RmllbGRzLFxuICAgIGNvbnN0cmFpbnRGaWVsZHM6IGFsbG93ZWRDb25zdHJhaW50RmllbGRzLFxuICAgIHNvcnRGaWVsZHM6IGFsbG93ZWRTb3J0RmllbGRzLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgbGV0IGNsYXNzT3V0cHV0RmllbGRzO1xuICBsZXQgY2xhc3NDcmVhdGVGaWVsZHM7XG4gIGxldCBjbGFzc1VwZGF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzQ29uc3RyYWludEZpZWxkcztcbiAgbGV0IGNsYXNzU29ydEZpZWxkcztcblxuICAvLyBBbGwgYWxsb3dlZCBjdXN0b21zIGZpZWxkc1xuICBjb25zdCBjbGFzc0N1c3RvbUZpZWxkcyA9IGNsYXNzRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgcmV0dXJuICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMpLmluY2x1ZGVzKGZpZWxkKSAmJiBmaWVsZCAhPT0gJ2lkJztcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKG91dHB1dEZpZWxkID0+IG91dHB1dEZpZWxkICE9PSAncGFzc3dvcmQnKTtcbiAgfVxuXG4gIGlmIChhbGxvd2VkQ29uc3RyYWludEZpZWxkcykge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRTb3J0RmllbGRzKSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gYWxsb3dlZFNvcnRGaWVsZHM7XG4gICAgaWYgKCFjbGFzc1NvcnRGaWVsZHMubGVuZ3RoKSB7XG4gICAgICAvLyBtdXN0IGhhdmUgYXQgbGVhc3QgMSBvcmRlciBmaWVsZFxuICAgICAgLy8gb3RoZXJ3aXNlIHRoZSBGaW5kQXJncyBJbnB1dCBUeXBlIHdpbGwgdGhyb3cuXG4gICAgICBjbGFzc1NvcnRGaWVsZHMucHVzaCh7XG4gICAgICAgIGZpZWxkOiAnaWQnLFxuICAgICAgICBhc2M6IHRydWUsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gY2xhc3NGaWVsZHMubWFwKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiB7IGZpZWxkLCBhc2M6IHRydWUsIGRlc2M6IHRydWUgfTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfTtcbn07XG5cbmNvbnN0IGxvYWQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH0gPSBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzKHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lID0gYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NDcmVhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGU6XG4gICAgICAgICAgICAgICAgICAoY2xhc3NOYW1lID09PSAnX1VzZXInICYmIChmaWVsZCA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZCA9PT0gJ3Bhc3N3b3JkJykpIHx8XG4gICAgICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWRcbiAgICAgICAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgICAgICAgOiB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc1VwZGF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGxpbmsgT1IgYWRkIGFuZCBsaW5rIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBsaW5rOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBMaW5rIGFuIGV4aXN0aW5nIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuYCxcbiAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZExpbmsnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgbGluayBhbiBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUpIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBhZGQsIHJlbW92ZSwgY3JlYXRlQW5kQWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byBhIHJlbGF0aW9uIGZpZWxkLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGFkZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQWRkIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgb3V0IG9mIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9V2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgLi4uY2xhc3NDb25zdHJhaW50RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICBpZiAoWydPUicsICdBTkQnLCAnTk9SJ10uaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmxvZy53YXJuKFxuICAgICAgICAgICAgYEZpZWxkICR7ZmllbGR9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3Rpbmcgb25lLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZCA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzLFxuICAgICAgICAgIGZpZWxkXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBPUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgQU5EOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgQU5EIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgTk9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgTk9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uV2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgaGF2ZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1J1biBhIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgaGF2ZU5vdDoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnUnVuIGFuIGludmVydGVkIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgZXhpc3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgaWYgdGhlIHJlbGF0aW9uL3BvaW50ZXIgY29udGFpbnMgb2JqZWN0cy4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgIGlmIChhc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0FTQ2BdID0geyB2YWx1ZSB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHt2YWx1ZX1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVcbiAgICAgICAgPyBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpXG4gICAgICAgIDogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIHNraXA6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0tJUF9BVFQsXG4gICAgLi4uY29ubmVjdGlvbkFyZ3MsXG4gICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICB9O1xuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgY29uc3QgaW50ZXJmYWNlcyA9IFtkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVCwgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZV07XG4gIGNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0ge1xuICAgIGlkOiBnbG9iYWxJZEZpZWxkKGNsYXNzTmFtZSwgb2JqID0+IG9iai5vYmplY3RJZCksXG4gICAgLi4uZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTLFxuICB9O1xuICBjb25zdCBvdXRwdXRGaWVsZHMgPSAoKSA9PiB7XG4gICAgcmV0dXJuIGNsYXNzT3V0cHV0RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICk7XG4gICAgICBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID1cbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc107XG4gICAgICAgIGNvbnN0IGFyZ3MgPSB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3MgOiB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IHdoZXJlLCBvcmRlciwgc2tpcCwgZmlyc3QsIGFmdGVyLCBsYXN0LCBiZWZvcmUsIG9wdGlvbnMgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3QgeyByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLCBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIH0gPVxuICAgICAgICAgICAgICAgICAgb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluZGV4T2YoJ2VkZ2VzLm5vZGUnKSA8IDApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZU9yZGVyID0gb3JkZXIgJiYgb3JkZXIuam9pbignLCcpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgICAgICAgc291cmNlW2ZpZWxkXS5jbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICRyZWxhdGVkVG86IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RJZDogc291cmNlLm9iamVjdElkLFxuICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLi4uKHdoZXJlIHx8IHt9KSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBwYXJzZU9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKHNvdXJjZVtmaWVsZF0gJiYgc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzLm1hcChjb29yZGluYXRlID0+ICh7XG4gICAgICAgICAgICAgICAgICBsYXRpdHVkZTogY29vcmRpbmF0ZVswXSxcbiAgICAgICAgICAgICAgICAgIGxvbmdpdHVkZTogY29vcmRpbmF0ZVsxXSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHNgLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmICghc291cmNlW2ZpZWxkXSkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLm1hcChhc3luYyBlbGVtID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbS5jbGFzc05hbWUgJiYgZWxlbS5vYmplY3RJZCAmJiBlbGVtLl9fdHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWxlbSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICB9XG4gICAgfSwgcGFyc2VPYmplY3RGaWVsZHMpO1xuICB9O1xuICBsZXQgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXMsXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpO1xuXG4gIGNvbnN0IHsgY29ubmVjdGlvblR5cGUsIGVkZ2VUeXBlIH0gPSBjb25uZWN0aW9uRGVmaW5pdGlvbnMoe1xuICAgIG5hbWU6IGdyYXBoUUxDbGFzc05hbWUsXG4gICAgY29ubmVjdGlvbkZpZWxkczoge1xuICAgICAgY291bnQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ09VTlRfQVRULFxuICAgIH0sXG4gICAgbm9kZVR5cGU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gIH0pO1xuICBsZXQgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSB1bmRlZmluZWQ7XG4gIGlmIChcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZWRnZVR5cGUpICYmXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbm5lY3Rpb25UeXBlLCBmYWxzZSwgZmFsc2UsIHRydWUpXG4gICkge1xuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gY29ubmVjdGlvblR5cGU7XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlLFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgICBjb25maWc6IHtcbiAgICAgIHBhcnNlQ2xhc3NDb25maWcsXG4gICAgICBpc0NyZWF0ZUVuYWJsZWQsXG4gICAgICBpc1VwZGF0ZUVuYWJsZWQsXG4gICAgfSxcbiAgfTtcblxuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3Qgdmlld2VyVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnVmlld2VyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlIFZpZXdlciBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgdGhlIGN1cnJlbnQgdXNlciBkYXRhLmAsXG4gICAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAgIHNlc3Npb25Ub2tlbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5TRVNTSU9OX1RPS0VOX0FUVCxcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3VycmVudCB1c2VyLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHZpZXdlclR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlID0gdmlld2VyVHlwZTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFVQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSx1QkFBdUIsR0FBRyxVQUFVQyxnQkFBVixFQUFzRDtFQUNwRixPQUFRQSxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLElBQXRDLElBQStDLEVBQXREO0FBQ0QsQ0FGRDs7QUFJQSxNQUFNQyw0QkFBNEIsR0FBRyxVQUNuQ0MsVUFEbUMsRUFFbkNILGdCQUZtQyxFQUduQztFQUNBLE1BQU1JLFdBQVcsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVlILFVBQVUsQ0FBQ0ksTUFBdkIsRUFBK0JDLE1BQS9CLENBQXNDLElBQXRDLENBQXBCO0VBQ0EsTUFBTTtJQUNKQyxXQUFXLEVBQUVDLGtCQURUO0lBRUpDLFlBQVksRUFBRUMsbUJBRlY7SUFHSkMsZ0JBQWdCLEVBQUVDLHVCQUhkO0lBSUpDLFVBQVUsRUFBRUM7RUFKUixJQUtGakIsdUJBQXVCLENBQUNDLGdCQUFELENBTDNCO0VBT0EsSUFBSWlCLGlCQUFKO0VBQ0EsSUFBSUMsaUJBQUo7RUFDQSxJQUFJQyxpQkFBSjtFQUNBLElBQUlDLHFCQUFKO0VBQ0EsSUFBSUMsZUFBSixDQWJBLENBZUE7O0VBQ0EsTUFBTUMsaUJBQWlCLEdBQUdsQixXQUFXLENBQUNtQixNQUFaLENBQW1CQyxLQUFLLElBQUk7SUFDcEQsT0FBTyxDQUFDbkIsTUFBTSxDQUFDQyxJQUFQLENBQVltQixtQkFBbUIsQ0FBQ0MsbUJBQWhDLEVBQXFEQyxRQUFyRCxDQUE4REgsS0FBOUQsQ0FBRCxJQUF5RUEsS0FBSyxLQUFLLElBQTFGO0VBQ0QsQ0FGeUIsQ0FBMUI7O0VBSUEsSUFBSWQsa0JBQWtCLElBQUlBLGtCQUFrQixDQUFDa0Is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