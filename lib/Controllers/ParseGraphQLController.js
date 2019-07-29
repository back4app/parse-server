"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GraphQLConfigKey = exports.GraphQLConfigId = exports.GraphQLConfigClassName = exports.default = void 0;

var _requiredParameter = _interopRequireDefault(require("../../lib/requiredParameter"));

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _CacheController = _interopRequireDefault(require("./CacheController"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const GraphQLConfigClassName = '_GraphQLConfig';
exports.GraphQLConfigClassName = GraphQLConfigClassName;
const GraphQLConfigId = '1';
exports.GraphQLConfigId = GraphQLConfigId;
const GraphQLConfigKey = 'config';
exports.GraphQLConfigKey = GraphQLConfigKey;

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
    this._validateGraphQLConfig(graphQLConfig || (0, _requiredParameter.default)('You must provide a graphQLConfig!')); // Transform in dot notation to make sure it works


    const update = Object.keys(graphQLConfig).reduce((acc, key) => {
      return {
        [GraphQLConfigKey]: _objectSpread({}, acc[GraphQLConfigKey], {
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
            invalidKeys = _objectWithoutProperties(graphQLConfig, ["enabledForClasses", "disabledForClasses", "classConfigs"]);

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
            invalidKeys = _objectWithoutProperties(classConfig, ["className", "type", "query", "mutation"]);

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
              invalidKeys = _objectWithoutProperties(type, ["inputFields", "outputFields", "constraintFields", "sortFields"]);

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
                      invalidKeys = _objectWithoutProperties(sortField, ["field", "asc", "desc"]);

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
                  invalidKeys = _objectWithoutProperties(inputFields, ["create", "update"]);

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
            get = null
          } = query,
                invalidKeys = _objectWithoutProperties(query, ["find", "get"]);

          if (Object.keys(invalidKeys).length) {
            return `"query" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          } else if (find !== null && typeof find !== 'boolean') {
            return `"query.find" must be a boolean`;
          } else if (get !== null && typeof get !== 'boolean') {
            return `"query.get" must be a boolean`;
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
            destroy = null
          } = mutation,
                invalidKeys = _objectWithoutProperties(mutation, ["create", "update", "destroy"]);

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

var _default = ParseGraphQLController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIkdyYXBoUUxDb25maWdDbGFzc05hbWUiLCJHcmFwaFFMQ29uZmlnSWQiLCJHcmFwaFFMQ29uZmlnS2V5IiwiUGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwiaXNNb3VudGVkIiwibW91bnRHcmFwaFFMIiwiY29uZmlnQ2FjaGVLZXkiLCJnZXRHcmFwaFFMQ29uZmlnIiwiX2NhY2hlZENvbmZpZyIsIl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwicmVzdWx0cyIsImZpbmQiLCJvYmplY3RJZCIsImxpbWl0IiwiZ3JhcGhRTENvbmZpZyIsImxlbmd0aCIsIl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwidXBkYXRlR3JhcGhRTENvbmZpZyIsIl92YWxpZGF0ZUdyYXBoUUxDb25maWciLCJ1cGRhdGUiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwidXBzZXJ0IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJncmFwaFFMIiwiZ2V0IiwicHV0IiwiZXJyb3JNZXNzYWdlcyIsInB1c2giLCJpc1ZhbGlkU2ltcGxlT2JqZWN0IiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJjbGFzc0NvbmZpZ3MiLCJpbnZhbGlkS2V5cyIsImlzVmFsaWRTdHJpbmdBcnJheSIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJjbGFzc0NvbmZpZyIsImVycm9yTWVzc2FnZSIsIl92YWxpZGF0ZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiRXJyb3IiLCJqb2luIiwidHlwZSIsInF1ZXJ5IiwibXV0YXRpb24iLCJ0cmltIiwiaW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImV2ZXJ5Iiwic29ydEZpZWxkIiwiaW5kZXgiLCJmaWVsZCIsImFzYyIsImRlc2MiLCJjcmVhdGUiLCJpbmNsdWRlcyIsImRlc3Ryb3kiLCJhcnJheSIsInNvbWUiLCJzIiwib2JqIiwiRGF0ZSIsIlByb21pc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxzQkFBc0IsR0FBRyxnQkFBL0I7O0FBQ0EsTUFBTUMsZUFBZSxHQUFHLEdBQXhCOztBQUNBLE1BQU1DLGdCQUFnQixHQUFHLFFBQXpCOzs7QUFFQSxNQUFNQyxzQkFBTixDQUE2QjtBQU0zQkMsRUFBQUEsV0FBVyxDQUNUQyxNQUdDLEdBQUcsRUFKSyxFQUtUO0FBQ0EsU0FBS0Msa0JBQUwsR0FDRUQsTUFBTSxDQUFDQyxrQkFBUCxJQUNBLGdDQUNHLDRFQURILENBRkY7QUFLQSxTQUFLQyxlQUFMLEdBQXVCRixNQUFNLENBQUNFLGVBQTlCO0FBQ0EsU0FBS0MsU0FBTCxHQUFpQixDQUFDLENBQUNILE1BQU0sQ0FBQ0ksWUFBMUI7QUFDQSxTQUFLQyxjQUFMLEdBQXNCUixnQkFBdEI7QUFDRDs7QUFFRCxRQUFNUyxnQkFBTixHQUFzRDtBQUNwRCxRQUFJLEtBQUtILFNBQVQsRUFBb0I7QUFDbEIsWUFBTUksYUFBYSxHQUFHLE1BQU0sS0FBS0MsdUJBQUwsRUFBNUI7O0FBQ0EsVUFBSUQsYUFBSixFQUFtQjtBQUNqQixlQUFPQSxhQUFQO0FBQ0Q7QUFDRjs7QUFFRCxVQUFNRSxPQUFPLEdBQUcsTUFBTSxLQUFLUixrQkFBTCxDQUF3QlMsSUFBeEIsQ0FDcEJmLHNCQURvQixFQUVwQjtBQUFFZ0IsTUFBQUEsUUFBUSxFQUFFZjtBQUFaLEtBRm9CLEVBR3BCO0FBQUVnQixNQUFBQSxLQUFLLEVBQUU7QUFBVCxLQUhvQixDQUF0QjtBQU1BLFFBQUlDLGFBQUo7O0FBQ0EsUUFBSUosT0FBTyxDQUFDSyxNQUFSLElBQWtCLENBQXRCLEVBQXlCO0FBQ3ZCO0FBQ0EsYUFBTyxF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Q3BELG1CQUFRLHNDQUFSO0FBQ0Q7QUFDRixTQXJCRCxNQXFCTztBQUNMLGlCQUFRLG1DQUFSO0FBQ0Q7QUFDRjtBQUNGO0FBQ0Y7O0FBN1MwQjs7QUFnVDdCLE1BQU0xQixrQkFBa0IsR0FBRyxVQUFTMkIsS0FBVCxFQUF5QjtBQUNsRCxTQUFPMUIsS0FBSyxDQUFDQyxPQUFOLENBQWN5QixLQUFkLElBQ0gsQ0FBQ0EsS0FBSyxDQUFDQyxJQUFOLENBQVdDLENBQUMsSUFBSSxPQUFPQSxDQUFQLEtBQWEsUUFBYixJQUF5QkEsQ0FBQyxDQUFDaEIsSUFBRixHQUFTcEMsTUFBVCxHQUFrQixDQUEzRCxDQURFLEdBRUgsS0FGSjtBQUdELENBSkQ7QUFLQTs7Ozs7OztBQUtBLE1BQU1rQixtQkFBbUIsR0FBRyxVQUFTbUMsR0FBVCxFQUF1QjtBQUNqRCxTQUNFLE9BQU9BLEdBQVAsS0FBZSxRQUFmLElBQ0EsQ0FBQzdCLEtBQUssQ0FBQ0MsT0FBTixDQUFjNEIsR0FBZCxDQURELElBRUFBLEdBQUcsS0FBSyxJQUZSLElBR0FBLEdBQUcsWUFBWUMsSUFBZixLQUF3QixJQUh4QixJQUlBRCxHQUFHLFlBQVlFLE9BQWYsS0FBMkIsSUFMN0I7QUFPRCxDQVJEOztlQW1EZXZFLHNCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uLy4uL2xpYi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDYWNoZUNvbnRyb2xsZXIgZnJvbSAnLi9DYWNoZUNvbnRyb2xsZXInO1xuXG5jb25zdCBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lID0gJ19HcmFwaFFMQ29uZmlnJztcbmNvbnN0IEdyYXBoUUxDb25maWdJZCA9ICcxJztcbmNvbnN0IEdyYXBoUUxDb25maWdLZXkgPSAnY29uZmlnJztcblxuY2xhc3MgUGFyc2VHcmFwaFFMQ29udHJvbGxlciB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcjtcbiAgaXNNb3VudGVkOiBib29sZWFuO1xuICBjb25maWdDYWNoZUtleTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcixcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoXG4gICAgICAgIGBQYXJzZUdyYXBoUUxDb250cm9sbGVyIHJlcXVpcmVzIGEgXCJkYXRhYmFzZUNvbnRyb2xsZXJcIiB0byBiZSBpbnN0YW50aWF0ZWQuYFxuICAgICAgKTtcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IHBhcmFtcy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgdGhpcy5pc01vdW50ZWQgPSAhIXBhcmFtcy5tb3VudEdyYXBoUUw7XG4gICAgdGhpcy5jb25maWdDYWNoZUtleSA9IEdyYXBoUUxDb25maWdLZXk7XG4gIH1cblxuICBhc3luYyBnZXRHcmFwaFFMQ29uZmlnKCk6IFByb21pc2U8UGFyc2VHcmFwaFFMQ29uZmlnPiB7XG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICBjb25zdCBfY2FjaGVkQ29uZmlnID0gYXdhaXQgdGhpcy5fZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZygpO1xuICAgICAgaWYgKF9jYWNoZWRDb25maWcpIHtcbiAgICAgICAgcmV0dXJuIF9jYWNoZWRDb25maWc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLmZpbmQoXG4gICAgICBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLFxuICAgICAgeyBvYmplY3RJZDogR3JhcGhRTENvbmZpZ0lkIH0sXG4gICAgICB7IGxpbWl0OiAxIH1cbiAgICApO1xuXG4gICAgbGV0IGdyYXBoUUxDb25maWc7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNvbmZpZyBpbiB0aGUgZGF0YWJhc2UgLSByZXR1cm4gZW1wdHkgY29uZmlnLlxuICAgICAgcmV0dXJuIHt9O1xuICAgIH0gZWxzZSB7XG4gICAgICBncmFwaFFMQ29uZmlnID0gcmVzdWx0c1swXVtHcmFwaFFMQ29uZmlnS2V5XTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIHRoaXMuX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGdyYXBoUUxDb25maWc7XG4gIH1cblxuICBhc3luYyB1cGRhdGVHcmFwaFFMQ29uZmlnKFxuICAgIGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZ1xuICApOiBQcm9taXNlPFBhcnNlR3JhcGhRTENvbmZpZz4ge1xuICAgIC8vIHRocm93cyBpZiBpbnZhbGlkXG4gICAgdGhpcy5fdmFsaWRhdGVHcmFwaFFMQ29uZmlnKFxuICAgICAgZ3JhcGhRTENvbmZpZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGdyYXBoUUxDb25maWchJylcbiAgICApO1xuXG4gICAgLy8gVHJhbnNmb3JtIGluIGRvdCBub3RhdGlvbiB0byBtYWtlIHN1cmUgaXQgd29ya3NcbiAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhncmFwaFFMQ29uZmlnKS5yZWR1Y2UoXG4gICAgICAoYWNjLCBrZXkpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBbR3JhcGhRTENvbmZpZ0tleV06IHtcbiAgICAgICAgICAgIC4uLmFjY1tHcmFwaFFMQ29uZmlnS2V5XSxcbiAgICAgICAgICAgIFtrZXldOiBncmFwaFFMQ29uZmlnW2tleV0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICB7IFtHcmFwaFFMQ29uZmlnS2V5XToge30gfVxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci51cGRhdGUoXG4gICAgICBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLFxuICAgICAgeyBvYmplY3RJZDogR3JhcGhRTENvbmZpZ0lkIH0sXG4gICAgICB1cGRhdGUsXG4gICAgICB7IHVwc2VydDogdHJ1ZSB9XG4gICAgKTtcblxuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgdGhpcy5fcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogeyByZXN1bHQ6IHRydWUgfSB9O1xuICB9XG5cbiAgX2dldENhY2hlZEdyYXBoUUxDb25maWcoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGVDb250cm9sbGVyLmdyYXBoUUwuZ2V0KHRoaXMuY29uZmlnQ2FjaGVLZXkpO1xuICB9XG5cbiAgX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGVDb250cm9sbGVyLmdyYXBoUUwucHV0KFxuICAgICAgdGhpcy5jb25maWdDYWNoZUtleSxcbiAgICAgIGdyYXBoUUxDb25maWcsXG4gICAgICA2MDAwMFxuICAgICk7XG4gIH1cblxuICBfdmFsaWRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcpOiB2b2lkIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2VzOiBzdHJpbmcgPSBbXTtcbiAgICBpZiAoIWdyYXBoUUxDb25maWcpIHtcbiAgICAgIGVycm9yTWVzc2FnZXMucHVzaCgnY2Fubm90IGJlIHVuZGVmaW5lZCwgbnVsbCBvciBlbXB0eScpO1xuICAgIH0gZWxzZSBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QoZ3JhcGhRTENvbmZpZykpIHtcbiAgICAgIGVycm9yTWVzc2FnZXMucHVzaCgnbXVzdCBiZSBhIHZhbGlkIG9iamVjdCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGVuYWJsZWRGb3JDbGFzc2VzID0gbnVsbCxcbiAgICAgICAgZGlzYWJsZWRGb3JDbGFzc2VzID0gbnVsbCxcbiAgICAgICAgY2xhc3NDb25maWdzID0gbnVsbCxcbiAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgIH0gPSBncmFwaFFMQ29uZmlnO1xuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goXG4gICAgICAgICAgYGVuY291bnRlcmVkIGludmFsaWQga2V5czogWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIGVuYWJsZWRGb3JDbGFzc2VzICE9PSBudWxsICYmXG4gICAgICAgICFpc1ZhbGlkU3RyaW5nQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpXG4gICAgICApIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImVuYWJsZWRGb3JDbGFzc2VzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgZGlzYWJsZWRGb3JDbGFzc2VzICE9PSBudWxsICYmXG4gICAgICAgICFpc1ZhbGlkU3RyaW5nQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKVxuICAgICAgKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJkaXNhYmxlZEZvckNsYXNzZXNcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKGNsYXNzQ29uZmlncyAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjbGFzc0NvbmZpZ3MpKSB7XG4gICAgICAgICAgY2xhc3NDb25maWdzLmZvckVhY2goY2xhc3NDb25maWcgPT4ge1xuICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gdGhpcy5fdmFsaWRhdGVDbGFzc0NvbmZpZyhjbGFzc0NvbmZpZyk7XG4gICAgICAgICAgICBpZiAoZXJyb3JNZXNzYWdlKSB7XG4gICAgICAgICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChcbiAgICAgICAgICAgICAgICBgY2xhc3NDb25maWc6JHtjbGFzc0NvbmZpZy5jbGFzc05hbWV9IGlzIGludmFsaWQgYmVjYXVzZSAke2Vycm9yTWVzc2FnZX1gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImNsYXNzQ29uZmlnc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVycm9yTWVzc2FnZXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZ3JhcGhRTENvbmZpZzogJHtlcnJvck1lc3NhZ2VzLmpvaW4oJzsgJyl9YCk7XG4gICAgfVxuICB9XG5cbiAgX3ZhbGlkYXRlQ2xhc3NDb25maWcoY2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyk6IHN0cmluZyB8IHZvaWQge1xuICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChjbGFzc0NvbmZpZykpIHtcbiAgICAgIHJldHVybiAnaXQgbXVzdCBiZSBhIHZhbGlkIG9iamVjdCc7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB0eXBlID0gbnVsbCxcbiAgICAgICAgcXVlcnkgPSBudWxsLFxuICAgICAgICBtdXRhdGlvbiA9IG51bGwsXG4gICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICB9ID0gY2xhc3NDb25maWc7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gYFwiaW52YWxpZEtleXNcIiBbJHtPYmplY3Qua2V5cyhcbiAgICAgICAgICBpbnZhbGlkS2V5c1xuICAgICAgICApfV0gc2hvdWxkIG5vdCBiZSBwcmVzZW50YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgY2xhc3NOYW1lICE9PSAnc3RyaW5nJyB8fCAhY2xhc3NOYW1lLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgLy8gVE9ETyBjb25zaWRlciBjaGVja2luZyBjbGFzcyBleGlzdHMgaW4gc2NoZW1hP1xuICAgICAgICByZXR1cm4gYFwiY2xhc3NOYW1lXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBpZiAodHlwZSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QodHlwZSkpIHtcbiAgICAgICAgICByZXR1cm4gYFwidHlwZVwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBpbnB1dEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgb3V0cHV0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBjb25zdHJhaW50RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBzb3J0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICB9ID0gdHlwZTtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gYFwidHlwZVwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICB9IGVsc2UgaWYgKG91dHB1dEZpZWxkcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KG91dHB1dEZpZWxkcykpIHtcbiAgICAgICAgICByZXR1cm4gYFwib3V0cHV0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgY29uc3RyYWludEZpZWxkcyAhPT0gbnVsbCAmJlxuICAgICAgICAgICFpc1ZhbGlkU3RyaW5nQXJyYXkoY29uc3RyYWludEZpZWxkcylcbiAgICAgICAgKSB7XG4gICAgICAgICAgcmV0dXJuIGBcImNvbnN0cmFpbnRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc29ydEZpZWxkcyAhPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHNvcnRGaWVsZHMpKSB7XG4gICAgICAgICAgICBsZXQgZXJyb3JNZXNzYWdlO1xuICAgICAgICAgICAgc29ydEZpZWxkcy5ldmVyeSgoc29ydEZpZWxkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3Qoc29ydEZpZWxkKSkge1xuICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGlzIG5vdCBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgZmllbGQsIGFzYywgZGVzYywgLi4uaW52YWxpZEtleXMgfSA9IHNvcnRGaWVsZDtcbiAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgICAgICAgICAgICl9XWA7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZmllbGQgIT09ICdzdHJpbmcnIHx8IGZpZWxkLnRyaW0oKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gZGlkIG5vdCBwcm92aWRlIHRoZSBcImZpZWxkXCIgYXMgYSBzdHJpbmdgO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICAgICAgICB0eXBlb2YgYXNjICE9PSAnYm9vbGVhbicgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZW9mIGRlc2MgIT09ICdib29sZWFuJ1xuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGRpZCBub3QgcHJvdmlkZSBcImFzY1wiIG9yIFwiZGVzY1wiIGFzIGJvb2xlYW5zYDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGVycm9yTWVzc2FnZSkge1xuICAgICAgICAgICAgICByZXR1cm4gZXJyb3JNZXNzYWdlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYFwic29ydEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBhcnJheS5gO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoaW5wdXRGaWVsZHMgIT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChpbnB1dEZpZWxkcykpIHtcbiAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgY3JlYXRlID0gbnVsbCxcbiAgICAgICAgICAgICAgdXBkYXRlID0gbnVsbCxcbiAgICAgICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgICAgIH0gPSBpbnB1dEZpZWxkcztcbiAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkc1wiIGNvbnRhaW5zIGludmFsaWQga2V5czogWyR7T2JqZWN0LmtleXMoXG4gICAgICAgICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgICAgICAgKX1dYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmICh1cGRhdGUgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheSh1cGRhdGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLnVwZGF0ZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNyZWF0ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZFN0cmluZ0FycmF5KGNyZWF0ZSkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy5jcmVhdGVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICAhY3JlYXRlLmluY2x1ZGVzKCd1c2VybmFtZScpIHx8XG4gICAgICAgICAgICAgICAgICAgICFjcmVhdGUuaW5jbHVkZXMoJ3Bhc3N3b3JkJylcbiAgICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMuY3JlYXRlXCIgbXVzdCBpbmNsdWRlIHJlcXVpcmVkIGZpZWxkcywgdXNlcm5hbWUgYW5kIHBhc3N3b3JkYDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocXVlcnkgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QocXVlcnkpKSB7XG4gICAgICAgICAgY29uc3QgeyBmaW5kID0gbnVsbCwgZ2V0ID0gbnVsbCwgLi4uaW52YWxpZEtleXMgfSA9IHF1ZXJ5O1xuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnlcIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKFxuICAgICAgICAgICAgICBpbnZhbGlkS2V5c1xuICAgICAgICAgICAgKX1dYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpbmQgIT09IG51bGwgJiYgdHlwZW9mIGZpbmQgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmZpbmRcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfSBlbHNlIGlmIChnZXQgIT09IG51bGwgJiYgdHlwZW9mIGdldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZ2V0XCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFwicXVlcnlcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG11dGF0aW9uICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KG11dGF0aW9uKSkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIGNyZWF0ZSA9IG51bGwsXG4gICAgICAgICAgICB1cGRhdGUgPSBudWxsLFxuICAgICAgICAgICAgZGVzdHJveSA9IG51bGwsXG4gICAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICAgIH0gPSBtdXRhdGlvbjtcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uXCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgICAgICl9XWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjcmVhdGUgIT09IG51bGwgJiYgdHlwZW9mIGNyZWF0ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uY3JlYXRlXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodXBkYXRlICE9PSBudWxsICYmIHR5cGVvZiB1cGRhdGUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLnVwZGF0ZVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlc3Ryb3kgIT09IG51bGwgJiYgdHlwZW9mIGRlc3Ryb3kgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmRlc3Ryb3lcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvblwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGlzVmFsaWRTdHJpbmdBcnJheSA9IGZ1bmN0aW9uKGFycmF5KTogYm9vbGVhbiB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFycmF5KVxuICAgID8gIWFycmF5LnNvbWUocyA9PiB0eXBlb2YgcyAhPT0gJ3N0cmluZycgfHwgcy50cmltKCkubGVuZ3RoIDwgMSlcbiAgICA6IGZhbHNlO1xufTtcbi8qKlxuICogRW5zdXJlcyB0aGUgb2JqIGlzIGEgc2ltcGxlIEpTT04ve31cbiAqIG9iamVjdCwgaS5lLiBub3QgYW4gYXJyYXksIG51bGwsIGRhdGVcbiAqIGV0Yy5cbiAqL1xuY29uc3QgaXNWYWxpZFNpbXBsZU9iamVjdCA9IGZ1bmN0aW9uKG9iaik6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgIUFycmF5LmlzQXJyYXkob2JqKSAmJlxuICAgIG9iaiAhPT0gbnVsbCAmJlxuICAgIG9iaiBpbnN0YW5jZW9mIERhdGUgIT09IHRydWUgJiZcbiAgICBvYmogaW5zdGFuY2VvZiBQcm9taXNlICE9PSB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENvbmZpZyB7XG4gIGVuYWJsZWRGb3JDbGFzc2VzPzogc3RyaW5nW107XG4gIGRpc2FibGVkRm9yQ2xhc3Nlcz86IHN0cmluZ1tdO1xuICBjbGFzc0NvbmZpZ3M/OiBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIHtcbiAgY2xhc3NOYW1lOiBzdHJpbmc7XG4gIC8qIFRoZSBgdHlwZWAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIGhvdyB0aGUgY2xhc3MgdHlwZXMgYXJlIGdlbmVyYXRlZCAqL1xuICB0eXBlOiA/e1xuICAgIC8qIEZpZWxkcyB0aGF0IGFyZSBhbGxvd2VkIHdoZW4gY3JlYXRpbmcgb3IgdXBkYXRpbmcgYW4gb2JqZWN0LiAqL1xuICAgIGlucHV0RmllbGRzOiA/e1xuICAgICAgLyogTGVhdmUgYmxhbmsgdG8gYWxsb3cgYWxsIGF2YWlsYWJsZSBmaWVsZHMgaW4gdGhlIHNjaGVtYS4gKi9cbiAgICAgIGNyZWF0ZT86IHN0cmluZ1tdLFxuICAgICAgdXBkYXRlPzogc3RyaW5nW10sXG4gICAgfSxcbiAgICAvKiBGaWVsZHMgb24gdGhlIGVkZ2VzIHRoYXQgY2FuIGJlIHJlc29sdmVkIGZyb20gYSBxdWVyeSwgaS5lLiB0aGUgUmVzdWx0IFR5cGUuICovXG4gICAgb3V0cHV0RmllbGRzOiA/KHN0cmluZ1tdKSxcbiAgICAvKiBGaWVsZHMgYnkgd2hpY2ggYSBxdWVyeSBjYW4gYmUgZmlsdGVyZWQsIGkuZS4gdGhlIGB3aGVyZWAgb2JqZWN0LiAqL1xuICAgIGNvbnN0cmFpbnRGaWVsZHM6ID8oc3RyaW5nW10pLFxuICAgIC8qIEZpZWxkcyBieSB3aGljaCBhIHF1ZXJ5IGNhbiBiZSBzb3J0ZWQ7ICovXG4gICAgc29ydEZpZWxkczogPyh7XG4gICAgICBmaWVsZDogc3RyaW5nLFxuICAgICAgYXNjOiBib29sZWFuLFxuICAgICAgZGVzYzogYm9vbGVhbixcbiAgICB9W10pLFxuICB9O1xuICAvKiBUaGUgYHF1ZXJ5YCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgcXVlcmllcyBhcmUgZ2VuZXJhdGVkICovXG4gIHF1ZXJ5OiA/e1xuICAgIGdldDogP2Jvb2xlYW4sXG4gICAgZmluZDogP2Jvb2xlYW4sXG4gIH07XG4gIC8qIFRoZSBgbXV0YXRpb25gIG9iamVjdCBjb250YWlucyBvcHRpb25zIGZvciB3aGljaCBjbGFzcyBtdXRhdGlvbnMgYXJlIGdlbmVyYXRlZCAqL1xuICBtdXRhdGlvbjogP3tcbiAgICBjcmVhdGU6ID9ib29sZWFuLFxuICAgIHVwZGF0ZTogP2Jvb2xlYW4sXG4gICAgLy8gZGVsZXRlIGlzIGEgcmVzZXJ2ZWQga2V5IHdvcmQgaW4ganNcbiAgICBkZXN0cm95OiA/Ym9vbGVhbixcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbmV4cG9ydCB7IEdyYXBoUUxDb25maWdDbGFzc05hbWUsIEdyYXBoUUxDb25maWdJZCwgR3JhcGhRTENvbmZpZ0tleSB9O1xuIl19