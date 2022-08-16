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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
          if (!fields) fields = {};
          const {
            config,
            auth,
            info
          } = context;
          const parseFields = await (0, _mutation.transformTypes)('create', fields, {
            className,
            parseGraphQLSchema,
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
          if (!fields) fields = {};
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmaWx0ZXJEZWxldGVkRmllbGRzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImFjYyIsImtleSIsIl9fb3AiLCJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJncmFwaFFMQ2xhc3NOYW1lIiwidHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIiwiZ2V0R3JhcGhRTFF1ZXJ5TmFtZSIsImNoYXJBdCIsInRvTG93ZXJDYXNlIiwic2xpY2UiLCJjcmVhdGUiLCJpc0NyZWF0ZUVuYWJsZWQiLCJ1cGRhdGUiLCJpc1VwZGF0ZUVuYWJsZWQiLCJkZXN0cm95IiwiaXNEZXN0cm95RW5hYmxlZCIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWciLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwicmVxIiwiY3JlYXRlZE9iamVjdCIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJnZXRGaWVsZE5hbWVzIiwic3RhcnRzV2l0aCIsIm1hcCIsInJlcGxhY2UiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwicmVxdWlyZWRLZXlzIiwibmVlZFRvR2V0QWxsS2V5cyIsIm9iamVjdHNRdWVyaWVzIiwicGFyc2VDbGFzc2VzIiwib3B0aW1pemVkT2JqZWN0IiwiZ2V0T2JqZWN0Iiwib2JqZWN0SWQiLCJ1bmRlZmluZWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbiIsImlkIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJnbG9iYWxJZE9iamVjdCIsImZyb21HbG9iYWxJZCIsInVwZGF0ZWRPYmplY3QiLCJ1cGRhdGVPYmplY3QiLCJkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uIiwiZGVsZXRlT2JqZWN0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQsIG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5cbmNvbnN0IGZpbHRlckRlbGV0ZWRGaWVsZHMgPSBmaWVsZHMgPT5cbiAgT2JqZWN0LmtleXMoZmllbGRzKS5yZWR1Y2UoKGFjYywga2V5KSA9PiB7XG4gICAgaWYgKHR5cGVvZiBmaWVsZHNba2V5XSA9PT0gJ29iamVjdCcgJiYgZmllbGRzW2tleV0/Ll9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICBhY2Nba2V5XSA9IG51bGw7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG4gIH0sIGZpZWxkcyk7XG5cbmNvbnN0IGdldE9ubHlSZXF1aXJlZEZpZWxkcyA9IChcbiAgdXBkYXRlZEZpZWxkcyxcbiAgc2VsZWN0ZWRGaWVsZHNTdHJpbmcsXG4gIGluY2x1ZGVkRmllbGRzU3RyaW5nLFxuICBuYXRpdmVPYmplY3RGaWVsZHNcbikgPT4ge1xuICBjb25zdCBpbmNsdWRlZEZpZWxkcyA9IGluY2x1ZGVkRmllbGRzU3RyaW5nID8gaW5jbHVkZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzU3RyaW5nID8gc2VsZWN0ZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBtaXNzaW5nRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAuZmlsdGVyKGZpZWxkID0+ICFuYXRpdmVPYmplY3RGaWVsZHMuaW5jbHVkZXMoZmllbGQpIHx8IGluY2x1ZGVkRmllbGRzLmluY2x1ZGVzKGZpZWxkKSlcbiAgICAuam9pbignLCcpO1xuICBpZiAoIW1pc3NpbmdGaWVsZHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogZmFsc2UsIGtleXM6ICcnIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogdHJ1ZSwga2V5czogbWlzc2luZ0ZpZWxkcyB9O1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IGdldEdyYXBoUUxRdWVyeU5hbWUgPSBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICBkZXN0cm95OiBpc0Rlc3Ryb3lFbmFibGVkID0gdHJ1ZSxcbiAgICBjcmVhdGVBbGlhczogY3JlYXRlQWxpYXMgPSAnJyxcbiAgICB1cGRhdGVBbGlhczogdXBkYXRlQWxpYXMgPSAnJyxcbiAgICBkZXN0cm95QWxpYXM6IGRlc3Ryb3lBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGNyZWF0ZUFsaWFzIHx8IGBjcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGEgbmV3IG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byBjcmVhdGUgdGhlIG5ldyBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKGZpZWxkcywga2V5cywgaW5jbHVkZSwgW1xuICAgICAgICAgICAgJ2lkJyxcbiAgICAgICAgICAgICdvYmplY3RJZCcsXG4gICAgICAgICAgICAnY3JlYXRlZEF0JyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRPYmplY3QuY3JlYXRlZEF0LFxuICAgICAgICAgICAgICAuLi5maWx0ZXJEZWxldGVkRmllbGRzKHBhcnNlRmllbGRzKSxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCBjcmVhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gdXBkYXRlQWxpYXMgfHwgYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkLCBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygndXBkYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy51cGRhdGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKGZpZWxkcywga2V5cywgaW5jbHVkZSwgW1xuICAgICAgICAgICAgJ2lkJyxcbiAgICAgICAgICAgICdvYmplY3RJZCcsXG4gICAgICAgICAgICAndXBkYXRlZEF0JyxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBjb25zdCBuZWVkVG9HZXRBbGxLZXlzID0gb2JqZWN0c1F1ZXJpZXMubmVlZFRvR2V0QWxsS2V5cyhcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIGlmIChuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLnVwZGF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIC4uLmZpbHRlckRlbGV0ZWRGaWVsZHMocGFyc2VGaWVsZHMpLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIHVwZGF0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzRGVzdHJveUVuYWJsZWQpIHtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lID0gZGVzdHJveUFsaWFzIHx8IGBkZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBEZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gZGVsZXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGVsZXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKGtleXMgJiYga2V5cy5zcGxpdCgnLCcpLmZpbHRlcihrZXkgPT4gIVsnaWQnLCAnb2JqZWN0SWQnXS5pbmNsdWRlcyhrZXkpKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuZGVsZXRlT2JqZWN0KGNsYXNzTmFtZSwgaWQsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgZGVsZXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLG1CQUFtQixHQUFHQyxNQUFNLElBQ2hDQyxNQUFNLENBQUNDLElBQVAsQ0FBWUYsTUFBWixFQUFvQkcsTUFBcEIsQ0FBMkIsQ0FBQ0MsR0FBRCxFQUFNQyxHQUFOLEtBQWM7RUFBQTs7RUFDdkMsSUFBSSxPQUFPTCxNQUFNLENBQUNLLEdBQUQsQ0FBYixLQUF1QixRQUF2QixJQUFtQyxnQkFBQUwsTUFBTSxDQUFDSyxHQUFELENBQU4sNERBQWFDLElBQWIsTUFBc0IsUUFBN0QsRUFBdUU7SUFDckVGLEdBQUcsQ0FBQ0MsR0FBRCxDQUFILEdBQVcsSUFBWDtFQUNEOztFQUNELE9BQU9ELEdBQVA7QUFDRCxDQUxELEVBS0dKLE1BTEgsQ0FERjs7QUFRQSxNQUFNTyxxQkFBcUIsR0FBRyxDQUM1QkMsYUFENEIsRUFFNUJDLG9CQUY0QixFQUc1QkMsb0JBSDRCLEVBSTVCQyxrQkFKNEIsS0FLekI7RUFDSCxNQUFNQyxjQUFjLEdBQUdGLG9CQUFvQixHQUFHQSxvQkFBb0IsQ0FBQ0csS0FBckIsQ0FBMkIsR0FBM0IsQ0FBSCxHQUFxQyxFQUFoRjtFQUNBLE1BQU1DLGNBQWMsR0FBR0wsb0JBQW9CLEdBQUdBLG9CQUFvQixDQUFDSSxLQUFyQixDQUEyQixHQUEzQixDQUFILEdBQXFDLEVBQWhGO0VBQ0EsTUFBTUUsYUFB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