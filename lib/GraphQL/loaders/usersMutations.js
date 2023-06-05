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
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', parseFields, config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
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
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
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
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2RlZXBjb3B5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9Vc2Vyc1JvdXRlciIsIm9iamVjdHNNdXRhdGlvbnMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9kZWZhdWx0R3JhcGhRTFR5cGVzIiwiX3VzZXJzUXVlcmllcyIsIl9tdXRhdGlvbiIsIl9ub2RlIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwiZGVzY3JpcHRpb25zIiwidHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJvdXRwdXRGaWVsZHMiLCJ2aWV3ZXIiLCJHcmFwaFFMTm9uTnVsbCIsInZpZXdlclR5cGUiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJkZWVwY29weSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJ0cmFuc2Zvcm1UeXBlcyIsImNsYXNzTmFtZSIsInJlcSIsInNlc3Npb25Ub2tlbiIsIm9iamVjdElkIiwiYXV0aERhdGFSZXNwb25zZSIsImNyZWF0ZU9iamVjdCIsImdldFVzZXJGcm9tU2Vzc2lvblRva2VuIiwidXNlciIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwibG9nSW5XaXRoTXV0YXRpb24iLCJhdXRoRGF0YSIsIk9CSkVDVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJyZWR1Y2UiLCJmaWVsZE5hbWUiLCJsb2dJbk11dGF0aW9uIiwidXNlcm5hbWUiLCJHcmFwaFFMU3RyaW5nIiwicGFzc3dvcmQiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwibG9nT3V0TXV0YXRpb24iLCJvayIsIkdyYXBoUUxCb29sZWFuIiwiX2FyZ3MiLCJoYW5kbGVMb2dPdXQiLCJyZXNldFBhc3N3b3JkTXV0YXRpb24iLCJlbWFpbCIsImhhbmRsZVJlc2V0UmVxdWVzdCIsImNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24iLCJ0b2tlbiIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9USEVSX0NBVVNFIiwidXNlckNvbnRyb2xsZXIiLCJ1cGRhdGVQYXNzd29yZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiY2hhbGxlbmdlTXV0YXRpb24iLCJjaGFsbGVuZ2VEYXRhIiwiaGFuZGxlQ2hhbGxlbmdlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxTdHJpbmcsIEdyYXBoUUxCb29sZWFuLCBHcmFwaFFMSW5wdXRPYmplY3RUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4uLy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0IHsgT0JKRUNUIH0gZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuIH0gZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5jb25zdCB1c2Vyc1JvdXRlciA9IG5ldyBVc2Vyc1JvdXRlcigpO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5pc1VzZXJzQ2xhc3NEaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHNpZ25VcE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NpZ25VcCcsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgc2lnblVwIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgc2lnbiB1cCBhIG5ldyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgbmV3IHVzZXIgdG8gYmUgY3JlYXRlZCBhbmQgc2lnbmVkIHVwLicsXG4gICAgICAgIHR5cGU6IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2lnblVwTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignc2lnblVwJywgc2lnblVwTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICBjb25zdCBsb2dJbldpdGhNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbldpdGgnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBsb2dJbldpdGggbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2lnbnVwLCBsb2dpbiB1c2VyIHdpdGggM3JkIHBhcnR5IGF1dGhlbnRpY2F0aW9uIHN5c3RlbS4gVGhpcyBtdXRhdGlvbiBjcmVhdGUgYSB1c2VyIGlmIHRoZSBhdXRoRGF0YSBkbyBub3QgY29ycmVzcG9uZCB0byBhbiBleGlzdGluZyBvbmUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhpcyBpcyB0aGUgYXV0aCBkYXRhIG9mIHlvdXIgY3VzdG9tIGF1dGggcHJvdmlkZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoT0JKRUNUKSxcbiAgICAgIH0sXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIHVzZXIgdG8gYmUgY3JlYXRlZC91cGRhdGVkIGFuZCBsb2dnZWQgaW4uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgICAgIG5hbWU6ICdVc2VyTG9naW5XaXRoSW5wdXQnLFxuICAgICAgICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICAgICAgICAgJ19Vc2VyJ1xuICAgICAgICAgICAgXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKGNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcykucmVkdWNlKChmaWVsZHMsIGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAncGFzc3dvcmQnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAndXNlcm5hbWUnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAnYXV0aERhdGEnXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICAgIH0sIHt9KTtcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcywgYXV0aERhdGEgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgLi4ucGFyc2VGaWVsZHMsIGF1dGhEYXRhIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5XaXRoTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbldpdGhNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nSW5XaXRoJywgbG9nSW5XaXRoTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGxvZ0luTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nSW4nLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ0luIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBpbiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIGF1dGhEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aCBkYXRhIHBheWxvYWQsIG5lZWRlZCBpZiBzb21lIHJlcXVpcmVkIGF1dGggYWRhcHRlcnMgYXJlIGNvbmZpZ3VyZWQuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZXhpc3RpbmcgdXNlciB0aGF0IHdhcyBsb2dnZWQgaW4gYW5kIHJldHVybmVkIGFzIGEgdmlld2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1c2VybmFtZSwgcGFzc3dvcmQsIGF1dGhEYXRhIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSAoXG4gICAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nSW4oe1xuICAgICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgICAgICAgIGF1dGhEYXRhLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHF1ZXJ5OiB7fSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgIH0pXG4gICAgICAgICkucmVzcG9uc2U7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgdmlld2VyLnVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbk11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbicsIGxvZ0luTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGxvZ091dE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ091dCcsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nT3V0IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBvdXQgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoX2FyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ091dCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dPdXRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dPdXQnLCBsb2dPdXRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgcmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1Jlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSByZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlUmVzZXRSZXF1ZXN0KHtcbiAgICAgICAgYm9keToge1xuICAgICAgICAgIGVtYWlsLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGluZm8sXG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUocmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUocmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdyZXNldFBhc3N3b3JkJywgcmVzZXRQYXNzd29yZE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NvbmZpcm1SZXNldFBhc3N3b3JkJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY29uZmlybVJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVXNlcm5hbWUgb2YgdGhlIHVzZXIgdGhhdCBoYXZlIHJlY2VpdmVkIHRoZSByZXNldCBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdOZXcgcGFzc3dvcmQgb2YgdGhlIHVzZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgdG9rZW46IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnUmVzZXQgdG9rZW4gdGhhdCB3YXMgZW1haWxlZCB0byB0aGUgdXNlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgdXNlcm5hbWUsIHBhc3N3b3JkLCB0b2tlbiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGEgdXNlcm5hbWUnKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGEgcGFzc3dvcmQnKTtcbiAgICAgIH1cbiAgICAgIGlmICghdG9rZW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAneW91IG11c3QgcHJvdmlkZSBhIHRva2VuJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgYXdhaXQgdXNlckNvbnRyb2xsZXIudXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjb25maXJtUmVzZXRQYXNzd29yZCcsXG4gICAgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzZW5kVmVyaWZpY2F0aW9uRW1haWwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2VuZCB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsIGFnYWluLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHtcbiAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICBlbWFpbCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdzZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IGNoYWxsZW5nZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NoYWxsZW5nZScsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNoYWxsZW5nZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBpbml0aWF0ZSBhbiBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2Ugd2hlbiBhbiBhdXRoIGFkYXB0ZXIgbmVlZHMgaXQuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIH0sXG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQXV0aCBkYXRhIGFsbG93IHRvIHByZWlkZW50aWZ5IHRoZSB1c2VyIGlmIHRoZSBhdXRoIGFkYXB0ZXIgbmVlZHMgcHJlaWRlbnRpZmljYXRpb24uJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ0NoYWxsZW5nZSBkYXRhIHBheWxvYWQsIGNhbiBiZSB1c2VkIHRvIHBvc3QgZGF0YSB0byBhdXRoIHByb3ZpZGVycyB0byBhdXRoIHByb3ZpZGVycyBpZiB0aGV5IG5lZWQgZGF0YSBmb3IgdGhlIHJlc3BvbnNlLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGFsbGVuZ2UgcmVzcG9uc2UgZnJvbSBjb25maWd1cmVkIGF1dGggYWRhcHRlcnMuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChpbnB1dCwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlQ2hhbGxlbmdlKHtcbiAgICAgICAgICBib2R5OiBpbnB1dCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNoYWxsZW5nZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NoYWxsZW5nZScsIGNoYWxsZW5nZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsYUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsU0FBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksWUFBQSxHQUFBRCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUssZ0JBQUEsR0FBQUMsdUJBQUEsQ0FBQU4sT0FBQTtBQUNBLElBQUFPLG9CQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxhQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxTQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxLQUFBLEdBQUFQLHNCQUFBLENBQUFILE9BQUE7QUFBK0IsU0FBQVcseUJBQUFDLFdBQUEsZUFBQUMsT0FBQSxrQ0FBQUMsaUJBQUEsT0FBQUQsT0FBQSxRQUFBRSxnQkFBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLFdBQUEsV0FBQUEsV0FBQSxHQUFBRyxnQkFBQSxHQUFBRCxpQkFBQSxLQUFBRixXQUFBO0FBQUEsU0FBQU4sd0JBQUFVLEdBQUEsRUFBQUosV0FBQSxTQUFBQSxXQUFBLElBQUFJLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLFdBQUFELEdBQUEsUUFBQUEsR0FBQSxvQkFBQUEsR0FBQSx3QkFBQUEsR0FBQSw0QkFBQUUsT0FBQSxFQUFB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