"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLServer = void 0;

var _cors = _interopRequireDefault(require("cors"));

var _node = require("@graphql-yoga/node");

var _graphql = require("graphql");

var _subscriptionsTransportWs = require("subscriptions-transport-ws");

var _middlewares = require("../middlewares");

var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));

var _logger = _interopRequireDefault(require("../logger"));

var _ParseGraphQLSchema = require("./ParseGraphQLSchema");

var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
        context: ({
          req: {
            info,
            config,
            auth
          }
        }) => ({
          info,
          config,
          auth
        }),
        maskedErrors: false,
        multipart: {
          fileSize: this._transformMaxUploadSizeToBytes(this.parseServer.config.maxUploadSize || '20mb')
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

    const options = await this._getGraphQLOptions();
    this._server = (0, _node.createServer)(options);
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

  applyGraphQL(app) {
    if (!app || !app.use) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }

    app.use(this.config.graphQLPath, (0, _cors.default)());
    app.use(this.config.graphQLPath, _middlewares.handleParseHeaders);
    app.use(this.config.graphQLPath, _middlewares.handleParseErrors);
    app.use(this.config.graphQLPath, async (req, res) => {
      const server = await this._getServer();
      return server(req, res);
    });
  }

  applyPlayground(app) {
    if (!app || !app.get) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }

    app.get(this.config.playgroundPath || (0, _requiredParameter.default)('You must provide a config.playgroundPath to applyPlayground!'), (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.write((0, _node.renderGraphiQL)({
        endpoint: this.config.graphQLPath,
        subscriptionEndpoint: this.config.subscriptionsPath,
        headers: JSON.stringify({
          'X-Parse-Application-Id': this.parseServer.config.appId,
          'X-Parse-Master-Key': this.parseServer.config.masterKey
        })
      }));
      res.end();
    });
  }

  createSubscriptions(server) {
    _subscriptionsTransportWs.SubscriptionServer.create({
      execute: _graphql.execute,
      subscribe: _graphql.subscribe,
      onOperation: async (_message, params, webSocket) => Object.assign({}, params, await this._getGraphQLOptions(webSocket.upgradeReq))
    }, {
      server,
      path: this.config.subscriptionsPath || (0, _requiredParameter.default)('You must provide a config.subscriptionsPath to createSubscriptions!')
    });
  }

  setGraphQLConfig(graphQLConfig) {
    return this.parseGraphQLController.updateGraphQLConfig(graphQLConfig);
  }

}

