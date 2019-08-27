"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformTypes = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("../loaders/objectsMutations"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

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
        objectId: input.objectId
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
          objectId: input.objectId
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

    if (value.link && value.link.objectId) {
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: value.link.objectId
      };
    }
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9tdXRhdGlvbi5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImZpbmQiLCJjbGF6eiIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwidHJhbnNmb3JtZXJzIiwiZ2VvUG9pbnQiLCJQT0xZR09OX0lOUFVUIiwicG9seWdvbiIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsInZhbHVlIiwiX190eXBlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImF1dGgiLCJpbmZvIiwiRXJyb3IiLCJvcCIsIl9fb3AiLCJvcHMiLCJuZXN0ZWRPYmplY3RzVG9BZGQiLCJjcmVhdGVBbmRBZGQiLCJpbnB1dCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwibGVuZ3RoIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sIm1hcHBpbmdzIjoi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QWhCO0FBSGlFLE9BQWhDLENBQXhDO0FBS0FrQixNQUFBQSxpQkFBaUIsR0FBRyxNQUFNVCxnQkFBZ0IsQ0FBQ0MsWUFBakIsQ0FDeEJwQixXQUR3QixFQUV4QmtCLFdBRndCLEVBR3hCM0MsTUFId0IsRUFJeEJrQyxJQUp3QixFQUt4QkMsSUFMd0IsQ0FBMUI7QUFPQSxhQUFPO0FBQ0xMLFFBQUFBLE1BQU0sRUFBRSxTQURIO0FBRUxuQyxRQUFBQSxTQUFTLEVBQUU4QixXQUZOO0FBR0xzQixRQUFBQSxRQUFRLEVBQUVNLGlCQUFpQixDQUFDTjtBQUh2QixPQUFQO0FBS0Q7O0FBQ0QsUUFBSWxCLEtBQUssQ0FBQzBCLElBQU4sSUFBYzFCLEtBQUssQ0FBQzBCLElBQU4sQ0FBV1IsUUFBN0IsRUFBdUM7QUFDckMsYUFBTztBQUNMakIsUUFBQUEsTUFBTSxFQUFFLFNBREg7QUFFTG5DLFFBQUFBLFNBQVMsRUFBRThCLFdBRk47QUFHTHNCLFFBQUFBLFFBQVEsRUFBRWxCLEtBQUssQ0FBQzBCLElBQU4sQ0FBV1I7QUFIaEIsT0FBUDtBQUtEO0FBQ0Y7QUFsSGtCLENBQXJCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9sb2FkZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuXG5jb25zdCB0cmFuc2Zvcm1UeXBlcyA9IGFzeW5jIChcbiAgaW5wdXRUeXBlOiAnY3JlYXRlJyB8ICd1cGRhdGUnLFxuICBmaWVsZHMsXG4gIHsgY2xhc3NOYW1lLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHJlcSB9XG4pID0+IHtcbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjb25maWc6IHsgaXNDcmVhdGVFbmFibGVkLCBpc1VwZGF0ZUVuYWJsZWQgfSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcbiAgY29uc3QgcGFyc2VDbGFzcyA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXMuZmluZChcbiAgICBjbGF6eiA9PiBjbGF6ei5jbGFzc05hbWUgPT09IGNsYXNzTmFtZVxuICApO1xuICBpZiAoZmllbGRzKSB7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc0NyZWF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZVxuICAgICAgICA/IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKClcbiAgICAgICAgOiBudWxsO1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNVcGRhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVcbiAgICAgICAgPyBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLmdldEZpZWxkcygpXG4gICAgICAgIDogbnVsbDtcbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGFzeW5jIGZpZWxkID0+IHtcbiAgICAgIGxldCBpbnB1dFR5cGVGaWVsZDtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT09ICdjcmVhdGUnICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfVxuICAgICAgaWYgKGlucHV0VHlwZUZpZWxkKSB7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLmdlb1BvaW50KGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLnBvbHlnb24oZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5yZWxhdGlvbihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnBvaW50ZXIoXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgZmllbGQsXG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIH1cbiAgcmV0dXJuIGZpZWxkcztcbn07XG5cbmNvbnN0IHRyYW5zZm9ybWVycyA9IHtcbiAgcG9seWdvbjogdmFsdWUgPT4gKHtcbiAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICBjb29yZGluYXRlczogdmFsdWUubWFwKGdlb1BvaW50ID0+IFtnZW9Qb2ludC5sYXRpdHVkZSwgZ2VvUG9pbnQubG9uZ2l0dWRlXSksXG4gIH0pLFxuICBnZW9Qb2ludDogdmFsdWUgPT4gKHtcbiAgICAuLi52YWx1ZSxcbiAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gIH0pLFxuICByZWxhdGlvbjogYXN5bmMgKFxuICAgIHRhcmdldENsYXNzLFxuICAgIGZpZWxkLFxuICAgIHZhbHVlLFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICB7IGNvbmZpZywgYXV0aCwgaW5mbyB9XG4gICkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkgPT09IDApXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGF0bGVhc3Qgb25lIG9wZXJhdGlvbiBvbiB0aGUgcmVsYXRpb24gbXV0YXRpb24gb2YgZmllbGQgJHtmaWVsZH1gXG4gICAgICApO1xuXG4gICAgY29uc3Qgb3AgPSB7XG4gICAgICBfX29wOiAnQmF0Y2gnLFxuICAgICAgb3BzOiBbXSxcbiAgICB9O1xuICAgIGxldCBuZXN0ZWRPYmplY3RzVG9BZGQgPSBbXTtcblxuICAgIGlmICh2YWx1ZS5jcmVhdGVBbmRBZGQpIHtcbiAgICAgIG5lc3RlZE9iamVjdHNUb0FkZCA9IChhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgdmFsdWUuY3JlYXRlQW5kQWRkLm1hcChhc3luYyBpbnB1dCA9PiB7XG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgaW5wdXQsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICkpLm1hcChvYmplY3QgPT4gKHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBvYmplY3Qub2JqZWN0SWQsXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLmFkZCB8fCBuZXN0ZWRPYmplY3RzVG9BZGQubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCF2YWx1ZS5hZGQpIHZhbHVlLmFkZCA9IFtdO1xuICAgICAgdmFsdWUuYWRkID0gdmFsdWUuYWRkLm1hcChpbnB1dCA9PiAoe1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQ6IGlucHV0Lm9iamVjdElkLFxuICAgICAgfSkpO1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnQWRkUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiBbLi4udmFsdWUuYWRkLCAuLi5uZXN0ZWRPYmplY3RzVG9BZGRdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnJlbW92ZSkge1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnUmVtb3ZlUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiB2YWx1ZS5yZW1vdmUubWFwKGlucHV0ID0+ICh7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICBvYmplY3RJZDogaW5wdXQub2JqZWN0SWQsXG4gICAgICAgIH0pKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gb3A7XG4gIH0sXG4gIHBvaW50ZXI6IGFzeW5jIChcbiAgICB0YXJnZXRDbGFzcyxcbiAgICBmaWVsZCxcbiAgICB2YWx1ZSxcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgeyBjb25maWcsIGF1dGgsIGluZm8gfVxuICApID0+IHtcbiAgICBpZiAoT2JqZWN0LmtleXModmFsdWUpID4gMSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkgPT09IDApXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIHZhbHVlLmNyZWF0ZUFuZExpbmssIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICB9KTtcbiAgICAgIG5lc3RlZE9iamVjdFRvQWRkID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBuZXN0ZWRPYmplY3RUb0FkZC5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS5saW5rICYmIHZhbHVlLmxpbmsub2JqZWN0SWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogdmFsdWUubGluay5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICB9LFxufTtcblxuZXhwb3J0IHsgdHJhbnNmb3JtVHlwZXMgfTtcbiJdfQ==