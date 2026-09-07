"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var _parseGraphQLUtils = require("../parseGraphQLUtils");
var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));
var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));
var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");
var _className = require("../transformers/className");
var _mutation = require("../transformers/mutation");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const filterDeletedFields = fields => Object.keys(fields).reduce((acc, key) => {
  if (typeof fields[key] === 'object' && fields[key]?.__op === 'Delete') {
    acc[key] = null;
  }
  return acc;
}, fields);
const getOnlyRequiredFields = (updatedFields, selectedFieldsString, includedFieldsString, nativeObjectFields) => {
  const includedFields = includedFieldsString ? includedFieldsString.split(',') : [];
  const selectedFields = selectedFieldsString ? selectedFieldsString.split(',') : [];
  const missingFields = selectedFields.filter(field => !nativeObjectFields.includes(field) || includedFields.includes(field)).join(',');
  if (!missingFields.length) {
    return {
      needGet: false,
      keys: ''
    };
  } else {
    return {
      needGet: true,
      keys: missingFields
    };
  }
};
const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const getGraphQLQueryName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true,
    destroy: isDestroyEnabled = true,
    createAlias = '',
    updateAlias = '',
    destroyAlias = ''
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLOutputType
  } = parseGraphQLSchema.parseClassTypes[className];
  if (isCreateEnabled) {
    const createGraphQLMutationName = createAlias || `create${graphQLClassName}`;
    const createGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Create${graphQLClassName}`,
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${graphQLClassName} class.`,
      inputFields: {
        fields: {
          description: 'These are the fields that will be used to create the new object.',
          type: classGraphQLCreateType || defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the created object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            fields
          } = (0, _parseGraphQLUtils.cloneArgs)(args);
          if (!fields) {
            fields = {};
          }
          const {
            config,
            auth,
            info
          } = context;
          const parseFields = await (0, _mutation.transformTypes)('create', fields, {
            className,
            parseGraphQLSchema,
            originalFields: args.fields,
            req: {
              config,
              auth,
              info
            }
          });
          const createdObject = await objectsMutations.createObject(className, parseFields, config, auth, info);
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'objectId', 'createdAt', 'updatedAt']);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys, parseGraphQLSchema.parseClasses);
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, undefined, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }
          return {
            [getGraphQLQueryName]: {
              ...createdObject,
              updatedAt: createdObject.createdAt,
              ...filterDeletedFields(parseFields),
              ...optimizedObject
            }
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    if (parseGraphQLSchema.addGraphQLType(createGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(createGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(createGraphQLMutationName, createGraphQLMutation);
    }
  }
  if (isUpdateEnabled) {
    const updateGraphQLMutationName = updateAlias || `update${graphQLClassName}`;
    const updateGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Update${graphQLClassName}`,
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields that will be used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the updated object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            id,
            fields
          } = (0, _parseGraphQLUtils.cloneArgs)(args);
          if (!fields) {
            fields = {};
          }
          const {
            config,
            auth,
            info
          } = context;
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);
          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }
          const parseFields = await (0, _mutation.transformTypes)('update', fields, {
            className,
            parseGraphQLSchema,
            originalFields: args.fields,
            req: {
              config,
              auth,
              info
            }
          });
          const updatedObject = await objectsMutations.updateObject(className, id, parseFields, config, auth, info);
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'objectId', 'updatedAt']);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys, parseGraphQLSchema.parseClasses);
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, undefined, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }
          return {
            [getGraphQLQueryName]: {
              objectId: id,
              ...updatedObject,
              ...filterDeletedFields(parseFields),
              ...optimizedObject
            }
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    if (parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(updateGraphQLMutationName, updateGraphQLMutation);
    }
  }
  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = destroyAlias || `delete${graphQLClassName}`;
    const deleteGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Delete${graphQLClassName}`,
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the deleted object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            id
          } = (0, _parseGraphQLUtils.cloneArgs)(args);
          const {
            config,
            auth,
            info
          } = context;
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);
          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          let optimizedObject = {};
          if (keys && keys.split(',').filter(key => !['id', 'objectId'].includes(key)).length > 0) {
            optimizedObject = await objectsQueries.getObject(className, id, keys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }
          await objectsMutations.deleteObject(className, id, config, auth, info);
          return {
            [getGraphQLQueryName]: {
              objectId: id,
              ...optimizedObject
            }
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    if (parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(deleteGraphQLMutationName, deleteGraphQLMutation);
    }
  }
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9wYXJzZUdyYXBoUUxVdGlscyIsIm9iamVjdHNNdXRhdGlvbnMiLCJvYmplY3RzUXVlcmllcyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX2NsYXNzTmFtZSIsIl9tdXRhdGlvbiIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImZpbHRlckRlbGV0ZWRGaWVsZHMiLCJmaWVsZHMiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwiX19vcCIsImdldE9ubHlSZXF1aXJlZEZpZWxkcyIsInVwZGF0ZWRGaWVsZHMiLCJzZWxlY3RlZEZpZWxkc1N0cmluZyIsImluY2x1ZGVkRmllbGRzU3RyaW5nIiwibmF0aXZlT2JqZWN0RmllbGRzIiwiaW5jbHVkZWRGaWVsZHMiLCJzcGxpdCIsInNlbGVjdGVkRmllbGRzIiwibWlzc2luZ0ZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiaW5jbHVkZXMiLCJqb2luIiwibGVuZ3RoIiwibmVlZEdldCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsImNsYXNzTmFtZSIsImdyYXBoUUxDbGFzc05hbWUiLCJ0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwiLCJnZXRHcmFwaFFMUXVlcnlOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImNyZWF0ZSIsImlzQ3JlYXRlRW5hYmxlZCIsInVwZGF0ZSIsImlzVXBkYXRlRW5hYmxlZCIsImRlc3Ryb3kiLCJpc0Rlc3Ryb3lFbmFibGVkIiwiY3JlYXRlQWxpYXMiLCJ1cGRhdGVBbGlhcyIsImRlc3Ryb3lBbGlhcyIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiT0JKRUNUIiwib3V0cHV0RmllbGRzIiwiR3JhcGhRTE5vbk51bGwiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJjbG9uZUFyZ3MiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInBhcnNlRmllbGRzIiwidHJhbnNmb3JtVHlwZXMiLCJvcmlnaW5hbEZpZWxkcyIsInJlcSIsImNyZWF0ZWRPYmplY3QiLCJjcmVhdGVPYmplY3QiLCJnZXRGaWVsZE5hbWVzIiwic3RhcnRzV2l0aCIsIm1hcCIsInJlcGxhY2UiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwicmVxdWlyZWRLZXlzIiwibmVlZFRvR2V0QWxsS2V5cyIsInBhcnNlQ2xhc3NlcyIsIm9wdGltaXplZE9iamVjdCIsImdldE9iamVjdCIsIm9iamVjdElkIiwidW5kZWZpbmVkIiwidXBkYXRlZEF0IiwiY3JlYXRlZEF0IiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbiIsImlkIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJnbG9iYWxJZE9iamVjdCIsImZyb21HbG9iYWxJZCIsInVwZGF0ZWRPYmplY3QiLCJ1cGRhdGVPYmplY3QiLCJkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uIiwiZGVsZXRlT2JqZWN0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZnJvbUdsb2JhbElkLCBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcblxuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcsIGNsb25lQXJncyB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuXG5jb25zdCBmaWx0ZXJEZWxldGVkRmllbGRzID0gZmllbGRzID0+XG4gIE9iamVjdC5rZXlzKGZpZWxkcykucmVkdWNlKChhY2MsIGtleSkgPT4ge1xuICAgIGlmICh0eXBlb2YgZmllbGRzW2tleV0gPT09ICdvYmplY3QnICYmIGZpZWxkc1trZXldPy5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgYWNjW2tleV0gPSBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xuICB9LCBmaWVsZHMpO1xuXG5jb25zdCBnZXRPbmx5UmVxdWlyZWRGaWVsZHMgPSAoXG4gIHVwZGF0ZWRGaWVsZHMsXG4gIHNlbGVjdGVkRmllbGRzU3RyaW5nLFxuICBpbmNsdWRlZEZpZWxkc1N0cmluZyxcbiAgbmF0aXZlT2JqZWN0RmllbGRzXG4pID0+IHtcbiAgY29uc3QgaW5jbHVkZWRGaWVsZHMgPSBpbmNsdWRlZEZpZWxkc1N0cmluZyA/IGluY2x1ZGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1N0cmluZyA/IHNlbGVjdGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3QgbWlzc2luZ0ZpZWxkcyA9IHNlbGVjdGVkRmllbGRzXG4gICAgLmZpbHRlcihmaWVsZCA9PiAhbmF0aXZlT2JqZWN0RmllbGRzLmluY2x1ZGVzKGZpZWxkKSB8fCBpbmNsdWRlZEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpXG4gICAgLmpvaW4oJywnKTtcbiAgaWYgKCFtaXNzaW5nRmllbGRzLmxlbmd0aCkge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IGZhbHNlLCBrZXlzOiAnJyB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IHRydWUsIGtleXM6IG1pc3NpbmdGaWVsZHMgfTtcbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uIChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgZGVzdHJveTogaXNEZXN0cm95RW5hYmxlZCA9IHRydWUsXG4gICAgY3JlYXRlQWxpYXM6IGNyZWF0ZUFsaWFzID0gJycsXG4gICAgdXBkYXRlQWxpYXM6IHVwZGF0ZUFsaWFzID0gJycsXG4gICAgZGVzdHJveUFsaWFzOiBkZXN0cm95QWxpYXMgPSAnJyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBjcmVhdGVBbGlhcyB8fCBgY3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBuZXcgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgZmllbGRzIH0gPSBjbG9uZUFyZ3MoYXJncyk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIHsgZmllbGRzID0ge307IH1cbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgb3JpZ2luYWxGaWVsZHM6IGFyZ3MuZmllbGRzLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKGZpZWxkcywga2V5cywgaW5jbHVkZSwgW1xuICAgICAgICAgICAgJ2lkJyxcbiAgICAgICAgICAgICdvYmplY3RJZCcsXG4gICAgICAgICAgICAnY3JlYXRlZEF0JyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRPYmplY3QuY3JlYXRlZEF0LFxuICAgICAgICAgICAgICAuLi5maWx0ZXJEZWxldGVkRmllbGRzKHBhcnNlRmllbGRzKSxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCBjcmVhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gdXBkYXRlQWxpYXMgfHwgYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkLCBmaWVsZHMgfSA9IGNsb25lQXJncyhhcmdzKTtcbiAgICAgICAgICBpZiAoIWZpZWxkcykgeyBmaWVsZHMgPSB7fTsgfVxuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24odXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgdXBkYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBkZXN0cm95QWxpYXMgfHwgYGRlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYERlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkZWxldGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGNsb25lQXJncyhhcmdzKTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKGtleXMgJiYga2V5cy5zcGxpdCgnLCcpLmZpbHRlcihrZXkgPT4gIVsnaWQnLCAnb2JqZWN0SWQnXS5pbmNsdWRlcyhrZXkpKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuZGVsZXRlT2JqZWN0KGNsYXNzTmFtZSwgaWQsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgZGVsZXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsYUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsa0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUVBLElBQUFJLG1CQUFBLEdBQUFDLHVCQUFBLENBQUFMLE9BQUE7QUFDQSxJQUFBTSxrQkFBQSxHQUFBTixPQUFBO0FBQ0EsSUFBQU8sZ0JBQUEsR0FBQUYsdUJBQUEsQ0FBQUwsT0FBQTtBQUNBLElBQUFRLGNBQUEsR0FB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