"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformConstraintTypeToGraphQL = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const transformConstraintTypeToGraphQL = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_WHERE_INPUT;

    case 'Number':
      return defaultGraphQLTypes.NUMBER_WHERE_INPUT;

    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_WHERE_INPUT;

    case 'Array':
      return defaultGraphQLTypes.ARRAY_WHERE_INPUT;

    case 'Object':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;

    case 'Date':
      return defaultGraphQLTypes.DATE_WHERE_INPUT;

    case 'Pointer':
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLConstraintType) {
        return parseClassTypes[targetClass].classGraphQLConstraintType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE_WHERE_INPUT;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_WHERE_INPUT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_WHERE_INPUT;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES_WHERE_INPUT;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;

    case 'Relation':
    default:
      return undefined;
  }
};

exports.transformConstraintTypeToGraphQL = transformConstraintTypeToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9jb25zdHJhaW50VHlwZS5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTCIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIlNUUklOR19XSEVSRV9JTlBVVCIsIk5VTUJFUl9XSEVSRV9JTlBVVCIsIkJPT0xFQU5fV0hFUkVfSU5QVVQiLCJBUlJBWV9XSEVSRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZSIsIk9CSkVDVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJQT0xZR09OX1dIRVJFX0lOUFVUIiwiQllURVNfV0hFUkVfSU5QVVQiLCJ1bmRlZmluZWQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7Ozs7O0FBRUEsTUFBTUEsZ0NBQWdDLEdBQUcsQ0FDdkNDLFNBRHVDLEVBRXZDQyxXQUZ1QyxFQUd2Q0MsZUFIdUMsS0FJcEM7QUFDSCxVQUFRRixTQUFSO0FBQ0UsU0FBSyxRQUFMO0FBQ0UsYUFBT0csbUJBQW1CLENBQUNDLGtCQUEzQjs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPRCxtQkFBbUIsQ0FBQ0Usa0JBQTNCOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9GLG1CQUFtQixDQUFDRyxtQkFBM0I7O0FBQ0YsU0FBSyxPQUFMO0FBQ0UsYUFBT0gsbUJBQW1CLENBQUNJLGlCQUEzQjs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPSixtQkFBbUIsQ0FBQ0ssa0JBQTNCOztBQUNGLFNBQUssTUFBTDtBQUNFLGFBQU9MLG1CQUFtQixDQUFDTSxnQkFBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsVUFDRVAsZUFBZSxDQUFDRCxXQUFELENBQWYsSUFDQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJTLDBCQUYvQixFQUdFO0FBQ0EsZUFBT1IsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJTLDBCQUFwQztBQUNELE9BTEQsTUFLTztBQUNMLGVBQU9QLG1CQUFtQixDQUFDUSxNQUEzQjtBQUNEOztBQUNILFNBQUssTUFBTDtBQUNFLGFBQU9SLG1CQUFtQixDQUFDUyxnQkFBM0I7O0FBQ0YsU0FBSyxVQUFMO0FBQ0UsYUFBT1QsbUJBQW1CLENBQUNVLHFCQUEzQjs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPVixtQkFBbUIsQ0FBQ1csbUJBQTNCOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU9YLG1CQUFtQixDQUFDWSxpQkFBM0I7O0FBQ0YsU0FBSyxLQUFMO0FBQ0UsYUFBT1osbUJBQW1CLENBQUNLLGtCQUEzQjs7QUFDRixTQUFLLFVBQUw7QUFDQTtBQUNFLGFBQU9RLFNBQVA7QUFsQ0o7QUFvQ0QsQ0F6Q0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMID0gKFxuICBwYXJzZVR5cGUsXG4gIHRhcmdldENsYXNzLFxuICBwYXJzZUNsYXNzVHlwZXNcbikgPT4ge1xuICBzd2l0Y2ggKHBhcnNlVHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5TVFJJTkdfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk5VTUJFUl9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJPT0xFQU5fV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQVJSQVlfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEVfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTCB9O1xuIl19