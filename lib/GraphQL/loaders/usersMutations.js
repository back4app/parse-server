"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var objectsMutations = _interopRequireWildcard(require("./objectsMutations"));

var _usersQueries = require("./usersQueries");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  parseGraphQLSchema.addGraphQLMutation('signUp', {
    description: 'The signUp mutation can be used to sign the user up.',
    args: {
      fields: {
        descriptions: 'These are the fields of the user.',
        type: parseGraphQLSchema.parseClassTypes['_User'].signUpInputType
      }
    },
    type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType),

    async resolve(_source, args, context, mutationInfo) {
      try {
        const {
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken
        } = await objectsMutations.createObject('_User', fields, config, auth, info);
        info.sessionToken = sessionToken;
        return await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  }, true, true);
  parseGraphQLSchema.addGraphQLMutation('logIn', {
    description: 'The logIn mutation can be used to log the user in.',
    args: {
      fields: {
        description: 'This is data needed to login',
        type: parseGraphQLSchema.parseClassTypes['_User'].logInInputType
      }
    },
    type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType),

    async resolve(_source, args, context) {
      try {
        const {
          fields: {
            username,
            password
          }
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

  }, true, true);
  parseGraphQLSchema.addGraphQLMutation('logOut', {
    description: 'The logOut mutation can be used to log the user out.',
    type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType),

    async resolve(_source, _args, context, mutationInfo) {
      try {
        const {
          config,
          auth,
          info
        } = context;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo);
        await usersRouter.handleLogOut({
          config,
          auth,
          info
        });
        return viewer;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  }, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiYXJncyIsImZpZWxkcyIsImRlc2NyaXB0aW9ucyIsInR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJzaWduVXBJbnB1dFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsInZpZXdlclR5cGUiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJlIiwiaGFuZGxlRXJyb3IiLCJsb2dJbklucHV0VHlwZSIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwiX2FyZ3MiLCJ2aWV3ZXIiLCJoYW5kbGVMb2dPdXQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRUEsTUFBTUEsV0FBVyxHQUFHLElBQUlDLG9CQUFKLEVBQXBCOztBQUVBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsTUFBSUEsa0JBQWtCLENBQUNDLG9CQUF2QixFQUE2QztBQUMzQztBQUNEOztBQUVERCxFQUFBQSxrQkFBa0IsQ0FBQ0Usa0JBQW5CLENBQ0UsUUFERixFQUVFO0FBQ0VDLElBQUFBLFdBQVcsRUFBRSxzREFEZjtBQUVFQyxJQUFBQSxJQUFJLEVBQUU7QUFDSkMsTUFBQUEsTUFBTSxFQUFFO0FBQ05DLFFBQUFBLFlBQVksRUFBRSxtQ0FEUjtBQUVOQyxRQUFBQSxJQUFJLEVBQUVQLGtCQUFrQixDQUFD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QUFnQkMsVUFBQUE7QUFBaEIsWUFBeUJKLE9BQS9CO0FBRUEsY0FBTWtCLE1BQU0sR0FBRyxNQUFNLDJDQUNuQmhCLE1BRG1CLEVBRW5CRSxJQUZtQixFQUduQkgsWUFIbUIsQ0FBckI7QUFNQSxjQUFNbEIsV0FBVyxDQUFDb0MsWUFBWixDQUF5QjtBQUM3QmpCLFVBQUFBLE1BRDZCO0FBRTdCQyxVQUFBQSxJQUY2QjtBQUc3QkMsVUFBQUE7QUFINkIsU0FBekIsQ0FBTjtBQU1BLGVBQU9jLE1BQVA7QUFDRCxPQWhCRCxDQWdCRSxPQUFPVixDQUFQLEVBQVU7QUFDVnRCLFFBQUFBLGtCQUFrQixDQUFDdUIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUF2QkgsR0FGRixFQTJCRSxJQTNCRixFQTRCRSxJQTVCRjtBQThCRCxDQTdHRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi4vLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4vb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgeyBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbiB9IGZyb20gJy4vdXNlcnNRdWVyaWVzJztcblxuY29uc3QgdXNlcnNSb3V0ZXIgPSBuZXcgVXNlcnNSb3V0ZXIoKTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEuaXNVc2Vyc0NsYXNzRGlzYWJsZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdzaWduVXAnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIHNpZ25VcCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWduIHRoZSB1c2VyIHVwLicsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uczogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSB1c2VyLicsXG4gICAgICAgICAgdHlwZTogcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1snX1VzZXInXS5zaWduVXBJbnB1dFR5cGUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBmaWVsZHMgfSA9IGFyZ3M7XG5cbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIHJldHVybiBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihjb25maWcsIGluZm8sIG11dGF0aW9uSW5mbyk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdsb2dJbicsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIHRoZSB1c2VyIGluLicsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyBkYXRhIG5lZWRlZCB0byBsb2dpbicsXG4gICAgICAgICAgdHlwZTogcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1snX1VzZXInXS5sb2dJbklucHV0VHlwZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgZmllbGRzOiB7IHVzZXJuYW1lLCBwYXNzd29yZCB9LFxuICAgICAgICAgIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgcmV0dXJuIChhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dJbih7XG4gICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICB9KSkucmVzcG9uc2U7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdsb2dPdXQnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ091dCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgdGhlIHVzZXIgb3V0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBfYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBtdXRhdGlvbkluZm9cbiAgICAgICAgICApO1xuXG4gICAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nT3V0KHtcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmV0dXJuIHZpZXdlcjtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19