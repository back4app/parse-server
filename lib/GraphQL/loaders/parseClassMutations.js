"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

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
  const includedFields = includedFieldsString.split(',');
  const selectedFields = selectedFieldsString.split(',');
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
    parseGraphQLSchema.addGraphQLMutation(createGraphQLMutationName, {
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${graphQLClassName} class.`,
      args: {
        fields: {
          description: 'These are the fields used to create the object.',
          type: classGraphQLCreateType || defaultGraphQLTypes.OBJECT
        }
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, mutationInfo) {
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
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo);
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'createdAt', 'updatedAt']);
          let optimizedObject = {};

          if (needGet) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info);
          }

          return _objectSpread({}, createdObject, {
            updatedAt: createdObject.createdAt
          }, fields, {}, optimizedObject);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }

  if (isUpdateEnabled) {
    const updateGraphQLMutationName = `update${graphQLClassName}`;
    parseGraphQLSchema.addGraphQLMutation(updateGraphQLMutationName, {
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      args: {
        id: defaultGraphQLTypes.OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT
        }
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, mutationInfo) {
        try {
          const {
            id,
            fields
          } = args;
          const {
            config,
            auth,
            info
          } = context;
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
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo);
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'updatedAt']);
          let optimizedObject = {};

          if (needGet) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info);
          }

          return _objectSpread({
            id
          }, updatedObject, {}, fields, {}, optimizedObject);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }

  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = `delete${graphQLClassName}`;
    parseGraphQLSchema.addGraphQLMutation(deleteGraphQLMutationName, {
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      args: {
        id: defaultGraphQLTypes.OBJECT_ID_ATT
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, mutationInfo) {
        try {
          const {
            id
          } = args;
          const {
            config,
            auth,
            info
          } = context;
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo);
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          let optimizedObject = {};
          const splitedKeys = keys.split(',');

          if (splitedKeys.length > 1 || splitedKeys[0] !== 'id') {
            optimizedObject = await objectsQueries.getObject(className, id, keys, include, undefined, undefined, config, auth, info);
          }

          await objectsMutations.deleteObject(className, id, config, auth, info);
          return _objectSpread({
            id
          }, optimizedObject);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImNyZWF0ZSIsImlzQ3JlYXRlRW5hYmxlZCIsInVwZGF0ZSIsImlzVXBkYXRlRW5hYmxlZCIsImRlc3Ryb3kiLCJpc0Rlc3Ryb3lFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiYXJncyIsImZpZWxkcyIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiT0JKRUNUIiwiR3JhcGhRTE5vbk51bGwiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInBhcnNlRmllbGRzIiwicmVxIiwiY3JlYXRlZE9iamVjdCIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJpbmNsdWRlIiwicmVxdWlyZWRLZXlzIiwib3B0aW1pemVkT2JqZWN0Iiwib2JqZWN0c1F1ZXJpZXMiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVuZGVmaW5lZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImUiLCJoYW5kbGVFcnJvciIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJpZCIsIk9CSkVDVF9JRF9BVFQiLCJ1cGRhdGVkT2JqZWN0IiwidXBkYXRlT2JqZWN0IiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsInNwbGl0ZWRLZXlzIiwiZGVsZXRlT2JqZWN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBSUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEscUJBQXFCLEdBQUcsQ0FDNUJDLGFBRDRCLEVBRTVCQyxvQkFGNEIsRUFHNUJDLG9CQUg0QixFQUk1QkMsa0JBSjRCLEtBS3pCO0FBQ0gsUUFBTUMsY0FBYyxHQUFHRixvQkFBb0IsQ0FBQ0csS0FBckIsQ0FBMkIsR0FBM0IsQ0FBdkI7QUFDQSxRQUFNQyxjQUFjLEdBQUdMLG9CQUFvQixDQUFDSSxLQUFyQixDQUEyQixHQUEzQixDQUF2QjtBQUNBLFFBQU1FLGFBQWEsR0FBR0QsY0FBYyxDQUNqQ0UsTUFEbUIsQ0FFbEJDLEtBQUssSUFDRixDQUFDVCxhQUFhLENBQUNTLEtBQUQsQ0FBZCxJQUF5QixDQUFDTixrQkFBa0IsQ0FBQ08sUUFBbkIsQ0FBNEJELEtBQTVCLENBQTNCLElBQ0FMLGNBQWMsQ0FBQ00sUUFBZixDQUF3QkQsS0FBeEIsQ0FKZ0IsRUFNbkJFLElBTm1CLENBTWQsR0FOYyxDQUF0Qjs7QUFPQSxNQUFJLENBQUNKLGFBQWEsQ0FBQ0ssTUFBbkIsRUFBMkI7QUFDekIsV0FBTztBQUFFQyxNQUFBQSxPQUFPLEVBQUUsS0FBWDtBQUFrQkMsTUFBQUEsSUFBSSxFQUFFO0FBQXhCLEtBQVA7QUFDRCxHQUZELE1BRU87QUFDTCxXQUFPO0FBQUVELE1BQUFBLE9BQU8sRUFBRSxJQUFYO0FBQWlCQyxNQUFBQSxJQUFJ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QUNBLGNBQUlnRSxXQUFXLENBQUN6RCxNQUFaLEdBQXFCLENBQXJCLElBQTBCeUQsV0FBVyxDQUFDLENBQUQsQ0FBWCxLQUFtQixJQUFqRCxFQUF1RDtBQUNyRGYsWUFBQUEsZUFBZSxHQUFHLE1BQU1DLGNBQWMsQ0FBQ0MsU0FBZixDQUN0QnJDLFNBRHNCLEVBRXRCNkMsRUFGc0IsRUFHdEJsRCxJQUhzQixFQUl0QnNDLE9BSnNCLEVBS3RCTSxTQUxzQixFQU10QkEsU0FOc0IsRUFPdEJkLE1BUHNCLEVBUXRCQyxJQVJzQixFQVN0QkMsSUFUc0IsQ0FBeEI7QUFXRDs7QUFDRCxnQkFBTUksZ0JBQWdCLENBQUNvQixZQUFqQixDQUNKbkQsU0FESSxFQUVKNkMsRUFGSSxFQUdKcEIsTUFISSxFQUlKQyxJQUpJLEVBS0pDLElBTEksQ0FBTjtBQU9BO0FBQVNrQixZQUFBQTtBQUFULGFBQWdCVixlQUFoQjtBQUNELFNBN0JELENBNkJFLE9BQU9PLENBQVAsRUFBVTtBQUNWN0MsVUFBQUEsa0JBQWtCLENBQUM4QyxXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGOztBQXpDOEQsS0FBakU7QUEyQ0Q7QUFDRixDQTFNRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7XG4gIGV4dHJhY3RLZXlzQW5kSW5jbHVkZSxcbiAgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnLFxufSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcblxuY29uc3QgZ2V0T25seVJlcXVpcmVkRmllbGRzID0gKFxuICB1cGRhdGVkRmllbGRzLFxuICBzZWxlY3RlZEZpZWxkc1N0cmluZyxcbiAgaW5jbHVkZWRGaWVsZHNTdHJpbmcsXG4gIG5hdGl2ZU9iamVjdEZpZWxkc1xuKSA9PiB7XG4gIGNvbnN0IGluY2x1ZGVkRmllbGRzID0gaW5jbHVkZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKTtcbiAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpO1xuICBjb25zdCBtaXNzaW5nRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAuZmlsdGVyKFxuICAgICAgZmllbGQgPT5cbiAgICAgICAgKCF1cGRhdGVkRmllbGRzW2ZpZWxkXSAmJiAhbmF0aXZlT2JqZWN0RmllbGRzLmluY2x1ZGVzKGZpZWxkKSkgfHxcbiAgICAgICAgaW5jbHVkZWRGaWVsZHMuaW5jbHVkZXMoZmllbGQpXG4gICAgKVxuICAgIC5qb2luKCcsJyk7XG4gIGlmICghbWlzc2luZ0ZpZWxkcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiBmYWxzZSwga2V5czogJycgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiB0cnVlLCBrZXlzOiBtaXNzaW5nRmllbGRzIH07XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbihcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIGRlc3Ryb3k6IGlzRGVzdHJveUVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGBjcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGEgbmV3IG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgYXJnczoge1xuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHVzZWQgdG8gY3JlYXRlIHRoZSBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoXG4gICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIFsnaWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCddXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm9cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkT2JqZWN0LmNyZWF0ZWRBdCxcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgaWYgKGlzVXBkYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBgdXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbih1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHVwZGF0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB1c2VkIHRvIHVwZGF0ZSB0aGUgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RcbiAgICAgICksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgaWQsIGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ3VwZGF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgdXBkYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMudXBkYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG5cbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKFxuICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBbJ2lkJywgJ3VwZGF0ZWRBdCddXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAuLi51cGRhdGVkT2JqZWN0LFxuICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBgZGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2RlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RcbiAgICAgICksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgaWQgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuXG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGNvbnN0IHNwbGl0ZWRLZXlzID0ga2V5cy5zcGxpdCgnLCcpO1xuICAgICAgICAgIGlmIChzcGxpdGVkS2V5cy5sZW5ndGggPiAxIHx8IHNwbGl0ZWRLZXlzWzBdICE9PSAnaWQnKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm9cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuZGVsZXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIHsgaWQsIC4uLm9wdGltaXplZE9iamVjdCB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=