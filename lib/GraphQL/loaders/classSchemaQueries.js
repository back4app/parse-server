"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.getClass = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _schemaFields = require("../transformers/schemaFields");

var classSchemaTypes = _interopRequireWildcard(require("./classSchemaTypes"));

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const getClass = async (name, schema) => {
  try {
    return await schema.getOneSchema(name, true);
  } catch (e) {
    if (e === undefined) {
      throw new _node.default.Error(_node.default.Error.INVALID_CLASS_NAME, `Class ${name} does not exist.`);
    } else {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
    }
  }
};

exports.getClass = getClass;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery('class', {
    description: 'The class query can be used to retrieve an existing object class.',
    args: {
      name: classSchemaTypes.CLASS_NAME_ATT
    },
    type: new _graphql.GraphQLNonNull(classSchemaTypes.CLASS),
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
        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const parseClass = await getClass(name, schema);
        return {
          name: parseClass.className,
          schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  }, true, true);
  parseGraphQLSchema.addGraphQLQuery('classes', {
    description: 'The classes query can be used to retrieve the existing object classes.',
    type: new _graphql.GraphQLNonNull(new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classSchemaTypes.CLASS))),
    resolve: async (_source, _args, context) => {
      try {
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);
        const schema = await config.database.loadSchema({
          clearCache: true
        });
        return (await schema.getAllClasses(true)).map(parseClass => ({
          name: parseClass.className,
          schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
        }));
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  }, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvY2xhc3NTY2hlbWFRdWVyaWVzLmpzIl0sIm5hbWVzIjpbImdldENsYXNzIiwibmFtZSIsInNjaGVtYSIsImdldE9uZVNjaGVtYSIsImUiLCJ1bmRlZmluZWQiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImFkZEdyYXBoUUxRdWVyeSIsImRlc2NyaXB0aW9uIiwiYXJncyIsImNsYXNzU2NoZW1hVHlwZXMiLCJDTEFTU19OQU1FX0FUVCIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkNMQVNTIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJjb250ZXh0IiwiY29uZmlnIiwiYXV0aCIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImNsZWFyQ2FjaGUiLCJwYXJzZUNsYXNzIiwiY2xhc3NOYW1lIiwic2NoZW1hRmllbGRzIiwiZmllbGRzIiwiaGFuZGxlRXJyb3IiLCJHcmFwaFFMTGlzdCIsIl9hcmdzIiwiZ2V0QWxsQ2xhc3NlcyIsIm1hcCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxNQUFNQSxRQUFRLEdBQUcsT0FBT0MsSUFBUCxFQUFhQyxNQUFiLEtBQXdCO0FBQ3ZDLE1BQUk7QUFDRixXQUFPLE1BQU1BLE1BQU0sQ0FBQ0MsWUFBUCxDQUFvQkYsSUFBcEIsRUFBMEIsSUFBMUIsQ0FBYjtBQUNELEdBRkQsQ0FFRSxPQUFPRyxDQUFQLEVBQVU7QUFDVixRQUFJQSxDQUFDLEtBQUtDLFNBQVYsRUFBcUI7QUFDbkIsWUFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMsa0JBRFIsRUFFSCxTQUFRUCxJQUFLLGtCQUZWLENBQU47QUFJRCxLQUxELE1BS087QUFDTCxZQUFNLElBQUlLLGNBQU1DLEtBQVYsQ0FDSkQsY0FBTUMsS0FBTixDQUFZRSxxQkFEUixFQUVKLHlCQUZJLENBQU47QUFJRDtBQUNGO0FBQ0YsQ0FoQkQ7Ozs7QUFrQkEsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGVBQW5CLENBQ0UsT0FERixFQUVFO0FBQ0VDLElBQUFBLFdBQVcsRUFDVCxtRUFGSjtBQUdFQyxJQUFBQSxJQUFJLEVBQUU7QUFDSmIsTUFBQUEsSUFBSSxFQUFFYyxnQkFBZ0IsQ0FBQ0M7QUFEbkIsS0FIUjtBQU1FQyxJQUFBQSxJQUFJLEVBQUUsSUFBSUMsdUJBQUosQ0FBbUJILGdCQUFnQixDQUFDSSxLQUFwQyxDQU5SO0FBT0VDLElBQUFBLE9BQU8sRUFBRSxPQUFPQyxPQUFQLEVBQWdCUCxJQUFoQixFQUFzQlEsT0FBdEIsS0FBa0M7QUFDekMsVUFBSTtBQUNGLGNBQU07QUFBRXJCLFVBQUFBO0FBQUYsWUFBV2EsSUFBakI7QUFDQSxjQUFNO0FBQUVTLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUE7QUFBVixZQUFtQkYsT0FBekI7QUFFQSx1REFBdUJFLElBQXZCO0FBRUEsY0FBTXRCLE1BQU0sR0FBRyxNQUFNcUIsTUFBTSxDQUFDRSxRQUFQLENBQWdCQyxVQUFoQixDQUEyQjtBQUFFQyxVQUFBQSxVQUFVLEVBQUU7QUFBZCxTQUEzQixDQUFyQjtBQUNBLGNBQU1DLFVBQVUsR0FBRyxNQUFNNUIsUUFBUSxDQUFDQyxJQUFELEVBQU9DLE1BQVAsQ0FBakM7QUFDQSxlQUFPO0FBQ0xELFVBQUFBLElBQUksRUFBRTJCLFVBQVUsQ0FBQ0MsU0FEWjtBQUVMQyxVQUFBQSxZQUFZLEVBQUUsc0NBQW1CRixVQUFVLENBQUNHLE1BQTlCO0FBRlQsU0FBUDtBQUlELE9BWkQsQ0FZRSxPQUFPM0IsQ0FBUCxFQUFVO0FBQ1ZPLFFBQUFBLGtCQUFrQixDQUFDcUIsV0FBbkIsQ0FBK0I1QixDQUEvQjtBQUNEO0FBQ0Y7QUF2QkgsR0FGRixFQTJCRSxJQTNCRixFQTRCRSxJQTVCRjtBQStCQU8sRUFBQUEsa0JBQWtCLENBQUNDLGVBQW5CLENBQ0UsU0FERixFQUVFO0FBQ0VDLElBQUFBLFdBQVcsRUFDVCx3RUFGSjtBQUdFSSxJQUFBQSxJQUFJLEVBQUUsSUFBSUMsdUJBQUosQ0FDSixJQUFJZSxvQkFBSixDQUFnQixJQUFJZix1QkFBSixDQUFtQkgsZ0JBQWdCLENBQUNJLEtBQXBDLENBQWhCLENBREksQ0FIUjtBQU1FQyxJQUFBQSxPQUFPLEVBQUUsT0FBT0MsT0FBUCxFQUFnQmEsS0FBaEIsRUFBdUJaLE9BQXZCLEtBQW1DO0FBQzFDLFVBQUk7QUFDRixjQUFNO0FBQUVDLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUE7QUFBVixZQUFtQkYsT0FBekI7QUFFQSx1REFBdUJFLElBQXZCO0FBRUEsY0FBTXRCLE1BQU0sR0FBRyxNQUFNcUIsTUFBTSxDQUFDRSxRQUFQLENBQWdCQyxVQUFoQixDQUEyQjtBQUFFQyxVQUFBQSxVQUFVLEVBQUU7QUFBZCxTQUEzQixDQUFyQjtBQUNBLGVBQU8sQ0FBQyxNQUFNekIsTUFBTSxDQUFDaUMsYUFBUCxDQUFxQixJQUFyQixDQUFQLEVBQW1DQyxHQUFuQyxDQUF1Q1IsVUFBVSxLQUFLO0FBQzNEM0IsVUFBQUEsSUFBSSxFQUFFMkIsVUFBVSxDQUFDQyxTQUQwQztBQUUzREMsVUFBQUEsWUFBWSxFQUFFLHNDQUFtQkYsVUFBVSxDQUFDRyxNQUE5QjtBQUY2QyxTQUFMLENBQWpELENBQVA7QUFJRCxPQVZELENBVUUsT0FBTzNCLENBQVAsRUFBVTtBQUNWTyxRQUFBQSxrQkFBa0IsQ0FBQ3FCLFdBQW5CLENBQStCNUIsQ0FBL0I7QUFDRDtBQUNGO0FBcEJILEdBRkYsRUF3QkUsSUF4QkYsRUF5QkUsSUF6QkY7QUEyQkQsQ0EzREQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTExpc3QgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHRyYW5zZm9ybVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9zY2hlbWFGaWVsZHMnO1xuaW1wb3J0ICogYXMgY2xhc3NTY2hlbWFUeXBlcyBmcm9tICcuL2NsYXNzU2NoZW1hVHlwZXMnO1xuaW1wb3J0IHsgZW5mb3JjZU1hc3RlcktleUFjY2VzcyB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcblxuY29uc3QgZ2V0Q2xhc3MgPSBhc3luYyAobmFtZSwgc2NoZW1hKSA9PiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IHNjaGVtYS5nZXRPbmVTY2hlbWEobmFtZSwgdHJ1ZSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBpZiAoZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgYENsYXNzICR7bmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yLidcbiAgICAgICk7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShcbiAgICAnY2xhc3MnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIGNsYXNzIHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIHJldHJpZXZlIGFuIGV4aXN0aW5nIG9iamVjdCBjbGFzcy4nLFxuICAgICAgYXJnczoge1xuICAgICAgICBuYW1lOiBjbGFzc1NjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc1NjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIHJlc29sdmU6IGFzeW5jIChfc291cmNlLCBhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBuYW1lIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgICBjb25zdCBwYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZTogcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChwYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoXG4gICAgJ2NsYXNzZXMnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIGNsYXNzZXMgcXVlcnkgY2FuIGJlIHVzZWQgdG8gcmV0cmlldmUgdGhlIGV4aXN0aW5nIG9iamVjdCBjbGFzc2VzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgIG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NTY2hlbWFUeXBlcy5DTEFTUykpXG4gICAgICApLFxuICAgICAgcmVzb2x2ZTogYXN5bmMgKF9zb3VyY2UsIF9hcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICAgIHJldHVybiAoYXdhaXQgc2NoZW1hLmdldEFsbENsYXNzZXModHJ1ZSkpLm1hcChwYXJzZUNsYXNzID0+ICh7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGdldENsYXNzLCBsb2FkIH07XG4iXX0=