"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowDoubleForwardSlash = allowDoubleForwardSlash;
exports.allowMethodOverride = allowMethodOverride;
exports.checkIp = void 0;
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
var _logger = _interopRequireDefault(require("./logger"));
var _rest = _interopRequireDefault(require("./rest"));
var _MongoStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
var _Definitions = require("./Options/Definitions");
var _pathToRegexp = require("path-to-regexp");
var _rateLimitRedis = _interopRequireDefault(require("rate-limit-redis"));
var _redis = require("redis");
var _net = require("net");
var _Error = require("./Error");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const DEFAULT_ALLOWED_HEADERS = exports.DEFAULT_ALLOWED_HEADERS = 'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';
const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};
const getBlockList = (ipRangeList, store) => {
  if (store.get('blockList')) {
    return store.get('blockList');
  }
  const blockList = new _net.BlockList();
  ipRangeList.forEach(fullIp => {
    if (fullIp === '::/0' || fullIp === '::') {
      store.set('allowAllIpv6', true);
      return;
    }
    if (fullIp === '0.0.0.0/0' || fullIp === '0.0.0.0') {
      store.set('allowAllIpv4', true);
      return;
    }
    const [ip, mask] = fullIp.split('/');
    if (!mask) {
      blockList.addAddress(ip, (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    } else {
      blockList.addSubnet(ip, Number(mask), (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    }
  });
  store.set('blockList', blockList);
  return blockList;
};
const checkIp = (ip, ipRangeList, store) => {
  const incomingIpIsV4 = (0, _net.isIPv4)(ip);
  const blockList = getBlockList(ipRangeList, store);
  if (store.get(ip)) {
    return true;
  }
  if (store.get('allowAllIpv4') && incomingIpIsV4) {
    return true;
  }
  if (store.get('allowAllIpv6') && !incomingIpIsV4) {
    return true;
  }
  const result = blockList.check(ip, incomingIpIsV4 ? 'ipv4' : 'ipv6');

  // If the ip is in the list, we store the result in the store
  // so we have a optimized path for the next request
  if (ipRangeList.includes(ip) && result) {
    store.set(ip, result);
  }
  return result;
};

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
exports.checkIp = checkIp;
async function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);
  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch {
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
      } catch {
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
      delete req.body._ClientVersion;
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
          } catch {
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
  if (fileViaJSON && req.body) {
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
  await config.loadKeys();
  info.app = _cache.default.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;
  const isMaintenance = req.config.maintenanceKey && info.maintenanceKey === req.config.maintenanceKey;
  if (isMaintenance) {
    if (checkIp(clientIp, req.config.maintenanceKeyIps || [], req.config.maintenanceKeyIpsStore)) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = req.config?.loggerController || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  const masterKey = await req.config.loadMasterKey();
  let isMaster = info.masterKey === masterKey;
  if (isMaster && !checkIp(clientIp, req.config.masterKeyIps || [], req.config.masterKeyIpsStore)) {
    const log = req.config?.loggerController || _logger.default;
    log.error(`Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`);
    isMaster = false;
    const error = new Error();
    error.status = 403;
    error.message = `unauthorized`;
    throw error;
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
    if (req.auth || req.url === '/sessions/me') {
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
  if (!(req.req || req).headers.authorization) {
    return;
  }
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
    const baseOrigins = typeof config?.allowOrigin === 'string' ? [config.allowOrigin] : config?.allowOrigin ?? ['*'];
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
  if (req.method === 'POST' && req.body?._method) {
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
    const error = (0, _Error.createSanitizedHttpError)(403, 'unauthorized: master key is required', req.config);
    res.status(error.status);
    res.end(`{"error":"${error.message}"}`);
    return;
  }
  next();
}
function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    throw (0, _Error.createSanitizedHttpError)(403, 'unauthorized: master key is required', request.config);
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
    store: null
  };
  if (route.redisUrl) {
    const log = config?.loggerController || _logger.default;
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    client.on('error', err => {
      log.error('Middlewares addRateLimit Redis client error', {
        error: err
      });
    });
    client.on('connect', () => {});
    client.on('reconnecting', () => {});
    client.on('ready', () => {});
    redisStore.connectionPromise = async () => {
      if (client.isOpen) {
        return;
      }
      try {
        await client.connect();
      } catch (e) {
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
  let transformPath = route.requestPath.split('/*').join('/(.*)');
  if (transformPath === '*') {
    transformPath = '(.*)';
  }
  config.rateLimits.push({
    path: (0, _pathToRegexp.pathToRegexp)(transformPath),
    requestCount: route.requestCount,
    requestMethods: route.requestMethods,
    includeMasterKey: route.includeMasterKey,
    includeInternalRequests: route.includeInternalRequests,
    errorResponseMessage: route.errorResponseMessage || _Definitions.RateLimitOptions.errorResponseMessage.default,
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
        return request.auth?.isMaster;
      },
      keyGenerator: async request => {
        if (route.zone === _node.default.Server.RateLimitZone.global) {
          return request.config.appId;
        }
        const token = request.info.sessionToken;
        if (route.zone === _node.default.Server.RateLimitZone.session && token) {
          return token;
        }
        if (route.zone === _node.default.Server.RateLimitZone.user && token) {
          if (!request.auth) {
            await new Promise(resolve => handleParseSession(request, null, resolve));
          }
          if (request.auth?.user?.id && request.zone === 'user') {
            return request.auth.user.id;
          }
        }
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

/**
 * Express 4 allowed a double forward slash between a route and router. Although
 * this should be considered an anti-pattern, we need to support it for backwards
 * compatibility.
 *
 * Technically valid URL with double foroward slash:
 * http://localhost:1337/parse//functions/testFunction
 */
function allowDoubleForwardSlash(req, res, next) {
  req.url = req.url.startsWith('//') ? req.url.substring(1) : req.url;
  next();
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX2xvZ2dlciIsIl9yZXN0IiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9leHByZXNzUmF0ZUxpbWl0IiwiX0RlZmluaXRpb25zIiwiX3BhdGhUb1JlZ2V4cCIsIl9yYXRlTGltaXRSZWRpcyIsIl9yZWRpcyIsIl9uZXQiLCJfRXJyb3IiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImV4cG9ydHMiLCJnZXRNb3VudEZvclJlcXVlc3QiLCJyZXEiLCJtb3VudFBhdGhMZW5ndGgiLCJvcmlnaW5hbFVybCIsImxlbmd0aCIsInVybCIsIm1vdW50UGF0aCIsInNsaWNlIiwicHJvdG9jb2wiLCJnZXQiLCJnZXRCbG9ja0xpc3QiLCJpcFJhbmdlTGlzdCIsInN0b3JlIiwiYmxvY2tMaXN0IiwiQmxvY2tMaXN0IiwiZm9yRWFjaCIsImZ1bGxJcCIsInNldCIsImlwIiwibWFzayIsInNwbGl0IiwiYWRkQWRkcmVzcyIsImlzSVB2NCIsImFkZFN1Ym5ldCIsIk51bWJlciIsImNoZWNrSXAiLCJpbmNvbWluZ0lwSXNWNCIsInJlc3VsdCIsImNoZWNrIiwiaW5jbHVkZXMiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyZXMiLCJuZXh0IiwibW91bnQiLCJjb250ZXh0IiwiSlNPTiIsInBhcnNlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwibWFsZm9ybWVkQ29udGV4dCIsImluZm8iLCJhcHBJZCIsInNlc3Npb25Ub2tlbiIsIm1hc3RlcktleSIsIm1haW50ZW5hbmNlS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJjbGllbnRLZXkiLCJqYXZhc2NyaXB0S2V5IiwiZG90TmV0S2V5IiwicmVzdEFQSUtleSIsImJhc2ljQXV0aCIsImh0dHBBdXRoIiwiYmFzaWNBdXRoQXBwSWQiLCJBcHBDYWNoZSIsImJvZHkiLCJfbm9Cb2R5IiwiZmlsZVZpYUpTT04iLCJCdWZmZXIiLCJpbnZhbGlkUmVxdWVzdCIsIl9SZXZvY2FibGVTZXNzaW9uIiwiX0FwcGxpY2F0aW9uSWQiLCJfSmF2YVNjcmlwdEtleSIsIl9DbGllbnRWZXJzaW9uIiwiX0luc3RhbGxhdGlvbklkIiwiX1Nlc3Npb25Ub2tlbiIsIl9NYXN0ZXJLZXkiLCJfY29udGV4dCIsIl9Db250ZW50VHlwZSIsImhlYWRlcnMiLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImxvYWRLZXlzIiwiYXBwIiwiaXNNYWludGVuYW5jZSIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJsb2FkTWFzdGVyS2V5IiwiaXNNYXN0ZXIiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXlJcHNTdG9yZSIsIm1lc3NhZ2UiLCJoYW5kbGVSYXRlTGltaXQiLCJpc1JlYWRPbmx5TWFzdGVyIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJpc1JlYWRPbmx5Iiwia2V5cyIsIm9uZUtleUNvbmZpZ3VyZWQiLCJzb21lIiwia2V5IiwidW5kZWZpbmVkIiwib25lS2V5TWF0Y2hlcyIsInVzZXJGcm9tSldUIiwidXNlciIsInJhdGVMaW1pdHMiLCJQcm9taXNlIiwiYWxsIiwibWFwIiwibGltaXQiLCJwYXRoRXhwIiwiUmVnRXhwIiwicGF0aCIsInRlc3QiLCJoYW5kbGVyIiwiZXJyIiwiQ09OTkVDVElPTl9GQUlMRUQiLCJoYW5kbGVQYXJzZVNlc3Npb24iLCJyZXF1ZXN0QXV0aCIsImluZGV4T2YiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsIlVOS05PV05fRVJST1IiLCJhdXRob3JpemF0aW9uIiwiaGVhZGVyIiwiYXV0aFByZWZpeCIsIm1hdGNoIiwidG9Mb3dlckNhc2UiLCJlbmNvZGVkQXV0aCIsInN1YnN0cmluZyIsImNyZWRlbnRpYWxzIiwiZGVjb2RlQmFzZTY0IiwianNLZXlQcmVmaXgiLCJtYXRjaEtleSIsInN0ciIsImFsbG93Q3Jvc3NEb21haW4iLCJhbGxvd0hlYWRlcnMiLCJqb2luIiwiYmFzZU9yaWdpbnMiLCJhbGxvd09yaWdpbiIsInJlcXVlc3RPcmlnaW4iLCJvcmlnaW4iLCJhbGxvd09yaWdpbnMiLCJtZXRob2QiLCJzZW5kU3RhdHVzIiwiYWxsb3dNZXRob2RPdmVycmlkZSIsIl9tZXRob2QiLCJvcmlnaW5hbE1ldGhvZCIsImhhbmRsZVBhcnNlRXJyb3JzIiwiZW5hYmxlRXhwcmVzc0Vycm9ySGFuZGxlciIsImh0dHBTdGF0dXMiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicHJvY2VzcyIsImVudiIsIlRFU1RJTkciLCJzdGFjayIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJjcmVhdGVTYW5pdGl6ZWRIdHRwRXJyb3IiLCJlbmQiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyIsInJlcXVlc3QiLCJyZXNvbHZlIiwiYWRkUmF0ZUxpbWl0Iiwicm91dGUiLCJjbG91ZCIsIlJhdGVMaW1pdE9wdGlvbnMiLCJyZWRpc1N0b3JlIiwiY29ubmVjdGlvblByb21pc2UiLCJyZWRpc1VybCIsImNsaWVudCIsImNyZWF0ZUNsaWVudCIsIm9uIiwiaXNPcGVuIiwiY29ubmVjdCIsIlJlZGlzU3RvcmUiLCJzZW5kQ29tbWFuZCIsImFyZ3MiLCJ0cmFuc2Zvcm1QYXRoIiwicmVxdWVzdFBhdGgiLCJwdXNoIiwicGF0aFRvUmVnZXhwIiwicmVxdWVzdENvdW50IiwicmVxdWVzdE1ldGhvZHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXNwb25zZSIsIm9wdGlvbnMiLCJza2lwIiwiQXJyYXkiLCJpc0FycmF5IiwicmVnRXhwIiwia2V5R2VuZXJhdG9yIiwiem9uZSIsIlNlcnZlciIsIlJhdGVMaW1pdFpvbmUiLCJnbG9iYWwiLCJ0b2tlbiIsInNlc3Npb24iLCJpZCIsInB1dCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImRhdGFiYXNlIiwiYWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwicmVxdWVzdElkIiwicGF0aHMiLCJ0dGwiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJyZXFQYXRoIiwicmVwbGFjZSIsInJlZ2V4IiwiY2hhckF0IiwiZXhwaXJ5RGF0ZSIsIkRhdGUiLCJzZXRTZWNvbmRzIiwiZ2V0U2Vjb25kcyIsInJlc3QiLCJjcmVhdGUiLCJtYXN0ZXIiLCJyZXFJZCIsImV4cGlyZSIsIl9lbmNvZGUiLCJjYXRjaCIsIkRVUExJQ0FURV9WQUxVRSIsIkRVUExJQ0FURV9SRVFVRVNUIiwiSU5WQUxJRF9KU09OIiwiYWxsb3dEb3VibGVGb3J3YXJkU2xhc2giLCJzdGFydHNXaXRoIl0sInNvdXJjZXMiOlsiLi4vc3JjL21pZGRsZXdhcmVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBBcHBDYWNoZSBmcm9tICcuL2NhY2hlJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBhdXRoIGZyb20gJy4vQXV0aCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuaW1wb3J0IHsgY3JlYXRlU2FuaXRpemVkSHR0cEVycm9yIH0gZnJvbSAnLi9FcnJvcic7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0FMTE9XRURfSEVBREVSUyA9XG4gICdYLVBhcnNlLU1hc3Rlci1LZXksIFgtUGFyc2UtUkVTVC1BUEktS2V5LCBYLVBhcnNlLUphdmFzY3JpcHQtS2V5LCBYLVBhcnNlLUFwcGxpY2F0aW9uLUlkLCBYLVBhcnNlLUNsaWVudC1WZXJzaW9uLCBYLVBhcnNlLVNlc3Npb24tVG9rZW4sIFgtUmVxdWVzdGVkLVdpdGgsIFgtUGFyc2UtUmV2b2NhYmxlLVNlc3Npb24sIFgtUGFyc2UtUmVxdWVzdC1JZCwgQ29udGVudC1UeXBlLCBQcmFnbWEsIENhY2hlLUNvbnRyb2wnO1xuXG5jb25zdCBnZXRNb3VudEZvclJlcXVlc3QgPSBmdW5jdGlvbiAocmVxKSB7XG4gIGNvbnN0IG1vdW50UGF0aExlbmd0aCA9IHJlcS5vcmlnaW5hbFVybC5sZW5ndGggLSByZXEudXJsLmxlbmd0aDtcbiAgY29uc3QgbW91bnRQYXRoID0gcmVxLm9yaWdpbmFsVXJsLnNsaWNlKDAsIG1vdW50UGF0aExlbmd0aCk7XG4gIHJldHVybiByZXEucHJvdG9jb2wgKyAnOi8vJyArIHJlcS5nZXQoJ2hvc3QnKSArIG1vdW50UGF0aDtcbn07XG5cbmNvbnN0IGdldEJsb2NrTGlzdCA9IChpcFJhbmdlTGlzdCwgc3RvcmUpID0+IHtcbiAgaWYgKHN0b3JlLmdldCgnYmxvY2tMaXN0JykpIHsgcmV0dXJuIHN0b3JlLmdldCgnYmxvY2tMaXN0Jyk7IH1cbiAgY29uc3QgYmxvY2tMaXN0ID0gbmV3IEJsb2NrTGlzdCgpO1xuICBpcFJhbmdlTGlzdC5mb3JFYWNoKGZ1bGxJcCA9PiB7XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzo6LzAnIHx8IGZ1bGxJcCA9PT0gJzo6Jykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjYnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzAuMC4wLjAvMCcgfHwgZnVsbElwID09PSAnMC4wLjAuMCcpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY0JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IFtpcCwgbWFza10gPSBmdWxsSXAuc3BsaXQoJy8nKTtcbiAgICBpZiAoIW1hc2spIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRBZGRyZXNzKGlwLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmxvY2tMaXN0LmFkZFN1Ym5ldChpcCwgTnVtYmVyKG1hc2spLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9XG4gIH0pO1xuICBzdG9yZS5zZXQoJ2Jsb2NrTGlzdCcsIGJsb2NrTGlzdCk7XG4gIHJldHVybiBibG9ja0xpc3Q7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tJcCA9IChpcCwgaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGNvbnN0IGluY29taW5nSXBJc1Y0ID0gaXNJUHY0KGlwKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gZ2V0QmxvY2tMaXN0KGlwUmFuZ2VMaXN0LCBzdG9yZSk7XG5cbiAgaWYgKHN0b3JlLmdldChpcCkpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHN0b3JlLmdldCgnYWxsb3dBbGxJcHY0JykgJiYgaW5jb21pbmdJcElzVjQpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHN0b3JlLmdldCgnYWxsb3dBbGxJcHY2JykgJiYgIWluY29taW5nSXBJc1Y0KSB7IHJldHVybiB0cnVlOyB9XG4gIGNvbnN0IHJlc3VsdCA9IGJsb2NrTGlzdC5jaGVjayhpcCwgaW5jb21pbmdJcElzVjQgPyAnaXB2NCcgOiAnaXB2NicpO1xuXG4gIC8vIElmIHRoZSBpcCBpcyBpbiB0aGUgbGlzdCwgd2Ugc3RvcmUgdGhlIHJlc3VsdCBpbiB0aGUgc3RvcmVcbiAgLy8gc28gd2UgaGF2ZSBhIG9wdGltaXplZCBwYXRoIGZvciB0aGUgbmV4dCByZXF1ZXN0XG4gIGlmIChpcFJhbmdlTGlzdC5pbmNsdWRlcyhpcCkgJiYgcmVzdWx0KSB7XG4gICAgc3RvcmUuc2V0KGlwLCByZXN1bHQpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vLyBDaGVja3MgdGhhdCB0aGUgcmVxdWVzdCBpcyBhdXRob3JpemVkIGZvciB0aGlzIGFwcCBhbmQgY2hlY2tzIHVzZXJcbi8vIGF1dGggdG9vLlxuLy8gVGhlIGJvZHlwYXJzZXIgc2hvdWxkIHJ1biBiZWZvcmUgdGhpcyBtaWRkbGV3YXJlLlxuLy8gQWRkcyBpbmZvIHRvIHRoZSByZXF1ZXN0OlxuLy8gcmVxLmNvbmZpZyAtIHRoZSBDb25maWcgZm9yIHRoaXMgYXBwXG4vLyByZXEuYXV0aCAtIHRoZSBBdXRoIGZvciB0aGlzIHJlcXVlc3RcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVQYXJzZUhlYWRlcnMocmVxLCByZXMsIG5leHQpIHtcbiAgdmFyIG1vdW50ID0gZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSk7XG5cbiAgbGV0IGNvbnRleHQgPSB7fTtcbiAgaWYgKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykpO1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG4gIHZhciBpbmZvID0ge1xuICAgIGFwcElkOiByZXEuZ2V0KCdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJyksXG4gICAgc2Vzc2lvblRva2VuOiByZXEuZ2V0KCdYLVBhcnNlLVNlc3Npb24tVG9rZW4nKSxcbiAgICBtYXN0ZXJLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFzdGVyLUtleScpLFxuICAgIG1haW50ZW5hbmNlS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1haW50ZW5hbmNlLUtleScpLFxuICAgIGluc3RhbGxhdGlvbklkOiByZXEuZ2V0KCdYLVBhcnNlLUluc3RhbGxhdGlvbi1JZCcpLFxuICAgIGNsaWVudEtleTogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtS2V5JyksXG4gICAgamF2YXNjcmlwdEtleTogcmVxLmdldCgnWC1QYXJzZS1KYXZhc2NyaXB0LUtleScpLFxuICAgIGRvdE5ldEtleTogcmVxLmdldCgnWC1QYXJzZS1XaW5kb3dzLUtleScpLFxuICAgIHJlc3RBUElLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtUkVTVC1BUEktS2V5JyksXG4gICAgY29udGV4dDogY29udGV4dCxcbiAgfTtcblxuICB2YXIgYmFzaWNBdXRoID0gaHR0cEF1dGgocmVxKTtcblxuICBpZiAoYmFzaWNBdXRoKSB7XG4gICAgdmFyIGJhc2ljQXV0aEFwcElkID0gYmFzaWNBdXRoLmFwcElkO1xuICAgIGlmIChBcHBDYWNoZS5nZXQoYmFzaWNBdXRoQXBwSWQpKSB7XG4gICAgICBpbmZvLmFwcElkID0gYmFzaWNBdXRoQXBwSWQ7XG4gICAgICBpbmZvLm1hc3RlcktleSA9IGJhc2ljQXV0aC5tYXN0ZXJLZXkgfHwgaW5mby5tYXN0ZXJLZXk7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSBiYXNpY0F1dGguamF2YXNjcmlwdEtleSB8fCBpbmZvLmphdmFzY3JpcHRLZXk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlcS5ib2R5KSB7XG4gICAgLy8gVW5pdHkgU0RLIHNlbmRzIGEgX25vQm9keSBrZXkgd2hpY2ggbmVlZHMgdG8gYmUgcmVtb3ZlZC5cbiAgICAvLyBVbmNsZWFyIGF0IHRoaXMgcG9pbnQgaWYgYWN0aW9uIG5lZWRzIHRvIGJlIHRha2VuLlxuICAgIGRlbGV0ZSByZXEuYm9keS5fbm9Cb2R5O1xuICB9XG5cbiAgdmFyIGZpbGVWaWFKU09OID0gZmFsc2U7XG5cbiAgaWYgKCFpbmZvLmFwcElkIHx8ICFBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCkpIHtcbiAgICAvLyBTZWUgaWYgd2UgY2FuIGZpbmQgdGhlIGFwcCBpZCBvbiB0aGUgYm9keS5cbiAgICBpZiAocmVxLmJvZHkgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgIC8vIFRoZSBvbmx5IGNoYW5jZSB0byBmaW5kIHRoZSBhcHAgaWQgaXMgaWYgdGhpcyBpcyBhIGZpbGVcbiAgICAgIC8vIHVwbG9hZCB0aGF0IGFjdHVhbGx5IGlzIGEgSlNPTiBib2R5LiBTbyB0cnkgdG8gcGFyc2UgaXQuXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvNjU4OVxuICAgICAgLy8gSXQgaXMgYWxzbyBwb3NzaWJsZSB0aGF0IHRoZSBjbGllbnQgaXMgdHJ5aW5nIHRvIHVwbG9hZCBhIGZpbGUgYnV0IGZvcmdvdFxuICAgICAgLy8gdG8gcHJvdmlkZSB4LXBhcnNlLWFwcC1pZCBpbiBoZWFkZXIgYW5kIHBhcnNlIGEgYmluYXJ5IGZpbGUgd2lsbCBmYWlsXG4gICAgICB0cnkge1xuICAgICAgICByZXEuYm9keSA9IEpTT04ucGFyc2UocmVxLmJvZHkpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICB9XG4gICAgICBmaWxlVmlhSlNPTiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5ib2R5KSB7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX1Jldm9jYWJsZVNlc3Npb247XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgcmVxLmJvZHkgJiZcbiAgICAgIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkICYmXG4gICAgICBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpICYmXG4gICAgICAoIWluZm8ubWFzdGVyS2V5IHx8IEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkubWFzdGVyS2V5ID09PSBpbmZvLm1hc3RlcktleSlcbiAgICApIHtcbiAgICAgIGluZm8uYXBwSWQgPSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5IHx8ICcnO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5O1xuICAgICAgLy8gVE9ETzogdGVzdCB0aGF0IHRoZSBSRVNUIEFQSSBmb3JtYXRzIGdlbmVyYXRlZCBieSB0aGUgb3RoZXJcbiAgICAgIC8vIFNES3MgYXJlIGhhbmRsZWQgb2tcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgIGlmIChyZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgaW5mby5pbnN0YWxsYXRpb25JZCA9IHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fU2Vzc2lvblRva2VuKSB7XG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX01hc3RlcktleSkge1xuICAgICAgICBpbmZvLm1hc3RlcktleSA9IHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0KSB7XG4gICAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgIGluZm8uY29udGV4dCA9IHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpbmZvLmNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5ib2R5Ll9jb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoaW5mby5jb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fQ29udGVudFR5cGUpIHtcbiAgICAgICAgcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbmZvLnNlc3Npb25Ub2tlbiAmJiB0eXBlb2YgaW5mby5zZXNzaW9uVG9rZW4gIT09ICdzdHJpbmcnKSB7XG4gICAgaW5mby5zZXNzaW9uVG9rZW4gPSBpbmZvLnNlc3Npb25Ub2tlbi50b1N0cmluZygpO1xuICB9XG5cbiAgaWYgKGZpbGVWaWFKU09OICYmIHJlcS5ib2R5KSB7XG4gICAgcmVxLmZpbGVEYXRhID0gcmVxLmJvZHkuZmlsZURhdGE7XG4gICAgLy8gV2UgbmVlZCB0byByZXBvcHVsYXRlIHJlcS5ib2R5IHdpdGggYSBidWZmZXJcbiAgICB2YXIgYmFzZTY0ID0gcmVxLmJvZHkuYmFzZTY0O1xuICAgIHJlcS5ib2R5ID0gQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0Jyk7XG4gIH1cblxuICBjb25zdCBjbGllbnRJcCA9IGdldENsaWVudElwKHJlcSk7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoaW5mby5hcHBJZCwgbW91bnQpO1xuICBpZiAoY29uZmlnLnN0YXRlICYmIGNvbmZpZy5zdGF0ZSAhPT0gJ29rJykge1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBlcnJvcjogYEludmFsaWQgc2VydmVyIHN0YXRlOiAke2NvbmZpZy5zdGF0ZX1gLFxuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBjb25maWcubG9hZEtleXMoKTtcblxuICBpbmZvLmFwcCA9IEFwcENhY2hlLmdldChpbmZvLmFwcElkKTtcbiAgcmVxLmNvbmZpZyA9IGNvbmZpZztcbiAgcmVxLmNvbmZpZy5oZWFkZXJzID0gcmVxLmhlYWRlcnMgfHwge307XG4gIHJlcS5jb25maWcuaXAgPSBjbGllbnRJcDtcbiAgcmVxLmluZm8gPSBpbmZvO1xuXG4gIGNvbnN0IGlzTWFpbnRlbmFuY2UgPVxuICAgIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXkgJiYgaW5mby5tYWludGVuYW5jZUtleSA9PT0gcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleTtcbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICBpZiAoY2hlY2tJcChjbGllbnRJcCwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwcyB8fCBbXSwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwc1N0b3JlKSkge1xuICAgICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgaXNNYWludGVuYW5jZTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFpbnRlbmFuY2Uga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21haW50ZW5hbmNlS2V5SXBzJy5gXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IG1hc3RlcktleSA9IGF3YWl0IHJlcS5jb25maWcubG9hZE1hc3RlcktleSgpO1xuICBsZXQgaXNNYXN0ZXIgPSBpbmZvLm1hc3RlcktleSA9PT0gbWFzdGVyS2V5O1xuXG4gIGlmIChpc01hc3RlciAmJiAhY2hlY2tJcChjbGllbnRJcCwgcmVxLmNvbmZpZy5tYXN0ZXJLZXlJcHMgfHwgW10sIHJlcS5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUpKSB7XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1hc3RlciBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFzdGVyS2V5SXBzJy5gXG4gICAgKTtcbiAgICBpc01hc3RlciA9IGZhbHNlO1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSBgdW5hdXRob3JpemVkYDtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgdmFyIGlzUmVhZE9ubHlNYXN0ZXIgPSBpbmZvLm1hc3RlcktleSA9PT0gcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleTtcbiAgaWYgKFxuICAgIHR5cGVvZiByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICE9ICd1bmRlZmluZWQnICYmXG4gICAgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAmJlxuICAgIGlzUmVhZE9ubHlNYXN0ZXJcbiAgKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgICBpc1JlYWRPbmx5OiB0cnVlLFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgLy8gQ2xpZW50IGtleXMgYXJlIG5vdCByZXF1aXJlZCBpbiBwYXJzZS1zZXJ2ZXIsIGJ1dCBpZiBhbnkgaGF2ZSBiZWVuIGNvbmZpZ3VyZWQgaW4gdGhlIHNlcnZlciwgdmFsaWRhdGUgdGhlbVxuICAvLyAgdG8gcHJlc2VydmUgb3JpZ2luYWwgYmVoYXZpb3IuXG4gIGNvbnN0IGtleXMgPSBbJ2NsaWVudEtleScsICdqYXZhc2NyaXB0S2V5JywgJ2RvdE5ldEtleScsICdyZXN0QVBJS2V5J107XG4gIGNvbnN0IG9uZUtleUNvbmZpZ3VyZWQgPSBrZXlzLnNvbWUoZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiByZXEuY29uZmlnW2tleV0gIT09IHVuZGVmaW5lZDtcbiAgfSk7XG4gIGNvbnN0IG9uZUtleU1hdGNoZXMgPSBrZXlzLnNvbWUoZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiByZXEuY29uZmlnW2tleV0gIT09IHVuZGVmaW5lZCAmJiBpbmZvW2tleV0gPT09IHJlcS5jb25maWdba2V5XTtcbiAgfSk7XG5cbiAgaWYgKG9uZUtleUNvbmZpZ3VyZWQgJiYgIW9uZUtleU1hdGNoZXMpIHtcbiAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICB9XG5cbiAgaWYgKHJlcS51cmwgPT0gJy9sb2dpbicpIHtcbiAgICBkZWxldGUgaW5mby5zZXNzaW9uVG9rZW47XG4gIH1cblxuICBpZiAocmVxLnVzZXJGcm9tSldUKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgdXNlcjogcmVxLnVzZXJGcm9tSldULFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgaWYgKCFpbmZvLnNlc3Npb25Ub2tlbikge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICB9KTtcbiAgfVxuICBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xufVxuXG5jb25zdCBoYW5kbGVSYXRlTGltaXQgPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgY29uc3QgcmF0ZUxpbWl0cyA9IHJlcS5jb25maWcucmF0ZUxpbWl0cyB8fCBbXTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIHJhdGVMaW1pdHMubWFwKGFzeW5jIGxpbWl0ID0+IHtcbiAgICAgICAgY29uc3QgcGF0aEV4cCA9IG5ldyBSZWdFeHAobGltaXQucGF0aCk7XG4gICAgICAgIGlmIChwYXRoRXhwLnRlc3QocmVxLnVybCkpIHtcbiAgICAgICAgICBhd2FpdCBsaW1pdC5oYW5kbGVyKHJlcSwgcmVzLCBlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcihcbiAgICAgICAgICAgICAgICAnQW4gdW5rbm93biBlcnJvciBvY2N1cmVkIHdoZW4gYXR0ZW1wdGluZyB0byBhcHBseSB0aGUgcmF0ZSBsaW1pdGVyOiAnLFxuICAgICAgICAgICAgICAgIGVyclxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmVzLnN0YXR1cyg0MjkpO1xuICAgIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICBuZXh0KCk7XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlUGFyc2VTZXNzaW9uID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgaW5mbyA9IHJlcS5pbmZvO1xuICAgIGlmIChyZXEuYXV0aCB8fCByZXEudXJsID09PSAnL3Nlc3Npb25zL21lJykge1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgcmVxdWVzdEF1dGggPSBudWxsO1xuICAgIGlmIChcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuICYmXG4gICAgICByZXEudXJsID09PSAnL3VwZ3JhZGVUb1Jldm9jYWJsZVNlc3Npb24nICYmXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbi5pbmRleE9mKCdyOicpICE9IDBcbiAgICApIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmVxLmF1dGggPSByZXF1ZXN0QXV0aDtcbiAgICBuZXh0KCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBUT0RPOiBEZXRlcm1pbmUgdGhlIGNvcnJlY3QgZXJyb3Igc2NlbmFyaW8uXG4gICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKCdlcnJvciBnZXR0aW5nIGF1dGggZm9yIHNlc3Npb25Ub2tlbicsIGVycm9yKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVU5LTk9XTl9FUlJPUiwgZXJyb3IpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBnZXRDbGllbnRJcChyZXEpIHtcbiAgcmV0dXJuIHJlcS5pcDtcbn1cblxuZnVuY3Rpb24gaHR0cEF1dGgocmVxKSB7XG4gIGlmICghKHJlcS5yZXEgfHwgcmVxKS5oZWFkZXJzLmF1dGhvcml6YXRpb24pIHsgcmV0dXJuOyB9XG5cbiAgdmFyIGhlYWRlciA9IChyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uO1xuICB2YXIgYXBwSWQsIG1hc3RlcktleSwgamF2YXNjcmlwdEtleTtcblxuICAvLyBwYXJzZSBoZWFkZXJcbiAgdmFyIGF1dGhQcmVmaXggPSAnYmFzaWMgJztcblxuICB2YXIgbWF0Y2ggPSBoZWFkZXIudG9Mb3dlckNhc2UoKS5pbmRleE9mKGF1dGhQcmVmaXgpO1xuXG4gIGlmIChtYXRjaCA9PSAwKSB7XG4gICAgdmFyIGVuY29kZWRBdXRoID0gaGVhZGVyLnN1YnN0cmluZyhhdXRoUHJlZml4Lmxlbmd0aCwgaGVhZGVyLmxlbmd0aCk7XG4gICAgdmFyIGNyZWRlbnRpYWxzID0gZGVjb2RlQmFzZTY0KGVuY29kZWRBdXRoKS5zcGxpdCgnOicpO1xuXG4gICAgaWYgKGNyZWRlbnRpYWxzLmxlbmd0aCA9PSAyKSB7XG4gICAgICBhcHBJZCA9IGNyZWRlbnRpYWxzWzBdO1xuICAgICAgdmFyIGtleSA9IGNyZWRlbnRpYWxzWzFdO1xuXG4gICAgICB2YXIganNLZXlQcmVmaXggPSAnamF2YXNjcmlwdC1rZXk9JztcblxuICAgICAgdmFyIG1hdGNoS2V5ID0ga2V5LmluZGV4T2YoanNLZXlQcmVmaXgpO1xuICAgICAgaWYgKG1hdGNoS2V5ID09IDApIHtcbiAgICAgICAgamF2YXNjcmlwdEtleSA9IGtleS5zdWJzdHJpbmcoanNLZXlQcmVmaXgubGVuZ3RoLCBrZXkubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1hc3RlcktleSA9IGtleTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBhcHBJZDogYXBwSWQsIG1hc3RlcktleTogbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5OiBqYXZhc2NyaXB0S2V5IH07XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NChzdHIpIHtcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0ciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd0Nyb3NzRG9tYWluKGFwcElkKSB7XG4gIHJldHVybiAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGFwcElkLCBnZXRNb3VudEZvclJlcXVlc3QocmVxKSk7XG4gICAgbGV0IGFsbG93SGVhZGVycyA9IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTO1xuICAgIGlmIChjb25maWcgJiYgY29uZmlnLmFsbG93SGVhZGVycykge1xuICAgICAgYWxsb3dIZWFkZXJzICs9IGAsICR7Y29uZmlnLmFsbG93SGVhZGVycy5qb2luKCcsICcpfWA7XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZU9yaWdpbnMgPVxuICAgICAgdHlwZW9mIGNvbmZpZz8uYWxsb3dPcmlnaW4gPT09ICdzdHJpbmcnID8gW2NvbmZpZy5hbGxvd09yaWdpbl0gOiBjb25maWc/LmFsbG93T3JpZ2luID8/IFsnKiddO1xuICAgIGNvbnN0IHJlcXVlc3RPcmlnaW4gPSByZXEuaGVhZGVycy5vcmlnaW47XG4gICAgY29uc3QgYWxsb3dPcmlnaW5zID1cbiAgICAgIHJlcXVlc3RPcmlnaW4gJiYgYmFzZU9yaWdpbnMuaW5jbHVkZXMocmVxdWVzdE9yaWdpbikgPyByZXF1ZXN0T3JpZ2luIDogYmFzZU9yaWdpbnNbMF07XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgYWxsb3dPcmlnaW5zKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCxQVVQsUE9TVCxERUxFVEUsT1BUSU9OUycpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCBhbGxvd0hlYWRlcnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUV4cG9zZS1IZWFkZXJzJywgJ1gtUGFyc2UtSm9iLVN0YXR1cy1JZCwgWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCcpO1xuICAgIC8vIGludGVyY2VwdCBPUFRJT05TIG1ldGhvZFxuICAgIGlmICgnT1BUSU9OUycgPT0gcmVxLm1ldGhvZCkge1xuICAgICAgcmVzLnNlbmRTdGF0dXMoMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93TWV0aG9kT3ZlcnJpZGUocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiByZXEuYm9keT8uX21ldGhvZCkge1xuICAgIHJlcS5vcmlnaW5hbE1ldGhvZCA9IHJlcS5tZXRob2Q7XG4gICAgcmVxLm1ldGhvZCA9IHJlcS5ib2R5Ll9tZXRob2Q7XG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9tZXRob2Q7XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlUGFyc2VFcnJvcnMoZXJyLCByZXEsIHJlcywgbmV4dCkge1xuICBjb25zdCBsb2cgPSAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHx8IGRlZmF1bHRMb2dnZXI7XG4gIGlmIChlcnIgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgIGlmIChyZXEuY29uZmlnICYmIHJlcS5jb25maWcuZW5hYmxlRXhwcmVzc0Vycm9ySGFuZGxlcikge1xuICAgICAgcmV0dXJuIG5leHQoZXJyKTtcbiAgICB9XG4gICAgbGV0IGh0dHBTdGF0dXM7XG4gICAgLy8gVE9ETzogZmlsbCBvdXQgdGhpcyBtYXBwaW5nXG4gICAgc3dpdGNoIChlcnIuY29kZSkge1xuICAgICAgY2FzZSBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1I6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA1MDA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EOlxuICAgICAgICBodHRwU3RhdHVzID0gNDA0O1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDA7XG4gICAgfVxuICAgIHJlcy5zdGF0dXMoaHR0cFN0YXR1cyk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGxvZy5lcnJvcignUGFyc2UgZXJyb3I6ICcsIGVycik7XG4gIH0gZWxzZSBpZiAoZXJyLnN0YXR1cyAmJiBlcnIubWVzc2FnZSkge1xuICAgIHJlcy5zdGF0dXMoZXJyLnN0YXR1cyk7XG4gICAgcmVzLmpzb24oeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBsb2cuZXJyb3IoJ1VuY2F1Z2h0IGludGVybmFsIHNlcnZlciBlcnJvci4nLCBlcnIsIGVyci5zdGFjayk7XG4gICAgcmVzLnN0YXR1cyg1MDApO1xuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgIG1lc3NhZ2U6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJyxcbiAgICB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcSwgcmVzLCBuZXh0KSB7XG4gIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBlcnJvciA9IGNyZWF0ZVNhbml0aXplZEh0dHBFcnJvcig0MDMsICd1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWQnLCByZXEuY29uZmlnKTtcbiAgICByZXMuc3RhdHVzKGVycm9yLnN0YXR1cyk7XG4gICAgcmVzLmVuZChge1wiZXJyb3JcIjpcIiR7ZXJyb3IubWVzc2FnZX1cIn1gKTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxdWVzdCkge1xuICBpZiAoIXJlcXVlc3QuYXV0aC5pc01hc3Rlcikge1xuICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEh0dHBFcnJvcig0MDMsICd1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWQnLCByZXF1ZXN0LmNvbmZpZyk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5leHBvcnQgY29uc3QgYWRkUmF0ZUxpbWl0ID0gKHJvdXRlLCBjb25maWcsIGNsb3VkKSA9PiB7XG4gIGlmICh0eXBlb2YgY29uZmlnID09PSAnc3RyaW5nJykge1xuICAgIGNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiByb3V0ZSkge1xuICAgIGlmICghUmF0ZUxpbWl0T3B0aW9uc1trZXldKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCByYXRlIGxpbWl0IG9wdGlvbiBcIiR7a2V5fVwiYDtcbiAgICB9XG4gIH1cbiAgaWYgKCFjb25maWcucmF0ZUxpbWl0cykge1xuICAgIGNvbmZpZy5yYXRlTGltaXRzID0gW107XG4gIH1cbiAgY29uc3QgcmVkaXNTdG9yZSA9IHtcbiAgICBjb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKCksXG4gICAgc3RvcmU6IG51bGwsXG4gIH07XG4gIGlmIChyb3V0ZS5yZWRpc1VybCkge1xuICAgIGNvbnN0IGxvZyA9IGNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGNvbnN0IGNsaWVudCA9IGNyZWF0ZUNsaWVudCh7XG4gICAgICB1cmw6IHJvdXRlLnJlZGlzVXJsLFxuICAgIH0pO1xuICAgIGNsaWVudC5vbignZXJyb3InLCBlcnIgPT4geyBsb2cuZXJyb3IoJ01pZGRsZXdhcmVzIGFkZFJhdGVMaW1pdCBSZWRpcyBjbGllbnQgZXJyb3InLCB7IGVycm9yOiBlcnIgfSkgfSk7XG4gICAgY2xpZW50Lm9uKCdjb25uZWN0JywgKCkgPT4geyB9KTtcbiAgICBjbGllbnQub24oJ3JlY29ubmVjdGluZycsICgpID0+IHsgfSk7XG4gICAgY2xpZW50Lm9uKCdyZWFkeScsICgpID0+IHsgfSk7XG4gICAgcmVkaXNTdG9yZS5jb25uZWN0aW9uUHJvbWlzZSA9IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChjbGllbnQuaXNPcGVuKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5jb25uZWN0KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZy5lcnJvcihgQ291bGQgbm90IGNvbm5lY3QgdG8gcmVkaXNVUkwgaW4gcmF0ZSBsaW1pdDogJHtlfWApO1xuICAgICAgfVxuICAgIH07XG4gICAgcmVkaXNTdG9yZS5jb25uZWN0aW9uUHJvbWlzZSgpO1xuICAgIHJlZGlzU3RvcmUuc3RvcmUgPSBuZXcgUmVkaXNTdG9yZSh7XG4gICAgICBzZW5kQ29tbWFuZDogYXN5bmMgKC4uLmFyZ3MpID0+IHtcbiAgICAgICAgYXdhaXQgcmVkaXNTdG9yZS5jb25uZWN0aW9uUHJvbWlzZSgpO1xuICAgICAgICByZXR1cm4gY2xpZW50LnNlbmRDb21tYW5kKGFyZ3MpO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuICBsZXQgdHJhbnNmb3JtUGF0aCA9IHJvdXRlLnJlcXVlc3RQYXRoLnNwbGl0KCcvKicpLmpvaW4oJy8oLiopJyk7XG4gIGlmICh0cmFuc2Zvcm1QYXRoID09PSAnKicpIHtcbiAgICB0cmFuc2Zvcm1QYXRoID0gJyguKiknO1xuICB9XG4gIGNvbmZpZy5yYXRlTGltaXRzLnB1c2goe1xuICAgIHBhdGg6IHBhdGhUb1JlZ2V4cCh0cmFuc2Zvcm1QYXRoKSxcbiAgICByZXF1ZXN0Q291bnQ6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICByZXF1ZXN0TWV0aG9kczogcm91dGUucmVxdWVzdE1ldGhvZHMsXG4gICAgaW5jbHVkZU1hc3RlcktleTogcm91dGUuaW5jbHVkZU1hc3RlcktleSxcbiAgICBpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0czogcm91dGUuaW5jbHVkZUludGVybmFsUmVxdWVzdHMsXG4gICAgZXJyb3JSZXNwb25zZU1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICBoYW5kbGVyOiByYXRlTGltaXQoe1xuICAgICAgd2luZG93TXM6IHJvdXRlLnJlcXVlc3RUaW1lV2luZG93LFxuICAgICAgbWF4OiByb3V0ZS5yZXF1ZXN0Q291bnQsXG4gICAgICBtZXNzYWdlOiByb3V0ZS5lcnJvclJlc3BvbnNlTWVzc2FnZSB8fCBSYXRlTGltaXRPcHRpb25zLmVycm9yUmVzcG9uc2VNZXNzYWdlLmRlZmF1bHQsXG4gICAgICBoYW5kbGVyOiAocmVxdWVzdCwgcmVzcG9uc2UsIG5leHQsIG9wdGlvbnMpID0+IHtcbiAgICAgICAgdGhyb3cge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6IG9wdGlvbnMubWVzc2FnZSxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBza2lwOiByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3QuaXAgPT09ICcxMjcuMC4wLjEnICYmICFyb3V0ZS5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cykge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS5pbmNsdWRlTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS5yZXF1ZXN0TWV0aG9kcykge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJvdXRlLnJlcXVlc3RNZXRob2RzKSkge1xuICAgICAgICAgICAgaWYgKCFyb3V0ZS5yZXF1ZXN0TWV0aG9kcy5pbmNsdWRlcyhyZXF1ZXN0Lm1ldGhvZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHJlZ0V4cCA9IG5ldyBSZWdFeHAocm91dGUucmVxdWVzdE1ldGhvZHMpO1xuICAgICAgICAgICAgaWYgKCFyZWdFeHAudGVzdChyZXF1ZXN0Lm1ldGhvZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGg/LmlzTWFzdGVyO1xuICAgICAgfSxcbiAgICAgIGtleUdlbmVyYXRvcjogYXN5bmMgcmVxdWVzdCA9PiB7XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS5nbG9iYWwpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5jb25maWcuYXBwSWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdG9rZW4gPSByZXF1ZXN0LmluZm8uc2Vzc2lvblRva2VuO1xuICAgICAgICBpZiAocm91dGUuem9uZSA9PT0gUGFyc2UuU2VydmVyLlJhdGVMaW1pdFpvbmUuc2Vzc2lvbiAmJiB0b2tlbikge1xuICAgICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUuem9uZSA9PT0gUGFyc2UuU2VydmVyLlJhdGVMaW1pdFpvbmUudXNlciAmJiB0b2tlbikge1xuICAgICAgICAgIGlmICghcmVxdWVzdC5hdXRoKSB7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IGhhbmRsZVBhcnNlU2Vzc2lvbihyZXF1ZXN0LCBudWxsLCByZXNvbHZlKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXF1ZXN0LmF1dGg/LnVzZXI/LmlkICYmIHJlcXVlc3Quem9uZSA9PT0gJ3VzZXInKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVxdWVzdC5hdXRoLnVzZXIuaWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5pcDtcbiAgICAgIH0sXG4gICAgICBzdG9yZTogcmVkaXNTdG9yZS5zdG9yZSxcbiAgICB9KSxcbiAgICBjbG91ZCxcbiAgfSk7XG4gIENvbmZpZy5wdXQoY29uZmlnKTtcbn07XG5cbi8qKlxuICogRGVkdXBsaWNhdGVzIGEgcmVxdWVzdCB0byBlbnN1cmUgaWRlbXBvdGVuY3kuIER1cGxpY2F0ZXMgYXJlIGRldGVybWluZWQgYnkgdGhlIHJlcXVlc3QgSURcbiAqIGluIHRoZSByZXF1ZXN0IGhlYWRlci4gSWYgYSByZXF1ZXN0IGhhcyBubyByZXF1ZXN0IElELCBpdCBpcyBleGVjdXRlZCBhbnl3YXkuXG4gKiBAcGFyYW0geyp9IHJlcSBUaGUgcmVxdWVzdCB0byBldmFsdWF0ZS5cbiAqIEByZXR1cm5zIFByb21pc2U8e30+XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kocmVxKSB7XG4gIC8vIEVuYWJsZSBmZWF0dXJlIG9ubHkgZm9yIE1vbmdvREJcbiAgaWYgKFxuICAgICEoXG4gICAgICByZXEuY29uZmlnLmRhdGFiYXNlLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyIHx8XG4gICAgICByZXEuY29uZmlnLmRhdGFiYXNlLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyXG4gICAgKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gR2V0IHBhcmFtZXRlcnNcbiAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgY29uc3QgcmVxdWVzdElkID0gKChyZXEgfHwge30pLmhlYWRlcnMgfHwge30pWyd4LXBhcnNlLXJlcXVlc3QtaWQnXTtcbiAgY29uc3QgeyBwYXRocywgdHRsIH0gPSBjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zO1xuICBpZiAoIXJlcXVlc3RJZCB8fCAhY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBSZXF1ZXN0IHBhdGggbWF5IGNvbnRhaW4gdHJhaWxpbmcgc2xhc2hlcywgZGVwZW5kaW5nIG9uIHRoZSBvcmlnaW5hbCByZXF1ZXN0LCBzbyByZW1vdmVcbiAgLy8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyB0byBtYWtlIGl0IGVhc2llciB0byBzcGVjaWZ5IHBhdGhzIGluIHRoZSBjb25maWd1cmF0aW9uXG4gIGNvbnN0IHJlcVBhdGggPSByZXEucGF0aC5yZXBsYWNlKC9eXFwvfFxcLyQvLCAnJyk7XG4gIC8vIERldGVybWluZSB3aGV0aGVyIGlkZW1wb3RlbmN5IGlzIGVuYWJsZWQgZm9yIGN1cnJlbnQgcmVxdWVzdCBwYXRoXG4gIGxldCBtYXRjaCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHBhdGggb2YgcGF0aHMpIHtcbiAgICAvLyBBc3N1bWUgb25lIHdhbnRzIGEgcGF0aCB0byBhbHdheXMgbWF0Y2ggZnJvbSB0aGUgYmVnaW5uaW5nIHRvIHByZXZlbnQgYW55IG1pc3Rha2VzXG4gICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdGguY2hhckF0KDApID09PSAnXicgPyBwYXRoIDogJ14nICsgcGF0aCk7XG4gICAgaWYgKHJlcVBhdGgubWF0Y2gocmVnZXgpKSB7XG4gICAgICBtYXRjaCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBUcnkgdG8gc3RvcmUgcmVxdWVzdFxuICBjb25zdCBleHBpcnlEYXRlID0gbmV3IERhdGUobmV3IERhdGUoKS5zZXRTZWNvbmRzKG5ldyBEYXRlKCkuZ2V0U2Vjb25kcygpICsgdHRsKSk7XG4gIHJldHVybiByZXN0XG4gICAgLmNyZWF0ZShjb25maWcsIGF1dGgubWFzdGVyKGNvbmZpZyksICdfSWRlbXBvdGVuY3knLCB7XG4gICAgICByZXFJZDogcmVxdWVzdElkLFxuICAgICAgZXhwaXJlOiBQYXJzZS5fZW5jb2RlKGV4cGlyeURhdGUpLFxuICAgIH0pXG4gICAgLmNhdGNoKGUgPT4ge1xuICAgICAgaWYgKGUuY29kZSA9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9SRVFVRVNULCAnRHVwbGljYXRlIHJlcXVlc3QnKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKSB7XG4gIHJlcy5zdGF0dXMoNDAzKTtcbiAgcmVzLmVuZCgne1wiZXJyb3JcIjpcInVuYXV0aG9yaXplZFwifScpO1xufVxuXG5mdW5jdGlvbiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKSB7XG4gIHJlcy5zdGF0dXMoNDAwKTtcbiAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGVycm9yOiAnSW52YWxpZCBvYmplY3QgZm9yIGNvbnRleHQuJyB9KTtcbn1cblxuLyoqXG4gKiBFeHByZXNzIDQgYWxsb3dlZCBhIGRvdWJsZSBmb3J3YXJkIHNsYXNoIGJldHdlZW4gYSByb3V0ZSBhbmQgcm91dGVyLiBBbHRob3VnaFxuICogdGhpcyBzaG91bGQgYmUgY29uc2lkZXJlZCBhbiBhbnRpLXBhdHRlcm4sIHdlIG5lZWQgdG8gc3VwcG9ydCBpdCBmb3IgYmFja3dhcmRzXG4gKiBjb21wYXRpYmlsaXR5LlxuICpcbiAqIFRlY2huaWNhbGx5IHZhbGlkIFVSTCB3aXRoIGRvdWJsZSBmb3Jvd2FyZCBzbGFzaDpcbiAqIGh0dHA6Ly9sb2NhbGhvc3Q6MTMzNy9wYXJzZS8vZnVuY3Rpb25zL3Rlc3RGdW5jdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dEb3VibGVGb3J3YXJkU2xhc2gocmVxLCByZXMsIG5leHQpIHtcbiAgcmVxLnVybCA9IHJlcS51cmwuc3RhcnRzV2l0aCgnLy8nKSA/IHJlcS51cmwuc3Vic3RyaW5nKDEpIDogcmVxLnVybDtcbiAgbmV4dCgp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Q0FBQ0UsVUFBVSxDQUFDLENBQUMsR0FBR1QsR0FBRyxDQUFDLENBQUM7RUFDakYsT0FBT1UsYUFBSSxDQUNSQyxNQUFNLENBQUMzSixNQUFNLEVBQUVlLGFBQUksQ0FBQzZJLE1BQU0sQ0FBQzVKLE1BQU0sQ0FBQyxFQUFFLGNBQWMsRUFBRTtJQUNuRDZKLEtBQUssRUFBRWYsU0FBUztJQUNoQmdCLE1BQU0sRUFBRXhKLGFBQUssQ0FBQ3lKLE9BQU8sQ0FBQ1QsVUFBVTtFQUNsQyxDQUFDLENBQUMsQ0FDRFUsS0FBSyxDQUFDalAsQ0FBQyxJQUFJO0lBQ1YsSUFBSUEsQ0FBQyxDQUFDc0YsSUFBSSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQzBKLGVBQWUsRUFBRTtNQUN6QyxNQUFNLElBQUkzSixhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMySixpQkFBaUIsRUFBRSxtQkFBbUIsQ0FBQztJQUMzRTtJQUNBLE1BQU1uUCxDQUFDO0VBQ1QsQ0FBQyxDQUFDO0FBQ047QUFFQSxTQUFTaUUsY0FBY0EsQ0FBQzNELEdBQUcsRUFBRThCLEdBQUcsRUFBRTtFQUNoQ0EsR0FBRyxDQUFDZ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztFQUNmaEQsR0FBRyxDQUFDdUksR0FBRyxDQUFDLDBCQUEwQixDQUFDO0FBQ3JDO0FBRUEsU0FBUzdILGdCQUFnQkEsQ0FBQ3hDLEdBQUcsRUFBRThCLEdBQUcsRUFBRTtFQUNsQ0EsR0FBRyxDQUFDZ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztFQUNmaEQsR0FBRyxDQUFDaUQsSUFBSSxDQUFDO0lBQUVDLElBQUksRUFBRUMsYUFBSyxDQUFDQyxLQUFLLENBQUM0SixZQUFZO0lBQUUxSixLQUFLLEVBQUU7RUFBOEIsQ0FBQyxDQUFDO0FBQ3BGOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxTQUFTMkosdUJBQXVCQSxDQUFDL08sR0FBRyxFQUFFOEIsR0FBRyxFQUFFQyxJQUFJLEVBQUU7RUFDdEQvQixHQUFHLENBQUNJLEdBQUcsR0FBR0osR0FBRyxDQUFDSSxHQUFHLENBQUM0TyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUdoUCxHQUFHLENBQUNJLEdBQUcsQ0FBQ29JLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBR3hJLEdBQUcsQ0FBQ0ksR0FBRztFQUNuRTJCLElBQUksQ0FBQyxDQUFDO0FBQ1IiLCJpZ25vcmVMaXN0IjpbXX0=