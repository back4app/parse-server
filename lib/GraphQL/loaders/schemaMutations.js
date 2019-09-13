"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var schemaTypes = _interopRequireWildcard(require("./schemaTypes"));

var _schemaFields = require("../transformers/schemaFields");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

var _schemaQueries = require("./schemaQueries");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation('createClass', {
    description: 'The createClass mutation can be used to create the schema for a new object class.',
    args: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT
      }
    },
    type: new _graphql.GraphQLNonNull(schemaTypes.CLASS),
    resolve: async (_source, args, context) => {
      try {
        const {
          name,
          schemaFields
        } = args;
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
          name: parseClass.className,
          schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  }, true, true);
  parseGraphQLSchema.addGraphQLMutation('updateClass', {
    description: 'The updateClass mutation can be used to update the schema for an existing object class.',
    args: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT
      }
    },
    type: new _graphql.GraphQLNonNull(schemaTypes.CLASS),
    resolve: async (_source, args, context) => {
      try {
        const {
          name,
          schemaFields
        } = args;
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
          name: parseClass.className,
          schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  }, true, true);
  parseGraphQLSchema.addGraphQLMutation('deleteClass', {
    description: 'The deleteClass mutation can be used to delete an existing object class.',
    args: {
      name: schemaTypes.CLASS_NAME_ATT
    },
    type: new _graphql.GraphQLNonNull(schemaTypes.CLASS),
    resolve: async (_source, args, context) => {
      try {
        const {
          name
        } = args;
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
          name: existingParseClass.className,
          schemaFields: (0, _schemaFields.transformToGraphQL)(existingParseClass.fields)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  }, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJuYW1lIiwic2NoZW1hVHlwZXMiLCJDTEFTU19OQU1FX0FUVCIsInNjaGVtYUZpZWxkcyIsInR5cGUiLCJTQ0hFTUFfRklFTERTX0lOUFVUIiwiR3JhcGhRTE5vbk51bGwiLCJDTEFTUyIsInJlc29sdmUiLCJfc291cmNlIiwiY29udGV4dCIsImNvbmZpZyIsImF1dGgiLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJzY2hlbWEiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJjbGVhckNhY2hlIiwicGFyc2VDbGFzcyIsImFkZENsYXNzSWZOb3RFeGlzdHMiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJlIiwiaGFuZGxlRXJyb3IiLCJleGlzdGluZ1BhcnNlQ2xhc3MiLCJ1cGRhdGVDbGFzcyIsInVuZGVmaW5lZCIsImRlbGV0ZVNjaGVtYSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUlBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakNBLEVBQUFBLGtCQUFrQixDQUFDQyxrQkFBbkIsQ0FDRSxhQURGLEVBRUU7QUFDRUMsSUFBQUEsV0FBVyxFQUNULG1GQUZKO0FBR0VDLElBQUFBLElBQUksRUFBRTtBQUNKQyxNQUFBQSxJQUFJLEVBQUVDLFdBQVcsQ0FBQ0MsY0FEZDtBQUVKQyxNQUFBQSxZQUFZLEVBQUU7QUFDWkwsUUFBQUEsV0FBVyxFQUFFLG9EQUREO0FBRVpNLFFBQUFBLElBQUksRUFBRUgsV0FBVyxDQUFDSTtBQUZOO0FBRlYsS0FIUjtBQVVFRCxJQUFBQSxJQUFJLEVBQUUsSUFBSUUs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LGVBQU87QUFDTEEsVUFBQUEsSUFBSSxFQUFFMkIsa0JBQWtCLENBQUNKLFNBRHBCO0FBRUxwQixVQUFBQSxZQUFZLEVBQUUsc0NBQW1Cd0Isa0JBQWtCLENBQUNILE1BQXRDO0FBRlQsU0FBUDtBQUlELE9BcEJELENBb0JFLE9BQU9DLENBQVAsRUFBVTtBQUNWN0IsUUFBQUEsa0JBQWtCLENBQUM4QixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGO0FBL0JILEdBRkYsRUFtQ0UsSUFuQ0YsRUFvQ0UsSUFwQ0Y7QUFzQ0QsQ0FySUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9zY2hlbWFUeXBlcyc7XG5pbXBvcnQge1xuICB0cmFuc2Zvcm1Ub1BhcnNlLFxuICB0cmFuc2Zvcm1Ub0dyYXBoUUwsXG59IGZyb20gJy4uL3RyYW5zZm9ybWVycy9zY2hlbWFGaWVsZHMnO1xuaW1wb3J0IHsgZW5mb3JjZU1hc3RlcktleUFjY2VzcyB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCB7IGdldENsYXNzIH0gZnJvbSAnLi9zY2hlbWFRdWVyaWVzJztcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2NyZWF0ZUNsYXNzJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZSBjcmVhdGVDbGFzcyBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgdGhlIHNjaGVtYSBmb3IgYSBuZXcgb2JqZWN0IGNsYXNzLicsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgICAgICBzY2hlbWFGaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogXCJUaGVzZSBhcmUgdGhlIHNjaGVtYSdzIGZpZWxkcyBvZiB0aGUgb2JqZWN0IGNsYXNzLlwiLFxuICAgICAgICAgIHR5cGU6IHNjaGVtYVR5cGVzLlNDSEVNQV9GSUVMRFNfSU5QVVQsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIHJlc29sdmU6IGFzeW5jIChfc291cmNlLCBhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBuYW1lLCBzY2hlbWFGaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgICAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byBjcmVhdGUgYSBzY2hlbWEuXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IHBhcnNlQ2xhc3MgPSBhd2FpdCBzY2hlbWEuYWRkQ2xhc3NJZk5vdEV4aXN0cyhcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICB0cmFuc2Zvcm1Ub1BhcnNlKHNjaGVtYUZpZWxkcylcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAndXBkYXRlQ2xhc3MnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIHVwZGF0ZUNsYXNzIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHVwZGF0ZSB0aGUgc2NoZW1hIGZvciBhbiBleGlzdGluZyBvYmplY3QgY2xhc3MuJyxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgbmFtZTogc2NoZW1hVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICAgIHNjaGVtYUZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlRoZXNlIGFyZSB0aGUgc2NoZW1hJ3MgZmllbGRzIG9mIHRoZSBvYmplY3QgY2xhc3MuXCIsXG4gICAgICAgICAgdHlwZTogc2NoZW1hVHlwZXMuU0NIRU1BX0ZJRUxEU19JTlBVVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoc2NoZW1hVHlwZXMuQ0xBU1MpLFxuICAgICAgcmVzb2x2ZTogYXN5bmMgKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IG5hbWUsIHNjaGVtYUZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MoYXV0aCk7XG5cbiAgICAgICAgICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIHVwZGF0ZSBhIHNjaGVtYS5cIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgICBjb25zdCBwYXJzZUNsYXNzID0gYXdhaXQgc2NoZW1hLnVwZGF0ZUNsYXNzKFxuICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgIHRyYW5zZm9ybVRvUGFyc2Uoc2NoZW1hRmllbGRzLCBleGlzdGluZ1BhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG5hbWU6IHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgICAgICAgICAgc2NoZW1hRmllbGRzOiB0cmFuc2Zvcm1Ub0dyYXBoUUwocGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdkZWxldGVDbGFzcycsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGUgZGVsZXRlQ2xhc3MgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gZGVsZXRlIGFuIGV4aXN0aW5nIG9iamVjdCBjbGFzcy4nLFxuICAgICAgYXJnczoge1xuICAgICAgICBuYW1lOiBzY2hlbWFUeXBlcy5DTEFTU19OQU1FX0FUVCxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoc2NoZW1hVHlwZXMuQ0xBU1MpLFxuICAgICAgcmVzb2x2ZTogYXN5bmMgKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IG5hbWUgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgICAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byBkZWxldGUgYSBzY2hlbWEuXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nUGFyc2VDbGFzcyA9IGF3YWl0IGdldENsYXNzKG5hbWUsIHNjaGVtYSk7XG4gICAgICAgICAgYXdhaXQgY29uZmlnLmRhdGFiYXNlLmRlbGV0ZVNjaGVtYShuYW1lKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZTogZXhpc3RpbmdQYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKGV4aXN0aW5nUGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==