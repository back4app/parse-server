"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformConstraintTypeToGraphQL = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLRelationConstraintsType) {
        return parseClassTypes[targetClass].classGraphQLRelationConstraintsType;
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
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLRelationConstraintsType) {
        return parseClassTypes[targetClass].classGraphQLRelationConstraintsType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    default:
      return undefined;
  }
};

exports.transformConstraintTypeToGraphQL = transformConstraintTypeToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTCIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiZmllbGROYW1lIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIklEX1dIRVJFX0lOUFVUIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiT0JKRUNUX1dIRVJFX0lOUFVUIiwiREFURV9XSEVSRV9JTlBVVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlIiwiT0JKRUNUIiwiRklMRV9XSEVSRV9JTlBVVCIsIkdFT19QT0lOVF9XSEVSRV9JTlBVVCIsIlBPTFlHT05fV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsInVuZGVmaW5lZCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9jb25zdHJhaW50VHlwZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMID0gKHBhcnNlVHlwZSwgdGFyZ2V0Q2xhc3MsIHBhcnNlQ2xhc3NUeXBlcywgZmllbGROYW1lKSA9PiB7XG4gIGlmIChmaWVsZE5hbWUgPT09ICdpZCcgfHwgZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuSURfV0hFUkVfSU5QVVQ7XG4gIH1cblxuICBzd2l0Y2ggKHBhcnNlVHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5TVFJJTkdfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk5VTUJFUl9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJPT0xFQU5fV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQVJSQVlfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEVfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuZXhwb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOzs7Ozs7QUFFQSxNQUFNQSxnQ0FBZ0MsR0FBRyxDQUFDQyxTQUFELEVBQVlDLFdBQVosRUFBeUJDLGVBQXpCLEVBQTBDQyxTQUExQyxLQUF3RDtFQUMvRixJQUFJQSxTQUFTLEtBQUssSUFBZCxJQUFzQkEsU0FBUyxLQUFLLFVBQXhDLEVBQW9EO0lBQ2xELE9BQU9DLG1CQUFtQixDQUFDQyxjQUEzQjtFQUNEOztFQUVELFFBQVFMLFNBQVI7SUFDRSxLQUFLLFFBQUw7TUFDRSxPQUFPSSxtQkFBbUIsQ0FBQ0Usa0JBQTNCOztJQUNGLEtBQUssUUFBTDtNQUNFLE9BQU9GLG1CQUFtQixDQUFDRyxrQkFBM0I7O0lBQ0YsS0FBSyxTQUFMO01BQ0UsT0FBT0gsbUJBQW1CLENBQUNJLG1CQUEzQjs7SUFDRixLQUFLLE9BQUw7TUFDRSxPQUFPSixtQkFBbUIsQ0FBQ0ssaUJBQTNCOztJQUNGLEtBQUssUUFBTDtNQUNFLE9BQU9MLG1CQUFtQixDQUFDTSxrQkFBM0I7O0lBQ0YsS0FBSyxNQUFMO01BQ0UsT0FBT04sbUJBQW1CLENBQUNPLGdCQUEzQjs7SUFDRixLQUFLLFNBQUw7TUFDRSxJQUNFVCxlQUFlLENBQUNELFdBQUQsQ0FBZixJQUNBQyxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsbUNBRi9CLEVBR0U7UUFDQSxPQUFPVixlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsbUNBQXBDO01BQ0QsQ0FMRCxNQUtPO1FBQ0wsT0FBT1IsbUJBQW1CLENBQUNTLE1BQTNCO01BQ0Q7O0lBQ0gsS0FBSyxNQUFMO01BQ0UsT0FBT1QsbUJBQW1CLENBQUNVLGdCQUEzQjs7SUFDRixLQUFLLFVBQUw7TUFDRSxPQUFPVixtQkFBbUIsQ0FBQ1cscUJBQTNCOztJQUNGLEtBQUssU0FBTDtNQUNFLE9BQU9YLG1CQUFtQixDQUFDWSxtQkFBM0I7O0lBQ0YsS0FBSyxPQUFMO01BQ0UsT0FBT1osbUJBQW1CLENBQUNhLGlCQUEzQjs7SUFDRixLQUFLLEtBQUw7TUFDRSxPQUFPYixtQkFBbUIsQ0FBQ00sa0JBQTNCOztJQUNGLEtBQUssVUFBTDtNQUNFLElBQ0VSLGVBQWUsQ0FBQ0QsV0FBRCxDQUFmLElBQ0FDLGVBQWUsQ0FBQ0QsV0FBRCxDQUFmLENBQTZCVyxtQ0FGL0IsRUFHRTtRQUNBLE9BQU9WLGVBQWUsQ0FBQ0QsV0FBRCxDQUFmLENBQTZCVyxtQ0FBcEM7TUFDRCxDQUxELE1BS087UUFDTCxPQUFPUixtQkFBbUIsQ0FBQ1MsTUFBM0I7TUFDRDs7SUFDSDtNQUNFLE9BQU9LLFNBQVA7RUExQ0o7QUE0Q0QsQ0FqREQifQ==