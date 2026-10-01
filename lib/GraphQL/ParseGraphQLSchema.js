"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RESERVED_GRAPHQL_TYPE_NAMES = exports.ParseGraphQLSchema = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _graphql = require("graphql");
var _schema = require("@graphql-tools/schema");
var _merge = require("@graphql-tools/merge");
var _util = require("util");
var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./loaders/defaultGraphQLTypes"));
var parseClassTypes = _interopRequireWildcard(require("./loaders/parseClassTypes"));
var parseClassQueries = _interopRequireWildcard(require("./loaders/parseClassQueries"));
var parseClassMutations = _interopRequireWildcard(require("./loaders/parseClassMutations"));
var defaultGraphQLQueries = _interopRequireWildcard(require("./loaders/defaultGraphQLQueries"));
var defaultGraphQLMutations = _interopRequireWildcard(require("./loaders/defaultGraphQLMutations"));
var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _parseGraphQLUtils = require("./parseGraphQLUtils");
var schemaDirectives = _interopRequireWildcard(require("./loaders/schemaDirectives"));
var schemaTypes = _interopRequireWildcard(require("./loaders/schemaTypes"));
var _triggers = require("../triggers");
var defaultRelaySchema = _interopRequireWildcard(require("./loaders/defaultRelaySchema"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const RESERVED_GRAPHQL_TYPE_NAMES = exports.RESERVED_GRAPHQL_TYPE_NAMES = ['String', 'Boolean', 'Int', 'Float', 'ID', 'ArrayResult', 'Query', 'Mutation', 'Subscription', 'CreateFileInput', 'CreateFilePayload', 'Viewer', 'SignUpInput', 'SignUpPayload', 'LogInInput', 'LogInPayload', 'LogOutInput', 'LogOutPayload', 'CloudCodeFunction', 'CallCloudCodeInput', 'CallCloudCodePayload', 'CreateClassInput', 'CreateClassPayload', 'UpdateClassInput', 'UpdateClassPayload', 'DeleteClassInput', 'DeleteClassPayload', 'PageInfo'];
const RESERVED_GRAPHQL_QUERY_NAMES = ['health', 'viewer', 'class', 'classes', 'cloudConfig'];
const RESERVED_GRAPHQL_MUTATION_NAMES = ['signUp', 'logIn', 'logOut', 'createFile', 'callCloudCode', 'createClass', 'updateClass', 'deleteClass', 'updateCloudConfig'];
class ParseGraphQLSchema {
  constructor(params = {}) {
    this.parseGraphQLController = params.parseGraphQLController || (0, _requiredParameter.default)('You must provide a parseGraphQLController instance!');
    this.databaseController = params.databaseController || (0, _requiredParameter.default)('You must provide a databaseController instance!');
    this.log = params.log || (0, _requiredParameter.default)('You must provide a log instance!');
    this.graphQLCustomTypeDefs = params.graphQLCustomTypeDefs;
    this.appId = params.appId || (0, _requiredParameter.default)('You must provide the appId!');
    this.schemaCache = _SchemaCache.default;
    this.logCache = {};
  }
  async load() {
    const {
      parseGraphQLConfig
    } = await this._initializeSchemaAndConfig();
    const parseClassesArray = await this._getClassesForSchema(parseGraphQLConfig);
    const functionNames = await this._getFunctionNames();
    const functionNamesString = functionNames.join();
    const parseClasses = parseClassesArray.reduce((acc, clazz) => {
      acc[clazz.className] = clazz;
      return acc;
    }, {});
    if (!this._hasSchemaInputChanged({
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    })) {
      return this.graphQLSchema;
    }
    this.parseClasses = parseClasses;
    this.parseGraphQLConfig = parseGraphQLConfig;
    this.functionNames = functionNames;
    this.functionNamesString = functionNamesString;
    this.parseClassTypes = {};
    this.viewerType = null;
    this.cloudConfigType = null;
    this.graphQLAutoSchema = null;
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLQueries = {};
    this.graphQLMutations = {};
    this.graphQLSubscriptions = {};
    this.graphQLSchemaDirectivesDefinitions = null;
    this.graphQLSchemaDirectives = {};
    this.relayNodeInterface = null;
    defaultGraphQLTypes.load(this);
    defaultRelaySchema.load(this);
    schemaTypes.load(this);
    this._getParseClassesWithConfig(parseClassesArray, parseGraphQLConfig).forEach(([parseClass, parseClassConfig]) => {
      // Some times schema return the _auth_data_ field
      // it will lead to unstable graphql generation order
      if (parseClass.className === '_User') {
        Object.keys(parseClass.fields).forEach(fieldName => {
          if (fieldName.startsWith('_auth_data_')) {
            delete parseClass.fields[fieldName];
          }
        });
      }

      // Fields order inside the schema seems to not be consistent across
      // restart so we need to ensure an alphabetical order
      // also it's better for the playground documentation
      const orderedFields = {};
      Object.keys(parseClass.fields).sort().forEach(fieldName => {
        orderedFields[fieldName] = parseClass.fields[fieldName];
      });
      parseClass.fields = orderedFields;
      parseClassTypes.load(this, parseClass, parseClassConfig);
      parseClassQueries.load(this, parseClass, parseClassConfig);
      parseClassMutations.load(this, parseClass, parseClassConfig);
    });
    defaultGraphQLTypes.loadArrayResult(this, parseClassesArray);
    defaultGraphQLQueries.load(this);
    defaultGraphQLMutations.load(this);
    let graphQLQuery = undefined;
    if (Object.keys(this.graphQLQueries).length > 0) {
      graphQLQuery = new _graphql.GraphQLObjectType({
        name: 'Query',
        description: 'Query is the top level type for queries.',
        fields: this.graphQLQueries
      });
      this.addGraphQLType(graphQLQuery, true, true);
    }
    let graphQLMutation = undefined;
    if (Object.keys(this.graphQLMutations).length > 0) {
      graphQLMutation = new _graphql.GraphQLObjectType({
        name: 'Mutation',
        description: 'Mutation is the top level type for mutations.',
        fields: this.graphQLMutations
      });
      this.addGraphQLType(graphQLMutation, true, true);
    }
    let graphQLSubscription = undefined;
    if (Object.keys(this.graphQLSubscriptions).length > 0) {
      graphQLSubscription = new _graphql.GraphQLObjectType({
        name: 'Subscription',
        description: 'Subscription is the top level type for subscriptions.',
        fields: this.graphQLSubscriptions
      });
      this.addGraphQLType(graphQLSubscription, true, true);
    }
    this.graphQLAutoSchema = new _graphql.GraphQLSchema({
      types: this.graphQLTypes,
      query: graphQLQuery,
      mutation: graphQLMutation,
      subscription: graphQLSubscription
    });
    if (this.graphQLCustomTypeDefs) {
      schemaDirectives.load(this);
      if (typeof this.graphQLCustomTypeDefs.getTypeMap === 'function') {
        // In following code we use underscore attr to keep the direct variable reference
        const customGraphQLSchemaTypeMap = this.graphQLCustomTypeDefs._typeMap;
        const findAndReplaceLastType = (parent, key) => {
          if (parent[key].name) {
            if (this.graphQLAutoSchema._typeMap[parent[key].name] && this.graphQLAutoSchema._typeMap[parent[key].name] !== parent[key]) {
              // To avoid unresolved field on overloaded schema
              // replace the final type with the auto schema one
              parent[key] = this.graphQLAutoSchema._typeMap[parent[key].name];
            }
          } else {
            if (parent[key].ofType) {
              findAndReplaceLastType(parent[key], 'ofType');
            }
          }
        };
        // Add non shared types from custom schema to auto schema
        // note: some non shared types can use some shared types
        // so this code need to be ran before the shared types addition
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }
          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];
          if (!autoGraphQLSchemaType) {
            this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name] = customGraphQLSchemaType;
          }
        });
        // Handle shared types
        // We pass through each type and ensure that all sub field types are replaced
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }
          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];
          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
            Object.keys(customGraphQLSchemaType._fields).sort().forEach(fieldKey => {
              const field = customGraphQLSchemaType._fields[fieldKey];
              findAndReplaceLastType(field, 'type');
              autoGraphQLSchemaType._fields[field.name] = field;
            });
          }
        });
        this.graphQLSchema = this.graphQLAutoSchema;
      } else if (typeof this.graphQLCustomTypeDefs === 'function') {
        this.graphQLSchema = await this.graphQLCustomTypeDefs({
          directivesDefinitionsSchema: this.graphQLSchemaDirectivesDefinitions,
          autoSchema: this.graphQLAutoSchema,
          graphQLSchemaDirectives: this.graphQLSchemaDirectives
        });
      } else {
        this.graphQLSchema = (0, _schema.mergeSchemas)({
          schemas: [this.graphQLAutoSchema],
          typeDefs: (0, _merge.mergeTypeDefs)([this.graphQLCustomTypeDefs, this.graphQLSchemaDirectivesDefinitions])
        });
        this.graphQLSchema = this.graphQLSchemaDirectives(this.graphQLSchema);
      }
    } else {
      this.graphQLSchema = this.graphQLAutoSchema;
    }
    return this.graphQLSchema;
  }
  _logOnce(severity, message) {
    if (this.logCache[message]) {
      return;
    }
    this.log[severity](message);
    this.logCache[message] = true;
  }
  addGraphQLType(type, throwError = false, ignoreReserved = false, ignoreConnection = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_TYPE_NAMES.includes(type.name) || this.graphQLTypes.find(existingType => existingType.name === type.name) || !ignoreConnection && type.name.endsWith('Connection')) {
      const message = `Type ${type.name} could not be added to the auto schema because it collided with an existing type.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLTypes.push(type);
    return type;
  }
  addGraphQLQuery(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_QUERY_NAMES.includes(fieldName) || this.graphQLQueries[fieldName]) {
      const message = `Query ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLQueries[fieldName] = field;
    return field;
  }
  addGraphQLMutation(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_MUTATION_NAMES.includes(fieldName) || this.graphQLMutations[fieldName]) {
      const message = `Mutation ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLMutations[fieldName] = field;
    return field;
  }
  handleError(error) {
    if (error instanceof _node.default.Error) {
      this.log.error('Parse error: ', error);
    } else {
      this.log.error('Uncaught internal server error.', error, error.stack);
    }
    throw (0, _parseGraphQLUtils.toGraphQLError)(error);
  }
  async _initializeSchemaAndConfig() {
    const [schemaController, parseGraphQLConfig] = await Promise.all([this.databaseController.loadSchema(), this.parseGraphQLController.getGraphQLConfig()]);
    this.schemaController = schemaController;
    return {
      parseGraphQLConfig
    };
  }

  /**
   * Gets all classes found by the `schemaController`
   * minus those filtered out by the app's parseGraphQLConfig.
   */
  async _getClassesForSchema(parseGraphQLConfig) {
    const {
      enabledForClasses,
      disabledForClasses
    } = parseGraphQLConfig;
    const allClasses = await this.schemaController.getAllClasses();
    if (Array.isArray(enabledForClasses) || Array.isArray(disabledForClasses)) {
      let includedClasses = allClasses;
      if (enabledForClasses) {
        includedClasses = allClasses.filter(clazz => {
          return enabledForClasses.includes(clazz.className);
        });
      }
      if (disabledForClasses) {
        // Classes included in `enabledForClasses` that
        // are also present in `disabledForClasses` will
        // still be filtered out
        includedClasses = includedClasses.filter(clazz => {
          return !disabledForClasses.includes(clazz.className);
        });
      }
      this.isUsersClassDisabled = !includedClasses.some(clazz => {
        return clazz.className === '_User';
      });
      return includedClasses;
    } else {
      return allClasses;
    }
  }

  /**
   * This method returns a list of tuples
   * that provide the parseClass along with
   * its parseClassConfig where provided.
   */
  _getParseClassesWithConfig(parseClasses, parseGraphQLConfig) {
    const {
      classConfigs
    } = parseGraphQLConfig;

    // Make sures that the default classes and classes that
    // starts with capitalized letter will be generated first.
    const sortClasses = (a, b) => {
      a = a.className;
      b = b.className;
      if (a[0] === '_') {
        if (b[0] !== '_') {
          return -1;
        }
      }
      if (b[0] === '_') {
        if (a[0] !== '_') {
          return 1;
        }
      }
      if (a === b) {
        return 0;
      } else if (a < b) {
        return -1;
      } else {
        return 1;
      }
    };
    return parseClasses.sort(sortClasses).map(parseClass => {
      let parseClassConfig;
      if (classConfigs) {
        parseClassConfig = classConfigs.find(c => c.className === parseClass.className);
      }
      return [parseClass, parseClassConfig];
    });
  }
  async _getFunctionNames() {
    return await (0, _triggers.getFunctionNames)(this.appId).filter(functionName => {
      if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(functionName)) {
        return true;
      } else {
        this._logOnce('warn', `Function ${functionName} could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.`);
        return false;
      }
    });
  }

  /**
   * Checks for changes to the parseClasses
   * objects (i.e. database schema) or to
   * the parseGraphQLConfig object. If no
   * changes are found, return true;
   */
  _hasSchemaInputChanged(params) {
    const {
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    } = params;

    // First init
    if (!this.graphQLSchema) {
      return true;
    }
    if ((0, _util.isDeepStrictEqual)(this.parseGraphQLConfig, parseGraphQLConfig) && this.functionNamesString === functionNamesString && (0, _util.isDeepStrictEqual)(this.parseClasses, parseClasses)) {
      return false;
    }
    return true;
  }
}
exports.ParseGraphQLSchema = ParseGraphQLSchema;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2dyYXBocWwiLCJfc2NoZW1hIiwiX21lcmdlIiwiX3V0aWwiLCJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJwYXJzZUNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9TY2hlbWFDYWNoZSIsIl9wYXJzZUdyYXBoUUxVdGlscyIsInNjaGVtYURpcmVjdGl2ZXMiLCJzY2hlbWFUeXBlcyIsIl90cmlnZ2VycyIsImRlZmF1bHRSZWxheVNjaGVtYSIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsIlJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyIsImV4cG9ydHMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsInJlcXVpcmVkUGFyYW1ldGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwibG9nIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwiYXBwSWQiLCJzY2hlbWFDYWNoZSIsIlNjaGVtYUNhY2hlIiwibG9nQ2FjaGUiLCJsb2FkIiwicGFyc2VHcmFwaFFMQ29uZmlnIiwiX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWciLCJwYXJzZUNsYXNzZXNBcnJheSIsIl9nZXRDbGFzc2VzRm9yU2NoZW1hIiwiZnVuY3Rpb25OYW1lcyIsIl9nZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lc1N0cmluZyIsImpvaW4iLCJwYXJzZUNsYXNzZXMiLCJyZWR1Y2UiLCJhY2MiLCJjbGF6eiIsImNsYXNzTmFtZSIsIl9oYXNTY2hlbWFJbnB1dENoYW5nZWQiLCJncmFwaFFMU2NoZW1hIiwidmlld2VyVHlwZSIsImNsb3VkQ29uZmlnVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsImtleXMiLCJmaWVsZHMiLCJmaWVsZE5hbWUiLCJzdGFydHNXaXRoIiwib3JkZXJlZEZpZWxkcyIsInNvcnQiLCJsb2FkQXJyYXlSZXN1bHQiLCJncmFwaFFMUXVlcnkiLCJ1bmRlZmluZWQiLCJsZW5ndGgiLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImFkZEdyYXBoUUxUeXBlIiwiZ3JhcGhRTE11dGF0aW9uIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbiIsIkdyYXBoUUxTY2hlbWEiLCJ0eXBlcyIsInF1ZXJ5IiwibXV0YXRpb24iLCJzdWJzY3JpcHRpb24iLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJfdHlwZU1hcCIsImZpbmRBbmRSZXBsYWNlTGFzdFR5cGUiLCJwYXJlbnQiLCJrZXkiLCJvZlR5cGUiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIiwiYXV0b0dyYXBoUUxTY2hlbWFUeXBlIiwiZ2V0RmllbGRzIiwiX2ZpZWxkcyIsImZpZWxkS2V5IiwiZmllbGQiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwibWVyZ2VTY2hlbWFzIiwic2NoZW1hcyIsInR5cGVEZWZzIiwibWVyZ2VUeXBlRGVmcyIsIl9sb2dPbmNlIiwic2V2ZXJpdHkiLCJtZXNzYWdlIiwidHlwZSIsInRocm93RXJyb3IiLCJpZ25vcmVSZXNlcnZlZCIsImlnbm9yZUNvbm5lY3Rpb24iLCJpbmNsdWRlcyIsImZpbmQiLCJleGlzdGluZ1R5cGUiLCJlbmRzV2l0aCIsIkVycm9yIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwidG9HcmFwaFFMRXJyb3IiLCJzY2hlbWFDb250cm9sbGVyIiwiUHJvbWlzZSIsImFsbCIsImxvYWRTY2hlbWEiLCJnZXRHcmFwaFFMQ29uZmlnIiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJhbGxDbGFzc2VzIiwiZ2V0QWxsQ2xhc3NlcyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVkQ2xhc3NlcyIsImZpbHRlciIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJtYXAiLCJjIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZSIsInRlc3QiLCJpc0RlZXBTdHJpY3RFcXVhbCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMU2NoZW1hLCBHcmFwaFFMT2JqZWN0VHlwZSwgRG9jdW1lbnROb2RlLCBHcmFwaFFMTmFtZWRUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtZXJnZVNjaGVtYXMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9zY2hlbWEnO1xuaW1wb3J0IHsgbWVyZ2VUeXBlRGVmcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL21lcmdlJztcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnLCAnY2xvdWRDb25maWcnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG4gICd1cGRhdGVDbG91ZENvbmZpZycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSk7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID0gcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9IHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IFNjaGVtYUNhY2hlO1xuICAgIHRoaXMubG9nQ2FjaGUgPSB7fTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXNBcnJheSA9IGF3YWl0IHRoaXMuX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzLmpvaW4oKTtcblxuICAgIGNvbnN0IHBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5LnJlZHVjZSgoYWNjLCBjbGF6eikgPT4ge1xuICAgICAgYWNjW2NsYXp6LmNsYXNzTmFtZV0gPSBjbGF6ejtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuICAgIGlmIChcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICAgIH1cblxuICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lcyA9IGZ1bmN0aW9uTmFtZXM7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lc1N0cmluZztcbiAgICB0aGlzLnBhcnNlQ2xhc3NUeXBlcyA9IHt9O1xuICAgIHRoaXMudmlld2VyVHlwZSA9IG51bGw7XG4gICAgdGhpcy5jbG91ZENvbmZpZ1R5cGUgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMgPSBbXTtcbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzID0ge307XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyA9IHt9O1xuICAgIHRoaXMucmVsYXlOb2RlSW50ZXJmYWNlID0gbnVsbDtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0UmVsYXlTY2hlbWEubG9hZCh0aGlzKTtcbiAgICBzY2hlbWFUeXBlcy5sb2FkKHRoaXMpO1xuXG4gICAgdGhpcy5fZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXNBcnJheSwgcGFyc2VHcmFwaFFMQ29uZmlnKS5mb3JFYWNoKFxuICAgICAgKFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXSkgPT4ge1xuICAgICAgICAvLyBTb21lIHRpbWVzIHNjaGVtYSByZXR1cm4gdGhlIF9hdXRoX2RhdGFfIGZpZWxkXG4gICAgICAgIC8vIGl0IHdpbGwgbGVhZCB0byB1bnN0YWJsZSBncmFwaHFsIGdlbmVyYXRpb24gb3JkZXJcbiAgICAgICAgaWYgKHBhcnNlQ2xhc3MuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuc3RhcnRzV2l0aCgnX2F1dGhfZGF0YV8nKSkge1xuICAgICAgICAgICAgICBkZWxldGUgcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpZWxkcyBvcmRlciBpbnNpZGUgdGhlIHNjaGVtYSBzZWVtcyB0byBub3QgYmUgY29uc2lzdGVudCBhY3Jvc3NcbiAgICAgICAgLy8gcmVzdGFydCBzbyB3ZSBuZWVkIHRvIGVuc3VyZSBhbiBhbHBoYWJldGljYWwgb3JkZXJcbiAgICAgICAgLy8gYWxzbyBpdCdzIGJldHRlciBmb3IgdGhlIHBsYXlncm91bmQgZG9jdW1lbnRhdGlvblxuICAgICAgICBjb25zdCBvcmRlcmVkRmllbGRzID0ge307XG4gICAgICAgIE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgb3JkZXJlZEZpZWxkc1tmaWVsZE5hbWVdID0gcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMgPSBvcmRlcmVkRmllbGRzO1xuICAgICAgICBwYXJzZUNsYXNzVHlwZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc1F1ZXJpZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc011dGF0aW9ucy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWRBcnJheVJlc3VsdCh0aGlzLCBwYXJzZUNsYXNzZXNBcnJheSk7XG4gICAgZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMubG9hZCh0aGlzKTtcblxuICAgIGxldCBncmFwaFFMUXVlcnkgPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFF1ZXJpZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdRdWVyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUXVlcnkgaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBxdWVyaWVzLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMUXVlcmllcyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMUXVlcnksIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMTXV0YXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTE11dGF0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTE11dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ011dGF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIG11dGF0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTE11dGF0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMU3Vic2NyaXB0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1N1YnNjcmlwdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igc3Vic2NyaXB0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFN1YnNjcmlwdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG5ldyBHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHR5cGVzOiB0aGlzLmdyYXBoUUxUeXBlcyxcbiAgICAgIHF1ZXJ5OiBncmFwaFFMUXVlcnksXG4gICAgICBtdXRhdGlvbjogZ3JhcGhRTE11dGF0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uOiBncmFwaFFMU3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKSB7XG4gICAgICBzY2hlbWFEaXJlY3RpdmVzLmxvYWQodGhpcyk7XG4gICAgICBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gSW4gZm9sbG93aW5nIGNvZGUgd2UgdXNlIHVuZGVyc2NvcmUgYXR0ciB0byBrZWVwIHRoZSBkaXJlY3QgdmFyaWFibGUgcmVmZXJlbmNlXG4gICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuX3R5cGVNYXA7XG4gICAgICAgIGNvbnN0IGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUgPSAocGFyZW50LCBrZXkpID0+IHtcbiAgICAgICAgICBpZiAocGFyZW50W2tleV0ubmFtZSkge1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICYmXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gIT09IHBhcmVudFtrZXldXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gVG8gYXZvaWQgdW5yZXNvbHZlZCBmaWVsZCBvbiBvdmVybG9hZGVkIHNjaGVtYVxuICAgICAgICAgICAgICAvLyByZXBsYWNlIHRoZSBmaW5hbCB0eXBlIHdpdGggdGhlIGF1dG8gc2NoZW1hIG9uZVxuICAgICAgICAgICAgICBwYXJlbnRba2V5XSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5vZlR5cGUpIHtcbiAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShwYXJlbnRba2V5XSwgJ29mVHlwZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gQWRkIG5vbiBzaGFyZWQgdHlwZXMgZnJvbSBjdXN0b20gc2NoZW1hIHRvIGF1dG8gc2NoZW1hXG4gICAgICAgIC8vIG5vdGU6IHNvbWUgbm9uIHNoYXJlZCB0eXBlcyBjYW4gdXNlIHNvbWUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIHNvIHRoaXMgY29kZSBuZWVkIHRvIGJlIHJhbiBiZWZvcmUgdGhlIHNoYXJlZCB0eXBlcyBhZGRpdGlvblxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGlmICghYXV0b0dyYXBoUUxTY2hlbWFUeXBlKSB7XG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgICBdID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gV2UgcGFzcyB0aHJvdWdoIGVhY2ggdHlwZSBhbmQgZW5zdXJlIHRoYXQgYWxsIHN1YiBmaWVsZCB0eXBlcyBhcmUgcmVwbGFjZWRcbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGlmIChhdXRvR3JhcGhRTFNjaGVtYVR5cGUgJiYgdHlwZW9mIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzKVxuICAgICAgICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAgICAgICAuZm9yRWFjaChmaWVsZEtleSA9PiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGRLZXldO1xuICAgICAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShmaWVsZCwgJ3R5cGUnKTtcbiAgICAgICAgICAgICAgICAgIGF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkLm5hbWVdID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBhd2FpdCB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyh7XG4gICAgICAgICAgZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgYXV0b1NjaGVtYTogdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBncmFwaFFMU2NoZW1hRGlyZWN0aXZlczogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBtZXJnZVNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFt0aGlzLmdyYXBoUUxBdXRvU2NoZW1hXSxcbiAgICAgICAgICB0eXBlRGVmczogbWVyZ2VUeXBlRGVmcyhbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXModGhpcy5ncmFwaFFMU2NoZW1hKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICB9XG5cbiAgX2xvZ09uY2Uoc2V2ZXJpdHksIG1lc3NhZ2UpIHtcbiAgICBpZiAodGhpcy5sb2dDYWNoZVttZXNzYWdlXSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxvZ1tzZXZlcml0eV0obWVzc2FnZSk7XG4gICAgdGhpcy5sb2dDYWNoZVttZXNzYWdlXSA9IHRydWU7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZSh0eXBlLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UsIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLmluY2x1ZGVzKHR5cGUubmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxUeXBlcy5maW5kKGV4aXN0aW5nVHlwZSA9PiBleGlzdGluZ1R5cGUubmFtZSA9PT0gdHlwZS5uYW1lKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxUeXBlcy5wdXNoKHR5cGUpO1xuICAgIHJldHVybiB0eXBlO1xuICB9XG5cbiAgYWRkR3JhcGhRTFF1ZXJ5KGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5fbG9nT25jZSgnd2FybicsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTXV0YXRpb24gJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gZW5hYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIC8vIENsYXNzZXMgaW5jbHVkZWQgaW4gYGVuYWJsZWRGb3JDbGFzc2VzYCB0aGF0XG4gICAgICAgIC8vIGFyZSBhbHNvIHByZXNlbnQgaW4gYGRpc2FibGVkRm9yQ2xhc3Nlc2Agd2lsbFxuICAgICAgICAvLyBzdGlsbCBiZSBmaWx0ZXJlZCBvdXRcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gaW5jbHVkZWRDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoY2xhenogPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcChwYXJzZUNsYXNzID0+IHtcbiAgICAgIGxldCBwYXJzZUNsYXNzQ29uZmlnO1xuICAgICAgaWYgKGNsYXNzQ29uZmlncykge1xuICAgICAgICBwYXJzZUNsYXNzQ29uZmlnID0gY2xhc3NDb25maWdzLmZpbmQoYyA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRGdW5jdGlvbk5hbWVzKCkge1xuICAgIHJldHVybiBhd2FpdCBnZXRGdW5jdGlvbk5hbWVzKHRoaXMuYXBwSWQpLmZpbHRlcihmdW5jdGlvbk5hbWUgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2xvZ09uY2UoXG4gICAgICAgICAgJ3dhcm4nLFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgcGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcsIGZ1bmN0aW9uTmFtZXNTdHJpbmcgfSA9IHBhcmFtcztcblxuICAgIC8vIEZpcnN0IGluaXRcbiAgICBpZiAoIXRoaXMuZ3JhcGhRTFNjaGVtYSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUdyYXBoUUxDb25maWcsIHBhcnNlR3JhcGhRTENvbmZpZykgJiZcbiAgICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9PT0gZnVuY3Rpb25OYW1lc1N0cmluZyAmJlxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUNsYXNzZXMsIHBhcnNlQ2xhc3NlcylcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hLCBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsUUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsT0FBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsTUFBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksS0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssa0JBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLG1CQUFBLEdBQUFDLHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBUSxlQUFBLEdBQUFELHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBUyxpQkFBQSxHQUFBRix1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVUsbUJBQUEsR0FBQUgsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFXLHFCQUFBLEdBQUFKLHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBWSx1QkFBQSxHQUFBTCx1QkFBQSxDQUFBUCxPQUFB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