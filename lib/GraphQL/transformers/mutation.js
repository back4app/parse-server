"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformTypes = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const transformTypes = async (inputType, fields, {
  className,
  parseGraphQLSchema,
  req
}) => {
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    config: {
      isCreateEnabled,
      isUpdateEnabled
    }
  } = parseGraphQLSchema.parseClassTypes[className];
  const parseClass = parseGraphQLSchema.parseClasses.find(clazz => clazz.className === className);

  if (fields) {
    const classGraphQLCreateTypeFields = isCreateEnabled && classGraphQLCreateType ? classGraphQLCreateType.getFields() : null;
    const classGraphQLUpdateTypeFields = isUpdateEnabled && classGraphQLUpdateType ? classGraphQLUpdateType.getFields() : null;
    const promises = Object.keys(fields).map(async field => {
      let inputTypeField;

      if (inputType === 'create' && classGraphQLCreateTypeFields) {
        inputTypeField = classGraphQLCreateTypeFields[field];
      } else if (classGraphQLUpdateTypeFields) {
        inputTypeField = classGraphQLUpdateTypeFields[field];
      }

      if (inputTypeField) {
        switch (true) {
          case inputTypeField.type === defaultGraphQLTypes.GEO_POINT_INPUT:
            fields[field] = transformers.geoPoint(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.POLYGON_INPUT:
            fields[field] = transformers.polygon(fields[field]);
            break;

          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;

          case parseClass.fields[field].type === 'Pointer':
            fields[field] = await transformers.pointer(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;
        }
      }
    });
    await Promise.all(promises);
  }

  return fields;
};

exports.transformTypes = transformTypes;
const transformers = {
  polygon: value => ({
    __type: 'Polygon',
    coordinates: value.map(geoPoint => [geoPoint.latitude, geoPoint.longitude])
  }),
  geoPoint: value => _objectSpread({}, value, {
    __type: 'GeoPoint'
  }),
  relation: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value) === 0) throw new Error(`You need to provide atleast one operation on the relation mutation of field ${field}`);
    const op = {
      __op: 'Batch',
      ops: []
    };
    let nestedObjectsToAdd = [];

    if (value.createAndAdd) {
      nestedObjectsToAdd = (await Promise.all(value.createAndAdd.map(async input => {
        const parseFields = await transformTypes('create', input, {
          className: targetClass,
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        return objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      }))).map(object => ({
        __type: 'Pointer',
        className: targetClass,
        objectId: object.objectId
      }));
    }

    if (value.add || nestedObjectsToAdd.length > 0) {
      if (!value.add) value.add = [];
      value.add = value.add.map(input => ({
        __type: 'Pointer',
        className: targetClass,
        objectId: input
      }));
      op.ops.push({
        __op: 'AddRelation',
        objects: [...value.add, ...nestedObjectsToAdd]
      });
    }

    if (value.remove) {
      op.ops.push({
        __op: 'RemoveRelation',
        objects: value.remove.map(input => ({
          __type: 'Pointer',
          className: targetClass,
          objectId: input
        }))
      });
    }

    return op;
  },
  pointer: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value) > 1 || Object.keys(value) === 0) throw new Error(`You need to provide link OR createLink on the pointer mutation of field ${field}`);
    let nestedObjectToAdd;

    if (value.createAndLink) {
      const parseFields = await transformTypes('create', value.createAndLink, {
        className: targetClass,
        parseGraphQLSchema,
        req: {
          config,
          auth,
          info
        }
      });
      nestedObjectToAdd = await objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: nestedObjectToAdd.objectId
      };
    }

    if (value.link) {
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: value.link
      };
    }
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9tdXRhdGlvbi5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImZpbmQiLCJjbGF6eiIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwidHJhbnNmb3JtZXJzIiwiZ2VvUG9pbnQiLCJQT0xZR09OX0lOUFVUIiwicG9seWdvbiIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsInZhbHVlIiwiX190eXBlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImF1dGgiLCJpbmZvIiwiRXJyb3IiLCJvcCIsIl9fb3AiLCJvcHMiLCJuZXN0ZWRPYmplY3RzVG9BZGQiLCJjcmVhdGVBbmRBZGQiLCJpbnB1dCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwibGVuZ3RoIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sIm1hcHBpbmdzIjoi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QztBQUtBa0IsTUFBQUEsaUJBQWlCLEdBQUcsTUFBTVQsZ0JBQWdCLENBQUNDLFlBQWpCLENBQ3hCcEIsV0FEd0IsRUFFeEJrQixXQUZ3QixFQUd4QjNDLE1BSHdCLEVBSXhCa0MsSUFKd0IsRUFLeEJDLElBTHdCLENBQTFCO0FBT0EsYUFBTztBQUNMTCxRQUFBQSxNQUFNLEVBQUUsU0FESDtBQUVMbkMsUUFBQUEsU0FBUyxFQUFFOEIsV0FGTjtBQUdMc0IsUUFBQUEsUUFBUSxFQUFFTSxpQkFBaUIsQ0FBQ047QUFIdkIsT0FBUDtBQUtEOztBQUNELFFBQUlsQixLQUFLLENBQUMwQixJQUFWLEVBQWdCO0FBQ2QsYUFBTztBQUNMekIsUUFBQUEsTUFBTSxFQUFFLFNBREg7QUFFTG5DLFFBQUFBLFNBQVMsRUFBRThCLFdBRk47QUFHTHNCLFFBQUFBLFFBQVEsRUFBRWxCLEtBQUssQ0FBQzBCO0FBSFgsT0FBUDtBQUtEO0FBQ0Y7QUFsSGtCLENBQXJCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuXG5jb25zdCB0cmFuc2Zvcm1UeXBlcyA9IGFzeW5jIChcbiAgaW5wdXRUeXBlOiAnY3JlYXRlJyB8ICd1cGRhdGUnLFxuICBmaWVsZHMsXG4gIHsgY2xhc3NOYW1lLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHJlcSB9XG4pID0+IHtcbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjb25maWc6IHsgaXNDcmVhdGVFbmFibGVkLCBpc1VwZGF0ZUVuYWJsZWQgfSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcbiAgY29uc3QgcGFyc2VDbGFzcyA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXMuZmluZChcbiAgICBjbGF6eiA9PiBjbGF6ei5jbGFzc05hbWUgPT09IGNsYXNzTmFtZVxuICApO1xuICBpZiAoZmllbGRzKSB7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc0NyZWF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZVxuICAgICAgICA/IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKClcbiAgICAgICAgOiBudWxsO1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNVcGRhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVcbiAgICAgICAgPyBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLmdldEZpZWxkcygpXG4gICAgICAgIDogbnVsbDtcbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGFzeW5jIGZpZWxkID0+IHtcbiAgICAgIGxldCBpbnB1dFR5cGVGaWVsZDtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT09ICdjcmVhdGUnICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfVxuICAgICAgaWYgKGlucHV0VHlwZUZpZWxkKSB7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLmdlb1BvaW50KGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLnBvbHlnb24oZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5yZWxhdGlvbihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnBvaW50ZXIoXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgZmllbGQsXG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIH1cbiAgcmV0dXJuIGZpZWxkcztcbn07XG5cbmNvbnN0IHRyYW5zZm9ybWVycyA9IHtcbiAgcG9seWdvbjogdmFsdWUgPT4gKHtcbiAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICBjb29yZGluYXRlczogdmFsdWUubWFwKGdlb1BvaW50ID0+IFtnZW9Qb2ludC5sYXRpdHVkZSwgZ2VvUG9pbnQubG9uZ2l0dWRlXSksXG4gIH0pLFxuICBnZW9Qb2ludDogdmFsdWUgPT4gKHtcbiAgICAuLi52YWx1ZSxcbiAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gIH0pLFxuICByZWxhdGlvbjogYXN5bmMgKFxuICAgIHRhcmdldENsYXNzLFxuICAgIGZpZWxkLFxuICAgIHZhbHVlLFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICB7IGNvbmZpZywgYXV0aCwgaW5mbyB9XG4gICkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkgPT09IDApXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGF0bGVhc3Qgb25lIG9wZXJhdGlvbiBvbiB0aGUgcmVsYXRpb24gbXV0YXRpb24gb2YgZmllbGQgJHtmaWVsZH1gXG4gICAgICApO1xuXG4gICAgY29uc3Qgb3AgPSB7XG4gICAgICBfX29wOiAnQmF0Y2gnLFxuICAgICAgb3BzOiBbXSxcbiAgICB9O1xuICAgIGxldCBuZXN0ZWRPYmplY3RzVG9BZGQgPSBbXTtcblxuICAgIGlmICh2YWx1ZS5jcmVhdGVBbmRBZGQpIHtcbiAgICAgIG5lc3RlZE9iamVjdHNUb0FkZCA9IChhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgdmFsdWUuY3JlYXRlQW5kQWRkLm1hcChhc3luYyBpbnB1dCA9PiB7XG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgaW5wdXQsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICkpLm1hcChvYmplY3QgPT4gKHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBvYmplY3Qub2JqZWN0SWQsXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLmFkZCB8fCBuZXN0ZWRPYmplY3RzVG9BZGQubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCF2YWx1ZS5hZGQpIHZhbHVlLmFkZCA9IFtdO1xuICAgICAgdmFsdWUuYWRkID0gdmFsdWUuYWRkLm1hcChpbnB1dCA9PiAoe1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQ6IGlucHV0LFxuICAgICAgfSkpO1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnQWRkUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiBbLi4udmFsdWUuYWRkLCAuLi5uZXN0ZWRPYmplY3RzVG9BZGRdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnJlbW92ZSkge1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnUmVtb3ZlUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiB2YWx1ZS5yZW1vdmUubWFwKGlucHV0ID0+ICh7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICBvYmplY3RJZDogaW5wdXQsXG4gICAgICAgIH0pKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gb3A7XG4gIH0sXG4gIHBvaW50ZXI6IGFzeW5jIChcbiAgICB0YXJnZXRDbGFzcyxcbiAgICBmaWVsZCxcbiAgICB2YWx1ZSxcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgeyBjb25maWcsIGF1dGgsIGluZm8gfVxuICApID0+IHtcbiAgICBpZiAoT2JqZWN0LmtleXModmFsdWUpID4gMSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkgPT09IDApXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIHZhbHVlLmNyZWF0ZUFuZExpbmssIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICB9KTtcbiAgICAgIG5lc3RlZE9iamVjdFRvQWRkID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBuZXN0ZWRPYmplY3RUb0FkZC5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS5saW5rKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQ6IHZhbHVlLmxpbmssXG4gICAgICB9O1xuICAgIH1cbiAgfSxcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVR5cGVzIH07XG4iXX0=