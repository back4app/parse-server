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
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type: className === '_User' && (field === 'username' || field === 'password') ? new _graphql.GraphQLNonNull(type) : type
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
        description: 'This is the inQuery operator to specify a constraint to select the objects where a field equals to any of the object ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY_INPUT
      },
      notInQuery: {
        description: 'This is the notInQuery operator to specify a constraint to select the objects where a field do not equal to any of the object ids in the result of a different query.',
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
      const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes, field);

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

  const classGraphQLFindArgs = _objectSpread({
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT
  }, _graphqlRelay.connectionArgs, {
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
                } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')));
                const parseOrder = order && order.join(',');
                return await objectsQueries.findObjects(source[field].className, _objectSpread({
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses.find(parseClass => parseClass.className === source[field].className).fields);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImNvbmNhdCIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiZmlsdGVyIiwiZmllbGQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJsZW5ndGgiLCJwdXNoIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiR3JhcGhRTE5vbk51bGwiLCJBQ0wiLCJBQ0xfSU5QVVQiLCJhZGRHcmFwaFFMVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlIiwibGluayIsIkdyYXBoUUxJRCIsIk9CSkVDVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJhZGQiLCJHcmFwaFFMTGlzdCIsIk9CSkVDVF9JRCIsInJlbW92ZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlIiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJpbiIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiaW5RdWVyeSIsIlNVQlFVRVJZX0lOUFVUIiwibm90SW5RdWVyeSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJsb2ciLCJ3YXJuIiwicGFyc2VGaWVsZCIsIk9SIiwiQU5EIiwiTk9SIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTE9yZGVyVHlwZSIsIkdyYXBoUUxFbnVtVHlwZSIsInZhbHVlcyIsImZpZWxkQ29uZmlnIiwidXBkYXRlZFNvcnRGaWVsZHMiLCJ2YWx1ZSIsImNsYXNzR3JhcGhRTEZpbmRBcmdzIiwid2hlcmUiLCJvcmRlciIsIkdyYXBoUUxTdHJpbmciLCJza2lwIiwiU0tJUF9BVFQiLCJjb25uZWN0aW9uQXJncyIsIm9wdGlvbnMiLCJSRUFEX09QVElPTlNfQVRUIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUiLCJpbnRlcmZhY2VzIiwiUEFSU0VfT0JKRUNUIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwicGFyc2VPYmplY3RGaWVsZHMiLCJpZCIsIm9iaiIsIm9iamVjdElkIiwidGFyZ2V0UGFyc2VDbGFzc1R5cGVzIiwiYXJncyIsInVuZGVmaW5lZCIsInJlc29sdmUiLCJzb3VyY2UiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiaW5jbHVkZSIsInN0YXJ0c1dpdGgiLCJyZXBsYWNlIiwicGFyc2VPcmRlciIsImpvaW4iLCJvYmplY3RzUXVlcmllcyIsImZpbmRPYmplY3RzIiwiJHJlbGF0ZWRUbyIsIm9iamVjdCIsIl9fdHlwZSIsImtleSIsInBhcnNlQ2xhc3NlcyIsImZpbmQiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImVsZW0iLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJjb25uZWN0aW9uVHlwZSIsImVkZ2VUeXBlIiwiY29ubmVjdGlvbkZpZWxkcyIsImNvdW50IiwiQ09VTlRfQVRUIiwibm9kZVR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSIsInZpZXdlclR5cGUiLCJzZXNzaW9uVG9rZW4iLCJTRVNTSU9OX1RPS0VOX0FUVCIsInVzZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFTQTs7QUFLQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFLQSxNQUFNQSx1QkFBdUIsR0FBRyxVQUM5QkMsZ0JBRDhCLEVBRTlCO0FBQ0EsU0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDQyxJQUF0QyxJQUErQyxFQUF0RDtBQUNELENBSkQ7O0FBTUEsTUFBTUMsNEJBQTRCLEdBQUcsVUFD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bkIsU0FBbkMsSUFBZ0Q7QUFDOUMyQixJQUFBQSx1QkFEOEM7QUFFOUNLLElBQUFBLHdCQUY4QztBQUc5Q25CLElBQUFBLHNCQUg4QztBQUk5Q1ksSUFBQUEsc0JBSjhDO0FBSzlDYSxJQUFBQSwwQkFMOEM7QUFNOUNhLElBQUFBLDJCQU44QztBQU85Q2MsSUFBQUEsb0JBUDhDO0FBUTlDdUQsSUFBQUEsc0JBUjhDO0FBUzlDUSxJQUFBQSwwQkFUOEM7QUFVOUNoQyxJQUFBQSxNQUFNLEVBQUU7QUFDTjlILE1BQUFBLGdCQURNO0FBRU53QyxNQUFBQSxlQUZNO0FBR05DLE1BQUFBO0FBSE07QUFWc0MsR0FBaEQ7O0FBaUJBLE1BQUlYLFNBQVMsS0FBSyxPQUFsQixFQUEyQjtBQUN6QixVQUFNaUksVUFBVSxHQUFHLElBQUlSLDBCQUFKLENBQXNCO0FBQ3ZDMUcsTUFBQUEsSUFBSSxFQUFFLFFBRGlDO0FBRXZDQyxNQUFBQSxXQUFXLEVBQUcsNkZBRnlCO0FBR3ZDdkMsTUFBQUEsTUFBTSxFQUFFLE9BQU87QUFDYnlKLFFBQUFBLFlBQVksRUFBRXZJLG1CQUFtQixDQUFDd0ksaUJBRHJCO0FBRWJDLFFBQUFBLElBQUksRUFBRTtBQUNKcEgsVUFBQUEsV0FBVyxFQUFFLDJCQURUO0FBRUo3QyxVQUFBQSxJQUFJLEVBQUUsSUFBSWlELHVCQUFKLENBQW1Cb0csc0JBQW5CO0FBRkY7QUFGTyxPQUFQO0FBSCtCLEtBQXRCLENBQW5CO0FBV0FoSCxJQUFBQSxrQkFBa0IsQ0FBQ2UsY0FBbkIsQ0FBa0MwRyxVQUFsQyxFQUE4QyxJQUE5QyxFQUFvRCxJQUFwRDtBQUNBekgsSUFBQUEsa0JBQWtCLENBQUN5SCxVQUFuQixHQUFnQ0EsVUFBaEM7QUFDRDtBQUNGLENBbGREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMRW51bVR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHtcbiAgZ2xvYmFsSWRGaWVsZCxcbiAgY29ubmVjdGlvbkFyZ3MsXG4gIGNvbm5lY3Rpb25EZWZpbml0aW9ucyxcbn0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2lucHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL291dHB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY29uc3RyYWludFR5cGUnO1xuaW1wb3J0IHtcbiAgZXh0cmFjdEtleXNBbmRJbmNsdWRlLFxuICBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcsXG59IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcblxuY29uc3QgZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcgPSBmdW5jdGlvbihcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgcmV0dXJuIChwYXJzZUNsYXNzQ29uZmlnICYmIHBhcnNlQ2xhc3NDb25maWcudHlwZSkgfHwge307XG59O1xuXG5jb25zdCBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzID0gZnVuY3Rpb24oXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIGNvbnN0IGNsYXNzRmllbGRzID0gT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmNvbmNhdCgnaWQnKTtcbiAgY29uc3Qge1xuICAgIGlucHV0RmllbGRzOiBhbGxvd2VkSW5wdXRGaWVsZHMsXG4gICAgb3V0cHV0RmllbGRzOiBhbGxvd2VkT3V0cHV0RmllbGRzLFxuICAgIGNvbnN0cmFpbnRGaWVsZHM6IGFsbG93ZWRDb25zdHJhaW50RmllbGRzLFxuICAgIHNvcnRGaWVsZHM6IGFsbG93ZWRTb3J0RmllbGRzLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgbGV0IGNsYXNzT3V0cHV0RmllbGRzO1xuICBsZXQgY2xhc3NDcmVhdGVGaWVsZHM7XG4gIGxldCBjbGFzc1VwZGF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzQ29uc3RyYWludEZpZWxkcztcbiAgbGV0IGNsYXNzU29ydEZpZWxkcztcblxuICAvLyBBbGwgYWxsb3dlZCBjdXN0b21zIGZpZWxkc1xuICBjb25zdCBjbGFzc0N1c3RvbUZpZWxkcyA9IGNsYXNzRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMpLmluY2x1ZGVzKGZpZWxkKSAmJlxuICAgICAgZmllbGQgIT09ICdpZCdcbiAgICApO1xuICB9KTtcblxuICBpZiAoYWxsb3dlZElucHV0RmllbGRzICYmIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUpIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZElucHV0RmllbGRzLmNyZWF0ZS5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuICBpZiAoYWxsb3dlZElucHV0RmllbGRzICYmIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUpIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZElucHV0RmllbGRzLnVwZGF0ZS5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuXG4gIGlmIChhbGxvd2VkT3V0cHV0RmllbGRzKSB7XG4gICAgY2xhc3NPdXRwdXRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRPdXRwdXRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgLy8gRmlsdGVycyB0aGUgXCJwYXNzd29yZFwiIGZpZWxkIGZyb20gY2xhc3MgX1VzZXJcbiAgaWYgKHBhcnNlQ2xhc3MuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY2xhc3NPdXRwdXRGaWVsZHMgPSBjbGFzc091dHB1dEZpZWxkcy5maWx0ZXIoXG4gICAgICBvdXRwdXRGaWVsZCA9PiBvdXRwdXRGaWVsZCAhPT0gJ3Bhc3N3b3JkJ1xuICAgICk7XG4gIH1cblxuICBpZiAoYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMpIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRDb25zdHJhaW50RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0ZpZWxkcztcbiAgfVxuXG4gIGlmIChhbGxvd2VkU29ydEZpZWxkcykge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGFsbG93ZWRTb3J0RmllbGRzO1xuICAgIGlmICghY2xhc3NTb3J0RmllbGRzLmxlbmd0aCkge1xuICAgICAgLy8gbXVzdCBoYXZlIGF0IGxlYXN0IDEgb3JkZXIgZmllbGRcbiAgICAgIC8vIG90aGVyd2lzZSB0aGUgRmluZEFyZ3MgSW5wdXQgVHlwZSB3aWxsIHRocm93LlxuICAgICAgY2xhc3NTb3J0RmllbGRzLnB1c2goe1xuICAgICAgICBmaWVsZDogJ2lkJyxcbiAgICAgICAgYXNjOiB0cnVlLFxuICAgICAgICBkZXNjOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGNsYXNzRmllbGRzLm1hcChmaWVsZCA9PiB7XG4gICAgICByZXR1cm4geyBmaWVsZCwgYXNjOiB0cnVlLCBkZXNjOiB0cnVlIH07XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH07XG59O1xuXG5jb25zdCBsb2FkID0gKFxuICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9ID0gZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyhwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSA9IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzQ3JlYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlOlxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICAgICAgICAgICAgICAoZmllbGQgPT09ICd1c2VybmFtZScgfHwgZmllbGQgPT09ICdwYXNzd29yZCcpXG4gICAgICAgICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSA9IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzVXBkYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGxpbmsgT1IgYWRkIGFuZCBsaW5rIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBsaW5rOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBMaW5rIGFuIGV4aXN0aW5nIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuYCxcbiAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZExpbmsnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgbGluayBhbiBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UmVsYXRpb25JbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGFkZCwgcmVtb3ZlLCBjcmVhdGVBbmRBZGQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIGEgcmVsYXRpb24gZmllbGQuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgYWRkOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBBZGQgZXhpc3Rpbmcgb2JqZWN0cyBmcm9tIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gdGhlIHJlbGF0aW9uLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkcy5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgUmVtb3ZlIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBvdXQgb2YgdGhlIHJlbGF0aW9uLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkcy5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZEFkZCddID0ge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQ3JlYXRlIGFuZCBhZGQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSkpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcldoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBwb2ludGVyIGZpZWxkIHRvICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIGVxdWFsVG86IGRlZmF1bHRHcmFwaFFMVHlwZXMuZXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgICAgbm90RXF1YWxUbzogZGVmYXVsdEdyYXBoUUxUeXBlcy5ub3RFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgICBpbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5pbk9wKGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEKSxcbiAgICAgIG5vdEluOiBkZWZhdWx0R3JhcGhRTFR5cGVzLm5vdEluKGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEKSxcbiAgICAgIGV4aXN0czogZGVmYXVsdEdyYXBoUUxUeXBlcy5leGlzdHMsXG4gICAgICBpblF1ZXJ5S2V5OiBkZWZhdWx0R3JhcGhRTFR5cGVzLmluUXVlcnlLZXksXG4gICAgICBub3RJblF1ZXJ5S2V5OiBkZWZhdWx0R3JhcGhRTFR5cGVzLm5vdEluUXVlcnlLZXksXG4gICAgICBpblF1ZXJ5OiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGlzIGlzIHRoZSBpblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhbnkgb2YgdGhlIG9iamVjdCBpZHMgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNVQlFVRVJZX0lOUFVULFxuICAgICAgfSxcbiAgICAgIG5vdEluUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGFueSBvZiB0aGUgb2JqZWN0IGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUllfSU5QVVQsXG4gICAgICB9LFxuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVdoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIC4uLmNsYXNzQ29uc3RyYWludEZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgaWYgKFsnT1InLCAnQU5EJywgJ05PUiddLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5sb2cud2FybihcbiAgICAgICAgICAgIGBGaWVsZCAke2ZpZWxkfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZX0gYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIG9uZS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGQgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW3BhcnNlRmllbGRdLnR5cGUsXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlcyxcbiAgICAgICAgICBmaWVsZFxuICAgICAgICApO1xuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgfSwge30pLFxuICAgICAgT1I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBPUiBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICAgIEFORDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIEFORCBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICAgIE5PUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE5PUiBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1PcmRlcmA7XG4gIGxldCBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIHdoZW4gc29ydGluZyBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgdmFsdWVzOiBjbGFzc1NvcnRGaWVsZHMucmVkdWNlKChzb3J0RmllbGRzLCBmaWVsZENvbmZpZykgPT4ge1xuICAgICAgY29uc3QgeyBmaWVsZCwgYXNjLCBkZXNjIH0gPSBmaWVsZENvbmZpZztcbiAgICAgIGNvbnN0IHVwZGF0ZWRTb3J0RmllbGRzID0ge1xuICAgICAgICAuLi5zb3J0RmllbGRzLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHZhbHVlID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICBpZiAoYXNjKSB7XG4gICAgICAgIHVwZGF0ZWRTb3J0RmllbGRzW2Ake2ZpZWxkfV9BU0NgXSA9IHsgdmFsdWUgfTtcbiAgICAgIH1cbiAgICAgIGlmIChkZXNjKSB7XG4gICAgICAgIHVwZGF0ZWRTb3J0RmllbGRzW2Ake2ZpZWxkfV9ERVNDYF0gPSB7IHZhbHVlOiBgLSR7dmFsdWV9YCB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVwZGF0ZWRTb3J0RmllbGRzO1xuICAgIH0sIHt9KSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxPcmRlclR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxGaW5kQXJncyA9IHtcbiAgICB3aGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgfSxcbiAgICBvcmRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgZmllbGRzIHRvIGJlIHVzZWQgd2hlbiBzb3J0aW5nIHRoZSBkYXRhIGZldGNoZWQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICAgICAgICA/IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3JkZXJUeXBlKSlcbiAgICAgICAgOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgc2tpcDogZGVmYXVsdEdyYXBoUUxUeXBlcy5TS0lQX0FUVCxcbiAgICAuLi5jb25uZWN0aW9uQXJncyxcbiAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gIH07XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gIGNvbnN0IGludGVyZmFjZXMgPSBbXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1QsXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZSxcbiAgXTtcbiAgY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSB7XG4gICAgaWQ6IGdsb2JhbElkRmllbGQoY2xhc3NOYW1lLCBvYmogPT4gb2JqLm9iamVjdElkKSxcbiAgICAuLi5kZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMsXG4gIH07XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NPdXRwdXRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3NcbiAgICAgICAgICBdO1xuICAgICAgICBjb25zdCBhcmdzID0gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3NcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICAgICAgICBvcHRpb25zLFxuICAgICAgICAgICAgICAgIH0gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VPcmRlciA9IG9yZGVyICYmIG9yZGVyLmpvaW4oJywnKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgICAgICAgIHNvdXJjZVtmaWVsZF0uY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAkcmVsYXRlZFRvOiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgcGFyc2VPcmRlcixcbiAgICAgICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgICAgICBmaXJzdCxcbiAgICAgICAgICAgICAgICAgIGFmdGVyLFxuICAgICAgICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlcy5maW5kKFxuICAgICAgICAgICAgICAgICAgICBwYXJzZUNsYXNzID0+XG4gICAgICAgICAgICAgICAgICAgICAgcGFyc2VDbGFzcy5jbGFzc05hbWUgPT09IHNvdXJjZVtmaWVsZF0uY2xhc3NOYW1lXG4gICAgICAgICAgICAgICAgICApLmZpZWxkc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmIChzb3VyY2VbZmllbGRdICYmIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcy5tYXAoY29vcmRpbmF0ZSA9PiAoe1xuICAgICAgICAgICAgICAgICAgbGF0aXR1ZGU6IGNvb3JkaW5hdGVbMF0sXG4gICAgICAgICAgICAgICAgICBsb25naXR1ZGU6IGNvb3JkaW5hdGVbMV0sXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzYCxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoIXNvdXJjZVtmaWVsZF0pIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5tYXAoYXN5bmMgZWxlbSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgZWxlbS5jbGFzc05hbWUgJiZcbiAgICAgICAgICAgICAgICAgIGVsZW0ub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgICAgIGVsZW0uX190eXBlID09PSAnT2JqZWN0J1xuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBlbGVtIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH1cbiAgICB9LCBwYXJzZU9iamVjdEZpZWxkcyk7XG4gIH07XG4gIGxldCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lfSBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlcyxcbiAgICBmaWVsZHM6IG91dHB1dEZpZWxkcyxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICApO1xuXG4gIGNvbnN0IHsgY29ubmVjdGlvblR5cGUsIGVkZ2VUeXBlIH0gPSBjb25uZWN0aW9uRGVmaW5pdGlvbnMoe1xuICAgIG5hbWU6IGdyYXBoUUxDbGFzc05hbWUsXG4gICAgY29ubmVjdGlvbkZpZWxkczoge1xuICAgICAgY291bnQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ09VTlRfQVRULFxuICAgIH0sXG4gICAgbm9kZVR5cGU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gIH0pO1xuICBsZXQgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSB1bmRlZmluZWQ7XG4gIGlmIChcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZWRnZVR5cGUpICYmXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbm5lY3Rpb25UeXBlLCBmYWxzZSwgZmFsc2UsIHRydWUpXG4gICkge1xuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gY29ubmVjdGlvblR5cGU7XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlLFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgICBjb25maWc6IHtcbiAgICAgIHBhcnNlQ2xhc3NDb25maWcsXG4gICAgICBpc0NyZWF0ZUVuYWJsZWQsXG4gICAgICBpc1VwZGF0ZUVuYWJsZWQsXG4gICAgfSxcbiAgfTtcblxuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3Qgdmlld2VyVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnVmlld2VyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlIFZpZXdlciBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgdGhlIGN1cnJlbnQgdXNlciBkYXRhLmAsXG4gICAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAgIHNlc3Npb25Ub2tlbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5TRVNTSU9OX1RPS0VOX0FUVCxcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3VycmVudCB1c2VyLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHZpZXdlclR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlID0gdmlld2VyVHlwZTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBsb2FkIH07XG4iXX0=