"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

var parseClassTypes = _interopRequireWildcard(require("./parseClassTypes"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const getParseClassQueryConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.query || {};
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const {
    className
  } = parseClass;
  const {
    get: isGetEnabled = true,
    find: isFindEnabled = true
  } = getParseClassQueryConfig(parseClassConfig);
  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isGetEnabled) {
    const getGraphQLQueryName = `get${className}`;
    parseGraphQLSchema.graphQLObjectsQueries[getGraphQLQueryName] = {
      description: `The ${getGraphQLQueryName} query can be used to get an object of the ${className} class by its id.`,
      args: {
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
        readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
        includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType),

      async resolve(_source, args, context, queryInfo) {
        try {
          const {
            objectId,
            readPreference,
            includeReadPreference
          } = args;
          const {
            config,
            auth,
            info
          } = context;
          const selectedFields = (0, _graphqlListFields.default)(queryInfo);
          const {
            keys,
            include
          } = parseClassTypes.extractKeysAndInclude(selectedFields);
          return await objectsQueries.getObject(className, objectId, keys, include, readPreference, includeReadPreference, config, auth, info);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    };
  }

  if (isFindEnabled) {
    const findGraphQLQueryName = `find${className}`;
    parseGraphQLSchema.graphQLObjectsQueries[findGraphQLQueryName] = {
      description: `The ${findGraphQLQueryName} query can be used to find objects of the ${className} class.`,
      args: classGraphQLFindArgs,
      type: new _graphql.GraphQLNonNull(classGraphQLFindResultType),

      async resolve(_source, args, context, queryInfo) {
        try {
          const {
            where,
            order,
            skip,
            limit,
            readPreference,
            includeReadPreference,
            subqueryReadPreference
          } = args;
          const {
            config,
            auth,
            info
          } = context;
          const selectedFields = (0, _graphqlListFields.default)(queryInfo);
          const {
            keys,
            include
          } = parseClassTypes.extractKeysAndInclude(selectedFields.filter(field => field.includes('.')).map(field => field.slice(field.indexOf('.') + 1)));
          const parseOrder = order && order.join(',');
          return await objectsQueries.findObjects(className, where, parseOrder, skip, limit, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields.map(field => field.split('.', 1)[0]));
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    };
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJnZXQiLCJpc0dldEVuYWJsZWQiLCJmaW5kIiwiaXNGaW5kRW5hYmxlZCIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiZ2V0R3JhcGhRTFF1ZXJ5TmFtZSIsImdyYXBoUUxPYmplY3RzUXVlcmllcyIsImRlc2NyaXB0aW9uIiwiYXJncyIsIm9iamVjdElkIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVF9JRF9BVFQiLCJyZWFkUHJlZmVyZW5jZSIsIlJFQURfUFJFRkVSRU5DRV9BVFQiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwia2V5cyIsImluY2x1ZGUiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJvYmplY3RzUXVlcmllcyIsImdldE9iamVjdCIsImUiLCJoYW5kbGVFcnJvciIsImZpbmRHcmFwaFFMUXVlcnlOYW1lIiwid2hlcmUiLCJvcmRlciIsInNraXAiLCJsaW1pdCIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwibWFwIiwic2xpY2UiLCJpbmRleE9mIiwicGFyc2VPcmRlciIsImpvaW4iLCJmaW5kT2JqZWN0cyIs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aUIsQ0FBakIsRUFBb0IsQ0FBcEIsQ0FBNUIsQ0FmVyxDQUFiO0FBaUJELFNBckNELENBcUNFLE9BQU9qQixDQUFQLEVBQVU7QUFDVnJDLFVBQUFBLGtCQUFrQixDQUFDc0MsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUE3QzhELEtBQWpFO0FBK0NEO0FBQ0YsQ0F6R0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NUeXBlcyBmcm9tICcuL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzUXVlcnlDb25maWcgPSBmdW5jdGlvbihcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgcmV0dXJuIChwYXJzZUNsYXNzQ29uZmlnICYmIHBhcnNlQ2xhc3NDb25maWcucXVlcnkpIHx8IHt9O1xufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uKFxuICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIGNvbnN0IHsgY2xhc3NOYW1lIH0gPSBwYXJzZUNsYXNzO1xuICBjb25zdCB7XG4gICAgZ2V0OiBpc0dldEVuYWJsZWQgPSB0cnVlLFxuICAgIGZpbmQ6IGlzRmluZEVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0dldEVuYWJsZWQpIHtcbiAgICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gYGdldCR7Y2xhc3NOYW1lfWA7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxPYmplY3RzUXVlcmllc1tnZXRHcmFwaFFMUXVlcnlOYW1lXSA9IHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0gcXVlcnkgY2FuIGJlIHVzZWQgdG8gZ2V0IGFuIG9iamVjdCBvZiB0aGUgJHtjbGFzc05hbWV9IGNsYXNzIGJ5IGl0cyBpZC5gLFxuICAgICAgYXJnczoge1xuICAgICAgICBvYmplY3RJZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSURfQVRULFxuICAgICAgICByZWFkUHJlZmVyZW5jZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBvYmplY3RJZCwgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gcGFyc2VDbGFzc1R5cGVzLmV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBvYmplY3RJZCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIGlmIChpc0ZpbmRFbmFibGVkKSB7XG4gICAgY29uc3QgZmluZEdyYXBoUUxRdWVyeU5hbWUgPSBgZmluZCR7Y2xhc3NOYW1lfWA7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxPYmplY3RzUXVlcmllc1tmaW5kR3JhcGhRTFF1ZXJ5TmFtZV0gPSB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2ZpbmRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBmaW5kIG9iamVjdHMgb2YgdGhlICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgYXJnczogY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBwYXJzZUNsYXNzVHlwZXMuZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5pbmNsdWRlcygnLicpKVxuICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnNsaWNlKGZpZWxkLmluZGV4T2YoJy4nKSArIDEpKVxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgcGFyc2VPcmRlciA9IG9yZGVyICYmIG9yZGVyLmpvaW4oJywnKTtcblxuICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgcGFyc2VPcmRlcixcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzLm1hcChmaWVsZCA9PiBmaWVsZC5zcGxpdCgnLicsIDEpWzBdKVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfTtcbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19