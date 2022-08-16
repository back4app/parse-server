"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformQueryInputToParse = exports.transformQueryConstraintInputToParse = void 0;

var _graphqlRelay = require("graphql-relay");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const parseQueryMap = {
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

const transformQueryConstraintInputToParse = (constraints, parentFieldName, className, parentConstraints, parseClasses) => {
  const fields = parseClasses[className].fields;

  if (parentFieldName === 'id' && className) {
    Object.keys(constraints).forEach(constraintName => {
      const constraintValue = constraints[constraintName];

      if (typeof constraintValue === 'string') {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(constraintValue);

        if (globalIdObject.type === className) {
          constraints[constraintName] = globalIdObject.id;
        }
      } else if (Array.isArray(constraintValue)) {
        constraints[constraintName] = constraintValue.map(value => {
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(value);

          if (globalIdObject.type === className) {
            return globalIdObject.id;
          }

          return value;
        });
      }
    });
    parentConstraints.objectId = constraints;
    delete parentConstraints.id;
  }

  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];

    if (parseConstraintMap[fieldName]) {
      constraints[parseConstraintMap[fieldName]] = constraints[fieldName];
      delete constraints[fieldName];
    }
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
      parentConstraints[`${parentFieldName}.${fieldValue.key}`] = _objectSpread(_objectSpread({}, parentConstraints[`${parentFieldName}.${fieldValue.key}`]), {}, {
        [parseConstraintMap[fieldName]]: fieldValue.value
      });
    } else if (fields[parentFieldName] && (fields[parentFieldName].type === 'Pointer' || fields[parentFieldName].type === 'Relation')) {
      const {
        targetClass
      } = fields[parentFieldName];

      if (fieldName === 'exists') {
        if (fields[parentFieldName].type === 'Relation') {
          const whereTarget = fieldValue ? 'where' : 'notWhere';

          if (constraints[whereTarget]) {
            if (constraints[whereTarget].objectId) {
              constraints[whereTarget].objectId = _objectSpread(_objectSpread({}, constraints[whereTarget].objectId), {}, {
                $exists: fieldValue
              });
            } else {
              constraints[whereTarget].objectId = {
                $exists: fieldValue
              };
            }
          } else {
            const parseWhereTarget = fieldValue ? '$inQuery' : '$notInQuery';
            parentConstraints[parentFieldName][parseWhereTarget] = {
              where: {
                objectId: {
                  $exists: true
                }
              },
              className: targetClass
            };
          }

          delete constraints.$exists;
        } else {
          parentConstraints[parentFieldName].$exists = fieldValue;
        }

        return;
      }

      switch (fieldName) {
        case 'have':
          parentConstraints[parentFieldName].$inQuery = {
            where: fieldValue,
            className: targetClass
          };
          transformQueryInputToParse(parentConstraints[parentFieldName].$inQuery.where, targetClass, parseClasses);
          break;

        case 'haveNot':
          parentConstraints[parentFieldName].$notInQuery = {
            where: fieldValue,
            className: targetClass
          };
          transformQueryInputToParse(parentConstraints[parentFieldName].$notInQuery.where, targetClass, parseClasses);
          break;
      }

      delete constraints[fieldName];
      return;
    }

    switch (fieldName) {
      case 'point':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }

        break;

      case 'nearSphere':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }

        break;

      case 'box':
        if (typeof fieldValue === 'object' && fieldValue.bottomLeft && fieldValue.upperRight) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.bottomLeft), _objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.upperRight)];
          constraints[parseConstraintMap[fieldName]] = fieldValue;
        }

        break;

      case 'polygon':
        if (fieldValue instanceof Array) {
          fieldValue.forEach(geoPoint => {
            if (typeof geoPoint === 'object' && !geoPoint.__type) {
              geoPoint.__type = 'GeoPoint';
            }
          });
        }

        break;

      case 'centerSphere':
        if (typeof fieldValue === 'object' && fieldValue.center && fieldValue.distance) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.center), fieldValue.distance];
          constraints[parseConstraintMap[fieldName]] = fieldValue;
        }

        break;
    }

    if (typeof fieldValue === 'object') {
      if (fieldName === 'where') {
        transformQueryInputToParse(fieldValue, className, parseClasses);
      } else {
        transformQueryConstraintInputToParse(fieldValue, fieldName, className, constraints, parseClasses);
      }
    }
  });
};

