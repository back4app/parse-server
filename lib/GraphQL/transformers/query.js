"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformQueryInputToParse = exports.transformQueryConstraintInputToParse = void 0;

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const parseQueryMap = {
  id: 'objectId',
  OR: '$or',
  AND: '$and',
  NOR: '$nor'
};
const parseConstraintMap = {
  equalTo: '$eq',
  notEqualTo: '$ne',
  lessThan: '$lt',
  lessThanOrEqualTo: '$lte',
  greaterThan: '$gt',
  greaterThanOrEqualTo: '$gte',
  in: '$in',
  notIn: '$nin',
  exists: '$exists',
  inQueryKey: '$select',
  notInQueryKey: '$dontSelect',
  inQuery: '$inQuery',
  notInQuery: '$notInQuery',
  containedBy: '$containedBy',
  contains: '$all',
  matchesRegex: '$regex',
  options: '$options',
  text: '$text',
  search: '$search',
  term: '$term',
  language: '$language',
  caseSensitive: '$caseSensitive',
  diacriticSensitive: '$diacriticSensitive',
  nearSphere: '$nearSphere',
  maxDistance: '$maxDistance',
  maxDistanceInRadians: '$maxDistanceInRadians',
  maxDistanceInMiles: '$maxDistanceInMiles',
  maxDistanceInKilometers: '$maxDistanceInKilometers',
  within: '$within',
  box: '$box',
  geoWithin: '$geoWithin',
  polygon: '$polygon',
  centerSphere: '$centerSphere',
  geoIntersects: '$geoIntersects',
  point: '$point'
};

const transformQueryConstraintInputToParse = (constraints, fields, parentFieldName, parentConstraints) => {
  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];
    /**
     * If we have a key-value pair, we need to change the way the constraint is structured.
     *
     * Example:
     *   From:
     *   {
     *     "someField": {
     *       "lessThan": {
     *         "key":"foo.bar",
     *         "value": 100
     *       },
     *       "greaterThan": {
     *         "key":"foo.bar",
     *         "value": 10
     *       }
     *     }
     *   }
     *
     *   To:
     *   {
     *     "someField.foo.bar": {
     *       "$lt": 100,
     *       "$gt": 10
     *      }
     *   }
     */

    if (fieldValue.key && fieldValue.value && parentConstraints && parentFieldName) {
      delete parentConstraints[parentFieldName];
      parentConstraints[`${parentFieldName}.${fieldValue.key}`] = _objectSpread({}, parentConstraints[`${parentFieldName}.${fieldValue.key}`], {
        [parseConstraintMap[fieldName]]: fieldValue.value
      });
    } else if (parseConstraintMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseConstraintMap[fieldName];
      constraints[fieldName] = fieldValue; // If parent field type is Pointer, changes constraint value to format expected
      // by Parse.

      if (fields[parentFieldName] && fields[parentFieldName].type === 'Pointer' && typeof fieldValue === 'string') {
        const {
          targetClass
        } = fields[parentFieldName];
        constraints[fieldName] = {
          __type: 'Pointer',
          className: targetClass,
          objectId: fieldValue
        };
      }
    }

    switch (fieldName) {
      case '$point':
      case '$nearSphere':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }

        break;

      case '$box':
        if (typeof fieldValue === 'object' && fieldValue.bottomLeft && fieldValue.upperRight) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.bottomLeft), _objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.upperRight)];
          constraints[fieldName] = fieldValue;
        }

        break;

      case '$polygon':
        if (fieldValue instanceof Array) {
          fieldValue.forEach(geoPoint => {
            if (typeof geoPoint === 'object' && !geoPoint.__type) {
              geoPoint.__type = 'GeoPoint';
            }
          });
        }

        break;

      case '$centerSphere':
        if (typeof fieldValue === 'object' && fieldValue.center && fieldValue.distance) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.center), fieldValue.distance];
          constraints[fieldName] = fieldValue;
        }

        break;
    }

    if (typeof fieldValue === 'object') {
      if (fieldName === 'where') {
        transformQueryInputToParse(fieldValue);
      } else {
        transformQueryConstraintInputToParse(fieldValue, fields, fieldName, constraints);
      }
    }
  });
};

exports.transformQueryConstraintInputToParse = transformQueryConstraintInputToParse;

