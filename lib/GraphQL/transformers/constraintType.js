"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformConstraintTypeToGraphQL = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const transformConstraintTypeToGraphQL = (parseType, targetClass, parseClassTypes, fieldName) => {
  if (fieldName === 'id' || fieldName === 'objectId') {
    return defaultGraphQLTypes.ID_WHERE_INPUT;
  }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9jb25zdHJhaW50VHlwZS5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTCIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiZmllbGROYW1lIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIklEX1dIRVJFX0lOUFVUIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiT0JKRUNUX1dIRVJFX0lOUFVUIiwiREFURV9XSEVSRV9JTlBVVCIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlIiwiT0JKRUNUIiwiRklMRV9XSEVSRV9JTlBVVCIsIkdFT19QT0lOVF9XSEVSRV9JTlBVVCIsIlBPTFlHT05fV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsInVuZGVmaW5lZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOzs7Ozs7QUFFQSxNQUFNQSxnQ0FBZ0MsR0FBRyxDQUN2Q0MsU0FEdUMsRUFFdkNDLFdBRnVDLEVBR3ZDQyxlQUh1QyxFQUl2Q0MsU0FKdUMsS0FLcEM7QUFDSCxNQUFJQSxTQUFTLEtBQUssSUFBZCxJQUFzQkEsU0FBUyxLQUFLLFVBQXhDLEVBQW9EO0FBQ2xELFdBQU9DLG1CQUFtQixDQUFDQyxjQUEzQjtBQUNEOztBQUVELFVBQVFMLFNBQVI7QUFDRSxTQUFLLFFBQUw7QUFDRSxhQUFPSSxtQkFBbUIsQ0FBQ0Usa0JBQTNCOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9GLG1CQUFtQixDQUFDRyxrQkFBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsYUFBT0gsbUJBQW1CLENBQUNJLG1CQUEzQjs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPSixtQkFBbUIsQ0FBQ0ssaUJBQTNCOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9MLG1CQUFtQixDQUFDTSxrQkFBM0I7O0FBQ0YsU0FBSyxNQUFMO0FBQ0UsYUFBT04sbUJBQW1CLENBQUNPLGdCQUEzQjs7QUFDRixTQUFLLFNBQUw7QUFDRSxVQUNFVCxlQUFlLENBQUNELFdBQUQsQ0FBZixJQUNBQyxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsMEJBRi9CLEVBR0U7QUFDQSxlQUFPVixlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsMEJBQXBDO0FBQ0QsT0FMRCxNQUtPO0FBQ0wsZUFBT1IsbUJBQW1CLENBQUNTLE1BQTNCO0FBQ0Q7O0FBQ0gsU0FBSyxNQUFMO0FBQ0UsYUFBT1QsbUJBQW1CLENBQUNVLGdCQUEzQjs7QUFDRixTQUFLLFVBQUw7QUFDRSxhQUFPVixtQkFBbUIsQ0FBQ1cscUJBQTNCOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9YLG1CQUFtQixDQUFDWSxtQkFBM0I7O0FBQ0YsU0FBSyxPQUFMO0FBQ0UsYUFBT1osbUJBQW1CLENBQUNhLGlCQUEzQjs7QUFDRixTQUFLLEtBQUw7QUFDRSxhQUFPYixtQkFBbUIsQ0FBQ00sa0JBQTNCOztBQUNGLFNBQUssVUFBTDtBQUNBO0FBQ0UsYUFBT1EsU0FBUDtBQWxDSjtBQW9DRCxDQTlDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFR5cGVzJztcblxuY29uc3QgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgPSAoXG4gIHBhcnNlVHlwZSxcbiAgdGFyZ2V0Q2xhc3MsXG4gIHBhcnNlQ2xhc3NUeXBlcyxcbiAgZmllbGROYW1lXG4pID0+IHtcbiAgaWYgKGZpZWxkTmFtZSA9PT0gJ2lkJyB8fCBmaWVsZE5hbWUgPT09ICdvYmplY3RJZCcpIHtcbiAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5JRF9XSEVSRV9JTlBVVDtcbiAgfVxuXG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNUUklOR19XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuTlVNQkVSX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQk9PTEVBTl9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5BUlJBWV9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuREFURV9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIGlmIChcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgICB9XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVF9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQllURVNfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIH07XG4iXX0=