exports.transformQueryConstraintInputToParse = transformQueryConstraintInputToParse;

const transformQueryInputToParse = (constraints, className, parseClasses) => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }

  Object.keys(constraints).forEach(fieldName => {
    const fieldValue = constraints[fieldName];

    if (parseQueryMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseQueryMap[fieldName];
      constraints[fieldName] = fieldValue;
      fieldValue.forEach(fieldValueItem => {
        transformQueryInputToParse(fieldValueItem, className, parseClasses);
      });
      return;
    } else {
      transformQueryConstraintInputToParse(fieldValue, fieldName, className, constraints, parseClasses);
    }
  });
};

exports.transformQueryInputToParse = transformQueryInputToParse;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiT1IiLCJBTkQiLCJOT1IiLCJwYXJzZUNvbnN0cmFpbnRNYXAiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW4iLCJub3RJbiIsImV4aXN0cyIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiaW5RdWVyeSIsIm5vdEluUXVlcnkiLCJjb250YWluZWRCeSIsImNvbnRhaW5zIiwibWF0Y2hlc1JlZ2V4Iiwib3B0aW9ucyIsInRleHQiLCJzZWFyY2giLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImJveCIsImdlb1dpdGhpbiIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJnZW9JbnRlcnNlY3RzIiwicG9pbnQiLCJ0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UiLCJjb25zdHJhaW50cyIsInBhcmVudEZpZWxkTmFtZSIsImNsYXNzTmFtZSIsInBhcmVudENvbnN0cmFpbnRzIiwicGFyc2VDbGFzc2VzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRWYWx1ZSIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidHlwZSIsImlkIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwidmFsdWUiLCJvYmplY3RJZCIsImZpZWxkTmFtZSIsImZpZWxkVmFsdWUiLCJrZXkiLCJ0YXJnZXRDbGFzcyIsIndoZXJlVGFyZ2V0IiwiJGV4aXN0cyIsInBhcnNlV2hlcmVUYXJnZXQiLCJ3aGVyZSIsIiRpblF1ZXJ5IiwidHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UiLCIkbm90SW5RdWVyeSIsIl9fdHlwZSIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiZ2VvUG9pbnQiLCJjZW50ZXIiLCJkaXN0YW5jZSIsImZpZWxkVmFsdWVJdGVtIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvdHJhbnNmb3JtZXJzL3F1ZXJ5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuXG5jb25zdCBwYXJzZVF1ZXJ5TWFwID0ge1xuICBPUjogJyRvcicsXG4gIEFORDogJyRhbmQnLFxuICBOT1I6ICckbm9yJyxcbn07XG5cbmNvbnN0IHBhcnNlQ29uc3RyYWludE1hcCA9IHtcbiAgZXF1YWxUbzogJyRlcScsXG4gIG5vdEVxdWFsVG86ICckbmUnLFxuICBsZXNzVGhhbjogJyRsdCcsXG4gIGxlc3NUaGFuT3JFcXVhbFRvOiAnJGx0ZScsXG4gIGdyZWF0ZXJUaGFuOiAnJGd0JyxcbiAgZ3JlYXRlclRoYW5PckVxdWFsVG86ICckZ3RlJyxcbiAgaW46ICckaW4nLFxuICBub3RJbjogJyRuaW4nLFxuICBleGlzdHM6ICckZXhpc3RzJyxcbiAgaW5RdWVyeUtleTogJyRzZWxlY3QnLFxuICBub3RJblF1ZXJ5S2V5OiAnJGRvbnRTZWxlY3QnLFxuICBpblF1ZXJ5OiAnJGluUXVlcnknLFxuICBub3RJblF1ZXJ5OiAnJG5vdEluUXVlcnknLFxuICBjb250YWluZWRCeTogJyRjb250YWluZWRCeScsXG4gIGNvbnRhaW5zOiAnJGFsbCcsXG4gIG1hdGNoZXNSZWdleDogJyRyZWdleCcsXG4gIG9wdGlvbnM6ICckb3B0aW9ucycsXG4gIHRleHQ6ICckdGV4dCcsXG4gIHNlYXJjaDogJyRzZWFyY2gnLFxuICB0ZXJtOiAnJHRlcm0nLFxuICBsYW5ndWFnZTogJyRsYW5ndWFnZScsXG4gIGNhc2VTZW5zaXRpdmU6ICckY2FzZVNlbnNpdGl2ZScsXG4gIGRpYWNyaXRpY1NlbnNpdGl2ZTogJyRkaWFjcml0aWNTZW5zaXRpdmUnLFxuICBuZWFyU3BoZXJlOiAnJG5lYXJTcGhlcmUnLFxuICBtYXhEaXN0YW5jZTogJyRtYXhEaXN0YW5jZScsXG4gIG1heERpc3RhbmNlSW5SYWRpYW5zOiAnJG1heERpc3RhbmNlSW5SYWRpYW5zJyxcbiAgbWF4RGlzdGFuY2VJbk1pbGVzOiAnJG1heERpc3RhbmNlSW5NaWxlcycsXG4gIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJyxcbiAgd2l0aGluOiAnJHdpdGhpbicsXG4gIGJveDogJyRib3gnLFxuICBnZW9XaXRoaW46ICckZ2VvV2l0aGluJyxcbiAgcG9seWdvbjogJyRwb2x5Z29uJyxcbiAgY2VudGVyU3BoZXJlOiAnJGNlbnRlclNwaGVyZScsXG4gIGdlb0ludGVyc2VjdHM6ICckZ2VvSW50ZXJzZWN0cycsXG4gIHBvaW50OiAnJHBvaW50Jyxcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSA9IChcbiAgY29uc3RyYWludHMsXG4gIHBhcmVudEZpZWxkTmFtZSxcbiAgY2xhc3NOYW1lLFxuICBwYXJlbnRDb25zdHJhaW50cyxcbiAgcGFyc2VDbGFzc2VzXG4pID0+IHtcbiAgY29uc3QgZmllbGRzID0gcGFyc2VDbGFzc2VzW2NsYXNzTmFtZV0uZmllbGRzO1xuICBpZiAocGFyZW50RmllbGROYW1lID09PSAnaWQnICYmIGNsYXNzTmFtZSkge1xuICAgIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGNvbnN0cmFpbnROYW1lID0+IHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnRWYWx1ZSA9IGNvbnN0cmFpbnRzW2NvbnN0cmFpbnROYW1lXTtcbiAgICAgIGlmICh0eXBlb2YgY29uc3RyYWludFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChjb25zdHJhaW50VmFsdWUpO1xuXG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICBjb25zdHJhaW50c1tjb25zdHJhaW50TmFtZV0gPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRWYWx1ZSkpIHtcbiAgICAgICAgY29uc3RyYWludHNbY29uc3RyYWludE5hbWVdID0gY29uc3RyYWludFZhbHVlLm1hcCh2YWx1ZSA9PiB7XG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQodmFsdWUpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcGFyZW50Q29uc3RyYWludHMub2JqZWN0SWQgPSBjb25zdHJhaW50cztcbiAgICBkZWxldGUgcGFyZW50Q29uc3RyYWludHMuaWQ7XG4gIH1cbiAgT2JqZWN0LmtleXMoY29uc3RyYWludHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBsZXQgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHBhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBjb25zdHJhaW50c1twYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV0gPSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgfVxuICAgIC8qKlxuICAgICAqIElmIHdlIGhhdmUgYSBrZXktdmFsdWUgcGFpciwgd2UgbmVlZCB0byBjaGFuZ2UgdGhlIHdheSB0aGUgY29uc3RyYWludCBpcyBzdHJ1Y3R1cmVkLlxuICAgICAqXG4gICAgICogRXhhbXBsZTpcbiAgICAgKiAgIEZyb206XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkXCI6IHtcbiAgICAgKiAgICAgICBcImxlc3NUaGFuXCI6IHtcbiAgICAgKiAgICAgICAgIFwia2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcInZhbHVlXCI6IDEwMFxuICAgICAqICAgICAgIH0sXG4gICAgICogICAgICAgXCJncmVhdGVyVGhhblwiOiB7XG4gICAgICogICAgICAgICBcImtleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJ2YWx1ZVwiOiAxMFxuICAgICAqICAgICAgIH1cbiAgICAgKiAgICAgfVxuICAgICAqICAgfVxuICAgICAqXG4gICAgICogICBUbzpcbiAgICAgKiAgIHtcbiAgICAgKiAgICAgXCJzb21lRmllbGQuZm9vLmJhclwiOiB7XG4gICAgICogICAgICAgXCIkbHRcIjogMTAwLFxuICAgICAqICAgICAgIFwiJGd0XCI6IDEwXG4gICAgICogICAgICB9XG4gICAgICogICB9XG4gICAgICovXG4gICAgaWYgKGZpZWxkVmFsdWUua2V5ICYmIGZpZWxkVmFsdWUudmFsdWUgJiYgcGFyZW50Q29uc3RyYWludHMgJiYgcGFyZW50RmllbGROYW1lKSB7XG4gICAgICBkZWxldGUgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXTtcbiAgICAgIHBhcmVudENvbnN0cmFpbnRzW2Ake3BhcmVudEZpZWxkTmFtZX0uJHtmaWVsZFZhbHVlLmtleX1gXSA9IHtcbiAgICAgICAgLi4ucGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUua2V5fWBdLFxuICAgICAgICBbcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV1dOiBmaWVsZFZhbHVlLnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgZmllbGRzW3BhcmVudEZpZWxkTmFtZV0gJiZcbiAgICAgIChmaWVsZHNbcGFyZW50RmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgfHwgZmllbGRzW3BhcmVudEZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJylcbiAgICApIHtcbiAgICAgIGNvbnN0IHsgdGFyZ2V0Q2xhc3MgfSA9IGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2V4aXN0cycpIHtcbiAgICAgICAgaWYgKGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICBjb25zdCB3aGVyZVRhcmdldCA9IGZpZWxkVmFsdWUgPyAnd2hlcmUnIDogJ25vdFdoZXJlJztcbiAgICAgICAgICBpZiAoY29uc3RyYWludHNbd2hlcmVUYXJnZXRdKSB7XG4gICAgICAgICAgICBpZiAoY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkKSB7XG4gICAgICAgICAgICAgIGNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XS5vYmplY3RJZCA9IHtcbiAgICAgICAgICAgICAgICAuLi5jb25zdHJhaW50c1t3aGVyZVRhcmdldF0ub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgJGV4aXN0czogZmllbGRWYWx1ZSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XS5vYmplY3RJZCA9IHtcbiAgICAgICAgICAgICAgICAkZXhpc3RzOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZVdoZXJlVGFyZ2V0ID0gZmllbGRWYWx1ZSA/ICckaW5RdWVyeScgOiAnJG5vdEluUXVlcnknO1xuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXVtwYXJzZVdoZXJlVGFyZ2V0XSA9IHtcbiAgICAgICAgICAgICAgd2hlcmU6IHsgb2JqZWN0SWQ6IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBkZWxldGUgY29uc3RyYWludHMuJGV4aXN0cztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdLiRleGlzdHMgPSBmaWVsZFZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XG4gICAgICAgIGNhc2UgJ2hhdmUnOlxuICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJGluUXVlcnkgPSB7XG4gICAgICAgICAgICB3aGVyZTogZmllbGRWYWx1ZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgfTtcbiAgICAgICAgICB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZShcbiAgICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJGluUXVlcnkud2hlcmUsXG4gICAgICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2hhdmVOb3QnOlxuICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJG5vdEluUXVlcnkgPSB7XG4gICAgICAgICAgICB3aGVyZTogZmllbGRWYWx1ZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgfTtcbiAgICAgICAgICB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZShcbiAgICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJG5vdEluUXVlcnkud2hlcmUsXG4gICAgICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICAgIGNhc2UgJ3BvaW50JzpcbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJiAhZmllbGRWYWx1ZS5fX3R5cGUpIHtcbiAgICAgICAgICBmaWVsZFZhbHVlLl9fdHlwZSA9ICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICduZWFyU3BoZXJlJzpcbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJiAhZmllbGRWYWx1ZS5fX3R5cGUpIHtcbiAgICAgICAgICBmaWVsZFZhbHVlLl9fdHlwZSA9ICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdib3gnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuYm90dG9tTGVmdCAmJiBmaWVsZFZhbHVlLnVwcGVyUmlnaHQpIHtcbiAgICAgICAgICBmaWVsZFZhbHVlID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUuYm90dG9tTGVmdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS51cHBlclJpZ2h0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW3BhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdXSA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwb2x5Z29uJzpcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChnZW9Qb2ludCA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGdlb1BvaW50ID09PSAnb2JqZWN0JyAmJiAhZ2VvUG9pbnQuX190eXBlKSB7XG4gICAgICAgICAgICAgIGdlb1BvaW50Ll9fdHlwZSA9ICdHZW9Qb2ludCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdjZW50ZXJTcGhlcmUnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuY2VudGVyICYmIGZpZWxkVmFsdWUuZGlzdGFuY2UpIHtcbiAgICAgICAgICBmaWVsZFZhbHVlID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUuY2VudGVyLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZpZWxkVmFsdWUuZGlzdGFuY2UsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdHJhaW50c1twYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV0gPSBmaWVsZFZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnd2hlcmUnKSB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKGZpZWxkVmFsdWUsIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZShcbiAgICAgICAgICBmaWVsZFZhbHVlLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgY29uc3RyYWludHMsXG4gICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlID0gKGNvbnN0cmFpbnRzLCBjbGFzc05hbWUsIHBhcnNlQ2xhc3NlcykgPT4ge1xuICBpZiAoIWNvbnN0cmFpbnRzIHx8IHR5cGVvZiBjb25zdHJhaW50cyAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBPYmplY3Qua2V5cyhjb25zdHJhaW50cykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGZpZWxkVmFsdWUgPSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuXG4gICAgaWYgKHBhcnNlUXVlcnlNYXBbZmllbGROYW1lXSkge1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgICBmaWVsZE5hbWUgPSBwYXJzZVF1ZXJ5TWFwW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChmaWVsZFZhbHVlSXRlbSA9PiB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKGZpZWxkVmFsdWVJdGVtLCBjbGFzc05hbWUsIHBhcnNlQ2xhc3Nlcyk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICBmaWVsZFZhbHVlLFxuICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29uc3RyYWludHMsXG4gICAgICAgIHBhcnNlQ2xhc3Nlc1xuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxuZXhwb3J0IHsgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlLCB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZSB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7Ozs7Ozs7O0FBRUEsTUFBTUEsYUFBYSxHQUFHO0VBQ3BCQyxFQUFFLEVBQUUsS0FEZ0I7RUFFcEJDLEdBQUcsRUFBRSxNQUZlO0VBR3BCQyxHQUFHLEVBQUU7QUFIZSxDQUF0QjtBQU1BLE1BQU1DLGtCQUFrQixHQUFHO0VBQ3pCQyxPQUFPLEVBQUUsS0FEZ0I7RUFFekJDLFVBQVUsRUFBRSxLQUZhO0VBR3pCQyxRQUFRLEVBQUUsS0FIZTtFQUl6QkMsaUJBQWlCLEVBQUUsTUFKTTtFQUt6QkMsV0FBVyxFQUFFLEtBTFk7RUFNekJDLG9CQUFvQixFQUFFLE1BTkc7RUFPekJDLEVBQUUsRUFBRSxLQVBxQjtFQVF6QkMsS0FBSyxFQUFFLE1BUmtCO0VBU3pCQyxNQUFNLEVBQUUsU0FUaUI7RUFVekJDLFVBQVUsRUFBRSxTQVZhO0VBV3pCQyxhQUFhLEVBQUUsYUFYVTtFQVl6QkMsT0FBTyxFQUFFLFVBWmdCO0VBYXpCQyxVQUFVLEVBQUUsYUFiYTtFQWN6QkMsV0FBVyxFQUFFLGNBZFk7RUFlekJDLFFBQVEsRUFBRSxNQWZlO0VBZ0J6QkMsWUFBWSxFQUFFLFFBaEJXO0VBaUJ6QkMsT0FBTyxFQUFFLFVBakJnQjtFQWtCekJDLElBQUksRUFBRSxPQWxCbUI7RUFtQnpCQyxNQUFNLEVBQUUsU0FuQmlCO0VBb0J6QkMsSUFBSSxFQUFFLE9BcEJtQjtFQXFCekJDLFFBQVEsRUFBRSxXQXJCZTtFQXNCekJDLGFB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