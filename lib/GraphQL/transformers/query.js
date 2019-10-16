"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformQueryInputToParse = exports.transformQueryConstraintInputToParse = void 0;

var _graphqlRelay = require("graphql-relay");

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
        let objectId = fieldValue;
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(objectId);

        if (globalIdObject.type === targetClass) {
          objectId = globalIdObject.id;
        }

        constraints[fieldName] = {
          __type: 'Pointer',
          className: targetClass,
          objectId
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

const transformQueryInputToParse = (constraints, fields, className) => {
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
          transformQueryInputToParse(fieldValueItem, fields, className);
        });
        return;
      } else if (className) {
        Object.keys(fieldValue).forEach(constraintName => {
          const constraintValue = fieldValue[constraintName];

          if (typeof constraintValue === 'string') {
            const globalIdObject = (0, _graphqlRelay.fromGlobalId)(constraintValue);

            if (globalIdObject.type === className) {
              fieldValue[constraintName] = globalIdObject.id;
            }
          } else if (Array.isArray(constraintValue)) {
            fieldValue[constraintName] = constraintValue.map(value => {
              const globalIdObject = (0, _graphqlRelay.fromGlobalId)(value);

              if (globalIdObject.type === className) {
                return globalIdObject.id;
              }

              return value;
            });
          }
        });
      }
    }

    if (typeof fieldValue === 'object') {
      transformQueryConstraintInputToParse(fieldValue, fields, fieldName, constraints);
    }
  });
};

