"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.functionNames.length > 0) {
    const cloudCodeFunctionEnum = parseGraphQLSchema.addGraphQLType(new _graphql.GraphQLEnumType({
      name: 'CloudCodeFunction',
      description: 'The CloudCodeFunction enum type contains a list of all available cloud code functions.',
      values: parseGraphQLSchema.functionNames.reduce((values, functionName) => _objectSpread({}, values, {
        [functionName]: {
          value: functionName
        }
      }), {})
    }), true, true);
    parseGraphQLSchema.addGraphQLMutation('callCloudCode', {
      description: 'The call mutation can be used to invoke a cloud code function.',
      args: {
        functionName: {
          description: 'This is the function to be called.',
          type: new _graphql.GraphQLNonNull(cloudCodeFunctionEnum)
        },
        params: {
          description: 'These are the params to be passed to the function.',
          type: defaultGraphQLTypes.OBJECT
        }
      },
      type: defaultGraphQLTypes.ANY,

      async resolve(_source, args, context) {
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
          return (await _FunctionsRouter.FunctionsRouter.handleCloudFunction({
            params: {
              functionName
            },
            config,
            auth,
            info,
            body: params
          })).response.result;
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    }, true, true);
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZnVuY3Rpb25zTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwibGVuZ3RoIiwiY2xvdWRDb2RlRnVuY3Rpb25FbnVtIiwiYWRkR3JhcGhRTFR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJ2YWx1ZXMiLCJyZWR1Y2UiLCJmdW5jdGlvbk5hbWUiLCJ2YWx1ZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImFyZ3MiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJwYXJhbXMiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiT0JKRUNUIiwiQU5ZIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJjb250ZXh0IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJGdW5jdGlvbnNSb3V0ZXIiLCJoYW5kbGVDbG91ZEZ1bmN0aW9uIiwiYm9keSIsInJlc3BvbnNlIiwicmVzdWx0IiwiZSIsImhhbmRsZUVycm9yIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsTUFBSUEsa0JBQWtCLENBQUNDLGFBQW5CLENBQWlDQyxNQUFqQyxHQUEwQyxDQUE5QyxFQUFpRDtBQUMvQyxVQUFNQyxxQkFBcUIsR0FBR0gsa0JBQWtCLENBQUNJLGNBQW5CLENBQzVCLElBQUlDLHdCQUFKLENBQW9CO0FBQ2xCQyxNQUFBQSxJQUFJLEVBQUUsbUJBRFk7QUFFbEJDLE1BQUFBLFdBQVcsRUFDVCx3RkFIZ0I7QUFJbEJDLE1BQUFBLE1BQU0sRUFBRVIsa0JBQWtCLENBQUNDLGFBQW5CLENBQWlDUSxNQUFqQyxDQUNOLENBQUNELE1BQUQsRUFBU0UsWUFBVCx1QkFDS0YsTUFETDtBQUVFLFNBQUNFLFlBQUQsR0FBZ0I7QUFBRUMsVUFBQUEsS0FBSyxFQUFFRDtBQUFUO0FBRmxCLFFBRE0sRUFLTixFQUxNO0FBSlUsS0FBcEIsQ0FENEIsRUFhNUIsSUFiNEIsRUFjNUIsSUFkNEIsQ0FBOUI7QUFpQkFWLElBQUFBLGtCQUFrQixDQUFDWSxrQkFBbkIsQ0FDRSxlQURGLEVBRUU7QUFDRUwsTUFBQUEsV0FBVyxFQUNULGdFQUZKO0FBR0VNLE1BQUFBLElBQUksRUFBRTtBQUNKSCxRQUFBQSxZQUFZLEVBQUU7QUFDWkgsVUFBQUEsV0FBVyxFQUFFLG9DQUREO0FBRVpPLFVBQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUFtQloscUJBQW5CO0FBRk0sU0FEVjtBQUtKYSxRQUFBQSxNQUFNLEVBQUU7QUFDTlQsVUFBQUEsV0FBVyxFQUFFLG9EQURQO0FBRU5PLFVBQUFBLElBQUksRUFBRUcsbUJBQW1CLENBQUNDO0FBRnBCO0FBTEosT0FIUjtBQWFFSixNQUFBQSxJQUFJLEVBQUVHLG1CQUFtQixDQUFDRSxHQWI1Qjs7QUFjRSxZQUFNQyxPQUFOLENBQWNDLE9BQWQsRUFBdUJSLElBQXZCLEVBQTZCUyxPQUE3QixFQUFzQztBQUNwQyxZQUFJO0FBQ0YsZ0JBQU07QUFBRVosWUFBQUEsWUFBRjtBQUFnQk0sWUFBQUE7QUFBaEIsY0FBMkJILElBQWpDO0FBQ0EsZ0JBQU07QUFBRVUsWUFBQUEsTUFBRjtBQUFVQyxZQUFBQSxJQUFWO0FBQWdCQyxZQUFBQTtBQUFoQixjQUF5QkgsT0FBL0I7QUFFQSxpQkFBTyxDQUFDLE1BQU1JLGlDQUFnQkMsbUJBQWhCLENBQW9DO0FBQ2hEWCxZQUFBQSxNQUFNLEVBQUU7QUFDTk4sY0FBQUE7QUFETSxhQUR3QztBQUloRGEsWUFBQUEsTUFKZ0Q7QUFLaERDLFlBQUFBLElBTGdEO0FBTWhEQyxZQUFBQSxJQU5nRDtBQU9oREcsWUFBQUEsSUFBSSxFQUFFWjtBQVAwQyxXQUFwQyxDQUFQLEVBUUhhLFFBUkcsQ0FRTUMsTUFSYjtBQVNELFNBYkQsQ0FhRSxPQUFPQyxDQUFQLEVBQVU7QUFDVi9CLFVBQUFBLGtCQUFrQixDQUFDZ0MsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUEvQkgsS0FGRixFQW1DRSxJQW5DRixFQW9DRSxJQXBDRjtBQXNDRDtBQUNGLENBMUREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxFbnVtVHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi4vLi4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5mdW5jdGlvbk5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjbG91ZENvZGVGdW5jdGlvbkVudW0gPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgICBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgICAgICAgbmFtZTogJ0Nsb3VkQ29kZUZ1bmN0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoZSBDbG91ZENvZGVGdW5jdGlvbiBlbnVtIHR5cGUgY29udGFpbnMgYSBsaXN0IG9mIGFsbCBhdmFpbGFibGUgY2xvdWQgY29kZSBmdW5jdGlvbnMuJyxcbiAgICAgICAgdmFsdWVzOiBwYXJzZUdyYXBoUUxTY2hlbWEuZnVuY3Rpb25OYW1lcy5yZWR1Y2UoXG4gICAgICAgICAgKHZhbHVlcywgZnVuY3Rpb25OYW1lKSA9PiAoe1xuICAgICAgICAgICAgLi4udmFsdWVzLFxuICAgICAgICAgICAgW2Z1bmN0aW9uTmFtZV06IHsgdmFsdWU6IGZ1bmN0aW9uTmFtZSB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHt9XG4gICAgICAgICksXG4gICAgICB9KSxcbiAgICAgIHRydWUsXG4gICAgICB0cnVlXG4gICAgKTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAnY2FsbENsb3VkQ29kZScsXG4gICAgICB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGUgY2FsbCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBpbnZva2UgYSBjbG91ZCBjb2RlIGZ1bmN0aW9uLicsXG4gICAgICAgIGFyZ3M6IHtcbiAgICAgICAgICBmdW5jdGlvbk5hbWU6IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZnVuY3Rpb24gdG8gYmUgY2FsbGVkLicsXG4gICAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xvdWRDb2RlRnVuY3Rpb25FbnVtKSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIHBhcmFtcyB0byBiZSBwYXNzZWQgdG8gdGhlIGZ1bmN0aW9uLicsXG4gICAgICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSxcbiAgICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0KSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZnVuY3Rpb25OYW1lLCBwYXJhbXMgfSA9IGFyZ3M7XG4gICAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgICAgcmV0dXJuIChhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBib2R5OiBwYXJhbXMsXG4gICAgICAgICAgICB9KSkucmVzcG9uc2UucmVzdWx0O1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdHJ1ZSxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=