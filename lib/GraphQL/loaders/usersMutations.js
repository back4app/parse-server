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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJmaWVsZHMiLCJzaWduVXAiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwic2lnblVwSW5wdXRUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiU0lHTl9VUF9SRVNVTFQiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJlIiwiaGFuZGxlRXJyb3IiLCJsb2dJbiIsInVzZXJuYW1lIiwiR3JhcGhRTFN0cmluZyIsInBhc3N3b3JkIiwibWVUeXBlIiwiaGFuZGxlTG9nSW4iLCJib2R5IiwicXVlcnkiLCJyZXNwb25zZSIsImxvZ091dCIsIkdyYXBoUUxCb29sZWFuIiwiX2FyZ3MiLCJoYW5kbGVMb2dPdXQiLCJ1c2Vyc011dGF0aW9uIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZ3JhcGhRTFR5cGVzIiwicHVzaCIsImdyYXBoUUxNdXRhdGlvbnMiLCJ1c2VycyIsIk9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQU1BOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxNQUFNQSxXQUFXLEdBQUcsSUFBSUMsb0JBQUosRUFBcEI7O0FBRUEsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQyxRQUFNQyxNQUFNLEdBQUcsRUFBZjtBQUVBQSxFQUFBQSxNQUFNLENBQUNDLE1BQVAsR0FBZ0I7QUFDZEMsSUFBQUEsV0FBVyxFQUFFLHNEQURDO0FBRWRDLElBQUFBLElBQUksRUFBRTtBQUNKSCxNQUFBQSxNQUFNLEVBQUU7QUFD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QUE7QUFINkIsU0FBekIsQ0FBTjtBQUtBLGVBQU8sSUFBUDtBQUNELE9BVEQsQ0FTRSxPQUFPRyxDQUFQLEVBQVU7QUFDVnBCLFFBQUFBLGtCQUFrQixDQUFDcUIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUFoQmEsR0FBaEI7QUFtQkEsUUFBTWUsYUFBYSxHQUFHLElBQUlDLDBCQUFKLENBQXNCO0FBQzFDQyxJQUFBQSxJQUFJLEVBQUUsZUFEb0M7QUFFMUNsQyxJQUFBQSxXQUFXLEVBQUUsMERBRjZCO0FBRzFDRixJQUFBQTtBQUgwQyxHQUF0QixDQUF0QjtBQUtBRCxFQUFBQSxrQkFBa0IsQ0FBQ3NDLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ0osYUFBckM7QUFFQW5DLEVBQUFBLGtCQUFrQixDQUFDd0MsZ0JBQW5CLENBQW9DQyxLQUFwQyxHQUE0QztBQUMxQ3RDLElBQUFBLFdBQVcsRUFBRSw0Q0FENkI7QUFFMUNHLElBQUFBLElBQUksRUFBRTZCLGFBRm9DO0FBRzFDdkIsSUFBQUEsT0FBTyxFQUFFLE1BQU0sSUFBSThCLE1BQUo7QUFIMkIsR0FBNUM7QUFLRCxDQS9GRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4uLy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuL29iamVjdHNNdXRhdGlvbnMnO1xuXG5jb25zdCB1c2Vyc1JvdXRlciA9IG5ldyBVc2Vyc1JvdXRlcigpO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgZmllbGRzID0ge307XG5cbiAgZmllbGRzLnNpZ25VcCA9IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBzaWduVXAgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2lnbiB0aGUgdXNlciB1cC4nLFxuICAgIGFyZ3M6IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzWydfVXNlciddLnNpZ25VcElucHV0VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5TSUdOX1VQX1JFU1VMVCksXG4gICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgZmllbGRzLmxvZ0luID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ0luIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyB0aGUgdXNlciBpbi4nLFxuICAgIGFyZ3M6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgdGhlIHVzZXIgaW4uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgdGhlIHVzZXIgaW4uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEubWVUeXBlKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIHBhc3N3b3JkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICByZXR1cm4gKGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ0luKHtcbiAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgICAgIHBhc3N3b3JkLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcXVlcnk6IHt9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pKS5yZXNwb25zZTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgZmllbGRzLmxvZ091dCA9IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dPdXQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIHRoZSB1c2VyIG91dC4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBfYXJncywgY29udGV4dCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nT3V0KHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xuXG4gIGNvbnN0IHVzZXJzTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6ICdVc2Vyc011dGF0aW9uJyxcbiAgICBkZXNjcmlwdGlvbjogJ1VzZXJzTXV0YXRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBmaWxlcyBtdXRhdGlvbnMuJyxcbiAgICBmaWVsZHMsXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2godXNlcnNNdXRhdGlvbik7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxNdXRhdGlvbnMudXNlcnMgPSB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB0b3AgbGV2ZWwgZm9yIHVzZXJzIG11dGF0aW9ucy4nLFxuICAgIHR5cGU6IHVzZXJzTXV0YXRpb24sXG4gICAgcmVzb2x2ZTogKCkgPT4gbmV3IE9iamVjdCgpLFxuICB9O1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19