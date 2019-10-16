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

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const getOnlyRequiredFields = (updatedFields, selectedFieldsString, includedFieldsString, nativeObjectFields) => {
  const includedFields = includedFieldsString ? includedFieldsString.split(',') : [];
  const selectedFields = selectedFieldsString ? selectedFieldsString.split(',') : [];
  const missingFields = selectedFields.filter(field => !updatedFields[field] && !nativeObjectFields.includes(field) || includedFields.includes(field)).join(',');

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
    destroy: isDestroyEnabled = true
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLOutputType
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isCreateEnabled) {
    const createGraphQLMutationName = `create${graphQLClassName}`;
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
          } = args;
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
          let optimizedObject = {};

          if (needGet) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info);
          }

          return {
            [getGraphQLQueryName]: _objectSpread({}, createdObject, {
              updatedAt: createdObject.createdAt
            }, parseFields, {}, optimizedObject)
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
    const updateGraphQLMutationName = `update${graphQLClassName}`;
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
          } = args;
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
          let optimizedObject = {};

          if (needGet) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info);
          }

          return {
            [getGraphQLQueryName]: _objectSpread({
              objectId: id
            }, updatedObject, {}, parseFields, {}, optimizedObject)
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
    const deleteGraphQLMutationName = `delete${graphQLClassName}`;
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
          } = args;
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
            optimizedObject = await objectsQueries.getObject(className, id, keys, include, undefined, undefined, config, auth, info);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJ0eXBlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVCIsIm91dHB1dEZpZWxkcyIsIkdyYXBoUUxOb25OdWxsIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwibXV0YXRpb25JbmZvIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInJlcSIsImNyZWF0ZWRPYmplY3QiLCJvYmplY3RzTXV0YXRpb25zIiwiY3JlYXRlT2JqZWN0Iiwic3RhcnRzV2l0aCIsIm1hcCIsInJlcGxhY2UiLCJpbmNsdWRlIiwicmVxdWlyZWRLZXlzIiwib3B0aW1pemVkT2JqZWN0Iiwib2JqZWN0c1F1ZXJpZXMiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVuZGVmaW5lZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uIiwiaWQiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsImdsb2JhbElkT2JqZWN0IiwidXBkYXRlZE9iamVjdCIsInVwZGF0ZU9iamVjdCIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJkZWxldGVHcmFwaFFMTXV0YXRpb24iLCJrZXkiLCJkZWxldGVPYmplY3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxxQkFBcUIsR0FBRyxDQUM1QkMsYUFENEIsRUFFNUJDLG9CQUY0QixFQUc1QkMsb0JBSDRCLEVBSTVCQyxrQkFKNEIsS0FLekI7QUFDSCxRQUFNQyxjQUFjLEdBQUdGLG9CQUFvQixHQUN2Q0Esb0JBQW9CLENBQUNHLEtBQXJCLENBQTJCLEdBQTNCLENBRHVDLEdBRXZDLEVBRko7QUFHQSxRQUFNQyxjQUFjLEdBQUdMLG9CQUFvQixHQUN2Q0Esb0JBQW9CLENBQUNJLEtBQXJCLENBQTJCLEdBQTNCLENBRHVDLEdBRXZDLEVBRko7QUFHQSxRQUFNRSxhQUFhLEdBQUdELGNBQWMsQ0FDakNFLE1BRG1CLENBRWxCQyxLQUFLLElBQ0YsQ0FBQ1QsYUFBYSxDQUFDUyxLQUFELENBQWQs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dEQsa0JBQWtCLENBQUN3RCxjQUFuQixDQUNFWSxxQkFBcUIsQ0FBQ3JDLElBQXRCLENBQTJCMEIsS0FBM0IsQ0FBaUNoQyxJQUFqQyxDQUFzQ2lDLE1BRHhDLEtBR0ExRCxrQkFBa0IsQ0FBQ3dELGNBQW5CLENBQWtDWSxxQkFBcUIsQ0FBQzNDLElBQXhELENBSkYsRUFLRTtBQUNBekIsTUFBQUEsa0JBQWtCLENBQUMyRCxrQkFBbkIsQ0FDRVEseUJBREYsRUFFRUMscUJBRkY7QUFJRDtBQUNGO0FBQ0YsQ0FwU0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZnJvbUdsb2JhbElkLCBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7XG4gIGV4dHJhY3RLZXlzQW5kSW5jbHVkZSxcbiAgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnLFxufSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcblxuY29uc3QgZ2V0T25seVJlcXVpcmVkRmllbGRzID0gKFxuICB1cGRhdGVkRmllbGRzLFxuICBzZWxlY3RlZEZpZWxkc1N0cmluZyxcbiAgaW5jbHVkZWRGaWVsZHNTdHJpbmcsXG4gIG5hdGl2ZU9iamVjdEZpZWxkc1xuKSA9PiB7XG4gIGNvbnN0IGluY2x1ZGVkRmllbGRzID0gaW5jbHVkZWRGaWVsZHNTdHJpbmdcbiAgICA/IGluY2x1ZGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJylcbiAgICA6IFtdO1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzU3RyaW5nXG4gICAgPyBzZWxlY3RlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpXG4gICAgOiBbXTtcbiAgY29uc3QgbWlzc2luZ0ZpZWxkcyA9IHNlbGVjdGVkRmllbGRzXG4gICAgLmZpbHRlcihcbiAgICAgIGZpZWxkID0+XG4gICAgICAgICghdXBkYXRlZEZpZWxkc1tmaWVsZF0gJiYgIW5hdGl2ZU9iamVjdEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHx8XG4gICAgICAgIGluY2x1ZGVkRmllbGRzLmluY2x1ZGVzKGZpZWxkKVxuICAgIClcbiAgICAuam9pbignLCcpO1xuICBpZiAoIW1pc3NpbmdGaWVsZHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogZmFsc2UsIGtleXM6ICcnIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogdHJ1ZSwga2V5czogbWlzc2luZ0ZpZWxkcyB9O1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24oXG4gIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9XG4gICAgZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgZGVzdHJveTogaXNEZXN0cm95RW5hYmxlZCA9IHRydWUsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gYGNyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAgICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byBjcmVhdGUgdGhlIG5ldyBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IGNyZWF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhcbiAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgWydpZCcsICdvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0J11cbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCkge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRPYmplY3QuY3JlYXRlZEF0LFxuICAgICAgICAgICAgICAuLi5wYXJzZUZpZWxkcyxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgICAgICBjcmVhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZVxuICAgICAgKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAgICAgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSxcbiAgICAgICAgY3JlYXRlR3JhcGhRTE11dGF0aW9uXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgICAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkLCBmaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoXG4gICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIFsnaWQnLCAnb2JqZWN0SWQnLCAndXBkYXRlZEF0J11cbiAgICAgICAgICApO1xuXG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0KSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLnVwZGF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIC4uLnBhcnNlRmllbGRzLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgICAgIHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlXG4gICAgICApICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICAgICB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lLFxuICAgICAgICB1cGRhdGVHcmFwaFFMTXV0YXRpb25cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzRGVzdHJveUVuYWJsZWQpIHtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lID0gYGRlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYERlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkZWxldGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RcbiAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAga2V5cyAmJlxuICAgICAgICAgICAga2V5cy5zcGxpdCgnLCcpLmZpbHRlcihrZXkgPT4gIVsnaWQnLCAnb2JqZWN0SWQnXS5pbmNsdWRlcyhrZXkpKVxuICAgICAgICAgICAgICAubGVuZ3RoID4gMFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmRlbGV0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgICAgIGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlXG4gICAgICApICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICAgICBkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lLFxuICAgICAgICBkZWxldGVHcmFwaFFMTXV0YXRpb25cbiAgICAgICk7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=