exports.transformQueryInputToParse = transformQueryInputToParse;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9xdWVyeS5qcyJdLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiaWQiLCJPUiIsIkFORCIsIk5PUiIsInBhcnNlQ29uc3RyYWludE1hcCIsImVxdWFsVG8iLCJub3RFcXVhbFRvIiwibGVzc1RoYW4iLCJsZXNzVGhhbk9yRXF1YWxUbyIsImdyZWF0ZXJUaGFuIiwiZ3JlYXRlclRoYW5PckVxdWFsVG8iLCJpbiIsIm5vdEluIiwiZXhpc3RzIiwiaW5RdWVyeUtleSIsIm5vdEluUXVlcnlLZXkiLCJpblF1ZXJ5Iiwibm90SW5RdWVyeSIsImNvbnRhaW5lZEJ5IiwiY29udGFpbnMiLCJtYXRjaGVzUmVnZXgiLCJvcHRpb25zIiwidGV4dCIsInNlYXJjaCIsInRlcm0iLCJsYW5ndWFnZSIsImNhc2VTZW5zaXRpdmUiLCJkaWFjcml0aWNTZW5zaXRpdmUiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiYm94IiwiZ2VvV2l0aGluIiwicG9seWdvbiIsImNlbnRlclNwaGVyZSIsImdlb0ludGVyc2VjdHMiLCJwb2ludCIsInRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSIsImNvbnN0cmFpbnRzIiwiZmllbGRzIiwicGFyZW50RmllbGROYW1lIiwicGFyZW50Q29uc3RyYWludHMiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImZpZWxkVmFsdWUiLCJrZXkiLCJ2YWx1ZSIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsIm9iamVjdElkIiwiZ2xvYmFsSWRPYmplY3QiLCJfX3R5cGUiLCJjbGFzc05hbWUiLCJib3R0b21MZWZ0IiwidXBwZXJSaWdodCIsIkFycmF5IiwiZ2VvUG9pbnQiLCJjZW50ZXIiLCJkaXN0YW5jZSIsInRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlIiwiZmllbGRWYWx1ZUl0ZW0iLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRWYWx1ZSIsImlzQXJyYXkiLCJtYXAiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7Ozs7Ozs7QUFFQSxNQUFNQSxhQUFhLEdBQUc7QUFDcEJDLEVBQUFBLEVBQUUsRUFBRSxVQURnQjtBQUVwQkMsRUFBQUEsRUFBRSxFQUFFLEtBRmdCO0FBR3BCQyxFQUFBQSxHQUFHLEVBQUUsTUFIZTtBQUlwQkMsRUFBQUEsR0FBRyxFQUFFO0FBSmUsQ0FBdEI7QUFPQSxNQUFNQyxrQkFBa0IsR0FBRztBQUN6QkMsRUFBQUEsT0FBTyxFQUFFLEtBRGdCO0FBRXpCQyxFQUFBQSxVQUFVLEVBQUUsS0FGYTtBQUd6QkMsRUFBQUEsUUFBUSxFQUFFLEtBSGU7QUFJekJDLEVBQUFBLGlCQUFpQixFQUFFLE1BSk07QUFLekJDLEVBQUFBLFdBQVcsRUFBRSxLQUxZO0FBTXpCQyxFQUFBQSxvQkFBb0IsRUFBRSxNQU5HO0FBT3pCQyxFQUFBQSxFQUFFLEVBQUUsS0FQcUI7QUFRekJDLEVBQUFBLEtBQUssRUFBRSxNQVJrQjtBQVN6QkMsRUFBQUEsTUFBTSxFQUFFLFNBVGlCO0FBVXpCQyxFQUFBQSxVQUFVLEVBQUUsU0FWYTtBQVd6QkMsRUFBQUEsYUFBYSxFQUFFLGFBWFU7QUFZekJDLEVBQUFBLE9BQU8sRUFBRSxVQVpnQjtBQWF6QkMsRUFBQUEsVUFBVSxFQUFFLGFBYmE7QUFjekJDLEVBQUFBLFdBQVcsRUFBRSxjQWRZO0FBZXpCQyxFQUFBQSxRQUFRLEVBQUUsTUFmZTtBQWdCekJDLEVBQUFBLFlBQVksRUFBRSxRQWhCVztBQWlCekJDLEVBQUFBLE9BQU8sRUFBRSxVQWpCZ0I7QUFrQnpCQyxFQUFBQSxJQUFJLEVBQUUsT0FsQm1CO0FBbUJ6QkMsRUFBQUEsTUFBTSxFQUFFLFNBbkJpQjtBQW9CekJDLEVBQUFBLElBQUksRUFBRSxPQXBCbUI7QUFxQnpCQyxFQUFBQSxRQUFRLEVBQUUsV0Fy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eUM7QUFDdkMsa0JBQU1aLGNBQWMsR0FBRyxnQ0FBYVksZUFBYixDQUF2Qjs7QUFFQSxnQkFBSVosY0FBYyxDQUFDSCxJQUFmLEtBQXdCSyxTQUE1QixFQUF1QztBQUNyQ1IsY0FBQUEsVUFBVSxDQUFDaUIsY0FBRCxDQUFWLEdBQTZCWCxjQUFjLENBQUN2RCxFQUE1QztBQUNEO0FBQ0YsV0FORCxNQU1PLElBQUk0RCxLQUFLLENBQUNRLE9BQU4sQ0FBY0QsZUFBZCxDQUFKLEVBQW9DO0FBQ3pDbEIsWUFBQUEsVUFBVSxDQUFDaUIsY0FBRCxDQUFWLEdBQTZCQyxlQUFlLENBQUNFLEdBQWhCLENBQW9CbEIsS0FBSyxJQUFJO0FBQ3hELG9CQUFNSSxjQUFjLEdBQUcsZ0NBQWFKLEtBQWIsQ0FBdkI7O0FBRUEsa0JBQUlJLGNBQWMsQ0FBQ0gsSUFBZixLQUF3QkssU0FBNUIsRUFBdUM7QUFDckMsdUJBQU9GLGNBQWMsQ0FBQ3ZELEVBQXRCO0FBQ0Q7O0FBRUQscUJBQU9tRCxLQUFQO0FBQ0QsYUFSNEIsQ0FBN0I7QUFTRDtBQUNGLFNBbkJEO0FBb0JEO0FBQ0Y7O0FBRUQsUUFBSSxPQUFPRixVQUFQLEtBQXNCLFFBQTFCLEVBQW9DO0FBQ2xDVCxNQUFBQSxvQ0FBb0MsQ0FDbENTLFVBRGtDLEVBRWxDUCxNQUZrQyxFQUdsQ00sU0FIa0MsRUFJbENQLFdBSmtDLENBQXBDO0FBTUQ7QUFDRixHQTdDRDtBQThDRCxDQW5ERCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuXG5jb25zdCBwYXJzZVF1ZXJ5TWFwID0ge1xuICBpZDogJ29iamVjdElkJyxcbiAgT1I6ICckb3InLFxuICBBTkQ6ICckYW5kJyxcbiAgTk9SOiAnJG5vcicsXG59O1xuXG5jb25zdCBwYXJzZUNvbnN0cmFpbnRNYXAgPSB7XG4gIGVxdWFsVG86ICckZXEnLFxuICBub3RFcXVhbFRvOiAnJG5lJyxcbiAgbGVzc1RoYW46ICckbHQnLFxuICBsZXNzVGhhbk9yRXF1YWxUbzogJyRsdGUnLFxuICBncmVhdGVyVGhhbjogJyRndCcsXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiAnJGd0ZScsXG4gIGluOiAnJGluJyxcbiAgbm90SW46ICckbmluJyxcbiAgZXhpc3RzOiAnJGV4aXN0cycsXG4gIGluUXVlcnlLZXk6ICckc2VsZWN0JyxcbiAgbm90SW5RdWVyeUtleTogJyRkb250U2VsZWN0JyxcbiAgaW5RdWVyeTogJyRpblF1ZXJ5JyxcbiAgbm90SW5RdWVyeTogJyRub3RJblF1ZXJ5JyxcbiAgY29udGFpbmVkQnk6ICckY29udGFpbmVkQnknLFxuICBjb250YWluczogJyRhbGwnLFxuICBtYXRjaGVzUmVnZXg6ICckcmVnZXgnLFxuICBvcHRpb25zOiAnJG9wdGlvbnMnLFxuICB0ZXh0OiAnJHRleHQnLFxuICBzZWFyY2g6ICckc2VhcmNoJyxcbiAgdGVybTogJyR0ZXJtJyxcbiAgbGFuZ3VhZ2U6ICckbGFuZ3VhZ2UnLFxuICBjYXNlU2Vuc2l0aXZlOiAnJGNhc2VTZW5zaXRpdmUnLFxuICBkaWFjcml0aWNTZW5zaXRpdmU6ICckZGlhY3JpdGljU2Vuc2l0aXZlJyxcbiAgbmVhclNwaGVyZTogJyRuZWFyU3BoZXJlJyxcbiAgbWF4RGlzdGFuY2U6ICckbWF4RGlzdGFuY2UnLFxuICBtYXhEaXN0YW5jZUluUmFkaWFuczogJyRtYXhEaXN0YW5jZUluUmFkaWFucycsXG4gIG1heERpc3RhbmNlSW5NaWxlczogJyRtYXhEaXN0YW5jZUluTWlsZXMnLFxuICBtYXhEaXN0YW5jZUluS2lsb21ldGVyczogJyRtYXhEaXN0YW5jZUluS2lsb21ldGVycycsXG4gIHdpdGhpbjogJyR3aXRoaW4nLFxuICBib3g6ICckYm94JyxcbiAgZ2VvV2l0aGluOiAnJGdlb1dpdGhpbicsXG4gIHBvbHlnb246ICckcG9seWdvbicsXG4gIGNlbnRlclNwaGVyZTogJyRjZW50ZXJTcGhlcmUnLFxuICBnZW9JbnRlcnNlY3RzOiAnJGdlb0ludGVyc2VjdHMnLFxuICBwb2ludDogJyRwb2ludCcsXG59O1xuXG5jb25zdCB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UgPSAoXG4gIGNvbnN0cmFpbnRzLFxuICBmaWVsZHMsXG4gIHBhcmVudEZpZWxkTmFtZSxcbiAgcGFyZW50Q29uc3RyYWludHNcbikgPT4ge1xuICBPYmplY3Qua2V5cyhjb25zdHJhaW50cykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGxldCBmaWVsZFZhbHVlID0gY29uc3RyYWludHNbZmllbGROYW1lXTtcblxuICAgIC8qKlxuICAgICAqIElmIHdlIGhhdmUgYSBrZXktdmFsdWUgcGFpciwgd2UgbmVlZCB0byBjaGFuZ2UgdGhlIHdheSB0aGUgY29uc3RyYWludCBpcyBzdHJ1Y3R1cmVkLlxuICAgICAqXG4gICAgICogRXhhbXBsZTpcbiAgICAgKiAgIEZyb206XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkXCI6IHtcbiAgICAgKiAgICAgICBcImxlc3NUaGFuXCI6IHtcbiAgICAgKiAgICAgICAgIFwia2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcInZhbHVlXCI6IDEwMFxuICAgICAqICAgICAgIH0sXG4gICAgICogICAgICAgXCJncmVhdGVyVGhhblwiOiB7XG4gICAgICogICAgICAgICBcImtleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJ2YWx1ZVwiOiAxMFxuICAgICAqICAgICAgIH1cbiAgICAgKiAgICAgfVxuICAgICAqICAgfVxuICAgICAqXG4gICAgICogICBUbzpcbiAgICAgKiAgIHtcbiAgICAgKiAgICAgXCJzb21lRmllbGQuZm9vLmJhclwiOiB7XG4gICAgICogICAgICAgXCIkbHRcIjogMTAwLFxuICAgICAqICAgICAgIFwiJGd0XCI6IDEwXG4gICAgICogICAgICB9XG4gICAgICogICB9XG4gICAgICovXG4gICAgaWYgKFxuICAgICAgZmllbGRWYWx1ZS5rZXkgJiZcbiAgICAgIGZpZWxkVmFsdWUudmFsdWUgJiZcbiAgICAgIHBhcmVudENvbnN0cmFpbnRzICYmXG4gICAgICBwYXJlbnRGaWVsZE5hbWVcbiAgICApIHtcbiAgICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgcGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUua2V5fWBdID0ge1xuICAgICAgICAuLi5wYXJlbnRDb25zdHJhaW50c1tgJHtwYXJlbnRGaWVsZE5hbWV9LiR7ZmllbGRWYWx1ZS5rZXl9YF0sXG4gICAgICAgIFtwYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV06IGZpZWxkVmFsdWUudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAocGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV0pIHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgZmllbGROYW1lID0gcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcblxuICAgICAgLy8gSWYgcGFyZW50IGZpZWxkIHR5cGUgaXMgUG9pbnRlciwgY2hhbmdlcyBjb25zdHJhaW50IHZhbHVlIHRvIGZvcm1hdCBleHBlY3RlZFxuICAgICAgLy8gYnkgUGFyc2UuXG4gICAgICBpZiAoXG4gICAgICAgIGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdICYmXG4gICAgICAgIGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJlxuICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICBjb25zdCB7IHRhcmdldENsYXNzIH0gPSBmaWVsZHNbcGFyZW50RmllbGROYW1lXTtcbiAgICAgICAgbGV0IG9iamVjdElkID0gZmllbGRWYWx1ZTtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQob2JqZWN0SWQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gdGFyZ2V0Q2xhc3MpIHtcbiAgICAgICAgICBvYmplY3RJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICBvYmplY3RJZCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICAgIGNhc2UgJyRwb2ludCc6XG4gICAgICBjYXNlICckbmVhclNwaGVyZSc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgIWZpZWxkVmFsdWUuX190eXBlKSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5fX3R5cGUgPSAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGJveCc6XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBmaWVsZFZhbHVlLmJvdHRvbUxlZnQgJiZcbiAgICAgICAgICBmaWVsZFZhbHVlLnVwcGVyUmlnaHRcbiAgICAgICAgKSB7XG4gICAgICAgICAgZmllbGRWYWx1ZSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgICAgICAuLi5maWVsZFZhbHVlLmJvdHRvbUxlZnQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUudXBwZXJSaWdodCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRwb2x5Z29uJzpcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChnZW9Qb2ludCA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGdlb1BvaW50ID09PSAnb2JqZWN0JyAmJiAhZ2VvUG9pbnQuX190eXBlKSB7XG4gICAgICAgICAgICAgIGdlb1BvaW50Ll9fdHlwZSA9ICdHZW9Qb2ludCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckY2VudGVyU3BoZXJlJzpcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIGZpZWxkVmFsdWUuY2VudGVyICYmXG4gICAgICAgICAgZmllbGRWYWx1ZS5kaXN0YW5jZVxuICAgICAgICApIHtcbiAgICAgICAgICBmaWVsZFZhbHVlID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUuY2VudGVyLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZpZWxkVmFsdWUuZGlzdGFuY2UsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ3doZXJlJykge1xuICAgICAgICB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZShmaWVsZFZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZShcbiAgICAgICAgICBmaWVsZFZhbHVlLFxuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgY29uc3RyYWludHNcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UgPSAoY29uc3RyYWludHMsIGZpZWxkcywgY2xhc3NOYW1lKSA9PiB7XG4gIGlmICghY29uc3RyYWludHMgfHwgdHlwZW9mIGNvbnN0cmFpbnRzICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAocGFyc2VRdWVyeU1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIGZpZWxkTmFtZSA9IHBhcnNlUXVlcnlNYXBbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuXG4gICAgICBpZiAoZmllbGROYW1lICE9PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChmaWVsZFZhbHVlSXRlbSA9PiB7XG4gICAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZUl0ZW0sIGZpZWxkcywgY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NOYW1lKSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkVmFsdWUpLmZvckVhY2goY29uc3RyYWludE5hbWUgPT4ge1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRWYWx1ZSA9IGZpZWxkVmFsdWVbY29uc3RyYWludE5hbWVdO1xuICAgICAgICAgIGlmICh0eXBlb2YgY29uc3RyYWludFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoY29uc3RyYWludFZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgICBmaWVsZFZhbHVlW2NvbnN0cmFpbnROYW1lXSA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShjb25zdHJhaW50VmFsdWUpKSB7XG4gICAgICAgICAgICBmaWVsZFZhbHVlW2NvbnN0cmFpbnROYW1lXSA9IGNvbnN0cmFpbnRWYWx1ZS5tYXAodmFsdWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZCh2YWx1ZSk7XG5cbiAgICAgICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICBmaWVsZFZhbHVlLFxuICAgICAgICBmaWVsZHMsXG4gICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgY29uc3RyYWludHNcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSwgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UgfTtcbiJdfQ==