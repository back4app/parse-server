"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _parseGraphQLUtils = require("../parseGraphQLUtils");

var objectsMutations = _interopRequireWildcard(require("./objectsMutations"));

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _mutation = require("../transformers/mutation");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

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
          } = getOnlyRequiredFields(fields, keys, include, ['objectId', 'createdAt', 'updatedAt']);
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
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT
        }
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, mutationInfo) {
        try {
          const {
            objectId,
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
          const updatedObject = await objectsMutations.updateObject(className, objectId, parseFields, config, auth, info);
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo);
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['objectId', 'updatedAt']);
          let optimizedObject = {};

          if (needGet) {
            optimizedObject = await objectsQueries.getObject(className, objectId, requiredKeys, include, undefined, undefined, config, auth, info);
          }

          return _objectSpread({
            objectId: objectId
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
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, mutationInfo) {
        try {
          const {
            objectId
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

          if (splitedKeys.length > 1 || splitedKeys[0] !== 'objectId') {
            optimizedObject = await objectsQueries.getObject(className, objectId, keys, include, undefined, undefined, config, auth, info);
          }

          await objectsMutations.deleteObject(className, objectId, config, auth, info);
          return _objectSpread({
            objectId: objectId
          }, optimizedObject);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImNyZWF0ZSIsImlzQ3JlYXRlRW5hYmxlZCIsInVwZGF0ZSIsImlzVXBkYXRlRW5hYmxlZCIsImRlc3Ryb3kiLCJpc0Rlc3Ryb3lFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiYXJncyIsImZpZWxkcyIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiT0JKRUNUIiwiR3JhcGhRTE5vbk51bGwiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInBhcnNlRmllbGRzIiwicmVxIiwiY3JlYXRlZE9iamVjdCIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJpbmNsdWRlIiwicmVxdWlyZWRLZXlzIiwib3B0aW1pemVkT2JqZWN0Iiwib2JqZWN0c1F1ZXJpZXMiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVuZGVmaW5lZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImUiLCJoYW5kbGVFcnJvciIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJPQkpFQ1RfSURfQVRUIiwidXBkYXRlZE9iamVjdCIsInVwZGF0ZU9iamVjdCIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJzcGxpdGVkS2V5cyIsImRlbGV0ZU9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUlBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxxQkFBcUIsR0FBRyxDQUM1QkMsYUFENEIsRUFFNUJDLG9CQUY0QixFQUc1QkMsb0JBSDRCLEVBSTVCQyxrQkFKNEIsS0FLekI7QUFDSCxRQUFNQyxjQUFjLEdBQUdGLG9CQUFvQixDQUFDRyxLQUFyQixDQUEyQixHQUEzQixDQUF2QjtBQUNBLFFBQU1DLGNBQWMsR0FBR0wsb0JBQW9CLENBQUNJLEtBQXJCLENBQTJCLEdBQTNCLENBQXZCO0FBQ0EsUUFBTUUsYUFBYSxHQUFHRCxjQUFjLENBQ2pDRSxNQURtQixDQUVsQkMsS0FBSyxJQUNGLENBQUNULGFBQWEsQ0FBQ1MsS0FBRCxDQUFkLElBQXlCLENBQUNOLGtCQUFrQixDQUFDTyxRQUFuQixDQUE0QkQsS0FBNUIsQ0FBM0IsSUFDQUwsY0FBYyxDQUFDTSxRQUFmLENBQXdCRCxLQUF4QixDQUpnQixFQU1uQkUsSUFObUIsQ0FNZCxHQU5jLENBQXRCOztBQU9BLE1BQUksQ0FBQ0osYUFBYSxDQUFDSyxNQUFuQixFQUEyQjtBQUN6QixXQUFPO0FBQUVDLE1BQUFBLE9BQU8sRUFBRSxLQUFYO0FBQWtCQyxNQUFBQSxJQUFJLEVBQUU7QUFBeEIsS0FBUDtBQUNELEdBRkQsTUFFTztBQUNMLFdBQU87QUFBRUQsTUFBQUEsT0FBTyxFQUFFLElBQVg7QUFBaUJDLE1BQUFBLElBQUksRUFBRVA7QUFBdkIsS0FBUDtBQUNEO0FBQ0YsQ0FwQkQ7O0FBc0JBLE1BQU1RLElBQUksR0FBRyxVQUNYQyxrQkFEVyxFQUVYQyxVQUZXLEVBR1hDLGdCQUhXLEVBSVg7QUFDQSxRQUFNQyxTQUFTLEdBQUdGLFVBQVUsQ0FBQ0UsU0FBN0I7QUFDQSxRQUFNQyxnQkFBZ0IsR0FBRyw0Q0FBNEJELFNBQTVCLENBQXpCO0FBRUEsUUFBTTtBQUNKRSxJQUFBQSxNQUFNLEVBQUVDLGVBQWUsR0FBRyxJQUR0QjtBQUVKQyxJQUFBQSxNQUFNLEVBQUVDLGVBQWUsR0FBRyxJQUZ0QjtBQUdKQyxJQUFBQSxPQUFPLEVBQUVDLGdCQUFnQixHQUFHO0FBSHhCLE1BSUYsb0RBQTRCUixnQkFBNUIsQ0FKSjtBQU1BLFFBQU07QUFDSlMsSUFBQUEsc0JBREk7QUFFSkMsSUFBQUEsc0JBRkk7QUFHSkMsSUFBQUE7QUFISSxNQUlGYixrQkFBa0IsQ0FBQ2MsZUFBbkIsQ0FBbUNYLFNBQW5DLENBSko7O0FBTUEsTUFBSUcsZUFBSixFQUFxQjtBQUNuQixVQUFNUyx5QkFBeUIsR0FBSSxTQUFRWCxnQkFBaUIsRUFBNUQ7QUFDQUosSUFBQUEsa0JBQWtCLENBQUNnQixrQkFBbkIsQ0FBc0NELHlCQUF0QyxFQUFpRTtBQUMvREUsTUFBQUEsV0FBVyxFQUFHLE9BQU1GLHlCQUEwQix1REFBc0RYLGdCQUFpQixTQUR0RDtBQUUvRGMsTUFBQUEsSUFBSSxFQUFFO0FBQ0pDLFFBQUFBLE1BQU0sRUFBRTtBQUNORixVQUFBQSxXQUFXLEVBQUUsaURBRFA7QUFFTkcsVUFBQUEsSUFBSSxFQUFFVCxzQkFBc0IsSUFBSVUsbUJBQW1CLENBQUNDO0FBRjlDO0FBREosT0FGeUQ7QUFRL0RGLE1BQUFBLElBQUksRUFBRSxJQUFJRyx1QkFBSixDQUNKVixzQkFBc0IsSUFBSVEsbUJBQW1CLENBQUNDLE1BRDFDLENBUnlEOztBQVcvRCxZQUFNRSxPQUFOLENBQWNDLE9BQWQsRUFBdUJQLElBQXZCLEVBQTZCUSxPQUE3QixFQUFzQ0MsWUFBdEMsRUFBb0Q7QUFDbEQsWUFBSTtBQUNGLGNBQUk7QUFBRVIsWUFBQUE7QUFBRixjQUFhRCxJQUFqQjtBQUNBLGNBQUksQ0FBQ0MsTUFBTCxFQUFhQSxNQUFNLEdBQUcsRUFBVDtBQUNiLGdCQUFNO0FBQUVTLFlBQUFBLE1BQUY7QUFBVUMsWUFBQUEsSUFBVjtBQUFnQkMsWUFBQUE7QUFBaEIsY0FBeUJKLE9BQS9CO0FBRUEsZ0JBQU1LLFdBQVcsR0FBRyxNQUFNLDhCQUFlLFFBQWYsRUFBeUJaLE1BQXpCLEVBQWlDO0FBQ3pEaEIsWUFBQUEsU0FEeUQ7QUFFekRILFlBQUFBLGtCQUZ5RDtBQUd6RGdDLFlBQUFBLEdBQUcsRUFBRTtBQUFFSixjQUFBQSxNQUFGO0FBQVVDLGNBQUFBLElBQVY7QUFBZ0JDLGNBQUFBO0FBQWhCO0FBSG9ELFdBQWpDLENBQTFCO0FBTUEsZ0JBQU1HLGFBQWEsR0FBRyxNQUFNQyxnQkFBZ0IsQ0FBQ0MsWUFBakIsQ0FDMUJoQyxTQUQwQixFQUUxQjRCLFdBRjBCLEVBRzFCSCxNQUgwQixFQUkxQkMsSUFKMEIsRUFLMUJDLElBTDBCLENBQTVCO0FBT0EsZ0JBQU14QyxjQUFjLEdBQUcsZ0NBQWNxQyxZQUFkLENBQXZCO0FBQ0EsZ0JBQU07QUFBRTdCLFlBQUFBLElBQUY7QUFBUXNDLFlBQUFBO0FBQVIsY0FBb0IsOENBQXNCOUMsY0FBdEIsQ0FBMUI7QUFDQSxnQkFBTTtBQUFFUSxZQUFBQSxJQUFJLEVBQUV1QyxZQUFSO0FBQXNCeEMsWUFBQUE7QUFBdEIsY0FBa0NkLHFCQUFxQixDQUMzRG9DLE1BRDJELEVBRTNEckIsSUFGMkQsRUFHM0RzQyxPQUgyRCxFQUkzRCxDQUFDLFVBQUQsRUFBYSxXQUFiLEVBQTBCLFdBQTFCLENBSjJELENBQTdEO0FBTUEsY0FBSUUsZUFBZSxHQUFHLEVBQXRCOztBQUNBLGNBQUl6QyxPQUFKLEVBQWE7QUFDWHlDLFlBQUFBLGVBQWUsR0FBRyxNQUFNQyxjQUFjLENBQUNDLFNBQWYsQ0FDdEJyQyxTQURzQixFQUV0QjhCLGFBQWEsQ0FBQ1EsUUFGUSxFQUd0QkosWUFIc0IsRUFJdEJELE9BSnNCLEVBS3RCTSxTQUxzQixFQU10QkEsU0FOc0IsRUFPdEJkLE1BUHNCLEVBUXRCQyxJQVJzQixFQVN0QkMsSUFUc0IsQ0FBeEI7QUFXRDs7QUFDRCxtQ0FDS0csYUFETDtBQUVFVSxZQUFBQSxTQUFTLEVBQUVWLGFBQWEsQ0FBQ1c7QUFGM0IsYUFHS3pCLE1BSEwsTUFJS21CLGVBSkw7QUFNRCxTQTlDRCxDQThDRSxPQUFPTyxDQUFQLEVBQVU7QUFDVjdDLFVBQUFBLGtCQUFrQixDQUFDOEMsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUE3RDhELEtBQWpFO0FBK0REOztBQUVELE1BQUlyQyxlQUFKLEVBQXFCO0FBQ25CLFVBQU11Qyx5QkFBeUIsR0FBSSxTQUFRM0MsZ0JBQWlCLEVBQTVEO0FBQ0FKLElBQUFBLGtCQUFrQixDQUFDZ0Isa0JBQW5CLENBQXNDK0IseUJBQXRDLEVBQWlFO0FBQy9EOUIsTUFBQUEsV0FBVyxFQUFHLE9BQU04Qix5QkFBMEIsb0RBQW1EM0MsZ0JBQWlCLFNBRG5EO0FBRS9EYyxNQUFBQSxJQUFJLEVBQUU7QUFDSnVCLFFBQUFBLFFBQVEsRUFBRXBCLG1CQUFtQixDQUFDMkIsYUFEMUI7QUFFSjdCLFFBQUFBLE1BQU0sRUFBRTtBQUNORixVQUFBQSxXQUFXLEVBQUUsaURBRFA7QUFFTkcsVUFBQUEsSUFBSSxFQUFFUixzQkFBc0IsSUFBSVMsbUJBQW1CLENBQUNDO0FBRjlDO0FBRkosT0FGeUQ7QUFTL0RGLE1BQUFBLElBQUksRUFBRSxJQUFJRyx1QkFBSixDQUNKVixzQkFBc0IsSUFBSVEsbUJBQW1CLENBQUNDLE1BRDFDLENBVHlEOztBQVkvRCxZQUFNRSxPQUFOLENBQWNDLE9BQWQsRUFBdUJQLElBQXZCLEVBQTZCUSxPQUE3QixFQUFzQ0MsWUFBdEMsRUFBb0Q7QUFDbEQsWUFBSTtBQUNGLGdCQUFNO0FBQUVjLFlBQUFBLFFBQUY7QUFBWXRCLFlBQUFBO0FBQVosY0FBdUJELElBQTdCO0FBQ0EsZ0JBQU07QUFBRVUsWUFBQUEsTUFBRjtBQUFVQyxZQUFBQSxJQUFWO0FBQWdCQyxZQUFBQTtBQUFoQixjQUF5QkosT0FBL0I7QUFFQSxnQkFBTUssV0FBVyxHQUFHLE1BQU0sOEJBQWUsUUFBZixFQUF5QlosTUFBekIsRUFBaUM7QUFDekRoQixZQUFBQSxTQUR5RDtBQUV6REgsWUFBQUEsa0JBRnlEO0FBR3pEZ0MsWUFBQUEsR0FBRyxFQUFFO0FBQUVKLGNBQUFBLE1BQUY7QUFBVUMsY0FBQUEsSUFBVjtBQUFnQkMsY0FBQUE7QUFBaEI7QUFIb0QsV0FBakMsQ0FBMUI7QUFNQSxnQkFBTW1CLGFBQWEsR0FBRyxNQUFNZixnQkFBZ0IsQ0FBQ2dCLFlBQWpCLENBQzFCL0MsU0FEMEIsRUFFMUJzQyxRQUYwQixFQUcxQlYsV0FIMEIsRUFJMUJILE1BSjBCLEVBSzFCQyxJQUwwQixFQU0xQkMsSUFOMEIsQ0FBNUI7QUFRQSxnQkFBTXhDLGNBQWMsR0FBRyxnQ0FBY3FDLFlBQWQsQ0FBdkI7QUFDQSxnQkFBTTtBQUFFN0IsWUFBQUEsSUFBRjtBQUFRc0MsWUFBQUE7QUFBUixjQUFvQiw4Q0FBc0I5QyxjQUF0QixDQUExQjtBQUVBLGdCQUFNO0FBQUVRLFlBQUFBLElBQUksRUFBRXVDLFlBQVI7QUFBc0J4QyxZQUFBQTtBQUF0QixjQUFrQ2QscUJBQXFCLENBQzNEb0MsTUFEMkQsRUFFM0RyQixJQUYyRCxFQUczRHNDLE9BSDJELEVBSTNELENBQUMsVUFBRCxFQUFhLFdBQWIsQ0FKMkQsQ0FBN0Q7QUFNQSxjQUFJRSxlQUFlLEdBQUcsRUFBdEI7O0FBQ0EsY0FBSXpDLE9BQUosRUFBYTtBQUNYeUMsWUFBQUEsZUFBZSxHQUFHLE1BQU1DLGNBQWMsQ0FBQ0MsU0FBZixDQUN0QnJDLFNBRHNCLEVBRXRCc0MsUUFGc0IsRUFHdEJKLFlBSHNCLEVBSXRCRCxPQUpzQixFQUt0Qk0sU0FMc0IsRUFNdEJBLFNBTnNCLEVBT3RCZCxNQVBzQixFQVF0QkMsSUFSc0IsRUFTdEJDLElBVHNCLENBQXhCO0FBV0Q7O0FBQ0Q7QUFDRVcsWUFBQUEsUUFBUSxFQUFFQTtBQURaLGFBRUtRLGFBRkwsTUFHSzlCLE1BSEwsTUFJS21CLGVBSkw7QUFNRCxTQS9DRCxDQStDRSxPQUFPTyxDQUFQLEVBQVU7QUFDVjdDLFVBQUFBLGtCQUFrQixDQUFDOEMsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUEvRDhELEtBQWpFO0FBaUVEOztBQUVELE1BQUluQyxnQkFBSixFQUFzQjtBQUNwQixVQUFNeUMseUJBQXlCLEdBQUksU0FBUS9DLGdCQUFpQixFQUE1RDtBQUNBSixJQUFBQSxrQkFBa0IsQ0FBQ2dCLGtCQUFuQixDQUFzQ21DLHlCQUF0QyxFQUFpRTtBQUMvRGxDLE1BQUFBLFdBQVcsRUFBRyxPQUFNa0MseUJBQTBCLG9EQUFtRC9DLGdCQUFpQixTQURuRDtBQUUvRGMsTUFBQUEsSUFBSSxFQUFFO0FBQ0p1QixRQUFBQSxRQUFRLEVBQUVwQixtQkFBbUIsQ0FBQzJCO0FBRDFCLE9BRnlEO0FBSy9ENUIsTUFBQUEsSUFBSSxFQUFFLElBQUlHLHVCQUFKLENBQ0pWLHNCQUFzQixJQUFJUSxtQkFBbUIsQ0FBQ0MsTUFEMUMsQ0FMeUQ7O0FBUS9ELFlBQU1FLE9BQU4sQ0FBY0MsT0FBZCxFQUF1QlAsSUFBdkIsRUFBNkJRLE9BQTdCLEVBQXNDQyxZQUF0QyxFQUFvRDtBQUNsRCxZQUFJO0FBQ0YsZ0JBQU07QUFBRWMsWUFBQUE7QUFBRixjQUFldkIsSUFBckI7QUFDQSxnQkFBTTtBQUFFVSxZQUFBQSxNQUFGO0FBQVVDLFlBQUFBLElBQVY7QUFBZ0JDLFlBQUFBO0FBQWhCLGNBQXlCSixPQUEvQjtBQUNBLGdCQUFNcEMsY0FBYyxHQUFHLGdDQUFjcUMsWUFBZCxDQUF2QjtBQUNBLGdCQUFNO0FBQUU3QixZQUFBQSxJQUFGO0FBQVFzQyxZQUFBQTtBQUFSLGNBQW9CLDhDQUFzQjlDLGNBQXRCLENBQTFCO0FBRUEsY0FBSWdELGVBQWUsR0FBRyxFQUF0QjtBQUNBLGdCQUFNYyxXQUFXLEdBQUd0RCxJQUFJLENBQUNULEtBQUwsQ0FBVyxHQUFYLENBQXBCOztBQUNBLGNBQUkrRCxXQUFXLENBQUN4RCxNQUFaLEdBQXFCLENBQXJCLElBQTBCd0QsV0FBVyxDQUFDLENBQUQsQ0FBWCxLQUFtQixVQUFqRCxFQUE2RDtBQUMzRGQsWUFBQUEsZUFBZSxHQUFHLE1BQU1DLGNBQWMsQ0FBQ0MsU0FBZixDQUN0QnJDLFNBRHNCLEVBRXRCc0MsUUFGc0IsRUFHdEIzQyxJQUhzQixFQUl0QnNDLE9BSnNCLEVBS3RCTSxTQUxzQixFQU10QkEsU0FOc0IsRUFPdEJkLE1BUHNCLEVBUXRCQyxJQVJzQixFQVN0QkMsSUFUc0IsQ0FBeEI7QUFXRDs7QUFDRCxnQkFBTUksZ0JBQWdCLENBQUNtQixZQUFqQixDQUNKbEQsU0FESSxFQUVKc0MsUUFGSSxFQUdKYixNQUhJLEVBSUpDLElBSkksRUFLSkMsSUFMSSxDQUFOO0FBT0E7QUFBU1csWUFBQUEsUUFBUSxFQUFFQTtBQUFuQixhQUFnQ0gsZUFBaEM7QUFDRCxTQTdCRCxDQTZCRSxPQUFPTyxDQUFQLEVBQVU7QUFDVjdDLFVBQUFBLGtCQUFrQixDQUFDOEMsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUF6QzhELEtBQWpFO0FBMkNEO0FBQ0YsQ0ExTUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQge1xuICBleHRyYWN0S2V5c0FuZEluY2x1ZGUsXG4gIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5cbmNvbnN0IGdldE9ubHlSZXF1aXJlZEZpZWxkcyA9IChcbiAgdXBkYXRlZEZpZWxkcyxcbiAgc2VsZWN0ZWRGaWVsZHNTdHJpbmcsXG4gIGluY2x1ZGVkRmllbGRzU3RyaW5nLFxuICBuYXRpdmVPYmplY3RGaWVsZHNcbikgPT4ge1xuICBjb25zdCBpbmNsdWRlZEZpZWxkcyA9IGluY2x1ZGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJyk7XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKTtcbiAgY29uc3QgbWlzc2luZ0ZpZWxkcyA9IHNlbGVjdGVkRmllbGRzXG4gICAgLmZpbHRlcihcbiAgICAgIGZpZWxkID0+XG4gICAgICAgICghdXBkYXRlZEZpZWxkc1tmaWVsZF0gJiYgIW5hdGl2ZU9iamVjdEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHx8XG4gICAgICAgIGluY2x1ZGVkRmllbGRzLmluY2x1ZGVzKGZpZWxkKVxuICAgIClcbiAgICAuam9pbignLCcpO1xuICBpZiAoIW1pc3NpbmdGaWVsZHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogZmFsc2UsIGtleXM6ICcnIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogdHJ1ZSwga2V5czogbWlzc2luZ0ZpZWxkcyB9O1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24oXG4gIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICBkZXN0cm95OiBpc0Rlc3Ryb3lFbmFibGVkID0gdHJ1ZSxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBgY3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB1c2VkIHRvIGNyZWF0ZSB0aGUgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RcbiAgICAgICksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IGNyZWF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKFxuICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBbJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnXVxuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0KSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uY3JlYXRlZE9iamVjdCxcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogY3JlYXRlZE9iamVjdC5jcmVhdGVkQXQsXG4gICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24odXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIG9iamVjdElkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRF9BVFQsXG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICApLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IG9iamVjdElkLCBmaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9iamVjdElkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuXG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhcbiAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgWydvYmplY3RJZCcsICd1cGRhdGVkQXQnXVxuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0KSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RJZCxcbiAgICAgICAgICAgIC4uLnVwZGF0ZWRPYmplY3QsXG4gICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc0Rlc3Ryb3lFbmFibGVkKSB7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGBkZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gZGVsZXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgYXJnczoge1xuICAgICAgICBvYmplY3RJZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSURfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBvYmplY3RJZCB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG5cbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgY29uc3Qgc3BsaXRlZEtleXMgPSBrZXlzLnNwbGl0KCcsJyk7XG4gICAgICAgICAgaWYgKHNwbGl0ZWRLZXlzLmxlbmd0aCA+IDEgfHwgc3BsaXRlZEtleXNbMF0gIT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3RJZCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgb2JqZWN0c011dGF0aW9ucy5kZWxldGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBvYmplY3RJZCxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4geyBvYmplY3RJZDogb2JqZWN0SWQsIC4uLm9wdGltaXplZE9iamVjdCB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=