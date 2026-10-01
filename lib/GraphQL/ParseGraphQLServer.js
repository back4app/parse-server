"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLServer = void 0;
var _graphqlUploadExpress = _interopRequireDefault(require("graphql-upload/graphqlUploadExpress.js"));
var _server = require("@apollo/server");
var _express = require("@apollo/server/express4");
var _disabled = require("@apollo/server/plugin/disabled");
var _express2 = _interopRequireDefault(require("express"));
var _graphql = require("graphql");
var _middlewares = require("../middlewares");
var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));
var _queryComplexity = require("./helpers/queryComplexity");
var _logger = _interopRequireDefault(require("../logger"));
var _ParseGraphQLSchema = require("./ParseGraphQLSchema");
var _defaultGraphQLTypes = require("./loaders/defaultGraphQLTypes");
var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const IntrospectionControlPlugin = publicIntrospection => ({
  requestDidStart: requestContext => ({
    didResolveOperation: async () => {
      // If public introspection is enabled, we allow all introspection queries
      if (publicIntrospection) {
        return;
      }
      const isMasterOrMaintenance = requestContext.contextValue.auth?.isMaster || requestContext.contextValue.auth?.isMaintenance;
      if (isMasterOrMaintenance) {
        return;
      }

      // Now we check if the query is an introspection query
      // this check strategy should work in 99.99% cases
      // we can have an issue if a user name a field or class __schemaSomething
      // we want to avoid a full AST check
      // Apollo resolves the operation text into `requestContext.source` before this hook
      // runs and guarantees it is set here. It is NOT the same as `request.query`: on an
      // automatic persisted query cache hit the text comes from the persisted-query cache
      // and `request.query` is never populated, so reading `request.query` would leave
      // nothing to inspect and silently skip the guard below. Apollo enables automatic
      // persisted queries by default, so that path is reachable on every deployment. Fall
      // back to `request.query` only for robustness. An operation text that is not a string
      // cannot be inspected at all, so it is denied for the same reason: this guard must
      // never let an operation through uninspected.
      const query = requestContext.source ?? requestContext.request.query;
      const isIntrospectionQuery = typeof query !== 'string' || query.includes('__schema');
      if (isIntrospectionQuery) {
        throw new _graphql.GraphQLError('Introspection is not allowed', {
          extensions: {
            http: {
              status: 403
            }
          }
        });
      }
    }
  })
});

// graphql-js embeds "Did you mean ...?" hints sourced from the live schema in
// its error messages. They are produced in two distinct phases:
//   - validation rules (FieldsOnCorrectTypeRule, KnownArgumentNamesRule,
//     KnownTypeNamesRule, ...), and
//   - variable coercion (unknown enum values, unknown input-object fields),
//     which runs during execution, after validation.
// All of these are returned to the caller and disclose schema identifiers (Cloud
// Code function names, class and field names) that the introspection guard is
// meant to hide. Strip the hint suffix from every returned error — including the
// copy graphql-js duplicates into extensions.stacktrace in non-production — for
// callers that are not allowed to introspect.
const stripSchemaSuggestion = message => typeof message === 'string' ? message.replace(/ ?Did you mean(.+?)\?$/, '') : message;

// graphql-js also emits a base input-coercion message that names a schema
// identifier WITHOUT a "Did you mean" clause, so the suggestion strip above
// cannot reach it: when a required custom input field is omitted, coerceInputValue
// returns 'Field "<name>" of required type "<type>" was not provided.', disclosing
// a field name the caller never supplied. Redact the quoted identifiers from this
// template while preserving the error shape, for callers that are not allowed to
// introspect. The sibling coercion messages ('... is not defined by type "<type>".',
// 'Expected type "<type>" to be an object.') are intentionally left intact: they
// only echo an input type name the caller already referenced in the operation, so
// they disclose nothing the caller did not already provide.
const stripSchemaCoercionIdentifiers = message => typeof message === 'string' ? message.replace(/Field "[^"]*" of required type "[^"]*" was not provided\./g, 'Field of required type was not provided.') : message;

// Type names that reveal nothing about THIS application's schema, so redacting them would cost
// message quality for no security gain. `RESERVED_GRAPHQL_TYPE_NAMES` covers the names the schema
// builder refuses to let a class generate, but Parse registers built-in types outside that list
// too. Of those, only an ENUM can reach the enum templates below, and the GraphQL layer defines
// exactly three enums: `CloudCodeFunction` (reserved), the per-class `<Class>Order` (the
// disclosure these templates exist to redact) and `ReadPreference`. Include the last one so that
// an invalid `options.readPreference` value still names its enum, just as `CloudCodeFunction`
// does — it is identical on every deployment and reachable from every generated find query.
const NON_DISCLOSING_TYPE_NAMES = new Set([..._ParseGraphQLSchema.RESERVED_GRAPHQL_TYPE_NAMES, _defaultGraphQLTypes.READ_PREFERENCE.name]);

