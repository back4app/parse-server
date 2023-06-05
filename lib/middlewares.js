"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowMethodOverride = allowMethodOverride;
exports.enforceMasterKeyAccess = enforceMasterKeyAccess;
exports.handleParseErrors = handleParseErrors;
exports.handleParseHeaders = handleParseHeaders;
exports.handleParseSession = void 0;
exports.promiseEnforceMasterKeyAccess = promiseEnforceMasterKeyAccess;
exports.promiseEnsureIdempotency = promiseEnsureIdempotency;
var _cache = _interopRequireDefault(require("./cache"));
var _node = _interopRequireDefault(require("parse/node"));
var _Auth = _interopRequireDefault(require("./Auth"));
var _Config = _interopRequireDefault(require("./Config"));
var _ClientSDK = _interopRequireDefault(require("./ClientSDK"));
var _logger = _interopRequireDefault(require("./logger"));
var _rest = _interopRequireDefault(require("./rest"));
var _MongoStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
var _Definitions = require("./Options/Definitions");
var _pathToRegexp = _interopRequireDefault(require("path-to-regexp"));
var _ipRangeCheck = _interopRequireDefault(require("ip-range-check"));
var _rateLimitRedis = _interopRequireDefault(require("rate-limit-redis"));
var _redis = require("redis");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const DEFAULT_ALLOWED_HEADERS = 'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';
exports.DEFAULT_ALLOWED_HEADERS = DEFAULT_ALLOWED_HEADERS;
const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);
  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch (e) {
      return malformedContext(req, res);
    }
  }
  var info = {
    appId: req.get('X-Parse-Application-Id'),
    sessionToken: req.get('X-Parse-Session-Token'),
    masterKey: req.get('X-Parse-Master-Key'),
    maintenanceKey: req.get('X-Parse-Maintenance-Key'),
    installationId: req.get('X-Parse-Installation-Id'),
    clientKey: req.get('X-Parse-Client-Key'),
    javascriptKey: req.get('X-Parse-Javascript-Key'),
    dotNetKey: req.get('X-Parse-Windows-Key'),
    restAPIKey: req.get('X-Parse-REST-API-Key'),
    clientVersion: req.get('X-Parse-Client-Version'),
    context: context
  };
  var basicAuth = httpAuth(req);
  if (basicAuth) {
    var basicAuthAppId = basicAuth.appId;
    if (_cache.default.get(basicAuthAppId)) {
      info.appId = basicAuthAppId;
      info.masterKey = basicAuth.masterKey || info.masterKey;
      info.javascriptKey = basicAuth.javascriptKey || info.javascriptKey;
    }
  }
  if (req.body) {
    // Unity SDK sends a _noBody key which needs to be removed.
    // Unclear at this point if action needs to be taken.
    delete req.body._noBody;
  }
  var fileViaJSON = false;
  if (!info.appId || !_cache.default.get(info.appId)) {
    // See if we can find the app id on the body.
    if (req.body instanceof Buffer) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
      // https://github.com/parse-community/parse-server/issues/6589
      // It is also possible that the client is trying to upload a file but forgot
      // to provide x-parse-app-id in header and parse a binary file will fail
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        return invalidRequest(req, res);
      }
      fileViaJSON = true;
    }
    if (req.body) {
      delete req.body._RevocableSession;
    }
    if (req.body && req.body._ApplicationId && _cache.default.get(req.body._ApplicationId) && (!info.masterKey || _cache.default.get(req.body._ApplicationId).masterKey === info.masterKey)) {
      info.appId = req.body._ApplicationId;
      info.javascriptKey = req.body._JavaScriptKey || '';
      delete req.body._ApplicationId;
      delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
      if (req.body._ClientVersion) {
        info.clientVersion = req.body._ClientVersion;
        delete req.body._ClientVersion;
      }
      if (req.body._InstallationId) {
        info.installationId = req.body._InstallationId;
        delete req.body._InstallationId;
      }
      if (req.body._SessionToken) {
        info.sessionToken = req.body._SessionToken;
        delete req.body._SessionToken;
      }
      if (req.body._MasterKey) {
        info.masterKey = req.body._MasterKey;
        delete req.body._MasterKey;
      }
      if (req.body._context) {
        if (req.body._context instanceof Object) {
          info.context = req.body._context;
        } else {
          try {
            info.context = JSON.parse(req.body._context);
            if (Object.prototype.toString.call(info.context) !== '[object Object]') {
              throw 'Context is not an object';
            }
          } catch (e) {
            return malformedContext(req, res);
          }
        }
        delete req.body._context;
      }
      if (req.body._ContentType) {
        req.headers['content-type'] = req.body._ContentType;
        delete req.body._ContentType;
      }
    } else {
      return invalidRequest(req, res);
    }
  }
  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    info.sessionToken = info.sessionToken.toString();
  }
  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    info.sessionToken = info.sessionToken.toString();
  }
  if (info.clientVersion) {
    info.clientSDK = _ClientSDK.default.fromString(info.clientVersion);
  }
  if (fileViaJSON) {
    req.fileData = req.body.fileData;
    // We need to repopulate req.body with a buffer
    var base64 = req.body.base64;
    req.body = Buffer.from(base64, 'base64');
  }
  const clientIp = getClientIp(req);
  const config = _Config.default.get(info.appId, mount);
  if (config.state && config.state !== 'ok') {
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      error: `Invalid server state: ${config.state}`
    });
    return;
  }
  info.app = _cache.default.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;
  const isMaintenance = req.config.maintenanceKey && info.maintenanceKey === req.config.maintenanceKey;
  if (isMaintenance) {
    var _req$config;
    if ((0, _ipRangeCheck.default)(clientIp, req.config.maintenanceKeyIps || [])) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = ((_req$config = req.config) === null || _req$config === void 0 ? void 0 : _req$config.loggerController) || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  let isMaster = info.masterKey === req.config.masterKey;
  if (isMaster && !(0, _ipRangeCheck.default)(clientIp, req.config.masterKeyIps || [])) {
    var _req$config2;
    const log = ((_req$config2 = req.config) === null || _req$config2 === void 0 ? void 0 : _req$config2.loggerController) || _logger.default;
    log.error(`Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`);
    isMaster = false;
  }
  if (isMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true
    });
    return handleRateLimit(req, res, next);
  }
  var isReadOnlyMaster = info.masterKey === req.config.readOnlyMasterKey;
  if (typeof req.config.readOnlyMasterKey != 'undefined' && req.config.readOnlyMasterKey && isReadOnlyMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true,
      isReadOnly: true
    });
    return handleRateLimit(req, res, next);
  }

  // Client keys are not required in parse-server, but if any have been configured in the server, validate them
  //  to preserve original behavior.
  const keys = ['clientKey', 'javascriptKey', 'dotNetKey', 'restAPIKey'];
  const oneKeyConfigured = keys.some(function (key) {
    return req.config[key] !== undefined;
  });
  const oneKeyMatches = keys.some(function (key) {
    return req.config[key] !== undefined && info[key] === req.config[key];
  });
  if (oneKeyConfigured && !oneKeyMatches) {
    return invalidRequest(req, res);
  }
  if (req.url == '/login') {
    delete info.sessionToken;
  }
  if (req.userFromJWT) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
      user: req.userFromJWT
    });
    return handleRateLimit(req, res, next);
  }
  if (!info.sessionToken) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false
    });
  }
  handleRateLimit(req, res, next);
}
const handleRateLimit = async (req, res, next) => {
  const rateLimits = req.config.rateLimits || [];
  try {
    await Promise.all(rateLimits.map(async limit => {
      const pathExp = new RegExp(limit.path);
      if (pathExp.test(req.url)) {
        await limit.handler(req, res, err => {
          if (err) {
            if (err.code === _node.default.Error.CONNECTION_FAILED) {
              throw err;
            }
            req.config.loggerController.error('An unknown error occured when attempting to apply the rate limiter: ', err);
          }
        });
      }
    }));
  } catch (error) {
    res.status(429);
    res.json({
      code: _node.default.Error.CONNECTION_FAILED,
      error: error.message
    });
    return;
  }
  next();
};
const handleParseSession = async (req, res, next) => {
  try {
    const info = req.info;
    if (req.auth) {
      next();
      return;
    }
    let requestAuth = null;
    if (info.sessionToken && req.url === '/upgradeToRevocableSession' && info.sessionToken.indexOf('r:') != 0) {
      requestAuth = await _Auth.default.getAuthForLegacySessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    } else {
      requestAuth = await _Auth.default.getAuthForSessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    }
    req.auth = requestAuth;
    next();
  } catch (error) {
    if (error instanceof _node.default.Error) {
      next(error);
      return;
    }
    // TODO: Determine the correct error scenario.
    req.config.loggerController.error('error getting auth for sessionToken', error);
    throw new _node.default.Error(_node.default.Error.UNKNOWN_ERROR, error);
  }
};
exports.handleParseSession = handleParseSession;
function getClientIp(req) {
  return req.ip;
}
function httpAuth(req) {
  if (!(req.req || req).headers.authorization) return;
  var header = (req.req || req).headers.authorization;
  var appId, masterKey, javascriptKey;

  // parse header
  var authPrefix = 'basic ';
  var match = header.toLowerCase().indexOf(authPrefix);
  if (match == 0) {
    var encodedAuth = header.substring(authPrefix.length, header.length);
    var credentials = decodeBase64(encodedAuth).split(':');
    if (credentials.length == 2) {
      appId = credentials[0];
      var key = credentials[1];
      var jsKeyPrefix = 'javascript-key=';
      var matchKey = key.indexOf(jsKeyPrefix);
      if (matchKey == 0) {
        javascriptKey = key.substring(jsKeyPrefix.length, key.length);
      } else {
        masterKey = key;
      }
    }
  }
  return {
    appId: appId,
    masterKey: masterKey,
    javascriptKey: javascriptKey
  };
}
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString();
}
function allowCrossDomain(appId) {
  return (req, res, next) => {
    const config = _Config.default.get(appId, getMountForRequest(req));
    let allowHeaders = DEFAULT_ALLOWED_HEADERS;
    if (config && config.allowHeaders) {
      allowHeaders += `, ${config.allowHeaders.join(', ')}`;
    }
    const baseOrigins = typeof (config === null || config === void 0 ? void 0 : config.allowOrigin) === 'string' ? [config.allowOrigin] : (config === null || config === void 0 ? void 0 : config.allowOrigin) ?? ['*'];
    const requestOrigin = req.headers.origin;
    const allowOrigins = requestOrigin && baseOrigins.includes(requestOrigin) ? requestOrigin : baseOrigins[0];
    res.header('Access-Control-Allow-Origin', allowOrigins);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', allowHeaders);
    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}
function allowMethodOverride(req, res, next) {
  if (req.method === 'POST' && req.body._method) {
    req.originalMethod = req.method;
    req.method = req.body._method;
    delete req.body._method;
  }
  next();
}
function handleParseErrors(err, req, res, next) {
  const log = req.config && req.config.loggerController || _logger.default;
  if (err instanceof _node.default.Error) {
    if (req.config && req.config.enableExpressErrorHandler) {
      return next(err);
    }
    let httpStatus;
    // TODO: fill out this mapping
    switch (err.code) {
      case _node.default.Error.INTERNAL_SERVER_ERROR:
        httpStatus = 500;
        break;
      case _node.default.Error.OBJECT_NOT_FOUND:
        httpStatus = 404;
        break;
      default:
        httpStatus = 400;
    }
    res.status(httpStatus);
    res.json({
      code: err.code,
      error: err.message
    });
    log.error('Parse error: ', err);
  } else if (err.status && err.message) {
    res.status(err.status);
    res.json({
      error: err.message
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  } else {
    log.error('Uncaught internal server error.', err, err.stack);
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.'
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  }
}
function enforceMasterKeyAccess(req, res, next) {
  if (!req.auth.isMaster) {
    res.status(403);
    res.end('{"error":"unauthorized: master key is required"}');
    return;
  }
  next();
}
function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized: master key is required';
    throw error;
  }
  return Promise.resolve();
}
const addRateLimit = (route, config, cloud) => {
  if (typeof config === 'string') {
    config = _Config.default.get(config);
  }
  for (const key in route) {
    if (!_Definitions.RateLimitOptions[key]) {
      throw `Invalid rate limit option "${key}"`;
    }
  }
  if (!config.rateLimits) {
    config.rateLimits = [];
  }
  const redisStore = {
    connectionPromise: Promise.resolve(),
    store: null,
    connected: false
  };
  if (route.redisUrl) {
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    redisStore.connectionPromise = async () => {
      if (redisStore.connected) {
        return;
      }
      try {
        await client.connect();
        redisStore.connected = true;
      } catch (e) {
        var _config;
        const log = ((_config = config) === null || _config === void 0 ? void 0 : _config.loggerController) || _logger.default;
        log.error(`Could not connect to redisURL in rate limit: ${e}`);
      }
    };
    redisStore.connectionPromise();
    redisStore.store = new _rateLimitRedis.default({
      sendCommand: async (...args) => {
        await redisStore.connectionPromise();
        return client.sendCommand(args);
      }
    });
  }
  config.rateLimits.push({
    path: (0, _pathToRegexp.default)(route.requestPath),
    handler: (0, _expressRateLimit.default)({
      windowMs: route.requestTimeWindow,
      max: route.requestCount,
      message: route.errorResponseMessage || _Definitions.RateLimitOptions.errorResponseMessage.default,
      handler: (request, response, next, options) => {
        throw {
          code: _node.default.Error.CONNECTION_FAILED,
          message: options.message
        };
      },
      skip: request => {
        var _request$auth;
        if (request.ip === '127.0.0.1' && !route.includeInternalRequests) {
          return true;
        }
        if (route.includeMasterKey) {
          return false;
        }
        if (route.requestMethods) {
          if (Array.isArray(route.requestMethods)) {
            if (!route.requestMethods.includes(request.method)) {
              return true;
            }
          } else {
            const regExp = new RegExp(route.requestMethods);
            if (!regExp.test(request.method)) {
              return true;
            }
          }
        }
        return (_request$auth = request.auth) === null || _request$auth === void 0 ? void 0 : _request$auth.isMaster;
      },
      keyGenerator: request => {
        return request.config.ip;
      },
      store: redisStore.store
    }),
    cloud
  });
  _Config.default.put(config);
};

/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
exports.addRateLimit = addRateLimit;
function promiseEnsureIdempotency(req) {
  // Enable feature only for MongoDB
  if (!(req.config.database.adapter instanceof _MongoStorageAdapter.default || req.config.database.adapter instanceof _PostgresStorageAdapter.default)) {
    return Promise.resolve();
  }
  // Get parameters
  const config = req.config;
  const requestId = ((req || {}).headers || {})['x-parse-request-id'];
  const {
    paths,
    ttl
  } = config.idempotencyOptions;
  if (!requestId || !config.idempotencyOptions) {
    return Promise.resolve();
  }
  // Request path may contain trailing slashes, depending on the original request, so remove
  // leading and trailing slashes to make it easier to specify paths in the configuration
  const reqPath = req.path.replace(/^\/|\/$/, '');
  // Determine whether idempotency is enabled for current request path
  let match = false;
  for (const path of paths) {
    // Assume one wants a path to always match from the beginning to prevent any mistakes
    const regex = new RegExp(path.charAt(0) === '^' ? path : '^' + path);
    if (reqPath.match(regex)) {
      match = true;
      break;
    }
  }
  if (!match) {
    return Promise.resolve();
  }
  // Try to store request
  const expiryDate = new Date(new Date().setSeconds(new Date().getSeconds() + ttl));
  return _rest.default.create(config, _Auth.default.master(config), '_Idempotency', {
    reqId: requestId,
    expire: _node.default._encode(expiryDate)
  }).catch(e => {
    if (e.code == _node.default.Error.DUPLICATE_VALUE) {
      throw new _node.default.Error(_node.default.Error.DUPLICATE_REQUEST, 'Duplicate request');
    }
    throw e;
  });
}
function invalidRequest(req, res) {
  res.status(403);
  res.end('{"error":"unauthorized"}');
}
function malformedContext(req, res) {
  res.status(400);
  res.json({
    code: _node.default.Error.INVALID_JSON,
    error: 'Invalid object for context.'
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfaXBSYW5nZUNoZWNrIiwiX3JhdGVMaW1pdFJlZGlzIiwiX3JlZGlzIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImV4cG9ydHMiLCJnZXRNb3VudEZvclJlcXVlc3QiLCJyZXEiLCJtb3VudFBhdGhMZW5ndGgiLCJvcmlnaW5hbFVybCIsImxlbmd0aCIsInVybCIsIm1vdW50UGF0aCIsInNsaWNlIiwicHJvdG9jb2wiLCJnZXQiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyZXMiLCJuZXh0IiwibW91bnQiLCJjb250ZXh0IiwiSlNPTiIsInBhcnNlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZSIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlwIiwiaXNNYWludGVuYW5jZSIsIl9yZXEkY29uZmlnIiwiaXBSYW5nZUNoZWNrIiwibWFpbnRlbmFuY2VLZXlJcHMiLCJhdXRoIiwiQXV0aCIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkZWZhdWx0TG9nZ2VyIiwiaXNNYXN0ZXIiLCJtYXN0ZXJLZXlJcHMiLCJfcmVxJGNvbmZpZzIiLCJoYW5kbGVSYXRlTGltaXQiLCJpc1JlYWRPbmx5TWFzdGVyIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJpc1JlYWRPbmx5Iiwia2V5cyIsIm9uZUtleUNvbmZpZ3VyZWQiLCJzb21lIiwia2V5IiwidW5kZWZpbmVkIiwib25lS2V5TWF0Y2hlcyIsInVzZXJGcm9tSldUIiwidXNlciIsInJhdGVMaW1pdHMiLCJQcm9taXNlIiwiYWxsIiwibWFwIiwibGltaXQiLCJwYXRoRXhwIiwiUmVnRXhwIiwicGF0aCIsInRlc3QiLCJoYW5kbGVyIiwiZXJyIiwiQ09OTkVDVElPTl9GQUlMRUQiLCJtZXNzYWdlIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwicmVxdWVzdEF1dGgiLCJpbmRleE9mIiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJVTktOT1dOX0VSUk9SIiwiYXV0aG9yaXphdGlvbiIsImhlYWRlciIsImF1dGhQcmVmaXgiLCJtYXRjaCIsInRvTG93ZXJDYXNlIiwiZW5jb2RlZEF1dGgiLCJzdWJzdHJpbmciLCJjcmVkZW50aWFscyIsImRlY29kZUJhc2U2NCIsInNwbGl0IiwianNLZXlQcmVmaXgiLCJtYXRjaEtleSIsInN0ciIsImFsbG93Q3Jvc3NEb21haW4iLCJhbGxvd0hlYWRlcnMiLCJqb2luIiwiYmFzZU9yaWdpbnMiLCJhbGxvd09yaWdpbiIsInJlcXVlc3RPcmlnaW4iLCJvcmlnaW4iLCJhbGxvd09yaWdpbnMiLCJpbmNsdWRlcyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsInN0b3JlIiwiY29ubmVjdGVkIiwicmVkaXNVcmwiLCJjbGllbnQiLCJjcmVhdGVDbGllbnQiLCJjb25uZWN0IiwiX2NvbmZpZyIsIlJlZGlzU3RvcmUiLCJzZW5kQ29tbWFuZCIsImFyZ3MiLCJwdXNoIiwicGF0aFRvUmVnZXhwIiwicmVxdWVzdFBhdGgiLCJyYXRlTGltaXQiLCJ3aW5kb3dNcyIsInJlcXVlc3RUaW1lV2luZG93IiwibWF4IiwicmVxdWVzdENvdW50IiwiZXJyb3JSZXNwb25zZU1lc3NhZ2UiLCJyZXNwb25zZSIsIm9wdGlvbnMiLCJza2lwIiwiX3JlcXVlc3QkYXV0aCIsImluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzIiwiaW5jbHVkZU1hc3RlcktleSIsInJlcXVlc3RNZXRob2RzIiwiQXJyYXkiLCJpc0FycmF5IiwicmVnRXhwIiwia2V5R2VuZXJhdG9yIiwicHV0IiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiZGF0YWJhc2UiLCJhZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJyZXF1ZXN0SWQiLCJwYXRocyIsInR0bCIsImlkZW1wb3RlbmN5T3B0aW9ucyIsInJlcVBhdGgiLCJyZXBsYWNlIiwicmVnZXgiLCJjaGFyQXQiLCJleHBpcnlEYXRlIiwiRGF0ZSIsInNldFNlY29uZHMiLCJnZXRTZWNvbmRzIiwicmVzdCIsImNyZWF0ZSIsIm1hc3RlciIsInJlcUlkIiwiZXhwaXJlIiwiX2VuY29kZSIsImNhdGNoIiwiRFVQTElDQVRFX1ZBTFVFIiwiRFVQTElDQVRFX1JFUVVFU1QiLCJJTlZBTElEX0pTT04iXSwic291cmNlcyI6WyIuLi9zcmMvbWlkZGxld2FyZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IGF1dGggZnJvbSAnLi9BdXRoJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IENsaWVudFNESyBmcm9tICcuL0NsaWVudFNESyc7XG5pbXBvcnQgZGVmYXVsdExvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuL3Jlc3QnO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHJhdGVMaW1pdCBmcm9tICdleHByZXNzLXJhdGUtbGltaXQnO1xuaW1wb3J0IHsgUmF0ZUxpbWl0T3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgcGF0aFRvUmVnZXhwIGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBpcFJhbmdlQ2hlY2sgZnJvbSAnaXAtcmFuZ2UtY2hlY2snO1xuaW1wb3J0IFJlZGlzU3RvcmUgZnJvbSAncmF0ZS1saW1pdC1yZWRpcyc7XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICdyZWRpcyc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0FMTE9XRURfSEVBREVSUyA9XG4gICdYLVBhcnNlLU1hc3Rlci1LZXksIFgtUGFyc2UtUkVTVC1BUEktS2V5LCBYLVBhcnNlLUphdmFzY3JpcHQtS2V5LCBYLVBhcnNlLUFwcGxpY2F0aW9uLUlkLCBYLVBhcnNlLUNsaWVudC1WZXJzaW9uLCBYLVBhcnNlLVNlc3Npb24tVG9rZW4sIFgtUmVxdWVzdGVkLVdpdGgsIFgtUGFyc2UtUmV2b2NhYmxlLVNlc3Npb24sIFgtUGFyc2UtUmVxdWVzdC1JZCwgQ29udGVudC1UeXBlLCBQcmFnbWEsIENhY2hlLUNvbnRyb2wnO1xuXG5jb25zdCBnZXRNb3VudEZvclJlcXVlc3QgPSBmdW5jdGlvbiAocmVxKSB7XG4gIGNvbnN0IG1vdW50UGF0aExlbmd0aCA9IHJlcS5vcmlnaW5hbFVybC5sZW5ndGggLSByZXEudXJsLmxlbmd0aDtcbiAgY29uc3QgbW91bnRQYXRoID0gcmVxLm9yaWdpbmFsVXJsLnNsaWNlKDAsIG1vdW50UGF0aExlbmd0aCk7XG4gIHJldHVybiByZXEucHJvdG9jb2wgKyAnOi8vJyArIHJlcS5nZXQoJ2hvc3QnKSArIG1vdW50UGF0aDtcbn07XG5cbi8vIENoZWNrcyB0aGF0IHRoZSByZXF1ZXN0IGlzIGF1dGhvcml6ZWQgZm9yIHRoaXMgYXBwIGFuZCBjaGVja3MgdXNlclxuLy8gYXV0aCB0b28uXG4vLyBUaGUgYm9keXBhcnNlciBzaG91bGQgcnVuIGJlZm9yZSB0aGlzIG1pZGRsZXdhcmUuXG4vLyBBZGRzIGluZm8gdG8gdGhlIHJlcXVlc3Q6XG4vLyByZXEuY29uZmlnIC0gdGhlIENvbmZpZyBmb3IgdGhpcyBhcHBcbi8vIHJlcS5hdXRoIC0gdGhlIEF1dGggZm9yIHRoaXMgcmVxdWVzdFxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVBhcnNlSGVhZGVycyhyZXEsIHJlcywgbmV4dCkge1xuICB2YXIgbW91bnQgPSBnZXRNb3VudEZvclJlcXVlc3QocmVxKTtcblxuICBsZXQgY29udGV4dCA9IHt9O1xuICBpZiAocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykgIT0gbnVsbCkge1xuICAgIHRyeSB7XG4gICAgICBjb250ZXh0ID0gSlNPTi5wYXJzZShyZXEuZ2V0KCdYLVBhcnNlLUNsb3VkLUNvbnRleHQnKSk7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG4gIHZhciBpbmZvID0ge1xuICAgIGFwcElkOiByZXEuZ2V0KCdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJyksXG4gICAgc2Vzc2lvblRva2VuOiByZXEuZ2V0KCdYLVBhcnNlLVNlc3Npb24tVG9rZW4nKSxcbiAgICBtYXN0ZXJLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFzdGVyLUtleScpLFxuICAgIG1haW50ZW5hbmNlS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1haW50ZW5hbmNlLUtleScpLFxuICAgIGluc3RhbGxhdGlvbklkOiByZXEuZ2V0KCdYLVBhcnNlLUluc3RhbGxhdGlvbi1JZCcpLFxuICAgIGNsaWVudEtleTogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtS2V5JyksXG4gICAgamF2YXNjcmlwdEtleTogcmVxLmdldCgnWC1QYXJzZS1KYXZhc2NyaXB0LUtleScpLFxuICAgIGRvdE5ldEtleTogcmVxLmdldCgnWC1QYXJzZS1XaW5kb3dzLUtleScpLFxuICAgIHJlc3RBUElLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtUkVTVC1BUEktS2V5JyksXG4gICAgY2xpZW50VmVyc2lvbjogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtVmVyc2lvbicpLFxuICAgIGNvbnRleHQ6IGNvbnRleHQsXG4gIH07XG5cbiAgdmFyIGJhc2ljQXV0aCA9IGh0dHBBdXRoKHJlcSk7XG5cbiAgaWYgKGJhc2ljQXV0aCkge1xuICAgIHZhciBiYXNpY0F1dGhBcHBJZCA9IGJhc2ljQXV0aC5hcHBJZDtcbiAgICBpZiAoQXBwQ2FjaGUuZ2V0KGJhc2ljQXV0aEFwcElkKSkge1xuICAgICAgaW5mby5hcHBJZCA9IGJhc2ljQXV0aEFwcElkO1xuICAgICAgaW5mby5tYXN0ZXJLZXkgPSBiYXNpY0F1dGgubWFzdGVyS2V5IHx8IGluZm8ubWFzdGVyS2V5O1xuICAgICAgaW5mby5qYXZhc2NyaXB0S2V5ID0gYmFzaWNBdXRoLmphdmFzY3JpcHRLZXkgfHwgaW5mby5qYXZhc2NyaXB0S2V5O1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXEuYm9keSkge1xuICAgIC8vIFVuaXR5IFNESyBzZW5kcyBhIF9ub0JvZHkga2V5IHdoaWNoIG5lZWRzIHRvIGJlIHJlbW92ZWQuXG4gICAgLy8gVW5jbGVhciBhdCB0aGlzIHBvaW50IGlmIGFjdGlvbiBuZWVkcyB0byBiZSB0YWtlbi5cbiAgICBkZWxldGUgcmVxLmJvZHkuX25vQm9keTtcbiAgfVxuXG4gIHZhciBmaWxlVmlhSlNPTiA9IGZhbHNlO1xuXG4gIGlmICghaW5mby5hcHBJZCB8fCAhQXBwQ2FjaGUuZ2V0KGluZm8uYXBwSWQpKSB7XG4gICAgLy8gU2VlIGlmIHdlIGNhbiBmaW5kIHRoZSBhcHAgaWQgb24gdGhlIGJvZHkuXG4gICAgaWYgKHJlcS5ib2R5IGluc3RhbmNlb2YgQnVmZmVyKSB7XG4gICAgICAvLyBUaGUgb25seSBjaGFuY2UgdG8gZmluZCB0aGUgYXBwIGlkIGlzIGlmIHRoaXMgaXMgYSBmaWxlXG4gICAgICAvLyB1cGxvYWQgdGhhdCBhY3R1YWxseSBpcyBhIEpTT04gYm9keS4gU28gdHJ5IHRvIHBhcnNlIGl0LlxuICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzY1ODlcbiAgICAgIC8vIEl0IGlzIGFsc28gcG9zc2libGUgdGhhdCB0aGUgY2xpZW50IGlzIHRyeWluZyB0byB1cGxvYWQgYSBmaWxlIGJ1dCBmb3Jnb3RcbiAgICAgIC8vIHRvIHByb3ZpZGUgeC1wYXJzZS1hcHAtaWQgaW4gaGVhZGVyIGFuZCBwYXJzZSBhIGJpbmFyeSBmaWxlIHdpbGwgZmFpbFxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVxLmJvZHkgPSBKU09OLnBhcnNlKHJlcS5ib2R5KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICAgIH1cbiAgICAgIGZpbGVWaWFKU09OID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocmVxLmJvZHkpIHtcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fUmV2b2NhYmxlU2Vzc2lvbjtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICByZXEuYm9keSAmJlxuICAgICAgcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQgJiZcbiAgICAgIEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkgJiZcbiAgICAgICghaW5mby5tYXN0ZXJLZXkgfHwgQXBwQ2FjaGUuZ2V0KHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkKS5tYXN0ZXJLZXkgPT09IGluZm8ubWFzdGVyS2V5KVxuICAgICkge1xuICAgICAgaW5mby5hcHBJZCA9IHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgaW5mby5qYXZhc2NyaXB0S2V5ID0gcmVxLmJvZHkuX0phdmFTY3JpcHRLZXkgfHwgJyc7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQ7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX0phdmFTY3JpcHRLZXk7XG4gICAgICAvLyBUT0RPOiB0ZXN0IHRoYXQgdGhlIFJFU1QgQVBJIGZvcm1hdHMgZ2VuZXJhdGVkIGJ5IHRoZSBvdGhlclxuICAgICAgLy8gU0RLcyBhcmUgaGFuZGxlZCBva1xuICAgICAgaWYgKHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uKSB7XG4gICAgICAgIGluZm8uY2xpZW50VmVyc2lvbiA9IHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NsaWVudFZlcnNpb247XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0luc3RhbGxhdGlvbklkKSB7XG4gICAgICAgIGluZm8uaW5zdGFsbGF0aW9uSWQgPSByZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQ7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX1Nlc3Npb25Ub2tlbikge1xuICAgICAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9NYXN0ZXJLZXkpIHtcbiAgICAgICAgaW5mby5tYXN0ZXJLZXkgPSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCkge1xuICAgICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQgaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICAgICAgICBpbmZvLmNvbnRleHQgPSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaW5mby5jb250ZXh0ID0gSlNPTi5wYXJzZShyZXEuYm9keS5fY29udGV4dCk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGluZm8uY29udGV4dCkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgICAgICAgIHRocm93ICdDb250ZXh0IGlzIG5vdCBhbiBvYmplY3QnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9Db250ZW50VHlwZSkge1xuICAgICAgICByZXEuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSByZXEuYm9keS5fQ29udGVudFR5cGU7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ29udGVudFR5cGU7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG4gIGlmIChpbmZvLnNlc3Npb25Ub2tlbiAmJiB0eXBlb2YgaW5mby5zZXNzaW9uVG9rZW4gIT09ICdzdHJpbmcnKSB7XG4gICAgaW5mby5zZXNzaW9uVG9rZW4gPSBpbmZvLnNlc3Npb25Ub2tlbi50b1N0cmluZygpO1xuICB9XG5cbiAgaWYgKGluZm8uc2Vzc2lvblRva2VuICYmIHR5cGVvZiBpbmZvLnNlc3Npb25Ub2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IGluZm8uc2Vzc2lvblRva2VuLnRvU3RyaW5nKCk7XG4gIH1cblxuICBpZiAoaW5mby5jbGllbnRWZXJzaW9uKSB7XG4gICAgaW5mby5jbGllbnRTREsgPSBDbGllbnRTREsuZnJvbVN0cmluZyhpbmZvLmNsaWVudFZlcnNpb24pO1xuICB9XG5cbiAgaWYgKGZpbGVWaWFKU09OKSB7XG4gICAgcmVxLmZpbGVEYXRhID0gcmVxLmJvZHkuZmlsZURhdGE7XG4gICAgLy8gV2UgbmVlZCB0byByZXBvcHVsYXRlIHJlcS5ib2R5IHdpdGggYSBidWZmZXJcbiAgICB2YXIgYmFzZTY0ID0gcmVxLmJvZHkuYmFzZTY0O1xuICAgIHJlcS5ib2R5ID0gQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0Jyk7XG4gIH1cblxuICBjb25zdCBjbGllbnRJcCA9IGdldENsaWVudElwKHJlcSk7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoaW5mby5hcHBJZCwgbW91bnQpO1xuICBpZiAoY29uZmlnLnN0YXRlICYmIGNvbmZpZy5zdGF0ZSAhPT0gJ29rJykge1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBlcnJvcjogYEludmFsaWQgc2VydmVyIHN0YXRlOiAke2NvbmZpZy5zdGF0ZX1gLFxuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGluZm8uYXBwID0gQXBwQ2FjaGUuZ2V0KGluZm8uYXBwSWQpO1xuICByZXEuY29uZmlnID0gY29uZmlnO1xuICByZXEuY29uZmlnLmhlYWRlcnMgPSByZXEuaGVhZGVycyB8fCB7fTtcbiAgcmVxLmNvbmZpZy5pcCA9IGNsaWVudElwO1xuICByZXEuaW5mbyA9IGluZm87XG5cbiAgY29uc3QgaXNNYWludGVuYW5jZSA9XG4gICAgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleSAmJiBpbmZvLm1haW50ZW5hbmNlS2V5ID09PSByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5O1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlmIChpcFJhbmdlQ2hlY2soY2xpZW50SXAsIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHMgfHwgW10pKSB7XG4gICAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBpc01haW50ZW5hbmNlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYWludGVuYW5jZSBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFpbnRlbmFuY2VLZXlJcHMnLmBcbiAgICApO1xuICB9XG5cbiAgbGV0IGlzTWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcubWFzdGVyS2V5O1xuICBpZiAoaXNNYXN0ZXIgJiYgIWlwUmFuZ2VDaGVjayhjbGllbnRJcCwgcmVxLmNvbmZpZy5tYXN0ZXJLZXlJcHMgfHwgW10pKSB7XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1hc3RlciBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFzdGVyS2V5SXBzJy5gXG4gICAgKTtcbiAgICBpc01hc3RlciA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICB2YXIgaXNSZWFkT25seU1hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5O1xuICBpZiAoXG4gICAgdHlwZW9mIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgIT0gJ3VuZGVmaW5lZCcgJiZcbiAgICByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICYmXG4gICAgaXNSZWFkT25seU1hc3RlclxuICApIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICAgIGlzUmVhZE9ubHk6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICAvLyBDbGllbnQga2V5cyBhcmUgbm90IHJlcXVpcmVkIGluIHBhcnNlLXNlcnZlciwgYnV0IGlmIGFueSBoYXZlIGJlZW4gY29uZmlndXJlZCBpbiB0aGUgc2VydmVyLCB2YWxpZGF0ZSB0aGVtXG4gIC8vICB0byBwcmVzZXJ2ZSBvcmlnaW5hbCBiZWhhdmlvci5cbiAgY29uc3Qga2V5cyA9IFsnY2xpZW50S2V5JywgJ2phdmFzY3JpcHRLZXknLCAnZG90TmV0S2V5JywgJ3Jlc3RBUElLZXknXTtcbiAgY29uc3Qgb25lS2V5Q29uZmlndXJlZCA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkO1xuICB9KTtcbiAgY29uc3Qgb25lS2V5TWF0Y2hlcyA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkICYmIGluZm9ba2V5XSA9PT0gcmVxLmNvbmZpZ1trZXldO1xuICB9KTtcblxuICBpZiAob25lS2V5Q29uZmlndXJlZCAmJiAhb25lS2V5TWF0Y2hlcykge1xuICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gIH1cblxuICBpZiAocmVxLnVybCA9PSAnL2xvZ2luJykge1xuICAgIGRlbGV0ZSBpbmZvLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChyZXEudXNlckZyb21KV1QpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICB1c2VyOiByZXEudXNlckZyb21KV1QsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICBpZiAoIWluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIH0pO1xuICB9XG4gIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG59XG5cbmNvbnN0IGhhbmRsZVJhdGVMaW1pdCA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICBjb25zdCByYXRlTGltaXRzID0gcmVxLmNvbmZpZy5yYXRlTGltaXRzIHx8IFtdO1xuICB0cnkge1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgcmF0ZUxpbWl0cy5tYXAoYXN5bmMgbGltaXQgPT4ge1xuICAgICAgICBjb25zdCBwYXRoRXhwID0gbmV3IFJlZ0V4cChsaW1pdC5wYXRoKTtcbiAgICAgICAgaWYgKHBhdGhFeHAudGVzdChyZXEudXJsKSkge1xuICAgICAgICAgIGF3YWl0IGxpbWl0LmhhbmRsZXIocmVxLCByZXMsIGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgICAgICAgICdBbiB1bmtub3duIGVycm9yIG9jY3VyZWQgd2hlbiBhdHRlbXB0aW5nIHRvIGFwcGx5IHRoZSByYXRlIGxpbWl0ZXI6ICcsXG4gICAgICAgICAgICAgICAgZXJyXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXMuc3RhdHVzKDQyOSk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVQYXJzZVNlc3Npb24gPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBpbmZvID0gcmVxLmluZm87XG4gICAgaWYgKHJlcS5hdXRoKSB7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCByZXF1ZXN0QXV0aCA9IG51bGw7XG4gICAgaWYgKFxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4gJiZcbiAgICAgIHJlcS51cmwgPT09ICcvdXBncmFkZVRvUmV2b2NhYmxlU2Vzc2lvbicgJiZcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuLmluZGV4T2YoJ3I6JykgIT0gMFxuICAgICkge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXEuYXV0aCA9IHJlcXVlc3RBdXRoO1xuICAgIG5leHQoKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIFRPRE86IERldGVybWluZSB0aGUgY29ycmVjdCBlcnJvciBzY2VuYXJpby5cbiAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoJ2Vycm9yIGdldHRpbmcgYXV0aCBmb3Igc2Vzc2lvblRva2VuJywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VTktOT1dOX0VSUk9SLCBlcnJvcik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldENsaWVudElwKHJlcSkge1xuICByZXR1cm4gcmVxLmlwO1xufVxuXG5mdW5jdGlvbiBodHRwQXV0aChyZXEpIHtcbiAgaWYgKCEocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbikgcmV0dXJuO1xuXG4gIHZhciBoZWFkZXIgPSAocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbjtcbiAgdmFyIGFwcElkLCBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk7XG5cbiAgLy8gcGFyc2UgaGVhZGVyXG4gIHZhciBhdXRoUHJlZml4ID0gJ2Jhc2ljICc7XG5cbiAgdmFyIG1hdGNoID0gaGVhZGVyLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihhdXRoUHJlZml4KTtcblxuICBpZiAobWF0Y2ggPT0gMCkge1xuICAgIHZhciBlbmNvZGVkQXV0aCA9IGhlYWRlci5zdWJzdHJpbmcoYXV0aFByZWZpeC5sZW5ndGgsIGhlYWRlci5sZW5ndGgpO1xuICAgIHZhciBjcmVkZW50aWFscyA9IGRlY29kZUJhc2U2NChlbmNvZGVkQXV0aCkuc3BsaXQoJzonKTtcblxuICAgIGlmIChjcmVkZW50aWFscy5sZW5ndGggPT0gMikge1xuICAgICAgYXBwSWQgPSBjcmVkZW50aWFsc1swXTtcbiAgICAgIHZhciBrZXkgPSBjcmVkZW50aWFsc1sxXTtcblxuICAgICAgdmFyIGpzS2V5UHJlZml4ID0gJ2phdmFzY3JpcHQta2V5PSc7XG5cbiAgICAgIHZhciBtYXRjaEtleSA9IGtleS5pbmRleE9mKGpzS2V5UHJlZml4KTtcbiAgICAgIGlmIChtYXRjaEtleSA9PSAwKSB7XG4gICAgICAgIGphdmFzY3JpcHRLZXkgPSBrZXkuc3Vic3RyaW5nKGpzS2V5UHJlZml4Lmxlbmd0aCwga2V5Lmxlbmd0aCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXN0ZXJLZXkgPSBrZXk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgYXBwSWQ6IGFwcElkLCBtYXN0ZXJLZXk6IG1hc3RlcktleSwgamF2YXNjcmlwdEtleTogamF2YXNjcmlwdEtleSB9O1xufVxuXG5mdW5jdGlvbiBkZWNvZGVCYXNlNjQoc3RyKSB7XG4gIHJldHVybiBCdWZmZXIuZnJvbShzdHIsICdiYXNlNjQnKS50b1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkge1xuICByZXR1cm4gKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChhcHBJZCwgZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSkpO1xuICAgIGxldCBhbGxvd0hlYWRlcnMgPSBERUZBVUxUX0FMTE9XRURfSEVBREVSUztcbiAgICBpZiAoY29uZmlnICYmIGNvbmZpZy5hbGxvd0hlYWRlcnMpIHtcbiAgICAgIGFsbG93SGVhZGVycyArPSBgLCAke2NvbmZpZy5hbGxvd0hlYWRlcnMuam9pbignLCAnKX1gO1xuICAgIH1cblxuICAgIGNvbnN0IGJhc2VPcmlnaW5zID1cbiAgICAgIHR5cGVvZiBjb25maWc/LmFsbG93T3JpZ2luID09PSAnc3RyaW5nJyA/IFtjb25maWcuYWxsb3dPcmlnaW5dIDogY29uZmlnPy5hbGxvd09yaWdpbiA/PyBbJyonXTtcbiAgICBjb25zdCByZXF1ZXN0T3JpZ2luID0gcmVxLmhlYWRlcnMub3JpZ2luO1xuICAgIGNvbnN0IGFsbG93T3JpZ2lucyA9XG4gICAgICByZXF1ZXN0T3JpZ2luICYmIGJhc2VPcmlnaW5zLmluY2x1ZGVzKHJlcXVlc3RPcmlnaW4pID8gcmVxdWVzdE9yaWdpbiA6IGJhc2VPcmlnaW5zWzBdO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsIGFsbG93T3JpZ2lucyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcycsICdHRVQsUFVULFBPU1QsREVMRVRFLE9QVElPTlMnKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJywgYWxsb3dIZWFkZXJzKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1FeHBvc2UtSGVhZGVycycsICdYLVBhcnNlLUpvYi1TdGF0dXMtSWQsIFgtUGFyc2UtUHVzaC1TdGF0dXMtSWQnKTtcbiAgICAvLyBpbnRlcmNlcHQgT1BUSU9OUyBtZXRob2RcbiAgICBpZiAoJ09QVElPTlMnID09IHJlcS5tZXRob2QpIHtcbiAgICAgIHJlcy5zZW5kU3RhdHVzKDIwMCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd01ldGhvZE92ZXJyaWRlKHJlcSwgcmVzLCBuZXh0KSB7XG4gIGlmIChyZXEubWV0aG9kID09PSAnUE9TVCcgJiYgcmVxLmJvZHkuX21ldGhvZCkge1xuICAgIHJlcS5vcmlnaW5hbE1ldGhvZCA9IHJlcS5tZXRob2Q7XG4gICAgcmVxLm1ldGhvZCA9IHJlcS5ib2R5Ll9tZXRob2Q7XG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9tZXRob2Q7XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlUGFyc2VFcnJvcnMoZXJyLCByZXEsIHJlcywgbmV4dCkge1xuICBjb25zdCBsb2cgPSAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHx8IGRlZmF1bHRMb2dnZXI7XG4gIGlmIChlcnIgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgIGlmIChyZXEuY29uZmlnICYmIHJlcS5jb25maWcuZW5hYmxlRXhwcmVzc0Vycm9ySGFuZGxlcikge1xuICAgICAgcmV0dXJuIG5leHQoZXJyKTtcbiAgICB9XG4gICAgbGV0IGh0dHBTdGF0dXM7XG4gICAgLy8gVE9ETzogZmlsbCBvdXQgdGhpcyBtYXBwaW5nXG4gICAgc3dpdGNoIChlcnIuY29kZSkge1xuICAgICAgY2FzZSBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1I6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA1MDA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EOlxuICAgICAgICBodHRwU3RhdHVzID0gNDA0O1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDA7XG4gICAgfVxuICAgIHJlcy5zdGF0dXMoaHR0cFN0YXR1cyk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGxvZy5lcnJvcignUGFyc2UgZXJyb3I6ICcsIGVycik7XG4gIH0gZWxzZSBpZiAoZXJyLnN0YXR1cyAmJiBlcnIubWVzc2FnZSkge1xuICAgIHJlcy5zdGF0dXMoZXJyLnN0YXR1cyk7XG4gICAgcmVzLmpzb24oeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBsb2cuZXJyb3IoJ1VuY2F1Z2h0IGludGVybmFsIHNlcnZlciBlcnJvci4nLCBlcnIsIGVyci5zdGFjayk7XG4gICAgcmVzLnN0YXR1cyg1MDApO1xuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgIG1lc3NhZ2U6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJyxcbiAgICB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcSwgcmVzLCBuZXh0KSB7XG4gIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXMuc3RhdHVzKDQwMyk7XG4gICAgcmVzLmVuZCgne1wiZXJyb3JcIjpcInVuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZFwifScpO1xuICAgIHJldHVybjtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyhyZXF1ZXN0KSB7XG4gIGlmICghcmVxdWVzdC5hdXRoLmlzTWFzdGVyKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9ICd1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWQnO1xuICAgIHRocm93IGVycm9yO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuZXhwb3J0IGNvbnN0IGFkZFJhdGVMaW1pdCA9IChyb3V0ZSwgY29uZmlnLCBjbG91ZCkgPT4ge1xuICBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZyk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gcm91dGUpIHtcbiAgICBpZiAoIVJhdGVMaW1pdE9wdGlvbnNba2V5XSkge1xuICAgICAgdGhyb3cgYEludmFsaWQgcmF0ZSBsaW1pdCBvcHRpb24gXCIke2tleX1cImA7XG4gICAgfVxuICB9XG4gIGlmICghY29uZmlnLnJhdGVMaW1pdHMpIHtcbiAgICBjb25maWcucmF0ZUxpbWl0cyA9IFtdO1xuICB9XG4gIGNvbnN0IHJlZGlzU3RvcmUgPSB7XG4gICAgY29ubmVjdGlvblByb21pc2U6IFByb21pc2UucmVzb2x2ZSgpLFxuICAgIHN0b3JlOiBudWxsLFxuICAgIGNvbm5lY3RlZDogZmFsc2UsXG4gIH07XG4gIGlmIChyb3V0ZS5yZWRpc1VybCkge1xuICAgIGNvbnN0IGNsaWVudCA9IGNyZWF0ZUNsaWVudCh7XG4gICAgICB1cmw6IHJvdXRlLnJlZGlzVXJsLFxuICAgIH0pO1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAocmVkaXNTdG9yZS5jb25uZWN0ZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcbiAgICAgICAgcmVkaXNTdG9yZS5jb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zdCBsb2cgPSBjb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICAgICAgbG9nLmVycm9yKGBDb3VsZCBub3QgY29ubmVjdCB0byByZWRpc1VSTCBpbiByYXRlIGxpbWl0OiAke2V9YCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgcmVkaXNTdG9yZS5zdG9yZSA9IG5ldyBSZWRpc1N0b3JlKHtcbiAgICAgIHNlbmRDb21tYW5kOiBhc3luYyAoLi4uYXJncykgPT4ge1xuICAgICAgICBhd2FpdCByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2VuZENvbW1hbmQoYXJncyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIGNvbmZpZy5yYXRlTGltaXRzLnB1c2goe1xuICAgIHBhdGg6IHBhdGhUb1JlZ2V4cChyb3V0ZS5yZXF1ZXN0UGF0aCksXG4gICAgaGFuZGxlcjogcmF0ZUxpbWl0KHtcbiAgICAgIHdpbmRvd01zOiByb3V0ZS5yZXF1ZXN0VGltZVdpbmRvdyxcbiAgICAgIG1heDogcm91dGUucmVxdWVzdENvdW50LFxuICAgICAgbWVzc2FnZTogcm91dGUuZXJyb3JSZXNwb25zZU1lc3NhZ2UgfHwgUmF0ZUxpbWl0T3B0aW9ucy5lcnJvclJlc3BvbnNlTWVzc2FnZS5kZWZhdWx0LFxuICAgICAgaGFuZGxlcjogKHJlcXVlc3QsIHJlc3BvbnNlLCBuZXh0LCBvcHRpb25zKSA9PiB7XG4gICAgICAgIHRocm93IHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiBvcHRpb25zLm1lc3NhZ2UsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgc2tpcDogcmVxdWVzdCA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LmlwID09PSAnMTI3LjAuMC4xJyAmJiAhcm91dGUuaW5jbHVkZUludGVybmFsUmVxdWVzdHMpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUuaW5jbHVkZU1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUucmVxdWVzdE1ldGhvZHMpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyb3V0ZS5yZXF1ZXN0TWV0aG9kcykpIHtcbiAgICAgICAgICAgIGlmICghcm91dGUucmVxdWVzdE1ldGhvZHMuaW5jbHVkZXMocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKHJvdXRlLnJlcXVlc3RNZXRob2RzKTtcbiAgICAgICAgICAgIGlmICghcmVnRXhwLnRlc3QocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5hdXRoPy5pc01hc3RlcjtcbiAgICAgIH0sXG4gICAgICBrZXlHZW5lcmF0b3I6IHJlcXVlc3QgPT4ge1xuICAgICAgICByZXR1cm4gcmVxdWVzdC5jb25maWcuaXA7XG4gICAgICB9LFxuICAgICAgc3RvcmU6IHJlZGlzU3RvcmUuc3RvcmUsXG4gICAgfSksXG4gICAgY2xvdWQsXG4gIH0pO1xuICBDb25maWcucHV0KGNvbmZpZyk7XG59O1xuXG4vKipcbiAqIERlZHVwbGljYXRlcyBhIHJlcXVlc3QgdG8gZW5zdXJlIGlkZW1wb3RlbmN5LiBEdXBsaWNhdGVzIGFyZSBkZXRlcm1pbmVkIGJ5IHRoZSByZXF1ZXN0IElEXG4gKiBpbiB0aGUgcmVxdWVzdCBoZWFkZXIuIElmIGEgcmVxdWVzdCBoYXMgbm8gcmVxdWVzdCBJRCwgaXQgaXMgZXhlY3V0ZWQgYW55d2F5LlxuICogQHBhcmFtIHsqfSByZXEgVGhlIHJlcXVlc3QgdG8gZXZhbHVhdGUuXG4gKiBAcmV0dXJucyBQcm9taXNlPHt9PlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5KHJlcSkge1xuICAvLyBFbmFibGUgZmVhdHVyZSBvbmx5IGZvciBNb25nb0RCXG4gIGlmIChcbiAgICAhKFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlciB8fFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlclxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIEdldCBwYXJhbWV0ZXJzXG4gIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gIGNvbnN0IHJlcXVlc3RJZCA9ICgocmVxIHx8IHt9KS5oZWFkZXJzIHx8IHt9KVsneC1wYXJzZS1yZXF1ZXN0LWlkJ107XG4gIGNvbnN0IHsgcGF0aHMsIHR0bCB9ID0gY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgaWYgKCFyZXF1ZXN0SWQgfHwgIWNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUmVxdWVzdCBwYXRoIG1heSBjb250YWluIHRyYWlsaW5nIHNsYXNoZXMsIGRlcGVuZGluZyBvbiB0aGUgb3JpZ2luYWwgcmVxdWVzdCwgc28gcmVtb3ZlXG4gIC8vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgdG8gbWFrZSBpdCBlYXNpZXIgdG8gc3BlY2lmeSBwYXRocyBpbiB0aGUgY29uZmlndXJhdGlvblxuICBjb25zdCByZXFQYXRoID0gcmVxLnBhdGgucmVwbGFjZSgvXlxcL3xcXC8kLywgJycpO1xuICAvLyBEZXRlcm1pbmUgd2hldGhlciBpZGVtcG90ZW5jeSBpcyBlbmFibGVkIGZvciBjdXJyZW50IHJlcXVlc3QgcGF0aFxuICBsZXQgbWF0Y2ggPSBmYWxzZTtcbiAgZm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG4gICAgLy8gQXNzdW1lIG9uZSB3YW50cyBhIHBhdGggdG8gYWx3YXlzIG1hdGNoIGZyb20gdGhlIGJlZ2lubmluZyB0byBwcmV2ZW50IGFueSBtaXN0YWtlc1xuICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXRoLmNoYXJBdCgwKSA9PT0gJ14nID8gcGF0aCA6ICdeJyArIHBhdGgpO1xuICAgIGlmIChyZXFQYXRoLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVHJ5IHRvIHN0b3JlIHJlcXVlc3RcbiAgY29uc3QgZXhwaXJ5RGF0ZSA9IG5ldyBEYXRlKG5ldyBEYXRlKCkuc2V0U2Vjb25kcyhuZXcgRGF0ZSgpLmdldFNlY29uZHMoKSArIHR0bCkpO1xuICByZXR1cm4gcmVzdFxuICAgIC5jcmVhdGUoY29uZmlnLCBhdXRoLm1hc3Rlcihjb25maWcpLCAnX0lkZW1wb3RlbmN5Jywge1xuICAgICAgcmVxSWQ6IHJlcXVlc3RJZCxcbiAgICAgIGV4cGlyZTogUGFyc2UuX2VuY29kZShleHBpcnlEYXRlKSxcbiAgICB9KVxuICAgIC5jYXRjaChlID0+IHtcbiAgICAgIGlmIChlLmNvZGUgPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfUkVRVUVTVCwgJ0R1cGxpY2F0ZSByZXF1ZXN0Jyk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMyk7XG4gIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWRcIn0nKTtcbn1cblxuZnVuY3Rpb24gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMCk7XG4gIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBlcnJvcjogJ0ludmFsaWQgb2JqZWN0IGZvciBjb250ZXh0LicgfSk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBQUEsSUFBQUEsTUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsS0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsS0FBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUcsT0FBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksVUFBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sS0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8sb0JBQUEsR0FBQVIsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFRLHVCQUFBLEdBQUFULHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBUyxpQkFBQSxHQUFBVixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVUsWUFBQSxHQUFBVixPQUFBO0FBQ0EsSUFBQVcsYUFBQSxHQUFBWixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVks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