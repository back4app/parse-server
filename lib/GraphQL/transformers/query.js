"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformQueryInputToParse = void 0;

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const parseMap = {
  _or: '$or',
  _and: '$and',
  _nor: '$nor',
  _relatedTo: '$relatedTo',
  _eq: '$eq',
  _ne: '$ne',
  _lt: '$lt',
  _lte: '$lte',
  _gt: '$gt',
  _gte: '$gte',
  _in: '$in',
  _nin: '$nin',
  _exists: '$exists',
  _select: '$select',
  _dontSelect: '$dontSelect',
  _inQuery: '$inQuery',
  _notInQuery: '$notInQuery',
  _containedBy: '$containedBy',
  _all: '$all',
  _regex: '$regex',
  _options: '$options',
  _text: '$text',
  _search: '$search',
  _term: '$term',
  _language: '$language',
  _caseSensitive: '$caseSensitive',
  _diacriticSensitive: '$diacriticSensitive',
  _nearSphere: '$nearSphere',
  _maxDistance: '$maxDistance',
  _maxDistanceInRadians: '$maxDistanceInRadians',
  _maxDistanceInMiles: '$maxDistanceInMiles',
  _maxDistanceInKilometers: '$maxDistanceInKilometers',
  _within: '$within',
  _box: '$box',
  _geoWithin: '$geoWithin',
  _polygon: '$polygon',
  _centerSphere: '$centerSphere',
  _geoIntersects: '$geoIntersects',
  _point: '$point'
};

