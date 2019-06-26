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

var _HooksRouter = require("./Routers/HooksRouter");

var _IAPValidationRouter = require("./Routers/IAPValidationRouter");

var _InstallationsRouter = require("./Routers/InstallationsRouter");

var _LogsRouter = require("./Routers/LogsRouter");

var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");

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

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// ParseServer - open-source compatible API Server for Parse apps
var batch = require('./batch'),
    bodyParser = require('body-parser'),
    express = require('express'),
    middlewares = require('./middlewares'),
    Parse = require('parse/node').Parse,
    path = require('path');

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud(); // ParseServer works like a constructor of an express app.
// The args that we understand are:
// "analyticsAdapter": an adapter class for analytics
// "filesAdapter": a class like GridFSBucketAdapter providing create, get,
//                 and delete
// "loggerAdapter": a class like WinstonLoggerAdapter providing info, error,
//                 and query
// "jsonLogs": log as structured JSON objects
// "databaseURI": a uri like mongodb://localhost:27017/dbname to tell us
//          what database this Parse API connects to.
// "cloud": relative location to cloud code to require, or a function
//          that is given an instance of Parse as a parameter.  Use this instance of Parse
//          to register your cloud code hooks and functions.
// "appId": the application id to host
// "masterKey": the master key for requests to this app
// "collectionPrefix": optional prefix for database collection names
// "fileKey": optional key from Parse dashboard for supporting older files
//            hosted by Parse
// "clientKey": optional key from Parse dashboard
// "dotNetKey": optional key from Parse dashboard
// "restAPIKey": optional key from Parse dashboard
// "webhookKey": optional key from Parse dashboard
// "javascriptKey": optional key from Parse dashboard
// "push": optional key from configure push
// "sessionLength": optional length in seconds for how long Sessions should be valid for
// "maxLimit": optional upper bound for what can be specified for the 'limit' parameter on queries

class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      cloud,
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!'),
      serverStartComplete
    } = options; // Initialize the node client SDK automatically

    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    const allControllers = controllers.getControllers(options);
    const {
      loggerController,
      databaseController,
      hooksController
    } = allControllers;
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(loggerController);
    const dbInitPromise = databaseController.performInitialization();
    const hooksLoadPromise = hooksController.load(); // Note: Tests will start to fail if any validation happens after this is called.

    Promise.all([dbInitPromise, hooksLoadPromise]).then(() => {
      if (serverStartComplete) {
        serverStartComplete();
      }
    }).catch(error => {
      if (serverStartComplete) {
        serverStartComplete(error);
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
      }
    });

    if (cloud) {
      addParseCloud();

      if (typeof cloud === 'function') {
        cloud(Parse);
      } else if (typeof cloud === 'string') {
        require(path.resolve(process.cwd(), cloud));
      } else {
        throw "argument 'cloud' must either be a string or a function";
      }
    }
  }

  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }

    return this._app;
  }

  handleShutdown() {
    const {
      adapter
    } = this.config.databaseController;

    if (adapter && typeof adapter.handleShutdown === 'function') {
      adapter.handleShutdown();
    }
  }
  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */


  static app({
    maxUploadSize = '20mb',
    appId,
    directAccess
  }) {
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express(); //api.use("/apps", express.static(__dirname + "/public"));

    api.use(middlewares.allowCrossDomain); // File handling needs to be before default middlewares are applied

    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.json({
        status: 'ok'
      });
    });
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use('/', new _ImportRouter.ImportRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors); // run the following when not testing

    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test

      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          throw err;
        }
      }); // verify the server url after a 'mount' event is received

      /* istanbul ignore next */

      api.on('mount', function () {
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
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _ExportRouter.ExportRouter()];
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
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  start(options, callback) {
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
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath
      });

      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }

      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }

    const server = app.listen(options.port, options.host, callback);
    this.server = server;

    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions);
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
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  static start(options, callback) {
    const parseServer = new ParseServer(options);
    return parseServer.start(options, callback);
  }
  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options fot he liveQueryServer
   * @returns {ParseLiveQueryServer} the live query server instance
   */


  static createLiveQueryServer(httpServer, config) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }

    return new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config);
  }

  static verifyServerUrl(callback) {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const request = require('./request');

      request({
        url: Parse.serverURL.replace(/\/$/, '') + '/health'
      }).catch(response => response).then(response => {
        const json = response.data || null;

        if (response.status !== 200 || !json || json && json.status !== 'ok') {
          /* eslint-disable no-console */
          console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
          /* eslint-enable no-console */

          if (callback) {
            callback(false);
          }
        } else {
          if (callback) {
            callback(true);
          }
        }
      });
    }
  }

}

