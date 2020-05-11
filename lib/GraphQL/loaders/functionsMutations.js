"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.functionNames.length > 0) {
    const cloudCodeFunctionEnum = parseGraphQLSchema.addGraphQLType(new _graphql.GraphQLEnumType({
      name: 'CloudCodeFunction',
      description: 'The CloudCodeFunction enum type contains a list of all available cloud code functions.',
      values: parseGraphQLSchema.functionNames.reduce((values, functionName) => _objectSpread(_objectSpread({}, values), {}, {
        [functionName]: {
          value: functionName
        }
      }), {})
    }), true, true);
    const callCloudCodeMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: 'CallCloudCode',
      description: 'The callCloudCode mutation can be used to invoke a cloud code function.',
      inputFields: {
        functionName: {
          description: 'This is the function to be called.',
          type: new _graphql.GraphQLNonNull(cloudCodeFunctionEnum)
        },
        params: {
          description: 'These are the params to be passed to the function.',
          type: defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        result: {
          description: 'This is the result value of the cloud code function execution.',
          type: defaultGraphQLTypes.ANY
        }
      },
      mutateAndGetPayload: async (args, context) => {
        try {
          const {
            functionName,
            params
          } = args;
          const {
            config,
            auth,
            info
          } = context;
          return {
            result: (await _FunctionsRouter.FunctionsRouter.handleCloudFunction({
              params: {
                functionName
              },
              config,
              auth,
              info,
              body: params
            })).response.result
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    parseGraphQLSchema.addGraphQLType(callCloudCodeMutation.args.input.type.ofType, true, true);
    parseGraphQLSchema.addGraphQLType(callCloudCodeMutation.type, true, true);
    parseGraphQLSchema.addGraphQLMutation('callCloudCode', callCloudCodeMutation, true, true);
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZnVuY3Rpb25zTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwibGVuZ3RoIiwiY2xvdWRDb2RlRnVuY3Rpb25FbnVtIiwiYWRkR3JhcGhRTFR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJ2YWx1ZXMiLCJyZWR1Y2UiLCJmdW5jdGlvbk5hbWUiLCJ2YWx1ZSIsImNhbGxDbG91ZENvZGVNdXRhdGlvbiIsImlucHV0RmllbGRzIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwicGFyYW1zIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVCIsIm91dHB1dEZpZWxkcyIsInJlc3VsdCIsIkFOWSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwiRnVuY3Rpb25zUm91dGVyIiwiaGFuZGxlQ2xvdWRGdW5jdGlvbiIsImJvZHkiLCJyZXNwb25zZSIsImUiLCJoYW5kbGVFcnJvciIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsTUFBSUEsa0JBQWtCLENBQUNDLGFBQW5CLENBQWlDQyxNQUFqQyxHQUEwQyxDQUE5QyxFQUFpRDtBQUMvQyxVQUFNQyxxQkFBcUIsR0FBR0gsa0JBQWtCLENBQUNJLGNBQW5CLENBQzVCLElBQUlDLHdCQUFKLENBQW9CO0FBQ2xCQyxNQUFBQSxJQUFJLEVBQUUsbUJBRFk7QUFFbEJDLE1BQUFBLFdBQVcsRUFDVCx3RkFIZ0I7QUFJbEJDLE1BQUFBLE1BQU0sRUFBRVIsa0JBQWtCLENBQUNDLGFBQW5CLENBQWlDUSxNQUFqQyxDQUNOLENBQUNELE1BQUQsRUFBU0UsWUFBVCxxQ0FDS0YsTUFETDtBQUVFLFNBQUNFLFlBQUQsR0FBZ0I7QUFBRUMsVUFBQUEsS0FBSyxFQUFFRDtBQUFUO0FBRmxCLFFBRE0sRUFLTixFQUxNO0FBSlUsS0FBcEIsQ0FENEIsRUFhNUIsSUFiNEIsRUFjNUIsSUFkNEIsQ0FBOUI7QUFpQkEsVUFBTUUscUJBQXFCLEdBQUcsZ0RBQTZCO0FBQ3pETixNQUFBQSxJQUFJLEVBQUUsZUFEbUQ7QUFFekRDLE1BQUFBLFdBQVcsRUFDVCx5RUFIdUQ7QUFJekRNLE1BQUFBLFdBQVcsRUFBRTtBQUNYSCxRQUFBQSxZQUFZLEVBQUU7QUFDWkgsVUFBQUEsV0FBVyxFQUFFLG9DQUREO0FBRVpPLFVBQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUFtQloscUJBQW5CO0FBRk0sU0FESDtBQUtYYSxRQUFBQSxNQUFNLEVBQUU7QUFDTlQsVUFBQUEsV0FBVyxFQUFFLG9EQURQO0FBRU5PLFVBQUFBLElBQUksRUFBRUcsbUJBQW1CLENBQUNDO0FBRnBCO0FBTEcsT0FKNEM7QUFjekRDLE1BQUFBLFlBQVksRUFBRTtBQUNaQyxRQUFBQSxNQUFNLEVBQUU7QUFDTmIsVUFBQUEsV0FBVyxFQUNULGdFQUZJO0FBR05PLFVBQUFBLElBQUksRUFBRUcsbUJBQW1CLENBQUNJO0FBSHBCO0FBREksT0FkMkM7QUFxQnpEQyxNQUFBQSxtQkFBbUIsRUFBRSxPQUFPQyxJQUFQLEVBQWFDLE9BQWIsS0FBeUI7QUFDNUMsWUFBSTtBQUNGLGdCQUFNO0FBQUVkLFlBQUFBLFlBQUY7QUFBZ0JNLFlBQUFBO0FBQWhCLGNBQTJCTyxJQUFqQztBQUNBLGdCQUFNO0FBQUVFLFlBQUFBLE1BQUY7QUFBVUMsWUFBQUEsSUFBVjtBQUFnQkMsWUFBQUE7QUFBaEIsY0FBeUJILE9BQS9CO0FBRUEsaUJBQU87QUFDTEosWUFBQUEsTUFBTSxFQUFFLENBQ04sTUFBTVEsaUNBQWdCQyxtQkFBaEIsQ0FBb0M7QUFDeENiLGNBQUFBLE1BQU0sRUFBRTtBQUNOTixnQkFBQUE7QUFETSxlQURnQztBQUl4Q2UsY0FBQUEsTUFKd0M7QUFLeENDLGNBQUFBLElBTHdDO0FBTXhDQyxjQUFBQSxJQU53QztBQU94Q0csY0FBQUEsSUFBSSxFQUFFZDtBQVBrQyxhQUFwQyxDQURBLEVBVU5lLFFBVk0sQ0FVR1g7QUFYTixXQUFQO0FBYUQsU0FqQkQsQ0FpQkUsT0FBT1ksQ0FBUCxFQUFVO0FBQ1ZoQyxVQUFBQSxrQkFBa0IsQ0FBQ2lDLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUExQ3dELEtBQTdCLENBQTlCO0FBNkNBaEMsSUFBQUEsa0JBQWtCLENBQUNJLGNBQW5CLENBQ0VRLHFCQUFxQixDQUFDVyxJQUF0QixDQUEyQlcsS0FBM0IsQ0FBaUNwQixJQUFqQyxDQUFzQ3FCLE1BRHhDLEVBRUUsSUFGRixFQUdFLElBSEY7QUFLQW5DLElBQUFBLGtCQUFrQixDQUFDSSxjQUFuQixDQUFrQ1EscUJBQXFCLENBQUNFLElBQXhELEVBQThELElBQTlELEVBQW9FLElBQXBFO0FBQ0FkLElBQUFBLGtCQUFrQixDQUFDb0Msa0JBQW5CLENBQ0UsZUFERixFQUVFeEIscUJBRkYsRUFHRSxJQUhGLEVBSUUsSUFKRjtBQU1EO0FBQ0YsQ0E3RUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTEVudW1UeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuLi8uLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmZ1bmN0aW9uTmFtZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNsb3VkQ29kZUZ1bmN0aW9uRW51bSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgIG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgICAgICBuYW1lOiAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhlIENsb3VkQ29kZUZ1bmN0aW9uIGVudW0gdHlwZSBjb250YWlucyBhIGxpc3Qgb2YgYWxsIGF2YWlsYWJsZSBjbG91ZCBjb2RlIGZ1bmN0aW9ucy4nLFxuICAgICAgICB2YWx1ZXM6IHBhcnNlR3JhcGhRTFNjaGVtYS5mdW5jdGlvbk5hbWVzLnJlZHVjZShcbiAgICAgICAgICAodmFsdWVzLCBmdW5jdGlvbk5hbWUpID0+ICh7XG4gICAgICAgICAgICAuLi52YWx1ZXMsXG4gICAgICAgICAgICBbZnVuY3Rpb25OYW1lXTogeyB2YWx1ZTogZnVuY3Rpb25OYW1lIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgICAge31cbiAgICAgICAgKSxcbiAgICAgIH0pLFxuICAgICAgdHJ1ZSxcbiAgICAgIHRydWVcbiAgICApO1xuXG4gICAgY29uc3QgY2FsbENsb3VkQ29kZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiAnQ2FsbENsb3VkQ29kZScsXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZSBjYWxsQ2xvdWRDb2RlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGludm9rZSBhIGNsb3VkIGNvZGUgZnVuY3Rpb24uJyxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZnVuY3Rpb24gdG8gYmUgY2FsbGVkLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsb3VkQ29kZUZ1bmN0aW9uRW51bSksXG4gICAgICAgIH0sXG4gICAgICAgIHBhcmFtczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBwYXJhbXMgdG8gYmUgcGFzc2VkIHRvIHRoZSBmdW5jdGlvbi4nLFxuICAgICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICByZXN1bHQ6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAgICdUaGlzIGlzIHRoZSByZXN1bHQgdmFsdWUgb2YgdGhlIGNsb3VkIGNvZGUgZnVuY3Rpb24gZXhlY3V0aW9uLicsXG4gICAgICAgICAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGZ1bmN0aW9uTmFtZSwgcGFyYW1zIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3VsdDogKFxuICAgICAgICAgICAgICBhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgIGJvZHk6IHBhcmFtcyxcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICkucmVzcG9uc2UucmVzdWx0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgICBjYWxsQ2xvdWRDb2RlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICAgIHRydWUsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2FsbENsb3VkQ29kZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAnY2FsbENsb3VkQ29kZScsXG4gICAgICBjYWxsQ2xvdWRDb2RlTXV0YXRpb24sXG4gICAgICB0cnVlLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==