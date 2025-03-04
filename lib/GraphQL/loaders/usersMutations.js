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
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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
        } = (0, _deepcopy.default)(args);
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
        } = await objectsMutations.createObject('_User', _objectSpread(_objectSpread({}, parseFields), {}, {
          authData
        }), config, auth, info);
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
        } = (0, _deepcopy.default)(args);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2RlZXBjb3B5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9Vc2Vyc1JvdXRlciIsIm9iamVjdHNNdXRhdGlvbnMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9kZWZhdWx0R3JhcGhRTFR5cGVzIiwiX3VzZXJzUXVlcmllcyIsIl9tdXRhdGlvbiIsIl9ub2RlIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwiZSIsIldlYWtNYXAiLCJyIiwidCIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiaGFzIiwiZ2V0IiwibiIsIl9fcHJvdG9fXyIsImEiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsInUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpIiwic2V0Iiwib3duS2V5cyIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJfdG9Qcm9wZXJ0eUtleSIsInZhbHVlIiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsInVzZXJzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiaXNVc2Vyc0NsYXNzRGlzYWJsZWQiLCJzaWduVXBNdXRhdGlvbiIsIm11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJpbnB1dEZpZWxkcyIsImZpZWxkcyIsImRlc2NyaXB0aW9ucyIsInR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwib3V0cHV0RmllbGRzIiwidmlld2VyIiwiR3JhcGhRTE5vbk51bGwiLCJ2aWV3ZXJUeXBlIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwibXV0YXRpb25JbmZvIiwiZGVlcGNvcHkiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInBhcnNlRmllbGRzIiwidHJhbnNmb3JtVHlwZXMiLCJjbGFzc05hbWUiLCJvcmlnaW5hbEZpZWxkcyIsInJlcSIsInNlc3Npb25Ub2tlbiIsIm9iamVjdElkIiwiYXV0aERhdGFSZXNwb25zZSIsImNyZWF0ZU9iamVjdCIsImdldFVzZXJGcm9tU2Vzc2lvblRva2VuIiwidXNlciIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImxvZ0luV2l0aE11dGF0aW9uIiwiYXV0aERhdGEiLCJPQkpFQ1QiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzIiwiZ2V0RmllbGRzIiwicmVkdWNlIiwiZmllbGROYW1lIiwibG9nSW5NdXRhdGlvbiIsInVzZXJuYW1lIiwiR3JhcGhRTFN0cmluZyIsInBhc3N3b3JkIiwiaGFuZGxlTG9nSW4iLCJib2R5IiwicXVlcnkiLCJyZXNwb25zZSIsImxvZ091dE11dGF0aW9uIiwib2siLCJHcmFwaFFMQm9vbGVhbiIsIl9hcmdzIiwiaGFuZGxlTG9nT3V0IiwicmVzZXRQYXNzd29yZE11dGF0aW9uIiwiZW1haWwiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uIiwidG9rZW4iLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPVEhFUl9DQVVTRSIsInVzZXJDb250cm9sbGVyIiwidXBkYXRlUGFzc3dvcmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsImNoYWxsZW5nZU11dGF0aW9uIiwiY2hhbGxlbmdlRGF0YSIsImhhbmRsZUNoYWxsZW5nZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3VzZXJzTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMU3RyaW5nLCBHcmFwaFFMQm9vbGVhbiwgR3JhcGhRTElucHV0T2JqZWN0VHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCB7IE9CSkVDVCB9IGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbiB9IGZyb20gJy4vdXNlcnNRdWVyaWVzJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuY29uc3QgdXNlcnNSb3V0ZXIgPSBuZXcgVXNlcnNSb3V0ZXIoKTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEuaXNVc2Vyc0NsYXNzRGlzYWJsZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBzaWduVXBNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTaWduVXAnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIHNpZ25VcCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHNpZ24gdXAgYSBuZXcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIG5ldyB1c2VyIHRvIGJlIGNyZWF0ZWQgYW5kIHNpZ25lZCB1cC4nLFxuICAgICAgICB0eXBlOiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzWydfVXNlciddLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgdXNlciB0aGF0IHdhcyBjcmVhdGVkLCBzaWduZWQgdXAgYW5kIHJldHVybmVkIGFzIGEgdmlld2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHsgdmlld2VyLnVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7IH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2lnblVwTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignc2lnblVwJywgc2lnblVwTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICBjb25zdCBsb2dJbldpdGhNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbldpdGgnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBsb2dJbldpdGggbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2lnbnVwLCBsb2dpbiB1c2VyIHdpdGggM3JkIHBhcnR5IGF1dGhlbnRpY2F0aW9uIHN5c3RlbS4gVGhpcyBtdXRhdGlvbiBjcmVhdGUgYSB1c2VyIGlmIHRoZSBhdXRoRGF0YSBkbyBub3QgY29ycmVzcG9uZCB0byBhbiBleGlzdGluZyBvbmUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhpcyBpcyB0aGUgYXV0aCBkYXRhIG9mIHlvdXIgY3VzdG9tIGF1dGggcHJvdmlkZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoT0JKRUNUKSxcbiAgICAgIH0sXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIHVzZXIgdG8gYmUgY3JlYXRlZC91cGRhdGVkIGFuZCBsb2dnZWQgaW4uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgICAgIG5hbWU6ICdVc2VyTG9naW5XaXRoSW5wdXQnLFxuICAgICAgICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICAgICAgICAgJ19Vc2VyJ1xuICAgICAgICAgICAgXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKGNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcykucmVkdWNlKChmaWVsZHMsIGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAncGFzc3dvcmQnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAndXNlcm5hbWUnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAnYXV0aERhdGEnXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICAgIH0sIHt9KTtcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcywgYXV0aERhdGEgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IC4uLnBhcnNlRmllbGRzLCBhdXRoRGF0YSB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgeyB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTsgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbldpdGhNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbldpdGgnLCBsb2dJbldpdGhNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nSW5NdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbicsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIGluIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdBdXRoIGRhdGEgcGF5bG9hZCwgbmVlZGVkIGlmIHNvbWUgcmVxdWlyZWQgYXV0aCBhZGFwdGVycyBhcmUgY29uZmlndXJlZC4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBpbiBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCwgYXV0aERhdGEgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IChcbiAgICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dJbih7XG4gICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgICAgICAgYXV0aERhdGEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcXVlcnk6IHt9LFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgfSlcbiAgICAgICAgKS5yZXNwb25zZTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB7IHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlOyB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbk11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbicsIGxvZ0luTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGxvZ091dE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ091dCcsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nT3V0IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBvdXQgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoX2FyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ091dCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dPdXRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dPdXQnLCBsb2dPdXRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgcmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1Jlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSByZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlUmVzZXRSZXF1ZXN0KHtcbiAgICAgICAgYm9keToge1xuICAgICAgICAgIGVtYWlsLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGluZm8sXG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUocmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUocmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdyZXNldFBhc3N3b3JkJywgcmVzZXRQYXNzd29yZE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NvbmZpcm1SZXNldFBhc3N3b3JkJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY29uZmlybVJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVXNlcm5hbWUgb2YgdGhlIHVzZXIgdGhhdCBoYXZlIHJlY2VpdmVkIHRoZSByZXNldCBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdOZXcgcGFzc3dvcmQgb2YgdGhlIHVzZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgdG9rZW46IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnUmVzZXQgdG9rZW4gdGhhdCB3YXMgZW1haWxlZCB0byB0aGUgdXNlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgdXNlcm5hbWUsIHBhc3N3b3JkLCB0b2tlbiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGEgdXNlcm5hbWUnKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGEgcGFzc3dvcmQnKTtcbiAgICAgIH1cbiAgICAgIGlmICghdG9rZW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAneW91IG11c3QgcHJvdmlkZSBhIHRva2VuJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgYXdhaXQgdXNlckNvbnRyb2xsZXIudXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjb25maXJtUmVzZXRQYXNzd29yZCcsXG4gICAgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzZW5kVmVyaWZpY2F0aW9uRW1haWwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2VuZCB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsIGFnYWluLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHtcbiAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICBlbWFpbCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdzZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IGNoYWxsZW5nZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NoYWxsZW5nZScsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNoYWxsZW5nZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBpbml0aWF0ZSBhbiBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2Ugd2hlbiBhbiBhdXRoIGFkYXB0ZXIgbmVlZHMgaXQuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIH0sXG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQXV0aCBkYXRhIGFsbG93IHRvIHByZWlkZW50aWZ5IHRoZSB1c2VyIGlmIHRoZSBhdXRoIGFkYXB0ZXIgbmVlZHMgcHJlaWRlbnRpZmljYXRpb24uJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ0NoYWxsZW5nZSBkYXRhIHBheWxvYWQsIGNhbiBiZSB1c2VkIHRvIHBvc3QgZGF0YSB0byBhdXRoIHByb3ZpZGVycyB0byBhdXRoIHByb3ZpZGVycyBpZiB0aGV5IG5lZWQgZGF0YSBmb3IgdGhlIHJlc3BvbnNlLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGFsbGVuZ2UgcmVzcG9uc2UgZnJvbSBjb25maWd1cmVkIGF1dGggYWRhcHRlcnMuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChpbnB1dCwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlQ2hhbGxlbmdlKHtcbiAgICAgICAgICBib2R5OiBpbnB1dCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNoYWxsZW5nZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NoYWxsZW5nZScsIGNoYWxsZW5nZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsYUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsU0FBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksWUFBQSxHQUFBRCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUssZ0JBQUEsR0FBQUMsdUJBQUEsQ0FBQU4sT0FBQTtBQUNBLElBQUFPLG9CQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxhQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxTQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxLQUFBLEdBQUFQLHNCQUFBLENBQUFILE9BQUE7QUFBK0IsU0FBQVcseUJBQUFDLENBQUEsNkJBQUFDLE9BQUEsbUJBQUFDLENBQUEsT0FBQUQsT0FBQSxJQUFBRSxDQUFBLE9BQUFGLE9BQUEsWUFBQUYsd0JBQUEsWUFBQUEsQ0FBQUMsQ0FBQSxXQUFBQSxDQUFBLEdBQUFHLENBQUEsR0FBQUQsQ0FBQSxLQUFBRixDQUFBO0FBQUEsU0FBQU4sd0JBQUFNLENBQUEsRUFBQUUsQ0FBQSxTQUFBQSxDQUFBLElBQUFGLENBQUEsSUFBQUEsQ0FBQSxDQUFBSSxVQUFBLFNBQUFKLENBQUEsZUFBQUEsQ0FBQSx1QkFBQUEsQ0FBQSx5QkFBQUEsQ0FBQSxXQUFBSyxPQUFBLEVBQUFMLENBQUEsUUFBQUcsQ0FBQSxHQUFBSix3QkFBQSxDQUFBRyxDQUFBLE9BQUFDLENBQUEsSUFBQUEsQ0FBQSxDQUFBRyxHQUFBLENBQUFOLENBQUEsVUFBQUcsQ0FBQSxDQUFBSSxHQUFBLENBQUFQLENBQUEsT0FBQVEsQ0FBQSxLQUFBQyxTQUFBLFVBQUFDLENBQUEsR0FBQUMsTUFBQSxDQUFBQyxjQUFBLElBQUFELE1BQUEsQ0FBQUUsd0JBQUEsV0FBQUMsQ0FBQSxJQUFBZCxDQUFBLG9CQUFBYyxDQUFBLE9BQUFDLGNBQUEsQ0FBQUMsSUFBQSxDQUFBaEIsQ0FBQSxFQUFBYyxDQUFBLFNBQUFHLENBQUEsR0FBQVAsQ0FBQSxHQUFBQyxNQUFBLENBQUFFLHdCQUFBLENBQUFiLENBQUEsRUFBQWMsQ0FBQSxVQUFBRyxDQUFBLEtBQUFBLENBQUEsQ0FBQVYsR0FBQSxJQUFBVSxDQUFBLENBQUFDLEdBQUEsSUFBQVAsTUFBQSxDQUFBQyxjQUFBLENBQUFKLENBQUEsRUFBQU0sQ0FBQSxFQUFBRyxDQUFBLElBQUFULENBQUEsQ0FBQU0sQ0FBQSxJQUFBZCxDQUFBLENBQUFjLENBQUEsWUFBQU4sQ0FBQSxDQUFBSCxPQUFBLEdBQUFMLENBQUEsRUFBQUcsQ0FBQSxJQUFBQSxDQUFBLENBQUFlLEdBQUEsQ0FBQWxCLENBQUEsRUFBQVEsQ0FBQSxHQUFBQSxDQUFBO0FBQUEsU0FBQWpCLHVCQUFBUyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBSSxVQUFBLEdBQUFKLENBQUEsS0FBQUssT0FBQSxFQUFBTCxDQUFBO0FBQUEsU0FBQW1CLFFBQUFuQixDQUFBLEVBQUFFLENBQUEsUUFBQUMsQ0FBQSxHQUFBUSxNQUFBLENBQUFTLElBQUEsQ0FBQXBCLENBQUEsT0FBQVcsTUFBQSxDQUFBVSxxQkFBQSxRQUFBQyxDQUFBLEdBQUFYLE1BQUEsQ0FBQVUscUJBQUEsQ0FBQXJCLENBQUEsR0FBQUUsQ0FBQSxLQUFBb0IsQ0FBQSxHQUFBQSxDQUFBLENBQUFDLE1BQUEsV0FBQXJCLENBQUEsV0FBQVMsTUFBQSxDQUFBRSx3QkFBQSxDQUFBYixDQUFBLEVBQUFFLENBQUEsRUFBQXNCLFVBQUEsT0FBQXJCLENBQUEsQ0FBQXNCLElBQUEsQ0FBQUMsS0FBQSxDQUFBdkIsQ0FBQSxFQUFBbUIsQ0FBQSxZQUFBbkIsQ0FBQTtBQUFBLFNBQUF3QixjQUFBM0IsQ0FBQSxhQUFBRSxDQUFBLE1BQUFBLENBQUEsR0FBQTBCLFNBQUEsQ0FBQUMsTUFBQSxFQUFBM0IsQ0FBQSxVQUFBQyxDQUFBLFdBQUF5QixTQUFBLENBQUExQixDQUFBLElBQUEwQixTQUFBLENBQUExQixDQUFBLFFBQUFBLENBQUEsT0FBQWlCLE9BQUEsQ0FBQVIsTUFBQSxDQUFBUixDQUFBLE9BQUEyQixPQUFBLFdBQUE1QixDQUFBLElBQUE2QixlQUFBLENBQUEvQixDQUFBLEVBQUFFLENBQUEsRUFBQUMsQ0FBQSxDQUFBRCxDQUFBLFNBQUFTLE1BQUEsQ0FBQXFCLHlCQUFBLEdBQUFyQixNQUFBLENBQUFzQixnQkFBQSxDQUFBakMsQ0FBQSxFQUFBVyxNQUFBLENBQUFxQix5QkFBQSxDQUFBN0IsQ0FBQSxLQUFBZ0IsT0FBQSxDQUFBUixNQUFBLENBQUFSLENBQUEsR0FBQTJCLE9BQUEsV0FBQTVCLENBQUEsSUFBQVMsTUFBQSxDQUFBQyxjQUFBLENBQUFaLENBQUEsRUFBQUUsQ0FBQSxFQUFBUyxNQUFBLENBQUFFLHdCQUFBLENBQUFWLENBQUEsRUFBQUQsQ0FBQSxpQkFBQUYsQ0FBQTtBQUFBLFNBQUErQixnQkFBQS9CLENBQUEsRUFBQUUsQ0FBQSxFQUFBQyxDQUFBLFlBQUFELENBQUEsR0FBQWdDLGNBQUEsQ0FBQWhDLENBQUEsTUFBQUYsQ0FBQSxHQUFBVyxNQUFBLENBQUFDLGNBQUEsQ0FBQVosQ0FBQSxFQUFBRSxDQUFBLElBQUFpQyxLQUFBLEVBQUFoQyxDQUFBLEVBQUFxQixVQUFBLE1BQUFZLFlBQUEsTUFBQUMsUUFBQSxVQUFBckMsQ0FBQSxDQUFBRSxDQUFBLElBQUFDLENBQUEsRUFBQUgsQ0FBQTtBQUFBLFNBQUFrQyxlQUFBL0IsQ0FBQSxRQUFBYyxDQUFBLEdBQUFxQixZQUFBLENBQUFuQyxDQUFBLHVDQUFBYyxDQUFBLEdBQUFBLENBQUEsR0FBQUEsQ0FBQTtBQUFBLFNBQUFxQixhQUFBbkMsQ0FBQSxFQUFBRCxDQUFBLDJCQUFBQyxDQUFBLEtBQUFBLENBQUEsU0FBQUEsQ0FBQSxNQUFBSCxDQUFBLEdBQUFHLENBQUEsQ0FBQW9DLE1BQUEsQ0FBQUMsV0FBQSxrQkFBQXhDLENBQUEsUUFBQWlCLENBQUEsR0FBQWpCLENBQUEsQ0FBQWdCLElBQUEsQ0FBQWIsQ0FBQSxFQUFBRCxDQUFBLHVDQUFBZSxDQUFBLFNBQUFBLENBQUEsWUFBQXdCLFNBQUEseUVBQUF2QyxDQUFBLEdBQUF3QyxNQUFBLEdBQUFDLE1BQUEsRUFBQXhDLENBQUE7QUFFL0IsTUFBTXlDLFdBQVcsR0FBRyxJQUFJQyxvQkFBVyxDQUFDLENBQUM7QUFFckMsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtFQUNqQyxJQUFJQSxrQkFBa0IsQ0FBQ0Msb0JBQW9CLEVBQUU7SUFDM0M7RUFDRjtFQUVBLE1BQU1DLGNBQWMsR0FBRyxJQUFBQywwQ0FBNEIsRUFBQztJQUNsREMsSUFBSSxFQUFFLFFBQVE7SUFDZEMsV0FBVyxFQUFFLG1FQUFtRTtJQUNoRkMsV0FBVyxFQUFFO01BQ1hDLE1BQU0sRUFBRTtRQUNOQyxZQUFZLEVBQUUsbUVBQW1FO1FBQ2pGQyxJQUFJLEVBQUVULGtCQUFrQixDQUFDVSxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUNDO01BQ3BEO0lBQ0YsQ0FBQztJQUNEQyxZQUFZLEVBQUU7TUFDWkMsTUFBTSxFQUFFO1FBQ05SLFdBQVcsRUFBRSw0RUFBNEU7UUFDekZJLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDZCxrQkFBa0IsQ0FBQ2UsVUFBVTtNQUN4RDtJQUNGLENBQUM7SUFDREMsbUJBQW1CLEVBQUUsTUFBQUEsQ0FBT0MsSUFBSSxFQUFFQyxPQUFPLEVBQUVDLFlBQVksS0FBSztNQUMxRCxJQUFJO1FBQ0YsTUFBTTtVQUFFWjtRQUFPLENBQUMsR0FBRyxJQUFBYSxpQkFBUSxFQUFDSCxJQUFJLENBQUM7UUFDakMsTUFBTTtVQUFFSSxNQUFNO1VBQUVDLElBQUk7VUFBRUM7UUFBSyxDQUFDLEdBQUdMLE9BQU87UUFFdEMsTUFBTU0sV0FBVyxHQUFHLE1BQU0sSUFBQUMsd0JBQWMsRUFBQyxRQUFRLEVBQUVsQixNQUFNLEVBQUU7VUFDekRtQixTQUFTLEVBQUUsT0FBTztVQUNsQjFCLGtCQUFrQjtVQUNsQjJCLGNBQWMsRUFBRVYsSUFBSSxDQUFDVixNQUFNO1VBQzNCcUIsR0FBRyxFQUFFO1lBQUVQLE1BQU07WUFBRUMsSUFBSTtZQUFFQztVQUFLO1FBQzVCLENBQUMsQ0FBQztRQUVGLE1BQU07VUFBRU0sWUFBWTtVQUFFQyxRQUFRO1VBQUVDO1FBQWlCLENBQUMsR0FBRyxNQUFNckYsZ0JBQWdCLENBQUNzRixZQUFZLENBQ3RGLE9BQU8sRUFDUFIsV0FBVyxFQUNYSCxNQUFNLEVBQ05DLElBQUksRUFDSkMsSUFDRixDQUFDO1FBRURMLE9BQU8sQ0FBQ0ssSUFBSSxDQUFDTSxZQUFZLEdBQUdBLFlBQVk7UUFDeEMsTUFBTWhCLE1BQU0sR0FBRyxNQUFNLElBQUFvQixxQ0FBdUIsRUFDMUNmLE9BQU8sRUFDUEMsWUFBWSxFQUNaLGNBQWMsRUFDZFcsUUFDRixDQUFDO1FBQ0QsSUFBSUMsZ0JBQWdCLElBQUlsQixNQUFNLENBQUNxQixJQUFJLEVBQUU7VUFBRXJCLE1BQU0sQ0FBQ3FCLElBQUksQ0FBQ0gsZ0JBQWdCLEdBQUdBLGdCQUFnQjtRQUFFO1FBQ3hGLE9BQU87VUFDTGxCO1FBQ0YsQ0FBQztNQUNILENBQUMsQ0FBQyxPQUFPNUQsQ0FBQyxFQUFFO1FBQ1YrQyxrQkFBa0IsQ0FBQ21DLFdBQVcsQ0FBQ2xGLENBQUMsQ0FBQztNQUNuQztJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBRUYrQyxrQkFBa0IsQ0FBQ29DLGNBQWMsQ0FBQ2xDLGNBQWMsQ0FBQ2UsSUFBSSxDQUFDb0IsS0FBSyxDQUFDNUIsSUFBSSxDQUFDNkIsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDcEZ0QyxrQkFBa0IsQ0FBQ29DLGNBQWMsQ0FBQ2xDLGNBQWMsQ0FBQ08sSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDbEVULGtCQUFrQixDQUFDdUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFckMsY0FBYyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDM0UsTUFBTXNDLGlCQUFpQixHQUFHLElBQUFyQywwQ0FBNEIsRUFBQztJQUNyREMsSUFBSSxFQUFFLFdBQVc7SUFDakJDLFdBQVcsRUFDVCxrTEFBa0w7SUFDcExDLFdBQVcsRUFBRTtNQUNYbUMsUUFBUSxFQUFFO1FBQ1JqQyxZQUFZLEVBQUUsb0RBQW9EO1FBQ2xFQyxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQzRCLDJCQUFNO01BQ2pDLENBQUM7TUFDRG5DLE1BQU0sRUFBRTtRQUNOQyxZQUFZLEVBQUUsdUVBQXVFO1FBQ3JGQyxJQUFJLEVBQUUsSUFBSWtDLCtCQUFzQixDQUFDO1VBQy9CdkMsSUFBSSxFQUFFLG9CQUFvQjtVQUMxQkcsTUFBTSxFQUFFQSxDQUFBLEtBQU07WUFDWixNQUFNcUMsd0JBQXdCLEdBQUc1QyxrQkFBa0IsQ0FBQ1UsZUFBZSxDQUNqRSxPQUFPLENBQ1IsQ0FBQ0Msc0JBQXNCLENBQUNrQyxTQUFTLENBQUMsQ0FBQztZQUNwQyxPQUFPakYsTUFBTSxDQUFDUyxJQUFJLENBQUN1RSx3QkFBd0IsQ0FBQyxDQUFDRSxNQUFNLENBQUMsQ0FBQ3ZDLE1BQU0sRUFBRXdDLFNBQVMsS0FBSztjQUN6RSxJQUNFQSxTQUFTLEtBQUssVUFBVSxJQUN4QkEsU0FBUyxLQUFLLFVBQVUsSUFDeEJBLFNBQVMsS0FBSyxVQUFVLEVBQ3hCO2dCQUNBeEMsTUFBTSxDQUFDd0MsU0FBUyxDQUFDLEdBQUdILHdCQUF3QixDQUFDRyxTQUFTLENBQUM7Y0FDekQ7Y0FDQSxPQUFPeEMsTUFBTTtZQUNmLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztVQUNSO1FBQ0YsQ0FBQztNQUNIO0lBQ0YsQ0FBQztJQUNESyxZQUFZLEVBQUU7TUFDWkMsTUFBTSxFQUFFO1FBQ05SLFdBQVcsRUFBRSw0RUFBNEU7UUFDekZJLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDZCxrQkFBa0IsQ0FBQ2UsVUFBVTtNQUN4RDtJQUNGLENBQUM7SUFDREMsbUJBQW1CLEVBQUUsTUFBQUEsQ0FBT0MsSUFBSSxFQUFFQyxPQUFPLEVBQUVDLFlBQVksS0FBSztNQUMxRCxJQUFJO1FBQ0YsTUFBTTtVQUFFWixNQUFNO1VBQUVrQztRQUFTLENBQUMsR0FBRyxJQUFBckIsaUJBQVEsRUFBQ0gsSUFBSSxDQUFDO1FBQzNDLE1BQU07VUFBRUksTUFBTTtVQUFFQyxJQUFJO1VBQUVDO1FBQUssQ0FBQyxHQUFHTCxPQUFPO1FBRXRDLE1BQU1NLFdBQVcsR0FBRyxNQUFNLElBQUFDLHdCQUFjLEVBQUMsUUFBUSxFQUFFbEIsTUFBTSxFQUFFO1VBQ3pEbUIsU0FBUyxFQUFFLE9BQU87VUFDbEIxQixrQkFBa0I7VUFDbEIyQixjQUFjLEVBQUVWLElBQUksQ0FBQ1YsTUFBTTtVQUMzQnFCLEdBQUcsRUFBRTtZQUFFUCxNQUFNO1lBQUVDLElBQUk7WUFBRUM7VUFBSztRQUM1QixDQUFDLENBQUM7UUFFRixNQUFNO1VBQUVNLFlBQVk7VUFBRUMsUUFBUTtVQUFFQztRQUFpQixDQUFDLEdBQUcsTUFBTXJGLGdCQUFnQixDQUFDc0YsWUFBWSxDQUN0RixPQUFPLEVBQUFwRCxhQUFBLENBQUFBLGFBQUEsS0FDRjRDLFdBQVc7VUFBRWlCO1FBQVEsSUFDMUJwQixNQUFNLEVBQ05DLElBQUksRUFDSkMsSUFDRixDQUFDO1FBRURMLE9BQU8sQ0FBQ0ssSUFBSSxDQUFDTSxZQUFZLEdBQUdBLFlBQVk7UUFDeEMsTUFBTWhCLE1BQU0sR0FBRyxNQUFNLElBQUFvQixxQ0FBdUIsRUFDMUNmLE9BQU8sRUFDUEMsWUFBWSxFQUNaLGNBQWMsRUFDZFcsUUFDRixDQUFDO1FBQ0QsSUFBSUMsZ0JBQWdCLElBQUlsQixNQUFNLENBQUNxQixJQUFJLEVBQUU7VUFBRXJCLE1BQU0sQ0FBQ3FCLElBQUksQ0FBQ0gsZ0JBQWdCLEdBQUdBLGdCQUFnQjtRQUFFO1FBQ3hGLE9BQU87VUFDTGxCO1FBQ0YsQ0FBQztNQUNILENBQUMsQ0FBQyxPQUFPNUQsQ0FBQyxFQUFFO1FBQ1YrQyxrQkFBa0IsQ0FBQ21DLFdBQVcsQ0FBQ2xGLENBQUMsQ0FBQztNQUNuQztJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBRUYrQyxrQkFBa0IsQ0FBQ29DLGNBQWMsQ0FBQ0ksaUJBQWlCLENBQUN2QixJQUFJLENBQUNvQixLQUFLLENBQUM1QixJQUFJLENBQUM2QixNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUN2RnRDLGtCQUFrQixDQUFDb0MsY0FBYyxDQUFDSSxpQkFBaUIsQ0FBQy9CLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ3JFVCxrQkFBa0IsQ0FBQ3VDLGtCQUFrQixDQUFDLFdBQVcsRUFBRUMsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUVqRixNQUFNUSxhQUFhLEdBQUcsSUFBQTdDLDBDQUE0QixFQUFDO0lBQ2pEQyxJQUFJLEVBQUUsT0FBTztJQUNiQyxXQUFXLEVBQUUsNERBQTREO0lBQ3pFQyxXQUFXLEVBQUU7TUFDWDJDLFFBQVEsRUFBRTtRQUNSNUMsV0FBVyxFQUFFLCtDQUErQztRQUM1REksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNvQyxzQkFBYTtNQUN4QyxDQUFDO01BQ0RDLFFBQVEsRUFBRTtRQUNSOUMsV0FBVyxFQUFFLCtDQUErQztRQUM1REksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNvQyxzQkFBYTtNQUN4QyxDQUFDO01BQ0RULFFBQVEsRUFBRTtRQUNScEMsV0FBVyxFQUFFLDBFQUEwRTtRQUN2RkksSUFBSSxFQUFFaUM7TUFDUjtJQUNGLENBQUM7SUFDRDlCLFlBQVksRUFBRTtNQUNaQyxNQUFNLEVBQUU7UUFDTlIsV0FBVyxFQUFFLHdFQUF3RTtRQUNyRkksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNkLGtCQUFrQixDQUFDZSxVQUFVO01BQ3hEO0lBQ0YsQ0FBQztJQUNEQyxtQkFBbUIsRUFBRSxNQUFBQSxDQUFPQyxJQUFJLEVBQUVDLE9BQU8sRUFBRUMsWUFBWSxLQUFLO01BQzFELElBQUk7UUFDRixNQUFNO1VBQUU4QixRQUFRO1VBQUVFLFFBQVE7VUFBRVY7UUFBUyxDQUFDLEdBQUcsSUFBQXJCLGlCQUFRLEVBQUNILElBQUksQ0FBQztRQUN2RCxNQUFNO1VBQUVJLE1BQU07VUFBRUMsSUFBSTtVQUFFQztRQUFLLENBQUMsR0FBR0wsT0FBTztRQUV0QyxNQUFNO1VBQUVXLFlBQVk7VUFBRUMsUUFBUTtVQUFFQztRQUFpQixDQUFDLEdBQUcsQ0FDbkQsTUFBTWxDLFdBQVcsQ0FBQ3VELFdBQVcsQ0FBQztVQUM1QkMsSUFBSSxFQUFFO1lBQ0pKLFFBQVE7WUFDUkUsUUFBUTtZQUNSVjtVQUNGLENBQUM7VUFDRGEsS0FBSyxFQUFFLENBQUMsQ0FBQztVQUNUakMsTUFBTTtVQUNOQyxJQUFJO1VBQ0pDO1FBQ0YsQ0FBQyxDQUFDLEVBQ0ZnQyxRQUFRO1FBRVZyQyxPQUFPLENBQUNLLElBQUksQ0FBQ00sWUFBWSxHQUFHQSxZQUFZO1FBRXhDLE1BQU1oQixNQUFNLEdBQUcsTUFBTSxJQUFBb0IscUNBQXVCLEVBQzFDZixPQUFPLEVBQ1BDLFlBQVksRUFDWixjQUFjLEVBQ2RXLFFBQ0YsQ0FBQztRQUNELElBQUlDLGdCQUFnQixJQUFJbEIsTUFBTSxDQUFDcUIsSUFBSSxFQUFFO1VBQUVyQixNQUFNLENBQUNxQixJQUFJLENBQUNILGdCQUFnQixHQUFHQSxnQkFBZ0I7UUFBRTtRQUN4RixPQUFPO1VBQ0xsQjtRQUNGLENBQUM7TUFDSCxDQUFDLENBQUMsT0FBTzVELENBQUMsRUFBRTtRQUNWK0Msa0JBQWtCLENBQUNtQyxXQUFXLENBQUNsRixDQUFDLENBQUM7TUFDbkM7SUFDRjtFQUNGLENBQUMsQ0FBQztFQUVGK0Msa0JBQWtCLENBQUNvQyxjQUFjLENBQUNZLGFBQWEsQ0FBQy9CLElBQUksQ0FBQ29CLEtBQUssQ0FBQzVCLElBQUksQ0FBQzZCLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ25GdEMsa0JBQWtCLENBQUNvQyxjQUFjLENBQUNZLGFBQWEsQ0FBQ3ZDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ2pFVCxrQkFBa0IsQ0FBQ3VDLGtCQUFrQixDQUFDLE9BQU8sRUFBRVMsYUFBYSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFFekUsTUFBTVEsY0FBYyxHQUFHLElBQUFyRCwwQ0FBNEIsRUFBQztJQUNsREMsSUFBSSxFQUFFLFFBQVE7SUFDZEMsV0FBVyxFQUFFLDhEQUE4RDtJQUMzRU8sWUFBWSxFQUFFO01BQ1o2QyxFQUFFLEVBQUU7UUFDRnBELFdBQVcsRUFBRSxtQkFBbUI7UUFDaENJLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDNEMsdUJBQWM7TUFDekM7SUFDRixDQUFDO0lBQ0QxQyxtQkFBbUIsRUFBRSxNQUFBQSxDQUFPMkMsS0FBSyxFQUFFekMsT0FBTyxLQUFLO01BQzdDLElBQUk7UUFDRixNQUFNO1VBQUVHLE1BQU07VUFBRUMsSUFBSTtVQUFFQztRQUFLLENBQUMsR0FBR0wsT0FBTztRQUV0QyxNQUFNckIsV0FBVyxDQUFDK0QsWUFBWSxDQUFDO1VBQzdCdkMsTUFBTTtVQUNOQyxJQUFJO1VBQ0pDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsT0FBTztVQUFFa0MsRUFBRSxFQUFFO1FBQUssQ0FBQztNQUNyQixDQUFDLENBQUMsT0FBT3hHLENBQUMsRUFBRTtRQUNWK0Msa0JBQWtCLENBQUNtQyxXQUFXLENBQUNsRixDQUFDLENBQUM7TUFDbkM7SUFDRjtFQUNGLENBQUMsQ0FBQztFQUVGK0Msa0JBQWtCLENBQUNvQyxjQUFjLENBQUNvQixjQUFjLENBQUN2QyxJQUFJLENBQUNvQixLQUFLLENBQUM1QixJQUFJLENBQUM2QixNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUNwRnRDLGtCQUFrQixDQUFDb0MsY0FBYyxDQUFDb0IsY0FBYyxDQUFDL0MsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDbEVULGtCQUFrQixDQUFDdUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFaUIsY0FBYyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFFM0UsTUFBTUsscUJBQXFCLEdBQUcsSUFBQTFELDBDQUE0QixFQUFDO0lBQ3pEQyxJQUFJLEVBQUUsZUFBZTtJQUNyQkMsV0FBVyxFQUNULG1GQUFtRjtJQUNyRkMsV0FBVyxFQUFFO01BQ1h3RCxLQUFLLEVBQUU7UUFDTHRELFlBQVksRUFBRSx1REFBdUQ7UUFDckVDLElBQUksRUFBRSxJQUFJSyx1QkFBYyxDQUFDb0Msc0JBQWE7TUFDeEM7SUFDRixDQUFDO0lBQ0R0QyxZQUFZLEVBQUU7TUFDWjZDLEVBQUUsRUFBRTtRQUNGcEQsV0FBVyxFQUFFLG1CQUFtQjtRQUNoQ0ksSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUM0Qyx1QkFBYztNQUN6QztJQUNGLENBQUM7SUFDRDFDLG1CQUFtQixFQUFFLE1BQUFBLENBQU87TUFBRThDO0lBQU0sQ0FBQyxFQUFFNUMsT0FBTyxLQUFLO01BQ2pELE1BQU07UUFBRUcsTUFBTTtRQUFFQyxJQUFJO1FBQUVDO01BQUssQ0FBQyxHQUFHTCxPQUFPO01BRXRDLE1BQU1yQixXQUFXLENBQUNrRSxrQkFBa0IsQ0FBQztRQUNuQ1YsSUFBSSxFQUFFO1VBQ0pTO1FBQ0YsQ0FBQztRQUNEekMsTUFBTTtRQUNOQyxJQUFJO1FBQ0pDO01BQ0YsQ0FBQyxDQUFDO01BRUYsT0FBTztRQUFFa0MsRUFBRSxFQUFFO01BQUssQ0FBQztJQUNyQjtFQUNGLENBQUMsQ0FBQztFQUVGekQsa0JBQWtCLENBQUNvQyxjQUFjLENBQUN5QixxQkFBcUIsQ0FBQzVDLElBQUksQ0FBQ29CLEtBQUssQ0FBQzVCLElBQUksQ0FBQzZCLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQzNGdEMsa0JBQWtCLENBQUNvQyxjQUFjLENBQUN5QixxQkFBcUIsQ0FBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ3pFVCxrQkFBa0IsQ0FBQ3VDLGtCQUFrQixDQUFDLGVBQWUsRUFBRXNCLHFCQUFxQixFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFFekYsTUFBTUcsNEJBQTRCLEdBQUcsSUFBQTdELDBDQUE0QixFQUFDO0lBQ2hFQyxJQUFJLEVBQUUsc0JBQXNCO0lBQzVCQyxXQUFXLEVBQ1QsMEZBQTBGO0lBQzVGQyxXQUFXLEVBQUU7TUFDWDJDLFFBQVEsRUFBRTtRQUNSekMsWUFBWSxFQUFFLHlEQUF5RDtRQUN2RUMsSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNvQyxzQkFBYTtNQUN4QyxDQUFDO01BQ0RDLFFBQVEsRUFBRTtRQUNSM0MsWUFBWSxFQUFFLDBCQUEwQjtRQUN4Q0MsSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNvQyxzQkFBYTtNQUN4QyxDQUFDO01BQ0RlLEtBQUssRUFBRTtRQUNMekQsWUFBWSxFQUFFLDBDQUEwQztRQUN4REMsSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNvQyxzQkFBYTtNQUN4QztJQUNGLENBQUM7SUFDRHRDLFlBQVksRUFBRTtNQUNaNkMsRUFBRSxFQUFFO1FBQ0ZwRCxXQUFXLEVBQUUsbUJBQW1CO1FBQ2hDSSxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQzRDLHVCQUFjO01BQ3pDO0lBQ0YsQ0FBQztJQUNEMUMsbUJBQW1CLEVBQUUsTUFBQUEsQ0FBTztNQUFFaUMsUUFBUTtNQUFFRSxRQUFRO01BQUVjO0lBQU0sQ0FBQyxFQUFFL0MsT0FBTyxLQUFLO01BQ3JFLE1BQU07UUFBRUc7TUFBTyxDQUFDLEdBQUdILE9BQU87TUFDMUIsSUFBSSxDQUFDK0IsUUFBUSxFQUFFO1FBQ2IsTUFBTSxJQUFJaUIsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxnQkFBZ0IsRUFBRSw2QkFBNkIsQ0FBQztNQUNwRjtNQUNBLElBQUksQ0FBQ2pCLFFBQVEsRUFBRTtRQUNiLE1BQU0sSUFBSWUsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRSxnQkFBZ0IsRUFBRSw2QkFBNkIsQ0FBQztNQUNwRjtNQUNBLElBQUksQ0FBQ0osS0FBSyxFQUFFO1FBQ1YsTUFBTSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNHLFdBQVcsRUFBRSwwQkFBMEIsQ0FBQztNQUM1RTtNQUVBLE1BQU1DLGNBQWMsR0FBR2xELE1BQU0sQ0FBQ2tELGNBQWM7TUFDNUMsTUFBTUEsY0FBYyxDQUFDQyxjQUFjLENBQUN2QixRQUFRLEVBQUVnQixLQUFLLEVBQUVkLFFBQVEsQ0FBQztNQUM5RCxPQUFPO1FBQUVNLEVBQUUsRUFBRTtNQUFLLENBQUM7SUFDckI7RUFDRixDQUFDLENBQUM7RUFFRnpELGtCQUFrQixDQUFDb0MsY0FBYyxDQUMvQjRCLDRCQUE0QixDQUFDL0MsSUFBSSxDQUFDb0IsS0FBSyxDQUFDNUIsSUFBSSxDQUFDNkIsTUFBTSxFQUNuRCxJQUFJLEVBQ0osSUFDRixDQUFDO0VBQ0R0QyxrQkFBa0IsQ0FBQ29DLGNBQWMsQ0FBQzRCLDRCQUE0QixDQUFDdkQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDaEZULGtCQUFrQixDQUFDdUMsa0JBQWtCLENBQ25DLHNCQUFzQixFQUN0QnlCLDRCQUE0QixFQUM1QixJQUFJLEVBQ0osSUFDRixDQUFDO0VBRUQsTUFBTVMsNkJBQTZCLEdBQUcsSUFBQXRFLDBDQUE0QixFQUFDO0lBQ2pFQyxJQUFJLEVBQUUsdUJBQXVCO0lBQzdCQyxXQUFXLEVBQ1Qsc0ZBQXNGO0lBQ3hGQyxXQUFXLEVBQUU7TUFDWHdELEtBQUssRUFBRTtRQUNMdEQsWUFBWSxFQUFFLDhEQUE4RDtRQUM1RUMsSUFBSSxFQUFFLElBQUlLLHVCQUFjLENBQUNvQyxzQkFBYTtNQUN4QztJQUNGLENBQUM7SUFDRHRDLFlBQVksRUFBRTtNQUNaNkMsRUFBRSxFQUFFO1FBQ0ZwRCxXQUFXLEVBQUUsbUJBQW1CO1FBQ2hDSSxJQUFJLEVBQUUsSUFBSUssdUJBQWMsQ0FBQzRDLHVCQUFjO01BQ3pDO0lBQ0YsQ0FBQztJQUNEMUMsbUJBQW1CLEVBQUUsTUFBQUEsQ0FBTztNQUFFOEM7SUFBTSxDQUFDLEVBQUU1QyxPQUFPLEtBQUs7TUFDakQsSUFBSTtRQUNGLE1BQU07VUFBRUcsTUFBTTtVQUFFQyxJQUFJO1VBQUVDO1FBQUssQ0FBQyxHQUFHTCxPQUFPO1FBRXRDLE1BQU1yQixXQUFXLENBQUM2RSw4QkFBOEIsQ0FBQztVQUMvQ3JCLElBQUksRUFBRTtZQUNKUztVQUNGLENBQUM7VUFDRHpDLE1BQU07VUFDTkMsSUFBSTtVQUNKQztRQUNGLENBQUMsQ0FBQztRQUVGLE9BQU87VUFBRWtDLEVBQUUsRUFBRTtRQUFLLENBQUM7TUFDckIsQ0FBQyxDQUFDLE9BQU94RyxDQUFDLEVBQUU7UUFDVitDLGtCQUFrQixDQUFDbUMsV0FBVyxDQUFDbEYsQ0FBQyxDQUFDO01BQ25DO0lBQ0Y7RUFDRixDQUFDLENBQUM7RUFFRitDLGtCQUFrQixDQUFDb0MsY0FBYyxDQUMvQnFDLDZCQUE2QixDQUFDeEQsSUFBSSxDQUFDb0IsS0FBSyxDQUFDNUIsSUFBSSxDQUFDNkIsTUFBTSxFQUNwRCxJQUFJLEVBQ0osSUFDRixDQUFDO0VBQ0R0QyxrQkFBa0IsQ0FBQ29DLGNBQWMsQ0FBQ3FDLDZCQUE2QixDQUFDaEUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDakZULGtCQUFrQixDQUFDdUMsa0JBQWtCLENBQ25DLHVCQUF1QixFQUN2QmtDLDZCQUE2QixFQUM3QixJQUFJLEVBQ0osSUFDRixDQUFDO0VBRUQsTUFBTUUsaUJBQWlCLEdBQUcsSUFBQXhFLDBDQUE0QixFQUFDO0lBQ3JEQyxJQUFJLEVBQUUsV0FBVztJQUNqQkMsV0FBVyxFQUNULDJHQUEyRztJQUM3R0MsV0FBVyxFQUFFO01BQ1gyQyxRQUFRLEVBQUU7UUFDUjVDLFdBQVcsRUFBRSwrQ0FBK0M7UUFDNURJLElBQUksRUFBRXlDO01BQ1IsQ0FBQztNQUNEQyxRQUFRLEVBQUU7UUFDUjlDLFdBQVcsRUFBRSwrQ0FBK0M7UUFDNURJLElBQUksRUFBRXlDO01BQ1IsQ0FBQztNQUNEVCxRQUFRLEVBQUU7UUFDUnBDLFdBQVcsRUFDVCxzRkFBc0Y7UUFDeEZJLElBQUksRUFBRWlDO01BQ1IsQ0FBQztNQUNEa0MsYUFBYSxFQUFFO1FBQ2J2RSxXQUFXLEVBQ1QsMEhBQTBIO1FBQzVISSxJQUFJLEVBQUVpQztNQUNSO0lBQ0YsQ0FBQztJQUNEOUIsWUFBWSxFQUFFO01BQ1pnRSxhQUFhLEVBQUU7UUFDYnZFLFdBQVcsRUFBRSxtREFBbUQ7UUFDaEVJLElBQUksRUFBRWlDO01BQ1I7SUFDRixDQUFDO0lBQ0QxQixtQkFBbUIsRUFBRSxNQUFBQSxDQUFPcUIsS0FBSyxFQUFFbkIsT0FBTyxLQUFLO01BQzdDLElBQUk7UUFDRixNQUFNO1VBQUVHLE1BQU07VUFBRUMsSUFBSTtVQUFFQztRQUFLLENBQUMsR0FBR0wsT0FBTztRQUV0QyxNQUFNO1VBQUVxQztRQUFTLENBQUMsR0FBRyxNQUFNMUQsV0FBVyxDQUFDZ0YsZUFBZSxDQUFDO1VBQ3JEeEIsSUFBSSxFQUFFaEIsS0FBSztVQUNYaEIsTUFBTTtVQUNOQyxJQUFJO1VBQ0pDO1FBQ0YsQ0FBQyxDQUFDO1FBQ0YsT0FBT2dDLFFBQVE7TUFDakIsQ0FBQyxDQUFDLE9BQU90RyxDQUFDLEVBQUU7UUFDVitDLGtCQUFrQixDQUFDbUMsV0FBVyxDQUFDbEYsQ0FBQyxDQUFDO01BQ25DO0lBQ0Y7RUFDRixDQUFDLENBQUM7RUFFRitDLGtCQUFrQixDQUFDb0MsY0FBYyxDQUFDdUMsaUJBQWlCLENBQUMxRCxJQUFJLENBQUNvQixLQUFLLENBQUM1QixJQUFJLENBQUM2QixNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUN2RnRDLGtCQUFrQixDQUFDb0MsY0FBYyxDQUFDdUMsaUJBQWlCLENBQUNsRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUNyRVQsa0JBQWtCLENBQUN1QyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUVvQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0FBQ25GLENBQUM7QUFBQ0csT0FBQSxDQUFBL0UsSUFBQSxHQUFBQSxJQUFBIiwiaWdub3JlTGlzdCI6W119