function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');

  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!options.hasOwnProperty(key)) {
      options[key] = _defaults.default[key];
    }
  });

  if (!options.hasOwnProperty('serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  } // Backwards compatibility


  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])])); // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.

    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }

    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  } // Merge protectedFields options with defaults.


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
  options.masterKeyIps = Array.from(new Set(options.masterKeyIps.concat(_defaults.default.masterKeyIps, options.masterKeyIps)));
} // Those can't be tested as it requires a subprocess

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

var _default = ParseServer;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXRoIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsIm1hc3RlcktleSIsImNsb3VkIiwiamF2YXNjcmlwdEtleSIsInNlcnZlclVSTCIsInNlcnZlclN0YXJ0Q29tcGxldGUiLCJpbml0aWFsaXplIiwiYWxsQ29udHJvbGxlcnMiLCJjb250cm9sbGVycyIsImdldENvbnRyb2xsZXJzIiwibG9nZ2VyQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNvbmZpZyIsIkNvbmZpZyIsInB1dCIsIk9iamVjdCIsImFzc2lnbiIsImxvZ2dpbmciLCJzZXRMb2dnZXIiLCJkYkluaXRQcm9taXNlIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiaG9va3NMb2FkUHJvbWlzZSIsImxvYWQiLCJQcm9taXNlIiwiYWxsIiwidGhlbiIsImNhdGNoIiwiZXJyb3IiLCJjb25zb2xlIiwicHJvY2VzcyIsImV4aXQiLCJyZXNvbHZlIiwiY3dkIiwiYXBwIiwiX2FwcCIsImhhbmRsZVNodXRkb3duIiwiYWRhcHRlciIsIm1heFVwbG9hZFNpemUiLCJkaXJlY3RBY2Nlc3MiLCJhcGkiLCJ1c2UiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwicmVzIiwianNvbiIsInN0YXR1cyIsInVybGVuY29kZWQiLCJleHRlbmRlZCIsIlB1YmxpY0FQSVJvdXRlciIsIkltcG9ydFJvdXRlciIsInR5cGUiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJhcHBSb3V0ZXIiLCJwcm9taXNlUm91dGVyIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbnYiLCJURVNUSU5HIiwib24iLCJlcnIiLCJjb2RlIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwidmVyaWZ5U2VydmVyVXJsIiwiUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyIsIkNvcmVNYW5hZ2VyIiwic2V0UkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwiRXhwb3J0Um91dGVyIiwicm91dGVzIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydCIsImNhbGxiYWNrIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsInBhcnNlR3JhcGhRTFNlcnZlciIsIlBhcnNlR3JhcGhRTFNlcnZlciIsImdyYXBoUUxQYXRoIiwicGxheWdyb3VuZFBhdGgiLCJhcHBseUdyYXBoUUwiLCJhcHBseVBsYXlncm91bmQiLCJzZXJ2ZXIiLCJsaXN0ZW4iLCJob3N0Iiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwibGl2ZVF1ZXJ5U2VydmVyIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwicmVxdWVzdCIsInVybCIsInJlcGxhY2UiLCJyZXNwb25zZSIsImRhdGEiLCJ3YXJuIiwiUGFyc2VDbG91ZCIsIkNsb3VkIiwiZ2xvYmFsIiwia2V5cyIsImRlZmF1bHRzIiwiZm9yRWFjaCIsImtleSIsImhhc093blByb3BlcnR5IiwidXNlclNlbnNpdGl2ZUZpZWxkcyIsIkFycmF5IiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInIiLCJ1bnEiLCJtYXN0ZXJLZXlJcHMiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsImUiLCJzdGRvdXQiLCJjbG9zZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQVNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7QUF4Q0E7QUFFQSxJQUFJQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxTQUFELENBQW5CO0FBQUEsSUFDRUMsVUFBVSxHQUFHRCxPQUFPLENBQUMsYUFBRCxDQUR0QjtBQUFBLElBRUVFLE9BQU8sR0FBR0YsT0FBTyxDQUFDLFNBQUQsQ0FGbkI7QUFBQSxJQUdFRyxXQUFXLEdBQUdILE9BQU8sQ0FBQyxlQUFELENBSHZCO0FBQUEsSUFJRUksS0FBSyxHQUFHSixPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCSSxLQUpoQztBQUFBLElBS0VDLElB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O0FBQ0QsT0FGRCxDQUVFLE9BQU9DLENBQVAsRUFBVTtBQUNWO0FBQ0Q7QUFDRjtBQUNGLEdBUkQ7O0FBVUEsUUFBTXhILGNBQWMsR0FBRyxZQUFXO0FBQ2hDTixJQUFBQSxPQUFPLENBQUMrSCxNQUFSLENBQWUzRixLQUFmLENBQXFCLDZDQUFyQjtBQUNBd0YsSUFBQUEsdUJBQXVCO0FBQ3ZCM0MsSUFBQUEsTUFBTSxDQUFDK0MsS0FBUDtBQUNBdEMsSUFBQUEsV0FBVyxDQUFDcEYsY0FBWjtBQUNELEdBTEQ7O0FBTUFOLEVBQUFBLE9BQU8sQ0FBQ2dDLEVBQVIsQ0FBVyxTQUFYLEVBQXNCMUIsY0FBdEI7QUFDQU4sRUFBQUEsT0FBTyxDQUFDZ0MsRUFBUixDQUFXLFFBQVgsRUFBcUIxQixjQUFyQjtBQUNEOztlQUVjeEMsVyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFBhcnNlU2VydmVyIC0gb3Blbi1zb3VyY2UgY29tcGF0aWJsZSBBUEkgU2VydmVyIGZvciBQYXJzZSBhcHBzXG5cbnZhciBiYXRjaCA9IHJlcXVpcmUoJy4vYmF0Y2gnKSxcbiAgYm9keVBhcnNlciA9IHJlcXVpcmUoJ2JvZHktcGFyc2VyJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcblxuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zLCBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEhvb2tzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0hvb2tzUm91dGVyJztcbmltcG9ydCB7IElBUFZhbGlkYXRpb25Sb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSUFQVmFsaWRhdGlvblJvdXRlcic7XG5pbXBvcnQgeyBJbnN0YWxsYXRpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0luc3RhbGxhdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgTG9nc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Mb2dzUm91dGVyJztcbmltcG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH0gZnJvbSAnLi9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXInO1xuaW1wb3J0IHsgUHVibGljQVBJUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1YmxpY0FQSVJvdXRlcic7XG5pbXBvcnQgeyBQdXNoUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1c2hSb3V0ZXInO1xuaW1wb3J0IHsgQ2xvdWRDb2RlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Nsb3VkQ29kZVJvdXRlcic7XG5pbXBvcnQgeyBSb2xlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Sb2xlc1JvdXRlcic7XG5pbXBvcnQgeyBTY2hlbWFzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXInO1xuaW1wb3J0IHsgU2Vzc2lvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2Vzc2lvbnNSb3V0ZXInO1xuaW1wb3J0IHsgVXNlcnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IHsgUHVyZ2VSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVyZ2VSb3V0ZXInO1xuaW1wb3J0IHsgQXVkaWVuY2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlcic7XG5pbXBvcnQgeyBBZ2dyZWdhdGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQWdncmVnYXRlUm91dGVyJztcbmltcG9ydCB7IEV4cG9ydFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9FeHBvcnRSb3V0ZXInO1xuaW1wb3J0IHsgSW1wb3J0Um91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ltcG9ydFJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBQYXJzZVNlcnZlciB3b3JrcyBsaWtlIGEgY29uc3RydWN0b3Igb2YgYW4gZXhwcmVzcyBhcHAuXG4vLyBUaGUgYXJncyB0aGF0IHdlIHVuZGVyc3RhbmQgYXJlOlxuLy8gXCJhbmFseXRpY3NBZGFwdGVyXCI6IGFuIGFkYXB0ZXIgY2xhc3MgZm9yIGFuYWx5dGljc1xuLy8gXCJmaWxlc0FkYXB0ZXJcIjogYSBjbGFzcyBsaWtlIEdyaWRGU0J1Y2tldEFkYXB0ZXIgcHJvdmlkaW5nIGNyZWF0ZSwgZ2V0LFxuLy8gICAgICAgICAgICAgICAgIGFuZCBkZWxldGVcbi8vIFwibG9nZ2VyQWRhcHRlclwiOiBhIGNsYXNzIGxpa2UgV2luc3RvbkxvZ2dlckFkYXB0ZXIgcHJvdmlkaW5nIGluZm8sIGVycm9yLFxuLy8gICAgICAgICAgICAgICAgIGFuZCBxdWVyeVxuLy8gXCJqc29uTG9nc1wiOiBsb2cgYXMgc3RydWN0dXJlZCBKU09OIG9iamVjdHNcbi8vIFwiZGF0YWJhc2VVUklcIjogYSB1cmkgbGlrZSBtb25nb2RiOi8vbG9jYWxob3N0OjI3MDE3L2RibmFtZSB0byB0ZWxsIHVzXG4vLyAgICAgICAgICB3aGF0IGRhdGFiYXNlIHRoaXMgUGFyc2UgQVBJIGNvbm5lY3RzIHRvLlxuLy8gXCJjbG91ZFwiOiByZWxhdGl2ZSBsb2NhdGlvbiB0byBjbG91ZCBjb2RlIHRvIHJlcXVpcmUsIG9yIGEgZnVuY3Rpb25cbi8vICAgICAgICAgIHRoYXQgaXMgZ2l2ZW4gYW4gaW5zdGFuY2Ugb2YgUGFyc2UgYXMgYSBwYXJhbWV0ZXIuICBVc2UgdGhpcyBpbnN0YW5jZSBvZiBQYXJzZVxuLy8gICAgICAgICAgdG8gcmVnaXN0ZXIgeW91ciBjbG91ZCBjb2RlIGhvb2tzIGFuZCBmdW5jdGlvbnMuXG4vLyBcImFwcElkXCI6IHRoZSBhcHBsaWNhdGlvbiBpZCB0byBob3N0XG4vLyBcIm1hc3RlcktleVwiOiB0aGUgbWFzdGVyIGtleSBmb3IgcmVxdWVzdHMgdG8gdGhpcyBhcHBcbi8vIFwiY29sbGVjdGlvblByZWZpeFwiOiBvcHRpb25hbCBwcmVmaXggZm9yIGRhdGFiYXNlIGNvbGxlY3Rpb24gbmFtZXNcbi8vIFwiZmlsZUtleVwiOiBvcHRpb25hbCBrZXkgZnJvbSBQYXJzZSBkYXNoYm9hcmQgZm9yIHN1cHBvcnRpbmcgb2xkZXIgZmlsZXNcbi8vICAgICAgICAgICAgaG9zdGVkIGJ5IFBhcnNlXG4vLyBcImNsaWVudEtleVwiOiBvcHRpb25hbCBrZXkgZnJvbSBQYXJzZSBkYXNoYm9hcmRcbi8vIFwiZG90TmV0S2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJyZXN0QVBJS2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJ3ZWJob29rS2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJqYXZhc2NyaXB0S2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJwdXNoXCI6IG9wdGlvbmFsIGtleSBmcm9tIGNvbmZpZ3VyZSBwdXNoXG4vLyBcInNlc3Npb25MZW5ndGhcIjogb3B0aW9uYWwgbGVuZ3RoIGluIHNlY29uZHMgZm9yIGhvdyBsb25nIFNlc3Npb25zIHNob3VsZCBiZSB2YWxpZCBmb3Jcbi8vIFwibWF4TGltaXRcIjogb3B0aW9uYWwgdXBwZXIgYm91bmQgZm9yIHdoYXQgY2FuIGJlIHNwZWNpZmllZCBmb3IgdGhlICdsaW1pdCcgcGFyYW1ldGVyIG9uIHF1ZXJpZXNcblxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgY2xvdWQsXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgY29uc3Qge1xuICAgICAgbG9nZ2VyQ29udHJvbGxlcixcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIGhvb2tzQ29udHJvbGxlcixcbiAgICB9ID0gYWxsQ29udHJvbGxlcnM7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG5cbiAgICBsb2dnaW5nLnNldExvZ2dlcihsb2dnZXJDb250cm9sbGVyKTtcbiAgICBjb25zdCBkYkluaXRQcm9taXNlID0gZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgIGNvbnN0IGhvb2tzTG9hZFByb21pc2UgPSBob29rc0NvbnRyb2xsZXIubG9hZCgpO1xuXG4gICAgLy8gTm90ZTogVGVzdHMgd2lsbCBzdGFydCB0byBmYWlsIGlmIGFueSB2YWxpZGF0aW9uIGhhcHBlbnMgYWZ0ZXIgdGhpcyBpcyBjYWxsZWQuXG4gICAgUHJvbWlzZS5hbGwoW2RiSW5pdFByb21pc2UsIGhvb2tzTG9hZFByb21pc2VdKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZShlcnJvcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKGNsb3VkKSB7XG4gICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNsb3VkKFBhcnNlKTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3QgeyBhZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXI7XG4gICAgaWYgKGFkYXB0ZXIgJiYgdHlwZW9mIGFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcyB9KSB7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uKHJlcSwgcmVzKSB7XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIG5ldyBQdWJsaWNBUElSb3V0ZXIoKS5leHByZXNzUm91dGVyKClcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnLycsIG5ldyBJbXBvcnRSb3V0ZXIoKS5leHByZXNzUm91dGVyKCkpO1xuICAgIGFwaS51c2UoYm9keVBhcnNlci5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IFBhcnNlU2VydmVyLnByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KTtcbiAgICBhcGkudXNlKGFwcFJvdXRlci5leHByZXNzUm91dGVyKCkpO1xuXG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUVycm9ycyk7XG5cbiAgICAvLyBydW4gdGhlIGZvbGxvd2luZyB3aGVuIG5vdCB0ZXN0aW5nXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICAvL1RoaXMgY2F1c2VzIHRlc3RzIHRvIHNwZXcgc29tZSB1c2VsZXNzIHdhcm5pbmdzLCBzbyBkaXNhYmxlIGluIHRlc3RcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKFxuICAgICAgICAgICAgYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgYXBpLm9uKCdtb3VudCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICBwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHxcbiAgICAgIGRpcmVjdEFjY2Vzc1xuICAgICkge1xuICAgICAgUGFyc2UuQ29yZU1hbmFnZXIuc2V0UkVTVENvbnRyb2xsZXIoXG4gICAgICAgIFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcilcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBhcGk7XG4gIH1cblxuICBzdGF0aWMgcHJvbWlzZVJvdXRlcih7IGFwcElkIH0pIHtcbiAgICBjb25zdCByb3V0ZXJzID0gW1xuICAgICAgbmV3IENsYXNzZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBVc2Vyc1JvdXRlcigpLFxuICAgICAgbmV3IFNlc3Npb25zUm91dGVyKCksXG4gICAgICBuZXcgUm9sZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBbmFseXRpY3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJbnN0YWxsYXRpb25zUm91dGVyKCksXG4gICAgICBuZXcgRnVuY3Rpb25zUm91dGVyKCksXG4gICAgICBuZXcgU2NoZW1hc1JvdXRlcigpLFxuICAgICAgbmV3IFB1c2hSb3V0ZXIoKSxcbiAgICAgIG5ldyBMb2dzUm91dGVyKCksXG4gICAgICBuZXcgSUFQVmFsaWRhdGlvblJvdXRlcigpLFxuICAgICAgbmV3IEZlYXR1cmVzUm91dGVyKCksXG4gICAgICBuZXcgR2xvYmFsQ29uZmlnUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgICAgbmV3IEV4cG9ydFJvdXRlcigpLFxuICAgIF07XG5cbiAgICBjb25zdCByb3V0ZXMgPSByb3V0ZXJzLnJlZHVjZSgobWVtbywgcm91dGVyKSA9PiB7XG4gICAgICByZXR1cm4gbWVtby5jb25jYXQocm91dGVyLnJvdXRlcyk7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gbmV3IFByb21pc2VSb3V0ZXIocm91dGVzLCBhcHBJZCk7XG5cbiAgICBiYXRjaC5tb3VudE9udG8oYXBwUm91dGVyKTtcbiAgICByZXR1cm4gYXBwUm91dGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIHN0YXJ0cyB0aGUgcGFyc2Ugc2VydmVyJ3MgZXhwcmVzcyBhcHBcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdG8gdXNlIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBoYXMgc3RhcnRlZFxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgYXBwID0gZXhwcmVzcygpO1xuICAgIGlmIChvcHRpb25zLm1pZGRsZXdhcmUpIHtcbiAgICAgIGxldCBtaWRkbGV3YXJlO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLm1pZGRsZXdhcmUgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdGlvbnMubWlkZGxld2FyZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IG9wdGlvbnMubWlkZGxld2FyZTsgLy8gdXNlIGFzLWlzIGxldCBleHByZXNzIGZhaWxcbiAgICAgIH1cbiAgICAgIGFwcC51c2UobWlkZGxld2FyZSk7XG4gICAgfVxuXG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyID0gYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgY2FsbGJhY2spO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0KG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm90IGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VMaXZlUXVlcnlTZXJ2ZXJ9IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZyk7XG4gIH1cblxuICBzdGF0aWMgdmVyaWZ5U2VydmVyVXJsKGNhbGxiYWNrKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgcmVxdWVzdCh7IHVybDogUGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJykgKyAnL2hlYWx0aCcgfSlcbiAgICAgICAgLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXNwb25zZS5zdGF0dXMgIT09IDIwMCB8fFxuICAgICAgICAgICAgIWpzb24gfHxcbiAgICAgICAgICAgIChqc29uICYmIGpzb24uc3RhdHVzICE9PSAnb2snKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScuYCArXG4gICAgICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayhmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFvcHRpb25zLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV07XG4gICAgfVxuICB9KTtcblxuICBpZiAoIW9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ3NlcnZlclVSTCcpKSB7XG4gICAgb3B0aW9ucy5zZXJ2ZXJVUkwgPSBgaHR0cDovL2xvY2FsaG9zdDoke29wdGlvbnMucG9ydH0ke29wdGlvbnMubW91bnRQYXRofWA7XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbXG4gICAgICAgIC4uLihkZWZhdWx0cy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSxcbiAgICAgICAgLi4uKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSksXG4gICAgICBdKVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgaXMgdW5zZXQsXG4gICAgLy8gaXQnbGwgYmUgYXNzaWduZWQgdGhlIGRlZmF1bHQgYWJvdmUuXG4gICAgLy8gSGVyZSwgcHJvdGVjdCBhZ2FpbnN0IHRoZSBjYXNlIHdoZXJlIHByb3RlY3RlZEZpZWxkc1xuICAgIC8vIGlzIHNldCwgYnV0IGRvZXNuJ3QgaGF2ZSBfVXNlci5cbiAgICBpZiAoISgnX1VzZXInIGluIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgPSBPYmplY3QuYXNzaWduKFxuICAgICAgICB7IF9Vc2VyOiBbXSB9LFxuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoW1xuICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSB8fCBbXSksXG4gICAgICAgIC4uLnVzZXJTZW5zaXRpdmVGaWVsZHMsXG4gICAgICBdKVxuICAgICk7XG4gIH1cblxuICAvLyBNZXJnZSBwcm90ZWN0ZWRGaWVsZHMgb3B0aW9ucyB3aXRoIGRlZmF1bHRzLlxuICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHMpLmZvckVhY2goYyA9PiB7XG4gICAgY29uc3QgY3VyID0gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgaWYgKCFjdXIpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdID0gZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIH0gZWxzZSB7XG4gICAgICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY10pLmZvckVhY2gociA9PiB7XG4gICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSB8fCBbXSksXG4gICAgICAgICAgLi4uZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdW3JdLFxuICAgICAgICBdKTtcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIG9wdGlvbnMubWFzdGVyS2V5SXBzID0gQXJyYXkuZnJvbShcbiAgICBuZXcgU2V0KFxuICAgICAgb3B0aW9ucy5tYXN0ZXJLZXlJcHMuY29uY2F0KGRlZmF1bHRzLm1hc3RlcktleUlwcywgb3B0aW9ucy5tYXN0ZXJLZXlJcHMpXG4gICAgKVxuICApO1xufVxuXG4vLyBUaG9zZSBjYW4ndCBiZSB0ZXN0ZWQgYXMgaXQgcmVxdWlyZXMgYSBzdWJwcm9jZXNzXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuZnVuY3Rpb24gY29uZmlndXJlTGlzdGVuZXJzKHBhcnNlU2VydmVyKSB7XG4gIGNvbnN0IHNlcnZlciA9IHBhcnNlU2VydmVyLnNlcnZlcjtcbiAgY29uc3Qgc29ja2V0cyA9IHt9O1xuICAvKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC4gKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAgVGhpcyBmdW5jdGlvbiwgYWxvbmcgd2l0aCBgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKWAsIGludGVuZCB0byBmaXggdGhpcyBiZWhhdmlvciBzdWNoIHRoYXQgcGFyc2Ugc2VydmVyIHdpbGwgY2xvc2UgYWxsIG9wZW4gY29ubmVjdGlvbnMgYW5kIGluaXRpYXRlIHRoZSBzaHV0ZG93biBwcm9jZXNzIGFzIHNvb24gYXMgaXQgcmVjZWl2ZXMgYSBTSUdJTlQvU0lHVEVSTSBzaWduYWwuICovXG4gIHNlcnZlci5vbignY29ubmVjdGlvbicsIHNvY2tldCA9PiB7XG4gICAgY29uc3Qgc29ja2V0SWQgPSBzb2NrZXQucmVtb3RlQWRkcmVzcyArICc6JyArIHNvY2tldC5yZW1vdGVQb3J0O1xuICAgIHNvY2tldHNbc29ja2V0SWRdID0gc29ja2V0O1xuICAgIHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBkZWxldGUgc29ja2V0c1tzb2NrZXRJZF07XG4gICAgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zID0gZnVuY3Rpb24oKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24oKSB7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1Rlcm1pbmF0aW9uIHNpZ25hbCByZWNlaXZlZC4gU2h1dHRpbmcgZG93bi4nKTtcbiAgICBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpO1xuICAgIHNlcnZlci5jbG9zZSgpO1xuICAgIHBhcnNlU2VydmVyLmhhbmRsZVNodXRkb3duKCk7XG4gIH07XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBoYW5kbGVTaHV0ZG93bik7XG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIGhhbmRsZVNodXRkb3duKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG4iXX0=