const transformQueryInputToParse = (constraints, parentFieldName, parentConstraints) => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }

  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];
    /**
     * If we have a key-value pair, we need to change the way the constraint is structured.
     *
     * Example:
     *   From:
     *   {
     *     "someField": {
     *       "_lt": {
     *         "_key":"foo.bar",
     *         "_value": 100
     *       },
     *       "_gt": {
     *         "_key":"foo.bar",
     *         "_value": 10
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

    if (fieldValue._key && fieldValue._value && parentConstraints && parentFieldName) {
      delete parentConstraints[parentFieldName];
      parentConstraints[`${parentFieldName}.${fieldValue._key}`] = _objectSpread({}, parentConstraints[`${parentFieldName}.${fieldValue._key}`], {
        [parseMap[fieldName]]: fieldValue._value
      });
    } else if (parseMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseMap[fieldName];
      constraints[fieldName] = fieldValue;
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
      transformQueryInputToParse(fieldValue, fieldName, constraints);
    }
  });
};

exports.transformQueryInputToParse = transformQueryInputToParse;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9xdWVyeS5qcyJdLCJuYW1lcyI6WyJwYXJzZU1hcCIsIl9vciIsIl9hbmQiLCJfbm9yIiwiX3JlbGF0ZWRUbyIsIl9lcSIsIl9uZSIsIl9sdCIsIl9sdGUiLCJfZ3QiLCJfZ3RlIiwiX2luIiwiX25pbiIsIl9leGlzdHMiLCJfc2VsZWN0IiwiX2RvbnRTZWxlY3QiLCJfaW5RdWVyeSIsIl9ub3RJblF1ZXJ5IiwiX2NvbnRhaW5lZEJ5IiwiX2FsbCIsIl9yZWdleCIsIl9vcHRpb25zIiwiX3RleHQiLCJfc2VhcmNoIiwiX3Rlcm0iLCJfbGFuZ3VhZ2UiLCJfY2FzZVNlbnNpdGl2ZSIsIl9kaWFjcml0aWNTZW5zaXRpdmUiLCJfbmVhclNwaGVyZSIsIl9tYXhEaXN0YW5jZSIsIl9tYXhEaXN0YW5jZUluUmFkaWFucyIsIl9tYXhEaXN0YW5jZUluTWlsZXMiLCJfbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMiLCJfd2l0aGluIiwiX2JveCIsIl9nZW9XaXRoaW4iLCJfcG9seWdvbiIsIl9jZW50ZXJTcGhlcmUiLCJfZ2VvSW50ZXJzZWN0cyIsIl9wb2ludCIsInRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlIiwiY29uc3RyYWludHMiLCJwYXJlbnRGaWVsZE5hbWUiLCJwYXJlbnRDb25zdHJhaW50cyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwiZmllbGROYW1lIiwiZmllbGRWYWx1ZSIsIl9rZXkiLCJfdmFsdWUiLCJfX3R5cGUiLCJib3R0b21MZWZ0IiwidXBwZXJSaWdodCIsIkFycmF5IiwiZ2VvUG9pbnQiLCJjZW50ZXIiLCJkaXN0YW5jZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7OztBQUFBLE1BQU1BLFFBQVEsR0FBRztBQUNmQyxFQUFBQSxHQUFHLEVBQUUsS0FEVTtBQUVmQyxFQUFBQSxJQUFJLEVBQUUsTUFGUztBQUdmQyxFQUFBQSxJQUFJLEVBQUUsTUFIUztBQUlmQyxFQUFBQSxV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QUFELENBQVgsR0FBeUJDLFVBQXpCO0FBQ0Q7O0FBQ0Q7QUFsREo7O0FBb0RBLFFBQUksT0FBT0EsVUFBUCxLQUFzQixRQUExQixFQUFvQztBQUNsQ1IsTUFBQUEsMEJBQTBCLENBQUNRLFVBQUQsRUFBYUQsU0FBYixFQUF3Qk4sV0FBeEIsQ0FBMUI7QUFDRDtBQUNGLEdBcEdEO0FBcUdELENBN0dEIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgcGFyc2VNYXAgPSB7XG4gIF9vcjogJyRvcicsXG4gIF9hbmQ6ICckYW5kJyxcbiAgX25vcjogJyRub3InLFxuICBfcmVsYXRlZFRvOiAnJHJlbGF0ZWRUbycsXG4gIF9lcTogJyRlcScsXG4gIF9uZTogJyRuZScsXG4gIF9sdDogJyRsdCcsXG4gIF9sdGU6ICckbHRlJyxcbiAgX2d0OiAnJGd0JyxcbiAgX2d0ZTogJyRndGUnLFxuICBfaW46ICckaW4nLFxuICBfbmluOiAnJG5pbicsXG4gIF9leGlzdHM6ICckZXhpc3RzJyxcbiAgX3NlbGVjdDogJyRzZWxlY3QnLFxuICBfZG9udFNlbGVjdDogJyRkb250U2VsZWN0JyxcbiAgX2luUXVlcnk6ICckaW5RdWVyeScsXG4gIF9ub3RJblF1ZXJ5OiAnJG5vdEluUXVlcnknLFxuICBfY29udGFpbmVkQnk6ICckY29udGFpbmVkQnknLFxuICBfYWxsOiAnJGFsbCcsXG4gIF9yZWdleDogJyRyZWdleCcsXG4gIF9vcHRpb25zOiAnJG9wdGlvbnMnLFxuICBfdGV4dDogJyR0ZXh0JyxcbiAgX3NlYXJjaDogJyRzZWFyY2gnLFxuICBfdGVybTogJyR0ZXJtJyxcbiAgX2xhbmd1YWdlOiAnJGxhbmd1YWdlJyxcbiAgX2Nhc2VTZW5zaXRpdmU6ICckY2FzZVNlbnNpdGl2ZScsXG4gIF9kaWFjcml0aWNTZW5zaXRpdmU6ICckZGlhY3JpdGljU2Vuc2l0aXZlJyxcbiAgX25lYXJTcGhlcmU6ICckbmVhclNwaGVyZScsXG4gIF9tYXhEaXN0YW5jZTogJyRtYXhEaXN0YW5jZScsXG4gIF9tYXhEaXN0YW5jZUluUmFkaWFuczogJyRtYXhEaXN0YW5jZUluUmFkaWFucycsXG4gIF9tYXhEaXN0YW5jZUluTWlsZXM6ICckbWF4RGlzdGFuY2VJbk1pbGVzJyxcbiAgX21heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJyxcbiAgX3dpdGhpbjogJyR3aXRoaW4nLFxuICBfYm94OiAnJGJveCcsXG4gIF9nZW9XaXRoaW46ICckZ2VvV2l0aGluJyxcbiAgX3BvbHlnb246ICckcG9seWdvbicsXG4gIF9jZW50ZXJTcGhlcmU6ICckY2VudGVyU3BoZXJlJyxcbiAgX2dlb0ludGVyc2VjdHM6ICckZ2VvSW50ZXJzZWN0cycsXG4gIF9wb2ludDogJyRwb2ludCcsXG59O1xuXG5jb25zdCB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZSA9IChcbiAgY29uc3RyYWludHMsXG4gIHBhcmVudEZpZWxkTmFtZSxcbiAgcGFyZW50Q29uc3RyYWludHNcbikgPT4ge1xuICBpZiAoIWNvbnN0cmFpbnRzIHx8IHR5cGVvZiBjb25zdHJhaW50cyAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgT2JqZWN0LmtleXMoY29uc3RyYWludHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBsZXQgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG5cbiAgICAvKipcbiAgICAgKiBJZiB3ZSBoYXZlIGEga2V5LXZhbHVlIHBhaXIsIHdlIG5lZWQgdG8gY2hhbmdlIHRoZSB3YXkgdGhlIGNvbnN0cmFpbnQgaXMgc3RydWN0dXJlZC5cbiAgICAgKlxuICAgICAqIEV4YW1wbGU6XG4gICAgICogICBGcm9tOlxuICAgICAqICAge1xuICAgICAqICAgICBcInNvbWVGaWVsZFwiOiB7XG4gICAgICogICAgICAgXCJfbHRcIjoge1xuICAgICAqICAgICAgICAgXCJfa2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcIl92YWx1ZVwiOiAxMDBcbiAgICAgKiAgICAgICB9LFxuICAgICAqICAgICAgIFwiX2d0XCI6IHtcbiAgICAgKiAgICAgICAgIFwiX2tleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJfdmFsdWVcIjogMTBcbiAgICAgKiAgICAgICB9XG4gICAgICogICAgIH1cbiAgICAgKiAgIH1cbiAgICAgKlxuICAgICAqICAgVG86XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkLmZvby5iYXJcIjoge1xuICAgICAqICAgICAgIFwiJGx0XCI6IDEwMCxcbiAgICAgKiAgICAgICBcIiRndFwiOiAxMFxuICAgICAqICAgICAgfVxuICAgICAqICAgfVxuICAgICAqL1xuICAgIGlmIChcbiAgICAgIGZpZWxkVmFsdWUuX2tleSAmJlxuICAgICAgZmllbGRWYWx1ZS5fdmFsdWUgJiZcbiAgICAgIHBhcmVudENvbnN0cmFpbnRzICYmXG4gICAgICBwYXJlbnRGaWVsZE5hbWVcbiAgICApIHtcbiAgICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgcGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUuX2tleX1gXSA9IHtcbiAgICAgICAgLi4ucGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUuX2tleX1gXSxcbiAgICAgICAgW3BhcnNlTWFwW2ZpZWxkTmFtZV1dOiBmaWVsZFZhbHVlLl92YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChwYXJzZU1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIGZpZWxkTmFtZSA9IHBhcnNlTWFwW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICB9XG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICAgIGNhc2UgJyRwb2ludCc6XG4gICAgICBjYXNlICckbmVhclNwaGVyZSc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgIWZpZWxkVmFsdWUuX190eXBlKSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5fX3R5cGUgPSAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGJveCc6XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBmaWVsZFZhbHVlLmJvdHRvbUxlZnQgJiZcbiAgICAgICAgICBmaWVsZFZhbHVlLnVwcGVyUmlnaHRcbiAgICAgICAgKSB7XG4gICAgICAgICAgZmllbGRWYWx1ZSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgICAgICAuLi5maWVsZFZhbHVlLmJvdHRvbUxlZnQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUudXBwZXJSaWdodCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRwb2x5Z29uJzpcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChnZW9Qb2ludCA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGdlb1BvaW50ID09PSAnb2JqZWN0JyAmJiAhZ2VvUG9pbnQuX190eXBlKSB7XG4gICAgICAgICAgICAgIGdlb1BvaW50Ll9fdHlwZSA9ICdHZW9Qb2ludCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckY2VudGVyU3BoZXJlJzpcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIGZpZWxkVmFsdWUuY2VudGVyICYmXG4gICAgICAgICAgZmllbGRWYWx1ZS5kaXN0YW5jZVxuICAgICAgICApIHtcbiAgICAgICAgICBmaWVsZFZhbHVlID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUuY2VudGVyLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZpZWxkVmFsdWUuZGlzdGFuY2UsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZSwgZmllbGROYW1lLCBjb25zdHJhaW50cyk7XG4gICAgfVxuICB9KTtcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlIH07XG4iXX0=