const transformQueryInputToParse = (constraints, fields) => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }

  Object.keys(constraints).forEach(fieldName => {
    const fieldValue = constraints[fieldName];

    if (parseQueryMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseQueryMap[fieldName];
      constraints[fieldName] = fieldValue;

      if (fieldName !== 'objectId') {
        fieldValue.forEach(fieldValueItem => {
          transformQueryInputToParse(fieldValueItem, fields);
        });
        return;
      }
    }

    if (typeof fieldValue === 'object') {
      transformQueryConstraintInputToParse(fieldValue, fields, fieldName, constraints);
    }
  });
};

exports.transformQueryInputToParse = transformQueryInputToParse;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9xdWVyeS5qcyJdLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiaWQiLCJPUiIsIkFORCIsIk5PUiIsInBhcnNlQ29uc3RyYWludE1hcCIsImVxdWFsVG8iLCJub3RFcXVhbFRvIiwibGVzc1RoYW4iLCJsZXNzVGhhbk9yRXF1YWxUbyIsImdyZWF0ZXJUaGFuIiwiZ3JlYXRlclRoYW5PckVxdWFsVG8iLCJpbiIsIm5vdEluIiwiZXhpc3RzIiwiaW5RdWVyeUtleSIsIm5vdEluUXVlcnlLZXkiLCJpblF1ZXJ5Iiwibm90SW5RdWVyeSIsImNvbnRhaW5lZEJ5IiwiY29udGFpbnMiLCJtYXRjaGVzUmVnZXgiLCJvcHRpb25zIiwidGV4dCIsInNlYXJjaCIsInRlcm0iLCJsYW5ndWFnZSIsImNhc2VTZW5zaXRpdmUiLCJkaWFjcml0aWNTZW5zaXRpdmUiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiYm94IiwiZ2VvV2l0aGluIiwicG9seWdvbiIsImNlbnRlclNwaGVyZSIsImdlb0ludGVyc2VjdHMiLCJwb2ludCIsInRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSIsImNvbnN0cmFpbnRzIiwiZmllbGRzIiwicGFyZW50RmllbGROYW1lIiwicGFyZW50Q29uc3RyYWludHMiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImZpZWxkVmFsdWUiLCJrZXkiLCJ2YWx1ZSIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsIl9fdHlwZSIsImNsYXNzTmFtZSIsIm9iamVjdElkIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJBcnJheSIsImdlb1BvaW50IiwiY2VudGVyIiwiZGlzdGFuY2UiLCJ0cmFuc2Zvcm1RdWVyeUlucHV0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QUF1QixRQUEzQyxFQUFxRDtBQUNuRDtBQUNEOztBQUVESSxFQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWUwsV0FBWixFQUF5Qk0sT0FBekIsQ0FBaUNDLFNBQVMsSUFBSTtBQUM1QyxVQUFNQyxVQUFVLEdBQUdSLFdBQVcsQ0FBQ08sU0FBRCxDQUE5Qjs7QUFFQSxRQUFJakQsYUFBYSxDQUFDaUQsU0FBRCxDQUFqQixFQUE4QjtBQUM1QixhQUFPUCxXQUFXLENBQUNPLFNBQUQsQ0FBbEI7QUFDQUEsTUFBQUEsU0FBUyxHQUFHakQsYUFBYSxDQUFDaUQsU0FBRCxDQUF6QjtBQUNBUCxNQUFBQSxXQUFXLENBQUNPLFNBQUQsQ0FBWCxHQUF5QkMsVUFBekI7O0FBRUEsVUFBSUQsU0FBUyxLQUFLLFVBQWxCLEVBQThCO0FBQzVCQyxRQUFBQSxVQUFVLENBQUNGLE9BQVgsQ0FBbUJpQixjQUFjLElBQUk7QUFDbkNELFVBQUFBLDBCQUEwQixDQUFDQyxjQUFELEVBQWlCdEIsTUFBakIsQ0FBMUI7QUFDRCxTQUZEO0FBR0E7QUFDRDtBQUNGOztBQUVELFFBQUksT0FBT08sVUFBUCxLQUFzQixRQUExQixFQUFvQztBQUNsQ1QsTUFBQUEsb0NBQW9DLENBQ2xDUyxVQURrQyxFQUVsQ1AsTUFGa0MsRUFHbENNLFNBSGtDLEVBSWxDUCxXQUprQyxDQUFwQztBQU1EO0FBQ0YsR0F4QkQ7QUF5QkQsQ0E5QkQiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBwYXJzZVF1ZXJ5TWFwID0ge1xuICBpZDogJ29iamVjdElkJyxcbiAgT1I6ICckb3InLFxuICBBTkQ6ICckYW5kJyxcbiAgTk9SOiAnJG5vcicsXG59O1xuXG5jb25zdCBwYXJzZUNvbnN0cmFpbnRNYXAgPSB7XG4gIGVxdWFsVG86ICckZXEnLFxuICBub3RFcXVhbFRvOiAnJG5lJyxcbiAgbGVzc1RoYW46ICckbHQnLFxuICBsZXNzVGhhbk9yRXF1YWxUbzogJyRsdGUnLFxuICBncmVhdGVyVGhhbjogJyRndCcsXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiAnJGd0ZScsXG4gIGluOiAnJGluJyxcbiAgbm90SW46ICckbmluJyxcbiAgZXhpc3RzOiAnJGV4aXN0cycsXG4gIGluUXVlcnlLZXk6ICckc2VsZWN0JyxcbiAgbm90SW5RdWVyeUtleTogJyRkb250U2VsZWN0JyxcbiAgaW5RdWVyeTogJyRpblF1ZXJ5JyxcbiAgbm90SW5RdWVyeTogJyRub3RJblF1ZXJ5JyxcbiAgY29udGFpbmVkQnk6ICckY29udGFpbmVkQnknLFxuICBjb250YWluczogJyRhbGwnLFxuICBtYXRjaGVzUmVnZXg6ICckcmVnZXgnLFxuICBvcHRpb25zOiAnJG9wdGlvbnMnLFxuICB0ZXh0OiAnJHRleHQnLFxuICBzZWFyY2g6ICckc2VhcmNoJyxcbiAgdGVybTogJyR0ZXJtJyxcbiAgbGFuZ3VhZ2U6ICckbGFuZ3VhZ2UnLFxuICBjYXNlU2Vuc2l0aXZlOiAnJGNhc2VTZW5zaXRpdmUnLFxuICBkaWFjcml0aWNTZW5zaXRpdmU6ICckZGlhY3JpdGljU2Vuc2l0aXZlJyxcbiAgbmVhclNwaGVyZTogJyRuZWFyU3BoZXJlJyxcbiAgbWF4RGlzdGFuY2U6ICckbWF4RGlzdGFuY2UnLFxuICBtYXhEaXN0YW5jZUluUmFkaWFuczogJyRtYXhEaXN0YW5jZUluUmFkaWFucycsXG4gIG1heERpc3RhbmNlSW5NaWxlczogJyRtYXhEaXN0YW5jZUluTWlsZXMnLFxuICBtYXhEaXN0YW5jZUluS2lsb21ldGVyczogJyRtYXhEaXN0YW5jZUluS2lsb21ldGVycycsXG4gIHdpdGhpbjogJyR3aXRoaW4nLFxuICBib3g6ICckYm94JyxcbiAgZ2VvV2l0aGluOiAnJGdlb1dpdGhpbicsXG4gIHBvbHlnb246ICckcG9seWdvbicsXG4gIGNlbnRlclNwaGVyZTogJyRjZW50ZXJTcGhlcmUnLFxuICBnZW9JbnRlcnNlY3RzOiAnJGdlb0ludGVyc2VjdHMnLFxuICBwb2ludDogJyRwb2ludCcsXG59O1xuXG5jb25zdCB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UgPSAoXG4gIGNvbnN0cmFpbnRzLFxuICBmaWVsZHMsXG4gIHBhcmVudEZpZWxkTmFtZSxcbiAgcGFyZW50Q29uc3RyYWludHNcbikgPT4ge1xuICBPYmplY3Qua2V5cyhjb25zdHJhaW50cykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGxldCBmaWVsZFZhbHVlID0gY29uc3RyYWludHNbZmllbGROYW1lXTtcblxuICAgIC8qKlxuICAgICAqIElmIHdlIGhhdmUgYSBrZXktdmFsdWUgcGFpciwgd2UgbmVlZCB0byBjaGFuZ2UgdGhlIHdheSB0aGUgY29uc3RyYWludCBpcyBzdHJ1Y3R1cmVkLlxuICAgICAqXG4gICAgICogRXhhbXBsZTpcbiAgICAgKiAgIEZyb206XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkXCI6IHtcbiAgICAgKiAgICAgICBcImxlc3NUaGFuXCI6IHtcbiAgICAgKiAgICAgICAgIFwia2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcInZhbHVlXCI6IDEwMFxuICAgICAqICAgICAgIH0sXG4gICAgICogICAgICAgXCJncmVhdGVyVGhhblwiOiB7XG4gICAgICogICAgICAgICBcImtleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJ2YWx1ZVwiOiAxMFxuICAgICAqICAgICAgIH1cbiAgICAgKiAgICAgfVxuICAgICAqICAgfVxuICAgICAqXG4gICAgICogICBUbzpcbiAgICAgKiAgIHtcbiAgICAgKiAgICAgXCJzb21lRmllbGQuZm9vLmJhclwiOiB7XG4gICAgICogICAgICAgXCIkbHRcIjogMTAwLFxuICAgICAqICAgICAgIFwiJGd0XCI6IDEwXG4gICAgICogICAgICB9XG4gICAgICogICB9XG4gICAgICovXG4gICAgaWYgKFxuICAgICAgZmllbGRWYWx1ZS5rZXkgJiZcbiAgICAgIGZpZWxkVmFsdWUudmFsdWUgJiZcbiAgICAgIHBhcmVudENvbnN0cmFpbnRzICYmXG4gICAgICBwYXJlbnRGaWVsZE5hbWVcbiAgICApIHtcbiAgICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgcGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUua2V5fWBdID0ge1xuICAgICAgICAuLi5wYXJlbnRDb25zdHJhaW50c1tgJHtwYXJlbnRGaWVsZE5hbWV9LiR7ZmllbGRWYWx1ZS5rZXl9YF0sXG4gICAgICAgIFtwYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV06IGZpZWxkVmFsdWUudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAocGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV0pIHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgZmllbGROYW1lID0gcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcblxuICAgICAgLy8gSWYgcGFyZW50IGZpZWxkIHR5cGUgaXMgUG9pbnRlciwgY2hhbmdlcyBjb25zdHJhaW50IHZhbHVlIHRvIGZvcm1hdCBleHBlY3RlZFxuICAgICAgLy8gYnkgUGFyc2UuXG4gICAgICBpZiAoXG4gICAgICAgIGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdICYmXG4gICAgICAgIGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJlxuICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICBjb25zdCB7IHRhcmdldENsYXNzIH0gPSBmaWVsZHNbcGFyZW50RmllbGROYW1lXTtcbiAgICAgICAgY29uc3RyYWludHNbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgIG9iamVjdElkOiBmaWVsZFZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgICAgY2FzZSAnJHBvaW50JzpcbiAgICAgIGNhc2UgJyRuZWFyU3BoZXJlJzpcbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJiAhZmllbGRWYWx1ZS5fX3R5cGUpIHtcbiAgICAgICAgICBmaWVsZFZhbHVlLl9fdHlwZSA9ICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckYm94JzpcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIGZpZWxkVmFsdWUuYm90dG9tTGVmdCAmJlxuICAgICAgICAgIGZpZWxkVmFsdWUudXBwZXJSaWdodFxuICAgICAgICApIHtcbiAgICAgICAgICBmaWVsZFZhbHVlID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUuYm90dG9tTGVmdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS51cHBlclJpZ2h0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJHBvbHlnb24nOlxuICAgICAgICBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGdlb1BvaW50ID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ2VvUG9pbnQgPT09ICdvYmplY3QnICYmICFnZW9Qb2ludC5fX3R5cGUpIHtcbiAgICAgICAgICAgICAgZ2VvUG9pbnQuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRjZW50ZXJTcGhlcmUnOlxuICAgICAgICBpZiAoXG4gICAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgZmllbGRWYWx1ZS5jZW50ZXIgJiZcbiAgICAgICAgICBmaWVsZFZhbHVlLmRpc3RhbmNlXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5jZW50ZXIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZmllbGRWYWx1ZS5kaXN0YW5jZSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnd2hlcmUnKSB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKGZpZWxkVmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICBjb25zdHJhaW50c1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZSA9IChjb25zdHJhaW50cywgZmllbGRzKSA9PiB7XG4gIGlmICghY29uc3RyYWludHMgfHwgdHlwZW9mIGNvbnN0cmFpbnRzICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAocGFyc2VRdWVyeU1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIGZpZWxkTmFtZSA9IHBhcnNlUXVlcnlNYXBbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuXG4gICAgICBpZiAoZmllbGROYW1lICE9PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChmaWVsZFZhbHVlSXRlbSA9PiB7XG4gICAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZUl0ZW0sIGZpZWxkcyk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICBmaWVsZFZhbHVlLFxuICAgICAgICBmaWVsZHMsXG4gICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgY29uc3RyYWludHNcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSwgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UgfTtcbiJdfQ==