"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var _parseGraphQLUtils = require("../parseGraphQLUtils");
var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));
var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));
var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");
var _className = require("../transformers/className");
var _mutation = require("../transformers/mutation");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const filterDeletedFields = fields => Object.keys(fields).reduce((acc, key) => {
  var _fields$key;
  if (typeof fields[key] === 'object' && ((_fields$key = fields[key]) === null || _fields$key === void 0 ? void 0 : _fields$key.__op) === 'Delete') {
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
          } = (0, _deepcopy.default)(args);
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
            [getGraphQLQueryName]: _objectSpread(_objectSpread(_objectSpread({}, createdObject), {}, {
              updatedAt: createdObject.createdAt
            }, filterDeletedFields(parseFields)), optimizedObject)
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
          } = (0, _deepcopy.default)(args);
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
            [getGraphQLQueryName]: _objectSpread(_objectSpread(_objectSpread({
              objectId: id
            }, updatedObject), filterDeletedFields(parseFields)), optimizedObject)
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
          } = (0, _deepcopy.default)(args);
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
            [getGraphQLQueryName]: _objectSpread({
              objectId: id
            }, optimizedObject)
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9kZWVwY29weSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9wYXJzZUdyYXBoUUxVdGlscyIsIm9iamVjdHNNdXRhdGlvbnMiLCJvYmplY3RzUXVlcmllcyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX2NsYXNzTmFtZSIsIl9tdXRhdGlvbiIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJmaWx0ZXJEZWxldGVkRmllbGRzIiwiZmllbGRzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwiX2ZpZWxkcyRrZXkiLCJfX29wIiwiZ2V0T25seVJlcXVpcmVkRmllbGRzIiwidXBkYXRlZEZpZWxkcyIsInNlbGVjdGVkRmllbGRzU3RyaW5nIiwiaW5jbHVkZWRGaWVsZHNTdHJpbmciLCJuYXRpdmVPYmplY3RGaWVsZHMiLCJpbmNsdWRlZEZpZWxkcyIsInNwbGl0Iiwic2VsZWN0ZWRGaWVsZHMiLCJtaXNzaW5nRmllbGRzIiwiZmllbGQiLCJpbmNsdWRlcyIsImpvaW4iLCJuZWVkR2V0IiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsInRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjcmVhdGVBbGlhcyIsInVwZGF0ZUFsaWFzIiwiZGVzdHJveUFsaWFzIiwiZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbiIsIm11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJpbnB1dEZpZWxkcyIsInR5cGUiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwib3JpZ2luYWxGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0IiwiY3JlYXRlT2JqZWN0IiwiZ2V0RmllbGROYW1lcyIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsImV4dHJhY3RLZXlzQW5kSW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsIm5lZWRUb0dldEFsbEtleXMiLCJwYXJzZUNsYXNzZXMiLCJvcHRpbWl6ZWRPYmplY3QiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVuZGVmaW5lZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb24iLCJpZCIsIkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUIiwiZ2xvYmFsSWRPYmplY3QiLCJmcm9tR2xvYmFsSWQiLCJ1cGRhdGVkT2JqZWN0IiwidXBkYXRlT2JqZWN0IiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbiIsImRlbGV0ZU9iamVjdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCwgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcblxuY29uc3QgZmlsdGVyRGVsZXRlZEZpZWxkcyA9IGZpZWxkcyA9PlxuICBPYmplY3Qua2V5cyhmaWVsZHMpLnJlZHVjZSgoYWNjLCBrZXkpID0+IHtcbiAgICBpZiAodHlwZW9mIGZpZWxkc1trZXldID09PSAnb2JqZWN0JyAmJiBmaWVsZHNba2V5XT8uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgIGFjY1trZXldID0gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwgZmllbGRzKTtcblxuY29uc3QgZ2V0T25seVJlcXVpcmVkRmllbGRzID0gKFxuICB1cGRhdGVkRmllbGRzLFxuICBzZWxlY3RlZEZpZWxkc1N0cmluZyxcbiAgaW5jbHVkZWRGaWVsZHNTdHJpbmcsXG4gIG5hdGl2ZU9iamVjdEZpZWxkc1xuKSA9PiB7XG4gIGNvbnN0IGluY2x1ZGVkRmllbGRzID0gaW5jbHVkZWRGaWVsZHNTdHJpbmcgPyBpbmNsdWRlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpIDogW107XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNTdHJpbmcgPyBzZWxlY3RlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpIDogW107XG4gIGNvbnN0IG1pc3NpbmdGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1xuICAgIC5maWx0ZXIoZmllbGQgPT4gIW5hdGl2ZU9iamVjdEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkgfHwgaW5jbHVkZWRGaWVsZHMuaW5jbHVkZXMoZmllbGQpKVxuICAgIC5qb2luKCcsJyk7XG4gIGlmICghbWlzc2luZ0ZpZWxkcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiBmYWxzZSwga2V5czogJycgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiB0cnVlLCBrZXlzOiBtaXNzaW5nRmllbGRzIH07XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbiAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9IGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIGRlc3Ryb3k6IGlzRGVzdHJveUVuYWJsZWQgPSB0cnVlLFxuICAgIGNyZWF0ZUFsaWFzOiBjcmVhdGVBbGlhcyA9ICcnLFxuICAgIHVwZGF0ZUFsaWFzOiB1cGRhdGVBbGlhcyA9ICcnLFxuICAgIGRlc3Ryb3lBbGlhczogZGVzdHJveUFsaWFzID0gJycsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gY3JlYXRlQWxpYXMgfHwgYGNyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIGNyZWF0ZSB0aGUgbmV3IG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIHsgZmllbGRzID0ge307IH1cbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgb3JpZ2luYWxGaWVsZHM6IGFyZ3MuZmllbGRzLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKGZpZWxkcywga2V5cywgaW5jbHVkZSwgW1xuICAgICAgICAgICAgJ2lkJyxcbiAgICAgICAgICAgICdvYmplY3RJZCcsXG4gICAgICAgICAgICAnY3JlYXRlZEF0JyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRPYmplY3QuY3JlYXRlZEF0LFxuICAgICAgICAgICAgICAuLi5maWx0ZXJEZWxldGVkRmllbGRzKHBhcnNlRmllbGRzKSxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCBjcmVhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gdXBkYXRlQWxpYXMgfHwgYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkLCBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGlmICghZmllbGRzKSB7IGZpZWxkcyA9IHt9OyB9XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ3VwZGF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgb3JpZ2luYWxGaWVsZHM6IGFyZ3MuZmllbGRzLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgdXBkYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMudXBkYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhmaWVsZHMsIGtleXMsIGluY2x1ZGUsIFtcbiAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAnb2JqZWN0SWQnLFxuICAgICAgICAgICAgJ3VwZGF0ZWRBdCcsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgbmVlZFRvR2V0QWxsS2V5cyA9IG9iamVjdHNRdWVyaWVzLm5lZWRUb0dldEFsbEtleXMoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQgJiYgIW5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi51cGRhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICAuLi5maWx0ZXJEZWxldGVkRmllbGRzKHBhcnNlRmllbGRzKSxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbih1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCB1cGRhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc0Rlc3Ryb3lFbmFibGVkKSB7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGRlc3Ryb3lBbGlhcyB8fCBgZGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgRGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2RlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChrZXlzICYmIGtleXMuc3BsaXQoJywnKS5maWx0ZXIoa2V5ID0+ICFbJ2lkJywgJ29iamVjdElkJ10uaW5jbHVkZXMoa2V5KSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmRlbGV0ZU9iamVjdChjbGFzc05hbWUsIGlkLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIGRlbGV0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLFFBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLGFBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLGtCQUFBLEdBQUFDLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSSxTQUFBLEdBQUFELHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSyxtQkFBQSxHQUFBQyx1QkFBQSxDQUFBTixPQUFBO0FBQ0EsSUFBQU8sa0JBQUEsR0FBQVAsT0FBQTtBQUNBLElBQUFRLGdCQUFBLEdBQUFGLHVCQUFBLENBQUFOLE9BQUE7QUFDQSxJQUFBUyxjQUFBLEdBQUFILHVCQUFBLENBQUFOLE9BQUE7QUFDQSxJQUFBVSx1QkFBQSxHQUFBVixPQUFBO0FBQ0EsSUFBQVcsVUFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksU0FBQSxHQUFBWixPQUFBO0FBQTBELFNBQUFhLHlCQUFBQyxDQUFBLDZCQUFBQyxPQUFBLG1CQUFBQyxDQUFBLE9BQUFELE9BQUEsSUFBQUUsQ0FBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLENBQUEsV0FBQUEsQ0FBQSxHQUFBRyxDQUFBLEdBQUFELENBQUEsS0FBQUYsQ0FBQTtBQUFBLFNBQUFSLHdCQUFBUSxDQUFBLEVBQUFFLENBQUEsU0FBQUEsQ0FBQSxJQUFBRixDQUFBLElBQUFBLENBQUEsQ0FBQUksVUFBQSxTQUFBSixDQUFBLGVBQUFBLENBQUEsdUJBQUFBLENBQUEseUJBQUFBLENBQUEsV0FBQUssT0FBQSxFQUFBTCxDQUFBLFFBQUFHLENBQUEsR0FBQUosd0JBQUEsQ0FBQUcsQ0FBQSxPQUFBQyxDQUFBLElBQUFBLENBQUEsQ0FBQUcsR0FBQSxDQUFBTixDQUFBLFVBQUFHLENBQUEsQ0FBQUksR0FBQSxD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