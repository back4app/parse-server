"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformOutputTypeToGraphQL = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var _graphql = require("graphql");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const transformOutputTypeToGraphQL = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return _graphql.GraphQLString;

    case 'Number':
      return _graphql.GraphQLFloat;

    case 'Boolean':
      return _graphql.GraphQLBoolean;

    case 'Array':
      return new _graphql.GraphQLList(defaultGraphQLTypes.ARRAY_RESULT);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes && parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLOutputType) {
        return parseClassTypes[targetClass].classGraphQLOutputType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes && parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLFindResultType) {
        return new _graphql.GraphQLNonNull(parseClassTypes[targetClass].classGraphQLFindResultType);
      } else {
        return new _graphql.GraphQLNonNull(defaultGraphQLTypes.OBJECT);
      }

    case 'File':
      return defaultGraphQLTypes.FILE_INFO;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES;

    case 'ACL':
      return defaultGraphQLTypes.ACL;

    default:
      return undefined;
  }
};

exports.transformOutputTypeToGraphQL = transformOutputTypeToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlLmpzIl0sIm5hbWVzIjpbInRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwiLCJwYXJzZVR5cGUiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsIkdyYXBoUUxTdHJpbmciLCJHcmFwaFFMRmxvYXQiLCJHcmFwaFFMQm9vbGVhbiIsIkdyYXBoUUxMaXN0IiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkFSUkFZX1JFU1VMVCIsIk9CSkVDVCIsIkRBVEUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkZJTEVfSU5GTyIsIkdFT19QT0lOVCIsIlBPTFlHT04iLCJCWVRFUyIsIkFDTCIsInVuZGVmaW5lZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7QUFRQSxNQUFNQSw0QkFBNEIsR0FBRyxDQUNuQ0MsU0FEbUMsRUFFbkNDLFdBRm1DLEVBR25DQyxlQUhtQyxLQUloQztBQUNILFVBQVFGLFNBQVI7QUFDRSxTQUFLLFFBQUw7QUFDRSxhQUFPRyxzQkFBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPQyxxQkFBUDs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPQyx1QkFBUDs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPLElBQUlDLG9CQUFKLENBQWdCQyxtQkFBbUIsQ0FBQ0MsWUFBcEMsQ0FBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPRCxtQkFBbUIsQ0FBQ0UsTUFBM0I7O0FBQ0YsU0FBSyxNQUFMO0FBQ0UsYUFBT0YsbUJBQW1CLENBQUNHLElBQTNCOztBQUNGLFNBQUssU0FBTDtBQUNFLFVBQ0VSLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFELENBRGYsSUFFQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJVLHNCQUgvQixFQUlFO0FBQ0EsZUFBT1QsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJVLHNCQUFwQztBQUNELE9BTkQsTUFNTztBQUNMLGVBQU9KLG1CQUFtQixDQUFDRSxNQUEzQjtBQUNEOztBQUNILFNBQUssVUFBTDtBQUNFLFVBQ0VQLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFELENBRGYsSUFFQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJXLDBCQUgvQixFQUlFO0FBQ0EsZUFBTyxJQUFJQyx1QkFBSixDQUNMWCxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsMEJBRHhCLENBQVA7QUFHRCxPQVJELE1BUU87QUFDTCxlQUFPLElBQUlDLHVCQUFKLENBQW1CTixtQkFBbUIsQ0FBQ0UsTUFBdkMsQ0FBUDtBQUNEOztBQUNILFNBQUssTUFBTDtBQUNFLGFBQU9GLG1CQUFtQixDQUFDTyxTQUEzQjs7QUFDRixTQUFLLFVBQUw7QUFDRSxhQUFPUCxtQkFBbUIsQ0FBQ1EsU0FBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsYUFBT1IsbUJBQW1CLENBQUNTLE9BQTNCOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU9ULG1CQUFtQixDQUFDVSxLQUEzQjs7QUFDRixTQUFLLEtBQUw7QUFDRSxhQUFPVixtQkFBbUIsQ0FBQ1csR0FBM0I7O0FBQ0Y7QUFDRSxhQUFPQyxTQUFQO0FBOUNKO0FBZ0RELENBckREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHtcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxOb25OdWxsLFxufSBmcm9tICdncmFwaHFsJztcblxuY29uc3QgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCA9IChcbiAgcGFyc2VUeXBlLFxuICB0YXJnZXRDbGFzcyxcbiAgcGFyc2VDbGFzc1R5cGVzXG4pID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFSUkFZX1JFU1VMVCk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcyAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgICB9XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXMgJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKTtcbiAgICAgIH1cbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0w7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwgfTtcbiJdfQ==