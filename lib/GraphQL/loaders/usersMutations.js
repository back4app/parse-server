"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var _defaultGraphQLTypes = require("./defaultGraphQLTypes");

var _usersQueries = require("./usersQueries");

var _mutation = require("../transformers/mutation");

var _node = _interopRequireDefault(require("parse/node"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  const signUpMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SignUp',
    description: 'The signUp mutation can be used to create and sign up a new user.',
    inputFields: {
      fields: {
        descriptions: 'These are the fields of the new user to be created and signed up.',
        type: parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the new user that was created, signed up and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          fields
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId
        } = await objectsMutations.createObject('_User', parseFields, config, auth, info);
        context.info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(signUpMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(signUpMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('signUp', signUpMutation, true, true);
  const logInWithMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogInWith',
    description: 'The logInWith mutation can be used to signup, login user with 3rd party authentication system. This mutation create a user if the authData do not correspond to an existing one.',
    inputFields: {
      authData: {
        descriptions: 'This is the auth data of your custom auth provider',
        type: new _graphql.GraphQLNonNull(_defaultGraphQLTypes.OBJECT)
      },
      fields: {
        descriptions: 'These are the fields of the user to be created/updated and logged in.',
        type: new _graphql.GraphQLInputObjectType({
          name: 'UserLoginWithInput',
          fields: () => {
            const classGraphQLCreateFields = parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType.getFields();
            return Object.keys(classGraphQLCreateFields).reduce((fields, fieldName) => {
              if (fieldName !== 'password' && fieldName !== 'username' && fieldName !== 'authData') {
                fields[fieldName] = classGraphQLCreateFields[fieldName];
              }

              return fields;
            }, {});
          }
        })
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the new user that was created, signed up and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          fields,
          authData
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId
        } = await objectsMutations.createObject('_User', _objectSpread(_objectSpread({}, parseFields), {}, {
          authData
        }), config, auth, info);
        context.info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInWithMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInWithMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logInWith', logInWithMutation, true, true);
  const logInMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogIn',
    description: 'The logIn mutation can be used to log in an existing user.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the existing user that was logged in and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          username,
          password
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken,
          objectId
        } = (await usersRouter.handleLogIn({
          body: {
            username,
            password
          },
          query: {},
          config,
          auth,
          info
        })).response;
        context.info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logIn', logInMutation, true, true);
  const logOutMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogOut',
    description: 'The logOut mutation can be used to log out an existing user.',
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async (_args, context) => {
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
        return {
          ok: true
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logOutMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logOutMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logOut', logOutMutation, true, true);
  const resetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ResetPassword',
    description: 'The resetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      const {
        config,
        auth,
        info
      } = context;
      await usersRouter.handleResetRequest({
        body: {
          email
        },
        config,
        auth,
        info
      });
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('resetPassword', resetPasswordMutation, true, true);
  const confirmResetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ConfirmResetPassword',
    description: 'The confirmResetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      username: {
        descriptions: 'Username of the user that have received the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        descriptions: 'New password of the user',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      token: {
        descriptions: 'Reset token that was emailed to the user',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      username,
      password,
      token
    }, context) => {
      const {
        config
      } = context;

      if (!username) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'you must provide a username');
      }

      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'you must provide a password');
      }

      if (!token) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'you must provide a token');
      }

      const userController = config.userController;
      await userController.updatePassword(username, token, password);
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('confirmResetPassword', confirmResetPasswordMutation, true, true);
  const sendVerificationEmailMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SendVerificationEmail',
    description: 'The sendVerificationEmail mutation can be used to send the verification email again.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the verification email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleVerificationEmailRequest({
          body: {
            email
          },
          config,
          auth,
          info
        });
        return {
          ok: true
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('sendVerificationEmail', sendVerificationEmailMutation, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ1c2Vyc1JvdXRlciIsIlVzZXJzUm91dGVyIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic2lnblVwTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwiY2xhc3NOYW1lIiwicmVxIiwic2Vzc2lvblRva2VuIiwib2JqZWN0SWQiLCJvYmplY3RzTXV0YXRpb25zIiwiY3JlYXRlT2JqZWN0IiwiZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4iLCJlIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwibG9nSW5XaXRoTXV0YXRpb24iLCJhdXRoRGF0YSIsIk9CSkVDVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiZmllbGROYW1lIiwibG9nSW5NdXRhdGlvbiIsInVzZXJuYW1lIiwiR3JhcGhRTFN0cmluZyIsInBhc3N3b3JkIiwiaGFuZGxlTG9nSW4iLCJib2R5IiwicXVlcnkiLCJyZXNwb25zZSIsImxvZ091dE11dGF0aW9uIiwib2siLCJHcmFwaFFMQm9vbGVhbiIsIl9hcmdzIiwiaGFuZGxlTG9nT3V0IiwicmVzZXRQYXNzd29yZE11dGF0aW9uIiwiZW1haWwiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uIiwidG9rZW4iLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPVEhFUl9DQVVTRSIsInVzZXJDb250cm9sbGVyIiwidXBkYXRlUGFzc3dvcmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxTdHJpbmcsIEdyYXBoUUxCb29sZWFuLCBHcmFwaFFMSW5wdXRPYmplY3RUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4uLy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0IHsgT0JKRUNUIH0gZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuIH0gZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5jb25zdCB1c2Vyc1JvdXRlciA9IG5ldyBVc2Vyc1JvdXRlcigpO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5pc1VzZXJzQ2xhc3NEaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHNpZ25VcE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NpZ25VcCcsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgc2lnblVwIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgc2lnbiB1cCBhIG5ldyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgbmV3IHVzZXIgdG8gYmUgY3JlYXRlZCBhbmQgc2lnbmVkIHVwLicsXG4gICAgICAgIHR5cGU6IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXI6IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKGNvbnRleHQsIG11dGF0aW9uSW5mbywgJ3ZpZXdlci51c2VyLicsIG9iamVjdElkKSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIGNvbnN0IGxvZ0luV2l0aE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luV2l0aCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGxvZ0luV2l0aCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWdudXAsIGxvZ2luIHVzZXIgd2l0aCAzcmQgcGFydHkgYXV0aGVudGljYXRpb24gc3lzdGVtLiBUaGlzIG11dGF0aW9uIGNyZWF0ZSBhIHVzZXIgaWYgdGhlIGF1dGhEYXRhIGRvIG5vdCBjb3JyZXNwb25kIHRvIGFuIGV4aXN0aW5nIG9uZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGlzIGlzIHRoZSBhdXRoIGRhdGEgb2YgeW91ciBjdXN0b20gYXV0aCBwcm92aWRlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpLFxuICAgICAgfSxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlciB0byBiZSBjcmVhdGVkL3VwZGF0ZWQgYW5kIGxvZ2dlZCBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICAgICAgbmFtZTogJ1VzZXJMb2dpbldpdGhJbnB1dCcsXG4gICAgICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgICAnX1VzZXInXG4gICAgICAgICAgICBdLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzKS5yZWR1Y2UoKGZpZWxkcywgZmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdwYXNzd29yZCcgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICd1c2VybmFtZScgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdhdXRoRGF0YSdcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgICAgfSwge30pO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzLCBhdXRoRGF0YSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyAuLi5wYXJzZUZpZWxkcywgYXV0aERhdGEgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcjogYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oY29udGV4dCwgbXV0YXRpb25JbmZvLCAndmlld2VyLnVzZXIuJywgb2JqZWN0SWQpLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5XaXRoTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luV2l0aCcsIGxvZ0luV2l0aE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBsb2dJbk11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dJbiBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgaW4gYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVzZXJuYW1lIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBhc3N3b3JkIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGV4aXN0aW5nIHVzZXIgdGhhdCB3YXMgbG9nZ2VkIGluIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIHBhc3N3b3JkIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkIH0gPSAoXG4gICAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nSW4oe1xuICAgICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcXVlcnk6IHt9LFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgfSlcbiAgICAgICAgKS5yZXNwb25zZTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyOiBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihjb250ZXh0LCBtdXRhdGlvbkluZm8sICd2aWV3ZXIudXNlci4nLCBvYmplY3RJZCksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luJywgbG9nSW5NdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nT3V0TXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nT3V0JyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dPdXQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIG91dCBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChfYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nT3V0KHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ091dCcsIGxvZ091dE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCByZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVSZXNldFJlcXVlc3Qoe1xuICAgICAgICBib2R5OiB7XG4gICAgICAgICAgZW1haWwsXG4gICAgICAgIH0sXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mbyxcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ3Jlc2V0UGFzc3dvcmQnLCByZXNldFBhc3N3b3JkTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ29uZmlybVJlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjb25maXJtUmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdVc2VybmFtZSBvZiB0aGUgdXNlciB0aGF0IGhhdmUgcmVjZWl2ZWQgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ05ldyBwYXNzd29yZCBvZiB0aGUgdXNlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICB0b2tlbjoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdSZXNldCB0b2tlbiB0aGF0IHdhcyBlbWFpbGVkIHRvIHRoZSB1c2VyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyB1c2VybmFtZSwgcGFzc3dvcmQsIHRva2VuIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYSB1c2VybmFtZScpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYSBwYXNzd29yZCcpO1xuICAgICAgfVxuICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICd5b3UgbXVzdCBwcm92aWRlIGEgdG9rZW4nKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgICBhd2FpdCB1c2VyQ29udHJvbGxlci51cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIHBhc3N3b3JkKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2NvbmZpcm1SZXNldFBhc3N3b3JkJyxcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHNlbmRWZXJpZmljYXRpb25FbWFpbCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzZW5kIHRoZSB2ZXJpZmljYXRpb24gZW1haWwgYWdhaW4uJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3Qoe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxXQUFXLEdBQUcsSUFBSUMsb0JBQUosRUFBcEI7O0FBRUEsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtFQUNqQyxJQUFJQSxrQkFBa0IsQ0FBQ0Msb0JBQXZCLEVBQTZDO0lBQzNDO0VBQ0Q7O0VBRUQsTUFBTUMsY0FBYyxHQUFHLElBQUFDLDBDQUFBLEVBQTZCO0lBQ2xEQyxJQUFJLEVBQUUsUUFENEM7SUFFbERDLFdBQVcsRUFBRSxtRUFGcUM7SUFHbERDLFdBQVcsRUFBRTtNQUNYQyxNQUFNLEVBQUU7UUFDTkMsWUFBWSxFQUFFLG1FQURSO1FBRU5DLElBQUksRUFBRVQsa0JBQWtCLENBQUNVLGVBQW5CLENBQW1DLE9BQW5DLEVBQTRD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