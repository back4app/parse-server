"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLConfigKey = exports.GraphQLConfigId = exports.GraphQLConfigClassName = void 0;
var _requiredParameter = _interopRequireDefault(require("../../lib/requiredParameter"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _CacheController = _interopRequireDefault(require("./CacheController"));
const _excluded = ["enabledForClasses", "disabledForClasses", "classConfigs"],
  _excluded2 = ["className", "type", "query", "mutation"],
  _excluded3 = ["inputFields", "outputFields", "constraintFields", "sortFields"],
  _excluded4 = ["field", "asc", "desc"],
  _excluded5 = ["create", "update"],
  _excluded6 = ["find", "get", "findAlias", "getAlias"],
  _excluded7 = ["create", "update", "destroy", "createAlias", "updateAlias", "destroyAlias"];
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], -1 === t.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (-1 !== e.indexOf(n)) continue; t[n] = r[n]; } return t; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const GraphQLConfigClassName = exports.GraphQLConfigClassName = '_GraphQLConfig';
const GraphQLConfigId = exports.GraphQLConfigId = '1';
const GraphQLConfigKey = exports.GraphQLConfigKey = 'config';
class ParseGraphQLController {
  constructor(params = {}) {
    this.databaseController = params.databaseController || (0, _requiredParameter.default)(`ParseGraphQLController requires a "databaseController" to be instantiated.`);
    this.cacheController = params.cacheController;
    this.isMounted = !!params.mountGraphQL;
    this.configCacheKey = GraphQLConfigKey;
  }
  async getGraphQLConfig() {
    if (this.isMounted) {
      const _cachedConfig = await this._getCachedGraphQLConfig();
      if (_cachedConfig) {
        return _cachedConfig;
      }
    }
    const results = await this.databaseController.find(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, {
      limit: 1
    });
    let graphQLConfig;
    if (results.length != 1) {
      // If there is no config in the database - return empty config.
      return {};
    } else {
      graphQLConfig = results[0][GraphQLConfigKey];
    }
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return graphQLConfig;
  }
  async updateGraphQLConfig(graphQLConfig) {
    // throws if invalid
    this._validateGraphQLConfig(graphQLConfig || (0, _requiredParameter.default)('You must provide a graphQLConfig!'));

    // Transform in dot notation to make sure it works
    const update = Object.keys(graphQLConfig).reduce((acc, key) => {
      return {
        [GraphQLConfigKey]: _objectSpread(_objectSpread({}, acc[GraphQLConfigKey]), {}, {
          [key]: graphQLConfig[key]
        })
      };
    }, {
      [GraphQLConfigKey]: {}
    });
    await this.databaseController.update(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, update, {
      upsert: true
    });
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return {
      response: {
        result: true
      }
    };
  }
  _getCachedGraphQLConfig() {
    return this.cacheController.graphQL.get(this.configCacheKey);
  }
  _putCachedGraphQLConfig(graphQLConfig) {
    return this.cacheController.graphQL.put(this.configCacheKey, graphQLConfig, 60000);
  }
  _validateGraphQLConfig(graphQLConfig) {
    const errorMessages = [];
    if (!graphQLConfig) {
      errorMessages.push('cannot be undefined, null or empty');
    } else if (!isValidSimpleObject(graphQLConfig)) {
      errorMessages.push('must be a valid object');
    } else {
      const {
          enabledForClasses = null,
          disabledForClasses = null,
          classConfigs = null
        } = graphQLConfig,
        invalidKeys = _objectWithoutProperties(graphQLConfig, _excluded);
      if (Object.keys(invalidKeys).length) {
        errorMessages.push(`encountered invalid keys: [${Object.keys(invalidKeys)}]`);
      }
      if (enabledForClasses !== null && !isValidStringArray(enabledForClasses)) {
        errorMessages.push(`"enabledForClasses" is not a valid array`);
      }
      if (disabledForClasses !== null && !isValidStringArray(disabledForClasses)) {
        errorMessages.push(`"disabledForClasses" is not a valid array`);
      }
      if (classConfigs !== null) {
        if (Array.isArray(classConfigs)) {
          classConfigs.forEach(classConfig => {
            const errorMessage = this._validateClassConfig(classConfig);
            if (errorMessage) {
              errorMessages.push(`classConfig:${classConfig.className} is invalid because ${errorMessage}`);
            }
          });
        } else {
          errorMessages.push(`"classConfigs" is not a valid array`);
        }
      }
    }
    if (errorMessages.length) {
      throw new Error(`Invalid graphQLConfig: ${errorMessages.join('; ')}`);
    }
  }
  _validateClassConfig(classConfig) {
    if (!isValidSimpleObject(classConfig)) {
      return 'it must be a valid object';
    } else {
      const {
          className,
          type = null,
          query = null,
          mutation = null
        } = classConfig,
        invalidKeys = _objectWithoutProperties(classConfig, _excluded2);
      if (Object.keys(invalidKeys).length) {
        return `"invalidKeys" [${Object.keys(invalidKeys)}] should not be present`;
      }
      if (typeof className !== 'string' || !className.trim().length) {
        // TODO consider checking class exists in schema?
        return `"className" must be a valid string`;
      }
      if (type !== null) {
        if (!isValidSimpleObject(type)) {
          return `"type" must be a valid object`;
        }
        const {
            inputFields = null,
            outputFields = null,
            constraintFields = null,
            sortFields = null
          } = type,
          invalidKeys = _objectWithoutProperties(type, _excluded3);
        if (Object.keys(invalidKeys).length) {
          return `"type" contains invalid keys, [${Object.keys(invalidKeys)}]`;
        } else if (outputFields !== null && !isValidStringArray(outputFields)) {
          return `"outputFields" must be a valid string array`;
        } else if (constraintFields !== null && !isValidStringArray(constraintFields)) {
          return `"constraintFields" must be a valid string array`;
        }
        if (sortFields !== null) {
          if (Array.isArray(sortFields)) {
            let errorMessage;
            sortFields.every((sortField, index) => {
              if (!isValidSimpleObject(sortField)) {
                errorMessage = `"sortField" at index ${index} is not a valid object`;
                return false;
              } else {
                const {
                    field,
                    asc,
                    desc
                  } = sortField,
                  invalidKeys = _objectWithoutProperties(sortField, _excluded4);
                if (Object.keys(invalidKeys).length) {
                  errorMessage = `"sortField" at index ${index} contains invalid keys, [${Object.keys(invalidKeys)}]`;
                  return false;
                } else {
                  if (typeof field !== 'string' || field.trim().length === 0) {
                    errorMessage = `"sortField" at index ${index} did not provide the "field" as a string`;
                    return false;
                  } else if (typeof asc !== 'boolean' || typeof desc !== 'boolean') {
                    errorMessage = `"sortField" at index ${index} did not provide "asc" or "desc" as booleans`;
                    return false;
                  }
                }
              }
              return true;
            });
            if (errorMessage) {
              return errorMessage;
            }
          } else {
            return `"sortFields" must be a valid array.`;
          }
        }
        if (inputFields !== null) {
          if (isValidSimpleObject(inputFields)) {
            const {
                create = null,
                update = null
              } = inputFields,
              invalidKeys = _objectWithoutProperties(inputFields, _excluded5);
            if (Object.keys(invalidKeys).length) {
              return `"inputFields" contains invalid keys: [${Object.keys(invalidKeys)}]`;
            } else {
              if (update !== null && !isValidStringArray(update)) {
                return `"inputFields.update" must be a valid string array`;
              } else if (create !== null) {
                if (!isValidStringArray(create)) {
                  return `"inputFields.create" must be a valid string array`;
                } else if (className === '_User') {
                  if (!create.includes('username') || !create.includes('password')) {
                    return `"inputFields.create" must include required fields, username and password`;
                  }
                }
              }
            }
          } else {
            return `"inputFields" must be a valid object`;
          }
        }
      }
      if (query !== null) {
        if (isValidSimpleObject(query)) {
          const {
              find = null,
              get = null,
              findAlias = null,
              getAlias = null
            } = query,
            invalidKeys = _objectWithoutProperties(query, _excluded6);
          if (Object.keys(invalidKeys).length) {
            return `"query" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          } else if (find !== null && typeof find !== 'boolean') {
            return `"query.find" must be a boolean`;
          } else if (get !== null && typeof get !== 'boolean') {
            return `"query.get" must be a boolean`;
          } else if (findAlias !== null && typeof findAlias !== 'string') {
            return `"query.findAlias" must be a string`;
          } else if (getAlias !== null && typeof getAlias !== 'string') {
            return `"query.getAlias" must be a string`;
          }
        } else {
          return `"query" must be a valid object`;
        }
      }
      if (mutation !== null) {
        if (isValidSimpleObject(mutation)) {
          const {
              create = null,
              update = null,
              destroy = null,
              createAlias = null,
              updateAlias = null,
              destroyAlias = null
            } = mutation,
            invalidKeys = _objectWithoutProperties(mutation, _excluded7);
          if (Object.keys(invalidKeys).length) {
            return `"mutation" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          }
          if (create !== null && typeof create !== 'boolean') {
            return `"mutation.create" must be a boolean`;
          }
          if (update !== null && typeof update !== 'boolean') {
            return `"mutation.update" must be a boolean`;
          }
          if (destroy !== null && typeof destroy !== 'boolean') {
            return `"mutation.destroy" must be a boolean`;
          }
          if (createAlias !== null && typeof createAlias !== 'string') {
            return `"mutation.createAlias" must be a string`;
          }
          if (updateAlias !== null && typeof updateAlias !== 'string') {
            return `"mutation.updateAlias" must be a string`;
          }
          if (destroyAlias !== null && typeof destroyAlias !== 'string') {
            return `"mutation.destroyAlias" must be a string`;
          }
        } else {
          return `"mutation" must be a valid object`;
        }
      }
    }
  }
}
const isValidStringArray = function (array) {
  return Array.isArray(array) ? !array.some(s => typeof s !== 'string' || s.trim().length < 1) : false;
};
/**
 * Ensures the obj is a simple JSON/{}
 * object, i.e. not an array, null, date
 * etc.
 */
