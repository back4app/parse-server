"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

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
  const {
    id,
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
        id: defaultGraphQLTypes.OBJECT_ID_ATT,
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
      type: new _graphql.GraphQLNonNull(classGraphQLFindResultType || defaultGraphQLTypes.FIND_RESULT),

      async resolve(_source, args, context, queryInfo) {
        try {
          const {
            where,
            order,
            skip,
            limit,
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
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.includes('.')).map(field => field.slice(field.indexOf('.') + 1)));
          const parseOrder = order && order.join(',');
          return await objectsQueries.findObjects(className, where, parseOrder, skip, limit, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields.map(field => field.split('.', 1)[0]), parseClass.fields);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwiZ2V0UXVlcnkiLCJjbGFzc05hbWUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJpZCIsIm9wdGlvbnMiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJrZXlzIiwiaW5jbHVkZSIsIm9iamVjdHNRdWVyaWVzIiwiZ2V0T2JqZWN0IiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiZGVzY3JpcHRpb24iLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJPQkpFQ1QiLCJyZXNvbHZlIiwiZSIsImhhbmRsZUVycm9yIiwiZmluZEdyYXBoUUxRdWVyeU5hbWUiLCJGSU5EX1JFU1VMVCIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwibGltaXQiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZmlsdGVyIiwiZmllbGQiLCJpbmNsdWRlcyIsIm1hcCIsImluZGV4T2YiLCJwYXJzZU9yZGVyIiwiam9pbiIsImZpbmRPYmplY3RzIiwic3BsaXQiLCJmaWVsZHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSx3QkFBd0IsR0FBRyxVQUMvQkMsZ0JBRCtCLEVBRS9CO0FBQ0EsU0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDQyxLQUF0QyxJQUFnRCxFQUF2RDtBQUNELENBSkQ7O0FBTUEsTUFBTUMsUUFBUSxHQUFHLE9BQU9DLFNBQVAsRUFBa0JDLE9BQWxCLEVBQTJCQyxJQUEzQixFQUFpQ0MsT0FBakMsRUFBMENDLFNBQTFDLEtBQXdEO0FBQ3ZFLFFBQU07QUFBRUMsSUFBQUEsRUFBRjtBQUFNQyxJQUFBQTtBQUFOLE1BQWtCSixJQUF4QjtBQUNBLFFBQU07QUFBRUssSUFBQUEsY0FBRjtBQUFrQkMsSUFBQUE7QUFBbEIsTUFBNENGLE9BQU8sSUFBSSxFQUE3RDtBQUNBLFFBQU07QUFBRUcsSUFBQUEsTUFBRjtBQUFVQyxJQUFBQSxJQUFWO0FBQWdCQyxJQUFBQTtBQUFoQixNQUF5QlIsT0FBL0I7QUFDQSxRQUFNUyxjQUFjLEdBQUcsZ0NBQWNSLFNBQWQsQ0FBdkI7QUFFQSxRQUFNO0FBQUVTLElBQUFBLElBQUY7QUFBUUMsSUFBQUE7QUFBUixNQUFvQiw4Q0FBc0JGLGNBQXRCLENBQTFCO0FBRUEsU0FBTyxNQUFNRyxjQUFjLENBQUNDLFNBQWYsQ0FDWGhCLFNBRFcsRUFFWEssRUFGVyxFQUdYUSxJQUhXLEVBSVhDLE9BSlcsRUFLWFAsY0FMVyxFQU1YQyxxQkFOVyxFQU9YQyxNQVBXLEVBUVhDLElBUlcsRUFTWEMsSUFUVyxDQUFiO0FBV0QsQ0FuQkQ7O0FBcUJBLE1BQU1NLElBQUksR0FBRyxVQUNYQyxrQkFEVyxFQUVYQyxVQUZXLEVBR1h0QixnQkFIVyxFQUlYO0FBQ0EsUUFBTUcsU0FBUyxHQUFHbUIsVUFBVSxDQUFDbkIsU0FBN0I7QUFDQSxRQUFNb0IsZ0JBQWdCLEdBQUcsNENBQTRCcEIsU0FBNUIsQ0FBekI7QUFDQSxRQUFNO0FBQ0pxQixJQUFBQSxHQUFHLEVBQUVDLFlBQVksR0FBRyxJQURoQjtBQUVKQyxJQUFBQSxJQUFJLEVBQUVDLGFBQWEsR0FBRztBQUZsQixNQUdGNUIsd0JBQXdCLENBQUNDLGdCQUFELENBSDVCO0FBS0EsUUFBTTtBQUNKNEIsSUFBQUEsc0JBREk7QUFFSkMsSUFBQUEsb0JBRkk7QUFHSkMsSUFBQUE7QUFISSxNQUlGVCxrQkFBa0IsQ0FBQ1UsZUFBbkIsQ0FBbUM1QixTQUFuQyxDQUpKOztBQU1BLE1BQUlzQixZQUFKLEVBQWtCO0FBQ2hCLFVBQU1PLG1CQUFtQixHQUN2QlQsZ0JBQWdCLENBQUNVLE1BQWpCLENBQXdCLENBQXhCLEVBQTJCQyxXQUEzQixLQUEyQ1gsZ0JBQWdCLENBQUNZLEtBQWpCLENBQXVCLENBQXZCLENBRDdDO0FBRUFkLElBQUFBLGtCQUFrQixDQUFDZSxlQUFuQixDQUFtQ0osbUJBQW5DLEVBQXdEO0FBQ3RESyxNQUFBQSxXQUFXLEVBQUcsT0FBTUwsbUJBQW9CLDhDQUE2Q1QsZ0JBQWlCLG1CQURoRDtBQUV0RGxCLE1BQUFBLElBQUksRUFBRTtBQUNKRyxRQUFBQSxFQUFFLEVBQUU4QixtQkFBbUIsQ0FBQ0MsYUFEcEI7QUFFSjlCLFFBQUFBLE9BQU8sRUFBRTZCLG1CQUFtQixDQUFDRTtBQUZ6QixPQUZnRDtBQU10REMsTUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQ0pkLHNCQUFzQixJQUFJVSxtQkFBbUIsQ0FBQ0ssTUFEMUMsQ0FOZ0Q7O0FBU3RELFlBQU1DLE9BQU4sQ0FBY3hDLE9BQWQsRUFBdUJDLElBQXZCLEVBQTZCQyxPQUE3QixFQUFzQ0MsU0FBdEMsRUFBaUQ7QUFDL0MsWUFBSTtBQUNGLGlCQUFPLE1BQU1MLFFBQVEsQ0FBQ0MsU0FBRCxFQUFZQyxPQUFaLEVBQXFCQyxJQUFyQixFQUEyQkMsT0FBM0IsRUFBb0NDLFNBQXBDLENBQXJCO0FBQ0QsU0FGRCxDQUVFLE9BQU9zQyxDQUFQLEVBQVU7QUFDVnhCLFVBQUFBLGtCQUFrQixDQUFDeUIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUFmcUQsS0FBeEQ7QUFpQkQ7O0FBRUQsTUFBSWxCLGFBQUosRUFBbUI7QUFDakIsVUFBTW9CLG9CQUFvQixHQUFHLHdCQUMzQnhCLGdCQUFnQixDQUFDVSxNQUFqQixDQUF3QixDQUF4QixFQUEyQkMsV0FBM0IsS0FBMkNYLGdCQUFnQixDQUFDWSxLQUFqQixDQUF1QixDQUF2QixDQURoQixDQUE3QjtBQUdBZCxJQUFBQSxrQkFBa0IsQ0FBQ2UsZUFBbkIsQ0FBbUNXLG9CQUFuQyxFQUF5RDtBQUN2RFYsTUFBQUEsV0FBVyxFQUFHLE9BQU1VLG9CQUFxQiw2Q0FBNEN4QixnQkFBaUIsU0FEL0M7QUFFdkRsQixNQUFBQSxJQUFJLEVBQUV3QixvQkFGaUQ7QUFHdkRZLE1BQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUNKWiwwQkFBMEIsSUFBSVEsbUJBQW1CLENBQUNVLFdBRDlDLENBSGlEOztBQU12RCxZQUFNSixPQUFOLENBQWN4QyxPQUFkLEVBQXVCQyxJQUF2QixFQUE2QkMsT0FBN0IsRUFBc0NDLFNBQXRDLEVBQWlEO0FBQy9DLFlBQUk7QUFDRixnQkFBTTtBQUFFMEMsWUFBQUEsS0FBRjtBQUFTQyxZQUFBQSxLQUFUO0FBQWdCQyxZQUFBQSxJQUFoQjtBQUFzQkMsWUFBQUEsS0FBdEI7QUFBNkIzQyxZQUFBQTtBQUE3QixjQUF5Q0osSUFBL0M7QUFDQSxnQkFBTTtBQUNKSyxZQUFBQSxjQURJO0FBRUpDLFlBQUFBLHFCQUZJO0FBR0owQyxZQUFBQTtBQUhJLGNBSUY1QyxPQUFPLElBQUksRUFKZjtBQUtBLGdCQUFNO0FBQUVHLFlBQUFBLE1BQUY7QUFBVUMsWUFBQUEsSUFBVjtBQUFnQkMsWUFBQUE7QUFBaEIsY0FBeUJSLE9BQS9CO0FBQ0EsZ0JBQU1TLGNBQWMsR0FBRyxnQ0FBY1IsU0FBZCxDQUF2QjtBQUVBLGdCQUFNO0FBQUVTLFlBQUFBLElBQUY7QUFBUUMsWUFBQUE7QUFBUixjQUFvQiw4Q0FDeEJGLGNBQWMsQ0FDWHVDLE1BREgsQ0FDVUMsS0FBSyxJQUFJQSxLQUFLLENBQUNDLFFBQU4sQ0FBZSxHQUFmLENBRG5CLEVBRUdDLEdBRkgsQ0FFT0YsS0FBSyxJQUFJQSxLQUFLLENBQUNwQixLQUFOLENBQVlvQixLQUFLLENBQUNHLE9BQU4sQ0FBYyxHQUFkLElBQXFCLENBQWpDLENBRmhCLENBRHdCLENBQTFCO0FBS0EsZ0JBQU1DLFVBQVUsR0FBR1QsS0FBSyxJQUFJQSxLQUFLLENBQUNVLElBQU4sQ0FBVyxHQUFYLENBQTVCO0FBRUEsaUJBQU8sTUFBTTFDLGNBQWMsQ0FBQzJDLFdBQWYsQ0FDWDFELFNBRFcsRUFFWDhDLEtBRlcsRUFHWFUsVUFIVyxFQUlYUixJQUpXLEVBS1hDLEtBTFcsRUFNWHBDLElBTlcsRUFPWEMsT0FQVyxFQVFYLEtBUlcsRUFTWFAsY0FUVyxFQVVYQyxxQkFWVyxFQVdYMEMsc0JBWFcsRUFZWHpDLE1BWlcsRUFhWEMsSUFiVyxFQWNYQyxJQWRXLEVBZVhDLGNBQWMsQ0FBQzBDLEdBQWYsQ0FBbUJGLEtBQUssSUFBSUEsS0FBSyxDQUFDTyxLQUFOLENBQVksR0FBWixFQUFpQixDQUFqQixFQUFvQixDQUFwQixDQUE1QixDQWZXLEVBZ0JYeEMsVUFBVSxDQUFDeUMsTUFoQkEsQ0FBYjtBQWtCRCxTQW5DRCxDQW1DRSxPQUFPbEIsQ0FBUCxFQUFVO0FBQ1Z4QixVQUFBQSxrQkFBa0IsQ0FBQ3lCLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBN0NzRCxLQUF6RDtBQStDRDtBQUNGLENBNUZEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IHBsdXJhbGl6ZSBmcm9tICdwbHVyYWxpemUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NRdWVyeUNvbmZpZyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy5xdWVyeSkgfHwge307XG59O1xuXG5jb25zdCBnZXRRdWVyeSA9IGFzeW5jIChjbGFzc05hbWUsIF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykgPT4ge1xuICBjb25zdCB7IGlkLCBvcHRpb25zIH0gPSBhcmdzO1xuICBjb25zdCB7IHJlYWRQcmVmZXJlbmNlLCBpbmNsdWRlUmVhZFByZWZlcmVuY2UgfSA9IG9wdGlvbnMgfHwge307XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG5cbiAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICBjbGFzc05hbWUsXG4gICAgaWQsXG4gICAga2V5cyxcbiAgICBpbmNsdWRlLFxuICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBpbmZvXG4gICk7XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24oXG4gIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGdldDogaXNHZXRFbmFibGVkID0gdHJ1ZSxcbiAgICBmaW5kOiBpc0ZpbmRFbmFibGVkID0gdHJ1ZSxcbiAgfSA9IGdldFBhcnNlQ2xhc3NRdWVyeUNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNHZXRFbmFibGVkKSB7XG4gICAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9XG4gICAgICBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KGdldEdyYXBoUUxRdWVyeU5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0gcXVlcnkgY2FuIGJlIHVzZWQgdG8gZ2V0IGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBieSBpdHMgaWQuYCxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGdldFF1ZXJ5KGNsYXNzTmFtZSwgX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc0ZpbmRFbmFibGVkKSB7XG4gICAgY29uc3QgZmluZEdyYXBoUUxRdWVyeU5hbWUgPSBwbHVyYWxpemUoXG4gICAgICBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKVxuICAgICk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShmaW5kR3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtmaW5kR3JhcGhRTFF1ZXJ5TmFtZX0gcXVlcnkgY2FuIGJlIHVzZWQgdG8gZmluZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBhcmdzOiBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5GSU5EX1JFU1VMVFxuICAgICAgKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyB3aGVyZSwgb3JkZXIsIHNraXAsIGxpbWl0LCBvcHRpb25zIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5pbmNsdWRlcygnLicpKVxuICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnNsaWNlKGZpZWxkLmluZGV4T2YoJy4nKSArIDEpKVxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgcGFyc2VPcmRlciA9IG9yZGVyICYmIG9yZGVyLmpvaW4oJywnKTtcblxuICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgcGFyc2VPcmRlcixcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzLm1hcChmaWVsZCA9PiBmaWVsZC5zcGxpdCgnLicsIDEpWzBdKSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19