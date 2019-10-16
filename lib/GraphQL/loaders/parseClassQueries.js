"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var _pluralize = _interopRequireDefault(require("pluralize"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const getParseClassQueryConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.query || {};
};

const getQuery = async (className, _source, args, context, queryInfo) => {
  let {
    id
  } = args;
  const {
    options
  } = args;
  const {
    readPreference,
    includeReadPreference
  } = options || {};
  const {
    config,
    auth,
    info
  } = context;
  const selectedFields = (0, _graphqlListFields.default)(queryInfo);
  const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);

  if (globalIdObject.type === className) {
    id = globalIdObject.id;
  }

  const {
    keys,
    include
  } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
  return await objectsQueries.getObject(className, id, keys, include, readPreference, includeReadPreference, config, auth, info);
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
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
    const getGraphQLQueryName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    parseGraphQLSchema.addGraphQLQuery(getGraphQLQueryName, {
      description: `The ${getGraphQLQueryName} query can be used to get an object of the ${graphQLClassName} class by its id.`,
      args: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        options: defaultGraphQLTypes.READ_OPTIONS_ATT
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, queryInfo) {
        try {
          return await getQuery(className, _source, args, context, queryInfo);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }

  if (isFindEnabled) {
    const findGraphQLQueryName = (0, _pluralize.default)(graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1));
    parseGraphQLSchema.addGraphQLQuery(findGraphQLQueryName, {
      description: `The ${findGraphQLQueryName} query can be used to find objects of the ${graphQLClassName} class.`,
      args: classGraphQLFindArgs,
      type: new _graphql.GraphQLNonNull(classGraphQLFindResultType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, queryInfo) {
        try {
          const {
            where,
            order,
            skip,
            first,
            after,
            last,
            before,
            options
          } = args;
          const {
            readPreference,
            includeReadPreference,
            subqueryReadPreference
          } = options || {};
          const {
            config,
            auth,
            info
          } = context;
          const selectedFields = (0, _graphqlListFields.default)(queryInfo);
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')));
          const parseOrder = order && order.join(',');
          return await objectsQueries.findObjects(className, where, parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseClass.fields);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwiZ2V0UXVlcnkiLCJjbGFzc05hbWUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJpZCIsIm9wdGlvbnMiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJnbG9iYWxJZE9iamVjdCIsInR5cGUiLCJrZXlzIiwiaW5jbHVkZSIsIm9iamVjdHNRdWVyaWVzIiwiZ2V0T2JqZWN0IiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiZGVzY3JpcHRpb24iLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJSRUFEX09QVElPTlNfQVRUIiwiR3JhcGhRTE5vbk51bGwiLCJPQkpFQ1QiLCJyZXNvbHZlIiwiZSIsImhhbmRsZUVycm9yIiwiZmluZEdyYXBoUUxRdWVyeU5hbWUiLCJ3aGVyZSIsIm9yZGVyIiwic2tpcCIsImZpcnN0IiwiYWZ0ZXIiLCJsYXN0IiwiYmVmb3JlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImZpbHRlciIsImZpZWxkIiwic3RhcnRzV2l0aCIsIm1hcCIsInJlcGxhY2UiLCJwYXJzZU9yZGVyIiwiam9pbiIsImZpbmRPYmplY3RzIiwiZmllbGRzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsd0JBQXdCLEdBQUcsVUFDL0JDLGdCQUQrQixFQUUvQjtBQUNBLFNBQVFBLGdCQUFnQixJQUFJQSxnQkFBZ0IsQ0FBQ0MsS0FBdEMsSUFBZ0QsRUFBdkQ7QUFDRCxDQUpEOztBQU1BLE1BQU1DLFFBQVEsR0FBRyxPQUFPQyxTQUFQLEVBQWtCQyxPQUFsQixFQUEyQkMsSUFBM0IsRUFBaUNDLE9BQWpDLEVBQTBDQyxTQUExQyxLQUF3RDtBQUN2RSxNQUFJO0FBQUVDLElBQUFBO0FBQUYsTUFBU0gsSUFBYjtBQUNBLFFBQU07QUFBRUksSUFBQUE7QUFBRixNQUFjSixJQUFwQjtBQUNBLFFBQU07QUFBRUssSUFBQUEsY0FBRjtBQUFrQkMsSUFBQUE7QUFBbEIsTUFBNENGLE9BQU8sSUFBSSxFQUE3RDtBQUNBLFFBQU07QUFBRUcsSUFBQUEsTUFBRjtBQUFVQyxJQUFBQSxJQUFWO0FBQWdCQyxJQUFBQTtBQUFoQixNQUF5QlIsT0FBL0I7QUFDQSxRQUFNUyxjQUFjLEdBQUcsZ0NBQWNSLFNBQWQsQ0FBdkI7QUFFQSxRQUFNUyxjQUFjLEdBQUcsZ0NBQWFSLEVBQWIsQ0FBdkI7O0FBRUEsTUFBSVEsY0FBYyxDQUFDQyxJQUFmLEtBQXdCZCxTQUE1QixFQUF1QztBQUNyQ0ssSUFBQUEsRUFBRSxHQUFHUSxjQUFjLENBQUNSLEVBQXBCO0FBQ0Q7O0FBRUQsUUFBTTtBQUFFVSxJQUFBQSxJQUFGO0FBQVFDLElBQUFBO0FBQVIsTUFBb0IsOENBQXNCSixjQUF0QixDQUExQjtBQUVBLFNBQU8sTUFBTUssY0FBYyxDQUFDQyxTQUFmLENBQ1hsQixTQURXLEVBRVhLLEVBRlcsRUFHWFUsSUFIVyxFQUlYQyxPQUpXLEVBS1hULGNBTFcsRUFN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bk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgcGx1cmFsaXplIGZyb20gJ3BsdXJhbGl6ZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcblxuY29uc3QgZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnID0gZnVuY3Rpb24oXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnF1ZXJ5KSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldFF1ZXJ5ID0gYXN5bmMgKGNsYXNzTmFtZSwgX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSA9PiB7XG4gIGxldCB7IGlkIH0gPSBhcmdzO1xuICBjb25zdCB7IG9wdGlvbnMgfSA9IGFyZ3M7XG4gIGNvbnN0IHsgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgfVxuXG4gIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcblxuICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgIGNsYXNzTmFtZSxcbiAgICBpZCxcbiAgICBrZXlzLFxuICAgIGluY2x1ZGUsXG4gICAgcmVhZFByZWZlcmVuY2UsXG4gICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgIGNvbmZpZyxcbiAgICBhdXRoLFxuICAgIGluZm9cbiAgKTtcbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbihcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgZ2V0OiBpc0dldEVuYWJsZWQgPSB0cnVlLFxuICAgIGZpbmQ6IGlzRmluZEVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0dldEVuYWJsZWQpIHtcbiAgICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID1cbiAgICAgIGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZ2V0R3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBnZXQgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGJ5IGl0cyBpZC5gLFxuICAgICAgYXJnczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGdldFF1ZXJ5KGNsYXNzTmFtZSwgX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc0ZpbmRFbmFibGVkKSB7XG4gICAgY29uc3QgZmluZEdyYXBoUUxRdWVyeU5hbWUgPSBwbHVyYWxpemUoXG4gICAgICBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKVxuICAgICk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShmaW5kR3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtmaW5kR3JhcGhRTFF1ZXJ5TmFtZX0gcXVlcnkgY2FuIGJlIHVzZWQgdG8gZmluZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBhcmdzOiBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RcbiAgICAgICksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICBvcHRpb25zLFxuICAgICAgICAgIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgcGFyc2VPcmRlciA9IG9yZGVyICYmIG9yZGVyLmpvaW4oJywnKTtcblxuICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgcGFyc2VPcmRlcixcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBmaXJzdCxcbiAgICAgICAgICAgIGFmdGVyLFxuICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=