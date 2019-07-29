"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("./objectsMutations"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  const fields = {};
  fields.signUp = {
    description: 'The signUp mutation can be used to sign the user up.',
    args: {
      fields: {
        descriptions: 'These are the fields of the user.',
        type: parseGraphQLSchema.parseClassTypes['_User'].signUpInputType
      }
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.SIGN_UP_RESULT),

    async resolve(_source, args, context) {
      try {
        const {
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await objectsMutations.createObject('_User', fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  fields.logIn = {
    description: 'The logIn mutation can be used to log the user in.',
    args: {
      username: {
        description: 'This is the username used to log the user in.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        description: 'This is the password used to log the user in.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    type: new _graphql.GraphQLNonNull(parseGraphQLSchema.meType),

    async resolve(_source, args, context) {
      try {
        const {
          username,
          password
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return (await usersRouter.handleLogIn({
          body: {
            username,
            password
          },
          query: {},
          config,
          auth,
          info
        })).response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  fields.logOut = {
    description: 'The logOut mutation can be used to log the user out.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),

    async resolve(_source, _args, context) {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleLogOut({
          config,
          auth,
          info
        });
        return true;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const usersMutation = new _graphql.GraphQLObjectType({
    name: 'UsersMutation',
    description: 'UsersMutation is the top level type for files mutations.',
    fields
  });
  parseGraphQLSchema.graphQLTypes.push(usersMutation);
  parseGraphQLSchema.graphQLMutations.users = {
    description: 'This is the top level for users mutations.',
    type: usersMutation,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsImZpZWxkcyIsInNpZ25VcCIsImRlc2NyaXB0aW9uIiwiYXJncyIsImRlc2NyaXB0aW9ucyIsInR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJzaWduVXBJbnB1dFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJTSUdOX1VQX1JFU1VMVCIsInJlc29sdmUiLCJfc291cmNlIiwiY29udGV4dCIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsImUiLCJoYW5kbGVFcnJvciIsImxvZ0luIiwidXNlcm5hbWUiLCJHcmFwaFFMU3RyaW5nIiwicGFzc3dvcmQiLCJtZVR5cGUiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwibG9nT3V0IiwiR3JhcGhRTEJvb2xlYW4iLCJfYXJncyIsImhhbmRsZUxvZ091dCIsInVzZXJzTXV0YXRpb24iLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5hbWUiLCJncmFwaFFMVHlwZXMiLCJwdXNoIiwiZ3JhcGhRTE11dGF0aW9ucyIsInVzZXJzIiwiT2JqZWN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBTUE7O0FBQ0E7O0FBQ0E7Ozs7OztBQUVBLE1BQU1BLFdBQVcsR0FBRyxJQUFJQyxvQkFBSixFQUFwQjs7QUFFQSxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLE1BQUlBLGtCQUFrQixDQUFDQyxvQkFBdkIsRUFBNkM7QUFDM0M7QUFDRDs7QUFDRCxRQUFNQyxNQUFNLEdBQUcsRUFBZjtBQUVBQSxFQUFBQSxNQUFNLENBQUNDLE1BQVAsR0FBZ0I7QUFD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V0FBVyxDQUFDc0MsWUFBWixDQUF5QjtBQUM3Qm5CLFVBQUFBLE1BRDZCO0FBRTdCQyxVQUFBQSxJQUY2QjtBQUc3QkMsVUFBQUE7QUFINkIsU0FBekIsQ0FBTjtBQUtBLGVBQU8sSUFBUDtBQUNELE9BVEQsQ0FTRSxPQUFPRyxDQUFQLEVBQVU7QUFDVnJCLFFBQUFBLGtCQUFrQixDQUFDc0IsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUFoQmEsR0FBaEI7QUFtQkEsUUFBTWUsYUFBYSxHQUFHLElBQUlDLDBCQUFKLENBQXNCO0FBQzFDQyxJQUFBQSxJQUFJLEVBQUUsZUFEb0M7QUFFMUNsQyxJQUFBQSxXQUFXLEVBQUUsMERBRjZCO0FBRzFDRixJQUFBQTtBQUgwQyxHQUF0QixDQUF0QjtBQUtBRixFQUFBQSxrQkFBa0IsQ0FBQ3VDLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ0osYUFBckM7QUFFQXBDLEVBQUFBLGtCQUFrQixDQUFDeUMsZ0JBQW5CLENBQW9DQyxLQUFwQyxHQUE0QztBQUMxQ3RDLElBQUFBLFdBQVcsRUFBRSw0Q0FENkI7QUFFMUNHLElBQUFBLElBQUksRUFBRTZCLGFBRm9DO0FBRzFDdkIsSUFBQUEsT0FBTyxFQUFFLE1BQU0sSUFBSThCLE1BQUo7QUFIMkIsR0FBNUM7QUFLRCxDQWxHRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4uLy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuL29iamVjdHNNdXRhdGlvbnMnO1xuXG5jb25zdCB1c2Vyc1JvdXRlciA9IG5ldyBVc2Vyc1JvdXRlcigpO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5pc1VzZXJzQ2xhc3NEaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBmaWVsZHMgPSB7fTtcblxuICBmaWVsZHMuc2lnblVwID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhlIHNpZ25VcCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWduIHRoZSB1c2VyIHVwLicsXG4gICAgYXJnczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uc2lnblVwSW5wdXRUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLlNJR05fVVBfUkVTVUxUKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBmaWVsZHMubG9nSW4gPSB7XG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIHRoZSB1c2VyIGluLicsXG4gICAgYXJnczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyB0aGUgdXNlciBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyB0aGUgdXNlciBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS5tZVR5cGUpLFxuICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1c2VybmFtZSwgcGFzc3dvcmQgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIHJldHVybiAoYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nSW4oe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSkpLnJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBmaWVsZHMubG9nT3V0ID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ091dCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgdGhlIHVzZXIgb3V0LicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIF9hcmdzLCBjb250ZXh0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dPdXQoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgdXNlcnNNdXRhdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogJ1VzZXJzTXV0YXRpb24nLFxuICAgIGRlc2NyaXB0aW9uOiAnVXNlcnNNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIGZpbGVzIG11dGF0aW9ucy4nLFxuICAgIGZpZWxkcyxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaCh1c2Vyc011dGF0aW9uKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE11dGF0aW9ucy51c2VycyA9IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRvcCBsZXZlbCBmb3IgdXNlcnMgbXV0YXRpb25zLicsXG4gICAgdHlwZTogdXNlcnNNdXRhdGlvbixcbiAgICByZXNvbHZlOiAoKSA9PiBuZXcgT2JqZWN0KCksXG4gIH07XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=