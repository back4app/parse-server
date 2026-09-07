"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLConfigKey = exports.GraphQLConfigId = exports.GraphQLConfigClassName = void 0;
var _requiredParameter = _interopRequireDefault(require("../../lib/requiredParameter"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _CacheController = _interopRequireDefault(require("./CacheController"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
        [GraphQLConfigKey]: {
          ...acc[GraphQLConfigKey],
          [key]: graphQLConfig[key]
        }
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
        classConfigs = null,
        ...invalidKeys
      } = graphQLConfig;
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
        mutation = null,
        ...invalidKeys
      } = classConfig;
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
          sortFields = null,
          ...invalidKeys
        } = type;
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
                  desc,
                  ...invalidKeys
                } = sortField;
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
              update = null,
              ...invalidKeys
            } = inputFields;
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
            getAlias = null,
            ...invalidKeys
          } = query;
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
            destroyAlias = null,
            ...invalidKeys
          } = mutation;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ2FjaGVDb250cm9sbGVyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSIsImV4cG9ydHMiLCJHcmFwaFFMQ29uZmlnSWQiLCJHcmFwaFFMQ29uZmlnS2V5IiwiUGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiZGF0YWJhc2VDb250cm9sbGVyIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJpc01vdW50ZWQiLCJtb3VudEdyYXBoUUwiLCJjb25maWdDYWNoZUtleSIsImdldEdyYXBoUUxDb25maWciLCJfY2FjaGVkQ29uZmlnIiwiX2dldENhY2hlZEdyYXBoUUxDb25maWciLCJyZXN1bHRzIiwiZmluZCIsIm9iamVjdElkIiwibGltaXQiLCJncmFwaFFMQ29uZmlnIiwibGVuZ3RoIiwiX3B1dENhY2hlZEdyYXBoUUxDb25maWciLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIiwiX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyIsInVwZGF0ZSIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJhY2MiLCJrZXkiLCJ1cHNlcnQiLCJyZXNwb25zZSIsInJlc3VsdCIsImdyYXBoUUwiLCJnZXQiLCJwdXQiLCJlcnJvck1lc3NhZ2VzIiwicHVzaCIsImlzVmFsaWRTaW1wbGVPYmplY3QiLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImNsYXNzQ29uZmlncyIsImludmFsaWRLZXlzIiwiaXNWYWxpZFN0cmluZ0FycmF5IiwiQXJyYXkiLCJpc0FycmF5IiwiZm9yRWFjaCIsImNsYXNzQ29uZmlnIiwiZXJyb3JNZXNzYWdlIiwiX3ZhbGlkYXRlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJFcnJvciIsImpvaW4iLCJ0eXBlIiwicXVlcnkiLCJtdXRhdGlvbiIsInRyaW0iLCJpbnB1dEZpZWxkcyIsIm91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJzb3J0RmllbGRzIiwiZXZlcnkiLCJzb3J0RmllbGQiLCJpbmRleCIsImZpZWxkIiwiYXNjIiwiZGVzYyIsImNyZWF0ZSIsImluY2x1ZGVzIiwiZmluZEFsaWFzIiwiZ2V0QWxpYXMiLCJkZXN0cm95IiwiY3JlYXRlQWxpYXMiLCJ1cGRhdGVBbGlhcyIsImRlc3Ryb3lBbGlhcyIsImFycmF5Iiwic29tZSIsInMiLCJvYmoiLCJEYXRlIiwiUHJvbWlzZSIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uLy4uL2xpYi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDYWNoZUNvbnRyb2xsZXIgZnJvbSAnLi9DYWNoZUNvbnRyb2xsZXInO1xuXG5jb25zdCBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lID0gJ19HcmFwaFFMQ29uZmlnJztcbmNvbnN0IEdyYXBoUUxDb25maWdJZCA9ICcxJztcbmNvbnN0IEdyYXBoUUxDb25maWdLZXkgPSAnY29uZmlnJztcblxuY2xhc3MgUGFyc2VHcmFwaFFMQ29udHJvbGxlciB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcjtcbiAgaXNNb3VudGVkOiBib29sZWFuO1xuICBjb25maWdDYWNoZUtleTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcixcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoXG4gICAgICAgIGBQYXJzZUdyYXBoUUxDb250cm9sbGVyIHJlcXVpcmVzIGEgXCJkYXRhYmFzZUNvbnRyb2xsZXJcIiB0byBiZSBpbnN0YW50aWF0ZWQuYFxuICAgICAgKTtcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IHBhcmFtcy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgdGhpcy5pc01vdW50ZWQgPSAhIXBhcmFtcy5tb3VudEdyYXBoUUw7XG4gICAgdGhpcy5jb25maWdDYWNoZUtleSA9IEdyYXBoUUxDb25maWdLZXk7XG4gIH1cblxuICBhc3luYyBnZXRHcmFwaFFMQ29uZmlnKCk6IFByb21pc2U8UGFyc2VHcmFwaFFMQ29uZmlnPiB7XG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICBjb25zdCBfY2FjaGVkQ29uZmlnID0gYXdhaXQgdGhpcy5fZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZygpO1xuICAgICAgaWYgKF9jYWNoZWRDb25maWcpIHtcbiAgICAgICAgcmV0dXJuIF9jYWNoZWRDb25maWc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLmZpbmQoXG4gICAgICBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLFxuICAgICAgeyBvYmplY3RJZDogR3JhcGhRTENvbmZpZ0lkIH0sXG4gICAgICB7IGxpbWl0OiAxIH1cbiAgICApO1xuXG4gICAgbGV0IGdyYXBoUUxDb25maWc7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNvbmZpZyBpbiB0aGUgZGF0YWJhc2UgLSByZXR1cm4gZW1wdHkgY29uZmlnLlxuICAgICAgcmV0dXJuIHt9O1xuICAgIH0gZWxzZSB7XG4gICAgICBncmFwaFFMQ29uZmlnID0gcmVzdWx0c1swXVtHcmFwaFFMQ29uZmlnS2V5XTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIHRoaXMuX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGdyYXBoUUxDb25maWc7XG4gIH1cblxuICBhc3luYyB1cGRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZyk6IFByb21pc2U8UGFyc2VHcmFwaFFMQ29uZmlnPiB7XG4gICAgLy8gdGhyb3dzIGlmIGludmFsaWRcbiAgICB0aGlzLl92YWxpZGF0ZUdyYXBoUUxDb25maWcoXG4gICAgICBncmFwaFFMQ29uZmlnIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZ3JhcGhRTENvbmZpZyEnKVxuICAgICk7XG5cbiAgICAvLyBUcmFuc2Zvcm0gaW4gZG90IG5vdGF0aW9uIHRvIG1ha2Ugc3VyZSBpdCB3b3Jrc1xuICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGdyYXBoUUxDb25maWcpLnJlZHVjZShcbiAgICAgIChhY2MsIGtleSkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIFtHcmFwaFFMQ29uZmlnS2V5XToge1xuICAgICAgICAgICAgLi4uYWNjW0dyYXBoUUxDb25maWdLZXldLFxuICAgICAgICAgICAgW2tleV06IGdyYXBoUUxDb25maWdba2V5XSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHsgW0dyYXBoUUxDb25maWdLZXldOiB7fSB9XG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLnVwZGF0ZShcbiAgICAgIEdyYXBoUUxDb25maWdDbGFzc05hbWUsXG4gICAgICB7IG9iamVjdElkOiBHcmFwaFFMQ29uZmlnSWQgfSxcbiAgICAgIHVwZGF0ZSxcbiAgICAgIHsgdXBzZXJ0OiB0cnVlIH1cbiAgICApO1xuXG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICB0aGlzLl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICAgIH1cblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IHJlc3VsdDogdHJ1ZSB9IH07XG4gIH1cblxuICBfZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZygpIHtcbiAgICByZXR1cm4gdGhpcy5jYWNoZUNvbnRyb2xsZXIuZ3JhcGhRTC5nZXQodGhpcy5jb25maWdDYWNoZUtleSk7XG4gIH1cblxuICBfcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICByZXR1cm4gdGhpcy5jYWNoZUNvbnRyb2xsZXIuZ3JhcGhRTC5wdXQodGhpcy5jb25maWdDYWNoZUtleSwgZ3JhcGhRTENvbmZpZywgNjAwMDApO1xuICB9XG5cbiAgX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnKTogdm9pZCB7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlczogc3RyaW5nID0gW107XG4gICAgaWYgKCFncmFwaFFMQ29uZmlnKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ2Nhbm5vdCBiZSB1bmRlZmluZWQsIG51bGwgb3IgZW1wdHknKTtcbiAgICB9IGVsc2UgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KGdyYXBoUUxDb25maWcpKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ211c3QgYmUgYSB2YWxpZCBvYmplY3QnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qge1xuICAgICAgICBlbmFibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGRpc2FibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGNsYXNzQ29uZmlncyA9IG51bGwsXG4gICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICB9ID0gZ3JhcGhRTENvbmZpZztcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBlbmNvdW50ZXJlZCBpbnZhbGlkIGtleXM6IFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYCk7XG4gICAgICB9XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShlbmFibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImVuYWJsZWRGb3JDbGFzc2VzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShkaXNhYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJkaXNhYmxlZEZvckNsYXNzZXNcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKGNsYXNzQ29uZmlncyAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjbGFzc0NvbmZpZ3MpKSB7XG4gICAgICAgICAgY2xhc3NDb25maWdzLmZvckVhY2goY2xhc3NDb25maWcgPT4ge1xuICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gdGhpcy5fdmFsaWRhdGVDbGFzc0NvbmZpZyhjbGFzc0NvbmZpZyk7XG4gICAgICAgICAgICBpZiAoZXJyb3JNZXNzYWdlKSB7XG4gICAgICAgICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChcbiAgICAgICAgICAgICAgICBgY2xhc3NDb25maWc6JHtjbGFzc0NvbmZpZy5jbGFzc05hbWV9IGlzIGludmFsaWQgYmVjYXVzZSAke2Vycm9yTWVzc2FnZX1gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImNsYXNzQ29uZmlnc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVycm9yTWVzc2FnZXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZ3JhcGhRTENvbmZpZzogJHtlcnJvck1lc3NhZ2VzLmpvaW4oJzsgJyl9YCk7XG4gICAgfVxuICB9XG5cbiAgX3ZhbGlkYXRlQ2xhc3NDb25maWcoY2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyk6IHN0cmluZyB8IHZvaWQge1xuICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChjbGFzc0NvbmZpZykpIHtcbiAgICAgIHJldHVybiAnaXQgbXVzdCBiZSBhIHZhbGlkIG9iamVjdCc7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCB0eXBlID0gbnVsbCwgcXVlcnkgPSBudWxsLCBtdXRhdGlvbiA9IG51bGwsIC4uLmludmFsaWRLZXlzIH0gPSBjbGFzc0NvbmZpZztcbiAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBgXCJpbnZhbGlkS2V5c1wiIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dIHNob3VsZCBub3QgYmUgcHJlc2VudGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGNsYXNzTmFtZSAhPT0gJ3N0cmluZycgfHwgIWNsYXNzTmFtZS50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgIC8vIFRPRE8gY29uc2lkZXIgY2hlY2tpbmcgY2xhc3MgZXhpc3RzIGluIHNjaGVtYT9cbiAgICAgICAgcmV0dXJuIGBcImNsYXNzTmFtZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGUgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHR5cGUpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgaW5wdXRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIG91dHB1dEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgY29uc3RyYWludEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgc29ydEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgfSA9IHR5cGU7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgfSBlbHNlIGlmIChvdXRwdXRGaWVsZHMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShvdXRwdXRGaWVsZHMpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcIm91dHB1dEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRGaWVsZHMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShjb25zdHJhaW50RmllbGRzKSkge1xuICAgICAgICAgIHJldHVybiBgXCJjb25zdHJhaW50RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNvcnRGaWVsZHMgIT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShzb3J0RmllbGRzKSkge1xuICAgICAgICAgICAgbGV0IGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIHNvcnRGaWVsZHMuZXZlcnkoKHNvcnRGaWVsZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHNvcnRGaWVsZCkpIHtcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBpcyBub3QgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MsIC4uLmludmFsaWRLZXlzIH0gPSBzb3J0RmllbGQ7XG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoXG4gICAgICAgICAgICAgICAgICAgIGludmFsaWRLZXlzXG4gICAgICAgICAgICAgICAgICApfV1gO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkICE9PSAnc3RyaW5nJyB8fCBmaWVsZC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGRpZCBub3QgcHJvdmlkZSB0aGUgXCJmaWVsZFwiIGFzIGEgc3RyaW5nYDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXNjICE9PSAnYm9vbGVhbicgfHwgdHlwZW9mIGRlc2MgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBkaWQgbm90IHByb3ZpZGUgXCJhc2NcIiBvciBcImRlc2NcIiBhcyBib29sZWFuc2A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChlcnJvck1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGBcInNvcnRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgYXJyYXkuYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlucHV0RmllbGRzICE9PSBudWxsKSB7XG4gICAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QoaW5wdXRGaWVsZHMpKSB7XG4gICAgICAgICAgICBjb25zdCB7IGNyZWF0ZSA9IG51bGwsIHVwZGF0ZSA9IG51bGwsIC4uLmludmFsaWRLZXlzIH0gPSBpbnB1dEZpZWxkcztcbiAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkc1wiIGNvbnRhaW5zIGludmFsaWQga2V5czogWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKHVwZGF0ZSAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KHVwZGF0ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMudXBkYXRlXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoY3JlYXRlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkU3RyaW5nQXJyYXkoY3JlYXRlKSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLmNyZWF0ZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNyZWF0ZS5pbmNsdWRlcygndXNlcm5hbWUnKSB8fCAhY3JlYXRlLmluY2x1ZGVzKCdwYXNzd29yZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy5jcmVhdGVcIiBtdXN0IGluY2x1ZGUgcmVxdWlyZWQgZmllbGRzLCB1c2VybmFtZSBhbmQgcGFzc3dvcmRgO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChxdWVyeSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChxdWVyeSkpIHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBmaW5kID0gbnVsbCxcbiAgICAgICAgICAgIGdldCA9IG51bGwsXG4gICAgICAgICAgICBmaW5kQWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgZ2V0QWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgICB9ID0gcXVlcnk7XG4gICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeVwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmluZCAhPT0gbnVsbCAmJiB0eXBlb2YgZmluZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZmluZFwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGdldCAhPT0gbnVsbCAmJiB0eXBlb2YgZ2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5nZXRcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfSBlbHNlIGlmIChmaW5kQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGZpbmRBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5maW5kQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGdldEFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBnZXRBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5nZXRBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFwicXVlcnlcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG11dGF0aW9uICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KG11dGF0aW9uKSkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIGNyZWF0ZSA9IG51bGwsXG4gICAgICAgICAgICB1cGRhdGUgPSBudWxsLFxuICAgICAgICAgICAgZGVzdHJveSA9IG51bGwsXG4gICAgICAgICAgICBjcmVhdGVBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICB1cGRhdGVBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICBkZXN0cm95QWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgICB9ID0gbXV0YXRpb247XG4gICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvblwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY3JlYXRlICE9PSBudWxsICYmIHR5cGVvZiBjcmVhdGUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmNyZWF0ZVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHVwZGF0ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdXBkYXRlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi51cGRhdGVcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkZXN0cm95ICE9PSBudWxsICYmIHR5cGVvZiBkZXN0cm95ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5kZXN0cm95XCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY3JlYXRlQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGNyZWF0ZUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmNyZWF0ZUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh1cGRhdGVBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgdXBkYXRlQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24udXBkYXRlQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlc3Ryb3lBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZGVzdHJveUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmRlc3Ryb3lBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb25cIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5jb25zdCBpc1ZhbGlkU3RyaW5nQXJyYXkgPSBmdW5jdGlvbiAoYXJyYXkpOiBib29sZWFuIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXJyYXkpXG4gICAgPyAhYXJyYXkuc29tZShzID0+IHR5cGVvZiBzICE9PSAnc3RyaW5nJyB8fCBzLnRyaW0oKS5sZW5ndGggPCAxKVxuICAgIDogZmFsc2U7XG59O1xuLyoqXG4gKiBFbnN1cmVzIHRoZSBvYmogaXMgYSBzaW1wbGUgSlNPTi97fVxuICogb2JqZWN0LCBpLmUuIG5vdCBhbiBhcnJheSwgbnVsbCwgZGF0ZVxuICogZXRjLlxuICovXG5jb25zdCBpc1ZhbGlkU2ltcGxlT2JqZWN0ID0gZnVuY3Rpb24gKG9iaik6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgIUFycmF5LmlzQXJyYXkob2JqKSAmJlxuICAgIG9iaiAhPT0gbnVsbCAmJlxuICAgIG9iaiBpbnN0YW5jZW9mIERhdGUgIT09IHRydWUgJiZcbiAgICBvYmogaW5zdGFuY2VvZiBQcm9taXNlICE9PSB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENvbmZpZyB7XG4gIGVuYWJsZWRGb3JDbGFzc2VzPzogc3RyaW5nW107XG4gIGRpc2FibGVkRm9yQ2xhc3Nlcz86IHN0cmluZ1tdO1xuICBjbGFzc0NvbmZpZ3M/OiBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIHtcbiAgY2xhc3NOYW1lOiBzdHJpbmc7XG4gIC8qIFRoZSBgdHlwZWAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIGhvdyB0aGUgY2xhc3MgdHlwZXMgYXJlIGdlbmVyYXRlZCAqL1xuICB0eXBlOiA/e1xuICAgIC8qIEZpZWxkcyB0aGF0IGFyZSBhbGxvd2VkIHdoZW4gY3JlYXRpbmcgb3IgdXBkYXRpbmcgYW4gb2JqZWN0LiAqL1xuICAgIGlucHV0RmllbGRzOiA/e1xuICAgICAgLyogTGVhdmUgYmxhbmsgdG8gYWxsb3cgYWxsIGF2YWlsYWJsZSBmaWVsZHMgaW4gdGhlIHNjaGVtYS4gKi9cbiAgICAgIGNyZWF0ZT86IHN0cmluZ1tdLFxuICAgICAgdXBkYXRlPzogc3RyaW5nW10sXG4gICAgfSxcbiAgICAvKiBGaWVsZHMgb24gdGhlIGVkZ2VzIHRoYXQgY2FuIGJlIHJlc29sdmVkIGZyb20gYSBxdWVyeSwgaS5lLiB0aGUgUmVzdWx0IFR5cGUuICovXG4gICAgb3V0cHV0RmllbGRzOiA/KHN0cmluZ1tdKSxcbiAgICAvKiBGaWVsZHMgYnkgd2hpY2ggYSBxdWVyeSBjYW4gYmUgZmlsdGVyZWQsIGkuZS4gdGhlIGB3aGVyZWAgb2JqZWN0LiAqL1xuICAgIGNvbnN0cmFpbnRGaWVsZHM6ID8oc3RyaW5nW10pLFxuICAgIC8qIEZpZWxkcyBieSB3aGljaCBhIHF1ZXJ5IGNhbiBiZSBzb3J0ZWQ7ICovXG4gICAgc29ydEZpZWxkczogPyh7XG4gICAgICBmaWVsZDogc3RyaW5nLFxuICAgICAgYXNjOiBib29sZWFuLFxuICAgICAgZGVzYzogYm9vbGVhbixcbiAgICB9W10pLFxuICB9O1xuICAvKiBUaGUgYHF1ZXJ5YCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgcXVlcmllcyBhcmUgZ2VuZXJhdGVkICovXG4gIHF1ZXJ5OiA/e1xuICAgIGdldDogP2Jvb2xlYW4sXG4gICAgZmluZDogP2Jvb2xlYW4sXG4gICAgZmluZEFsaWFzOiA/U3RyaW5nLFxuICAgIGdldEFsaWFzOiA/U3RyaW5nLFxuICB9O1xuICAvKiBUaGUgYG11dGF0aW9uYCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgbXV0YXRpb25zIGFyZSBnZW5lcmF0ZWQgKi9cbiAgbXV0YXRpb246ID97XG4gICAgY3JlYXRlOiA/Ym9vbGVhbixcbiAgICB1cGRhdGU6ID9ib29sZWFuLFxuICAgIC8vIGRlbGV0ZSBpcyBhIHJlc2VydmVkIGtleSB3b3JkIGluIGpzXG4gICAgZGVzdHJveTogP2Jvb2xlYW4sXG4gICAgY3JlYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgdXBkYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgZGVzdHJveUFsaWFzOiA/U3RyaW5nLFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuZXhwb3J0IHsgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSwgR3JhcGhRTENvbmZpZ0lkLCBHcmFwaFFMQ29uZmlnS2V5IH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLGtCQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxtQkFBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsZ0JBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUFnRCxTQUFBRCx1QkFBQUksQ0FBQSxXQUFBQSxDQUFB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