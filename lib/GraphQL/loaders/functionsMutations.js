"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const load = parseGraphQLSchema => {
  const fields = {};
  fields.call = {
    description: 'The call mutation can be used to invoke a cloud code function.',
    args: {
      functionName: {
        description: 'This is the name of the function to be called.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
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

  };
  const functionsMutation = new _graphql.GraphQLObjectType({
    name: 'FunctionsMutation',
    description: 'FunctionsMutation is the top level type for functions mutations.',
    fields
  });
  parseGraphQLSchema.graphQLTypes.push(functionsMutation);
  parseGraphQLSchema.graphQLMutations.functions = {
    description: 'This is the top level for functions mutations.',
    type: functionsMutation,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZnVuY3Rpb25zTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJmaWVsZHMiLCJjYWxsIiwiZGVzY3JpcHRpb24iLCJhcmdzIiwiZnVuY3Rpb25OYW1lIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTFN0cmluZyIsInBhcmFtcyIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJBTlkiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJib2R5IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJmdW5jdGlvbnNNdXRhdGlvbiIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImdyYXBoUUxUeXBlcyIsInB1c2giLCJncmFwaFFMTXV0YXRpb25zIiwiZnVuY3Rpb25zIiwiT2JqZWN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLFFBQU1DLE1BQU0sR0FBRyxFQUFmO0FBRUFBLEVBQUFBLE1BQU0sQ0FBQ0MsSUFBUCxHQUFjO0FBQ1pDLElBQUFBLFdBQVcsRUFDVCxnRUFGVTtBQUdaQyxJQUFBQSxJQUFJLEVBQUU7QUFDSkMsTUFBQUEsWUFBWSxFQUFFO0FBQ1pGLFFBQUFBLFdBQVcsRUFBRSxnREFERDtBQUVaRyxRQUFBQSxJQUFJLEVBQUUsSUFBSUMsdUJBQUosQ0FBbUJDLHNCQUFuQjtBQUZNLE9BRFY7QUFLSkMsTUFBQUEsTUFBTSxFQUFFO0FBQ05OLFFBQUFBLFdBQVcsRUFBRSxvREFEUDtBQUVORyxRQUFBQSxJQUFJLEVBQUVJLG1CQUFtQixDQUFDQztBQUZwQjtBQUxKLEtBSE07QUFhWkwsSUFBQUEsSUFBSSxFQUFFSSxtQkFBbUIsQ0FBQ0UsR0FiZDs7QUFjWixVQUFNQyxPQUFOLENBQWNDLE9BQWQsRUFBdUJWLElBQXZCLEVBQTZCVyxPQUE3QixFQUFzQztBQUNwQyxVQUFJO0FBQ0YsY0FBTTtBQUFFVixVQUFBQSxZQUFGO0FBQWdCSSxVQUFBQTtBQUFoQixZQUEyQkwsSUFBakM7QUFDQSxjQUFNO0FBQUVZLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUEsSUFBVjtBQUFnQkMsVUFBQUE7QUFBaEIsWUFBeUJILE9BQS9CO0FBRUEsZUFBTyxDQUFDLE1BQU1JLGlDQUFnQkMsbUJBQWhCLENBQW9DO0FBQ2hEWCxVQUFBQSxNQUFNLEVBQUU7QUFDTkosWUFBQUE7QUFETSxXQUR3QztBQUloRFcsVUFBQUEsTUFKZ0Q7QUFLaERDLFVBQUFBLElBTGdEO0FBTWhEQyxVQUFBQSxJQU5nRDtBQU9oREcsVUFBQUEsSUFBSSxFQUFFWjtBQVAwQyxTQUFwQyxDQUFQLEVBUUhhLFFBUkcsQ0FRTUMsTUFSYjtBQVNELE9BYkQsQ0FhRSxPQUFPQyxDQUFQLEVBQVU7QUFDVnhCLFFBQUFBLGtCQUFrQixDQUFDeUIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUEvQlcsR0FBZDtBQWtDQSxRQUFNRSxpQkFBaUIsR0FBRyxJQUFJQywwQkFBSixDQUFzQjtBQUM5Q0MsSUFBQUEsSUFBSSxFQUFFLG1CQUR3QztBQUU5Q3pCLElBQUFBLFdBQVcsRUFDVCxrRUFINEM7QUFJOUNGLElBQUFBO0FBSjhDLEdBQXRCLENBQTFCO0FBTUFELEVBQUFBLGtCQUFrQixDQUFDNkIsWUFBbkIsQ0FBZ0NDLElBQWhDLENBQXFDSixpQkFBckM7QUFFQTFCLEVBQUFBLGtCQUFrQixDQUFDK0IsZ0JBQW5CLENBQW9DQyxTQUFwQyxHQUFnRDtBQUM5QzdCLElBQUFBLFdBQVcsRUFBRSxnREFEaUM7QUFFOUNHLElBQUFBLElBQUksRUFBRW9CLGlCQUZ3QztBQUc5Q2IsSUFBQUEsT0FBTyxFQUFFLE1BQU0sSUFBSW9CLE1BQUo7QUFIK0IsR0FBaEQ7QUFLRCxDQWxERCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxPYmplY3RUeXBlLCBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTFN0cmluZyB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi4vLi4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgZmllbGRzID0ge307XG5cbiAgZmllbGRzLmNhbGwgPSB7XG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNhbGwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gaW52b2tlIGEgY2xvdWQgY29kZSBmdW5jdGlvbi4nLFxuICAgIGFyZ3M6IHtcbiAgICAgIGZ1bmN0aW9uTmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5hbWUgb2YgdGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBwYXJhbXMgdG8gYmUgcGFzc2VkIHRvIHRoZSBmdW5jdGlvbi4nLFxuICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZnVuY3Rpb25OYW1lLCBwYXJhbXMgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIHJldHVybiAoYXdhaXQgRnVuY3Rpb25zUm91dGVyLmhhbmRsZUNsb3VkRnVuY3Rpb24oe1xuICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgZnVuY3Rpb25OYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgICBib2R5OiBwYXJhbXMsXG4gICAgICAgIH0pKS5yZXNwb25zZS5yZXN1bHQ7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xuXG4gIGNvbnN0IGZ1bmN0aW9uc011dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiAnRnVuY3Rpb25zTXV0YXRpb24nLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ0Z1bmN0aW9uc011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgZnVuY3Rpb25zIG11dGF0aW9ucy4nLFxuICAgIGZpZWxkcyxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChmdW5jdGlvbnNNdXRhdGlvbik7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxNdXRhdGlvbnMuZnVuY3Rpb25zID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdG9wIGxldmVsIGZvciBmdW5jdGlvbnMgbXV0YXRpb25zLicsXG4gICAgdHlwZTogZnVuY3Rpb25zTXV0YXRpb24sXG4gICAgcmVzb2x2ZTogKCkgPT4gbmV3IE9iamVjdCgpLFxuICB9O1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19