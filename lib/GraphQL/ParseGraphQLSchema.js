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
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const RESERVED_GRAPHQL_TYPE_NAMES = ['String', 'Boolean', 'Int', 'Float', 'ID', 'ArrayResult', 'Query', 'Mutation', 'Subscription', 'CreateFileInput', 'CreateFilePayload', 'Viewer', 'SignUpInput', 'SignUpPayload', 'LogInInput', 'LogInPayload', 'LogOutInput', 'LogOutPayload', 'CloudCodeFunction', 'CallCloudCodeInput', 'CallCloudCodePayload', 'CreateClassInput', 'CreateClassPayload', 'UpdateClassInput', 'UpdateClassPayload', 'DeleteClassInput', 'DeleteClassPayload', 'PageInfo'];
const RESERVED_GRAPHQL_QUERY_NAMES = ['health', 'viewer', 'class', 'classes'];
const RESERVED_GRAPHQL_MUTATION_NAMES = ['signUp', 'logIn', 'logOut', 'createFile', 'callCloudCode', 'createClass', 'updateClass', 'deleteClass'];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2dyYXBocWwiLCJfc2NoZW1hIiwiX21lcmdlIiwiX3V0aWwiLCJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJwYXJzZUNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9TY2hlbWFDYWNoZSIsIl9wYXJzZUdyYXBoUUxVdGlscyIsInNjaGVtYURpcmVjdGl2ZXMiLCJzY2hlbWFUeXBlcyIsIl90cmlnZ2VycyIsImRlZmF1bHRSZWxheVNjaGVtYSIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIlJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyIsIlJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTIiwiUGFyc2VHcmFwaFFMU2NoZW1hIiwiY29uc3RydWN0b3IiLCJwYXJhbXMiLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJsb2ciLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJhcHBJZCIsInNjaGVtYUNhY2hlIiwiU2NoZW1hQ2FjaGUiLCJsb2dDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3Nlc0FycmF5IiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwiX2dldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzU3RyaW5nIiwiam9pbiIsInBhcnNlQ2xhc3NlcyIsInJlZHVjZSIsImFjYyIsImNsYXp6IiwiY2xhc3NOYW1lIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsImdyYXBoUUxTY2hlbWEiLCJ2aWV3ZXJUeXBlIiwiZ3JhcGhRTEF1dG9TY2hlbWEiLCJncmFwaFFMVHlwZXMiLCJncmFwaFFMUXVlcmllcyIsImdyYXBoUUxNdXRhdGlvbnMiLCJncmFwaFFMU3Vic2NyaXB0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsInJlbGF5Tm9kZUludGVyZmFjZSIsIl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnIiwiZm9yRWFjaCIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwia2V5cyIsImZpZWxkcyIsImZpZWxkTmFtZSIsInN0YXJ0c1dpdGgiLCJvcmRlcmVkRmllbGRzIiwic29ydCIsImxvYWRBcnJheVJlc3VsdCIsImdyYXBoUUxRdWVyeSIsInVuZGVmaW5lZCIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsImdldFR5cGVNYXAiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCIsIl90eXBlTWFwIiwiZmluZEFuZFJlcGxhY2VMYXN0VHlwZSIsInBhcmVudCIsImtleSIsIm9mVHlwZSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5IiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUiLCJhdXRvR3JhcGhRTFNjaGVtYVR5cGUiLCJnZXRGaWVsZHMiLCJfZmllbGRzIiwiZmllbGRLZXkiLCJmaWVsZCIsImRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYSIsImF1dG9TY2hlbWEiLCJtZXJnZVNjaGVtYXMiLCJzY2hlbWFzIiwidHlwZURlZnMiLCJtZXJnZVR5cGVEZWZzIiwiX2xvZ09uY2UiLCJzZXZlcml0eSIsIm1lc3NhZ2UiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZmluZCIsImV4aXN0aW5nVHlwZSIsImVuZHNXaXRoIiwiRXJyb3IiLCJwdXNoIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiYWRkR3JhcGhRTE11dGF0aW9uIiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsIlBhcnNlIiwic3RhY2siLCJ0b0dyYXBoUUxFcnJvciIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwiYWxsIiwibG9hZFNjaGVtYSIsImdldEdyYXBoUUxDb25maWciLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJnZXRBbGxDbGFzc2VzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZWRDbGFzc2VzIiwiZmlsdGVyIiwiaXNVc2Vyc0NsYXNzRGlzYWJsZWQiLCJzb21lIiwiY2xhc3NDb25maWdzIiwic29ydENsYXNzZXMiLCJiIiwibWFwIiwiYyIsImdldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWUiLCJ0ZXN0IiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2NoZW1hLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IEdyYXBoUUxTY2hlbWEsIEdyYXBoUUxPYmplY3RUeXBlLCBEb2N1bWVudE5vZGUsIEdyYXBoUUxOYW1lZFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG1lcmdlU2NoZW1hcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3NjaGVtYSc7XG5pbXBvcnQgeyBtZXJnZVR5cGVEZWZzIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvbWVyZ2UnO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NUeXBlcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTE11dGF0aW9ucyc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwgeyBQYXJzZUdyYXBoUUxDb25maWcgfSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgeyB0b0dyYXBoUUxFcnJvciB9IGZyb20gJy4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgc2NoZW1hRGlyZWN0aXZlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFUeXBlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hVHlwZXMnO1xuaW1wb3J0IHsgZ2V0RnVuY3Rpb25OYW1lcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRSZWxheVNjaGVtYSBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdFJlbGF5U2NoZW1hJztcblxuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTID0gW1xuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnSW50JyxcbiAgJ0Zsb2F0JyxcbiAgJ0lEJyxcbiAgJ0FycmF5UmVzdWx0JyxcbiAgJ1F1ZXJ5JyxcbiAgJ011dGF0aW9uJyxcbiAgJ1N1YnNjcmlwdGlvbicsXG4gICdDcmVhdGVGaWxlSW5wdXQnLFxuICAnQ3JlYXRlRmlsZVBheWxvYWQnLFxuICAnVmlld2VyJyxcbiAgJ1NpZ25VcElucHV0JyxcbiAgJ1NpZ25VcFBheWxvYWQnLFxuICAnTG9nSW5JbnB1dCcsXG4gICdMb2dJblBheWxvYWQnLFxuICAnTG9nT3V0SW5wdXQnLFxuICAnTG9nT3V0UGF5bG9hZCcsXG4gICdDbG91ZENvZGVGdW5jdGlvbicsXG4gICdDYWxsQ2xvdWRDb2RlSW5wdXQnLFxuICAnQ2FsbENsb3VkQ29kZVBheWxvYWQnLFxuICAnQ3JlYXRlQ2xhc3NJbnB1dCcsXG4gICdDcmVhdGVDbGFzc1BheWxvYWQnLFxuICAnVXBkYXRlQ2xhc3NJbnB1dCcsXG4gICdVcGRhdGVDbGFzc1BheWxvYWQnLFxuICAnRGVsZXRlQ2xhc3NJbnB1dCcsXG4gICdEZWxldGVDbGFzc1BheWxvYWQnLFxuICAnUGFnZUluZm8nLFxuXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMgPSBbJ2hlYWx0aCcsICd2aWV3ZXInLCAnY2xhc3MnLCAnY2xhc3NlcyddO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyA9IFtcbiAgJ3NpZ25VcCcsXG4gICdsb2dJbicsXG4gICdsb2dPdXQnLFxuICAnY3JlYXRlRmlsZScsXG4gICdjYWxsQ2xvdWRDb2RlJyxcbiAgJ2NyZWF0ZUNsYXNzJyxcbiAgJ3VwZGF0ZUNsYXNzJyxcbiAgJ2RlbGV0ZUNsYXNzJyxcbl07XG5cbmNsYXNzIFBhcnNlR3JhcGhRTFNjaGVtYSB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZztcbiAgbG9nOiBhbnk7XG4gIGFwcElkOiBzdHJpbmc7XG4gIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhzdHJpbmcgfCBHcmFwaFFMU2NoZW1hIHwgRG9jdW1lbnROb2RlIHwgR3JhcGhRTE5hbWVkVHlwZVtdKTtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGxvZzogYW55LFxuICAgICAgYXBwSWQ6IHN0cmluZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhzdHJpbmcgfCBHcmFwaFFMU2NoZW1hIHwgRG9jdW1lbnROb2RlIHwgR3JhcGhRTE5hbWVkVHlwZVtdKSxcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHBhcnNlR3JhcGhRTENvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBkYXRhYmFzZUNvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5sb2cgPSBwYXJhbXMubG9nIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbG9nIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyYW1zLmdyYXBoUUxDdXN0b21UeXBlRGVmcztcbiAgICB0aGlzLmFwcElkID0gcGFyYW1zLmFwcElkIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIHRoZSBhcHBJZCEnKTtcbiAgICB0aGlzLnNjaGVtYUNhY2hlID0gU2NoZW1hQ2FjaGU7XG4gICAgdGhpcy5sb2dDYWNoZSA9IHt9O1xuICB9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICBjb25zdCB7IHBhcnNlR3JhcGhRTENvbmZpZyB9ID0gYXdhaXQgdGhpcy5faW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZygpO1xuICAgIGNvbnN0IHBhcnNlQ2xhc3Nlc0FycmF5ID0gYXdhaXQgdGhpcy5fZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWcpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRGdW5jdGlvbk5hbWVzKCk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lc1N0cmluZyA9IGZ1bmN0aW9uTmFtZXMuam9pbigpO1xuXG4gICAgY29uc3QgcGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzQXJyYXkucmVkdWNlKChhY2MsIGNsYXp6KSA9PiB7XG4gICAgICBhY2NbY2xhenouY2xhc3NOYW1lXSA9IGNsYXp6O1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG4gICAgaWYgKFxuICAgICAgIXRoaXMuX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCh7XG4gICAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgICBmdW5jdGlvbk5hbWVzU3RyaW5nLFxuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gICAgfVxuXG4gICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb25maWcgPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzID0gZnVuY3Rpb25OYW1lcztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VDbGFzc1R5cGVzID0ge307XG4gICAgdGhpcy52aWV3ZXJUeXBlID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFR5cGVzID0gW107XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllcyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMgPSB7fTtcbiAgICB0aGlzLnJlbGF5Tm9kZUludGVyZmFjZSA9IG51bGw7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdFJlbGF5U2NoZW1hLmxvYWQodGhpcyk7XG4gICAgc2NoZW1hVHlwZXMubG9hZCh0aGlzKTtcblxuICAgIHRoaXMuX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzQXJyYXksIHBhcnNlR3JhcGhRTENvbmZpZykuZm9yRWFjaChcbiAgICAgIChbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ10pID0+IHtcbiAgICAgICAgLy8gU29tZSB0aW1lcyBzY2hlbWEgcmV0dXJuIHRoZSBfYXV0aF9kYXRhXyBmaWVsZFxuICAgICAgICAvLyBpdCB3aWxsIGxlYWQgdG8gdW5zdGFibGUgZ3JhcGhxbCBnZW5lcmF0aW9uIG9yZGVyXG4gICAgICAgIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLnN0YXJ0c1dpdGgoJ19hdXRoX2RhdGFfJykpIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaWVsZHMgb3JkZXIgaW5zaWRlIHRoZSBzY2hlbWEgc2VlbXMgdG8gbm90IGJlIGNvbnNpc3RlbnQgYWNyb3NzXG4gICAgICAgIC8vIHJlc3RhcnQgc28gd2UgbmVlZCB0byBlbnN1cmUgYW4gYWxwaGFiZXRpY2FsIG9yZGVyXG4gICAgICAgIC8vIGFsc28gaXQncyBiZXR0ZXIgZm9yIHRoZSBwbGF5Z3JvdW5kIGRvY3VtZW50YXRpb25cbiAgICAgICAgY29uc3Qgb3JkZXJlZEZpZWxkcyA9IHt9O1xuICAgICAgICBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcylcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIG9yZGVyZWRGaWVsZHNbZmllbGROYW1lXSA9IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzID0gb3JkZXJlZEZpZWxkcztcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NRdWVyaWVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NNdXRhdGlvbnMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkQXJyYXlSZXN1bHQodGhpcywgcGFyc2VDbGFzc2VzQXJyYXkpO1xuICAgIGRlZmF1bHRHcmFwaFFMUXVlcmllcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zLmxvYWQodGhpcyk7XG5cbiAgICBsZXQgZ3JhcGhRTFF1ZXJ5ID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxRdWVyaWVzKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMUXVlcnkgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnUXVlcnknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1F1ZXJ5IGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgcXVlcmllcy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFF1ZXJpZXMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFF1ZXJ5LCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTE11dGF0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxNdXRhdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxNdXRhdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdNdXRhdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTXV0YXRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBtdXRhdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxNdXRhdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdTdWJzY3JpcHRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1N1YnNjcmlwdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHN1YnNjcmlwdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxTdWJzY3JpcHRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBuZXcgR3JhcGhRTFNjaGVtYSh7XG4gICAgICB0eXBlczogdGhpcy5ncmFwaFFMVHlwZXMsXG4gICAgICBxdWVyeTogZ3JhcGhRTFF1ZXJ5LFxuICAgICAgbXV0YXRpb246IGdyYXBoUUxNdXRhdGlvbixcbiAgICAgIHN1YnNjcmlwdGlvbjogZ3JhcGhRTFN1YnNjcmlwdGlvbixcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcykge1xuICAgICAgc2NoZW1hRGlyZWN0aXZlcy5sb2FkKHRoaXMpO1xuICAgICAgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5nZXRUeXBlTWFwID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIEluIGZvbGxvd2luZyBjb2RlIHdlIHVzZSB1bmRlcnNjb3JlIGF0dHIgdG8ga2VlcCB0aGUgZGlyZWN0IHZhcmlhYmxlIHJlZmVyZW5jZVxuICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLl90eXBlTWFwO1xuICAgICAgICBjb25zdCBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlID0gKHBhcmVudCwga2V5KSA9PiB7XG4gICAgICAgICAgaWYgKHBhcmVudFtrZXldLm5hbWUpIHtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAmJlxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICE9PSBwYXJlbnRba2V5XVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIFRvIGF2b2lkIHVucmVzb2x2ZWQgZmllbGQgb24gb3ZlcmxvYWRlZCBzY2hlbWFcbiAgICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgZmluYWwgdHlwZSB3aXRoIHRoZSBhdXRvIHNjaGVtYSBvbmVcbiAgICAgICAgICAgICAgcGFyZW50W2tleV0gPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAocGFyZW50W2tleV0ub2ZUeXBlKSB7XG4gICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUocGFyZW50W2tleV0sICdvZlR5cGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIEFkZCBub24gc2hhcmVkIHR5cGVzIGZyb20gY3VzdG9tIHNjaGVtYSB0byBhdXRvIHNjaGVtYVxuICAgICAgICAvLyBub3RlOiBzb21lIG5vbiBzaGFyZWQgdHlwZXMgY2FuIHVzZSBzb21lIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBzbyB0aGlzIGNvZGUgbmVlZCB0byBiZSByYW4gYmVmb3JlIHRoZSBzaGFyZWQgdHlwZXMgYWRkaXRpb25cbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBpZiAoIWF1dG9HcmFwaFFMU2NoZW1hVHlwZSkge1xuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgICAgXSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAvLyBIYW5kbGUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIFdlIHBhc3MgdGhyb3VnaCBlYWNoIHR5cGUgYW5kIGVuc3VyZSB0aGF0IGFsbCBzdWIgZmllbGQgdHlwZXMgYXJlIHJlcGxhY2VkXG4gICAgICAgIC8vIHdlIHVzZSBzb3J0IHRvIGVuc3VyZSBzY2hlbWEgY29uc2lzdGVuY3kgb3ZlciByZXN0YXJ0c1xuICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcClcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleV07XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBpZiAoYXV0b0dyYXBoUUxTY2hlbWFUeXBlICYmIHR5cGVvZiBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcylcbiAgICAgICAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgICAgICAgLmZvckVhY2goZmllbGRLZXkgPT4ge1xuICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkS2V5XTtcbiAgICAgICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUoZmllbGQsICd0eXBlJyk7XG4gICAgICAgICAgICAgICAgICBhdXRvR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkc1tmaWVsZC5uYW1lXSA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gYXdhaXQgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMoe1xuICAgICAgICAgIGRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYTogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIGF1dG9TY2hlbWE6IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXM6IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbWVyZ2VTY2hlbWFzKHtcbiAgICAgICAgICBzY2hlbWFzOiBbdGhpcy5ncmFwaFFMQXV0b1NjaGVtYV0sXG4gICAgICAgICAgdHlwZURlZnM6IG1lcmdlVHlwZURlZnMoW1xuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgXSksXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzKHRoaXMuZ3JhcGhRTFNjaGVtYSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgfVxuXG4gIF9sb2dPbmNlKHNldmVyaXR5LCBtZXNzYWdlKSB7XG4gICAgaWYgKHRoaXMubG9nQ2FjaGVbbWVzc2FnZV0pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5sb2dbc2V2ZXJpdHldKG1lc3NhZ2UpO1xuICAgIHRoaXMubG9nQ2FjaGVbbWVzc2FnZV0gPSB0cnVlO1xuICB9XG5cbiAgYWRkR3JhcGhRTFR5cGUodHlwZSwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlLCBpZ25vcmVDb25uZWN0aW9uID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUy5pbmNsdWRlcyh0eXBlLm5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMVHlwZXMuZmluZChleGlzdGluZ1R5cGUgPT4gZXhpc3RpbmdUeXBlLm5hbWUgPT09IHR5cGUubmFtZSkgfHxcbiAgICAgICghaWdub3JlQ29ubmVjdGlvbiAmJiB0eXBlLm5hbWUuZW5kc1dpdGgoJ0Nvbm5lY3Rpb24nKSlcbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgVHlwZSAke3R5cGUubmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgdHlwZS5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5fbG9nT25jZSgnd2FybicsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMucHVzaCh0eXBlKTtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxRdWVyeShmaWVsZE5hbWUsIGZpZWxkLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBRdWVyeSAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2xvZ09uY2UoJ3dhcm4nLCBtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGFkZEdyYXBoUUxNdXRhdGlvbihmaWVsZE5hbWUsIGZpZWxkLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE11dGF0aW9uICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5fbG9nT25jZSgnd2FybicsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZDtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBoYW5kbGVFcnJvcihlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignUGFyc2UgZXJyb3I6ICcsIGVycm9yKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1VuY2F1Z2h0IGludGVybmFsIHNlcnZlciBlcnJvci4nLCBlcnJvciwgZXJyb3Iuc3RhY2spO1xuICAgIH1cbiAgICB0aHJvdyB0b0dyYXBoUUxFcnJvcihlcnJvcik7XG4gIH1cblxuICBhc3luYyBfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZygpIHtcbiAgICBjb25zdCBbc2NoZW1hQ29udHJvbGxlciwgcGFyc2VHcmFwaFFMQ29uZmlnXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLmxvYWRTY2hlbWEoKSxcbiAgICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlci5nZXRHcmFwaFFMQ29uZmlnKCksXG4gICAgXSk7XG5cbiAgICB0aGlzLnNjaGVtYUNvbnRyb2xsZXIgPSBzY2hlbWFDb250cm9sbGVyO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgYWxsIGNsYXNzZXMgZm91bmQgYnkgdGhlIGBzY2hlbWFDb250cm9sbGVyYFxuICAgKiBtaW51cyB0aG9zZSBmaWx0ZXJlZCBvdXQgYnkgdGhlIGFwcCdzIHBhcnNlR3JhcGhRTENvbmZpZy5cbiAgICovXG4gIGFzeW5jIF9nZXRDbGFzc2VzRm9yU2NoZW1hKHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBlbmFibGVkRm9yQ2xhc3NlcywgZGlzYWJsZWRGb3JDbGFzc2VzIH0gPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgY29uc3QgYWxsQ2xhc3NlcyA9IGF3YWl0IHRoaXMuc2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCk7XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbmFibGVkRm9yQ2xhc3NlcykgfHwgQXJyYXkuaXNBcnJheShkaXNhYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICBsZXQgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3NlcztcbiAgICAgIGlmIChlbmFibGVkRm9yQ2xhc3Nlcykge1xuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuIGVuYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGRpc2FibGVkRm9yQ2xhc3Nlcykge1xuICAgICAgICAvLyBDbGFzc2VzIGluY2x1ZGVkIGluIGBlbmFibGVkRm9yQ2xhc3Nlc2AgdGhhdFxuICAgICAgICAvLyBhcmUgYWxzbyBwcmVzZW50IGluIGBkaXNhYmxlZEZvckNsYXNzZXNgIHdpbGxcbiAgICAgICAgLy8gc3RpbGwgYmUgZmlsdGVyZWQgb3V0XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGluY2x1ZGVkQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiAhZGlzYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzVXNlcnNDbGFzc0Rpc2FibGVkID0gIWluY2x1ZGVkQ2xhc3Nlcy5zb21lKGNsYXp6ID0+IHtcbiAgICAgICAgcmV0dXJuIGNsYXp6LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gaW5jbHVkZWRDbGFzc2VzO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYWxsQ2xhc3NlcztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBtZXRob2QgcmV0dXJucyBhIGxpc3Qgb2YgdHVwbGVzXG4gICAqIHRoYXQgcHJvdmlkZSB0aGUgcGFyc2VDbGFzcyBhbG9uZyB3aXRoXG4gICAqIGl0cyBwYXJzZUNsYXNzQ29uZmlnIHdoZXJlIHByb3ZpZGVkLlxuICAgKi9cbiAgX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgY2xhc3NDb25maWdzIH0gPSBwYXJzZUdyYXBoUUxDb25maWc7XG5cbiAgICAvLyBNYWtlIHN1cmVzIHRoYXQgdGhlIGRlZmF1bHQgY2xhc3NlcyBhbmQgY2xhc3NlcyB0aGF0XG4gICAgLy8gc3RhcnRzIHdpdGggY2FwaXRhbGl6ZWQgbGV0dGVyIHdpbGwgYmUgZ2VuZXJhdGVkIGZpcnN0LlxuICAgIGNvbnN0IHNvcnRDbGFzc2VzID0gKGEsIGIpID0+IHtcbiAgICAgIGEgPSBhLmNsYXNzTmFtZTtcbiAgICAgIGIgPSBiLmNsYXNzTmFtZTtcbiAgICAgIGlmIChhWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGJbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYVswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChhID09PSBiKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSBlbHNlIGlmIChhIDwgYikge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gMTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIHBhcnNlQ2xhc3Nlcy5zb3J0KHNvcnRDbGFzc2VzKS5tYXAocGFyc2VDbGFzcyA9PiB7XG4gICAgICBsZXQgcGFyc2VDbGFzc0NvbmZpZztcbiAgICAgIGlmIChjbGFzc0NvbmZpZ3MpIHtcbiAgICAgICAgcGFyc2VDbGFzc0NvbmZpZyA9IGNsYXNzQ29uZmlncy5maW5kKGMgPT4gYy5jbGFzc05hbWUgPT09IHBhcnNlQ2xhc3MuY2xhc3NOYW1lKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ107XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBfZ2V0RnVuY3Rpb25OYW1lcygpIHtcbiAgICByZXR1cm4gYXdhaXQgZ2V0RnVuY3Rpb25OYW1lcyh0aGlzLmFwcElkKS5maWx0ZXIoZnVuY3Rpb25OYW1lID0+IHtcbiAgICAgIGlmICgvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy50ZXN0KGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9sb2dPbmNlKFxuICAgICAgICAgICd3YXJuJyxcbiAgICAgICAgICBgRnVuY3Rpb24gJHtmdW5jdGlvbk5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBHcmFwaFFMIG5hbWVzIG11c3QgbWF0Y2ggL15bX2EtekEtWl1bX2EtekEtWjAtOV0qJC8uYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2tzIGZvciBjaGFuZ2VzIHRvIHRoZSBwYXJzZUNsYXNzZXNcbiAgICogb2JqZWN0cyAoaS5lLiBkYXRhYmFzZSBzY2hlbWEpIG9yIHRvXG4gICAqIHRoZSBwYXJzZUdyYXBoUUxDb25maWcgb2JqZWN0LiBJZiBub1xuICAgKiBjaGFuZ2VzIGFyZSBmb3VuZCwgcmV0dXJuIHRydWU7XG4gICAqL1xuICBfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkKHBhcmFtczoge1xuICAgIHBhcnNlQ2xhc3NlczogYW55LFxuICAgIHBhcnNlR3JhcGhRTENvbmZpZzogP1BhcnNlR3JhcGhRTENvbmZpZyxcbiAgICBmdW5jdGlvbk5hbWVzU3RyaW5nOiBzdHJpbmcsXG4gIH0pOiBib29sZWFuIHtcbiAgICBjb25zdCB7IHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnLCBmdW5jdGlvbk5hbWVzU3RyaW5nIH0gPSBwYXJhbXM7XG5cbiAgICAvLyBGaXJzdCBpbml0XG4gICAgaWYgKCF0aGlzLmdyYXBoUUxTY2hlbWEpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIGlzRGVlcFN0cmljdEVxdWFsKHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnLCBwYXJzZUdyYXBoUUxDb25maWcpICYmXG4gICAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPT09IGZ1bmN0aW9uTmFtZXNTdHJpbmcgJiZcbiAgICAgIGlzRGVlcFN0cmljdEVxdWFsKHRoaXMucGFyc2VDbGFzc2VzLCBwYXJzZUNsYXNzZXMpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlR3JhcGhRTFNjaGVtYSB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxRQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxPQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxNQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFKLE9BQUE7QUFDQSxJQUFBSyxrQkFBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sbUJBQUEsR0FBQUMsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFRLGVBQUEsR0FBQUQsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFTLGlCQUFBLEdBQUFGLHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBVSxtQkFBQSxHQUFBSCx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVcscUJBQUEsR0FBQUosdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFZLHVCQUFBLEdBQUFMLHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBYSx1QkFBQSxHQUFBTix1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQWMsbUJBQUEsR0FBQWYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFlLFlBQUEs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