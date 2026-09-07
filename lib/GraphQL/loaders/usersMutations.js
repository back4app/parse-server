"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _parseGraphQLUtils = require("../parseGraphQLUtils");
var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));
var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));
var _defaultGraphQLTypes = require("./defaultGraphQLTypes");
var _usersQueries = require("./usersQueries");
var _mutation = require("../transformers/mutation");
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
        } = (0, _parseGraphQLUtils.cloneArgs)(args);
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          originalFields: args.fields,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', parseFields, config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) {
          viewer.user.authDataResponse = authDataResponse;
        }
        return {
          viewer
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
        } = (0, _parseGraphQLUtils.cloneArgs)(args);
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          originalFields: args.fields,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', {
          ...parseFields,
          authData
        }, config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) {
          viewer.user.authDataResponse = authDataResponse;
        }
        return {
          viewer
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
      },
      authData: {
        description: 'Auth data payload, needed if some required auth adapters are configured.',
        type: _defaultGraphQLTypes.OBJECT
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
          password,
          authData
        } = (0, _parseGraphQLUtils.cloneArgs)(args);
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = (await usersRouter.handleLogIn({
          body: {
            username,
            password,
            authData
          },
          query: {},
          config,
          auth,
          info
        })).response;
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) {
          viewer.user.authDataResponse = authDataResponse;
        }
        return {
          viewer
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
      password,
      token
    }, context) => {
      const {
        config
      } = context;
      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'you must provide a password');
      }
      if (!token) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'you must provide a token');
      }
      const userController = config.userController;
      await userController.updatePassword(token, password);
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
  const challengeMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'Challenge',
    description: 'The challenge mutation can be used to initiate an authentication challenge when an auth adapter needs it.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: _graphql.GraphQLString
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: _graphql.GraphQLString
      },
      authData: {
        description: 'Auth data allow to preidentify the user if the auth adapter needs preidentification.',
        type: _defaultGraphQLTypes.OBJECT
      },
      challengeData: {
        description: 'Challenge data payload, can be used to post data to auth providers to auth providers if they need data for the response.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    outputFields: {
      challengeData: {
        description: 'Challenge response from configured auth adapters.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    mutateAndGetPayload: async (input, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        const {
          response
        } = await usersRouter.handleChallenge({
          body: input,
          config,
          auth,
          info
        });
        return response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(challengeMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(challengeMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('challenge', challengeMutation, true, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX3BhcnNlR3JhcGhRTFV0aWxzIiwiX1VzZXJzUm91dGVyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIm9iamVjdHNNdXRhdGlvbnMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9kZWZhdWx0R3JhcGhRTFR5cGVzIiwiX3VzZXJzUXVlcmllcyIsIl9tdXRhdGlvbiIsIl9ub2RlIiwiZSIsInQiLCJXZWFrTWFwIiwiciIsIm4iLCJfX2VzTW9kdWxlIiwibyIsImkiLCJmIiwiX19wcm90b19fIiwiZGVmYXVsdCIsImhhcyIsImdldCIsInNldCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwiZGVzY3JpcHRpb25zIiwidHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJvdXRwdXRGaWVsZHMiLCJ2aWV3ZXIiLCJHcmFwaFFMTm9uTnVsbCIsInZpZXdlclR5cGUiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJjbG9uZUFyZ3MiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInBhcnNlRmllbGRzIiwidHJhbnNmb3JtVHlwZXMiLCJjbGFzc05hbWUiLCJvcmlnaW5hbEZpZWxkcyIsInJlcSIsInNlc3Npb25Ub2tlbiIsIm9iamVjdElkIiwiYXV0aERhdGFSZXNwb25zZSIsImNyZWF0ZU9iamVjdCIsImdldFVzZXJGcm9tU2Vzc2lvblRva2VuIiwidXNlciIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImxvZ0luV2l0aE11dGF0aW9uIiwiYXV0aERhdGEiLCJPQkpFQ1QiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzIiwiZ2V0RmllbGRzIiwia2V5cyIsInJlZHVjZSIsImZpZWxkTmFtZSIsImxvZ0luTXV0YXRpb24iLCJ1c2VybmFtZSIsIkdyYXBoUUxTdHJpbmciLCJwYXNzd29yZCIsImhhbmRsZUxvZ0luIiwiYm9keSIsInF1ZXJ5IiwicmVzcG9uc2UiLCJsb2dPdXRNdXRhdGlvbiIsIm9rIiwiR3JhcGhRTEJvb2xlYW4iLCJfYXJncyIsImhhbmRsZUxvZ091dCIsInJlc2V0UGFzc3dvcmRNdXRhdGlvbiIsImVtYWlsIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbiIsInRva2VuIiwiUGFyc2UiLCJFcnJvciIsIlBBU1NXT1JEX01JU1NJTkciLCJPVEhFUl9DQVVTRSIsInVzZXJDb250cm9sbGVyIiwidXBkYXRlUGFzc3dvcmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsImNoYWxsZW5nZU11dGF0aW9uIiwiY2hhbGxlbmdlRGF0YSIsImhhbmRsZUNoYWxsZW5nZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3VzZXJzTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMU3RyaW5nLCBHcmFwaFFMQm9vbGVhbiwgR3JhcGhRTElucHV0T2JqZWN0VHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuXG5pbXBvcnQgeyBjbG9uZUFyZ3MgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi4vLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgeyBPQkpFQ1QgfSBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4gfSBmcm9tICcuL3VzZXJzUXVlcmllcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmNvbnN0IHVzZXJzUm91dGVyID0gbmV3IFVzZXJzUm91dGVyKCk7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmlzVXNlcnNDbGFzc0Rpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc2lnblVwTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2lnblVwJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBzaWduVXAgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCBzaWduIHVwIGEgbmV3IHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSBuZXcgdXNlciB0byBiZSBjcmVhdGVkIGFuZCBzaWduZWQgdXAuJyxcbiAgICAgICAgdHlwZTogcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1snX1VzZXInXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBjbG9uZUFyZ3MoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgb3JpZ2luYWxGaWVsZHM6IGFyZ3MuZmllbGRzLFxuICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgeyB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTsgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIGNvbnN0IGxvZ0luV2l0aE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luV2l0aCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGxvZ0luV2l0aCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWdudXAsIGxvZ2luIHVzZXIgd2l0aCAzcmQgcGFydHkgYXV0aGVudGljYXRpb24gc3lzdGVtLiBUaGlzIG11dGF0aW9uIGNyZWF0ZSBhIHVzZXIgaWYgdGhlIGF1dGhEYXRhIGRvIG5vdCBjb3JyZXNwb25kIHRvIGFuIGV4aXN0aW5nIG9uZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGlzIGlzIHRoZSBhdXRoIGRhdGEgb2YgeW91ciBjdXN0b20gYXV0aCBwcm92aWRlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpLFxuICAgICAgfSxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlciB0byBiZSBjcmVhdGVkL3VwZGF0ZWQgYW5kIGxvZ2dlZCBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICAgICAgbmFtZTogJ1VzZXJMb2dpbldpdGhJbnB1dCcsXG4gICAgICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgICAnX1VzZXInXG4gICAgICAgICAgICBdLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzKS5yZWR1Y2UoKGZpZWxkcywgZmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdwYXNzd29yZCcgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICd1c2VybmFtZScgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdhdXRoRGF0YSdcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgICAgfSwge30pO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzLCBhdXRoRGF0YSB9ID0gY2xvbmVBcmdzKGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IC4uLnBhcnNlRmllbGRzLCBhdXRoRGF0YSB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgeyB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTsgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbldpdGhNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbldpdGgnLCBsb2dJbldpdGhNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nSW5NdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbicsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIGluIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdBdXRoIGRhdGEgcGF5bG9hZCwgbmVlZGVkIGlmIHNvbWUgcmVxdWlyZWQgYXV0aCBhZGFwdGVycyBhcmUgY29uZmlndXJlZC4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBpbiBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCwgYXV0aERhdGEgfSA9IGNsb25lQXJncyhhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSAoXG4gICAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nSW4oe1xuICAgICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgICAgICAgIGF1dGhEYXRhLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHF1ZXJ5OiB7fSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgIH0pXG4gICAgICAgICkucmVzcG9uc2U7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgeyB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTsgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbk11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nSW4nLCBsb2dJbk11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBsb2dPdXRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dPdXQnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ091dCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgb3V0IGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKF9hcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dPdXQoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dPdXRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nT3V0JywgbG9nT3V0TXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IHJlc2V0UGFzc3dvcmRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdSZXNldFBhc3N3b3JkJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgcmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBlbWFpbDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdFbWFpbCBvZiB0aGUgdXNlciB0aGF0IHNob3VsZCByZWNlaXZlIHRoZSByZXNldCBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZVJlc2V0UmVxdWVzdCh7XG4gICAgICAgIGJvZHk6IHtcbiAgICAgICAgICBlbWFpbCxcbiAgICAgICAgfSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvLFxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHJlc2V0UGFzc3dvcmRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHJlc2V0UGFzc3dvcmRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbigncmVzZXRQYXNzd29yZCcsIHJlc2V0UGFzc3dvcmRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDb25maXJtUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNvbmZpcm1SZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1VzZXJuYW1lIG9mIHRoZSB1c2VyIHRoYXQgaGF2ZSByZWNlaXZlZCB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnTmV3IHBhc3N3b3JkIG9mIHRoZSB1c2VyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHRva2VuOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1Jlc2V0IHRva2VuIHRoYXQgd2FzIGVtYWlsZWQgdG8gdGhlIHVzZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IHBhc3N3b3JkLCB0b2tlbiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGEgcGFzc3dvcmQnKTtcbiAgICAgIH1cbiAgICAgIGlmICghdG9rZW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAneW91IG11c3QgcHJvdmlkZSBhIHRva2VuJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgYXdhaXQgdXNlckNvbnRyb2xsZXIudXBkYXRlUGFzc3dvcmQodG9rZW4sIHBhc3N3b3JkKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2NvbmZpcm1SZXNldFBhc3N3b3JkJyxcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHNlbmRWZXJpZmljYXRpb25FbWFpbCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzZW5kIHRoZSB2ZXJpZmljYXRpb24gZW1haWwgYWdhaW4uJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3Qoe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgY29uc3QgY2hhbGxlbmdlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ2hhbGxlbmdlJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY2hhbGxlbmdlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGluaXRpYXRlIGFuIGF1dGhlbnRpY2F0aW9uIGNoYWxsZW5nZSB3aGVuIGFuIGF1dGggYWRhcHRlciBuZWVkcyBpdC4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVzZXJuYW1lIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfSxcbiAgICAgIGF1dGhEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdBdXRoIGRhdGEgYWxsb3cgdG8gcHJlaWRlbnRpZnkgdGhlIHVzZXIgaWYgdGhlIGF1dGggYWRhcHRlciBuZWVkcyBwcmVpZGVudGlmaWNhdGlvbi4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgICAgY2hhbGxlbmdlRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQ2hhbGxlbmdlIGRhdGEgcGF5bG9hZCwgY2FuIGJlIHVzZWQgdG8gcG9zdCBkYXRhIHRvIGF1dGggcHJvdmlkZXJzIHRvIGF1dGggcHJvdmlkZXJzIGlmIHRoZXkgbmVlZCBkYXRhIGZvciB0aGUgcmVzcG9uc2UuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2hhbGxlbmdlRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0NoYWxsZW5nZSByZXNwb25zZSBmcm9tIGNvbmZpZ3VyZWQgYXV0aCBhZGFwdGVycy4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGlucHV0LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVDaGFsbGVuZ2Uoe1xuICAgICAgICAgIGJvZHk6IGlucHV0LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjaGFsbGVuZ2VNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY2hhbGxlbmdlJywgY2hhbGxlbmdlTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxhQUFBLEdBQUFELE9BQUE7QUFFQSxJQUFBRSxrQkFBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsWUFBQSxHQUFBQyxzQkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssZ0JBQUEsR0FBQUMsdUJBQUEsQ0FBQU4sT0FBQTtBQUNBLElBQUFPLG9CQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxhQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxTQUFBLEdB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