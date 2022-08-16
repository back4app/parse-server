"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformTypes = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphqlRelay = require("graphql-relay");

var _filesMutations = require("../loaders/filesMutations");

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

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
  const parseClass = parseGraphQLSchema.parseClasses[className];

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
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }

            fields[field] = transformers.geoPoint(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.POLYGON_INPUT:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }

            fields[field] = transformers.polygon(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.FILE_INPUT:
            fields[field] = await transformers.file(fields[field], req);
            break;

          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;

          case parseClass.fields[field].type === 'Pointer':
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }

            fields[field] = await transformers.pointer(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;

          default:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              return;
            }

            break;
        }
      }
    });
    await Promise.all(promises);
    if (fields.ACL) fields.ACL = transformers.ACL(fields.ACL);
  }

  return fields;
};

exports.transformTypes = transformTypes;
const transformers = {
  file: async (input, {
    config
  }) => {
    if (input === null) {
      return {
        __op: 'Delete'
      };
    }

    const {
      file,
      upload
    } = input;

    if (upload) {
      const {
        fileInfo
      } = await (0, _filesMutations.handleUpload)(upload, config);
      return _objectSpread(_objectSpread({}, fileInfo), {}, {
        __type: 'File'
      });
    } else if (file && file.name) {
      return {
        name: file.name,
        __type: 'File',
        url: file.url
      };
    }

    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  },
  polygon: value => ({
    __type: 'Polygon',
    coordinates: value.map(geoPoint => [geoPoint.latitude, geoPoint.longitude])
  }),
  geoPoint: value => _objectSpread(_objectSpread({}, value), {}, {
    __type: 'GeoPoint'
  }),
  ACL: value => {
    const parseACL = {};

    if (value.public) {
      parseACL['*'] = {
        read: value.public.read,
        write: value.public.write
      };
    }

    if (value.users) {
      value.users.forEach(rule => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(rule.userId);

        if (globalIdObject.type === '_User') {
          rule.userId = globalIdObject.id;
        }

        parseACL[rule.userId] = {
          read: rule.read,
          write: rule.write
        };
      });
    }

    if (value.roles) {
      value.roles.forEach(rule => {
        parseACL[`role:${rule.roleName}`] = {
          read: rule.read,
          write: rule.write
        };
      });
    }

    return parseACL;
  },
  relation: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide at least one operation on the relation mutation of field ${field}`);
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
      value.add = value.add.map(input => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);

        if (globalIdObject.type === targetClass) {
          input = globalIdObject.id;
        }

        return {
          __type: 'Pointer',
          className: targetClass,
          objectId: input
        };
      });
      op.ops.push({
        __op: 'AddRelation',
        objects: [...value.add, ...nestedObjectsToAdd]
      });
    }

    if (value.remove) {
      op.ops.push({
        __op: 'RemoveRelation',
        objects: value.remove.map(input => {
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);

          if (globalIdObject.type === targetClass) {
            input = globalIdObject.id;
          }

          return {
            __type: 'Pointer',
            className: targetClass,
            objectId: input
          };
        })
      });
    }

    return op;
  },
  pointer: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length > 1 || Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide link OR createLink on the pointer mutation of field ${field}`);
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
      let objectId = value.link;
      const globalIdObject = (0, _graphqlRelay.fromGlobalId)(objectId);

      if (globalIdObject.type === targetClass) {
        objectId = globalIdObject.id;
      }

      return {
        __type: 'Pointer',
        className: targetClass,
        objectId
      };
    }
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwiX19vcCIsInRyYW5zZm9ybWVycyIsImdlb1BvaW50IiwiUE9MWUdPTl9JTlBVVCIsInBvbHlnb24iLCJGSUxFX0lOUFVUIiwiZmlsZSIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsIkFDTCIsImlucHV0IiwidXBsb2FkIiwiZmlsZUluZm8iLCJoYW5kbGVVcGxvYWQiLCJfX3R5cGUiLCJuYW1lIiwidXJsIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsInZhbHVlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInBhcnNlQUNMIiwicHVibGljIiwicmVhZCIsIndyaXRlIiwidXNlcnMiLCJmb3JFYWNoIiwicnVsZSIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidXNlcklkIiwiaWQiLCJyb2xlcyIsInJvbGVOYW1lIiwiYXV0aCIsImluZm8iLCJsZW5ndGgiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIm9wcyIsIm5lc3RlZE9iamVjdHNUb0FkZCIsImNyZWF0ZUFuZEFkZCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvdHJhbnNmb3JtZXJzL211dGF0aW9uLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgaGFuZGxlVXBsb2FkIH0gZnJvbSAnLi4vbG9hZGVycy9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5cbmNvbnN0IHRyYW5zZm9ybVR5cGVzID0gYXN5bmMgKFxuICBpbnB1dFR5cGU6ICdjcmVhdGUnIHwgJ3VwZGF0ZScsXG4gIGZpZWxkcyxcbiAgeyBjbGFzc05hbWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgcmVxIH1cbikgPT4ge1xuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNvbmZpZzogeyBpc0NyZWF0ZUVuYWJsZWQsIGlzVXBkYXRlRW5hYmxlZCB9LFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuICBjb25zdCBwYXJzZUNsYXNzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1tjbGFzc05hbWVdO1xuICBpZiAoZmllbGRzKSB7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc0NyZWF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA/IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCkgOiBudWxsO1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNVcGRhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPyBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLmdldEZpZWxkcygpIDogbnVsbDtcbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGFzeW5jIGZpZWxkID0+IHtcbiAgICAgIGxldCBpbnB1dFR5cGVGaWVsZDtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT09ICdjcmVhdGUnICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfVxuICAgICAgaWYgKGlucHV0VHlwZUZpZWxkKSB7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB0cmFuc2Zvcm1lcnMuZ2VvUG9pbnQoZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9JTlBVVDpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHRyYW5zZm9ybWVycy5wb2x5Z29uKGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLmZpbGUoZmllbGRzW2ZpZWxkXSwgcmVxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnJlbGF0aW9uKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICAgIHJlcVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJzpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5wb2ludGVyKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICAgIHJlcVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBpZiAoZmllbGRzLkFDTCkgZmllbGRzLkFDTCA9IHRyYW5zZm9ybWVycy5BQ0woZmllbGRzLkFDTCk7XG4gIH1cbiAgcmV0dXJuIGZpZWxkcztcbn07XG5cbmNvbnN0IHRyYW5zZm9ybWVycyA9IHtcbiAgZmlsZTogYXN5bmMgKGlucHV0LCB7IGNvbmZpZyB9KSA9PiB7XG4gICAgaWYgKGlucHV0ID09PSBudWxsKSB7XG4gICAgICByZXR1cm4geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCB7IGZpbGUsIHVwbG9hZCB9ID0gaW5wdXQ7XG4gICAgaWYgKHVwbG9hZCkge1xuICAgICAgY29uc3QgeyBmaWxlSW5mbyB9ID0gYXdhaXQgaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIHJldHVybiB7IC4uLmZpbGVJbmZvLCBfX3R5cGU6ICdGaWxlJyB9O1xuICAgIH0gZWxzZSBpZiAoZmlsZSAmJiBmaWxlLm5hbWUpIHtcbiAgICAgIHJldHVybiB7IG5hbWU6IGZpbGUubmFtZSwgX190eXBlOiAnRmlsZScsIHVybDogZmlsZS51cmwgfTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJyk7XG4gIH0sXG4gIHBvbHlnb246IHZhbHVlID0+ICh7XG4gICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgY29vcmRpbmF0ZXM6IHZhbHVlLm1hcChnZW9Qb2ludCA9PiBbZ2VvUG9pbnQubGF0aXR1ZGUsIGdlb1BvaW50LmxvbmdpdHVkZV0pLFxuICB9KSxcbiAgZ2VvUG9pbnQ6IHZhbHVlID0+ICh7XG4gICAgLi4udmFsdWUsXG4gICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICB9KSxcbiAgQUNMOiB2YWx1ZSA9PiB7XG4gICAgY29uc3QgcGFyc2VBQ0wgPSB7fTtcbiAgICBpZiAodmFsdWUucHVibGljKSB7XG4gICAgICBwYXJzZUFDTFsnKiddID0ge1xuICAgICAgICByZWFkOiB2YWx1ZS5wdWJsaWMucmVhZCxcbiAgICAgICAgd3JpdGU6IHZhbHVlLnB1YmxpYy53cml0ZSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS51c2Vycykge1xuICAgICAgdmFsdWUudXNlcnMuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQocnVsZS51c2VySWQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgIHJ1bGUudXNlcklkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcGFyc2VBQ0xbcnVsZS51c2VySWRdID0ge1xuICAgICAgICAgIHJlYWQ6IHJ1bGUucmVhZCxcbiAgICAgICAgICB3cml0ZTogcnVsZS53cml0ZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAodmFsdWUucm9sZXMpIHtcbiAgICAgIHZhbHVlLnJvbGVzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIHBhcnNlQUNMW2Byb2xlOiR7cnVsZS5yb2xlTmFtZX1gXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlQUNMO1xuICB9LFxuICByZWxhdGlvbjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGF0IGxlYXN0IG9uZSBvcGVyYXRpb24gb24gdGhlIHJlbGF0aW9uIG11dGF0aW9uIG9mIGZpZWxkICR7ZmllbGR9YFxuICAgICAgKTtcblxuICAgIGNvbnN0IG9wID0ge1xuICAgICAgX19vcDogJ0JhdGNoJyxcbiAgICAgIG9wczogW10sXG4gICAgfTtcbiAgICBsZXQgbmVzdGVkT2JqZWN0c1RvQWRkID0gW107XG5cbiAgICBpZiAodmFsdWUuY3JlYXRlQW5kQWRkKSB7XG4gICAgICBuZXN0ZWRPYmplY3RzVG9BZGQgPSAoXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgIHZhbHVlLmNyZWF0ZUFuZEFkZC5tYXAoYXN5bmMgaW5wdXQgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgaW5wdXQsIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdCh0YXJnZXRDbGFzcywgcGFyc2VGaWVsZHMsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICAgKS5tYXAob2JqZWN0ID0+ICh7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogb2JqZWN0Lm9iamVjdElkLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS5hZGQgfHwgbmVzdGVkT2JqZWN0c1RvQWRkLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghdmFsdWUuYWRkKSB2YWx1ZS5hZGQgPSBbXTtcbiAgICAgIHZhbHVlLmFkZCA9IHZhbHVlLmFkZC5tYXAoaW5wdXQgPT4ge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICAgIGlucHV0ID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgIG9iamVjdElkOiBpbnB1dCxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnQWRkUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiBbLi4udmFsdWUuYWRkLCAuLi5uZXN0ZWRPYmplY3RzVG9BZGRdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnJlbW92ZSkge1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnUmVtb3ZlUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiB2YWx1ZS5yZW1vdmUubWFwKGlucHV0ID0+IHtcbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgICAgICBpbnB1dCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IGlucHV0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBvcDtcbiAgfSxcbiAgcG9pbnRlcjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID4gMSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIHZhbHVlLmNyZWF0ZUFuZExpbmssIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICB9KTtcbiAgICAgIG5lc3RlZE9iamVjdFRvQWRkID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBuZXN0ZWRPYmplY3RUb0FkZC5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS5saW5rKSB7XG4gICAgICBsZXQgb2JqZWN0SWQgPSB2YWx1ZS5saW5rO1xuICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQob2JqZWN0SWQpO1xuICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgIG9iamVjdElkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgfSxcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVR5cGVzIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxjQUFjLEdBQUcsT0FDckJDLFNBRHFCLEVBRXJCQyxNQUZxQixFQUdyQjtFQUFFQyxTQUFGO0VBQWFDLGtCQUFiO0VBQWlDQztBQUFqQyxDQUhxQixLQUlsQjtFQUNILE1BQU07SUFDSkMsc0JBREk7SUFFSkMsc0JBRkk7SUFHSkMsTUFBTSxFQUFFO01BQUVDLGVBQUY7TUFBbUJDO0lBQW5CO0VBSEosSUFJRk4sa0JBQWtCLENBQUNPLGVBQW5CLENBQW1DUixTQUFuQyxDQUpKO0VBS0EsTUFBTVMsVUFBVSxHQUFHUixrQkFBa0IsQ0FBQ1MsWUFBbkIsQ0FBZ0NWLFNBQWhDLENBQW5COztFQUNBLElBQUlELE1BQUosRUFBWTtJQUNWLE1BQU1ZLDRCQUE0QixHQUNoQ0wsZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDUyxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtJQUVBLE1BQU1DLDRCQUE0QixHQUNoQ04sZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDUSxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtJQUVBLE1BQU1FLFFBQVEsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVlqQixNQUFaLEVBQW9Ca0IsR0FBcEIsQ0FBd0IsTUFBTUMsS0FBTixJQUFlO01BQ3RELElBQUlDLGNBQUo7O01BQ0EsSUFBSXJCLFNBQVMsS0FBSyxRQUFkLElBQTBCYSw0QkFBOUIsRUFBNEQ7UUFDMURRLGNBQWMsR0FBR1IsNEJBQTRCLENBQUNPLEtBQUQsQ0FBN0M7TUFDRCxDQUZELE1BRU8sSUFBSUwsNEJBQUosRUFBa0M7UUFDdkNNLGNBQWMsR0FBR04sNEJBQTRCLENBQUNLLEtBQUQsQ0FBN0M7TUFDRDs7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