// graphql-js also emits base coercion / validation messages that name a nested input
// TYPE without a "Did you mean" clause, so neither strip above reaches them. For a
// Pointer or Relation field the generated input type name embeds the pointer's TARGET
// class (`<Target>PointerInput`, `<Target>RelationWhereInput`, `Create<Target>FieldsInput`)
// — a class the caller never referenced and cannot derive from the field name they
// supplied — so these templates disclose a schema class name to a caller who has only the
// public application id. Redact the quoted type identifier from those templates UNLESS the
// caller referenced it in the operation text: a type name the caller wrote in the operation
// (e.g. `$where: UserWhereInput`) is not a disclosure, and preserving it keeps the message
// ('... is not defined by type "UserWhereInput".') useful. When the operation text is
// unavailable the identifier is redacted (fail closed).
const stripSchemaTypeIdentifiers = (message, operationText) => {
  if (typeof message !== 'string') {
    return message;
  }
  // A generated type identifier is kept (it is not a disclosure) if the caller wrote it as a
  // whole token in the operation text, or if it is a non-disclosing name (above). Tokenize the
  // operation on non-identifier characters and compare exact tokens rather than building a
  // RegExp from the captured name: this avoids substring false-matches (e.g. preserving
  // "AuthorPointerInput" because the operation contains "SecretAuthorPointerInput") and any
  // regex injection/ReDoS from an unusual captured name. GraphQL list/non-null wrappers ("[",
  // "]", "!") are stripped from the captured name so e.g. "SecretAuthorPointerInput!" still
  // matches "$x: SecretAuthorPointerInput!". When the operation text is unavailable the type is
  // treated as not referenced (fail closed).
  const referencedTokens = typeof operationText === 'string' ? new Set(operationText.split(/[^_A-Za-z0-9]+/).filter(Boolean)) : new Set();
  // A non-disclosing type name (`CloudCodeFunction`, `ReadPreference`, `Viewer`, `PageInfo`, the
  // built-in scalars, ...) is identical on every Parse Server deployment and cannot collide with
  // a user class, since `ParseGraphQLSchema` rejects class names that would produce one. Echoing
  // one therefore discloses nothing about THIS application's schema, so it is preserved like a
  // caller-referenced name and the message stays useful.
  const shouldKeepTypeName = typeName => {
    const bareTypeName = typeName.replace(/[[\]!]/g, '');
    return NON_DISCLOSING_TYPE_NAMES.has(bareTypeName) || referencedTokens.has(bareTypeName);
  };
  return message
  // Input coercion / ValuesOfCorrectTypeRule (variables and inline literals).
  .replace(/Expected value of type "([^"]+)"/g, (match, typeName) => shouldKeepTypeName(typeName) ? match : 'Expected value of the correct type').replace(/Expected type "([^"]+)" to be an object\./g, (match, typeName) => shouldKeepTypeName(typeName) ? match : 'Expected an object.').replace(/Expected non-nullable type "([^"]+)" not to be null\./g, (match, typeName) => shouldKeepTypeName(typeName) ? match : 'Expected a non-null value.').replace(/ is not defined by type "([^"]+)"\./g, (match, typeName) => shouldKeepTypeName(typeName) ? match : ' is not defined.')
  // VariablesInAllowedPositionRule: the position type is the pointer/relation target
  // input type; the caller only wrote their own variable's declared type.
  .replace(/ used in position expecting type "([^"]+)"\./g, (match, typeName) => shouldKeepTypeName(typeName) ? match : ' used in position expecting a different type.')
  // FieldsOnCorrectTypeRule: descending into a Pointer/Relation output field names its
  // target output object type.
  .replace(/Cannot query field ("[^"]*") on type "([^"]+)"\./g, (match, fieldName, typeName) => shouldKeepTypeName(typeName) ? match : `Cannot query field ${fieldName}.`)
  // ScalarLeafsRule: selecting a Pointer/Relation output field with no sub-selection names
  // its target output object type.
  .replace(/Field ("[^"]*") of type "([^"]+)" must have a selection of subfields\./g, (match, fieldName, typeName) => shouldKeepTypeName(typeName) ? match : `Field ${fieldName} must have a selection of subfields.`)
  // PossibleFragmentSpreadsRule: an inline/named fragment on an incompatible type inside a
  // Pointer/Relation output field names the target output object type (the parent type).
  // Redact each type token the caller did not reference; when both are referenced the
  // reconstruction is identical to the original message.
  .replace(/objects of type "([^"]+)" can never be of type "([^"]+)"\./g, (match, parentType, fragType) => {
    const parent = shouldKeepTypeName(parentType) ? `type "${parentType}"` : 'the parent type';
    const frag = shouldKeepTypeName(fragType) ? `type "${fragType}"` : 'the given type';
    return `objects of ${parent} can never be of ${frag}.`;
  })
  // KnownArgumentNamesRule: the argument's parent OUTPUT type. Inside a Pointer/Relation
  // sub-selection that parent is the TARGET class, whose output type is named exactly the
  // class name (`parseClassTypes.js`), so it discloses a class the caller never wrote — they
  // only supplied the pointer field name. The type is embedded in a dotted "<Type>.<field>"
  // token; keep the field name (the caller wrote it) and redact only the type half. Note the
  // directive form ('... on directive "@name".') carries no type and is left alone.
  .replace(/Unknown argument ("[^"]*") on field "([^".]+)\.([^".]+)"\./g, (match, argName, typeName, fieldName) => shouldKeepTypeName(typeName) ? match : `Unknown argument ${argName} on field "${fieldName}".`)
  // GraphQLEnumType.parseValue/parseLiteral: a Relation field's `order` argument is typed
  // `[<Target>Order!]` (`parseClassTypes.js`), so an invalid enum literal names the target
  // class. These messages come from the enum type itself rather than from a validation rule,
  // which is why the ValuesOfCorrectTypeRule templates above do not reach them. The offending
  // value is caller-supplied and is preserved; only the enum type name is redacted.
  .replace(/Value ("[^"]*") does not exist in "([^"]+)" enum\./g, (match, value, typeName) => shouldKeepTypeName(typeName) ? match : `Value ${value} does not exist in the enum.`)
  // Sibling branches of the same enum type, reached when the literal is not an enum value at
  // all ('cannot represent non-enum value: ...', 'cannot represent non-string value: ...',
  // 'cannot represent value: ...'). Same disclosure, same redaction.
  .replace(/Enum "([^"]+)" cannot represent /g, (match, typeName) => shouldKeepTypeName(typeName) ? match : 'Enum cannot represent ');
};
const stripSchemaIdentifiers = (message, operationText) => stripSchemaTypeIdentifiers(stripSchemaCoercionIdentifiers(stripSchemaSuggestion(message)), operationText);
const SchemaSuggestionsControlPlugin = publicIntrospection => ({
  requestDidStart: async requestContext => ({
    willSendResponse: async () => {
      if (publicIntrospection) {
        return;
      }
      const isMasterOrMaintenance = requestContext.contextValue.auth?.isMaster || requestContext.contextValue.auth?.isMaintenance;
      if (isMasterOrMaintenance) {
        return;
      }
      const body = requestContext.response?.body;
      const errors = body?.kind === 'single' ? body.singleResult.errors : body?.kind === 'incremental' ? body.initialResult.errors : undefined;
      // Same as in `IntrospectionControlPlugin`: `requestContext.source` carries the
      // operation text for every request, including an automatic persisted query cache hit
      // where `request.query` is undefined. Reading `request.query` alone would make the
      // allowlist below empty on those requests and redact type names the caller wrote
      // themselves.
      const operationText = requestContext.source ?? requestContext.request?.query;
      errors?.forEach(error => {
        error.message = stripSchemaIdentifiers(error.message, operationText);
        if (Array.isArray(error.extensions?.stacktrace)) {
          error.extensions.stacktrace = error.extensions.stacktrace.map(message => stripSchemaIdentifiers(message, operationText));
        }
      });
    }
  })
});
class ParseGraphQLServer {
  constructor(parseServer, config) {
    this.parseServer = parseServer || (0, _requiredParameter.default)('You must provide a parseServer instance!');
    if (!config || !config.graphQLPath) {
      (0, _requiredParameter.default)('You must provide a config.graphQLPath!');
    }
    this.config = config;
    this.parseGraphQLController = this.parseServer.config.parseGraphQLController;
    this.log = this.parseServer.config && this.parseServer.config.loggerController || _logger.default;
    this.parseGraphQLSchema = new _ParseGraphQLSchema.ParseGraphQLSchema({
      parseGraphQLController: this.parseGraphQLController,
      databaseController: this.parseServer.config.databaseController,
      log: this.log,
      graphQLCustomTypeDefs: this.config.graphQLCustomTypeDefs,
      appId: this.parseServer.config.appId
    });
  }
  async _getGraphQLOptions() {
    try {
      return {
        schema: await this.parseGraphQLSchema.load(),
        context: async ({
          req
        }) => {
          return {
            info: req.info,
            config: req.config,
            auth: req.auth
          };
        }
      };
    } catch (e) {
      this.log.error(e.stack || typeof e.toString === 'function' && e.toString() || e);
      throw e;
    }
  }
  async _getServer() {
    const schemaRef = this.parseGraphQLSchema.graphQLSchema;
    const newSchemaRef = await this.parseGraphQLSchema.load();
    if (schemaRef === newSchemaRef && this._server) {
      return this._server;
    }
    // It means a parallel _getServer call is already in progress
    if (this._schemaRefMutex === newSchemaRef) {
      return this._server;
    }
    // Update the schema ref mutex to avoid parallel _getServer calls
    this._schemaRefMutex = newSchemaRef;
    const createServer = async () => {
      try {
        const {
          schema,
          context
        } = await this._getGraphQLOptions();
        const apollo = new _server.ApolloServer({
          csrfPrevention: {
            // See https://www.apollographql.com/docs/router/configuration/csrf/
            // needed since we use graphql upload
            requestHeaders: ['X-Parse-Application-Id']
          },
          introspection: this.config.graphQLPublicIntrospection,
          plugins: [(0, _disabled.ApolloServerPluginCacheControlDisabled)(), IntrospectionControlPlugin(this.config.graphQLPublicIntrospection), SchemaSuggestionsControlPlugin(this.config.graphQLPublicIntrospection), (0, _queryComplexity.createComplexityValidationPlugin)(() => this.parseServer.config.requestComplexity)],
          schema
        });
        await apollo.start();
        return (0, _express.expressMiddleware)(apollo, {
          context
        });
      } catch (e) {
        // Reset all mutexes and forward the error
        this._server = null;
        this._schemaRefMutex = null;
        throw e;
      }
    };
    // Do not await so parallel request will wait the same promise ref
    this._server = createServer();
    return this._server;
  }
  _transformMaxUploadSizeToBytes(maxUploadSize) {
    const unitMap = {
      kb: 1,
      mb: 2,
      gb: 3
    };
    return Number(maxUploadSize.slice(0, -2)) * Math.pow(1024, unitMap[maxUploadSize.slice(-2).toLowerCase()]);
  }

  /**
   * @static
   * Allow developers to customize each request with inversion of control/dependency injection
   */
  applyRequestContextMiddleware(api, options) {
    if (options.requestContextMiddleware) {
      if (typeof options.requestContextMiddleware !== 'function') {
        throw new Error('requestContextMiddleware must be a function');
      }
      api.use(this.config.graphQLPath, options.requestContextMiddleware);
    }
  }
  applyGraphQL(app) {
    if (!app || !app.use) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }
    app.use(this.config.graphQLPath, (0, _middlewares.allowCrossDomain)(this.parseServer.config.appId));
    app.use(this.config.graphQLPath, _middlewares.handleParseHeaders);
    app.use(this.config.graphQLPath, _middlewares.handleParseSession);
    this.applyRequestContextMiddleware(app, this.parseServer.config);
    app.use(this.config.graphQLPath, _middlewares.handleParseErrors);
    app.use(this.config.graphQLPath, (0, _graphqlUploadExpress.default)({
      maxFileSize: this._transformMaxUploadSizeToBytes(this.parseServer.config.maxUploadSize || '20mb')
    }));
    app.use(this.config.graphQLPath, _express2.default.json(), async (req, res, next) => {
      const server = await this._getServer();
      return server(req, res, next);
    });
  }
  applyPlayground(app) {
    if (!app || !app.get) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }
    app.get(this.config.playgroundPath || (0, _requiredParameter.default)('You must provide a config.playgroundPath to applyPlayground!'), (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.write(`<div id="sandbox" style="position:absolute;top:0;right:0;bottom:0;left:0"></div>
          <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
          <script>
           new window.EmbeddedSandbox({
             target: "#sandbox",
             endpointIsEditable: false,
             initialEndpoint: ${JSON.stringify(this.config.graphQLPath)},
             handleRequest: (endpointUrl, options) => {
              return fetch(endpointUrl, {
                ...options,
                headers: {
                    ...options.headers,
                    'X-Parse-Application-Id': ${JSON.stringify(this.parseServer.config.appId)},
                    'X-Parse-Master-Key': ${JSON.stringify(this.parseServer.config.masterKey)},
                },
              })
            },
           });
           // advanced options: https://www.apollographql.com/docs/studio/explorer/sandbox#embedding-sandbox
          </script>`);
      res.end();
    });
  }
  setGraphQLConfig(graphQLConfig) {
    return this.parseGraphQLController.updateGraphQLConfig(graphQLConfig);
  }
}
exports.ParseGraphQLServer = ParseGraphQLServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbFVwbG9hZEV4cHJlc3MiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9zZXJ2ZXIiLCJfZXhwcmVzcyIsIl9kaXNhYmxlZCIsIl9leHByZXNzMiIsIl9ncmFwaHFsIiwiX21pZGRsZXdhcmVzIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX3F1ZXJ5Q29tcGxleGl0eSIsIl9sb2dnZXIiLCJfUGFyc2VHcmFwaFFMU2NoZW1hIiwiX2RlZmF1bHRHcmFwaFFMVHlwZXMiLCJfUGFyc2VHcmFwaFFMQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiZSIsInQiLCJXZWFrTWFwIiwiciIsIm4iLCJfX2VzTW9kdWxlIiwibyIsImkiLCJmIiwiX19wcm90b19fIiwiZGVmYXVsdCIsImhhcyIsImdldCIsInNldCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiSW50cm9zcGVjdGlvbkNvbnRyb2xQbHVnaW4iLCJwdWJsaWNJbnRyb3NwZWN0aW9uIiwicmVxdWVzdERpZFN0YXJ0IiwicmVxdWVzdENvbnRleHQiLCJkaWRSZXNvbHZlT3BlcmF0aW9uIiwiaXNNYXN0ZXJPck1haW50ZW5hbmNlIiwiY29udGV4dFZhbHVlIiwiYXV0aCIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsInF1ZXJ5Iiwic291cmNlIiwicmVxdWVzdCIsImlzSW50cm9zcGVjdGlvblF1ZXJ5IiwiaW5jbHVkZXMiLCJHcmFwaFFMRXJyb3IiLCJleHRlbnNpb25zIiwiaHR0cCIsInN0YXR1cyIsInN0cmlwU2NoZW1hU3VnZ2VzdGlvbiIsIm1lc3NhZ2UiLCJyZXBsYWNlIiwic3RyaXBTY2hlbWFDb2VyY2lvbklkZW50aWZpZXJzIiwiTk9OX0RJU0NMT1NJTkdfVFlQRV9OQU1FUyIsIlNldCIsIlJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyIsIlJFQURfUFJFRkVSRU5DRSIsIm5hbWUiLCJzdHJpcFNjaGVtYVR5cGVJZGVudGlmaWVycyIsIm9wZXJhdGlvblRleHQiLCJyZWZlcmVuY2VkVG9rZW5zIiwic3BsaXQiLCJmaWx0ZXIiLCJCb29sZWFuIiwic2hvdWxkS2VlcFR5cGVOYW1lIiwidHlwZU5hbWUiLCJiYXJlVHlwZU5hbWUiLCJtYXRjaCIsImZpZWxkTmFtZSIsInBhcmVudFR5cGUiLCJmcmFnVHlwZSIsInBhcmVudCIsImZyYWciLCJhcmdOYW1lIiwidmFsdWUiLCJzdHJpcFNjaGVtYUlkZW50aWZpZXJzIiwiU2NoZW1hU3VnZ2VzdGlvbnNDb250cm9sUGx1Z2luIiwid2lsbFNlbmRSZXNwb25zZSIsImJvZHkiLCJyZXNwb25zZSIsImVycm9ycyIsImtpbmQiLCJzaW5nbGVSZXN1bHQiLCJpbml0aWFsUmVzdWx0IiwidW5kZWZpbmVkIiwiZm9yRWFjaCIsImVycm9yIiwiQXJyYXkiLCJpc0FycmF5Iiwic3RhY2t0cmFjZSIsIm1hcCIsIlBhcnNlR3JhcGhRTFNlcnZlciIsImNvbnN0cnVjdG9yIiwicGFyc2VTZXJ2ZXIiLCJjb25maWciLCJyZXF1aXJlZFBhcmFtZXRlciIsImdyYXBoUUxQYXRoIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkZWZhdWx0TG9nZ2VyIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiUGFyc2VHcmFwaFFMU2NoZW1hIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwiYXBwSWQiLCJfZ2V0R3JhcGhRTE9wdGlvbnMiLCJzY2hlbWEiLCJsb2FkIiwiY29udGV4dCIsInJlcSIsImluZm8iLCJzdGFjayIsInRvU3RyaW5nIiwiX2dldFNlcnZlciIsInNjaGVtYVJlZiIsImdyYXBoUUxTY2hlbWEiLCJuZXdTY2hlbWFSZWYiLCJfc2NoZW1hUmVmTXV0ZXgiLCJjcmVhdGVTZXJ2ZXIiLCJhcG9sbG8iLCJBcG9sbG9TZXJ2ZXIiLCJjc3JmUHJldmVudGlvbiIsInJlcXVlc3RIZWFkZXJzIiwiaW50cm9zcGVjdGlvbiIsImdyYXBoUUxQdWJsaWNJbnRyb3NwZWN0aW9uIiwicGx1Z2lucyIsIkFwb2xsb1NlcnZlclBsdWdpbkNhY2hlQ29udHJvbERpc2FibGVkIiwiY3JlYXRlQ29tcGxleGl0eVZhbGlkYXRpb25QbHVnaW4iLCJyZXF1ZXN0Q29tcGxleGl0eSIsInN0YXJ0IiwiZXhwcmVzc01pZGRsZXdhcmUiLCJfdHJhbnNmb3JtTWF4VXBsb2FkU2l6ZVRvQnl0ZXMiLCJtYXhVcGxvYWRTaXplIiwidW5pdE1hcCIsImtiIiwibWIiLCJnYiIsIk51bWJlciIsInNsaWNlIiwiTWF0aCIsInBvdyIsInRvTG93ZXJDYXNlIiwiYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJhcGkiLCJvcHRpb25zIiwicmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIiwiRXJyb3IiLCJ1c2UiLCJhcHBseUdyYXBoUUwiLCJhcHAiLCJhbGxvd0Nyb3NzRG9tYWluIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJncmFwaHFsVXBsb2FkRXhwcmVzcyIsIm1heEZpbGVTaXplIiwiZXhwcmVzcyIsImpzb24iLCJyZXMiLCJuZXh0Iiwic2VydmVyIiwiYXBwbHlQbGF5Z3JvdW5kIiwicGxheWdyb3VuZFBhdGgiLCJfcmVxIiwic2V0SGVhZGVyIiwid3JpdGUiLCJKU09OIiwic3RyaW5naWZ5IiwibWFzdGVyS2V5IiwiZW5kIiwic2V0R3JhcGhRTENvbmZpZyIsImdyYXBoUUxDb25maWciLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZ3JhcGhxbFVwbG9hZEV4cHJlc3MgZnJvbSAnZ3JhcGhxbC11cGxvYWQvZ3JhcGhxbFVwbG9hZEV4cHJlc3MuanMnO1xuaW1wb3J0IHsgQXBvbGxvU2VydmVyIH0gZnJvbSAnQGFwb2xsby9zZXJ2ZXInO1xuaW1wb3J0IHsgZXhwcmVzc01pZGRsZXdhcmUgfSBmcm9tICdAYXBvbGxvL3NlcnZlci9leHByZXNzNCc7XG5pbXBvcnQgeyBBcG9sbG9TZXJ2ZXJQbHVnaW5DYWNoZUNvbnRyb2xEaXNhYmxlZCB9IGZyb20gJ0BhcG9sbG8vc2VydmVyL3BsdWdpbi9kaXNhYmxlZCc7XG5pbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IEdyYXBoUUxFcnJvciB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgYWxsb3dDcm9zc0RvbWFpbiwgaGFuZGxlUGFyc2VFcnJvcnMsIGhhbmRsZVBhcnNlSGVhZGVycywgaGFuZGxlUGFyc2VTZXNzaW9uIH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IGNyZWF0ZUNvbXBsZXhpdHlWYWxpZGF0aW9uUGx1Z2luIH0gZnJvbSAnLi9oZWxwZXJzL3F1ZXJ5Q29tcGxleGl0eSc7XG5pbXBvcnQgZGVmYXVsdExvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hLCBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMgfSBmcm9tICcuL1BhcnNlR3JhcGhRTFNjaGVtYSc7XG5pbXBvcnQgeyBSRUFEX1BSRUZFUkVOQ0UgfSBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwgeyBQYXJzZUdyYXBoUUxDb25maWcgfSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcblxuXG5jb25zdCBJbnRyb3NwZWN0aW9uQ29udHJvbFBsdWdpbiA9IChwdWJsaWNJbnRyb3NwZWN0aW9uKSA9PiAoe1xuXG5cbiAgcmVxdWVzdERpZFN0YXJ0OiAocmVxdWVzdENvbnRleHQpID0+ICh7XG5cbiAgICBkaWRSZXNvbHZlT3BlcmF0aW9uOiBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBJZiBwdWJsaWMgaW50cm9zcGVjdGlvbiBpcyBlbmFibGVkLCB3ZSBhbGxvdyBhbGwgaW50cm9zcGVjdGlvbiBxdWVyaWVzXG4gICAgICBpZiAocHVibGljSW50cm9zcGVjdGlvbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzTWFzdGVyT3JNYWludGVuYW5jZSA9IHJlcXVlc3RDb250ZXh0LmNvbnRleHRWYWx1ZS5hdXRoPy5pc01hc3RlciB8fCByZXF1ZXN0Q29udGV4dC5jb250ZXh0VmFsdWUuYXV0aD8uaXNNYWludGVuYW5jZVxuICAgICAgaWYgKGlzTWFzdGVyT3JNYWludGVuYW5jZSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIE5vdyB3ZSBjaGVjayBpZiB0aGUgcXVlcnkgaXMgYW4gaW50cm9zcGVjdGlvbiBxdWVyeVxuICAgICAgLy8gdGhpcyBjaGVjayBzdHJhdGVneSBzaG91bGQgd29yayBpbiA5OS45OSUgY2FzZXNcbiAgICAgIC8vIHdlIGNhbiBoYXZlIGFuIGlzc3VlIGlmIGEgdXNlciBuYW1lIGEgZmllbGQgb3IgY2xhc3MgX19zY2hlbWFTb21ldGhpbmdcbiAgICAgIC8vIHdlIHdhbnQgdG8gYXZvaWQgYSBmdWxsIEFTVCBjaGVja1xuICAgICAgLy8gQXBvbGxvIHJlc29sdmVzIHRoZSBvcGVyYXRpb24gdGV4dCBpbnRvIGByZXF1ZXN0Q29udGV4dC5zb3VyY2VgIGJlZm9yZSB0aGlzIGhvb2tcbiAgICAgIC8vIHJ1bnMgYW5kIGd1YXJhbnRlZXMgaXQgaXMgc2V0IGhlcmUuIEl0IGlzIE5PVCB0aGUgc2FtZSBhcyBgcmVxdWVzdC5xdWVyeWA6IG9uIGFuXG4gICAgICAvLyBhdXRvbWF0aWMgcGVyc2lzdGVkIHF1ZXJ5IGNhY2hlIGhpdCB0aGUgdGV4dCBjb21lcyBmcm9tIHRoZSBwZXJzaXN0ZWQtcXVlcnkgY2FjaGVcbiAgICAgIC8vIGFuZCBgcmVxdWVzdC5xdWVyeWAgaXMgbmV2ZXIgcG9wdWxhdGVkLCBzbyByZWFkaW5nIGByZXF1ZXN0LnF1ZXJ5YCB3b3VsZCBsZWF2ZVxuICAgICAgLy8gbm90aGluZyB0byBpbnNwZWN0IGFuZCBzaWxlbnRseSBza2lwIHRoZSBndWFyZCBiZWxvdy4gQXBvbGxvIGVuYWJsZXMgYXV0b21hdGljXG4gICAgICAvLyBwZXJzaXN0ZWQgcXVlcmllcyBieSBkZWZhdWx0LCBzbyB0aGF0IHBhdGggaXMgcmVhY2hhYmxlIG9uIGV2ZXJ5IGRlcGxveW1lbnQuIEZhbGxcbiAgICAgIC8vIGJhY2sgdG8gYHJlcXVlc3QucXVlcnlgIG9ubHkgZm9yIHJvYnVzdG5lc3MuIEFuIG9wZXJhdGlvbiB0ZXh0IHRoYXQgaXMgbm90IGEgc3RyaW5nXG4gICAgICAvLyBjYW5ub3QgYmUgaW5zcGVjdGVkIGF0IGFsbCwgc28gaXQgaXMgZGVuaWVkIGZvciB0aGUgc2FtZSByZWFzb246IHRoaXMgZ3VhcmQgbXVzdFxuICAgICAgLy8gbmV2ZXIgbGV0IGFuIG9wZXJhdGlvbiB0aHJvdWdoIHVuaW5zcGVjdGVkLlxuICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0Q29udGV4dC5zb3VyY2UgPz8gcmVxdWVzdENvbnRleHQucmVxdWVzdC5xdWVyeTtcbiAgICAgIGNvbnN0IGlzSW50cm9zcGVjdGlvblF1ZXJ5ID0gdHlwZW9mIHF1ZXJ5ICE9PSAnc3RyaW5nJyB8fCBxdWVyeS5pbmNsdWRlcygnX19zY2hlbWEnKVxuXG4gICAgICBpZiAoaXNJbnRyb3NwZWN0aW9uUXVlcnkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEdyYXBoUUxFcnJvcignSW50cm9zcGVjdGlvbiBpcyBub3QgYWxsb3dlZCcsIHtcbiAgICAgICAgICBleHRlbnNpb25zOiB7XG4gICAgICAgICAgICBodHRwOiB7XG4gICAgICAgICAgICAgIHN0YXR1czogNDAzLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG5cbiAgfSlcblxufSk7XG5cbi8vIGdyYXBocWwtanMgZW1iZWRzIFwiRGlkIHlvdSBtZWFuIC4uLj9cIiBoaW50cyBzb3VyY2VkIGZyb20gdGhlIGxpdmUgc2NoZW1hIGluXG4vLyBpdHMgZXJyb3IgbWVzc2FnZXMuIFRoZXkgYXJlIHByb2R1Y2VkIGluIHR3byBkaXN0aW5jdCBwaGFzZXM6XG4vLyAgIC0gdmFsaWRhdGlvbiBydWxlcyAoRmllbGRzT25Db3JyZWN0VHlwZVJ1bGUsIEtub3duQXJndW1lbnROYW1lc1J1bGUsXG4vLyAgICAgS25vd25UeXBlTmFtZXNSdWxlLCAuLi4pLCBhbmRcbi8vICAgLSB2YXJpYWJsZSBjb2VyY2lvbiAodW5rbm93biBlbnVtIHZhbHVlcywgdW5rbm93biBpbnB1dC1vYmplY3QgZmllbGRzKSxcbi8vICAgICB3aGljaCBydW5zIGR1cmluZyBleGVjdXRpb24sIGFmdGVyIHZhbGlkYXRpb24uXG4vLyBBbGwgb2YgdGhlc2UgYXJlIHJldHVybmVkIHRvIHRoZSBjYWxsZXIgYW5kIGRpc2Nsb3NlIHNjaGVtYSBpZGVudGlmaWVycyAoQ2xvdWRcbi8vIENvZGUgZnVuY3Rpb24gbmFtZXMsIGNsYXNzIGFuZCBmaWVsZCBuYW1lcykgdGhhdCB0aGUgaW50cm9zcGVjdGlvbiBndWFyZCBpc1xuLy8gbWVhbnQgdG8gaGlkZS4gU3RyaXAgdGhlIGhpbnQgc3VmZml4IGZyb20gZXZlcnkgcmV0dXJuZWQgZXJyb3Ig4oCUIGluY2x1ZGluZyB0aGVcbi8vIGNvcHkgZ3JhcGhxbC1qcyBkdXBsaWNhdGVzIGludG8gZXh0ZW5zaW9ucy5zdGFja3RyYWNlIGluIG5vbi1wcm9kdWN0aW9uIOKAlCBmb3Jcbi8vIGNhbGxlcnMgdGhhdCBhcmUgbm90IGFsbG93ZWQgdG8gaW50cm9zcGVjdC5cbmNvbnN0IHN0cmlwU2NoZW1hU3VnZ2VzdGlvbiA9IG1lc3NhZ2UgPT5cbiAgdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5yZXBsYWNlKC8gP0RpZCB5b3UgbWVhbiguKz8pXFw/JC8sICcnKSA6IG1lc3NhZ2U7XG5cbi8vIGdyYXBocWwtanMgYWxzbyBlbWl0cyBhIGJhc2UgaW5wdXQtY29lcmNpb24gbWVzc2FnZSB0aGF0IG5hbWVzIGEgc2NoZW1hXG4vLyBpZGVudGlmaWVyIFdJVEhPVVQgYSBcIkRpZCB5b3UgbWVhblwiIGNsYXVzZSwgc28gdGhlIHN1Z2dlc3Rpb24gc3RyaXAgYWJvdmVcbi8vIGNhbm5vdCByZWFjaCBpdDogd2hlbiBhIHJlcXVpcmVkIGN1c3RvbSBpbnB1dCBmaWVsZCBpcyBvbWl0dGVkLCBjb2VyY2VJbnB1dFZhbHVlXG4vLyByZXR1cm5zICdGaWVsZCBcIjxuYW1lPlwiIG9mIHJlcXVpcmVkIHR5cGUgXCI8dHlwZT5cIiB3YXMgbm90IHByb3ZpZGVkLicsIGRpc2Nsb3Npbmdcbi8vIGEgZmllbGQgbmFtZSB0aGUgY2FsbGVyIG5ldmVyIHN1cHBsaWVkLiBSZWRhY3QgdGhlIHF1b3RlZCBpZGVudGlmaWVycyBmcm9tIHRoaXNcbi8vIHRlbXBsYXRlIHdoaWxlIHByZXNlcnZpbmcgdGhlIGVycm9yIHNoYXBlLCBmb3IgY2FsbGVycyB0aGF0IGFyZSBub3QgYWxsb3dlZCB0b1xuLy8gaW50cm9zcGVjdC4gVGhlIHNpYmxpbmcgY29lcmNpb24gbWVzc2FnZXMgKCcuLi4gaXMgbm90IGRlZmluZWQgYnkgdHlwZSBcIjx0eXBlPlwiLicsXG4vLyAnRXhwZWN0ZWQgdHlwZSBcIjx0eXBlPlwiIHRvIGJlIGFuIG9iamVjdC4nKSBhcmUgaW50ZW50aW9uYWxseSBsZWZ0IGludGFjdDogdGhleVxuLy8gb25seSBlY2hvIGFuIGlucHV0IHR5cGUgbmFtZSB0aGUgY2FsbGVyIGFscmVhZHkgcmVmZXJlbmNlZCBpbiB0aGUgb3BlcmF0aW9uLCBzb1xuLy8gdGhleSBkaXNjbG9zZSBub3RoaW5nIHRoZSBjYWxsZXIgZGlkIG5vdCBhbHJlYWR5IHByb3ZpZGUuXG5jb25zdCBzdHJpcFNjaGVtYUNvZXJjaW9uSWRlbnRpZmllcnMgPSBtZXNzYWdlID0+XG4gIHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJ1xuICAgID8gbWVzc2FnZS5yZXBsYWNlKFxuICAgICAgL0ZpZWxkIFwiW15cIl0qXCIgb2YgcmVxdWlyZWQgdHlwZSBcIlteXCJdKlwiIHdhcyBub3QgcHJvdmlkZWRcXC4vZyxcbiAgICAgICdGaWVsZCBvZiByZXF1aXJlZCB0eXBlIHdhcyBub3QgcHJvdmlkZWQuJ1xuICAgIClcbiAgICA6IG1lc3NhZ2U7XG5cbi8vIFR5cGUgbmFtZXMgdGhhdCByZXZlYWwgbm90aGluZyBhYm91dCBUSElTIGFwcGxpY2F0aW9uJ3Mgc2NoZW1hLCBzbyByZWRhY3RpbmcgdGhlbSB3b3VsZCBjb3N0XG4vLyBtZXNzYWdlIHF1YWxpdHkgZm9yIG5vIHNlY3VyaXR5IGdhaW4uIGBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVNgIGNvdmVycyB0aGUgbmFtZXMgdGhlIHNjaGVtYVxuLy8gYnVpbGRlciByZWZ1c2VzIHRvIGxldCBhIGNsYXNzIGdlbmVyYXRlLCBidXQgUGFyc2UgcmVnaXN0ZXJzIGJ1aWx0LWluIHR5cGVzIG91dHNpZGUgdGhhdCBsaXN0XG4vLyB0b28uIE9mIHRob3NlLCBvbmx5IGFuIEVOVU0gY2FuIHJlYWNoIHRoZSBlbnVtIHRlbXBsYXRlcyBiZWxvdywgYW5kIHRoZSBHcmFwaFFMIGxheWVyIGRlZmluZXNcbi8vIGV4YWN0bHkgdGhyZWUgZW51bXM6IGBDbG91ZENvZGVGdW5jdGlvbmAgKHJlc2VydmVkKSwgdGhlIHBlci1jbGFzcyBgPENsYXNzPk9yZGVyYCAodGhlXG4vLyBkaXNjbG9zdXJlIHRoZXNlIHRlbXBsYXRlcyBleGlzdCB0byByZWRhY3QpIGFuZCBgUmVhZFByZWZlcmVuY2VgLiBJbmNsdWRlIHRoZSBsYXN0IG9uZSBzbyB0aGF0XG4vLyBhbiBpbnZhbGlkIGBvcHRpb25zLnJlYWRQcmVmZXJlbmNlYCB2YWx1ZSBzdGlsbCBuYW1lcyBpdHMgZW51bSwganVzdCBhcyBgQ2xvdWRDb2RlRnVuY3Rpb25gXG4vLyBkb2VzIOKAlCBpdCBpcyBpZGVudGljYWwgb24gZXZlcnkgZGVwbG95bWVudCBhbmQgcmVhY2hhYmxlIGZyb20gZXZlcnkgZ2VuZXJhdGVkIGZpbmQgcXVlcnkuXG5jb25zdCBOT05fRElTQ0xPU0lOR19UWVBFX05BTUVTID0gbmV3IFNldChbLi4uUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLCBSRUFEX1BSRUZFUkVOQ0UubmFtZV0pO1xuXG4vLyBncmFwaHFsLWpzIGFsc28gZW1pdHMgYmFzZSBjb2VyY2lvbiAvIHZhbGlkYXRpb24gbWVzc2FnZXMgdGhhdCBuYW1lIGEgbmVzdGVkIGlucHV0XG4vLyBUWVBFIHdpdGhvdXQgYSBcIkRpZCB5b3UgbWVhblwiIGNsYXVzZSwgc28gbmVpdGhlciBzdHJpcCBhYm92ZSByZWFjaGVzIHRoZW0uIEZvciBhXG4vLyBQb2ludGVyIG9yIFJlbGF0aW9uIGZpZWxkIHRoZSBnZW5lcmF0ZWQgaW5wdXQgdHlwZSBuYW1lIGVtYmVkcyB0aGUgcG9pbnRlcidzIFRBUkdFVFxuLy8gY2xhc3MgKGA8VGFyZ2V0PlBvaW50ZXJJbnB1dGAsIGA8VGFyZ2V0PlJlbGF0aW9uV2hlcmVJbnB1dGAsIGBDcmVhdGU8VGFyZ2V0PkZpZWxkc0lucHV0YClcbi8vIOKAlCBhIGNsYXNzIHRoZSBjYWxsZXIgbmV2ZXIgcmVmZXJlbmNlZCBhbmQgY2Fubm90IGRlcml2ZSBmcm9tIHRoZSBmaWVsZCBuYW1lIHRoZXlcbi8vIHN1cHBsaWVkIOKAlCBzbyB0aGVzZSB0ZW1wbGF0ZXMgZGlzY2xvc2UgYSBzY2hlbWEgY2xhc3MgbmFtZSB0byBhIGNhbGxlciB3aG8gaGFzIG9ubHkgdGhlXG4vLyBwdWJsaWMgYXBwbGljYXRpb24gaWQuIFJlZGFjdCB0aGUgcXVvdGVkIHR5cGUgaWRlbnRpZmllciBmcm9tIHRob3NlIHRlbXBsYXRlcyBVTkxFU1MgdGhlXG4vLyBjYWxsZXIgcmVmZXJlbmNlZCBpdCBpbiB0aGUgb3BlcmF0aW9uIHRleHQ6IGEgdHlwZSBuYW1lIHRoZSBjYWxsZXIgd3JvdGUgaW4gdGhlIG9wZXJhdGlvblxuLy8gKGUuZy4gYCR3aGVyZTogVXNlcldoZXJlSW5wdXRgKSBpcyBub3QgYSBkaXNjbG9zdXJlLCBhbmQgcHJlc2VydmluZyBpdCBrZWVwcyB0aGUgbWVzc2FnZVxuLy8gKCcuLi4gaXMgbm90IGRlZmluZWQgYnkgdHlwZSBcIlVzZXJXaGVyZUlucHV0XCIuJykgdXNlZnVsLiBXaGVuIHRoZSBvcGVyYXRpb24gdGV4dCBpc1xuLy8gdW5hdmFpbGFibGUgdGhlIGlkZW50aWZpZXIgaXMgcmVkYWN0ZWQgKGZhaWwgY2xvc2VkKS5cbmNvbnN0IHN0cmlwU2NoZW1hVHlwZUlkZW50aWZpZXJzID0gKG1lc3NhZ2UsIG9wZXJhdGlvblRleHQpID0+IHtcbiAgaWYgKHR5cGVvZiBtZXNzYWdlICE9PSAnc3RyaW5nJykgeyByZXR1cm4gbWVzc2FnZTsgfVxuICAvLyBBIGdlbmVyYXRlZCB0eXBlIGlkZW50aWZpZXIgaXMga2VwdCAoaXQgaXMgbm90IGEgZGlzY2xvc3VyZSkgaWYgdGhlIGNhbGxlciB3cm90ZSBpdCBhcyBhXG4gIC8vIHdob2xlIHRva2VuIGluIHRoZSBvcGVyYXRpb24gdGV4dCwgb3IgaWYgaXQgaXMgYSBub24tZGlzY2xvc2luZyBuYW1lIChhYm92ZSkuIFRva2VuaXplIHRoZVxuICAvLyBvcGVyYXRpb24gb24gbm9uLWlkZW50aWZpZXIgY2hhcmFjdGVycyBhbmQgY29tcGFyZSBleGFjdCB0b2tlbnMgcmF0aGVyIHRoYW4gYnVpbGRpbmcgYVxuICAvLyBSZWdFeHAgZnJvbSB0aGUgY2FwdHVyZWQgbmFtZTogdGhpcyBhdm9pZHMgc3Vic3RyaW5nIGZhbHNlLW1hdGNoZXMgKGUuZy4gcHJlc2VydmluZ1xuICAvLyBcIkF1dGhvclBvaW50ZXJJbnB1dFwiIGJlY2F1c2UgdGhlIG9wZXJhdGlvbiBjb250YWlucyBcIlNlY3JldEF1dGhvclBvaW50ZXJJbnB1dFwiKSBhbmQgYW55XG4gIC8vIHJlZ2V4IGluamVjdGlvbi9SZURvUyBmcm9tIGFuIHVudXN1YWwgY2FwdHVyZWQgbmFtZS4gR3JhcGhRTCBsaXN0L25vbi1udWxsIHdyYXBwZXJzIChcIltcIixcbiAgLy8gXCJdXCIsIFwiIVwiKSBhcmUgc3RyaXBwZWQgZnJvbSB0aGUgY2FwdHVyZWQgbmFtZSBzbyBlLmcuIFwiU2VjcmV0QXV0aG9yUG9pbnRlcklucHV0IVwiIHN0aWxsXG4gIC8vIG1hdGNoZXMgXCIkeDogU2VjcmV0QXV0aG9yUG9pbnRlcklucHV0IVwiLiBXaGVuIHRoZSBvcGVyYXRpb24gdGV4dCBpcyB1bmF2YWlsYWJsZSB0aGUgdHlwZSBpc1xuICAvLyB0cmVhdGVkIGFzIG5vdCByZWZlcmVuY2VkIChmYWlsIGNsb3NlZCkuXG4gIGNvbnN0IHJlZmVyZW5jZWRUb2tlbnMgPVxuICAgIHR5cGVvZiBvcGVyYXRpb25UZXh0ID09PSAnc3RyaW5nJ1xuICAgICAgPyBuZXcgU2V0KG9wZXJhdGlvblRleHQuc3BsaXQoL1teX0EtWmEtejAtOV0rLykuZmlsdGVyKEJvb2xlYW4pKVxuICAgICAgOiBuZXcgU2V0KCk7XG4gIC8vIEEgbm9uLWRpc2Nsb3NpbmcgdHlwZSBuYW1lIChgQ2xvdWRDb2RlRnVuY3Rpb25gLCBgUmVhZFByZWZlcmVuY2VgLCBgVmlld2VyYCwgYFBhZ2VJbmZvYCwgdGhlXG4gIC8vIGJ1aWx0LWluIHNjYWxhcnMsIC4uLikgaXMgaWRlbnRpY2FsIG9uIGV2ZXJ5IFBhcnNlIFNlcnZlciBkZXBsb3ltZW50IGFuZCBjYW5ub3QgY29sbGlkZSB3aXRoXG4gIC8vIGEgdXNlciBjbGFzcywgc2luY2UgYFBhcnNlR3JhcGhRTFNjaGVtYWAgcmVqZWN0cyBjbGFzcyBuYW1lcyB0aGF0IHdvdWxkIHByb2R1Y2Ugb25lLiBFY2hvaW5nXG4gIC8vIG9uZSB0aGVyZWZvcmUgZGlzY2xvc2VzIG5vdGhpbmcgYWJvdXQgVEhJUyBhcHBsaWNhdGlvbidzIHNjaGVtYSwgc28gaXQgaXMgcHJlc2VydmVkIGxpa2UgYVxuICAvLyBjYWxsZXItcmVmZXJlbmNlZCBuYW1lIGFuZCB0aGUgbWVzc2FnZSBzdGF5cyB1c2VmdWwuXG4gIGNvbnN0IHNob3VsZEtlZXBUeXBlTmFtZSA9IHR5cGVOYW1lID0+IHtcbiAgICBjb25zdCBiYXJlVHlwZU5hbWUgPSB0eXBlTmFtZS5yZXBsYWNlKC9bW1xcXSFdL2csICcnKTtcbiAgICByZXR1cm4gTk9OX0RJU0NMT1NJTkdfVFlQRV9OQU1FUy5oYXMoYmFyZVR5cGVOYW1lKSB8fCByZWZlcmVuY2VkVG9rZW5zLmhhcyhiYXJlVHlwZU5hbWUpO1xuICB9O1xuICByZXR1cm4gbWVzc2FnZVxuICAgIC8vIElucHV0IGNvZXJjaW9uIC8gVmFsdWVzT2ZDb3JyZWN0VHlwZVJ1bGUgKHZhcmlhYmxlcyBhbmQgaW5saW5lIGxpdGVyYWxzKS5cbiAgICAucmVwbGFjZSgvRXhwZWN0ZWQgdmFsdWUgb2YgdHlwZSBcIihbXlwiXSspXCIvZywgKG1hdGNoLCB0eXBlTmFtZSkgPT5cbiAgICAgIHNob3VsZEtlZXBUeXBlTmFtZSh0eXBlTmFtZSkgPyBtYXRjaCA6ICdFeHBlY3RlZCB2YWx1ZSBvZiB0aGUgY29ycmVjdCB0eXBlJ1xuICAgIClcbiAgICAucmVwbGFjZSgvRXhwZWN0ZWQgdHlwZSBcIihbXlwiXSspXCIgdG8gYmUgYW4gb2JqZWN0XFwuL2csIChtYXRjaCwgdHlwZU5hbWUpID0+XG4gICAgICBzaG91bGRLZWVwVHlwZU5hbWUodHlwZU5hbWUpID8gbWF0Y2ggOiAnRXhwZWN0ZWQgYW4gb2JqZWN0LidcbiAgICApXG4gICAgLnJlcGxhY2UoL0V4cGVjdGVkIG5vbi1udWxsYWJsZSB0eXBlIFwiKFteXCJdKylcIiBub3QgdG8gYmUgbnVsbFxcLi9nLCAobWF0Y2gsIHR5cGVOYW1lKSA9PlxuICAgICAgc2hvdWxkS2VlcFR5cGVOYW1lKHR5cGVOYW1lKSA/IG1hdGNoIDogJ0V4cGVjdGVkIGEgbm9uLW51bGwgdmFsdWUuJ1xuICAgIClcbiAgICAucmVwbGFjZSgvIGlzIG5vdCBkZWZpbmVkIGJ5IHR5cGUgXCIoW15cIl0rKVwiXFwuL2csIChtYXRjaCwgdHlwZU5hbWUpID0+XG4gICAgICBzaG91bGRLZWVwVHlwZU5hbWUodHlwZU5hbWUpID8gbWF0Y2ggOiAnIGlzIG5vdCBkZWZpbmVkLidcbiAgICApXG4gICAgLy8gVmFyaWFibGVzSW5BbGxvd2VkUG9zaXRpb25SdWxlOiB0aGUgcG9zaXRpb24gdHlwZSBpcyB0aGUgcG9pbnRlci9yZWxhdGlvbiB0YXJnZXRcbiAgICAvLyBpbnB1dCB0eXBlOyB0aGUgY2FsbGVyIG9ubHkgd3JvdGUgdGhlaXIgb3duIHZhcmlhYmxlJ3MgZGVjbGFyZWQgdHlwZS5cbiAgICAucmVwbGFjZSgvIHVzZWQgaW4gcG9zaXRpb24gZXhwZWN0aW5nIHR5cGUgXCIoW15cIl0rKVwiXFwuL2csIChtYXRjaCwgdHlwZU5hbWUpID0+XG4gICAgICBzaG91bGRLZWVwVHlwZU5hbWUodHlwZU5hbWUpID8gbWF0Y2ggOiAnIHVzZWQgaW4gcG9zaXRpb24gZXhwZWN0aW5nIGEgZGlmZmVyZW50IHR5cGUuJ1xuICAgIClcbiAgICAvLyBGaWVsZHNPbkNvcnJlY3RUeXBlUnVsZTogZGVzY2VuZGluZyBpbnRvIGEgUG9pbnRlci9SZWxhdGlvbiBvdXRwdXQgZmllbGQgbmFtZXMgaXRzXG4gICAgLy8gdGFyZ2V0IG91dHB1dCBvYmplY3QgdHlwZS5cbiAgICAucmVwbGFjZSgvQ2Fubm90IHF1ZXJ5IGZpZWxkIChcIlteXCJdKlwiKSBvbiB0eXBlIFwiKFteXCJdKylcIlxcLi9nLCAobWF0Y2gsIGZpZWxkTmFtZSwgdHlwZU5hbWUpID0+XG4gICAgICBzaG91bGRLZWVwVHlwZU5hbWUodHlwZU5hbWUpID8gbWF0Y2ggOiBgQ2Fubm90IHF1ZXJ5IGZpZWxkICR7ZmllbGROYW1lfS5gXG4gICAgKVxuICAgIC8vIFNjYWxhckxlYWZzUnVsZTogc2VsZWN0aW5nIGEgUG9pbnRlci9SZWxhdGlvbiBvdXRwdXQgZmllbGQgd2l0aCBubyBzdWItc2VsZWN0aW9uIG5hbWVzXG4gICAgLy8gaXRzIHRhcmdldCBvdXRwdXQgb2JqZWN0IHR5cGUuXG4gICAgLnJlcGxhY2UoXG4gICAgICAvRmllbGQgKFwiW15cIl0qXCIpIG9mIHR5cGUgXCIoW15cIl0rKVwiIG11c3QgaGF2ZSBhIHNlbGVjdGlvbiBvZiBzdWJmaWVsZHNcXC4vZyxcbiAgICAgIChtYXRjaCwgZmllbGROYW1lLCB0eXBlTmFtZSkgPT5cbiAgICAgICAgc2hvdWxkS2VlcFR5cGVOYW1lKHR5cGVOYW1lKVxuICAgICAgICAgID8gbWF0Y2hcbiAgICAgICAgICA6IGBGaWVsZCAke2ZpZWxkTmFtZX0gbXVzdCBoYXZlIGEgc2VsZWN0aW9uIG9mIHN1YmZpZWxkcy5gXG4gICAgKVxuICAgIC8vIFBvc3NpYmxlRnJhZ21lbnRTcHJlYWRzUnVsZTogYW4gaW5saW5lL25hbWVkIGZyYWdtZW50IG9uIGFuIGluY29tcGF0aWJsZSB0eXBlIGluc2lkZSBhXG4gICAgLy8gUG9pbnRlci9SZWxhdGlvbiBvdXRwdXQgZmllbGQgbmFtZXMgdGhlIHRhcmdldCBvdXRwdXQgb2JqZWN0IHR5cGUgKHRoZSBwYXJlbnQgdHlwZSkuXG4gICAgLy8gUmVkYWN0IGVhY2ggdHlwZSB0b2tlbiB0aGUgY2FsbGVyIGRpZCBub3QgcmVmZXJlbmNlOyB3aGVuIGJvdGggYXJlIHJlZmVyZW5jZWQgdGhlXG4gICAgLy8gcmVjb25zdHJ1Y3Rpb24gaXMgaWRlbnRpY2FsIHRvIHRoZSBvcmlnaW5hbCBtZXNzYWdlLlxuICAgIC5yZXBsYWNlKFxuICAgICAgL29iamVjdHMgb2YgdHlwZSBcIihbXlwiXSspXCIgY2FuIG5ldmVyIGJlIG9mIHR5cGUgXCIoW15cIl0rKVwiXFwuL2csXG4gICAgICAobWF0Y2gsIHBhcmVudFR5cGUsIGZyYWdUeXBlKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHNob3VsZEtlZXBUeXBlTmFtZShwYXJlbnRUeXBlKSA/IGB0eXBlIFwiJHtwYXJlbnRUeXBlfVwiYCA6ICd0aGUgcGFyZW50IHR5cGUnO1xuICAgICAgICBjb25zdCBmcmFnID0gc2hvdWxkS2VlcFR5cGVOYW1lKGZyYWdUeXBlKSA/IGB0eXBlIFwiJHtmcmFnVHlwZX1cImAgOiAndGhlIGdpdmVuIHR5cGUnO1xuICAgICAgICByZXR1cm4gYG9iamVjdHMgb2YgJHtwYXJlbnR9IGNhbiBuZXZlciBiZSBvZiAke2ZyYWd9LmA7XG4gICAgICB9XG4gICAgKVxuICAgIC8vIEtub3duQXJndW1lbnROYW1lc1J1bGU6IHRoZSBhcmd1bWVudCdzIHBhcmVudCBPVVRQVVQgdHlwZS4gSW5zaWRlIGEgUG9pbnRlci9SZWxhdGlvblxuICAgIC8vIHN1Yi1zZWxlY3Rpb24gdGhhdCBwYXJlbnQgaXMgdGhlIFRBUkdFVCBjbGFzcywgd2hvc2Ugb3V0cHV0IHR5cGUgaXMgbmFtZWQgZXhhY3RseSB0aGVcbiAgICAvLyBjbGFzcyBuYW1lIChgcGFyc2VDbGFzc1R5cGVzLmpzYCksIHNvIGl0IGRpc2Nsb3NlcyBhIGNsYXNzIHRoZSBjYWxsZXIgbmV2ZXIgd3JvdGUg4oCUIHRoZXlcbiAgICAvLyBvbmx5IHN1cHBsaWVkIHRoZSBwb2ludGVyIGZpZWxkIG5hbWUuIFRoZSB0eXBlIGlzIGVtYmVkZGVkIGluIGEgZG90dGVkIFwiPFR5cGU+LjxmaWVsZD5cIlxuICAgIC8vIHRva2VuOyBrZWVwIHRoZSBmaWVsZCBuYW1lICh0aGUgY2FsbGVyIHdyb3RlIGl0KSBhbmQgcmVkYWN0IG9ubHkgdGhlIHR5cGUgaGFsZi4gTm90ZSB0aGVcbiAgICAvLyBkaXJlY3RpdmUgZm9ybSAoJy4uLiBvbiBkaXJlY3RpdmUgXCJAbmFtZVwiLicpIGNhcnJpZXMgbm8gdHlwZSBhbmQgaXMgbGVmdCBhbG9uZS5cbiAgICAucmVwbGFjZShcbiAgICAgIC9Vbmtub3duIGFyZ3VtZW50IChcIlteXCJdKlwiKSBvbiBmaWVsZCBcIihbXlwiLl0rKVxcLihbXlwiLl0rKVwiXFwuL2csXG4gICAgICAobWF0Y2gsIGFyZ05hbWUsIHR5cGVOYW1lLCBmaWVsZE5hbWUpID0+XG4gICAgICAgIHNob3VsZEtlZXBUeXBlTmFtZSh0eXBlTmFtZSlcbiAgICAgICAgICA/IG1hdGNoXG4gICAgICAgICAgOiBgVW5rbm93biBhcmd1bWVudCAke2FyZ05hbWV9IG9uIGZpZWxkIFwiJHtmaWVsZE5hbWV9XCIuYFxuICAgIClcbiAgICAvLyBHcmFwaFFMRW51bVR5cGUucGFyc2VWYWx1ZS9wYXJzZUxpdGVyYWw6IGEgUmVsYXRpb24gZmllbGQncyBgb3JkZXJgIGFyZ3VtZW50IGlzIHR5cGVkXG4gICAgLy8gYFs8VGFyZ2V0Pk9yZGVyIV1gIChgcGFyc2VDbGFzc1R5cGVzLmpzYCksIHNvIGFuIGludmFsaWQgZW51bSBsaXRlcmFsIG5hbWVzIHRoZSB0YXJnZXRcbiAgICAvLyBjbGFzcy4gVGhlc2UgbWVzc2FnZXMgY29tZSBmcm9tIHRoZSBlbnVtIHR5cGUgaXRzZWxmIHJhdGhlciB0aGFuIGZyb20gYSB2YWxpZGF0aW9uIHJ1bGUsXG4gICAgLy8gd2hpY2ggaXMgd2h5IHRoZSBWYWx1ZXNPZkNvcnJlY3RUeXBlUnVsZSB0ZW1wbGF0ZXMgYWJvdmUgZG8gbm90IHJlYWNoIHRoZW0uIFRoZSBvZmZlbmRpbmdcbiAgICAvLyB2YWx1ZSBpcyBjYWxsZXItc3VwcGxpZWQgYW5kIGlzIHByZXNlcnZlZDsgb25seSB0aGUgZW51bSB0eXBlIG5hbWUgaXMgcmVkYWN0ZWQuXG4gICAgLnJlcGxhY2UoL1ZhbHVlIChcIlteXCJdKlwiKSBkb2VzIG5vdCBleGlzdCBpbiBcIihbXlwiXSspXCIgZW51bVxcLi9nLCAobWF0Y2gsIHZhbHVlLCB0eXBlTmFtZSkgPT5cbiAgICAgIHNob3VsZEtlZXBUeXBlTmFtZSh0eXBlTmFtZSkgPyBtYXRjaCA6IGBWYWx1ZSAke3ZhbHVlfSBkb2VzIG5vdCBleGlzdCBpbiB0aGUgZW51bS5gXG4gICAgKVxuICAgIC8vIFNpYmxpbmcgYnJhbmNoZXMgb2YgdGhlIHNhbWUgZW51bSB0eXBlLCByZWFjaGVkIHdoZW4gdGhlIGxpdGVyYWwgaXMgbm90IGFuIGVudW0gdmFsdWUgYXRcbiAgICAvLyBhbGwgKCdjYW5ub3QgcmVwcmVzZW50IG5vbi1lbnVtIHZhbHVlOiAuLi4nLCAnY2Fubm90IHJlcHJlc2VudCBub24tc3RyaW5nIHZhbHVlOiAuLi4nLFxuICAgIC8vICdjYW5ub3QgcmVwcmVzZW50IHZhbHVlOiAuLi4nKS4gU2FtZSBkaXNjbG9zdXJlLCBzYW1lIHJlZGFjdGlvbi5cbiAgICAucmVwbGFjZSgvRW51bSBcIihbXlwiXSspXCIgY2Fubm90IHJlcHJlc2VudCAvZywgKG1hdGNoLCB0eXBlTmFtZSkgPT5cbiAgICAgIHNob3VsZEtlZXBUeXBlTmFtZSh0eXBlTmFtZSkgPyBtYXRjaCA6ICdFbnVtIGNhbm5vdCByZXByZXNlbnQgJ1xuICAgICk7XG59O1xuXG5jb25zdCBzdHJpcFNjaGVtYUlkZW50aWZpZXJzID0gKG1lc3NhZ2UsIG9wZXJhdGlvblRleHQpID0+XG4gIHN0cmlwU2NoZW1hVHlwZUlkZW50aWZpZXJzKFxuICAgIHN0cmlwU2NoZW1hQ29lcmNpb25JZGVudGlmaWVycyhzdHJpcFNjaGVtYVN1Z2dlc3Rpb24obWVzc2FnZSkpLFxuICAgIG9wZXJhdGlvblRleHRcbiAgKTtcblxuY29uc3QgU2NoZW1hU3VnZ2VzdGlvbnNDb250cm9sUGx1Z2luID0gKHB1YmxpY0ludHJvc3BlY3Rpb24pID0+ICh7XG4gIHJlcXVlc3REaWRTdGFydDogYXN5bmMgKHJlcXVlc3RDb250ZXh0KSA9PiAoe1xuICAgIHdpbGxTZW5kUmVzcG9uc2U6IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChwdWJsaWNJbnRyb3NwZWN0aW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGlzTWFzdGVyT3JNYWludGVuYW5jZSA9XG4gICAgICAgIHJlcXVlc3RDb250ZXh0LmNvbnRleHRWYWx1ZS5hdXRoPy5pc01hc3RlciB8fFxuICAgICAgICByZXF1ZXN0Q29udGV4dC5jb250ZXh0VmFsdWUuYXV0aD8uaXNNYWludGVuYW5jZTtcbiAgICAgIGlmIChpc01hc3Rlck9yTWFpbnRlbmFuY2UpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgYm9keSA9IHJlcXVlc3RDb250ZXh0LnJlc3BvbnNlPy5ib2R5O1xuICAgICAgY29uc3QgZXJyb3JzID1cbiAgICAgICAgYm9keT8ua2luZCA9PT0gJ3NpbmdsZSdcbiAgICAgICAgICA/IGJvZHkuc2luZ2xlUmVzdWx0LmVycm9yc1xuICAgICAgICAgIDogYm9keT8ua2luZCA9PT0gJ2luY3JlbWVudGFsJ1xuICAgICAgICAgICAgPyBib2R5LmluaXRpYWxSZXN1bHQuZXJyb3JzXG4gICAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgIC8vIFNhbWUgYXMgaW4gYEludHJvc3BlY3Rpb25Db250cm9sUGx1Z2luYDogYHJlcXVlc3RDb250ZXh0LnNvdXJjZWAgY2FycmllcyB0aGVcbiAgICAgIC8vIG9wZXJhdGlvbiB0ZXh0IGZvciBldmVyeSByZXF1ZXN0LCBpbmNsdWRpbmcgYW4gYXV0b21hdGljIHBlcnNpc3RlZCBxdWVyeSBjYWNoZSBoaXRcbiAgICAgIC8vIHdoZXJlIGByZXF1ZXN0LnF1ZXJ5YCBpcyB1bmRlZmluZWQuIFJlYWRpbmcgYHJlcXVlc3QucXVlcnlgIGFsb25lIHdvdWxkIG1ha2UgdGhlXG4gICAgICAvLyBhbGxvd2xpc3QgYmVsb3cgZW1wdHkgb24gdGhvc2UgcmVxdWVzdHMgYW5kIHJlZGFjdCB0eXBlIG5hbWVzIHRoZSBjYWxsZXIgd3JvdGVcbiAgICAgIC8vIHRoZW1zZWx2ZXMuXG4gICAgICBjb25zdCBvcGVyYXRpb25UZXh0ID0gcmVxdWVzdENvbnRleHQuc291cmNlID8/IHJlcXVlc3RDb250ZXh0LnJlcXVlc3Q/LnF1ZXJ5O1xuICAgICAgZXJyb3JzPy5mb3JFYWNoKGVycm9yID0+IHtcbiAgICAgICAgZXJyb3IubWVzc2FnZSA9IHN0cmlwU2NoZW1hSWRlbnRpZmllcnMoZXJyb3IubWVzc2FnZSwgb3BlcmF0aW9uVGV4dCk7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGVycm9yLmV4dGVuc2lvbnM/LnN0YWNrdHJhY2UpKSB7XG4gICAgICAgICAgZXJyb3IuZXh0ZW5zaW9ucy5zdGFja3RyYWNlID0gZXJyb3IuZXh0ZW5zaW9ucy5zdGFja3RyYWNlLm1hcChtZXNzYWdlID0+XG4gICAgICAgICAgICBzdHJpcFNjaGVtYUlkZW50aWZpZXJzKG1lc3NhZ2UsIG9wZXJhdGlvblRleHQpXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSxcbiAgfSksXG59KTtcblxuY2xhc3MgUGFyc2VHcmFwaFFMU2VydmVyIHtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcblxuICBjb25zdHJ1Y3RvcihwYXJzZVNlcnZlciwgY29uZmlnKSB7XG4gICAgdGhpcy5wYXJzZVNlcnZlciA9IHBhcnNlU2VydmVyIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VTZXJ2ZXIgaW5zdGFuY2UhJyk7XG4gICAgaWYgKCFjb25maWcgfHwgIWNvbmZpZy5ncmFwaFFMUGF0aCkge1xuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb25maWcuZ3JhcGhRTFBhdGghJyk7XG4gICAgfVxuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLnBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG4gICAgdGhpcy5sb2cgPVxuICAgICAgKHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnICYmIHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxTY2hlbWEgPSBuZXcgUGFyc2VHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogdGhpcy5wYXJzZVNlcnZlci5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgbG9nOiB0aGlzLmxvZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogdGhpcy5jb25maWcuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgYXBwSWQ6IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmFwcElkLFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEdyYXBoUUxPcHRpb25zKCkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzY2hlbWE6IGF3YWl0IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmxvYWQoKSxcbiAgICAgICAgY29udGV4dDogYXN5bmMgKHsgcmVxIH0pID0+IHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaW5mbzogcmVxLmluZm8sXG4gICAgICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgICAgICBhdXRoOiByZXEuYXV0aCxcbiAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcihlLnN0YWNrIHx8ICh0eXBlb2YgZS50b1N0cmluZyA9PT0gJ2Z1bmN0aW9uJyAmJiBlLnRvU3RyaW5nKCkpIHx8IGUpO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBfZ2V0U2VydmVyKCkge1xuICAgIGNvbnN0IHNjaGVtYVJlZiA9IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWE7XG4gICAgY29uc3QgbmV3U2NoZW1hUmVmID0gYXdhaXQgdGhpcy5wYXJzZUdyYXBoUUxTY2hlbWEubG9hZCgpO1xuICAgIGlmIChzY2hlbWFSZWYgPT09IG5ld1NjaGVtYVJlZiAmJiB0aGlzLl9zZXJ2ZXIpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zZXJ2ZXI7XG4gICAgfVxuICAgIC8vIEl0IG1lYW5zIGEgcGFyYWxsZWwgX2dldFNlcnZlciBjYWxsIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3NcbiAgICBpZiAodGhpcy5fc2NoZW1hUmVmTXV0ZXggPT09IG5ld1NjaGVtYVJlZikge1xuICAgICAgcmV0dXJuIHRoaXMuX3NlcnZlcjtcbiAgICB9XG4gICAgLy8gVXBkYXRlIHRoZSBzY2hlbWEgcmVmIG11dGV4IHRvIGF2b2lkIHBhcmFsbGVsIF9nZXRTZXJ2ZXIgY2FsbHNcbiAgICB0aGlzLl9zY2hlbWFSZWZNdXRleCA9IG5ld1NjaGVtYVJlZjtcbiAgICBjb25zdCBjcmVhdGVTZXJ2ZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHNjaGVtYSwgY29udGV4dCB9ID0gYXdhaXQgdGhpcy5fZ2V0R3JhcGhRTE9wdGlvbnMoKTtcbiAgICAgICAgY29uc3QgYXBvbGxvID0gbmV3IEFwb2xsb1NlcnZlcih7XG4gICAgICAgICAgY3NyZlByZXZlbnRpb246IHtcbiAgICAgICAgICAgIC8vIFNlZSBodHRwczovL3d3dy5hcG9sbG9ncmFwaHFsLmNvbS9kb2NzL3JvdXRlci9jb25maWd1cmF0aW9uL2NzcmYvXG4gICAgICAgICAgICAvLyBuZWVkZWQgc2luY2Ugd2UgdXNlIGdyYXBocWwgdXBsb2FkXG4gICAgICAgICAgICByZXF1ZXN0SGVhZGVyczogWydYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJ10sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBpbnRyb3NwZWN0aW9uOiB0aGlzLmNvbmZpZy5ncmFwaFFMUHVibGljSW50cm9zcGVjdGlvbixcbiAgICAgICAgICBwbHVnaW5zOiBbQXBvbGxvU2VydmVyUGx1Z2luQ2FjaGVDb250cm9sRGlzYWJsZWQoKSwgSW50cm9zcGVjdGlvbkNvbnRyb2xQbHVnaW4odGhpcy5jb25maWcuZ3JhcGhRTFB1YmxpY0ludHJvc3BlY3Rpb24pLCBTY2hlbWFTdWdnZXN0aW9uc0NvbnRyb2xQbHVnaW4odGhpcy5jb25maWcuZ3JhcGhRTFB1YmxpY0ludHJvc3BlY3Rpb24pLCBjcmVhdGVDb21wbGV4aXR5VmFsaWRhdGlvblBsdWdpbigoKSA9PiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5yZXF1ZXN0Q29tcGxleGl0eSldLFxuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgfSk7XG4gICAgICAgIGF3YWl0IGFwb2xsby5zdGFydCgpO1xuICAgICAgICByZXR1cm4gZXhwcmVzc01pZGRsZXdhcmUoYXBvbGxvLCB7XG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIFJlc2V0IGFsbCBtdXRleGVzIGFuZCBmb3J3YXJkIHRoZSBlcnJvclxuICAgICAgICB0aGlzLl9zZXJ2ZXIgPSBudWxsO1xuICAgICAgICB0aGlzLl9zY2hlbWFSZWZNdXRleCA9IG51bGw7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIERvIG5vdCBhd2FpdCBzbyBwYXJhbGxlbCByZXF1ZXN0IHdpbGwgd2FpdCB0aGUgc2FtZSBwcm9taXNlIHJlZlxuICAgIHRoaXMuX3NlcnZlciA9IGNyZWF0ZVNlcnZlcigpO1xuICAgIHJldHVybiB0aGlzLl9zZXJ2ZXI7XG4gIH1cblxuICBfdHJhbnNmb3JtTWF4VXBsb2FkU2l6ZVRvQnl0ZXMobWF4VXBsb2FkU2l6ZSkge1xuICAgIGNvbnN0IHVuaXRNYXAgPSB7XG4gICAgICBrYjogMSxcbiAgICAgIG1iOiAyLFxuICAgICAgZ2I6IDMsXG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICBOdW1iZXIobWF4VXBsb2FkU2l6ZS5zbGljZSgwLCAtMikpICpcbiAgICAgIE1hdGgucG93KDEwMjQsIHVuaXRNYXBbbWF4VXBsb2FkU2l6ZS5zbGljZSgtMikudG9Mb3dlckNhc2UoKV0pXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIEFsbG93IGRldmVsb3BlcnMgdG8gY3VzdG9taXplIGVhY2ggcmVxdWVzdCB3aXRoIGludmVyc2lvbiBvZiBjb250cm9sL2RlcGVuZGVuY3kgaW5qZWN0aW9uXG4gICAqL1xuICBhcHBseVJlcXVlc3RDb250ZXh0TWlkZGxld2FyZShhcGksIG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICB9XG4gICAgICBhcGkudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSk7XG4gICAgfVxuICB9XG5cbiAgYXBwbHlHcmFwaFFMKGFwcCkge1xuICAgIGlmICghYXBwIHx8ICFhcHAudXNlKSB7XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBFeHByZXNzLmpzIGFwcCBpbnN0YW5jZSEnKTtcbiAgICB9XG4gICAgYXBwLnVzZSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCwgYWxsb3dDcm9zc0RvbWFpbih0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5hcHBJZCkpO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgYXBwLnVzZSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCwgaGFuZGxlUGFyc2VTZXNzaW9uKTtcbiAgICB0aGlzLmFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwcCwgdGhpcy5wYXJzZVNlcnZlci5jb25maWcpO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGhhbmRsZVBhcnNlRXJyb3JzKTtcbiAgICBhcHAudXNlKFxuICAgICAgdGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsXG4gICAgICBncmFwaHFsVXBsb2FkRXhwcmVzcyh7XG4gICAgICAgIG1heEZpbGVTaXplOiB0aGlzLl90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyhcbiAgICAgICAgICB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5tYXhVcGxvYWRTaXplIHx8ICcyMG1iJ1xuICAgICAgICApLFxuICAgICAgfSlcbiAgICApO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGV4cHJlc3MuanNvbigpLCBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IHRoaXMuX2dldFNlcnZlcigpO1xuICAgICAgcmV0dXJuIHNlcnZlcihyZXEsIHJlcywgbmV4dCk7XG4gICAgfSk7XG4gIH1cblxuICBhcHBseVBsYXlncm91bmQoYXBwKSB7XG4gICAgaWYgKCFhcHAgfHwgIWFwcC5nZXQpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIEV4cHJlc3MuanMgYXBwIGluc3RhbmNlIScpO1xuICAgIH1cblxuICAgIGFwcC5nZXQoXG4gICAgICB0aGlzLmNvbmZpZy5wbGF5Z3JvdW5kUGF0aCB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb25maWcucGxheWdyb3VuZFBhdGggdG8gYXBwbHlQbGF5Z3JvdW5kIScpLFxuICAgICAgKF9yZXEsIHJlcykgPT4ge1xuICAgICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9odG1sJyk7XG4gICAgICAgIHJlcy53cml0ZShcbiAgICAgICAgICBgPGRpdiBpZD1cInNhbmRib3hcIiBzdHlsZT1cInBvc2l0aW9uOmFic29sdXRlO3RvcDowO3JpZ2h0OjA7Ym90dG9tOjA7bGVmdDowXCI+PC9kaXY+XG4gICAgICAgICAgPHNjcmlwdCBzcmM9XCJodHRwczovL2VtYmVkZGFibGUtc2FuZGJveC5jZG4uYXBvbGxvZ3JhcGhxbC5jb20vX2xhdGVzdC9lbWJlZGRhYmxlLXNhbmRib3gudW1kLnByb2R1Y3Rpb24ubWluLmpzXCI+PC9zY3JpcHQ+XG4gICAgICAgICAgPHNjcmlwdD5cbiAgICAgICAgICAgbmV3IHdpbmRvdy5FbWJlZGRlZFNhbmRib3goe1xuICAgICAgICAgICAgIHRhcmdldDogXCIjc2FuZGJveFwiLFxuICAgICAgICAgICAgIGVuZHBvaW50SXNFZGl0YWJsZTogZmFsc2UsXG4gICAgICAgICAgICAgaW5pdGlhbEVuZHBvaW50OiAke0pTT04uc3RyaW5naWZ5KHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoKX0sXG4gICAgICAgICAgICAgaGFuZGxlUmVxdWVzdDogKGVuZHBvaW50VXJsLCBvcHRpb25zKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBmZXRjaChlbmRwb2ludFVybCwge1xuICAgICAgICAgICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICAgICAuLi5vcHRpb25zLmhlYWRlcnMsXG4gICAgICAgICAgICAgICAgICAgICdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJzogJHtKU09OLnN0cmluZ2lmeSh0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5hcHBJZCl9LFxuICAgICAgICAgICAgICAgICAgICAnWC1QYXJzZS1NYXN0ZXItS2V5JzogJHtKU09OLnN0cmluZ2lmeSh0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5tYXN0ZXJLZXkpfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgfSk7XG4gICAgICAgICAgIC8vIGFkdmFuY2VkIG9wdGlvbnM6IGh0dHBzOi8vd3d3LmFwb2xsb2dyYXBocWwuY29tL2RvY3Mvc3R1ZGlvL2V4cGxvcmVyL3NhbmRib3gjZW1iZWRkaW5nLXNhbmRib3hcbiAgICAgICAgICA8L3NjcmlwdD5gXG4gICAgICAgICk7XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgc2V0R3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpOiBQcm9taXNlIHtcbiAgICByZXR1cm4gdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLnVwZGF0ZUdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLHFCQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxRQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxTQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxTQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxRQUFBLEdBQUFMLE9BQUE7QUFDQSxJQUFBTSxZQUFBLEdBQUFOLE9BQUE7QUFDQSxJQUFBTyxrQkFBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsZ0JBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLE9BQUEsR0FBQVYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFVLG1CQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxvQkFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksdUJBQUEsR0FBQUMsdUJBQUEsQ0FBQWIsT0FBQTtBQUFtRyxTQUFBYSx3QkFBQUMsQ0FBQSxFQUFBQyxDQUFBLDZCQUFBQyxPQUFBLE1BQUFDLENBQUEsT0FBQUQsT0FBQSxJQUFBRSxDQUFBLE9BQUFGLE9BQUEsWUFBQUgsdUJBQUEsWUFBQUEsQ0FBQUMsQ0FBQSxFQUFBQyxDQUFBLFNBQUFBLENBQUEsSUFBQUQsQ0FBQSxJQUFBQSxDQUFBLENBQUFLLFVBQUEsU0FBQUwsQ0FBQSxNQUFBTSxDQUFBLEVBQUFDLENBQUEsRUFBQUMsQ0FBQSxLQUFBQyxTQUFBLFFBQUFDLE9BQUEsRUFBQVYsQ0FBQSxpQkFBQUEsQ0FBQSx1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