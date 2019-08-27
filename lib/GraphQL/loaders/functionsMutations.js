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
  parseGraphQLSchema.addGraphQLMutation('callCloudCode', {
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

  }, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZnVuY3Rpb25zTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJmdW5jdGlvbk5hbWUiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwicGFyYW1zIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVCIsIkFOWSIsInJlc29sdmUiLCJfc291cmNlIiwiY29udGV4dCIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwiRnVuY3Rpb25zUm91dGVyIiwiaGFuZGxlQ2xvdWRGdW5jdGlvbiIsImJvZHkiLCJyZXNwb25zZSIsInJlc3VsdCIsImUiLCJoYW5kbGVFcnJvciJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7O0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGtCQUFuQixDQUNFLGVBREYsRUFFRTtBQUNFQyxJQUFBQSxXQUFXLEVBQ1QsZ0VBRko7QUFHRUMsSUFBQUEsSUFBSSxFQUFFO0FBQ0pDLE1BQUFBLFlBQVksRUFBRTtBQUNaRixRQUFBQSxXQUFXLEVBQUUsZ0RBREQ7QUFFWkcsUUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CQyxzQkFBbkI7QUFGTSxPQURWO0FBS0pDLE1BQUFBLE1BQU0sRUFBRTtBQUNOTixRQUFBQSxXQUFXLEVBQUUsb0RBRFA7QUFFTkcsUUFBQUEsSUFBSSxFQUFFSSxtQkFBbUIsQ0FBQ0M7QUFGcEI7QUFMSixLQUhSO0FBYUVMLElBQUFBLElBQUksRUFBRUksbUJBQW1CLENBQUNFLEdBYjVCOztBQWNFLFVBQU1DLE9BQU4sQ0FBY0MsT0FBZCxFQUF1QlYsSUFBdkIsRUFBNkJXLE9BQTdCLEVBQXNDO0FBQ3BDLFVBQUk7QUFDRixjQUFNO0FBQUVWLFVBQUFBLFlBQUY7QUFBZ0JJLFVBQUFBO0FBQWhCLFlBQTJCTCxJQUFqQztBQUNBLGNBQU07QUFBRVksVUFBQUEsTUFBRjtBQUFVQyxVQUFBQSxJQUFWO0FBQWdCQyxVQUFBQTtBQUFoQixZQUF5QkgsT0FBL0I7QUFFQSxlQUFPLENBQUMsTUFBTUksaUNBQWdCQyxtQkFBaEIsQ0FBb0M7QUFDaERYLFVBQUFBLE1BQU0sRUFBRTtBQUNOSixZQUFBQTtBQURNLFdBRHdDO0FBSWhEVyxVQUFBQSxNQUpnRDtBQUtoREMsVUFBQUEsSUFMZ0Q7QUFNaERDLFVBQUFBLElBTmdEO0FBT2hERyxVQUFBQSxJQUFJLEVBQUVaO0FBUDBDLFNBQXBDLENBQVAsRUFRSGEsUUFSRyxDQVFNQyxNQVJiO0FBU0QsT0FiRCxDQWFFLE9BQU9DLENBQVAsRUFBVTtBQUNWdkIsUUFBQUEsa0JBQWtCLENBQUN3QixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGOztBQS9CSCxHQUZGLEVBbUNFLElBbkNGLEVBb0NFLElBcENGO0FBc0NELENBdkNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxTdHJpbmcgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4uLy4uL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2NhbGxDbG91ZENvZGUnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIGNhbGwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gaW52b2tlIGEgY2xvdWQgY29kZSBmdW5jdGlvbi4nLFxuICAgICAgYXJnczoge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5hbWUgb2YgdGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgICAgfSxcbiAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIHBhcmFtcyB0byBiZSBwYXNzZWQgdG8gdGhlIGZ1bmN0aW9uLicsXG4gICAgICAgICAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGZ1bmN0aW9uTmFtZSwgcGFyYW1zIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgcmV0dXJuIChhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgZnVuY3Rpb25OYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgYm9keTogcGFyYW1zLFxuICAgICAgICAgIH0pKS5yZXNwb25zZS5yZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==