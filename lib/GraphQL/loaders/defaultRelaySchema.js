"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.GLOBAL_ID_ATT = void 0;

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _parseClassTypes = require("./parseClassTypes");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const GLOBAL_ID_ATT = {
  description: 'This is the global id.',
  type: defaultGraphQLTypes.OBJECT_ID
};
exports.GLOBAL_ID_ATT = GLOBAL_ID_ATT;

const load = parseGraphQLSchema => {
  const {
    nodeInterface,
    nodeField
  } = (0, _graphqlRelay.nodeDefinitions)(async (globalId, context, queryInfo) => {
    try {
      const {
        type,
        id
      } = (0, _graphqlRelay.fromGlobalId)(globalId);
      const {
        config,
        auth,
        info
      } = context;
      const selectedFields = (0, _graphqlListFields.default)(queryInfo);
      const {
        keys,
        include
      } = (0, _parseClassTypes.extractKeysAndInclude)(selectedFields);
      return _objectSpread({
        className: type
      }, await objectsQueries.getObject(type, id, keys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses));
    } catch (e) {
      parseGraphQLSchema.handleError(e);
    }
  }, obj => {
    return parseGraphQLSchema.parseClassTypes[obj.className].classGraphQLOutputType.name;
  });
  parseGraphQLSchema.addGraphQLType(nodeInterface, true);
  parseGraphQLSchema.relayNodeInterface = nodeInterface;
  parseGraphQLSchema.addGraphQLQuery('node', nodeField, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJHTE9CQUxfSURfQVRUIiwiZGVzY3JpcHRpb24iLCJ0eXBlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVF9JRCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJub2RlSW50ZXJmYWNlIiwibm9kZUZpZWxkIiwibm9kZURlZmluaXRpb25zIiwiZ2xvYmFsSWQiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwiaWQiLCJmcm9tR2xvYmFsSWQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiZ2V0RmllbGROYW1lcyIsImtleXMiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwiY2xhc3NOYW1lIiwib2JqZWN0c1F1ZXJpZXMiLCJnZXRPYmplY3QiLCJ1bmRlZmluZWQiLCJwYXJzZUNsYXNzZXMiLCJlIiwiaGFuZGxlRXJyb3IiLCJvYmoiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwibmFtZSIsImFkZEdyYXBoUUxUeXBlIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwiYWRkR3JhcGhRTFF1ZXJ5Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9kZWZhdWx0UmVsYXlTY2hlbWEuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbm9kZURlZmluaXRpb25zLCBmcm9tR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUgfSBmcm9tICcuL3BhcnNlQ2xhc3NUeXBlcyc7XG5cbmNvbnN0IEdMT0JBTF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZ2xvYmFsIGlkLicsXG4gIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lELFxufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGNvbnN0IHsgbm9kZUludGVyZmFjZSwgbm9kZUZpZWxkIH0gPSBub2RlRGVmaW5pdGlvbnMoXG4gICAgYXN5bmMgKGdsb2JhbElkLCBjb250ZXh0LCBxdWVyeUluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdHlwZSwgaWQgfSA9IGZyb21HbG9iYWxJZChnbG9iYWxJZCk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWU6IHR5cGUsXG4gICAgICAgICAgLi4uKGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKSksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIG9iaiA9PiB7XG4gICAgICByZXR1cm4gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tvYmouY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlLm5hbWU7XG4gICAgfVxuICApO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShub2RlSW50ZXJmYWNlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZSA9IG5vZGVJbnRlcmZhY2U7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoJ25vZGUnLCBub2RlRmllbGQsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgR0xPQkFMX0lEX0FUVCwgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsYUFBYSxHQUFHO0VBQ3BCQyxXQUFXLEVBQUUsd0JBRE87RUFFcEJDLElBQUksRUFBRUMsbUJBQW1CLENBQUNDO0FBRk4sQ0FBdEI7OztBQUtBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakMsTUFBTTtJQUFFQyxhQUFGO0lBQWlCQztFQUFqQixJQUErQixJQUFBQyw2QkFBQSxFQUNuQyxPQUFPQyxRQUFQLEVBQWlCQyxPQUFqQixFQUEwQkMsU0FBMUIsS0FBd0M7SUFDdEMsSUFBSTtNQUNGLE1BQU07UUFBRVYsSUFBRjtRQUFRVztNQUFSLElBQWUsSUFBQUMsMEJBQUEsRUFBYUosUUFBYixDQUFyQjtNQUNBLE1BQU07UUFBRUssTUFBRjtRQUFVQyxJQUFWO1FBQWdCQztNQUFoQixJQUF5Qk4sT0FBL0I7TUFDQSxNQUFNTyxjQUFjLEdBQUcsSUFBQUMsMEJBQUEsRUFBY1AsU0FBZCxDQUF2QjtNQUVBLE1BQU07UUFBRVEsSUFBRjtRQUFRQztNQUFSLElBQW9CLElBQUFDLHNDQUFBLEVBQXNCSixjQUF0QixDQUExQjtNQUVBO1FBQ0VLLFNBQVMsRUFBRXJCO01BRGIsR0FFTSxNQUFNc0IsY0FBYyxDQUFDQyxTQUFmLENBQ1J2QixJQURRLEVBRVJXLEVBRlEsRUFHUk8sSUFIUSxFQUlSQyxPQUpRLEVBS1JLLFNBTFEsRUFNUkEsU0FOUSxFQU9SWCxNQVBRLEVBUVJDLElBUlEsRUFTUkMsSUFUUSxFQVVSWCxrQkFBa0IsQ0FBQ3FCLFlBVlgsQ0FGWjtJQWVELENBdEJELENBc0JFLE9BQU9DLENBQVAsRUFBVTtNQUNWdEIsa0JBQWtCLENBQUN1QixXQUFuQixDQUErQkQsQ0FBL0I7SUFDRDtFQUNGLENBM0JrQyxFQTRCbkNFLEdBQUcsSUFBSTtJQUNMLE9BQU94QixrQkFBa0IsQ0FBQ3lCLGVBQW5CLENBQW1DRCxHQUFHLENBQUNQLFNBQXZDLEVBQWtEUyxzQkFBbEQsQ0FBeUVDLElBQWhGO0VBQ0QsQ0E5QmtDLENBQXJDO0VBaUNBM0Isa0JBQWtCLENBQUM0QixjQUFuQixDQUFrQzNCLGFBQWxDLEVBQWlELElBQWpEO0VBQ0FELGtCQUFrQixDQUFDNkIsa0JBQW5CLEdBQXdDNUIsYUFBeEM7RUFDQUQsa0JBQWtCLENBQUM4QixlQUFuQixDQUFtQyxNQUFuQyxFQUEyQzVCLFNBQTNDLEVBQXNELElBQXREO0FBQ0QsQ0FyQ0QifQ==