const isValidSimpleObject = function (obj) {
  return typeof obj === 'object' && !Array.isArray(obj) && obj !== null && obj instanceof Date !== true && obj instanceof Promise !== true;
};
var _default = exports.default = ParseGraphQLController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ2FjaGVDb250cm9sbGVyIiwiX2V4Y2x1ZGVkIiwiX2V4Y2x1ZGVkMiIsIl9leGNsdWRlZDMiLCJfZXhjbHVkZWQ0IiwiX2V4Y2x1ZGVkNSIsIl9leGNsdWRlZDYiLCJfZXhjbHVkZWQ3IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwidCIsIm8iLCJyIiwiaSIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllc0xvb3NlIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibiIsImxlbmd0aCIsImluZGV4T2YiLCJwcm9wZXJ0eUlzRW51bWVyYWJsZSIsImNhbGwiLCJoYXNPd25Qcm9wZXJ0eSIsIm93bktleXMiLCJrZXlzIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsIl90b1Byb3BlcnR5S2V5IiwidmFsdWUiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiVHlwZUVycm9yIiwiU3RyaW5nIiwiTnVtYmVyIiwiR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSIsImV4cG9ydHMiLCJHcmFwaFFMQ29uZmlnSWQiLCJHcmFwaFFMQ29uZmlnS2V5IiwiUGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiZGF0YWJhc2VDb250cm9sbGVyIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJpc01vdW50ZWQiLCJtb3VudEdyYXBoUUwiLCJjb25maWdDYWNoZUtleSIsImdldEdyYXBoUUxDb25maWciLCJfY2FjaGVkQ29uZmlnIiwiX2dldENhY2hlZEdyYXBoUUxDb25maWciLCJyZXN1bHRzIiwiZmluZCIsIm9iamVjdElkIiwibGltaXQiLCJncmFwaFFMQ29uZmlnIiwiX3B1dENhY2hlZEdyYXBoUUxDb25maWciLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIiwiX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyIsInVwZGF0ZSIsInJlZHVjZSIsImFjYyIsImtleSIsInVwc2VydCIsInJlc3BvbnNlIiwicmVzdWx0IiwiZ3JhcGhRTCIsImdldCIsInB1dCIsImVycm9yTWVzc2FnZXMiLCJpc1ZhbGlkU2ltcGxlT2JqZWN0IiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJjbGFzc0NvbmZpZ3MiLCJpbnZhbGlkS2V5cyIsImlzVmFsaWRTdHJpbmdBcnJheSIsIkFycmF5IiwiaXNBcnJheSIsImNsYXNzQ29uZmlnIiwiZXJyb3JNZXNzYWdlIiwiX3ZhbGlkYXRlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJFcnJvciIsImpvaW4iLCJ0eXBlIiwicXVlcnkiLCJtdXRhdGlvbiIsInRyaW0iLCJpbnB1dEZpZWxkcyIsIm91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJzb3J0RmllbGRzIiwiZXZlcnkiLCJzb3J0RmllbGQiLCJpbmRleCIsImZpZWxkIiwiYXNjIiwiZGVzYyIsImNyZWF0ZSIsImluY2x1ZGVzIiwiZmluZEFsaWFzIiwiZ2V0QWxpYXMiLCJkZXN0cm95IiwiY3JlYXRlQWxpYXMiLCJ1cGRhdGVBbGlhcyIsImRlc3Ryb3lBbGlhcyIsImFycmF5Iiwic29tZSIsInMiLCJvYmoiLCJEYXRlIiwiUHJvbWlzZSIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uLy4uL2xpYi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDYWNoZUNvbnRyb2xsZXIgZnJvbSAnLi9DYWNoZUNvbnRyb2xsZXInO1xuXG5jb25zdCBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lID0gJ19HcmFwaFFMQ29uZmlnJztcbmNvbnN0IEdyYXBoUUxDb25maWdJZCA9ICcxJztcbmNvbnN0IEdyYXBoUUxDb25maWdLZXkgPSAnY29uZmlnJztcblxuY2xhc3MgUGFyc2VHcmFwaFFMQ29udHJvbGxlciB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcjtcbiAgaXNNb3VudGVkOiBib29sZWFuO1xuICBjb25maWdDYWNoZUtleTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcixcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoXG4gICAgICAgIGBQYXJzZUdyYXBoUUxDb250cm9sbGVyIHJlcXVpcmVzIGEgXCJkYXRhYmFzZUNvbnRyb2xsZXJcIiB0byBiZSBpbnN0YW50aWF0ZWQuYFxuICAgICAgKTtcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IHBhcmFtcy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgdGhpcy5pc01vdW50ZWQgPSAhIXBhcmFtcy5tb3VudEdyYXBoUUw7XG4gICAgdGhpcy5jb25maWdDYWNoZUtleSA9IEdyYXBoUUxDb25maWdLZXk7XG4gIH1cblxuICBhc3luYyBnZXRHcmFwaFFMQ29uZmlnKCk6IFByb21pc2U8UGFyc2VHcmFwaFFMQ29uZmlnPiB7XG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICBjb25zdCBfY2FjaGVkQ29uZmlnID0gYXdhaXQgdGhpcy5fZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZygpO1xuICAgICAgaWYgKF9jYWNoZWRDb25maWcpIHtcbiAgICAgICAgcmV0dXJuIF9jYWNoZWRDb25maWc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLmZpbmQoXG4gICAgICBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLFxuICAgICAgeyBvYmplY3RJZDogR3JhcGhRTENvbmZpZ0lkIH0sXG4gICAgICB7IGxpbWl0OiAxIH1cbiAgICApO1xuXG4gICAgbGV0IGdyYXBoUUxDb25maWc7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNvbmZpZyBpbiB0aGUgZGF0YWJhc2UgLSByZXR1cm4gZW1wdHkgY29uZmlnLlxuICAgICAgcmV0dXJuIHt9O1xuICAgIH0gZWxzZSB7XG4gICAgICBncmFwaFFMQ29uZmlnID0gcmVzdWx0c1swXVtHcmFwaFFMQ29uZmlnS2V5XTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIHRoaXMuX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGdyYXBoUUxDb25maWc7XG4gIH1cblxuICBhc3luYyB1cGRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZyk6IFByb21pc2U8UGFyc2VHcmFwaFFMQ29uZmlnPiB7XG4gICAgLy8gdGhyb3dzIGlmIGludmFsaWRcbiAgICB0aGlzLl92YWxpZGF0ZUdyYXBoUUxDb25maWcoXG4gICAgICBncmFwaFFMQ29uZmlnIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZ3JhcGhRTENvbmZpZyEnKVxuICAgICk7XG5cbiAgICAvLyBUcmFuc2Zvcm0gaW4gZG90IG5vdGF0aW9uIHRvIG1ha2Ugc3VyZSBpdCB3b3Jrc1xuICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGdyYXBoUUxDb25maWcpLnJlZHVjZShcbiAgICAgIChhY2MsIGtleSkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIFtHcmFwaFFMQ29uZmlnS2V5XToge1xuICAgICAgICAgICAgLi4uYWNjW0dyYXBoUUxDb25maWdLZXldLFxuICAgICAgICAgICAgW2tleV06IGdyYXBoUUxDb25maWdba2V5XSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHsgW0dyYXBoUUxDb25maWdLZXldOiB7fSB9XG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLnVwZGF0ZShcbiAgICAgIEdyYXBoUUxDb25maWdDbGFzc05hbWUsXG4gICAgICB7IG9iamVjdElkOiBHcmFwaFFMQ29uZmlnSWQgfSxcbiAgICAgIHVwZGF0ZSxcbiAgICAgIHsgdXBzZXJ0OiB0cnVlIH1cbiAgICApO1xuXG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICB0aGlzLl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICAgIH1cblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IHJlc3VsdDogdHJ1ZSB9IH07XG4gIH1cblxuICBfZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZygpIHtcbiAgICByZXR1cm4gdGhpcy5jYWNoZUNvbnRyb2xsZXIuZ3JhcGhRTC5nZXQodGhpcy5jb25maWdDYWNoZUtleSk7XG4gIH1cblxuICBfcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICByZXR1cm4gdGhpcy5jYWNoZUNvbnRyb2xsZXIuZ3JhcGhRTC5wdXQodGhpcy5jb25maWdDYWNoZUtleSwgZ3JhcGhRTENvbmZpZywgNjAwMDApO1xuICB9XG5cbiAgX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnKTogdm9pZCB7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlczogc3RyaW5nID0gW107XG4gICAgaWYgKCFncmFwaFFMQ29uZmlnKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ2Nhbm5vdCBiZSB1bmRlZmluZWQsIG51bGwgb3IgZW1wdHknKTtcbiAgICB9IGVsc2UgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KGdyYXBoUUxDb25maWcpKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ211c3QgYmUgYSB2YWxpZCBvYmplY3QnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qge1xuICAgICAgICBlbmFibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGRpc2FibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGNsYXNzQ29uZmlncyA9IG51bGwsXG4gICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICB9ID0gZ3JhcGhRTENvbmZpZztcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBlbmNvdW50ZXJlZCBpbnZhbGlkIGtleXM6IFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYCk7XG4gICAgICB9XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShlbmFibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImVuYWJsZWRGb3JDbGFzc2VzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShkaXNhYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJkaXNhYmxlZEZvckNsYXNzZXNcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKGNsYXNzQ29uZmlncyAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjbGFzc0NvbmZpZ3MpKSB7XG4gICAgICAgICAgY2xhc3NDb25maWdzLmZvckVhY2goY2xhc3NDb25maWcgPT4ge1xuICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gdGhpcy5fdmFsaWRhdGVDbGFzc0NvbmZpZyhjbGFzc0NvbmZpZyk7XG4gICAgICAgICAgICBpZiAoZXJyb3JNZXNzYWdlKSB7XG4gICAgICAgICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChcbiAgICAgICAgICAgICAgICBgY2xhc3NDb25maWc6JHtjbGFzc0NvbmZpZy5jbGFzc05hbWV9IGlzIGludmFsaWQgYmVjYXVzZSAke2Vycm9yTWVzc2FnZX1gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImNsYXNzQ29uZmlnc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVycm9yTWVzc2FnZXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZ3JhcGhRTENvbmZpZzogJHtlcnJvck1lc3NhZ2VzLmpvaW4oJzsgJyl9YCk7XG4gICAgfVxuICB9XG5cbiAgX3ZhbGlkYXRlQ2xhc3NDb25maWcoY2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyk6IHN0cmluZyB8IHZvaWQge1xuICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChjbGFzc0NvbmZpZykpIHtcbiAgICAgIHJldHVybiAnaXQgbXVzdCBiZSBhIHZhbGlkIG9iamVjdCc7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCB0eXBlID0gbnVsbCwgcXVlcnkgPSBudWxsLCBtdXRhdGlvbiA9IG51bGwsIC4uLmludmFsaWRLZXlzIH0gPSBjbGFzc0NvbmZpZztcbiAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBgXCJpbnZhbGlkS2V5c1wiIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dIHNob3VsZCBub3QgYmUgcHJlc2VudGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGNsYXNzTmFtZSAhPT0gJ3N0cmluZycgfHwgIWNsYXNzTmFtZS50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgIC8vIFRPRE8gY29uc2lkZXIgY2hlY2tpbmcgY2xhc3MgZXhpc3RzIGluIHNjaGVtYT9cbiAgICAgICAgcmV0dXJuIGBcImNsYXNzTmFtZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGUgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHR5cGUpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgaW5wdXRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIG91dHB1dEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgY29uc3RyYWludEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgc29ydEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgfSA9IHR5cGU7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgfSBlbHNlIGlmIChvdXRwdXRGaWVsZHMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShvdXRwdXRGaWVsZHMpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcIm91dHB1dEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRGaWVsZHMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShjb25zdHJhaW50RmllbGRzKSkge1xuICAgICAgICAgIHJldHVybiBgXCJjb25zdHJhaW50RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNvcnRGaWVsZHMgIT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShzb3J0RmllbGRzKSkge1xuICAgICAgICAgICAgbGV0IGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIHNvcnRGaWVsZHMuZXZlcnkoKHNvcnRGaWVsZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHNvcnRGaWVsZCkpIHtcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBpcyBub3QgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MsIC4uLmludmFsaWRLZXlzIH0gPSBzb3J0RmllbGQ7XG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoXG4gICAgICAgICAgICAgICAgICAgIGludmFsaWRLZXlzXG4gICAgICAgICAgICAgICAgICApfV1gO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkICE9PSAnc3RyaW5nJyB8fCBmaWVsZC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGRpZCBub3QgcHJvdmlkZSB0aGUgXCJmaWVsZFwiIGFzIGEgc3RyaW5nYDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXNjICE9PSAnYm9vbGVhbicgfHwgdHlwZW9mIGRlc2MgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBkaWQgbm90IHByb3ZpZGUgXCJhc2NcIiBvciBcImRlc2NcIiBhcyBib29sZWFuc2A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChlcnJvck1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGBcInNvcnRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgYXJyYXkuYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlucHV0RmllbGRzICE9PSBudWxsKSB7XG4gICAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QoaW5wdXRGaWVsZHMpKSB7XG4gICAgICAgICAgICBjb25zdCB7IGNyZWF0ZSA9IG51bGwsIHVwZGF0ZSA9IG51bGwsIC4uLmludmFsaWRLZXlzIH0gPSBpbnB1dEZpZWxkcztcbiAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkc1wiIGNvbnRhaW5zIGludmFsaWQga2V5czogWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKHVwZGF0ZSAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KHVwZGF0ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMudXBkYXRlXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoY3JlYXRlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkU3RyaW5nQXJyYXkoY3JlYXRlKSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLmNyZWF0ZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNyZWF0ZS5pbmNsdWRlcygndXNlcm5hbWUnKSB8fCAhY3JlYXRlLmluY2x1ZGVzKCdwYXNzd29yZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy5jcmVhdGVcIiBtdXN0IGluY2x1ZGUgcmVxdWlyZWQgZmllbGRzLCB1c2VybmFtZSBhbmQgcGFzc3dvcmRgO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChxdWVyeSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChxdWVyeSkpIHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBmaW5kID0gbnVsbCxcbiAgICAgICAgICAgIGdldCA9IG51bGwsXG4gICAgICAgICAgICBmaW5kQWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgZ2V0QWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgICB9ID0gcXVlcnk7XG4gICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeVwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmluZCAhPT0gbnVsbCAmJiB0eXBlb2YgZmluZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZmluZFwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGdldCAhPT0gbnVsbCAmJiB0eXBlb2YgZ2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5nZXRcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfSBlbHNlIGlmIChmaW5kQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGZpbmRBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5maW5kQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGdldEFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBnZXRBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5nZXRBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFwicXVlcnlcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG11dGF0aW9uICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KG11dGF0aW9uKSkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIGNyZWF0ZSA9IG51bGwsXG4gICAgICAgICAgICB1cGRhdGUgPSBudWxsLFxuICAgICAgICAgICAgZGVzdHJveSA9IG51bGwsXG4gICAgICAgICAgICBjcmVhdGVBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICB1cGRhdGVBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICBkZXN0cm95QWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgICB9ID0gbXV0YXRpb247XG4gICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvblwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY3JlYXRlICE9PSBudWxsICYmIHR5cGVvZiBjcmVhdGUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmNyZWF0ZVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHVwZGF0ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdXBkYXRlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi51cGRhdGVcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkZXN0cm95ICE9PSBudWxsICYmIHR5cGVvZiBkZXN0cm95ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5kZXN0cm95XCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY3JlYXRlQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGNyZWF0ZUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmNyZWF0ZUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh1cGRhdGVBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgdXBkYXRlQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24udXBkYXRlQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlc3Ryb3lBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZGVzdHJveUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmRlc3Ryb3lBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb25cIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5jb25zdCBpc1ZhbGlkU3RyaW5nQXJyYXkgPSBmdW5jdGlvbiAoYXJyYXkpOiBib29sZWFuIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXJyYXkpXG4gICAgPyAhYXJyYXkuc29tZShzID0+IHR5cGVvZiBzICE9PSAnc3RyaW5nJyB8fCBzLnRyaW0oKS5sZW5ndGggPCAxKVxuICAgIDogZmFsc2U7XG59O1xuLyoqXG4gKiBFbnN1cmVzIHRoZSBvYmogaXMgYSBzaW1wbGUgSlNPTi97fVxuICogb2JqZWN0LCBpLmUuIG5vdCBhbiBhcnJheSwgbnVsbCwgZGF0ZVxuICogZXRjLlxuICovXG5jb25zdCBpc1ZhbGlkU2ltcGxlT2JqZWN0ID0gZnVuY3Rpb24gKG9iaik6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgIUFycmF5LmlzQXJyYXkob2JqKSAmJlxuICAgIG9iaiAhPT0gbnVsbCAmJlxuICAgIG9iaiBpbnN0YW5jZW9mIERhdGUgIT09IHRydWUgJiZcbiAgICBvYmogaW5zdGFuY2VvZiBQcm9taXNlICE9PSB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENvbmZpZyB7XG4gIGVuYWJsZWRGb3JDbGFzc2VzPzogc3RyaW5nW107XG4gIGRpc2FibGVkRm9yQ2xhc3Nlcz86IHN0cmluZ1tdO1xuICBjbGFzc0NvbmZpZ3M/OiBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIHtcbiAgY2xhc3NOYW1lOiBzdHJpbmc7XG4gIC8qIFRoZSBgdHlwZWAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIGhvdyB0aGUgY2xhc3MgdHlwZXMgYXJlIGdlbmVyYXRlZCAqL1xuICB0eXBlOiA/e1xuICAgIC8qIEZpZWxkcyB0aGF0IGFyZSBhbGxvd2VkIHdoZW4gY3JlYXRpbmcgb3IgdXBkYXRpbmcgYW4gb2JqZWN0LiAqL1xuICAgIGlucHV0RmllbGRzOiA/e1xuICAgICAgLyogTGVhdmUgYmxhbmsgdG8gYWxsb3cgYWxsIGF2YWlsYWJsZSBmaWVsZHMgaW4gdGhlIHNjaGVtYS4gKi9cbiAgICAgIGNyZWF0ZT86IHN0cmluZ1tdLFxuICAgICAgdXBkYXRlPzogc3RyaW5nW10sXG4gICAgfSxcbiAgICAvKiBGaWVsZHMgb24gdGhlIGVkZ2VzIHRoYXQgY2FuIGJlIHJlc29sdmVkIGZyb20gYSBxdWVyeSwgaS5lLiB0aGUgUmVzdWx0IFR5cGUuICovXG4gICAgb3V0cHV0RmllbGRzOiA/KHN0cmluZ1tdKSxcbiAgICAvKiBGaWVsZHMgYnkgd2hpY2ggYSBxdWVyeSBjYW4gYmUgZmlsdGVyZWQsIGkuZS4gdGhlIGB3aGVyZWAgb2JqZWN0LiAqL1xuICAgIGNvbnN0cmFpbnRGaWVsZHM6ID8oc3RyaW5nW10pLFxuICAgIC8qIEZpZWxkcyBieSB3aGljaCBhIHF1ZXJ5IGNhbiBiZSBzb3J0ZWQ7ICovXG4gICAgc29ydEZpZWxkczogPyh7XG4gICAgICBmaWVsZDogc3RyaW5nLFxuICAgICAgYXNjOiBib29sZWFuLFxuICAgICAgZGVzYzogYm9vbGVhbixcbiAgICB9W10pLFxuICB9O1xuICAvKiBUaGUgYHF1ZXJ5YCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgcXVlcmllcyBhcmUgZ2VuZXJhdGVkICovXG4gIHF1ZXJ5OiA/e1xuICAgIGdldDogP2Jvb2xlYW4sXG4gICAgZmluZDogP2Jvb2xlYW4sXG4gICAgZmluZEFsaWFzOiA/U3RyaW5nLFxuICAgIGdldEFsaWFzOiA/U3RyaW5nLFxuICB9O1xuICAvKiBUaGUgYG11dGF0aW9uYCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgbXV0YXRpb25zIGFyZSBnZW5lcmF0ZWQgKi9cbiAgbXV0YXRpb246ID97XG4gICAgY3JlYXRlOiA/Ym9vbGVhbixcbiAgICB1cGRhdGU6ID9ib29sZWFuLFxuICAgIC8vIGRlbGV0ZSBpcyBhIHJlc2VydmVkIGtleSB3b3JkIGluIGpzXG4gICAgZGVzdHJveTogP2Jvb2xlYW4sXG4gICAgY3JlYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgdXBkYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgZGVzdHJveUFsaWFzOiA/U3RyaW5nLFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuZXhwb3J0IHsgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSwgR3JhcGhRTENvbmZpZ0lkLCBHcmFwaFFMQ29uZmlnS2V5IH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLGtCQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxtQkFBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsZ0JBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUFnRCxNQUFBRyxTQUFBO0VBQUFDLFVBQUE7RUFBQUMsVUFBQTtFQUFBQyxVQUFBO0VBQUFDLFVBQUE7RUFBQUMsVUFBQTtFQUFBQyxVQUFBO0FBQUEsU0FBQVYsdUJBQUFXLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFBQSxTQUFBRyx5QkFBQUgsQ0FBQSxFQUFBSSxDQUFBLGdCQUFBSixDQUFBLGlCQUFBSyxDQUFBLEVBQUFDLENBQUEsRUFBQUMsQ0FBQSxHQUFBQyw2QkFBQSxDQUFBUixDQUFBLEVBQUFJLENBQUEsT0FBQUssTUFBQSxDQUFBQyxxQkFBQSxRQUFBQyxDQUFBLEdBQUFGLE1BQUEsQ0FBQUMscUJBQUEsQ0FBQVYsQ0FBQSxRQUFBTSxDQUFBLE1BQUFBLENBQUEsR0FBQUssQ0FBQSxD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LENBQUNTLElBQUksQ0FBQzhELFdBQVcsQ0FBQyxHQUFHO1VBQzFFO1VBQ0EsSUFBSXdCLE1BQU0sS0FBSyxJQUFJLElBQUksT0FBT0EsTUFBTSxLQUFLLFNBQVMsRUFBRTtZQUNsRCxPQUFPLHFDQUFxQztVQUM5QztVQUNBLElBQUl2QyxNQUFNLEtBQUssSUFBSSxJQUFJLE9BQU9BLE1BQU0sS0FBSyxTQUFTLEVBQUU7WUFDbEQsT0FBTyxxQ0FBcUM7VUFDOUM7VUFDQSxJQUFJMkMsT0FBTyxLQUFLLElBQUksSUFBSSxPQUFPQSxPQUFPLEtBQUssU0FBUyxFQUFFO1lBQ3BELE9BQU8sc0NBQXNDO1VBQy9DO1VBQ0EsSUFBSUMsV0FBVyxLQUFLLElBQUksSUFBSSxPQUFPQSxXQUFXLEtBQUssUUFBUSxFQUFFO1lBQzNELE9BQU8seUNBQXlDO1VBQ2xEO1VBQ0EsSUFBSUMsV0FBVyxLQUFLLElBQUksSUFBSSxPQUFPQSxXQUFXLEtBQUssUUFBUSxFQUFFO1lBQzNELE9BQU8seUNBQXlDO1VBQ2xEO1VBQ0EsSUFBSUMsWUFBWSxLQUFLLElBQUksSUFBSSxPQUFPQSxZQUFZLEtBQUssUUFBUSxFQUFFO1lBQzdELE9BQU8sMENBQTBDO1VBQ25EO1FBQ0YsQ0FBQyxNQUFNO1VBQ0wsT0FBTyxtQ0FBbUM7UUFDNUM7TUFDRjtJQUNGO0VBQ0Y7QUFDRjtBQUVBLE1BQU05QixrQkFBa0IsR0FBRyxTQUFBQSxDQUFVK0IsS0FBSyxFQUFXO0VBQ25ELE9BQU85QixLQUFLLENBQUNDLE9BQU8sQ0FBQzZCLEtBQUssQ0FBQyxHQUN2QixDQUFDQSxLQUFLLENBQUNDLElBQUksQ0FBQ0MsQ0FBQyxJQUFJLE9BQU9BLENBQUMsS0FBSyxRQUFRLElBQUlBLENBQUMsQ0FBQ3JCLElBQUksQ0FBQyxDQUFDLENBQUNqRixNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQzlELEtBQUs7QUFDWCxDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1nRSxtQkFBbUIsR0FBRyxTQUFBQSxDQUFVdUMsR0FBRyxFQUFXO0VBQ2xELE9BQ0UsT0FBT0EsR0FBRyxLQUFLLFFBQVEsSUFDdkIsQ0FBQ2pDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDZ0MsR0FBRyxDQUFDLElBQ25CQSxHQUFHLEtBQUssSUFBSSxJQUNaQSxHQUFHLFlBQVlDLElBQUksS0FBSyxJQUFJLElBQzVCRCxHQUFHLFlBQVlFLE9BQU8sS0FBSyxJQUFJO0FBRW5DLENBQUM7QUFBQyxJQUFBQyxRQUFBLEdBQUE1RSxPQUFBLENBQUF4QyxPQUFBLEdBZ0RhMkMsc0JBQXNCIiwiaWdub3JlTGlzdCI6W119