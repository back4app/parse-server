"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _graphqlRelay = require("graphql-relay");

var schemaTypes = _interopRequireWildcard(require("./schemaTypes"));

var _schemaFields = require("../transformers/schemaFields");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

var _schemaQueries = require("./schemaQueries");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = parseGraphQLSchema => {
  const createClassMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'CreateClass',
    description: 'The createClass mutation can be used to create the schema for a new object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT
      }
    },
    outputFields: {
      class: {
        description: 'This is the created class.',
        type: new _graphql.GraphQLNonNull(schemaTypes.CLASS)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          name,
          schemaFields
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);

        if (auth.isReadOnly) {
          throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to create a schema.");
        }

        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const parseClass = await schema.addClassIfNotExists(name, (0, _schemaFields.transformToParse)(schemaFields));
        return {
          class: {
            name: parseClass.className,
            schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
          }
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(createClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(createClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('createClass', createClassMutation, true, true);
  const updateClassMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'UpdateClass',
    description: 'The updateClass mutation can be used to update the schema for an existing object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT
      }
    },
    outputFields: {
      class: {
        description: 'This is the updated class.',
        type: new _graphql.GraphQLNonNull(schemaTypes.CLASS)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          name,
          schemaFields
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);

        if (auth.isReadOnly) {
          throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update a schema.");
        }

        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const existingParseClass = await (0, _schemaQueries.getClass)(name, schema);
        const parseClass = await schema.updateClass(name, (0, _schemaFields.transformToParse)(schemaFields, existingParseClass.fields), undefined, undefined, config.database);
        return {
          class: {
            name: parseClass.className,
            schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
          }
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(updateClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(updateClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('updateClass', updateClassMutation, true, true);
  const deleteClassMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'DeleteClass',
    description: 'The deleteClass mutation can be used to delete an existing object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT
    },
    outputFields: {
      class: {
        description: 'This is the deleted class.',
        type: new _graphql.GraphQLNonNull(schemaTypes.CLASS)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          name
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);

        if (auth.isReadOnly) {
          throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to delete a schema.");
        }

        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const existingParseClass = await (0, _schemaQueries.getClass)(name, schema);
        await config.database.deleteSchema(name);
        return {
          class: {
            name: existingParseClass.className,
            schemaFields: (0, _schemaFields.transformToGraphQL)(existingParseClass.fields)
          }
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(deleteClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(deleteClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('deleteClass', deleteClassMutation, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiY3JlYXRlQ2xhc3NNdXRhdGlvbiIsIm11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJpbnB1dEZpZWxkcyIsInNjaGVtYVR5cGVzIiwiQ0xBU1NfTkFNRV9BVFQiLCJzY2hlbWFGaWVsZHMiLCJ0eXBlIiwiU0NIRU1BX0ZJRUxEU19JTlBVVCIsIm91dHB1dEZpZWxkcyIsImNsYXNzIiwiR3JhcGhRTE5vbk51bGwiLCJDTEFTUyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJzY2hlbWEiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJjbGVhckNhY2hlIiwicGFyc2VDbGFzcyIsImFkZENsYXNzSWZOb3RFeGlzdHMiLCJ0cmFuc2Zvcm1Ub1BhcnNlIiwiY2xhc3NOYW1lIiwidHJhbnNmb3JtVG9HcmFwaFFMIiwiZmllbGRzIiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUNsYXNzTXV0YXRpb24iLCJleGlzdGluZ1BhcnNlQ2xhc3MiLCJnZXRDbGFzcyIsInVwZGF0ZUNsYXNzIiwidW5kZWZpbmVkIiwiZGVsZXRlQ2xhc3NNdXRhdGlvbiIsImRlbGV0ZVNjaGVtYSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1Ub1BhcnNlLCB0cmFuc2Zvcm1Ub0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvc2NoZW1hRmllbGRzJztcbmltcG9ydCB7IGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgeyBnZXRDbGFzcyB9IGZyb20gJy4vc2NoZW1hUXVlcmllcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBjcmVhdGVDbGFzc011dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NyZWF0ZUNsYXNzJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY3JlYXRlQ2xhc3MgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBzY2hlbWEgZm9yIGEgbmV3IG9iamVjdCBjbGFzcy4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBuYW1lOiBzY2hlbWFUeXBlcy5DTEFTU19OQU1FX0FUVCxcbiAgICAgIHNjaGVtYUZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJUaGVzZSBhcmUgdGhlIHNjaGVtYSdzIGZpZWxkcyBvZiB0aGUgb2JqZWN0IGNsYXNzLlwiLFxuICAgICAgICB0eXBlOiBzY2hlbWFUeXBlcy5TQ0hFTUFfRklFTERTX0lOUFVULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2xhc3M6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIGNsYXNzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgbmFtZSwgc2NoZW1hRmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIGNyZWF0ZSBhIHNjaGVtYS5cIlxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIGNvbnN0IHBhcnNlQ2xhc3MgPSBhd2FpdCBzY2hlbWEuYWRkQ2xhc3NJZk5vdEV4aXN0cyhuYW1lLCB0cmFuc2Zvcm1Ub1BhcnNlKHNjaGVtYUZpZWxkcykpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzOiB7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUNsYXNzTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVDbGFzc011dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdjcmVhdGVDbGFzcycsIGNyZWF0ZUNsYXNzTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IHVwZGF0ZUNsYXNzTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnVXBkYXRlQ2xhc3MnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSB1cGRhdGVDbGFzcyBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgYW4gZXhpc3Rpbmcgb2JqZWN0IGNsYXNzLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgICAgc2NoZW1hRmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlRoZXNlIGFyZSB0aGUgc2NoZW1hJ3MgZmllbGRzIG9mIHRoZSBvYmplY3QgY2xhc3MuXCIsXG4gICAgICAgIHR5cGU6IHNjaGVtYVR5cGVzLlNDSEVNQV9GSUVMRFNfSU5QVVQsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBjbGFzczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgY2xhc3MuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBuYW1lLCBzY2hlbWFGaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gdXBkYXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgY29uc3QgcGFyc2VDbGFzcyA9IGF3YWl0IHNjaGVtYS51cGRhdGVDbGFzcyhcbiAgICAgICAgICBuYW1lLFxuICAgICAgICAgIHRyYW5zZm9ybVRvUGFyc2Uoc2NoZW1hRmllbGRzLCBleGlzdGluZ1BhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIGNvbmZpZy5kYXRhYmFzZVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzOiB7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUNsYXNzTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVDbGFzc011dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCd1cGRhdGVDbGFzcycsIHVwZGF0ZUNsYXNzTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGRlbGV0ZUNsYXNzTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnRGVsZXRlQ2xhc3MnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGRlbGV0ZUNsYXNzIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBleGlzdGluZyBvYmplY3QgY2xhc3MuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgbmFtZTogc2NoZW1hVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNsYXNzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGVsZXRlZCBjbGFzcy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoc2NoZW1hVHlwZXMuQ0xBU1MpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IG5hbWUgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gZGVsZXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgYXdhaXQgY29uZmlnLmRhdGFiYXNlLmRlbGV0ZVNjaGVtYShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogZXhpc3RpbmdQYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKGV4aXN0aW5nUGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlQ2xhc3NNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUNsYXNzTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2RlbGV0ZUNsYXNzJywgZGVsZXRlQ2xhc3NNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0VBQ2pDLE1BQU1DLG1CQUFtQixHQUFHLElBQUFDLDBDQUFBLEVBQTZCO0lBQ3ZEQyxJQUFJLEVBQUUsYUFEaUQ7SUFFdkRDLFdBQVcsRUFDVCxtRkFIcUQ7SUFJdkRDLFdBQVcsRUFBRTtNQUNYRixJQUFJLEVBQUVHLFdBQVcsQ0FBQ0MsY0FEUDtNQUVYQyxZQUFZLEVBQUU7UUFDWkosV0FBVyxFQUFFLG9EQUREO1FBRVpLLElBQUksRUFBRUgsV0FBVyxDQUFDSTtNQUZOO0lBRkgsQ0FKMEM7SUFXdkRDLFlBQVksRUFBRTtNQUNaQyxLQUFLLEVBQUU7UUFDTFIsV0FBVyxFQUFFLDRCQURSO1FBRUxLLElBQUksRUFBRSxJQUFJSSx1QkFBSixDQUFtQlAsV0FBVyxDQUFDUSxLQUEvQjtNQUZEO0lBREssQ0FYeUM7SUFpQnZEQyxtQkFBbUIsRUFBRSxPQUFPQyxJQUFQLEVBQWFDLE9BQWIsS0FBeUI7TUFDNUMsSUFBSTtRQUNGLE1BQU07VUFBRWQsSUFBRjtVQUFRSztRQUFSLElBQXlCLElBQUFVLGlCQUFBLEVBQVNGLElBQVQsQ0FBL0I7UUFDQSxNQUFNO1VBQUVHLE1BQUY7VUFBVUM7UUFBVixJQUFtQkgsT0FBekI7UUFFQSxJQUFBSSx5Q0FBQSxFQUF1QkQsSUFBdkI7O1FBRUEsSUFBSUEsSUFBSSxDQUFDRSxVQUFULEVBQXFCO1VBQ25CLE1BQU0sSUFBSUMsYUFBQSxDQUFNQyxLQUFWLENBQ0pELGFBQUEsQ0FBTUMs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