exports.ParseGraphQLServer = ParseGraphQLServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInBhcnNlU2VydmVyIiwiY29uZmlnIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJncmFwaFFMUGF0aCIsInBhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiZGVmYXVsdExvZ2dlciIsInBhcnNlR3JhcGhRTFNjaGVtYSIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImRhdGFiYXNlQ29udHJvbGxlciIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwiX2dldEdyYXBoUUxPcHRpb25zIiwic2NoZW1hIiwibG9hZCIsImNvbnRleHQiLCJyZXEiLCJpbmZvIiwiYXV0aCIsIm1hc2tlZEVycm9ycyIsIm11bHRpcGFydCIsImZpbGVTaXplIiwiX3RyYW5zZm9ybU1heFVwbG9hZFNpemVUb0J5dGVzIiwibWF4VXBsb2FkU2l6ZSIsImUiLCJlcnJvciIsInN0YWNrIiwidG9TdHJpbmciLCJfZ2V0U2VydmVyIiwic2NoZW1hUmVmIiwiZ3JhcGhRTFNjaGVtYSIsIm5ld1NjaGVtYVJlZiIsIl9zZXJ2ZXIiLCJvcHRpb25zIiwiY3JlYXRlU2VydmVyIiwidW5pdE1hcCIsImtiIiwibWIiLCJnYiIsIk51bWJlciIsInNsaWNlIiwiTWF0aCIsInBvdyIsInRvTG93ZXJDYXNlIiwiYXBwbHlHcmFwaFFMIiwiYXBwIiwidXNlIiwiY29yc01pZGRsZXdhcmUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJoYW5kbGVQYXJzZUVycm9ycyIsInJlcyIsInNlcnZlciIsImFwcGx5UGxheWdyb3VuZCIsImdldCIsInBsYXlncm91bmRQYXRoIiwiX3JlcSIsInNldEhlYWRlciIsIndyaXRlIiwicmVuZGVyR3JhcGhpUUwiLCJlbmRwb2ludCIsInN1YnNjcmlwdGlvbkVuZHBvaW50Iiwic3Vic2NyaXB0aW9uc1BhdGgiLCJoZWFkZXJzIiwiSlNPTiIsInN0cmluZ2lmeSIsIm1hc3RlcktleSIsImVuZCIsImNyZWF0ZVN1YnNjcmlwdGlvbnMiLCJTdWJzY3JpcHRpb25TZXJ2ZXIiLCJjcmVhdGUiLCJleGVjdXRlIiwic3Vic2NyaWJlIiwib25PcGVyYXRpb24iLCJfbWVzc2FnZSIsInBhcmFtcyIsIndlYlNvY2tldCIsIk9iamVjdCIsImFzc2lnbiIsInVwZ3JhZGVSZXEiLCJwYXRoIiwic2V0R3JhcGhRTENvbmZpZyIsImdyYXBoUUxDb25maWciLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBjb3JzTWlkZGxld2FyZSBmcm9tICdjb3JzJztcbmltcG9ydCB7IGNyZWF0ZVNlcnZlciwgcmVuZGVyR3JhcGhpUUwgfSBmcm9tICdAZ3JhcGhxbC15b2dhL25vZGUnO1xuaW1wb3J0IHsgZXhlY3V0ZSwgc3Vic2NyaWJlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb25TZXJ2ZXIgfSBmcm9tICdzdWJzY3JpcHRpb25zLXRyYW5zcG9ydC13cyc7XG5pbXBvcnQgeyBoYW5kbGVQYXJzZUVycm9ycywgaGFuZGxlUGFyc2VIZWFkZXJzIH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfSBmcm9tICcuL1BhcnNlR3JhcGhRTFNjaGVtYSc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwgeyBQYXJzZUdyYXBoUUxDb25maWcgfSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcblxuY2xhc3MgUGFyc2VHcmFwaFFMU2VydmVyIHtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcblxuICBjb25zdHJ1Y3RvcihwYXJzZVNlcnZlciwgY29uZmlnKSB7XG4gICAgdGhpcy5wYXJzZVNlcnZlciA9IHBhcnNlU2VydmVyIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VTZXJ2ZXIgaW5zdGFuY2UhJyk7XG4gICAgaWYgKCFjb25maWcgfHwgIWNvbmZpZy5ncmFwaFFMUGF0aCkge1xuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb25maWcuZ3JhcGhRTFBhdGghJyk7XG4gICAgfVxuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLnBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG4gICAgdGhpcy5sb2cgPVxuICAgICAgKHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnICYmIHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxTY2hlbWEgPSBuZXcgUGFyc2VHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogdGhpcy5wYXJzZVNlcnZlci5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgbG9nOiB0aGlzLmxvZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogdGhpcy5jb25maWcuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgYXBwSWQ6IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmFwcElkLFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEdyYXBoUUxPcHRpb25zKCkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzY2hlbWE6IGF3YWl0IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmxvYWQoKSxcbiAgICAgICAgY29udGV4dDogKHsgcmVxOiB7IGluZm8sIGNvbmZpZywgYXV0aCB9IH0pID0+ICh7XG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgfSksXG4gICAgICAgIG1hc2tlZEVycm9yczogZmFsc2UsXG4gICAgICAgIG11bHRpcGFydDoge1xuICAgICAgICAgIGZpbGVTaXplOiB0aGlzLl90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyhcbiAgICAgICAgICAgIHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLm1heFVwbG9hZFNpemUgfHwgJzIwbWInXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoZS5zdGFjayB8fCAodHlwZW9mIGUudG9TdHJpbmcgPT09ICdmdW5jdGlvbicgJiYgZS50b1N0cmluZygpKSB8fCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2dldFNlcnZlcigpIHtcbiAgICBjb25zdCBzY2hlbWFSZWYgPSB0aGlzLnBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hO1xuICAgIGNvbnN0IG5ld1NjaGVtYVJlZiA9IGF3YWl0IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmxvYWQoKTtcbiAgICBpZiAoc2NoZW1hUmVmID09PSBuZXdTY2hlbWFSZWYgJiYgdGhpcy5fc2VydmVyKSB7XG4gICAgICByZXR1cm4gdGhpcy5fc2VydmVyO1xuICAgIH1cbiAgICBjb25zdCBvcHRpb25zID0gYXdhaXQgdGhpcy5fZ2V0R3JhcGhRTE9wdGlvbnMoKTtcbiAgICB0aGlzLl9zZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHRoaXMuX3NlcnZlcjtcbiAgfVxuXG4gIF90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyhtYXhVcGxvYWRTaXplKSB7XG4gICAgY29uc3QgdW5pdE1hcCA9IHtcbiAgICAgIGtiOiAxLFxuICAgICAgbWI6IDIsXG4gICAgICBnYjogMyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgIE51bWJlcihtYXhVcGxvYWRTaXplLnNsaWNlKDAsIC0yKSkgKlxuICAgICAgTWF0aC5wb3coMTAyNCwgdW5pdE1hcFttYXhVcGxvYWRTaXplLnNsaWNlKC0yKS50b0xvd2VyQ2FzZSgpXSlcbiAgICApO1xuICB9XG5cbiAgYXBwbHlHcmFwaFFMKGFwcCkge1xuICAgIGlmICghYXBwIHx8ICFhcHAudXNlKSB7XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBFeHByZXNzLmpzIGFwcCBpbnN0YW5jZSEnKTtcbiAgICB9XG5cbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBjb3JzTWlkZGxld2FyZSgpKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBoYW5kbGVQYXJzZUhlYWRlcnMpO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGhhbmRsZVBhcnNlRXJyb3JzKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IHRoaXMuX2dldFNlcnZlcigpO1xuICAgICAgcmV0dXJuIHNlcnZlcihyZXEsIHJlcyk7XG4gICAgfSk7XG4gIH1cblxuICBhcHBseVBsYXlncm91bmQoYXBwKSB7XG4gICAgaWYgKCFhcHAgfHwgIWFwcC5nZXQpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIEV4cHJlc3MuanMgYXBwIGluc3RhbmNlIScpO1xuICAgIH1cbiAgICBhcHAuZ2V0KFxuICAgICAgdGhpcy5jb25maWcucGxheWdyb3VuZFBhdGggfHxcbiAgICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb25maWcucGxheWdyb3VuZFBhdGggdG8gYXBwbHlQbGF5Z3JvdW5kIScpLFxuICAgICAgKF9yZXEsIHJlcykgPT4ge1xuICAgICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9odG1sJyk7XG4gICAgICAgIHJlcy53cml0ZShcbiAgICAgICAgICByZW5kZXJHcmFwaGlRTCh7XG4gICAgICAgICAgICBlbmRwb2ludDogdGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsXG4gICAgICAgICAgICBzdWJzY3JpcHRpb25FbmRwb2ludDogdGhpcy5jb25maWcuc3Vic2NyaXB0aW9uc1BhdGgsXG4gICAgICAgICAgICBoZWFkZXJzOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJzogdGhpcy5wYXJzZVNlcnZlci5jb25maWcuYXBwSWQsXG4gICAgICAgICAgICAgICdYLVBhcnNlLU1hc3Rlci1LZXknOiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5tYXN0ZXJLZXksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgICByZXMuZW5kKCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGNyZWF0ZVN1YnNjcmlwdGlvbnMoc2VydmVyKSB7XG4gICAgU3Vic2NyaXB0aW9uU2VydmVyLmNyZWF0ZShcbiAgICAgIHtcbiAgICAgICAgZXhlY3V0ZSxcbiAgICAgICAgc3Vic2NyaWJlLFxuICAgICAgICBvbk9wZXJhdGlvbjogYXN5bmMgKF9tZXNzYWdlLCBwYXJhbXMsIHdlYlNvY2tldCkgPT5cbiAgICAgICAgICBPYmplY3QuYXNzaWduKHt9LCBwYXJhbXMsIGF3YWl0IHRoaXMuX2dldEdyYXBoUUxPcHRpb25zKHdlYlNvY2tldC51cGdyYWRlUmVxKSksXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIHBhdGg6XG4gICAgICAgICAgdGhpcy5jb25maWcuc3Vic2NyaXB0aW9uc1BhdGggfHxcbiAgICAgICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGNvbmZpZy5zdWJzY3JpcHRpb25zUGF0aCB0byBjcmVhdGVTdWJzY3JpcHRpb25zIScpLFxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBzZXRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZyk6IFByb21pc2Uge1xuICAgIHJldHVybiB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIudXBkYXRlR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnKTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLGtCQUFOLENBQXlCO0VBR3ZCQyxXQUFXLENBQUNDLFdBQUQsRUFBY0MsTUFBZCxFQUFzQjtJQUMvQixLQUFLRCxXQUFMLEdBQW1CQSxXQUFXLElBQUksSUFBQUUsMEJBQUEsRUFBa0IsMENBQWxCLENBQWxDOztJQUNBLElBQUksQ0FBQ0QsTUFBRCxJQUFXLENBQUNBLE1BQU0sQ0FBQ0UsV0FBdkIsRUFBb0M7TUFDbEMsSUFBQUQsMEJBQUEsRUFBa0Isd0NBQWxCO0lBQ0Q7O0lBQ0QsS0FBS0QsTUFBTCxHQUFjQSxNQUFkO0lBQ0EsS0FBS0csc0JBQUwsR0FBOEIsS0FBS0osV0FBTCxDQUFpQkMsTUFBakIsQ0FBd0JHLHNCQUF0RDtJQUNBLEtBQUtDLEdBQUwsR0FDRyxLQUFLTCxXQUFMLENBQWlCQyxNQUFqQixJQUEyQixLQUFLRCxXQUFMLENBQWlCQyxNQUFqQixDQUF3QkssZ0JBQXBELElBQXlFQyxlQUQzRTtJQUVBLEtBQUtDLGtCQUFMLEdBQTBCLElB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