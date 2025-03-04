"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Options = require("./Options");
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
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
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
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      var _cacheController$adap;
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
      const startupPromises = [];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if ((_cacheController$adap = cacheController.adapter) !== null && _cacheController$adap !== void 0 && _cacheController$adap.connect && typeof cacheController.adapter.connect === 'function') {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          var _json;
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || ((_json = json) === null || _json === void 0 ? void 0 : _json.type) === 'module') {
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
      this.config = _objectSpread(_objectSpread({}, this.config), pushController);
      _Config.default.put(this.config);
      return this;
    } catch (error) {
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
  handleShutdown() {
    var _this$liveQueryServer;
    const promises = [];
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
    if ((_this$liveQueryServer = this.liveQueryServer) !== null && _this$liveQueryServer !== void 0 && (_this$liveQueryServer = _this$liveQueryServer.server) !== null && _this$liveQueryServer !== void 0 && _this$liveQueryServer.close) {
      promises.push(new Promise(resolve => this.liveQueryServer.server.close(resolve)));
    }
    if (this.liveQueryServer) {
      promises.push(this.liveQueryServer.shutdown());
    }
    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
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
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use('/', new _ImportRouter.ImportRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
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
      // verify the server url after a 'mount' event is received
      /* istanbul ignore next */
      api.on('mount', async function () {
        await new Promise(resolve => setTimeout(resolve, 1000));
        ParseServer.verifyServerUrl();
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
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
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
      var _response$headers;
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
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = (_response$headers = response.headers) === null || _response$headers === void 0 ? void 0 : _response$headers['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || (json === null || json === void 0 ? void 0 : json.status) !== 'ok') {
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
      return _objectSpread(_objectSpread({}, conf), ParseServer);
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
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */
  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });
  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = exports.default = ParseServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfT3B0aW9ucyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX0V4cG9ydFJvdXRlciIsIl9JbXBvcnRSb3V0ZXIiLCJfUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsImNvbnRyb2xsZXJzIiwiX1BhcnNlR3JhcGhRTFNlcnZlciIsIl9TZWN1cml0eVJvdXRlciIsIl9DaGVja1J1bm5lciIsIl9EZXByZWNhdG9yIiwiX0RlZmluZWRTY2hlbWFzIiwiX0RlZmluaXRpb25zIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwiZSIsIldlYWtNYXAiLCJyIiwidCIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiaGFzIiwiZ2V0IiwibiIsIl9fcHJvdG9fXyIsImEiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsInUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpIiwic2V0Iiwib3duS2V5cyIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJfdG9Qcm9wZXJ0eUtleSIsInZhbHVlIiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsImJhdGNoIiwiYm9keVBhcnNlciIsImV4cHJlc3MiLCJtaWRkbGV3YXJlcyIsIlBhcnNlIiwicGFyc2UiLCJwYXRoIiwiZnMiLCJhZGRQYXJzZUNsb3VkIiwiUGFyc2VTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJEZXByZWNhdG9yIiwic2NhblBhcnNlU2VydmVyT3B0aW9ucyIsImludGVyZmFjZXMiLCJKU09OIiwic3RyaW5naWZ5IiwiT3B0aW9uc0RlZmluaXRpb25zIiwiZ2V0VmFsaWRPYmplY3QiLCJyb290IiwicmVzdWx0Iiwia2V5IiwicHJvdG90eXBlIiwidHlwZSIsImVuZHNXaXRoIiwic2xpY2UiLCJvcHRpb25zQmx1ZXByaW50IiwidmFsaWRhdGVLZXlOYW1lcyIsIm9yaWdpbmFsIiwicmVmIiwibmFtZSIsInByZWZpeCIsInJlcyIsIkFycmF5IiwiaXNBcnJheSIsIml0ZW0iLCJpZHgiLCJjb25jYXQiLCJkaWZmIiwibG9nZ2VyIiwiZXJyb3IiLCJqb2luIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsInJlcXVpcmVkUGFyYW1ldGVyIiwibWFzdGVyS2V5IiwiamF2YXNjcmlwdEtleSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJDb25maWciLCJ2YWxpZGF0ZU9wdGlvbnMiLCJhbGxDb250cm9sbGVycyIsImdldENvbnRyb2xsZXJzIiwic3RhdGUiLCJjb25maWciLCJwdXQiLCJhc3NpZ24iLCJtYXN0ZXJLZXlJcHNTdG9yZSIsIk1hcCIsIm1haW50ZW5hbmNlS2V5SXBzU3RvcmUiLCJzZXRMb2dnZXIiLCJsb2dnZXJDb250cm9sbGVyIiwic3RhcnQiLCJfY2FjaGVDb250cm9sbGVyJGFkYXAiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJjbG91ZCIsInNlY3VyaXR5Iiwic2NoZW1hIiwibGl2ZVF1ZXJ5Q29udHJvbGxlciIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsImNvZGUiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInB1c2hDb250cm9sbGVyIiwiZ2V0UHVzaENvbnRyb2xsZXIiLCJsb2FkIiwic3RhcnR1cFByb21pc2VzIiwiRGVmaW5lZFNjaGVtYXMiLCJleGVjdXRlIiwiYWRhcHRlciIsImNvbm5lY3QiLCJQcm9taXNlIiwiYWxsIiwicmVzb2x2ZSIsIl9qc29uIiwianNvbiIsInByb2Nlc3MiLCJlbnYiLCJucG1fcGFja2FnZV9qc29uIiwibnBtX3BhY2thZ2VfdHlwZSIsImN3ZCIsInNldFRpbWVvdXQiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiQ2hlY2tSdW5uZXIiLCJydW4iLCJjb25zb2xlIiwiYXBwIiwiX2FwcCIsImhhbmRsZVNodXRkb3duIiwiX3RoaXMkbGl2ZVF1ZXJ5U2VydmVyIiwicHJvbWlzZXMiLCJkYXRhYmFzZUFkYXB0ZXIiLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQWRhcHRlciIsImxpdmVRdWVyeVNlcnZlciIsInNlcnZlciIsImNsb3NlIiwic2h1dGRvd24iLCJ0aGVuIiwic2VydmVyQ2xvc2VDb21wbGV0ZSIsIm1heFVwbG9hZFNpemUiLCJkaXJlY3RBY2Nlc3MiLCJwYWdlcyIsInJhdGVMaW1pdCIsImFwaSIsInVzZSIsImFsbG93Q3Jvc3NEb21haW4iLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsIkltcG9ydFJvdXRlciIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsInJvdXRlcyIsInJvdXRlIiwiYWRkUmF0ZUxpbWl0IiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiVEVTVElORyIsIm9uIiwiZXJyIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwiZXhpdCIsIm1lc3NhZ2UiLCJzdGFjayIsInZlcmlmeVNlcnZlclVybCIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIkdyYXBoUUxSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwiRXhwb3J0Um91dGVyIiwiU2VjdXJpdHlSb3V0ZXIiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0QXBwIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwibGlzdGVuIiwiaG9zdCIsInN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIiwibGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsInRydXN0UHJveHkiLCJjb25maWd1cmVMaXN0ZW5lcnMiLCJleHByZXNzQXBwIiwicGFyc2VTZXJ2ZXIiLCJodHRwU2VydmVyIiwiY3JlYXRlU2VydmVyIiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJfcmVzcG9uc2UkaGVhZGVycyIsImlzVmFsaWRIdHRwVXJsIiwic3RyaW5nIiwidXJsIiwiVVJMIiwiXyIsInByb3RvY29sIiwicmVwbGFjZSIsIndhcm4iLCJyZXF1ZXN0IiwicmVzcG9uc2UiLCJjYXRjaCIsImRhdGEiLCJyZXRyeSIsImhlYWRlcnMiLCJQYXJzZUNsb3VkIiwiY29uZiIsImFwcGxpY2F0aW9uSWQiLCJuZXdWYWwiLCJDbG91ZCIsImdsb2JhbCIsImRlZmF1bHRzIiwicmVnZXgiLCJtYXRjaCIsInVzZXJTZW5zaXRpdmVGaWVsZHMiLCJmcm9tIiwiU2V0IiwicHJvdGVjdGVkRmllbGRzIiwiX1VzZXIiLCJjIiwiY3VyIiwidW5xIiwic29ja2V0cyIsInNvY2tldCIsInNvY2tldElkIiwicmVtb3RlQWRkcmVzcyIsInJlbW90ZVBvcnQiLCJkZXN0cm95QWxpdmVDb25uZWN0aW9ucyIsImRlc3Ryb3kiLCJzdGRvdXQiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvUGFyc2VTZXJ2ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gUGFyc2VTZXJ2ZXIgLSBvcGVuLXNvdXJjZSBjb21wYXRpYmxlIEFQSSBTZXJ2ZXIgZm9yIFBhcnNlIGFwcHNcblxudmFyIGJhdGNoID0gcmVxdWlyZSgnLi9iYXRjaCcpLFxuICBib2R5UGFyc2VyID0gcmVxdWlyZSgnYm9keS1wYXJzZXInKSxcbiAgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKSxcbiAgbWlkZGxld2FyZXMgPSByZXF1aXJlKCcuL21pZGRsZXdhcmVzJyksXG4gIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICB7IHBhcnNlIH0gPSByZXF1aXJlKCdncmFwaHFsJyksXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gIGZzID0gcmVxdWlyZSgnZnMnKTtcblxuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zLCBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEdyYXBoUUxSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR3JhcGhRTFJvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFBhZ2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1BhZ2VzUm91dGVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBFeHBvcnRSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRXhwb3J0Um91dGVyJztcbmltcG9ydCB7IEltcG9ydFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbXBvcnRSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuaW1wb3J0IE9wdGlvbnNEZWZpbml0aW9ucyBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRlZCBQYXJzZSBTZXJ2ZXIgb3B0aW9uc1xuICAgIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKTtcblxuICAgIGNvbnN0IGludGVyZmFjZXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KE9wdGlvbnNEZWZpbml0aW9ucykpO1xuXG4gICAgZnVuY3Rpb24gZ2V0VmFsaWRPYmplY3Qocm9vdCkge1xuICAgICAgY29uc3QgcmVzdWx0ID0ge307XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiByb290KSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocm9vdFtrZXldLCAndHlwZScpKSB7XG4gICAgICAgICAgaWYgKHJvb3Rba2V5XS50eXBlLmVuZHNXaXRoKCdbXScpKSB7XG4gICAgICAgICAgICByZXN1bHRba2V5XSA9IFtnZXRWYWxpZE9iamVjdChpbnRlcmZhY2VzW3Jvb3Rba2V5XS50eXBlLnNsaWNlKDAsIC0yKV0pXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBnZXRWYWxpZE9iamVjdChpbnRlcmZhY2VzW3Jvb3Rba2V5XS50eXBlXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gJyc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgY29uc3Qgb3B0aW9uc0JsdWVwcmludCA9IGdldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbJ1BhcnNlU2VydmVyT3B0aW9ucyddKTtcblxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlS2V5TmFtZXMob3JpZ2luYWwsIHJlZiwgbmFtZSA9ICcnKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gW107XG4gICAgICBjb25zdCBwcmVmaXggPSBuYW1lICsgKG5hbWUgIT09ICcnID8gJy4nIDogJycpO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gb3JpZ2luYWwpIHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVmLCBrZXkpKSB7XG4gICAgICAgICAgcmVzdWx0LnB1c2gocHJlZml4ICsga2V5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAocmVmW2tleV0gPT09ICcnKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgbGV0IHJlcyA9IFtdO1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KG9yaWdpbmFsW2tleV0pICYmIEFycmF5LmlzQXJyYXkocmVmW2tleV0pKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gcmVmW2tleV1bMF07XG4gICAgICAgICAgICBvcmlnaW5hbFtrZXldLmZvckVhY2goKGl0ZW0sIGlkeCkgPT4ge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIGl0ZW0gIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMuY29uY2F0KHZhbGlkYXRlS2V5TmFtZXMoaXRlbSwgdHlwZSwgcHJlZml4ICsga2V5ICsgYFske2lkeH1dYCkpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcmlnaW5hbFtrZXldID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgcmVmW2tleV0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICByZXMgPSB2YWxpZGF0ZUtleU5hbWVzKG9yaWdpbmFsW2tleV0sIHJlZltrZXldLCBwcmVmaXggKyBrZXkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHJlcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgY29uc3QgZGlmZiA9IHZhbGlkYXRlS2V5TmFtZXMob3B0aW9ucywgb3B0aW9uc0JsdWVwcmludCk7XG4gICAgaWYgKGRpZmYubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbG9nZ2VyID0gbG9nZ2luZy5sb2dnZXI7XG4gICAgICBsb2dnZXIuZXJyb3IoYEludmFsaWQga2V5KHMpIGZvdW5kIGluIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uOiAke2RpZmYuam9pbignLCAnKX1gKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgQ29uZmlnLnZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgb3B0aW9ucy5zdGF0ZSA9ICdpbml0aWFsaXplZCc7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG4gICAgdGhpcy5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICBsb2dnaW5nLnNldExvZ2dlcihhbGxDb250cm9sbGVycy5sb2dnZXJDb250cm9sbGVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgUGFyc2UgU2VydmVyIGFzIGFuIGV4cHJlc3MgYXBwOyB0aGlzIHByb21pc2UgcmVzb2x2ZXMgd2hlbiBQYXJzZSBTZXJ2ZXIgaXMgcmVhZHkgdG8gYWNjZXB0IHJlcXVlc3RzLlxuICAgKi9cblxuICBhc3luYyBzdGFydCgpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnN0YXRlID09PSAnb2snKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnc3RhcnRpbmcnO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgIGNsb3VkLFxuICAgICAgICBzZWN1cml0eSxcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBsaXZlUXVlcnlDb250cm9sbGVyLFxuICAgICAgfSA9IHRoaXMuY29uZmlnO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZS5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBwdXNoQ29udHJvbGxlciA9IGF3YWl0IGNvbnRyb2xsZXJzLmdldFB1c2hDb250cm9sbGVyKHRoaXMuY29uZmlnKTtcbiAgICAgIGF3YWl0IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG4gICAgICBjb25zdCBzdGFydHVwUHJvbWlzZXMgPSBbXTtcbiAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobmV3IERlZmluZWRTY2hlbWFzKHNjaGVtYSwgdGhpcy5jb25maWcpLmV4ZWN1dGUoKSk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIGNhY2hlQ29udHJvbGxlci5hZGFwdGVyPy5jb25uZWN0ICYmXG4gICAgICAgIHR5cGVvZiBjYWNoZUNvbnRyb2xsZXIuYWRhcHRlci5jb25uZWN0ID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2goY2FjaGVDb250cm9sbGVyLmFkYXB0ZXIuY29ubmVjdCgpKTtcbiAgICAgIH1cbiAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGxpdmVRdWVyeUNvbnRyb2xsZXIuY29ubmVjdCgpKTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHN0YXJ0dXBQcm9taXNlcyk7XG4gICAgICBpZiAoY2xvdWQpIHtcbiAgICAgICAgYWRkUGFyc2VDbG91ZCgpO1xuICAgICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGNsb3VkKFBhcnNlKSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGxldCBqc29uO1xuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKSB7XG4gICAgICAgICAgICBqc29uID0gcmVxdWlyZShwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX3R5cGUgPT09ICdtb2R1bGUnIHx8IGpzb24/LnR5cGUgPT09ICdtb2R1bGUnKSB7XG4gICAgICAgICAgICBhd2FpdCBpbXBvcnQocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IFwiYXJndW1lbnQgJ2Nsb3VkJyBtdXN0IGVpdGhlciBiZSBhIHN0cmluZyBvciBhIGZ1bmN0aW9uXCI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG4gICAgICB9XG4gICAgICBpZiAoc2VjdXJpdHkgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgICAgbmV3IENoZWNrUnVubmVyKHNlY3VyaXR5KS5ydW4oKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ29rJztcbiAgICAgIHRoaXMuY29uZmlnID0geyAuLi50aGlzLmNvbmZpZywgLi4ucHVzaENvbnRyb2xsZXIgfTtcbiAgICAgIENvbmZpZy5wdXQodGhpcy5jb25maWcpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnZXJyb3InO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXI/LnNlcnZlcj8uY2xvc2UpIHtcbiAgICAgIHByb21pc2VzLnB1c2gobmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLmxpdmVRdWVyeVNlcnZlci5zZXJ2ZXIuY2xvc2UocmVzb2x2ZSkpKTtcbiAgICB9XG4gICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNodXRkb3duKCkpO1xuICAgIH1cbiAgICByZXR1cm4gKHByb21pc2VzLmxlbmd0aCA+IDAgPyBQcm9taXNlLmFsbChwcm9taXNlcykgOiBQcm9taXNlLnJlc29sdmUoKSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IG1heFVwbG9hZFNpemUgPSAnMjBtYicsIGFwcElkLCBkaXJlY3RBY2Nlc3MsIHBhZ2VzLCByYXRlTGltaXQgPSBbXSB9ID0gb3B0aW9ucztcbiAgICAvLyBUaGlzIGFwcCBzZXJ2ZXMgdGhlIFBhcnNlIEFQSSBkaXJlY3RseS5cbiAgICAvLyBJdCdzIHRoZSBlcXVpdmFsZW50IG9mIGh0dHBzOi8vYXBpLnBhcnNlLmNvbS8xIGluIHRoZSBob3N0ZWQgUGFyc2UgQVBJLlxuICAgIHZhciBhcGkgPSBleHByZXNzKCk7XG4gICAgLy9hcGkudXNlKFwiL2FwcHNcIiwgZXhwcmVzcy5zdGF0aWMoX19kaXJuYW1lICsgXCIvcHVibGljXCIpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93Q3Jvc3NEb21haW4oYXBwSWQpKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uIChyZXEsIHJlcykge1xuICAgICAgcmVzLnN0YXR1cyhvcHRpb25zLnN0YXRlID09PSAnb2snID8gMjAwIDogNTAzKTtcbiAgICAgIGlmIChvcHRpb25zLnN0YXRlID09PSAnc3RhcnRpbmcnKSB7XG4gICAgICAgIHJlcy5zZXQoJ1JldHJ5LUFmdGVyJywgMSk7XG4gICAgICB9XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogb3B0aW9ucy5zdGF0ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlclxuICAgICAgICA/IG5ldyBQYWdlc1JvdXRlcihwYWdlcykuZXhwcmVzc1JvdXRlcigpXG4gICAgICAgIDogbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvJywgbmV3IEltcG9ydFJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKSk7XG4gICAgYXBpLnVzZShib2R5UGFyc2VyLmpzb24oeyB0eXBlOiAnKi8qJywgbGltaXQ6IG1heFVwbG9hZFNpemUgfSkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dNZXRob2RPdmVycmlkZSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMpO1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygcm91dGVzKSB7XG4gICAgICBtaWRkbGV3YXJlcy5hZGRSYXRlTGltaXQocm91dGUsIG9wdGlvbnMpO1xuICAgIH1cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbik7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgIC8vIHVzZXItZnJpZW5kbHkgbWVzc2FnZSBmb3IgdGhpcyBjb21tb24gZXJyb3JcbiAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgVW5hYmxlIHRvIGxpc3RlbiBvbiBwb3J0ICR7ZXJyLnBvcnR9LiBUaGUgcG9ydCBpcyBhbHJlYWR5IGluIHVzZS5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGVyci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnQW4gdW5jYXVnaHQgZXhjZXB0aW9uIG9jY3VycmVkOiAnICsgZXJyLm1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyLnN0YWNrKSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnU3RhY2sgVHJhY2U6XFxuJyArIGVyci5zdGFjayk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgYXBpLm9uKCdtb3VudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMDApKTtcbiAgICAgICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3MuZW52LlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MgPT09ICcxJyB8fCBkaXJlY3RBY2Nlc3MpIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcikpO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IEdyYXBoUUxSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgICBuZXcgRXhwb3J0Um91dGVyKCksXG4gICAgICBuZXcgU2VjdXJpdHlSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cblxuICBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zdGFydCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG9uIFBhcnNlU2VydmVyLnN0YXJ0QXBwOiAnLCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gb3B0aW9ucy5ncmFwaFFMU2NoZW1hO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlc29sdmUodGhpcyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcblxuICAgIGlmIChvcHRpb25zLnN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIHx8IG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIgPSBhd2FpdCBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgICAgICBvcHRpb25zXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy50cnVzdFByb3h5KSB7XG4gICAgICBhcHAuc2V0KCd0cnVzdCBwcm94eScsIG9wdGlvbnMudHJ1c3RQcm94eSk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gcGFyc2VTZXJ2ZXIuc3RhcnRBcHAob3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvciB0aGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIG9wdGlvbnMgZm9yIHRoZSBQYXJzZVNlcnZlclxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUxpdmVRdWVyeVNlcnZlcj59IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICBodHRwU2VydmVyLFxuICAgIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnNcbiAgKSB7XG4gICAgaWYgKCFodHRwU2VydmVyIHx8IChjb25maWcgJiYgY29uZmlnLnBvcnQpKSB7XG4gICAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xuICAgICAgaHR0cFNlcnZlciA9IHJlcXVpcmUoJ2h0dHAnKS5jcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgICAgIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0KTtcbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZywgb3B0aW9ucyk7XG4gICAgYXdhaXQgc2VydmVyLmNvbm5lY3QoKTtcbiAgICByZXR1cm4gc2VydmVyO1xuICB9XG5cbiAgc3RhdGljIGFzeW5jIHZlcmlmeVNlcnZlclVybCgpIHtcbiAgICAvLyBwZXJmb3JtIGEgaGVhbHRoIGNoZWNrIG9uIHRoZSBzZXJ2ZXJVUkwgdmFsdWVcbiAgICBpZiAoUGFyc2Uuc2VydmVyVVJMKSB7XG4gICAgICBjb25zdCBpc1ZhbGlkSHR0cFVybCA9IHN0cmluZyA9PiB7XG4gICAgICAgIGxldCB1cmw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdXJsID0gbmV3IFVSTChzdHJpbmcpO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09ICdodHRwOicgfHwgdXJsLnByb3RvY29sID09PSAnaHR0cHM6JztcbiAgICAgIH07XG4gICAgICBjb25zdCB1cmwgPSBgJHtQYXJzZS5zZXJ2ZXJVUkwucmVwbGFjZSgvXFwvJC8sICcnKX0vaGVhbHRoYDtcbiAgICAgIGlmICghaXNWYWxpZEh0dHBVcmwodXJsKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nIGFzIHRoZSBVUkwgaXMgaW52YWxpZC5gICtcbiAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL3JlcXVlc3QnKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdCh7IHVybCB9KS5jYXRjaChyZXNwb25zZSA9PiByZXNwb25zZSk7XG4gICAgICBjb25zdCBqc29uID0gcmVzcG9uc2UuZGF0YSB8fCBudWxsO1xuICAgICAgY29uc3QgcmV0cnkgPSByZXNwb25zZS5oZWFkZXJzPy5bJ3JldHJ5LWFmdGVyJ107XG4gICAgICBpZiAocmV0cnkpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHJldHJ5ICogMTAwMCkpO1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCB8fCBqc29uPy5zdGF0dXMgIT09ICdvaycpIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIGNvbnN0IFBhcnNlU2VydmVyID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcicpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUGFyc2UsICdTZXJ2ZXInLCB7XG4gICAgZ2V0KCkge1xuICAgICAgY29uc3QgY29uZiA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICByZXR1cm4geyAuLi5jb25mLCAuLi5QYXJzZVNlcnZlciB9O1xuICAgIH0sXG4gICAgc2V0KG5ld1ZhbCkge1xuICAgICAgbmV3VmFsLmFwcElkID0gUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICAgIENvbmZpZy5wdXQobmV3VmFsKTtcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgfSk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5XQVJOSU5HLCBhcHBJZCB0aGF0IGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycyBjYW4gY2F1c2UgaXNzdWVzIHdoaWxlIHVzaW5nIHdpdGggdXJscy5cXG5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4oZGVmYXVsdHMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSksIC4uLihvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pXSlcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzIGlzIHVuc2V0LFxuICAgIC8vIGl0J2xsIGJlIGFzc2lnbmVkIHRoZSBkZWZhdWx0IGFib3ZlLlxuICAgIC8vIEhlcmUsIHByb3RlY3QgYWdhaW5zdCB0aGUgY2FzZSB3aGVyZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAvLyBpcyBzZXQsIGJ1dCBkb2Vzbid0IGhhdmUgX1VzZXIuXG4gICAgaWYgKCEoJ19Vc2VyJyBpbiBvcHRpb25zLnByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzID0gT2JqZWN0LmFzc2lnbih7IF9Vc2VyOiBbXSB9LCBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgfVxuXG4gICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSB8fCBbXSksIC4uLnVzZXJTZW5zaXRpdmVGaWVsZHNdKVxuICAgICk7XG4gIH1cblxuICAvLyBNZXJnZSBwcm90ZWN0ZWRGaWVsZHMgb3B0aW9ucyB3aXRoIGRlZmF1bHRzLlxuICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHMpLmZvckVhY2goYyA9PiB7XG4gICAgY29uc3QgY3VyID0gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgaWYgKCFjdXIpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdID0gZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIH0gZWxzZSB7XG4gICAgICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY10pLmZvckVhY2gociA9PiB7XG4gICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSB8fCBbXSksXG4gICAgICAgICAgLi4uZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdW3JdLFxuICAgICAgICBdKTtcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xufVxuXG4vLyBUaG9zZSBjYW4ndCBiZSB0ZXN0ZWQgYXMgaXQgcmVxdWlyZXMgYSBzdWJwcm9jZXNzXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuZnVuY3Rpb24gY29uZmlndXJlTGlzdGVuZXJzKHBhcnNlU2VydmVyKSB7XG4gIGNvbnN0IHNlcnZlciA9IHBhcnNlU2VydmVyLnNlcnZlcjtcbiAgY29uc3Qgc29ja2V0cyA9IHt9O1xuICAvKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC4gKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAgVGhpcyBmdW5jdGlvbiwgYWxvbmcgd2l0aCBgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKWAsIGludGVuZCB0byBmaXggdGhpcyBiZWhhdmlvciBzdWNoIHRoYXQgcGFyc2Ugc2VydmVyIHdpbGwgY2xvc2UgYWxsIG9wZW4gY29ubmVjdGlvbnMgYW5kIGluaXRpYXRlIHRoZSBzaHV0ZG93biBwcm9jZXNzIGFzIHNvb24gYXMgaXQgcmVjZWl2ZXMgYSBTSUdJTlQvU0lHVEVSTSBzaWduYWwuICovXG4gIHNlcnZlci5vbignY29ubmVjdGlvbicsIHNvY2tldCA9PiB7XG4gICAgY29uc3Qgc29ja2V0SWQgPSBzb2NrZXQucmVtb3RlQWRkcmVzcyArICc6JyArIHNvY2tldC5yZW1vdGVQb3J0O1xuICAgIHNvY2tldHNbc29ja2V0SWRdID0gc29ja2V0O1xuICAgIHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBkZWxldGUgc29ja2V0c1tzb2NrZXRJZF07XG4gICAgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zID0gZnVuY3Rpb24gKCkge1xuICAgIGZvciAoY29uc3Qgc29ja2V0SWQgaW4gc29ja2V0cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc29ja2V0c1tzb2NrZXRJZF0uZGVzdHJveSgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvKiAqL1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBjb25zdCBoYW5kbGVTaHV0ZG93biA9IGZ1bmN0aW9uICgpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKCk7XG4gICAgc2VydmVyLmNsb3NlKCk7XG4gICAgcGFyc2VTZXJ2ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgfTtcbiAgcHJvY2Vzcy5vbignU0lHVEVSTScsIGhhbmRsZVNodXRkb3duKTtcbiAgcHJvY2Vzcy5vbignU0lHSU5UJywgaGFuZGxlU2h1dGRvd24pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBV0EsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsT0FBQSxHQUFBQyx1QkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sY0FBQSxHQUFBSixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU8sa0JBQUEsR0FBQUwsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFRLGdCQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxjQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxlQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxZQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxnQkFBQSxHQUFBWixPQUFBO0FBQ0EsSUFBQWEsbUJBQUEsR0FBQWIsT0FBQTtBQUNBLElBQUFjLGNBQUEsR0FBQWQsT0FBQTtBQUNBLElBQUFlLFlBQUEsR0FBQWYsT0FBQTtBQUNBLElBQUFnQixvQkFBQSxHQUFBaEIsT0FBQTtBQUNBLElBQUFpQixvQkFBQSxHQUFBakIsT0FBQTtBQUNBLElBQUFrQixXQUFBLEdBQUFsQixPQUFBO0FBQ0EsSUFBQW1CLHFCQUFBLEdBQUFuQixPQUFBO0FBQ0EsSUFBQW9CLFlBQUEsR0FBQXBCLE9BQUE7QUFDQSxJQUFBcUIsZ0JBQUEsR0FBQXJCLE9BQUE7QUFDQSxJQUFBc0IsV0FBQSxHQUFBdEIsT0FBQTtBQUNBLElBQUF1QixnQkFBQSxHQUFBdkIsT0FBQTtBQUNBLElBQUF3QixZQUFBLEdBQUF4QixPQUFBO0FBQ0EsSUFBQXlCLGNBQUEsR0FBQXpCLE9BQUE7QUFDQSxJQUFBMEIsZUFBQSxHQUFBMUIsT0FBQTtBQUNBLElBQUEyQixZQUFBLEdBQUEz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