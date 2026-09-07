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
      const isIntrospectionQuery = requestContext.request.query?.includes('__schema');
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
  // A generated type identifier counts as "referenced" (and therefore not a disclosure) only if
  // the caller wrote it as a whole token in the operation text. Tokenize the operation on
  // non-identifier characters and compare exact tokens rather than building a RegExp from the
  // captured name: this avoids substring false-matches (e.g. preserving "AuthorPointerInput"
  // because the operation contains "SecretAuthorPointerInput") and any regex injection/ReDoS from
  // an unusual captured name. GraphQL list/non-null wrappers ("[", "]", "!") are stripped from the
  // captured name so e.g. "SecretAuthorPointerInput!" still matches "$x: SecretAuthorPointerInput!".
  // When the operation text is unavailable the type is treated as not referenced (fail closed).
  const referencedTokens = typeof operationText === 'string' ? new Set(operationText.split(/[^_A-Za-z0-9]+/).filter(Boolean)) : new Set();
  const isReferenced = typeName => referencedTokens.has(typeName.replace(/[[\]!]/g, ''));
  return message
  // Input coercion / ValuesOfCorrectTypeRule (variables and inline literals).
  .replace(/Expected value of type "([^"]+)"/g, (match, typeName) => isReferenced(typeName) ? match : 'Expected value of the correct type').replace(/Expected type "([^"]+)" to be an object\./g, (match, typeName) => isReferenced(typeName) ? match : 'Expected an object.').replace(/Expected non-nullable type "([^"]+)" not to be null\./g, (match, typeName) => isReferenced(typeName) ? match : 'Expected a non-null value.').replace(/ is not defined by type "([^"]+)"\./g, (match, typeName) => isReferenced(typeName) ? match : ' is not defined.')
  // VariablesInAllowedPositionRule: the position type is the pointer/relation target
  // input type; the caller only wrote their own variable's declared type.
  .replace(/ used in position expecting type "([^"]+)"\./g, (match, typeName) => isReferenced(typeName) ? match : ' used in position expecting a different type.')
  // FieldsOnCorrectTypeRule: descending into a Pointer/Relation output field names its
  // target output object type.
  .replace(/Cannot query field ("[^"]*") on type "([^"]+)"\./g, (match, fieldName, typeName) => isReferenced(typeName) ? match : `Cannot query field ${fieldName}.`)
  // ScalarLeafsRule: selecting a Pointer/Relation output field with no sub-selection names
  // its target output object type.
  .replace(/Field ("[^"]*") of type "([^"]+)" must have a selection of subfields\./g, (match, fieldName, typeName) => isReferenced(typeName) ? match : `Field ${fieldName} must have a selection of subfields.`)
  // PossibleFragmentSpreadsRule: an inline/named fragment on an incompatible type inside a
  // Pointer/Relation output field names the target output object type (the parent type).
  // Redact each type token the caller did not reference; when both are referenced the
  // reconstruction is identical to the original message.
  .replace(/objects of type "([^"]+)" can never be of type "([^"]+)"\./g, (match, parentType, fragType) => {
    const parent = isReferenced(parentType) ? `type "${parentType}"` : 'the parent type';
    const frag = isReferenced(fragType) ? `type "${fragType}"` : 'the given type';
    return `objects of ${parent} can never be of ${frag}.`;
  });
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
      const operationText = requestContext.request?.query;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbFVwbG9hZEV4cHJlc3MiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9zZXJ2ZXIiLCJfZXhwcmVzcyIsIl9kaXNhYmxlZCIsIl9leHByZXNzMiIsIl9ncmFwaHFsIiwiX21pZGRsZXdhcmVzIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX3F1ZXJ5Q29tcGxleGl0eSIsIl9sb2dnZXIiLCJfUGFyc2VHcmFwaFFMU2NoZW1hIiwiX1BhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsIkludHJvc3BlY3Rpb25Db250cm9sUGx1Z2luIiwicHVibGljSW50cm9zcGVjdGlvbiIsInJlcXVlc3REaWRTdGFydCIsInJlcXVlc3RDb250ZXh0IiwiZGlkUmVzb2x2ZU9wZXJhdGlvbiIsImlzTWFzdGVyT3JNYWludGVuYW5jZSIsImNvbnRleHRWYWx1ZSIsImF1dGgiLCJpc01hc3RlciIsImlzTWFpbnRlbmFuY2UiLCJpc0ludHJvc3BlY3Rpb25RdWVyeSIsInJlcXVlc3QiLCJxdWVyeSIsImluY2x1ZGVzIiwiR3JhcGhRTEVycm9yIiwiZXh0ZW5zaW9ucyIsImh0dHAiLCJzdGF0dXMiLCJzdHJpcFNjaGVtYVN1Z2dlc3Rpb24iLCJtZXNzYWdlIiwicmVwbGFjZSIsInN0cmlwU2NoZW1hQ29lcmNpb25JZGVudGlmaWVycyIsInN0cmlwU2NoZW1hVHlwZUlkZW50aWZpZXJzIiwib3BlcmF0aW9uVGV4dCIsInJlZmVyZW5jZWRUb2tlbnMiLCJTZXQiLCJzcGxpdCIsImZpbHRlciIsIkJvb2xlYW4iLCJpc1JlZmVyZW5jZWQiLCJ0eXBlTmFtZSIsIm1hdGNoIiwiZmllbGROYW1lIiwicGFyZW50VHlwZSIsImZyYWdUeXBlIiwicGFyZW50IiwiZnJhZyIsInN0cmlwU2NoZW1hSWRlbnRpZmllcnMiLCJTY2hlbWFTdWdnZXN0aW9uc0NvbnRyb2xQbHVnaW4iLCJ3aWxsU2VuZFJlc3BvbnNlIiwiYm9keSIsInJlc3BvbnNlIiwiZXJyb3JzIiwia2luZCIsInNpbmdsZVJlc3VsdCIsImluaXRpYWxSZXN1bHQiLCJ1bmRlZmluZWQiLCJmb3JFYWNoIiwiZXJyb3IiLCJBcnJheSIsImlzQXJyYXkiLCJzdGFja3RyYWNlIiwibWFwIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiY29uc3RydWN0b3IiLCJwYXJzZVNlcnZlciIsImNvbmZpZyIsInJlcXVpcmVkUGFyYW1ldGVyIiwiZ3JhcGhRTFBhdGgiLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJQYXJzZUdyYXBoUUxTY2hlbWEiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJhcHBJZCIsIl9nZXRHcmFwaFFMT3B0aW9ucyIsInNjaGVtYSIsImxvYWQiLCJjb250ZXh0IiwicmVxIiwiaW5mbyIsInN0YWNrIiwidG9TdHJpbmciLCJfZ2V0U2VydmVyIiwic2NoZW1hUmVmIiwiZ3JhcGhRTFNjaGVtYSIsIm5ld1NjaGVtYVJlZiIsIl9zY2hlbWFSZWZNdXRleCIsImNyZWF0ZVNlcnZlciIsImFwb2xsbyIsIkFwb2xsb1NlcnZlciIsImNzcmZQcmV2ZW50aW9uIiwicmVxdWVzdEhlYWRlcnMiLCJpbnRyb3NwZWN0aW9uIiwiZ3JhcGhRTFB1YmxpY0ludHJvc3BlY3Rpb24iLCJwbHVnaW5zIiwiQXBvbGxvU2VydmVyUGx1Z2luQ2FjaGVDb250cm9sRGlzYWJsZWQiLCJjcmVhdGVDb21wbGV4aXR5VmFsaWRhdGlvblBsdWdpbiIsInJlcXVlc3RDb21wbGV4aXR5Iiwic3RhcnQiLCJleHByZXNzTWlkZGxld2FyZSIsIl90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyIsIm1heFVwbG9hZFNpemUiLCJ1bml0TWFwIiwia2IiLCJtYiIsImdiIiwiTnVtYmVyIiwic2xpY2UiLCJNYXRoIiwicG93IiwidG9Mb3dlckNhc2UiLCJhcHBseVJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSIsImFwaSIsIm9wdGlvbnMiLCJyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJFcnJvciIsInVzZSIsImFwcGx5R3JhcGhRTCIsImFwcCIsImFsbG93Q3Jvc3NEb21haW4iLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJoYW5kbGVQYXJzZVNlc3Npb24iLCJoYW5kbGVQYXJzZUVycm9ycyIsImdyYXBocWxVcGxvYWRFeHByZXNzIiwibWF4RmlsZVNpemUiLCJleHByZXNzIiwianNvbiIsInJlcyIsIm5leHQiLCJzZXJ2ZXIiLCJhcHBseVBsYXlncm91bmQiLCJwbGF5Z3JvdW5kUGF0aCIsIl9yZXEiLCJzZXRIZWFkZXIiLCJ3cml0ZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJtYXN0ZXJLZXkiLCJlbmQiLCJzZXRHcmFwaFFMQ29uZmlnIiwiZ3JhcGhRTENvbmZpZyIsInVwZGF0ZUdyYXBoUUxDb25maWciLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBncmFwaHFsVXBsb2FkRXhwcmVzcyBmcm9tICdncmFwaHFsLXVwbG9hZC9ncmFwaHFsVXBsb2FkRXhwcmVzcy5qcyc7XG5pbXBvcnQgeyBBcG9sbG9TZXJ2ZXIgfSBmcm9tICdAYXBvbGxvL3NlcnZlcic7XG5pbXBvcnQgeyBleHByZXNzTWlkZGxld2FyZSB9IGZyb20gJ0BhcG9sbG8vc2VydmVyL2V4cHJlc3M0JztcbmltcG9ydCB7IEFwb2xsb1NlcnZlclBsdWdpbkNhY2hlQ29udHJvbERpc2FibGVkIH0gZnJvbSAnQGFwb2xsby9zZXJ2ZXIvcGx1Z2luL2Rpc2FibGVkJztcbmltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHsgR3JhcGhRTEVycm9yIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBhbGxvd0Nyb3NzRG9tYWluLCBoYW5kbGVQYXJzZUVycm9ycywgaGFuZGxlUGFyc2VIZWFkZXJzLCBoYW5kbGVQYXJzZVNlc3Npb24gfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgY3JlYXRlQ29tcGxleGl0eVZhbGlkYXRpb25QbHVnaW4gfSBmcm9tICcuL2hlbHBlcnMvcXVlcnlDb21wbGV4aXR5JztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfSBmcm9tICcuL1BhcnNlR3JhcGhRTFNjaGVtYSc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwgeyBQYXJzZUdyYXBoUUxDb25maWcgfSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcblxuXG5jb25zdCBJbnRyb3NwZWN0aW9uQ29udHJvbFBsdWdpbiA9IChwdWJsaWNJbnRyb3NwZWN0aW9uKSA9PiAoe1xuXG5cbiAgcmVxdWVzdERpZFN0YXJ0OiAocmVxdWVzdENvbnRleHQpID0+ICh7XG5cbiAgICBkaWRSZXNvbHZlT3BlcmF0aW9uOiBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBJZiBwdWJsaWMgaW50cm9zcGVjdGlvbiBpcyBlbmFibGVkLCB3ZSBhbGxvdyBhbGwgaW50cm9zcGVjdGlvbiBxdWVyaWVzXG4gICAgICBpZiAocHVibGljSW50cm9zcGVjdGlvbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzTWFzdGVyT3JNYWludGVuYW5jZSA9IHJlcXVlc3RDb250ZXh0LmNvbnRleHRWYWx1ZS5hdXRoPy5pc01hc3RlciB8fCByZXF1ZXN0Q29udGV4dC5jb250ZXh0VmFsdWUuYXV0aD8uaXNNYWludGVuYW5jZVxuICAgICAgaWYgKGlzTWFzdGVyT3JNYWludGVuYW5jZSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIE5vdyB3ZSBjaGVjayBpZiB0aGUgcXVlcnkgaXMgYW4gaW50cm9zcGVjdGlvbiBxdWVyeVxuICAgICAgLy8gdGhpcyBjaGVjayBzdHJhdGVneSBzaG91bGQgd29yayBpbiA5OS45OSUgY2FzZXNcbiAgICAgIC8vIHdlIGNhbiBoYXZlIGFuIGlzc3VlIGlmIGEgdXNlciBuYW1lIGEgZmllbGQgb3IgY2xhc3MgX19zY2hlbWFTb21ldGhpbmdcbiAgICAgIC8vIHdlIHdhbnQgdG8gYXZvaWQgYSBmdWxsIEFTVCBjaGVja1xuICAgICAgY29uc3QgaXNJbnRyb3NwZWN0aW9uUXVlcnkgPVxuICAgICAgICByZXF1ZXN0Q29udGV4dC5yZXF1ZXN0LnF1ZXJ5Py5pbmNsdWRlcygnX19zY2hlbWEnKVxuXG4gICAgICBpZiAoaXNJbnRyb3NwZWN0aW9uUXVlcnkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEdyYXBoUUxFcnJvcignSW50cm9zcGVjdGlvbiBpcyBub3QgYWxsb3dlZCcsIHtcbiAgICAgICAgICBleHRlbnNpb25zOiB7XG4gICAgICAgICAgICBodHRwOiB7XG4gICAgICAgICAgICAgIHN0YXR1czogNDAzLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG5cbiAgfSlcblxufSk7XG5cbi8vIGdyYXBocWwtanMgZW1iZWRzIFwiRGlkIHlvdSBtZWFuIC4uLj9cIiBoaW50cyBzb3VyY2VkIGZyb20gdGhlIGxpdmUgc2NoZW1hIGluXG4vLyBpdHMgZXJyb3IgbWVzc2FnZXMuIFRoZXkgYXJlIHByb2R1Y2VkIGluIHR3byBkaXN0aW5jdCBwaGFzZXM6XG4vLyAgIC0gdmFsaWRhdGlvbiBydWxlcyAoRmllbGRzT25Db3JyZWN0VHlwZVJ1bGUsIEtub3duQXJndW1lbnROYW1lc1J1bGUsXG4vLyAgICAgS25vd25UeXBlTmFtZXNSdWxlLCAuLi4pLCBhbmRcbi8vICAgLSB2YXJpYWJsZSBjb2VyY2lvbiAodW5rbm93biBlbnVtIHZhbHVlcywgdW5rbm93biBpbnB1dC1vYmplY3QgZmllbGRzKSxcbi8vICAgICB3aGljaCBydW5zIGR1cmluZyBleGVjdXRpb24sIGFmdGVyIHZhbGlkYXRpb24uXG4vLyBBbGwgb2YgdGhlc2UgYXJlIHJldHVybmVkIHRvIHRoZSBjYWxsZXIgYW5kIGRpc2Nsb3NlIHNjaGVtYSBpZGVudGlmaWVycyAoQ2xvdWRcbi8vIENvZGUgZnVuY3Rpb24gbmFtZXMsIGNsYXNzIGFuZCBmaWVsZCBuYW1lcykgdGhhdCB0aGUgaW50cm9zcGVjdGlvbiBndWFyZCBpc1xuLy8gbWVhbnQgdG8gaGlkZS4gU3RyaXAgdGhlIGhpbnQgc3VmZml4IGZyb20gZXZlcnkgcmV0dXJuZWQgZXJyb3Ig4oCUIGluY2x1ZGluZyB0aGVcbi8vIGNvcHkgZ3JhcGhxbC1qcyBkdXBsaWNhdGVzIGludG8gZXh0ZW5zaW9ucy5zdGFja3RyYWNlIGluIG5vbi1wcm9kdWN0aW9uIOKAlCBmb3Jcbi8vIGNhbGxlcnMgdGhhdCBhcmUgbm90IGFsbG93ZWQgdG8gaW50cm9zcGVjdC5cbmNvbnN0IHN0cmlwU2NoZW1hU3VnZ2VzdGlvbiA9IG1lc3NhZ2UgPT5cbiAgdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5yZXBsYWNlKC8gP0RpZCB5b3UgbWVhbiguKz8pXFw/JC8sICcnKSA6IG1lc3NhZ2U7XG5cbi8vIGdyYXBocWwtanMgYWxzbyBlbWl0cyBhIGJhc2UgaW5wdXQtY29lcmNpb24gbWVzc2FnZSB0aGF0IG5hbWVzIGEgc2NoZW1hXG4vLyBpZGVudGlmaWVyIFdJVEhPVVQgYSBcIkRpZCB5b3UgbWVhblwiIGNsYXVzZSwgc28gdGhlIHN1Z2dlc3Rpb24gc3RyaXAgYWJvdmVcbi8vIGNhbm5vdCByZWFjaCBpdDogd2hlbiBhIHJlcXVpcmVkIGN1c3RvbSBpbnB1dCBmaWVsZCBpcyBvbWl0dGVkLCBjb2VyY2VJbnB1dFZhbHVlXG4vLyByZXR1cm5zICdGaWVsZCBcIjxuYW1lPlwiIG9mIHJlcXVpcmVkIHR5cGUgXCI8dHlwZT5cIiB3YXMgbm90IHByb3ZpZGVkLicsIGRpc2Nsb3Npbmdcbi8vIGEgZmllbGQgbmFtZSB0aGUgY2FsbGVyIG5ldmVyIHN1cHBsaWVkLiBSZWRhY3QgdGhlIHF1b3RlZCBpZGVudGlmaWVycyBmcm9tIHRoaXNcbi8vIHRlbXBsYXRlIHdoaWxlIHByZXNlcnZpbmcgdGhlIGVycm9yIHNoYXBlLCBmb3IgY2FsbGVycyB0aGF0IGFyZSBub3QgYWxsb3dlZCB0b1xuLy8gaW50cm9zcGVjdC4gVGhlIHNpYmxpbmcgY29lcmNpb24gbWVzc2FnZXMgKCcuLi4gaXMgbm90IGRlZmluZWQgYnkgdHlwZSBcIjx0eXBlPlwiLicsXG4vLyAnRXhwZWN0ZWQgdHlwZSBcIjx0eXBlPlwiIHRvIGJlIGFuIG9iamVjdC4nKSBhcmUgaW50ZW50aW9uYWxseSBsZWZ0IGludGFjdDogdGhleVxuLy8gb25seSBlY2hvIGFuIGlucHV0IHR5cGUgbmFtZSB0aGUgY2FsbGVyIGFscmVhZHkgcmVmZXJlbmNlZCBpbiB0aGUgb3BlcmF0aW9uLCBzb1xuLy8gdGhleSBkaXNjbG9zZSBub3RoaW5nIHRoZSBjYWxsZXIgZGlkIG5vdCBhbHJlYWR5IHByb3ZpZGUuXG5jb25zdCBzdHJpcFNjaGVtYUNvZXJjaW9uSWRlbnRpZmllcnMgPSBtZXNzYWdlID0+XG4gIHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJ1xuICAgID8gbWVzc2FnZS5yZXBsYWNlKFxuICAgICAgL0ZpZWxkIFwiW15cIl0qXCIgb2YgcmVxdWlyZWQgdHlwZSBcIlteXCJdKlwiIHdhcyBub3QgcHJvdmlkZWRcXC4vZyxcbiAgICAgICdGaWVsZCBvZiByZXF1aXJlZCB0eXBlIHdhcyBub3QgcHJvdmlkZWQuJ1xuICAgIClcbiAgICA6IG1lc3NhZ2U7XG5cbi8vIGdyYXBocWwtanMgYWxzbyBlbWl0cyBiYXNlIGNvZXJjaW9uIC8gdmFsaWRhdGlvbiBtZXNzYWdlcyB0aGF0IG5hbWUgYSBuZXN0ZWQgaW5wdXRcbi8vIFRZUEUgd2l0aG91dCBhIFwiRGlkIHlvdSBtZWFuXCIgY2xhdXNlLCBzbyBuZWl0aGVyIHN0cmlwIGFib3ZlIHJlYWNoZXMgdGhlbS4gRm9yIGFcbi8vIFBvaW50ZXIgb3IgUmVsYXRpb24gZmllbGQgdGhlIGdlbmVyYXRlZCBpbnB1dCB0eXBlIG5hbWUgZW1iZWRzIHRoZSBwb2ludGVyJ3MgVEFSR0VUXG4vLyBjbGFzcyAoYDxUYXJnZXQ+UG9pbnRlcklucHV0YCwgYDxUYXJnZXQ+UmVsYXRpb25XaGVyZUlucHV0YCwgYENyZWF0ZTxUYXJnZXQ+RmllbGRzSW5wdXRgKVxuLy8g4oCUIGEgY2xhc3MgdGhlIGNhbGxlciBuZXZlciByZWZlcmVuY2VkIGFuZCBjYW5ub3QgZGVyaXZlIGZyb20gdGhlIGZpZWxkIG5hbWUgdGhleVxuLy8gc3VwcGxpZWQg4oCUIHNvIHRoZXNlIHRlbXBsYXRlcyBkaXNjbG9zZSBhIHNjaGVtYSBjbGFzcyBuYW1lIHRvIGEgY2FsbGVyIHdobyBoYXMgb25seSB0aGVcbi8vIHB1YmxpYyBhcHBsaWNhdGlvbiBpZC4gUmVkYWN0IHRoZSBxdW90ZWQgdHlwZSBpZGVudGlmaWVyIGZyb20gdGhvc2UgdGVtcGxhdGVzIFVOTEVTUyB0aGVcbi8vIGNhbGxlciByZWZlcmVuY2VkIGl0IGluIHRoZSBvcGVyYXRpb24gdGV4dDogYSB0eXBlIG5hbWUgdGhlIGNhbGxlciB3cm90ZSBpbiB0aGUgb3BlcmF0aW9uXG4vLyAoZS5nLiBgJHdoZXJlOiBVc2VyV2hlcmVJbnB1dGApIGlzIG5vdCBhIGRpc2Nsb3N1cmUsIGFuZCBwcmVzZXJ2aW5nIGl0IGtlZXBzIHRoZSBtZXNzYWdlXG4vLyAoJy4uLiBpcyBub3QgZGVmaW5lZCBieSB0eXBlIFwiVXNlcldoZXJlSW5wdXRcIi4nKSB1c2VmdWwuIFdoZW4gdGhlIG9wZXJhdGlvbiB0ZXh0IGlzXG4vLyB1bmF2YWlsYWJsZSB0aGUgaWRlbnRpZmllciBpcyByZWRhY3RlZCAoZmFpbCBjbG9zZWQpLlxuY29uc3Qgc3RyaXBTY2hlbWFUeXBlSWRlbnRpZmllcnMgPSAobWVzc2FnZSwgb3BlcmF0aW9uVGV4dCkgPT4ge1xuICBpZiAodHlwZW9mIG1lc3NhZ2UgIT09ICdzdHJpbmcnKSB7IHJldHVybiBtZXNzYWdlOyB9XG4gIC8vIEEgZ2VuZXJhdGVkIHR5cGUgaWRlbnRpZmllciBjb3VudHMgYXMgXCJyZWZlcmVuY2VkXCIgKGFuZCB0aGVyZWZvcmUgbm90IGEgZGlzY2xvc3VyZSkgb25seSBpZlxuICAvLyB0aGUgY2FsbGVyIHdyb3RlIGl0IGFzIGEgd2hvbGUgdG9rZW4gaW4gdGhlIG9wZXJhdGlvbiB0ZXh0LiBUb2tlbml6ZSB0aGUgb3BlcmF0aW9uIG9uXG4gIC8vIG5vbi1pZGVudGlmaWVyIGNoYXJhY3RlcnMgYW5kIGNvbXBhcmUgZXhhY3QgdG9rZW5zIHJhdGhlciB0aGFuIGJ1aWxkaW5nIGEgUmVnRXhwIGZyb20gdGhlXG4gIC8vIGNhcHR1cmVkIG5hbWU6IHRoaXMgYXZvaWRzIHN1YnN0cmluZyBmYWxzZS1tYXRjaGVzIChlLmcuIHByZXNlcnZpbmcgXCJBdXRob3JQb2ludGVySW5wdXRcIlxuICAvLyBiZWNhdXNlIHRoZSBvcGVyYXRpb24gY29udGFpbnMgXCJTZWNyZXRBdXRob3JQb2ludGVySW5wdXRcIikgYW5kIGFueSByZWdleCBpbmplY3Rpb24vUmVEb1MgZnJvbVxuICAvLyBhbiB1bnVzdWFsIGNhcHR1cmVkIG5hbWUuIEdyYXBoUUwgbGlzdC9ub24tbnVsbCB3cmFwcGVycyAoXCJbXCIsIFwiXVwiLCBcIiFcIikgYXJlIHN0cmlwcGVkIGZyb20gdGhlXG4gIC8vIGNhcHR1cmVkIG5hbWUgc28gZS5nLiBcIlNlY3JldEF1dGhvclBvaW50ZXJJbnB1dCFcIiBzdGlsbCBtYXRjaGVzIFwiJHg6IFNlY3JldEF1dGhvclBvaW50ZXJJbnB1dCFcIi5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIHRleHQgaXMgdW5hdmFpbGFibGUgdGhlIHR5cGUgaXMgdHJlYXRlZCBhcyBub3QgcmVmZXJlbmNlZCAoZmFpbCBjbG9zZWQpLlxuICBjb25zdCByZWZlcmVuY2VkVG9rZW5zID1cbiAgICB0eXBlb2Ygb3BlcmF0aW9uVGV4dCA9PT0gJ3N0cmluZydcbiAgICAgID8gbmV3IFNldChvcGVyYXRpb25UZXh0LnNwbGl0KC9bXl9BLVphLXowLTldKy8pLmZpbHRlcihCb29sZWFuKSlcbiAgICAgIDogbmV3IFNldCgpO1xuICBjb25zdCBpc1JlZmVyZW5jZWQgPSB0eXBlTmFtZSA9PiByZWZlcmVuY2VkVG9rZW5zLmhhcyh0eXBlTmFtZS5yZXBsYWNlKC9bW1xcXSFdL2csICcnKSk7XG4gIHJldHVybiBtZXNzYWdlXG4gICAgLy8gSW5wdXQgY29lcmNpb24gLyBWYWx1ZXNPZkNvcnJlY3RUeXBlUnVsZSAodmFyaWFibGVzIGFuZCBpbmxpbmUgbGl0ZXJhbHMpLlxuICAgIC5yZXBsYWNlKC9FeHBlY3RlZCB2YWx1ZSBvZiB0eXBlIFwiKFteXCJdKylcIi9nLCAobWF0Y2gsIHR5cGVOYW1lKSA9PlxuICAgICAgaXNSZWZlcmVuY2VkKHR5cGVOYW1lKSA/IG1hdGNoIDogJ0V4cGVjdGVkIHZhbHVlIG9mIHRoZSBjb3JyZWN0IHR5cGUnXG4gICAgKVxuICAgIC5yZXBsYWNlKC9FeHBlY3RlZCB0eXBlIFwiKFteXCJdKylcIiB0byBiZSBhbiBvYmplY3RcXC4vZywgKG1hdGNoLCB0eXBlTmFtZSkgPT5cbiAgICAgIGlzUmVmZXJlbmNlZCh0eXBlTmFtZSkgPyBtYXRjaCA6ICdFeHBlY3RlZCBhbiBvYmplY3QuJ1xuICAgIClcbiAgICAucmVwbGFjZSgvRXhwZWN0ZWQgbm9uLW51bGxhYmxlIHR5cGUgXCIoW15cIl0rKVwiIG5vdCB0byBiZSBudWxsXFwuL2csIChtYXRjaCwgdHlwZU5hbWUpID0+XG4gICAgICBpc1JlZmVyZW5jZWQodHlwZU5hbWUpID8gbWF0Y2ggOiAnRXhwZWN0ZWQgYSBub24tbnVsbCB2YWx1ZS4nXG4gICAgKVxuICAgIC5yZXBsYWNlKC8gaXMgbm90IGRlZmluZWQgYnkgdHlwZSBcIihbXlwiXSspXCJcXC4vZywgKG1hdGNoLCB0eXBlTmFtZSkgPT5cbiAgICAgIGlzUmVmZXJlbmNlZCh0eXBlTmFtZSkgPyBtYXRjaCA6ICcgaXMgbm90IGRlZmluZWQuJ1xuICAgIClcbiAgICAvLyBWYXJpYWJsZXNJbkFsbG93ZWRQb3NpdGlvblJ1bGU6IHRoZSBwb3NpdGlvbiB0eXBlIGlzIHRoZSBwb2ludGVyL3JlbGF0aW9uIHRhcmdldFxuICAgIC8vIGlucHV0IHR5cGU7IHRoZSBjYWxsZXIgb25seSB3cm90ZSB0aGVpciBvd24gdmFyaWFibGUncyBkZWNsYXJlZCB0eXBlLlxuICAgIC5yZXBsYWNlKC8gdXNlZCBpbiBwb3NpdGlvbiBleHBlY3RpbmcgdHlwZSBcIihbXlwiXSspXCJcXC4vZywgKG1hdGNoLCB0eXBlTmFtZSkgPT5cbiAgICAgIGlzUmVmZXJlbmNlZCh0eXBlTmFtZSkgPyBtYXRjaCA6ICcgdXNlZCBpbiBwb3NpdGlvbiBleHBlY3RpbmcgYSBkaWZmZXJlbnQgdHlwZS4nXG4gICAgKVxuICAgIC8vIEZpZWxkc09uQ29ycmVjdFR5cGVSdWxlOiBkZXNjZW5kaW5nIGludG8gYSBQb2ludGVyL1JlbGF0aW9uIG91dHB1dCBmaWVsZCBuYW1lcyBpdHNcbiAgICAvLyB0YXJnZXQgb3V0cHV0IG9iamVjdCB0eXBlLlxuICAgIC5yZXBsYWNlKC9DYW5ub3QgcXVlcnkgZmllbGQgKFwiW15cIl0qXCIpIG9uIHR5cGUgXCIoW15cIl0rKVwiXFwuL2csIChtYXRjaCwgZmllbGROYW1lLCB0eXBlTmFtZSkgPT5cbiAgICAgIGlzUmVmZXJlbmNlZCh0eXBlTmFtZSkgPyBtYXRjaCA6IGBDYW5ub3QgcXVlcnkgZmllbGQgJHtmaWVsZE5hbWV9LmBcbiAgICApXG4gICAgLy8gU2NhbGFyTGVhZnNSdWxlOiBzZWxlY3RpbmcgYSBQb2ludGVyL1JlbGF0aW9uIG91dHB1dCBmaWVsZCB3aXRoIG5vIHN1Yi1zZWxlY3Rpb24gbmFtZXNcbiAgICAvLyBpdHMgdGFyZ2V0IG91dHB1dCBvYmplY3QgdHlwZS5cbiAgICAucmVwbGFjZShcbiAgICAgIC9GaWVsZCAoXCJbXlwiXSpcIikgb2YgdHlwZSBcIihbXlwiXSspXCIgbXVzdCBoYXZlIGEgc2VsZWN0aW9uIG9mIHN1YmZpZWxkc1xcLi9nLFxuICAgICAgKG1hdGNoLCBmaWVsZE5hbWUsIHR5cGVOYW1lKSA9PlxuICAgICAgICBpc1JlZmVyZW5jZWQodHlwZU5hbWUpID8gbWF0Y2ggOiBgRmllbGQgJHtmaWVsZE5hbWV9IG11c3QgaGF2ZSBhIHNlbGVjdGlvbiBvZiBzdWJmaWVsZHMuYFxuICAgIClcbiAgICAvLyBQb3NzaWJsZUZyYWdtZW50U3ByZWFkc1J1bGU6IGFuIGlubGluZS9uYW1lZCBmcmFnbWVudCBvbiBhbiBpbmNvbXBhdGlibGUgdHlwZSBpbnNpZGUgYVxuICAgIC8vIFBvaW50ZXIvUmVsYXRpb24gb3V0cHV0IGZpZWxkIG5hbWVzIHRoZSB0YXJnZXQgb3V0cHV0IG9iamVjdCB0eXBlICh0aGUgcGFyZW50IHR5cGUpLlxuICAgIC8vIFJlZGFjdCBlYWNoIHR5cGUgdG9rZW4gdGhlIGNhbGxlciBkaWQgbm90IHJlZmVyZW5jZTsgd2hlbiBib3RoIGFyZSByZWZlcmVuY2VkIHRoZVxuICAgIC8vIHJlY29uc3RydWN0aW9uIGlzIGlkZW50aWNhbCB0byB0aGUgb3JpZ2luYWwgbWVzc2FnZS5cbiAgICAucmVwbGFjZShcbiAgICAgIC9vYmplY3RzIG9mIHR5cGUgXCIoW15cIl0rKVwiIGNhbiBuZXZlciBiZSBvZiB0eXBlIFwiKFteXCJdKylcIlxcLi9nLFxuICAgICAgKG1hdGNoLCBwYXJlbnRUeXBlLCBmcmFnVHlwZSkgPT4ge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBpc1JlZmVyZW5jZWQocGFyZW50VHlwZSkgPyBgdHlwZSBcIiR7cGFyZW50VHlwZX1cImAgOiAndGhlIHBhcmVudCB0eXBlJztcbiAgICAgICAgY29uc3QgZnJhZyA9IGlzUmVmZXJlbmNlZChmcmFnVHlwZSkgPyBgdHlwZSBcIiR7ZnJhZ1R5cGV9XCJgIDogJ3RoZSBnaXZlbiB0eXBlJztcbiAgICAgICAgcmV0dXJuIGBvYmplY3RzIG9mICR7cGFyZW50fSBjYW4gbmV2ZXIgYmUgb2YgJHtmcmFnfS5gO1xuICAgICAgfVxuICAgICk7XG59O1xuXG5jb25zdCBzdHJpcFNjaGVtYUlkZW50aWZpZXJzID0gKG1lc3NhZ2UsIG9wZXJhdGlvblRleHQpID0+XG4gIHN0cmlwU2NoZW1hVHlwZUlkZW50aWZpZXJzKFxuICAgIHN0cmlwU2NoZW1hQ29lcmNpb25JZGVudGlmaWVycyhzdHJpcFNjaGVtYVN1Z2dlc3Rpb24obWVzc2FnZSkpLFxuICAgIG9wZXJhdGlvblRleHRcbiAgKTtcblxuY29uc3QgU2NoZW1hU3VnZ2VzdGlvbnNDb250cm9sUGx1Z2luID0gKHB1YmxpY0ludHJvc3BlY3Rpb24pID0+ICh7XG4gIHJlcXVlc3REaWRTdGFydDogYXN5bmMgKHJlcXVlc3RDb250ZXh0KSA9PiAoe1xuICAgIHdpbGxTZW5kUmVzcG9uc2U6IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChwdWJsaWNJbnRyb3NwZWN0aW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGlzTWFzdGVyT3JNYWludGVuYW5jZSA9XG4gICAgICAgIHJlcXVlc3RDb250ZXh0LmNvbnRleHRWYWx1ZS5hdXRoPy5pc01hc3RlciB8fFxuICAgICAgICByZXF1ZXN0Q29udGV4dC5jb250ZXh0VmFsdWUuYXV0aD8uaXNNYWludGVuYW5jZTtcbiAgICAgIGlmIChpc01hc3Rlck9yTWFpbnRlbmFuY2UpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgYm9keSA9IHJlcXVlc3RDb250ZXh0LnJlc3BvbnNlPy5ib2R5O1xuICAgICAgY29uc3QgZXJyb3JzID1cbiAgICAgICAgYm9keT8ua2luZCA9PT0gJ3NpbmdsZSdcbiAgICAgICAgICA/IGJvZHkuc2luZ2xlUmVzdWx0LmVycm9yc1xuICAgICAgICAgIDogYm9keT8ua2luZCA9PT0gJ2luY3JlbWVudGFsJ1xuICAgICAgICAgICAgPyBib2R5LmluaXRpYWxSZXN1bHQuZXJyb3JzXG4gICAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IG9wZXJhdGlvblRleHQgPSByZXF1ZXN0Q29udGV4dC5yZXF1ZXN0Py5xdWVyeTtcbiAgICAgIGVycm9ycz8uZm9yRWFjaChlcnJvciA9PiB7XG4gICAgICAgIGVycm9yLm1lc3NhZ2UgPSBzdHJpcFNjaGVtYUlkZW50aWZpZXJzKGVycm9yLm1lc3NhZ2UsIG9wZXJhdGlvblRleHQpO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShlcnJvci5leHRlbnNpb25zPy5zdGFja3RyYWNlKSkge1xuICAgICAgICAgIGVycm9yLmV4dGVuc2lvbnMuc3RhY2t0cmFjZSA9IGVycm9yLmV4dGVuc2lvbnMuc3RhY2t0cmFjZS5tYXAobWVzc2FnZSA9PlxuICAgICAgICAgICAgc3RyaXBTY2hlbWFJZGVudGlmaWVycyhtZXNzYWdlLCBvcGVyYXRpb25UZXh0KVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0sXG4gIH0pLFxufSk7XG5cbmNsYXNzIFBhcnNlR3JhcGhRTFNlcnZlciB7XG4gIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG5cbiAgY29uc3RydWN0b3IocGFyc2VTZXJ2ZXIsIGNvbmZpZykge1xuICAgIHRoaXMucGFyc2VTZXJ2ZXIgPSBwYXJzZVNlcnZlciB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHBhcnNlU2VydmVyIGluc3RhbmNlIScpO1xuICAgIGlmICghY29uZmlnIHx8ICFjb25maWcuZ3JhcGhRTFBhdGgpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgY29uZmlnLmdyYXBoUUxQYXRoIScpO1xuICAgIH1cbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgPSB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5wYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuICAgIHRoaXMubG9nID1cbiAgICAgICh0aGlzLnBhcnNlU2VydmVyLmNvbmZpZyAmJiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hID0gbmV3IFBhcnNlR3JhcGhRTFNjaGVtYSh7XG4gICAgICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIGxvZzogdGhpcy5sb2csXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6IHRoaXMuY29uZmlnLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgIGFwcElkOiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5hcHBJZCxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRHcmFwaFFMT3B0aW9ucygpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc2NoZW1hOiBhd2FpdCB0aGlzLnBhcnNlR3JhcGhRTFNjaGVtYS5sb2FkKCksXG4gICAgICAgIGNvbnRleHQ6IGFzeW5jICh7IHJlcSB9KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGluZm86IHJlcS5pbmZvLFxuICAgICAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICAgICAgYXV0aDogcmVxLmF1dGgsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoZS5zdGFjayB8fCAodHlwZW9mIGUudG9TdHJpbmcgPT09ICdmdW5jdGlvbicgJiYgZS50b1N0cmluZygpKSB8fCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2dldFNlcnZlcigpIHtcbiAgICBjb25zdCBzY2hlbWFSZWYgPSB0aGlzLnBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hO1xuICAgIGNvbnN0IG5ld1NjaGVtYVJlZiA9IGF3YWl0IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmxvYWQoKTtcbiAgICBpZiAoc2NoZW1hUmVmID09PSBuZXdTY2hlbWFSZWYgJiYgdGhpcy5fc2VydmVyKSB7XG4gICAgICByZXR1cm4gdGhpcy5fc2VydmVyO1xuICAgIH1cbiAgICAvLyBJdCBtZWFucyBhIHBhcmFsbGVsIF9nZXRTZXJ2ZXIgY2FsbCBpcyBhbHJlYWR5IGluIHByb2dyZXNzXG4gICAgaWYgKHRoaXMuX3NjaGVtYVJlZk11dGV4ID09PSBuZXdTY2hlbWFSZWYpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zZXJ2ZXI7XG4gICAgfVxuICAgIC8vIFVwZGF0ZSB0aGUgc2NoZW1hIHJlZiBtdXRleCB0byBhdm9pZCBwYXJhbGxlbCBfZ2V0U2VydmVyIGNhbGxzXG4gICAgdGhpcy5fc2NoZW1hUmVmTXV0ZXggPSBuZXdTY2hlbWFSZWY7XG4gICAgY29uc3QgY3JlYXRlU2VydmVyID0gYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBzY2hlbWEsIGNvbnRleHQgfSA9IGF3YWl0IHRoaXMuX2dldEdyYXBoUUxPcHRpb25zKCk7XG4gICAgICAgIGNvbnN0IGFwb2xsbyA9IG5ldyBBcG9sbG9TZXJ2ZXIoe1xuICAgICAgICAgIGNzcmZQcmV2ZW50aW9uOiB7XG4gICAgICAgICAgICAvLyBTZWUgaHR0cHM6Ly93d3cuYXBvbGxvZ3JhcGhxbC5jb20vZG9jcy9yb3V0ZXIvY29uZmlndXJhdGlvbi9jc3JmL1xuICAgICAgICAgICAgLy8gbmVlZGVkIHNpbmNlIHdlIHVzZSBncmFwaHFsIHVwbG9hZFxuICAgICAgICAgICAgcmVxdWVzdEhlYWRlcnM6IFsnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCddLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgaW50cm9zcGVjdGlvbjogdGhpcy5jb25maWcuZ3JhcGhRTFB1YmxpY0ludHJvc3BlY3Rpb24sXG4gICAgICAgICAgcGx1Z2luczogW0Fwb2xsb1NlcnZlclBsdWdpbkNhY2hlQ29udHJvbERpc2FibGVkKCksIEludHJvc3BlY3Rpb25Db250cm9sUGx1Z2luKHRoaXMuY29uZmlnLmdyYXBoUUxQdWJsaWNJbnRyb3NwZWN0aW9uKSwgU2NoZW1hU3VnZ2VzdGlvbnNDb250cm9sUGx1Z2luKHRoaXMuY29uZmlnLmdyYXBoUUxQdWJsaWNJbnRyb3NwZWN0aW9uKSwgY3JlYXRlQ29tcGxleGl0eVZhbGlkYXRpb25QbHVnaW4oKCkgPT4gdGhpcy5wYXJzZVNlcnZlci5jb25maWcucmVxdWVzdENvbXBsZXhpdHkpXSxcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgIH0pO1xuICAgICAgICBhd2FpdCBhcG9sbG8uc3RhcnQoKTtcbiAgICAgICAgcmV0dXJuIGV4cHJlc3NNaWRkbGV3YXJlKGFwb2xsbywge1xuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBSZXNldCBhbGwgbXV0ZXhlcyBhbmQgZm9yd2FyZCB0aGUgZXJyb3JcbiAgICAgICAgdGhpcy5fc2VydmVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5fc2NoZW1hUmVmTXV0ZXggPSBudWxsO1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBEbyBub3QgYXdhaXQgc28gcGFyYWxsZWwgcmVxdWVzdCB3aWxsIHdhaXQgdGhlIHNhbWUgcHJvbWlzZSByZWZcbiAgICB0aGlzLl9zZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoKTtcbiAgICByZXR1cm4gdGhpcy5fc2VydmVyO1xuICB9XG5cbiAgX3RyYW5zZm9ybU1heFVwbG9hZFNpemVUb0J5dGVzKG1heFVwbG9hZFNpemUpIHtcbiAgICBjb25zdCB1bml0TWFwID0ge1xuICAgICAga2I6IDEsXG4gICAgICBtYjogMixcbiAgICAgIGdiOiAzLFxuICAgIH07XG5cbiAgICByZXR1cm4gKFxuICAgICAgTnVtYmVyKG1heFVwbG9hZFNpemUuc2xpY2UoMCwgLTIpKSAqXG4gICAgICBNYXRoLnBvdygxMDI0LCB1bml0TWFwW21heFVwbG9hZFNpemUuc2xpY2UoLTIpLnRvTG93ZXJDYXNlKCldKVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBBbGxvdyBkZXZlbG9wZXJzIHRvIGN1c3RvbWl6ZSBlYWNoIHJlcXVlc3Qgd2l0aCBpbnZlcnNpb24gb2YgY29udHJvbC9kZXBlbmRlbmN5IGluamVjdGlvblxuICAgKi9cbiAgYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUoYXBpLCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigncmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgICAgfVxuICAgICAgYXBpLnVzZSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCwgb3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUpO1xuICAgIH1cbiAgfVxuXG4gIGFwcGx5R3JhcGhRTChhcHApIHtcbiAgICBpZiAoIWFwcCB8fCAhYXBwLnVzZSkge1xuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYW4gRXhwcmVzcy5qcyBhcHAgaW5zdGFuY2UhJyk7XG4gICAgfVxuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGFsbG93Q3Jvc3NEb21haW4odGhpcy5wYXJzZVNlcnZlci5jb25maWcuYXBwSWQpKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBoYW5kbGVQYXJzZUhlYWRlcnMpO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGhhbmRsZVBhcnNlU2Vzc2lvbik7XG4gICAgdGhpcy5hcHBseVJlcXVlc3RDb250ZXh0TWlkZGxld2FyZShhcHAsIHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBoYW5kbGVQYXJzZUVycm9ycyk7XG4gICAgYXBwLnVzZShcbiAgICAgIHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLFxuICAgICAgZ3JhcGhxbFVwbG9hZEV4cHJlc3Moe1xuICAgICAgICBtYXhGaWxlU2l6ZTogdGhpcy5fdHJhbnNmb3JtTWF4VXBsb2FkU2l6ZVRvQnl0ZXMoXG4gICAgICAgICAgdGhpcy5wYXJzZVNlcnZlci5jb25maWcubWF4VXBsb2FkU2l6ZSB8fCAnMjBtYidcbiAgICAgICAgKSxcbiAgICAgIH0pXG4gICAgKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBleHByZXNzLmpzb24oKSwgYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gICAgICBjb25zdCBzZXJ2ZXIgPSBhd2FpdCB0aGlzLl9nZXRTZXJ2ZXIoKTtcbiAgICAgIHJldHVybiBzZXJ2ZXIocmVxLCByZXMsIG5leHQpO1xuICAgIH0pO1xuICB9XG5cbiAgYXBwbHlQbGF5Z3JvdW5kKGFwcCkge1xuICAgIGlmICghYXBwIHx8ICFhcHAuZ2V0KSB7XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBFeHByZXNzLmpzIGFwcCBpbnN0YW5jZSEnKTtcbiAgICB9XG5cbiAgICBhcHAuZ2V0KFxuICAgICAgdGhpcy5jb25maWcucGxheWdyb3VuZFBhdGggfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgY29uZmlnLnBsYXlncm91bmRQYXRoIHRvIGFwcGx5UGxheWdyb3VuZCEnKSxcbiAgICAgIChfcmVxLCByZXMpID0+IHtcbiAgICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ3RleHQvaHRtbCcpO1xuICAgICAgICByZXMud3JpdGUoXG4gICAgICAgICAgYDxkaXYgaWQ9XCJzYW5kYm94XCIgc3R5bGU9XCJwb3NpdGlvbjphYnNvbHV0ZTt0b3A6MDtyaWdodDowO2JvdHRvbTowO2xlZnQ6MFwiPjwvZGl2PlxuICAgICAgICAgIDxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9lbWJlZGRhYmxlLXNhbmRib3guY2RuLmFwb2xsb2dyYXBocWwuY29tL19sYXRlc3QvZW1iZWRkYWJsZS1zYW5kYm94LnVtZC5wcm9kdWN0aW9uLm1pbi5qc1wiPjwvc2NyaXB0PlxuICAgICAgICAgIDxzY3JpcHQ+XG4gICAgICAgICAgIG5ldyB3aW5kb3cuRW1iZWRkZWRTYW5kYm94KHtcbiAgICAgICAgICAgICB0YXJnZXQ6IFwiI3NhbmRib3hcIixcbiAgICAgICAgICAgICBlbmRwb2ludElzRWRpdGFibGU6IGZhbHNlLFxuICAgICAgICAgICAgIGluaXRpYWxFbmRwb2ludDogJHtKU09OLnN0cmluZ2lmeSh0aGlzLmNvbmZpZy5ncmFwaFFMUGF0aCl9LFxuICAgICAgICAgICAgIGhhbmRsZVJlcXVlc3Q6IChlbmRwb2ludFVybCwgb3B0aW9ucykgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZmV0Y2goZW5kcG9pbnRVcmwsIHtcbiAgICAgICAgICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgLi4ub3B0aW9ucy5oZWFkZXJzLFxuICAgICAgICAgICAgICAgICAgICAnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCc6ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5wYXJzZVNlcnZlci5jb25maWcuYXBwSWQpfSxcbiAgICAgICAgICAgICAgICAgICAgJ1gtUGFyc2UtTWFzdGVyLUtleSc6ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5wYXJzZVNlcnZlci5jb25maWcubWFzdGVyS2V5KX0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgIH0pO1xuICAgICAgICAgICAvLyBhZHZhbmNlZCBvcHRpb25zOiBodHRwczovL3d3dy5hcG9sbG9ncmFwaHFsLmNvbS9kb2NzL3N0dWRpby9leHBsb3Jlci9zYW5kYm94I2VtYmVkZGluZy1zYW5kYm94XG4gICAgICAgICAgPC9zY3JpcHQ+YFxuICAgICAgICApO1xuICAgICAgICByZXMuZW5kKCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHNldEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKTogUHJvbWlzZSB7XG4gICAgcmV0dXJuIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlci51cGRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxxQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsUUFBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsU0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksU0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssUUFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sWUFBQSxHQUFBTixPQUFBO0FBQ0EsSUFBQU8sa0JBQUEsR0FBQVIsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFRLGdCQUFB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