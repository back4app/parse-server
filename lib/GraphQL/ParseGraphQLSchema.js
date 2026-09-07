"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;
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
const RESERVED_GRAPHQL_TYPE_NAMES = ['String', 'Boolean', 'Int', 'Float', 'ID', 'ArrayResult', 'Query', 'Mutation', 'Subscription', 'CreateFileInput', 'CreateFilePayload', 'Viewer', 'SignUpInput', 'SignUpPayload', 'LogInInput', 'LogInPayload', 'LogOutInput', 'LogOutPayload', 'CloudCodeFunction', 'CallCloudCodeInput', 'CallCloudCodePayload', 'CreateClassInput', 'CreateClassPayload', 'UpdateClassInput', 'UpdateClassPayload', 'DeleteClassInput', 'DeleteClassPayload', 'PageInfo'];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2dyYXBocWwiLCJfc2NoZW1hIiwiX21lcmdlIiwiX3V0aWwiLCJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJwYXJzZUNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9TY2hlbWFDYWNoZSIsIl9wYXJzZUdyYXBoUUxVdGlscyIsInNjaGVtYURpcmVjdGl2ZXMiLCJzY2hlbWFUeXBlcyIsIl90cmlnZ2VycyIsImRlZmF1bHRSZWxheVNjaGVtYSIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsIlJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyIsIlJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTIiwiUGFyc2VHcmFwaFFMU2NoZW1hIiwiY29uc3RydWN0b3IiLCJwYXJhbXMiLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJsb2ciLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJhcHBJZCIsInNjaGVtYUNhY2hlIiwiU2NoZW1hQ2FjaGUiLCJsb2dDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3Nlc0FycmF5IiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwiX2dldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzU3RyaW5nIiwiam9pbiIsInBhcnNlQ2xhc3NlcyIsInJlZHVjZSIsImFjYyIsImNsYXp6IiwiY2xhc3NOYW1lIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsImdyYXBoUUxTY2hlbWEiLCJ2aWV3ZXJUeXBlIiwiY2xvdWRDb25maWdUeXBlIiwiZ3JhcGhRTEF1dG9TY2hlbWEiLCJncmFwaFFMVHlwZXMiLCJncmFwaFFMUXVlcmllcyIsImdyYXBoUUxNdXRhdGlvbnMiLCJncmFwaFFMU3Vic2NyaXB0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsInJlbGF5Tm9kZUludGVyZmFjZSIsIl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnIiwiZm9yRWFjaCIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwia2V5cyIsImZpZWxkcyIsImZpZWxkTmFtZSIsInN0YXJ0c1dpdGgiLCJvcmRlcmVkRmllbGRzIiwic29ydCIsImxvYWRBcnJheVJlc3VsdCIsImdyYXBoUUxRdWVyeSIsInVuZGVmaW5lZCIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsImdldFR5cGVNYXAiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCIsIl90eXBlTWFwIiwiZmluZEFuZFJlcGxhY2VMYXN0VHlwZSIsInBhcmVudCIsImtleSIsIm9mVHlwZSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5IiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUiLCJhdXRvR3JhcGhRTFNjaGVtYVR5cGUiLCJnZXRGaWVsZHMiLCJfZmllbGRzIiwiZmllbGRLZXkiLCJmaWVsZCIsImRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYSIsImF1dG9TY2hlbWEiLCJtZXJnZVNjaGVtYXMiLCJzY2hlbWFzIiwidHlwZURlZnMiLCJtZXJnZVR5cGVEZWZzIiwiX2xvZ09uY2UiLCJzZXZlcml0eSIsIm1lc3NhZ2UiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZmluZCIsImV4aXN0aW5nVHlwZSIsImVuZHNXaXRoIiwiRXJyb3IiLCJwdXNoIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiYWRkR3JhcGhRTE11dGF0aW9uIiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsIlBhcnNlIiwic3RhY2siLCJ0b0dyYXBoUUxFcnJvciIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwiYWxsIiwibG9hZFNjaGVtYSIsImdldEdyYXBoUUxDb25maWciLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJnZXRBbGxDbGFzc2VzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZWRDbGFzc2VzIiwiZmlsdGVyIiwiaXNVc2Vyc0NsYXNzRGlzYWJsZWQiLCJzb21lIiwiY2xhc3NDb25maWdzIiwic29ydENsYXNzZXMiLCJhIiwiYiIsIm1hcCIsImMiLCJnZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lIiwidGVzdCIsImlzRGVlcFN0cmljdEVxdWFsIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMU2NoZW1hLCBHcmFwaFFMT2JqZWN0VHlwZSwgRG9jdW1lbnROb2RlLCBHcmFwaFFMTmFtZWRUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtZXJnZVNjaGVtYXMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9zY2hlbWEnO1xuaW1wb3J0IHsgbWVyZ2VUeXBlRGVmcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL21lcmdlJztcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnLCAnY2xvdWRDb25maWcnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG4gICd1cGRhdGVDbG91ZENvbmZpZycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSk7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID0gcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9IHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IFNjaGVtYUNhY2hlO1xuICAgIHRoaXMubG9nQ2FjaGUgPSB7fTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXNBcnJheSA9IGF3YWl0IHRoaXMuX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzLmpvaW4oKTtcblxuICAgIGNvbnN0IHBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5LnJlZHVjZSgoYWNjLCBjbGF6eikgPT4ge1xuICAgICAgYWNjW2NsYXp6LmNsYXNzTmFtZV0gPSBjbGF6ejtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuICAgIGlmIChcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICAgIH1cblxuICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lcyA9IGZ1bmN0aW9uTmFtZXM7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lc1N0cmluZztcbiAgICB0aGlzLnBhcnNlQ2xhc3NUeXBlcyA9IHt9O1xuICAgIHRoaXMudmlld2VyVHlwZSA9IG51bGw7XG4gICAgdGhpcy5jbG91ZENvbmZpZ1R5cGUgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMgPSBbXTtcbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzID0ge307XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyA9IHt9O1xuICAgIHRoaXMucmVsYXlOb2RlSW50ZXJmYWNlID0gbnVsbDtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0UmVsYXlTY2hlbWEubG9hZCh0aGlzKTtcbiAgICBzY2hlbWFUeXBlcy5sb2FkKHRoaXMpO1xuXG4gICAgdGhpcy5fZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXNBcnJheSwgcGFyc2VHcmFwaFFMQ29uZmlnKS5mb3JFYWNoKFxuICAgICAgKFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXSkgPT4ge1xuICAgICAgICAvLyBTb21lIHRpbWVzIHNjaGVtYSByZXR1cm4gdGhlIF9hdXRoX2RhdGFfIGZpZWxkXG4gICAgICAgIC8vIGl0IHdpbGwgbGVhZCB0byB1bnN0YWJsZSBncmFwaHFsIGdlbmVyYXRpb24gb3JkZXJcbiAgICAgICAgaWYgKHBhcnNlQ2xhc3MuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuc3RhcnRzV2l0aCgnX2F1dGhfZGF0YV8nKSkge1xuICAgICAgICAgICAgICBkZWxldGUgcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpZWxkcyBvcmRlciBpbnNpZGUgdGhlIHNjaGVtYSBzZWVtcyB0byBub3QgYmUgY29uc2lzdGVudCBhY3Jvc3NcbiAgICAgICAgLy8gcmVzdGFydCBzbyB3ZSBuZWVkIHRvIGVuc3VyZSBhbiBhbHBoYWJldGljYWwgb3JkZXJcbiAgICAgICAgLy8gYWxzbyBpdCdzIGJldHRlciBmb3IgdGhlIHBsYXlncm91bmQgZG9jdW1lbnRhdGlvblxuICAgICAgICBjb25zdCBvcmRlcmVkRmllbGRzID0ge307XG4gICAgICAgIE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgb3JkZXJlZEZpZWxkc1tmaWVsZE5hbWVdID0gcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMgPSBvcmRlcmVkRmllbGRzO1xuICAgICAgICBwYXJzZUNsYXNzVHlwZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc1F1ZXJpZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc011dGF0aW9ucy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWRBcnJheVJlc3VsdCh0aGlzLCBwYXJzZUNsYXNzZXNBcnJheSk7XG4gICAgZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMubG9hZCh0aGlzKTtcblxuICAgIGxldCBncmFwaFFMUXVlcnkgPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFF1ZXJpZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdRdWVyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUXVlcnkgaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBxdWVyaWVzLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMUXVlcmllcyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMUXVlcnksIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMTXV0YXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTE11dGF0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTE11dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ011dGF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIG11dGF0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTE11dGF0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMU3Vic2NyaXB0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1N1YnNjcmlwdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igc3Vic2NyaXB0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFN1YnNjcmlwdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG5ldyBHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHR5cGVzOiB0aGlzLmdyYXBoUUxUeXBlcyxcbiAgICAgIHF1ZXJ5OiBncmFwaFFMUXVlcnksXG4gICAgICBtdXRhdGlvbjogZ3JhcGhRTE11dGF0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uOiBncmFwaFFMU3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKSB7XG4gICAgICBzY2hlbWFEaXJlY3RpdmVzLmxvYWQodGhpcyk7XG4gICAgICBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gSW4gZm9sbG93aW5nIGNvZGUgd2UgdXNlIHVuZGVyc2NvcmUgYXR0ciB0byBrZWVwIHRoZSBkaXJlY3QgdmFyaWFibGUgcmVmZXJlbmNlXG4gICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuX3R5cGVNYXA7XG4gICAgICAgIGNvbnN0IGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUgPSAocGFyZW50LCBrZXkpID0+IHtcbiAgICAgICAgICBpZiAocGFyZW50W2tleV0ubmFtZSkge1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICYmXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gIT09IHBhcmVudFtrZXldXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gVG8gYXZvaWQgdW5yZXNvbHZlZCBmaWVsZCBvbiBvdmVybG9hZGVkIHNjaGVtYVxuICAgICAgICAgICAgICAvLyByZXBsYWNlIHRoZSBmaW5hbCB0eXBlIHdpdGggdGhlIGF1dG8gc2NoZW1hIG9uZVxuICAgICAgICAgICAgICBwYXJlbnRba2V5XSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5vZlR5cGUpIHtcbiAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShwYXJlbnRba2V5XSwgJ29mVHlwZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gQWRkIG5vbiBzaGFyZWQgdHlwZXMgZnJvbSBjdXN0b20gc2NoZW1hIHRvIGF1dG8gc2NoZW1hXG4gICAgICAgIC8vIG5vdGU6IHNvbWUgbm9uIHNoYXJlZCB0eXBlcyBjYW4gdXNlIHNvbWUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIHNvIHRoaXMgY29kZSBuZWVkIHRvIGJlIHJhbiBiZWZvcmUgdGhlIHNoYXJlZCB0eXBlcyBhZGRpdGlvblxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGlmICghYXV0b0dyYXBoUUxTY2hlbWFUeXBlKSB7XG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgICBdID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gV2UgcGFzcyB0aHJvdWdoIGVhY2ggdHlwZSBhbmQgZW5zdXJlIHRoYXQgYWxsIHN1YiBmaWVsZCB0eXBlcyBhcmUgcmVwbGFjZWRcbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGlmIChhdXRvR3JhcGhRTFNjaGVtYVR5cGUgJiYgdHlwZW9mIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzKVxuICAgICAgICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAgICAgICAuZm9yRWFjaChmaWVsZEtleSA9PiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGRLZXldO1xuICAgICAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShmaWVsZCwgJ3R5cGUnKTtcbiAgICAgICAgICAgICAgICAgIGF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkLm5hbWVdID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBhd2FpdCB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyh7XG4gICAgICAgICAgZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgYXV0b1NjaGVtYTogdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBncmFwaFFMU2NoZW1hRGlyZWN0aXZlczogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBtZXJnZVNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFt0aGlzLmdyYXBoUUxBdXRvU2NoZW1hXSxcbiAgICAgICAgICB0eXBlRGVmczogbWVyZ2VUeXBlRGVmcyhbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXModGhpcy5ncmFwaFFMU2NoZW1hKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICB9XG5cbiAgX2xvZ09uY2Uoc2V2ZXJpdHksIG1lc3NhZ2UpIHtcbiAgICBpZiAodGhpcy5sb2dDYWNoZVttZXNzYWdlXSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxvZ1tzZXZlcml0eV0obWVzc2FnZSk7XG4gICAgdGhpcy5sb2dDYWNoZVttZXNzYWdlXSA9IHRydWU7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZSh0eXBlLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UsIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLmluY2x1ZGVzKHR5cGUubmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxUeXBlcy5maW5kKGV4aXN0aW5nVHlwZSA9PiBleGlzdGluZ1R5cGUubmFtZSA9PT0gdHlwZS5uYW1lKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxUeXBlcy5wdXNoKHR5cGUpO1xuICAgIHJldHVybiB0eXBlO1xuICB9XG5cbiAgYWRkR3JhcGhRTFF1ZXJ5KGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5fbG9nT25jZSgnd2FybicsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTXV0YXRpb24gJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gZW5hYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIC8vIENsYXNzZXMgaW5jbHVkZWQgaW4gYGVuYWJsZWRGb3JDbGFzc2VzYCB0aGF0XG4gICAgICAgIC8vIGFyZSBhbHNvIHByZXNlbnQgaW4gYGRpc2FibGVkRm9yQ2xhc3Nlc2Agd2lsbFxuICAgICAgICAvLyBzdGlsbCBiZSBmaWx0ZXJlZCBvdXRcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gaW5jbHVkZWRDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoY2xhenogPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcChwYXJzZUNsYXNzID0+IHtcbiAgICAgIGxldCBwYXJzZUNsYXNzQ29uZmlnO1xuICAgICAgaWYgKGNsYXNzQ29uZmlncykge1xuICAgICAgICBwYXJzZUNsYXNzQ29uZmlnID0gY2xhc3NDb25maWdzLmZpbmQoYyA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRGdW5jdGlvbk5hbWVzKCkge1xuICAgIHJldHVybiBhd2FpdCBnZXRGdW5jdGlvbk5hbWVzKHRoaXMuYXBwSWQpLmZpbHRlcihmdW5jdGlvbk5hbWUgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2xvZ09uY2UoXG4gICAgICAgICAgJ3dhcm4nLFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgcGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcsIGZ1bmN0aW9uTmFtZXNTdHJpbmcgfSA9IHBhcmFtcztcblxuICAgIC8vIEZpcnN0IGluaXRcbiAgICBpZiAoIXRoaXMuZ3JhcGhRTFNjaGVtYSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUdyYXBoUUxDb25maWcsIHBhcnNlR3JhcGhRTENvbmZpZykgJiZcbiAgICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9PT0gZnVuY3Rpb25OYW1lc1N0cmluZyAmJlxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUNsYXNzZXMsIHBhcnNlQ2xhc3NlcylcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLFFBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLE9BQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLE1BQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLEtBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLGtCQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxtQkFBQSxHQUFBQyx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVEsZUFBQSxHQUFBRCx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVMsaUJBQUEsR0FBQUYsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFVLG1CQUFBLEdBQUFILHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBVyxxQkFBQSxHQUFBSix1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVksdUJBQUEsR0FBQUwsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFhLHVCQUFBLEdBQUFOLHVCQUFB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