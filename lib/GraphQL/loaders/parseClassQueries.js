"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _pluralize = _interopRequireDefault(require("pluralize"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const getParseClassQueryConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.query || {};
};

const getQuery = async (parseClass, _source, args, context, queryInfo, parseClasses) => {
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

  if (globalIdObject.type === parseClass.className) {
    id = globalIdObject.id;
  }

  const {
    keys,
    include
  } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
  return await objectsQueries.getObject(parseClass.className, id, keys, include, readPreference, includeReadPreference, config, auth, info, parseClasses);
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const {
    get: isGetEnabled = true,
    find: isFindEnabled = true,
    getAlias = '',
    findAlias = ''
  } = getParseClassQueryConfig(parseClassConfig);
  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isGetEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    const getGraphQLQueryName = getAlias || lowerCaseClassName;
    parseGraphQLSchema.addGraphQLQuery(getGraphQLQueryName, {
      description: `The ${getGraphQLQueryName} query can be used to get an object of the ${graphQLClassName} class by its id.`,
      args: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        options: defaultGraphQLTypes.READ_OPTIONS_ATT
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, queryInfo) {
        try {
          return await getQuery(parseClass, _source, (0, _deepcopy.default)(args), context, queryInfo, parseGraphQLSchema.parseClasses);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }

  if (isFindEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    const findGraphQLQueryName = findAlias || (0, _pluralize.default)(lowerCaseClassName);
    parseGraphQLSchema.addGraphQLQuery(findGraphQLQueryName, {
      description: `The ${findGraphQLQueryName} query can be used to find objects of the ${graphQLClassName} class.`,
      args: classGraphQLFindArgs,
      type: new _graphql.GraphQLNonNull(classGraphQLFindResultType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, queryInfo) {
        try {
          // Deep copy args to avoid internal re assign issue
          const {
            where,
            order,
            skip,
            first,
            after,
            last,
            before,
            options
          } = (0, _deepcopy.default)(args);
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
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')).filter(field => field.indexOf('edges.node') < 0));
          const parseOrder = order && order.join(',');
          return await objectsQueries.findObjects(className, where, parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZXRQYXJzZUNsYXNzUXVlcnlDb25maWciLCJwYXJzZUNsYXNzQ29uZmlnIiwicXVlcnkiLCJnZXRRdWVyeSIsInBhcnNlQ2xhc3MiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJwYXJzZUNsYXNzZXMiLCJpZCIsIm9wdGlvbnMiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJnZXRGaWVsZE5hbWVzIiwiZ2xvYmFsSWRPYmplY3QiLCJmcm9tR2xvYmFsSWQiLCJ0eXBlIiwiY2xhc3NOYW1lIiwia2V5cyIsImluY2x1ZGUiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJvYmplY3RzUXVlcmllcyIsImdldE9iamVjdCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwidHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJnZXRBbGlhcyIsImZpbmRBbGlhcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwibG93ZXJDYXNlQ2xhc3NOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJHcmFwaFFMTm9uTnVsbCIsIk9CSkVDVCIsInJlc29sdmUiLCJkZWVwY29weSIsImUiLCJoYW5kbGVFcnJvciIsImZpbmRHcmFwaFFMUXVlcnlOYW1lIiwicGx1cmFsaXplIiwid2hlcmUiLCJvcmRlciIsInNraXAiLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJmaWx0ZXIiLCJmaWVsZCIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5kZXhPZiIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3BhcnNlQ2xhc3NRdWVyaWVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBwbHVyYWxpemUgZnJvbSAncGx1cmFsaXplJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzUXVlcnlDb25maWcgPSBmdW5jdGlvbiAocGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnF1ZXJ5KSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldFF1ZXJ5ID0gYXN5bmMgKHBhcnNlQ2xhc3MsIF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbywgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGxldCB7IGlkIH0gPSBhcmdzO1xuICBjb25zdCB7IG9wdGlvbnMgfSA9IGFyZ3M7XG4gIGNvbnN0IHsgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpIHtcbiAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICB9XG5cbiAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuXG4gIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgaWQsXG4gICAga2V5cyxcbiAgICBpbmNsdWRlLFxuICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBpbmZvLFxuICAgIHBhcnNlQ2xhc3Nlc1xuICApO1xufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uIChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgZ2V0OiBpc0dldEVuYWJsZWQgPSB0cnVlLFxuICAgIGZpbmQ6IGlzRmluZEVuYWJsZWQgPSB0cnVlLFxuICAgIGdldEFsaWFzOiBnZXRBbGlhcyA9ICcnLFxuICAgIGZpbmRBbGlhczogZmluZEFsaWFzID0gJycsXG4gIH0gPSBnZXRQYXJzZUNsYXNzUXVlcnlDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzR2V0RW5hYmxlZCkge1xuICAgIGNvbnN0IGxvd2VyQ2FzZUNsYXNzTmFtZSA9IGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gICAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9IGdldEFsaWFzIHx8IGxvd2VyQ2FzZUNsYXNzTmFtZTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZ2V0R3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBnZXQgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGJ5IGl0cyBpZC5gLFxuICAgICAgYXJnczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGdldFF1ZXJ5KFxuICAgICAgICAgICAgcGFyc2VDbGFzcyxcbiAgICAgICAgICAgIF9zb3VyY2UsXG4gICAgICAgICAgICBkZWVwY29weShhcmdzKSxcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICBxdWVyeUluZm8sXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc0ZpbmRFbmFibGVkKSB7XG4gICAgY29uc3QgbG93ZXJDYXNlQ2xhc3NOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgICBjb25zdCBmaW5kR3JhcGhRTFF1ZXJ5TmFtZSA9IGZpbmRBbGlhcyB8fCBwbHVyYWxpemUobG93ZXJDYXNlQ2xhc3NOYW1lKTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZmluZEdyYXBoUUxRdWVyeU5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZmluZEdyYXBoUUxRdWVyeU5hbWV9IHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGZpbmQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgYXJnczogY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBEZWVwIGNvcHkgYXJncyB0byBhdm9pZCBpbnRlcm5hbCByZSBhc3NpZ24gaXNzdWVcbiAgICAgICAgICBjb25zdCB7IHdoZXJlLCBvcmRlciwgc2tpcCwgZmlyc3QsIGFmdGVyLCBsYXN0LCBiZWZvcmUsIG9wdGlvbnMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSwgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluZGV4T2YoJ2VkZ2VzLm5vZGUnKSA8IDApXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBwYXJzZU9yZGVyID0gb3JkZXIgJiYgb3JkZXIuam9pbignLCcpO1xuXG4gICAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgd2hlcmUsXG4gICAgICAgICAgICBwYXJzZU9yZGVyLFxuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsd0JBQXdCLEdBQUcsVUFBVUMsZ0JBQVYsRUFBc0Q7RUFDckYsT0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixD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