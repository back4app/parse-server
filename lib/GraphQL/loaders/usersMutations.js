"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var _usersQueries = require("./usersQueries");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiYXJncyIsImZpZWxkcyIsImRlc2NyaXB0aW9ucyIsInR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJzaWduVXBJbnB1dFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsInZpZXdlclR5cGUiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJlIiwiaGFuZGxlRXJyb3IiLCJsb2dJbklucHV0VHlwZSIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwiX2FyZ3MiLCJ2aWV3ZXIiLCJoYW5kbGVMb2dPdXQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxXQUFXLEdBQUcsSUFBSUMsb0JBQUosRUFBcEI7O0FBRUEsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQyxNQUFJQSxrQkFBa0IsQ0FBQ0Msb0JBQXZCLEVBQTZDO0FBQzNDO0FBQ0Q7O0FBRURELEVBQUFBLGtCQUFrQixDQUFDRSxrQkFBbkIsQ0FDRSxRQURGLEVBRUU7QUFDRUMsSUFBQUEsV0FBVyxFQUFFLHNEQURmO0FBRUVDLElBQUFBLElBQUksRUFBRTtBQUNKQyxNQUFBQSxNQUFNLEVBQUU7QUFDTkMsUUFBQUEsWUFBWSxFQUFFLG1DQURSO0FBRU5DLFFBQUFBLElBQUksRUFBRVAsa0JBQWtCLENB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O0FBQWdCQyxVQUFBQTtBQUFoQixZQUF5QkosT0FBL0I7QUFFQSxjQUFNa0IsTUFBTSxHQUFHLE1BQU0sMkNBQ25CaEIsTUFEbUIsRUFFbkJFLElBRm1CLEVBR25CSCxZQUhtQixDQUFyQjtBQU1BLGNBQU1sQixXQUFXLENBQUNvQyxZQUFaLENBQXlCO0FBQzdCakIsVUFBQUEsTUFENkI7QUFFN0JDLFVBQUFBLElBRjZCO0FBRzdCQyxVQUFBQTtBQUg2QixTQUF6QixDQUFOO0FBTUEsZUFBT2MsTUFBUDtBQUNELE9BaEJELENBZ0JFLE9BQU9WLENBQVAsRUFBVTtBQUNWdEIsUUFBQUEsa0JBQWtCLENBQUN1QixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGOztBQXZCSCxHQUZGLEVBMkJFLElBM0JGLEVBNEJFLElBNUJGO0FBOEJELENBN0dEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCB7IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuIH0gZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuXG5jb25zdCB1c2Vyc1JvdXRlciA9IG5ldyBVc2Vyc1JvdXRlcigpO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5pc1VzZXJzQ2xhc3NEaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3NpZ25VcCcsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgc2lnblVwIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHNpZ24gdGhlIHVzZXIgdXAuJyxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIHVzZXIuJyxcbiAgICAgICAgICB0eXBlOiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzWydfVXNlciddLnNpZ25VcElucHV0VHlwZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGZpZWxkcyB9ID0gYXJncztcblxuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4gfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKGNvbmZpZywgaW5mbywgbXV0YXRpb25JbmZvKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2xvZ0luJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dJbiBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgdGhlIHVzZXIgaW4uJyxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIGRhdGEgbmVlZGVkIHRvIGxvZ2luJyxcbiAgICAgICAgICB0eXBlOiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzWydfVXNlciddLmxvZ0luSW5wdXRUeXBlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBmaWVsZHM6IHsgdXNlcm5hbWUsIHBhc3N3b3JkIH0sXG4gICAgICAgICAgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICByZXR1cm4gKGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ0luKHtcbiAgICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgICAgdXNlcm5hbWUsXG4gICAgICAgICAgICAgIHBhc3N3b3JkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHF1ZXJ5OiB7fSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgIH0pKS5yZXNwb25zZTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2xvZ091dCcsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgbG9nT3V0IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyB0aGUgdXNlciBvdXQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIF9hcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIG11dGF0aW9uSW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dPdXQoe1xuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICByZXR1cm4gdmlld2VyO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=