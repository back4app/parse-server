"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _QueryTools = require("./LiveQuery/QueryTools");
var _defaults = _interopRequireDefault(require("./defaults"));
var logging = _interopRequireWildcard(require("./logger"));
var _Config = _interopRequireDefault(require("./Config"));
var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));
var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));
var _AnalyticsRouter = require("./Routers/AnalyticsRouter");
var _ClassesRouter = require("./Routers/ClassesRouter");
var _FeaturesRouter = require("./Routers/FeaturesRouter");
var _FilesRouter = require("./Routers/FilesRouter");
var _FunctionsRouter = require("./Routers/FunctionsRouter");
var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");
var _GraphQLRouter = require("./Routers/GraphQLRouter");
var _HooksRouter = require("./Routers/HooksRouter");
var _IAPValidationRouter = require("./Routers/IAPValidationRouter");
var _InstallationsRouter = require("./Routers/InstallationsRouter");
var _LogsRouter = require("./Routers/LogsRouter");
var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");
var _PagesRouter = require("./Routers/PagesRouter");
var _PublicAPIRouter = require("./Routers/PublicAPIRouter");
var _PushRouter = require("./Routers/PushRouter");
var _CloudCodeRouter = require("./Routers/CloudCodeRouter");
var _RolesRouter = require("./Routers/RolesRouter");
var _SchemasRouter = require("./Routers/SchemasRouter");
var _SessionsRouter = require("./Routers/SessionsRouter");
var _UsersRouter = require("./Routers/UsersRouter");
var _PurgeRouter = require("./Routers/PurgeRouter");
var _AudiencesRouter = require("./Routers/AudiencesRouter");
var _AggregateRouter = require("./Routers/AggregateRouter");
var _ExportRouter = require("./Routers/ExportRouter");
var _ImportRouter = require("./Routers/ImportRouter");
var _ParseServerRESTController = require("./ParseServerRESTController");
var controllers = _interopRequireWildcard(require("./Controllers"));
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
var _SecurityRouter = require("./Routers/SecurityRouter");
var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");
var _Definitions = _interopRequireDefault(require("./Options/Definitions"));
var _TestUtils = require("./TestUtils");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  {
    parse
  } = require('graphql'),
  path = require('path'),
  fs = require('fs');
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// Track connections to destroy them on shutdown
const connections = new _TestUtils.Connections();

// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options);
    const interfaces = JSON.parse(JSON.stringify(_Definitions.default));
    function getValidObject(root) {
      const result = {};
      for (const key in root) {
        if (Object.prototype.hasOwnProperty.call(root[key], 'type')) {
          if (root[key].type.endsWith('[]')) {
            result[key] = [getValidObject(interfaces[root[key].type.slice(0, -2)])];
          } else {
            result[key] = getValidObject(interfaces[root[key].type]);
          }
        } else {
          result[key] = '';
        }
      }
      return result;
    }
    const optionsBlueprint = getValidObject(interfaces['ParseServerOptions']);
    function validateKeyNames(original, ref, name = '') {
      let result = [];
      const prefix = name + (name !== '' ? '.' : '');
      for (const key in original) {
        if (!Object.prototype.hasOwnProperty.call(ref, key)) {
          result.push(prefix + key);
        } else {
          if (ref[key] === '') {
            continue;
          }
          let res = [];
          if (Array.isArray(original[key]) && Array.isArray(ref[key])) {
            const type = ref[key][0];
            original[key].forEach((item, idx) => {
              if (typeof item === 'object' && item !== null) {
                res = res.concat(validateKeyNames(item, type, prefix + key + `[${idx}]`));
              }
            });
          } else if (typeof original[key] === 'object' && typeof ref[key] === 'object') {
            res = validateKeyNames(original[key], ref[key], prefix + key);
          }
          result = result.concat(res);
        }
      }
      return result;
    }
    const diff = validateKeyNames(options, optionsBlueprint);
    if (diff.length > 0) {
      const logger = logging.logger;
      logger.error(`Invalid key(s) found in Parse Server configuration: ${diff.join(', ')}`);
    }

    // Set option defaults
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!')
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    _Config.default.validateOptions(options);
    const allControllers = controllers.getControllers(options);
    options.state = 'initialized';
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    this.config.masterKeyIpsStore = new Map();
    this.config.maintenanceKeyIpsStore = new Map();
    logging.setLogger(allControllers.loggerController);
    (0, _QueryTools.setRegexTimeout)(options.liveQuery?.regexTimeout);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      _Config.default.put(this.config);
      const {
        databaseController,
        hooksController,
        cacheController,
        cloud,
        security,
        schema,
        liveQueryController
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      const pushController = await controllers.getPushController(this.config);
      await hooksController.load();
      const startupPromises = [this.config.loadMasterKey?.()];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if (cacheController.adapter?.connect && typeof cacheController.adapter.connect === 'function') {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || json?.type === 'module') {
            await import(path.resolve(process.cwd(), cloud));
          } else {
            require(path.resolve(process.cwd(), cloud));
          }
        } else {
          throw "argument 'cloud' must either be a string or a function";
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (security && security.enableCheck && security.enableCheckLog) {
        new _CheckRunner.default(security).run();
      }
      this.config.state = 'ok';
      this.config = {
        ...this.config,
        ...pushController
      };
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      this.config.state = 'error';
      throw error;
    }
  }
  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }

  /**
   * Stops the parse server, cancels any ongoing requests and closes all connections.
   *
   * Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM
   * if it has client connections that haven't timed out.
   * (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
   *
   * @returns {Promise<void>} a promise that resolves when the server is stopped
   */
  async handleShutdown() {
    const serverClosePromise = (0, _TestUtils.resolvingPromise)();
    const liveQueryServerClosePromise = (0, _TestUtils.resolvingPromise)();
    const promises = [];
    this.server.close(error => {
      /* istanbul ignore next */
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error while closing parse server', error);
      }
      serverClosePromise.resolve();
    });
    if (this.liveQueryServer?.server?.close && this.liveQueryServer.server !== this.server) {
      this.liveQueryServer.server.close(error => {
        /* istanbul ignore next */
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Error while closing live query server', error);
        }
        liveQueryServerClosePromise.resolve();
      });
    } else {
      liveQueryServerClosePromise.resolve();
    }
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const {
      adapter: fileAdapter
    } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const {
      adapter: cacheAdapter
    } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    if (this.liveQueryServer) {
      promises.push(this.liveQueryServer.shutdown());
    }
    await Promise.all(promises);
    connections.destroyAll();
    await Promise.all([serverClosePromise, liveQueryServerClosePromise]);
    if (this.config.serverCloseComplete) {
      this.config.serverCloseComplete();
    }
  }

  /**
   * @static
   * Allow developers to customize each request with inversion of control/dependency injection
   */
  static applyRequestContextMiddleware(api, options) {
    if (options.requestContextMiddleware) {
      if (typeof options.requestContextMiddleware !== 'function') {
        throw new Error('requestContextMiddleware must be a function');
      }
      api.use(options.requestContextMiddleware);
    }
  }
  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */
  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess,
      pages,
      rateLimit = []
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    api.use(middlewares.allowDoubleForwardSlash);
    // File handling needs to be before default middlewares are applied
    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.status(options.state === 'ok' ? 200 : 503);
      if (options.state === 'starting') {
        res.set('Retry-After', 1);
      }
      res.json({
        status: options.state
      });
    });
    api.use('/', express.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use('/', new _ImportRouter.ImportRouter().expressRouter());
    api.use(express.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    api.set('query parser', 'extended');
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
    this.applyRequestContextMiddleware(api, options);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          if (err.message) {
            process.stderr.write('An uncaught exception occurred: ' + err.message);
          }
          if (err.stack) {
            process.stderr.write('Stack Trace:\n' + err.stack);
          } else {
            process.stderr.write(err);
          }
          process.exit(1);
        }
      });
    }
    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }
    return api;
  }
  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _ExportRouter.ExportRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options) {
    try {
      await this.start();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
    const app = express();
    if (options.middleware) {
      let middleware;
      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }
      app.use(middleware);
    }
    app.use(options.mountPath, this.app);
    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;
      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });
      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }
      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;
    connections.track(server);
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
      if (this.liveQueryServer.server !== this.server) {
        connections.track(this.liveQueryServer.server);
      }
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
      if (options.verifyServerUrl !== false) {
        await ParseServer.verifyServerUrl();
      }
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options) {
    const parseServer = new ParseServer(options);
    return parseServer.startApp(options);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {Promise<ParseLiveQueryServer>} the live query server instance
   */
  static async createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }
  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch (_) {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        // eslint-disable-next-line no-console
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = response.headers?.['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || json?.status !== 'ok') {
        /* eslint-disable no-console */
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
        /* eslint-enable no-console */
        return;
      }
      return true;
    }
  }
}
function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  const ParseServer = require('./cloud-code/Parse.Server');
  Object.defineProperty(Parse, 'Server', {
    get() {
      const conf = _Config.default.get(Parse.applicationId);
      return {
        ...conf,
        ...ParseServer
      };
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      _Config.default.put(newVal);
    },
    configurable: true
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}
function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });
  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      // eslint-disable-next-line no-console
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])]));

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }
    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  }

  // Merge protectedFields options with defaults.
  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = exports.default = ParseServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUXVlcnlUb29scyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX0V4cG9ydFJvdXRlciIsIl9JbXBvcnRSb3V0ZXIiLCJfUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsImNvbnRyb2xsZXJzIiwiX1BhcnNlR3JhcGhRTFNlcnZlciIsIl9TZWN1cml0eVJvdXRlciIsIl9DaGVja1J1bm5lciIsIl9EZXByZWNhdG9yIiwiX0RlZmluZWRTY2hlbWFzIiwiX0RlZmluaXRpb25zIiwiX1Rlc3RVdGlscyIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImJhdGNoIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJjb25uZWN0aW9ucyIsIkNvbm5lY3Rpb25zIiwiUGFyc2VTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJEZXByZWNhdG9yIiwic2NhblBhcnNlU2VydmVyT3B0aW9ucyIsImludGVyZmFjZXMiLCJKU09OIiwic3RyaW5naWZ5IiwiT3B0aW9uc0RlZmluaXRpb25zIiwiZ2V0VmFsaWRPYmplY3QiLCJyb290IiwicmVzdWx0Iiwia2V5IiwicHJvdG90eXBlIiwidHlwZSIsImVuZHNXaXRoIiwic2xpY2UiLCJvcHRpb25zQmx1ZXByaW50IiwidmFsaWRhdGVLZXlOYW1lcyIsIm9yaWdpbmFsIiwicmVmIiwibmFtZSIsInByZWZpeCIsInB1c2giLCJyZXMiLCJBcnJheSIsImlzQXJyYXkiLCJmb3JFYWNoIiwiaXRlbSIsImlkeCIsImNvbmNhdCIsImRpZmYiLCJsZW5ndGgiLCJsb2dnZXIiLCJlcnJvciIsImpvaW4iLCJpbmplY3REZWZhdWx0cyIsImFwcElkIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJtYXN0ZXJLZXkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsIkNvbmZpZyIsInZhbGlkYXRlT3B0aW9ucyIsImFsbENvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsInB1dCIsImFzc2lnbiIsIm1hc3RlcktleUlwc1N0b3JlIiwiTWFwIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsInNldExvZ2dlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzZXRSZWdleFRpbWVvdXQiLCJsaXZlUXVlcnkiLCJyZWdleFRpbWVvdXQiLCJzdGFydCIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNhY2hlQ29udHJvbGxlciIsImNsb3VkIiwic2VjdXJpdHkiLCJzY2hlbWEiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiY29kZSIsIkVycm9yIiwiRFVQTElDQVRFX1ZBTFVFIiwicHVzaENvbnRyb2xsZXIiLCJnZXRQdXNoQ29udHJvbGxlciIsImxvYWQiLCJzdGFydHVwUHJvbWlzZXMiLCJsb2FkTWFzdGVyS2V5IiwiRGVmaW5lZFNjaGVtYXMiLCJleGVjdXRlIiwiYWRhcHRlciIsImNvbm5lY3QiLCJQcm9taXNlIiwiYWxsIiwicmVzb2x2ZSIsImpzb24iLCJwcm9jZXNzIiwiZW52IiwibnBtX3BhY2thZ2VfanNvbiIsIm5wbV9wYWNrYWdlX3R5cGUiLCJjd2QiLCJzZXRUaW1lb3V0IiwiZW5hYmxlQ2hlY2siLCJlbmFibGVDaGVja0xvZyIsIkNoZWNrUnVubmVyIiwicnVuIiwiY29uc29sZSIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInNlcnZlckNsb3NlUHJvbWlzZSIsInJlc29sdmluZ1Byb21pc2UiLCJsaXZlUXVlcnlTZXJ2ZXJDbG9zZVByb21pc2UiLCJwcm9taXNlcyIsInNlcnZlciIsImNsb3NlIiwibGl2ZVF1ZXJ5U2VydmVyIiwiZGF0YWJhc2VBZGFwdGVyIiwiZmlsZUFkYXB0ZXIiLCJmaWxlc0NvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJzaHV0ZG93biIsImRlc3Ryb3lBbGwiLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwiYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJhcGkiLCJyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJ1c2UiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhbGxvd0Nyb3NzRG9tYWluIiwiYWxsb3dEb3VibGVGb3J3YXJkU2xhc2giLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsIkltcG9ydFJvdXRlciIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsInJvdXRlcyIsInJvdXRlIiwiYWRkUmF0ZUxpbWl0IiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiVEVTVElORyIsIm9uIiwiZXJyIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwiZXhpdCIsIm1lc3NhZ2UiLCJzdGFjayIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIkdyYXBoUUxSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwiRXhwb3J0Um91dGVyIiwiU2VjdXJpdHlSb3V0ZXIiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0QXBwIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwibGlzdGVuIiwiaG9zdCIsInRyYWNrIiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwidHJ1c3RQcm94eSIsImNvbmZpZ3VyZUxpc3RlbmVycyIsInZlcmlmeVNlcnZlclVybCIsImV4cHJlc3NBcHAiLCJwYXJzZVNlcnZlciIsImh0dHBTZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImlzVmFsaWRIdHRwVXJsIiwic3RyaW5nIiwidXJsIiwiVVJMIiwiXyIsInByb3RvY29sIiwicmVwbGFjZSIsIndhcm4iLCJyZXF1ZXN0IiwicmVzcG9uc2UiLCJjYXRjaCIsImRhdGEiLCJyZXRyeSIsImhlYWRlcnMiLCJQYXJzZUNsb3VkIiwiY29uZiIsImFwcGxpY2F0aW9uSWQiLCJuZXdWYWwiLCJjb25maWd1cmFibGUiLCJDbG91ZCIsImdsb2JhbCIsImtleXMiLCJkZWZhdWx0cyIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInVucSIsInN0ZG91dCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgeyBzZXRSZWdleFRpbWVvdXQgfSBmcm9tICcuL0xpdmVRdWVyeS9RdWVyeVRvb2xzJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEdyYXBoUUxSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR3JhcGhRTFJvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFBhZ2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1BhZ2VzUm91dGVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBFeHBvcnRSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRXhwb3J0Um91dGVyJztcbmltcG9ydCB7IEltcG9ydFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbXBvcnRSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuaW1wb3J0IE9wdGlvbnNEZWZpbml0aW9ucyBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgcmVzb2x2aW5nUHJvbWlzZSwgQ29ubmVjdGlvbnMgfSBmcm9tICcuL1Rlc3RVdGlscyc7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBUcmFjayBjb25uZWN0aW9ucyB0byBkZXN0cm95IHRoZW0gb24gc2h1dGRvd25cbmNvbnN0IGNvbm5lY3Rpb25zID0gbmV3IENvbm5lY3Rpb25zKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIGh0dHBzOi8vcGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2FwaS9tYXN0ZXIvUGFyc2VTZXJ2ZXJPcHRpb25zLmh0bWxcbmNsYXNzIFBhcnNlU2VydmVyIHtcbiAgX2FwcDogYW55O1xuICBjb25maWc6IGFueTtcbiAgc2VydmVyOiBhbnk7XG4gIGV4cHJlc3NBcHA6IGFueTtcbiAgbGl2ZVF1ZXJ5U2VydmVyOiBhbnk7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICAvLyBTY2FuIGZvciBkZXByZWNhdGVkIFBhcnNlIFNlcnZlciBvcHRpb25zXG4gICAgRGVwcmVjYXRvci5zY2FuUGFyc2VTZXJ2ZXJPcHRpb25zKG9wdGlvbnMpO1xuXG4gICAgY29uc3QgaW50ZXJmYWNlcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoT3B0aW9uc0RlZmluaXRpb25zKSk7XG5cbiAgICBmdW5jdGlvbiBnZXRWYWxpZE9iamVjdChyb290KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIHJvb3QpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyb290W2tleV0sICd0eXBlJykpIHtcbiAgICAgICAgICBpZiAocm9vdFtrZXldLnR5cGUuZW5kc1dpdGgoJ1tdJykpIHtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gW2dldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGUuc2xpY2UoMCwgLTIpXSldO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHRba2V5XSA9IGdldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGVdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBvcHRpb25zQmx1ZXByaW50ID0gZ2V0VmFsaWRPYmplY3QoaW50ZXJmYWNlc1snUGFyc2VTZXJ2ZXJPcHRpb25zJ10pO1xuXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVLZXlOYW1lcyhvcmlnaW5hbCwgcmVmLCBuYW1lID0gJycpIHtcbiAgICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICAgIGNvbnN0IHByZWZpeCA9IG5hbWUgKyAobmFtZSAhPT0gJycgPyAnLicgOiAnJyk7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBvcmlnaW5hbCkge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZWYsIGtleSkpIHtcbiAgICAgICAgICByZXN1bHQucHVzaChwcmVmaXggKyBrZXkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChyZWZba2V5XSA9PT0gJycpIHsgY29udGludWU7IH1cbiAgICAgICAgICBsZXQgcmVzID0gW107XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3JpZ2luYWxba2V5XSkgJiYgQXJyYXkuaXNBcnJheShyZWZba2V5XSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSByZWZba2V5XVswXTtcbiAgICAgICAgICAgIG9yaWdpbmFsW2tleV0uZm9yRWFjaCgoaXRlbSwgaWR4KSA9PiB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcy5jb25jYXQodmFsaWRhdGVLZXlOYW1lcyhpdGVtLCB0eXBlLCBwcmVmaXggKyBrZXkgKyBgWyR7aWR4fV1gKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9yaWdpbmFsW2tleV0gPT09ICdvYmplY3QnICYmIHR5cGVvZiByZWZba2V5XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHJlcyA9IHZhbGlkYXRlS2V5TmFtZXMob3JpZ2luYWxba2V5XSwgcmVmW2tleV0sIHByZWZpeCArIGtleSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQocmVzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBkaWZmID0gdmFsaWRhdGVLZXlOYW1lcyhvcHRpb25zLCBvcHRpb25zQmx1ZXByaW50KTtcbiAgICBpZiAoZGlmZi5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBsb2dnZXIgPSAobG9nZ2luZyBhcyBhbnkpLmxvZ2dlcjtcbiAgICAgIGxvZ2dlci5lcnJvcihgSW52YWxpZCBrZXkocykgZm91bmQgaW4gUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb246ICR7ZGlmZi5qb2luKCcsICcpfWApO1xuICAgIH1cblxuICAgIC8vIFNldCBvcHRpb24gZGVmYXVsdHNcbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgbm9kZSBjbGllbnQgU0RLIGF1dG9tYXRpY2FsbHlcbiAgICBQYXJzZS5pbml0aWFsaXplKGFwcElkLCBqYXZhc2NyaXB0S2V5IHx8ICd1bnVzZWQnLCBtYXN0ZXJLZXkpO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG5cbiAgICAob3B0aW9ucyBhcyBhbnkpLnN0YXRlID0gJ2luaXRpYWxpemVkJztcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5wdXQoT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywgYWxsQ29udHJvbGxlcnMpKTtcbiAgICB0aGlzLmNvbmZpZy5tYXN0ZXJLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZy5tYWludGVuYW5jZUtleUlwc1N0b3JlID0gbmV3IE1hcCgpO1xuICAgIGxvZ2dpbmcuc2V0TG9nZ2VyKGFsbENvbnRyb2xsZXJzLmxvZ2dlckNvbnRyb2xsZXIpO1xuICAgIHNldFJlZ2V4VGltZW91dChvcHRpb25zLmxpdmVRdWVyeT8ucmVnZXhUaW1lb3V0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgUGFyc2UgU2VydmVyIGFzIGFuIGV4cHJlc3MgYXBwOyB0aGlzIHByb21pc2UgcmVzb2x2ZXMgd2hlbiBQYXJzZSBTZXJ2ZXIgaXMgcmVhZHkgdG8gYWNjZXB0IHJlcXVlc3RzLlxuICAgKi9cblxuICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHRoaXM+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnN0YXRlID09PSAnb2snKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnc3RhcnRpbmcnO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgIGNsb3VkLFxuICAgICAgICBzZWN1cml0eSxcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBsaXZlUXVlcnlDb250cm9sbGVyLFxuICAgICAgfSA9IHRoaXMuY29uZmlnO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZS5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBwdXNoQ29udHJvbGxlciA9IGF3YWl0IGNvbnRyb2xsZXJzLmdldFB1c2hDb250cm9sbGVyKHRoaXMuY29uZmlnKTtcbiAgICAgIGF3YWl0IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG4gICAgICBjb25zdCBzdGFydHVwUHJvbWlzZXMgPSBbdGhpcy5jb25maWcubG9hZE1hc3RlcktleT8uKCldO1xuICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChuZXcgRGVmaW5lZFNjaGVtYXMoc2NoZW1hLCB0aGlzLmNvbmZpZykuZXhlY3V0ZSgpKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgY2FjaGVDb250cm9sbGVyLmFkYXB0ZXI/LmNvbm5lY3QgJiZcbiAgICAgICAgdHlwZW9mIGNhY2hlQ29udHJvbGxlci5hZGFwdGVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChjYWNoZUNvbnRyb2xsZXIuYWRhcHRlci5jb25uZWN0KCkpO1xuICAgICAgfVxuICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobGl2ZVF1ZXJ5Q29udHJvbGxlci5jb25uZWN0KCkpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc3RhcnR1cFByb21pc2VzKTtcbiAgICAgIGlmIChjbG91ZCkge1xuICAgICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUoY2xvdWQoUGFyc2UpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgbGV0IGpzb247XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pIHtcbiAgICAgICAgICAgIGpzb24gPSByZXF1aXJlKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfdHlwZSA9PT0gJ21vZHVsZScgfHwganNvbj8udHlwZSA9PT0gJ21vZHVsZScpIHtcbiAgICAgICAgICAgIGF3YWl0IGltcG9ydChwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWN1cml0eSAmJiBzZWN1cml0eS5lbmFibGVDaGVjayAmJiBzZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICBuZXcgQ2hlY2tSdW5uZXIoc2VjdXJpdHkpLnJ1bigpO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnb2snO1xuICAgICAgdGhpcy5jb25maWcgPSB7IC4uLnRoaXMuY29uZmlnLCAuLi5wdXNoQ29udHJvbGxlciB9O1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnZXJyb3InO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyB0aGUgcGFyc2Ugc2VydmVyLCBjYW5jZWxzIGFueSBvbmdvaW5nIHJlcXVlc3RzIGFuZCBjbG9zZXMgYWxsIGNvbm5lY3Rpb25zLlxuICAgKlxuICAgKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNXG4gICAqIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC5cbiAgICogKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBzZXJ2ZXIgaXMgc3RvcHBlZFxuICAgKi9cbiAgYXN5bmMgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3Qgc2VydmVyQ2xvc2VQcm9taXNlID0gcmVzb2x2aW5nUHJvbWlzZSgpO1xuICAgIGNvbnN0IGxpdmVRdWVyeVNlcnZlckNsb3NlUHJvbWlzZSA9IHJlc29sdmluZ1Byb21pc2UoKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIHRoaXMuc2VydmVyLmNsb3NlKChlcnJvcikgPT4ge1xuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBjbG9zaW5nIHBhcnNlIHNlcnZlcicsIGVycm9yKTtcbiAgICAgIH1cbiAgICAgIHNlcnZlckNsb3NlUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfSk7XG4gICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyPy5zZXJ2ZXI/LmNsb3NlICYmIHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNlcnZlciAhPT0gdGhpcy5zZXJ2ZXIpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNlcnZlci5jbG9zZSgoZXJyb3IpID0+IHtcbiAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBjbG9zaW5nIGxpdmUgcXVlcnkgc2VydmVyJywgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIGxpdmVRdWVyeVNlcnZlckNsb3NlUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGl2ZVF1ZXJ5U2VydmVyQ2xvc2VQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXIpIHtcbiAgICAgIHByb21pc2VzLnB1c2godGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25uZWN0aW9ucy5kZXN0cm95QWxsKCk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoW3NlcnZlckNsb3NlUHJvbWlzZSwgbGl2ZVF1ZXJ5U2VydmVyQ2xvc2VQcm9taXNlXSk7XG4gICAgaWYgKHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUpIHtcbiAgICAgIHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUoKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBBbGxvdyBkZXZlbG9wZXJzIHRvIGN1c3RvbWl6ZSBlYWNoIHJlcXVlc3Qgd2l0aCBpbnZlcnNpb24gb2YgY29udHJvbC9kZXBlbmRlbmN5IGluamVjdGlvblxuICAgKi9cbiAgc3RhdGljIGFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSkge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlcXVlc3RDb250ZXh0TWlkZGxld2FyZSBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgIH1cbiAgICAgIGFwaS51c2Uob3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUpO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7XG4gICAgICBtYXhVcGxvYWRTaXplID0gJzIwbWInLFxuICAgICAgYXBwSWQsXG4gICAgICBkaXJlY3RBY2Nlc3MsXG4gICAgICBwYWdlcyxcbiAgICAgIHJhdGVMaW1pdCA9IFtdLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dEb3VibGVGb3J3YXJkU2xhc2gpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuc3RhdHVzKG9wdGlvbnMuc3RhdGUgPT09ICdvaycgPyAyMDAgOiA1MDMpO1xuICAgICAgaWYgKG9wdGlvbnMuc3RhdGUgPT09ICdzdGFydGluZycpIHtcbiAgICAgICAgcmVzLnNldCgnUmV0cnktQWZ0ZXInLCAxKTtcbiAgICAgIH1cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiBvcHRpb25zLnN0YXRlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgZXhwcmVzcy51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyXG4gICAgICAgID8gbmV3IFBhZ2VzUm91dGVyKHBhZ2VzKS5leHByZXNzUm91dGVyKClcbiAgICAgICAgOiBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoJy8nLCBuZXcgSW1wb3J0Um91dGVyKCkuZXhwcmVzc1JvdXRlcigpKTtcbiAgICBhcGkudXNlKGV4cHJlc3MuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgYXBpLnNldCgncXVlcnkgcGFyc2VyJywgJ2V4dGVuZGVkJyk7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiByb3V0ZXMpIHtcbiAgICAgIG1pZGRsZXdhcmVzLmFkZFJhdGVMaW1pdChyb3V0ZSwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uKTtcbiAgICB0aGlzLmFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucyk7XG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgKGVycjogYW55KSA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoZXJyLm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKCdBbiB1bmNhdWdodCBleGNlcHRpb24gb2NjdXJyZWQ6ICcgKyBlcnIubWVzc2FnZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnIuc3RhY2spIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKCdTdGFjayBUcmFjZTpcXG4nICsgZXJyLnN0YWNrKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3MuZW52LlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MgPT09ICcxJyB8fCBkaXJlY3RBY2Nlc3MpIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcikpO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IEdyYXBoUUxSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgICBuZXcgRXhwb3J0Um91dGVyKCksXG4gICAgICBuZXcgU2VjdXJpdHlSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cblxuICBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zdGFydCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBvbiBQYXJzZVNlcnZlci5zdGFydEFwcDogJywgZSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBsZXQgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gdW5kZWZpbmVkO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcnNlKGZzLnJlYWRGaWxlU3luYyhvcHRpb25zLmdyYXBoUUxTY2hlbWEsICd1dGY4JykpO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ29iamVjdCcgfHxcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXNvbHZlKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgY29ubmVjdGlvbnMudHJhY2soc2VydmVyKTtcblxuICAgIGlmIChvcHRpb25zLnN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIHx8IG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIgPSBhd2FpdCBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgICAgICBvcHRpb25zXG4gICAgICApO1xuICAgICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNlcnZlciAhPT0gdGhpcy5zZXJ2ZXIpIHtcbiAgICAgICAgY29ubmVjdGlvbnMudHJhY2sodGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2VydmVyKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9wdGlvbnMudHJ1c3RQcm94eSkge1xuICAgICAgYXBwLnNldCgndHJ1c3QgcHJveHknLCBvcHRpb25zLnRydXN0UHJveHkpO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgICAgaWYgKG9wdGlvbnMudmVyaWZ5U2VydmVyVXJsICE9PSBmYWxzZSkge1xuICAgICAgICBhd2FpdCBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5leHByZXNzQXBwID0gYXBwO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgUGFyc2VTZXJ2ZXIgYW5kIHN0YXJ0cyBpdC5cbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdXNlZCB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIHN0YXJ0QXBwKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IFBhcnNlU2VydmVyKG9wdGlvbnMpO1xuICAgIHJldHVybiBwYXJzZVNlcnZlci5zdGFydEFwcChvcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm9yIHRoZSBsaXZlUXVlcnlTZXJ2ZXJcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgb3B0aW9ucyBmb3IgdGhlIFBhcnNlU2VydmVyXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlTGl2ZVF1ZXJ5U2VydmVyPn0gdGhlIGxpdmUgcXVlcnkgc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgIGh0dHBTZXJ2ZXIsXG4gICAgY29uZmlnOiBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9uc1xuICApOiBQcm9taXNlPFBhcnNlTGl2ZVF1ZXJ5U2VydmVyPiB7XG4gICAgaWYgKCFodHRwU2VydmVyIHx8IChjb25maWcgJiYgY29uZmlnLnBvcnQpKSB7XG4gICAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xuICAgICAgaHR0cFNlcnZlciA9IHJlcXVpcmUoJ2h0dHAnKS5jcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgICAgIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0KTtcbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZywgb3B0aW9ucyk7XG4gICAgYXdhaXQgc2VydmVyLmNvbm5lY3QoKTtcbiAgICByZXR1cm4gc2VydmVyO1xuICB9XG5cbiAgc3RhdGljIGFzeW5jIHZlcmlmeVNlcnZlclVybCgpIHtcbiAgICAvLyBwZXJmb3JtIGEgaGVhbHRoIGNoZWNrIG9uIHRoZSBzZXJ2ZXJVUkwgdmFsdWVcbiAgICBpZiAoUGFyc2Uuc2VydmVyVVJMKSB7XG4gICAgICBjb25zdCBpc1ZhbGlkSHR0cFVybCA9IHN0cmluZyA9PiB7XG4gICAgICAgIGxldCB1cmw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdXJsID0gbmV3IFVSTChzdHJpbmcpO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09ICdodHRwOicgfHwgdXJsLnByb3RvY29sID09PSAnaHR0cHM6JztcbiAgICAgIH07XG4gICAgICBjb25zdCB1cmwgPSBgJHtQYXJzZS5zZXJ2ZXJVUkwucmVwbGFjZSgvXFwvJC8sICcnKX0vaGVhbHRoYDtcbiAgICAgIGlmICghaXNWYWxpZEh0dHBVcmwodXJsKSkge1xuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nIGFzIHRoZSBVUkwgaXMgaW52YWxpZC5gICtcbiAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL3JlcXVlc3QnKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdCh7IHVybCB9KS5jYXRjaChyZXNwb25zZSA9PiByZXNwb25zZSk7XG4gICAgICBjb25zdCBqc29uID0gcmVzcG9uc2UuZGF0YSB8fCBudWxsO1xuICAgICAgY29uc3QgcmV0cnkgPSByZXNwb25zZS5oZWFkZXJzPy5bJ3JldHJ5LWFmdGVyJ107XG4gICAgICBpZiAocmV0cnkpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHJldHJ5ICogMTAwMCkpO1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCB8fCBqc29uPy5zdGF0dXMgIT09ICdvaycpIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIGNvbnN0IFBhcnNlU2VydmVyID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcicpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUGFyc2UsICdTZXJ2ZXInLCB7XG4gICAgZ2V0KCkge1xuICAgICAgY29uc3QgY29uZiA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICByZXR1cm4geyAuLi5jb25mLCAuLi5QYXJzZVNlcnZlciB9O1xuICAgIH0sXG4gICAgc2V0KG5ld1ZhbCkge1xuICAgICAgbmV3VmFsLmFwcElkID0gUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICAgIENvbmZpZy5wdXQobmV3VmFsKTtcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgfSk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuV0FSTklORywgYXBwSWQgdGhhdCBjb250YWlucyBzcGVjaWFsIGNoYXJhY3RlcnMgY2FuIGNhdXNlIGlzc3VlcyB3aGlsZSB1c2luZyB3aXRoIHVybHMuXFxuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLCAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKV0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oeyBfVXNlcjogW10gfSwgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLCAuLi51c2VyU2Vuc2l0aXZlRmllbGRzXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn1cblxuLy8gVGhvc2UgY2FuJ3QgYmUgdGVzdGVkIGFzIGl0IHJlcXVpcmVzIGEgc3VicHJvY2Vzc1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmZ1bmN0aW9uIGNvbmZpZ3VyZUxpc3RlbmVycyhwYXJzZVNlcnZlcikge1xuICBjb25zdCBoYW5kbGVTaHV0ZG93biA9IGZ1bmN0aW9uICgpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIHBhcnNlU2VydmVyLmhhbmRsZVNodXRkb3duKCk7XG4gIH07XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBoYW5kbGVTaHV0ZG93bik7XG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIGhhbmRsZVNodXRkb3duKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQVdBLElBQUFBLFdBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFNBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUMsdUJBQUEsQ0FBQUosT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQUgsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFNLGNBQUEsR0FBQUosc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFPLGtCQUFBLEdBQUFMLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBUSxnQkFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsY0FBQSxHQUFBVCxPQUFBO0FBQ0EsSUFBQVUsZUFBQSxHQUFBVixPQUFBO0FBQ0EsSUFBQVcsWUFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksZ0JBQUEsR0FBQVosT0FBQTtBQUNBLElBQUFhLG1CQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxjQUFBLEdBQUFkLE9BQUE7QUFDQSxJQUFBZSxZQUFBLEdBQUFmLE9BQUE7QUFDQSxJQUFBZ0Isb0JBQUEsR0FBQWhCLE9BQUE7QUFDQSxJQUFBaUIsb0JBQUEs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