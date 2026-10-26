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
      } else if (req.body._context === null) {
        // null context is equivalent to no context
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX2xvZ2dlciIsIl9yZXN0IiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9leHByZXNzUmF0ZUxpbWl0IiwiX0RlZmluaXRpb25zIiwiX3BhdGhUb1JlZ2V4cCIsIl9yYXRlTGltaXRSZWRpcyIsIl9yZWRpcyIsIl9uZXQiLCJfRXJyb3IiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImV4cG9ydHMiLCJnZXRNb3VudEZvclJlcXVlc3QiLCJyZXEiLCJtb3VudFBhdGhMZW5ndGgiLCJvcmlnaW5hbFVybCIsImxlbmd0aCIsInVybCIsIm1vdW50UGF0aCIsInNsaWNlIiwicHJvdG9jb2wiLCJnZXQiLCJnZXRCbG9ja0xpc3QiLCJpcFJhbmdlTGlzdCIsInN0b3JlIiwiYmxvY2tMaXN0IiwiQmxvY2tMaXN0IiwiZm9yRWFjaCIsImZ1bGxJcCIsInNldCIsImlwIiwibWFzayIsInNwbGl0IiwiYWRkQWRkcmVzcyIsImlzSVB2NCIsImFkZFN1Ym5ldCIsIk51bWJlciIsImNoZWNrSXAiLCJpbmNvbWluZ0lwSXNWNCIsInJlc3VsdCIsImNoZWNrIiwiaW5jbHVkZXMiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyZXMiLCJuZXh0IiwibW91bnQiLCJjb250ZXh0IiwiSlNPTiIsInBhcnNlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwibWFsZm9ybWVkQ29udGV4dCIsImluZm8iLCJhcHBJZCIsInNlc3Npb25Ub2tlbiIsIm1hc3RlcktleSIsIm1haW50ZW5hbmNlS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJjbGllbnRLZXkiLCJqYXZhc2NyaXB0S2V5IiwiZG90TmV0S2V5IiwicmVzdEFQSUtleSIsImJhc2ljQXV0aCIsImh0dHBBdXRoIiwiYmFzaWNBdXRoQXBwSWQiLCJBcHBDYWNoZSIsImJvZHkiLCJfbm9Cb2R5IiwiZmlsZVZpYUpTT04iLCJCdWZmZXIiLCJpbnZhbGlkUmVxdWVzdCIsIl9SZXZvY2FibGVTZXNzaW9uIiwiX0FwcGxpY2F0aW9uSWQiLCJfSmF2YVNjcmlwdEtleSIsIl9DbGllbnRWZXJzaW9uIiwiX0luc3RhbGxhdGlvbklkIiwiX1Nlc3Npb25Ub2tlbiIsIl9NYXN0ZXJLZXkiLCJfY29udGV4dCIsIl9Db250ZW50VHlwZSIsImhlYWRlcnMiLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImxvYWRLZXlzIiwiYXBwIiwiaXNNYWludGVuYW5jZSIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJsb2FkTWFzdGVyS2V5IiwiaXNNYXN0ZXIiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXlJcHNTdG9yZSIsIm1lc3NhZ2UiLCJoYW5kbGVSYXRlTGltaXQiLCJpc1JlYWRPbmx5TWFzdGVyIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJpc1JlYWRPbmx5Iiwia2V5cyIsIm9uZUtleUNvbmZpZ3VyZWQiLCJzb21lIiwia2V5IiwidW5kZWZpbmVkIiwib25lS2V5TWF0Y2hlcyIsInVzZXJGcm9tSldUIiwidXNlciIsInJhdGVMaW1pdHMiLCJQcm9taXNlIiwiYWxsIiwibWFwIiwibGltaXQiLCJwYXRoRXhwIiwiUmVnRXhwIiwicGF0aCIsInRlc3QiLCJoYW5kbGVyIiwiZXJyIiwiQ09OTkVDVElPTl9GQUlMRUQiLCJoYW5kbGVQYXJzZVNlc3Npb24iLCJyZXF1ZXN0QXV0aCIsImluZGV4T2YiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsIlVOS05PV05fRVJST1IiLCJhdXRob3JpemF0aW9uIiwiaGVhZGVyIiwiYXV0aFByZWZpeCIsIm1hdGNoIiwidG9Mb3dlckNhc2UiLCJlbmNvZGVkQXV0aCIsInN1YnN0cmluZyIsImNyZWRlbnRpYWxzIiwiZGVjb2RlQmFzZTY0IiwianNLZXlQcmVmaXgiLCJtYXRjaEtleSIsInN0ciIsImFsbG93Q3Jvc3NEb21haW4iLCJhbGxvd0hlYWRlcnMiLCJqb2luIiwiYmFzZU9yaWdpbnMiLCJhbGxvd09yaWdpbiIsInJlcXVlc3RPcmlnaW4iLCJvcmlnaW4iLCJhbGxvd09yaWdpbnMiLCJtZXRob2QiLCJzZW5kU3RhdHVzIiwiYWxsb3dNZXRob2RPdmVycmlkZSIsIl9tZXRob2QiLCJvcmlnaW5hbE1ldGhvZCIsImhhbmRsZVBhcnNlRXJyb3JzIiwiZW5hYmxlRXhwcmVzc0Vycm9ySGFuZGxlciIsImh0dHBTdGF0dXMiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicHJvY2VzcyIsImVudiIsIlRFU1RJTkciLCJzdGFjayIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJjcmVhdGVTYW5pdGl6ZWRIdHRwRXJyb3IiLCJlbmQiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyIsInJlcXVlc3QiLCJyZXNvbHZlIiwiYWRkUmF0ZUxpbWl0Iiwicm91dGUiLCJjbG91ZCIsIlJhdGVMaW1pdE9wdGlvbnMiLCJyZWRpc1N0b3JlIiwiY29ubmVjdGlvblByb21pc2UiLCJyZWRpc1VybCIsImNsaWVudCIsImNyZWF0ZUNsaWVudCIsIm9uIiwiaXNPcGVuIiwiY29ubmVjdCIsIlJlZGlzU3RvcmUiLCJzZW5kQ29tbWFuZCIsImFyZ3MiLCJ0cmFuc2Zvcm1QYXRoIiwicmVxdWVzdFBhdGgiLCJwdXNoIiwicGF0aFRvUmVnZXhwIiwicmVxdWVzdENvdW50IiwicmVxdWVzdE1ldGhvZHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXNwb25zZSIsIm9wdGlvbnMiLCJza2lwIiwiQXJyYXkiLCJpc0FycmF5IiwicmVnRXhwIiwia2V5R2VuZXJhdG9yIiwiem9uZSIsIlNlcnZlciIsIlJhdGVMaW1pdFpvbmUiLCJnbG9iYWwiLCJ0b2tlbiIsInNlc3Npb24iLCJpZCIsInB1dCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImRhdGFiYXNlIiwiYWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwicmVxdWVzdElkIiwicGF0aHMiLCJ0dGwiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJyZXFQYXRoIiwicmVwbGFjZSIsInJlZ2V4IiwiY2hhckF0IiwiZXhwaXJ5RGF0ZSIsIkRhdGUiLCJzZXRTZWNvbmRzIiwiZ2V0U2Vjb25kcyIsInJlc3QiLCJjcmVhdGUiLCJtYXN0ZXIiLCJyZXFJZCIsImV4cGlyZSIsIl9lbmNvZGUiLCJjYXRjaCIsIkRVUExJQ0FURV9WQUxVRSIsIkRVUExJQ0FURV9SRVFVRVNUIiwiSU5WQUxJRF9KU09OIiwiYWxsb3dEb3VibGVGb3J3YXJkU2xhc2giLCJzdGFydHNXaXRoIl0sInNvdXJjZXMiOlsiLi4vc3JjL21pZGRsZXdhcmVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBBcHBDYWNoZSBmcm9tICcuL2NhY2hlJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBhdXRoIGZyb20gJy4vQXV0aCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuaW1wb3J0IHsgY3JlYXRlU2FuaXRpemVkSHR0cEVycm9yIH0gZnJvbSAnLi9FcnJvcic7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0FMTE9XRURfSEVBREVSUyA9XG4gICdYLVBhcnNlLU1hc3Rlci1LZXksIFgtUGFyc2UtUkVTVC1BUEktS2V5LCBYLVBhcnNlLUphdmFzY3JpcHQtS2V5LCBYLVBhcnNlLUFwcGxpY2F0aW9uLUlkLCBYLVBhcnNlLUNsaWVudC1WZXJzaW9uLCBYLVBhcnNlLVNlc3Npb24tVG9rZW4sIFgtUmVxdWVzdGVkLVdpdGgsIFgtUGFyc2UtUmV2b2NhYmxlLVNlc3Npb24sIFgtUGFyc2UtUmVxdWVzdC1JZCwgQ29udGVudC1UeXBlLCBQcmFnbWEsIENhY2hlLUNvbnRyb2wnO1xuXG5jb25zdCBnZXRNb3VudEZvclJlcXVlc3QgPSBmdW5jdGlvbiAocmVxKSB7XG4gIGNvbnN0IG1vdW50UGF0aExlbmd0aCA9IHJlcS5vcmlnaW5hbFVybC5sZW5ndGggLSByZXEudXJsLmxlbmd0aDtcbiAgY29uc3QgbW91bnRQYXRoID0gcmVxLm9yaWdpbmFsVXJsLnNsaWNlKDAsIG1vdW50UGF0aExlbmd0aCk7XG4gIHJldHVybiByZXEucHJvdG9jb2wgKyAnOi8vJyArIHJlcS5nZXQoJ2hvc3QnKSArIG1vdW50UGF0aDtcbn07XG5cbmNvbnN0IGdldEJsb2NrTGlzdCA9IChpcFJhbmdlTGlzdCwgc3RvcmUpID0+IHtcbiAgaWYgKHN0b3JlLmdldCgnYmxvY2tMaXN0JykpIHsgcmV0dXJuIHN0b3JlLmdldCgnYmxvY2tMaXN0Jyk7IH1cbiAgY29uc3QgYmxvY2tMaXN0ID0gbmV3IEJsb2NrTGlzdCgpO1xuICBpcFJhbmdlTGlzdC5mb3JFYWNoKGZ1bGxJcCA9PiB7XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzo6LzAnIHx8IGZ1bGxJcCA9PT0gJzo6Jykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjYnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzAuMC4wLjAvMCcgfHwgZnVsbElwID09PSAnMC4wLjAuMCcpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY0JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IFtpcCwgbWFza10gPSBmdWxsSXAuc3BsaXQoJy8nKTtcbiAgICBpZiAoIW1hc2spIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRBZGRyZXNzKGlwLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmxvY2tMaXN0LmFkZFN1Ym5ldChpcCwgTnVtYmVyKG1hc2spLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9XG4gIH0pO1xuICBzdG9yZS5zZXQoJ2Jsb2NrTGlzdCcsIGJsb2NrTGlzdCk7XG4gIHJldHVybiBibG9ja0xpc3Q7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tJcCA9IChpcCwgaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGNvbnN0IGluY29taW5nSXBJc1Y0ID0gaXNJUHY0KGlwKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gZ2V0QmxvY2tMaXN0KGlwUmFuZ2VMaXN0LCBzdG9yZSk7XG5cbiAgaWYgKHN0b3JlLmdldChpcCkpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHN0b3JlLmdldCgnYWxsb3dBbGxJcHY0JykgJiYgaW5jb21pbmdJcElzVjQpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHN0b3JlLmdldCgnYWxsb3dBbGxJcHY2JykgJiYgIWluY29taW5nSXBJc1Y0KSB7IHJldHVybiB0cnVlOyB9XG4gIGNvbnN0IHJlc3VsdCA9IGJsb2NrTGlzdC5jaGVjayhpcCwgaW5jb21pbmdJcElzVjQgPyAnaXB2NCcgOiAnaXB2NicpO1xuXG4gIC8vIElmIHRoZSBpcCBpcyBpbiB0aGUgbGlzdCwgd2Ugc3RvcmUgdGhlIHJlc3VsdCBpbiB0aGUgc3RvcmVcbiAgLy8gc28gd2UgaGF2ZSBhIG9wdGltaXplZCBwYXRoIGZvciB0aGUgbmV4dCByZXF1ZXN0XG4gIGlmIChpcFJhbmdlTGlzdC5pbmNsdWRlcyhpcCkgJiYgcmVzdWx0KSB7XG4gICAgc3RvcmUuc2V0KGlwLCByZXN1bHQpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vLyBDaGVja3MgdGhhdCB0aGUgcmVxdWVzdCBpcyBhdXRob3JpemVkIGZvciB0aGlzIGFwcCBhbmQgY2hlY2tzIHVzZXJcbi8vIGF1dGggdG9vLlxuLy8gVGhlIGJvZHlwYXJzZXIgc2hvdWxkIHJ1biBiZWZvcmUgdGhpcyBtaWRkbGV3YXJlLlxuLy8gQWRkcyBpbmZvIHRvIHRoZSByZXF1ZXN0OlxuLy8gcmVxLmNvbmZpZyAtIHRoZSBDb25maWcgZm9yIHRoaXMgYXBwXG4vLyByZXEuYXV0aCAtIHRoZSBBdXRoIGZvciB0aGlzIHJlcXVlc3RcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVQYXJzZUhlYWRlcnMocmVxLCByZXMsIG5leHQpIHtcbiAgdmFyIG1vdW50ID0gZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSk7XG5cbiAgbGV0IGNvbnRleHQgPSB7fTtcbiAgaWYgKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykpO1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG4gIHZhciBpbmZvID0ge1xuICAgIGFwcElkOiByZXEuZ2V0KCdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJyksXG4gICAgc2Vzc2lvblRva2VuOiByZXEuZ2V0KCdYLVBhcnNlLVNlc3Npb24tVG9rZW4nKSxcbiAgICBtYXN0ZXJLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFzdGVyLUtleScpLFxuICAgIG1haW50ZW5hbmNlS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1haW50ZW5hbmNlLUtleScpLFxuICAgIGluc3RhbGxhdGlvbklkOiByZXEuZ2V0KCdYLVBhcnNlLUluc3RhbGxhdGlvbi1JZCcpLFxuICAgIGNsaWVudEtleTogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtS2V5JyksXG4gICAgamF2YXNjcmlwdEtleTogcmVxLmdldCgnWC1QYXJzZS1KYXZhc2NyaXB0LUtleScpLFxuICAgIGRvdE5ldEtleTogcmVxLmdldCgnWC1QYXJzZS1XaW5kb3dzLUtleScpLFxuICAgIHJlc3RBUElLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtUkVTVC1BUEktS2V5JyksXG4gICAgY29udGV4dDogY29udGV4dCxcbiAgfTtcblxuICB2YXIgYmFzaWNBdXRoID0gaHR0cEF1dGgocmVxKTtcblxuICBpZiAoYmFzaWNBdXRoKSB7XG4gICAgdmFyIGJhc2ljQXV0aEFwcElkID0gYmFzaWNBdXRoLmFwcElkO1xuICAgIGlmIChBcHBDYWNoZS5nZXQoYmFzaWNBdXRoQXBwSWQpKSB7XG4gICAgICBpbmZvLmFwcElkID0gYmFzaWNBdXRoQXBwSWQ7XG4gICAgICBpbmZvLm1hc3RlcktleSA9IGJhc2ljQXV0aC5tYXN0ZXJLZXkgfHwgaW5mby5tYXN0ZXJLZXk7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSBiYXNpY0F1dGguamF2YXNjcmlwdEtleSB8fCBpbmZvLmphdmFzY3JpcHRLZXk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlcS5ib2R5KSB7XG4gICAgLy8gVW5pdHkgU0RLIHNlbmRzIGEgX25vQm9keSBrZXkgd2hpY2ggbmVlZHMgdG8gYmUgcmVtb3ZlZC5cbiAgICAvLyBVbmNsZWFyIGF0IHRoaXMgcG9pbnQgaWYgYWN0aW9uIG5lZWRzIHRvIGJlIHRha2VuLlxuICAgIGRlbGV0ZSByZXEuYm9keS5fbm9Cb2R5O1xuICB9XG5cbiAgdmFyIGZpbGVWaWFKU09OID0gZmFsc2U7XG5cbiAgaWYgKCFpbmZvLmFwcElkIHx8ICFBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCkpIHtcbiAgICAvLyBTZWUgaWYgd2UgY2FuIGZpbmQgdGhlIGFwcCBpZCBvbiB0aGUgYm9keS5cbiAgICBpZiAocmVxLmJvZHkgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgIC8vIFRoZSBvbmx5IGNoYW5jZSB0byBmaW5kIHRoZSBhcHAgaWQgaXMgaWYgdGhpcyBpcyBhIGZpbGVcbiAgICAgIC8vIHVwbG9hZCB0aGF0IGFjdHVhbGx5IGlzIGEgSlNPTiBib2R5LiBTbyB0cnkgdG8gcGFyc2UgaXQuXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvNjU4OVxuICAgICAgLy8gSXQgaXMgYWxzbyBwb3NzaWJsZSB0aGF0IHRoZSBjbGllbnQgaXMgdHJ5aW5nIHRvIHVwbG9hZCBhIGZpbGUgYnV0IGZvcmdvdFxuICAgICAgLy8gdG8gcHJvdmlkZSB4LXBhcnNlLWFwcC1pZCBpbiBoZWFkZXIgYW5kIHBhcnNlIGEgYmluYXJ5IGZpbGUgd2lsbCBmYWlsXG4gICAgICB0cnkge1xuICAgICAgICByZXEuYm9keSA9IEpTT04ucGFyc2UocmVxLmJvZHkpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICB9XG4gICAgICBmaWxlVmlhSlNPTiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5ib2R5KSB7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX1Jldm9jYWJsZVNlc3Npb247XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgcmVxLmJvZHkgJiZcbiAgICAgIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkICYmXG4gICAgICBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpICYmXG4gICAgICAoIWluZm8ubWFzdGVyS2V5IHx8IEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkubWFzdGVyS2V5ID09PSBpbmZvLm1hc3RlcktleSlcbiAgICApIHtcbiAgICAgIGluZm8uYXBwSWQgPSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5IHx8ICcnO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5O1xuICAgICAgLy8gVE9ETzogdGVzdCB0aGF0IHRoZSBSRVNUIEFQSSBmb3JtYXRzIGdlbmVyYXRlZCBieSB0aGUgb3RoZXJcbiAgICAgIC8vIFNES3MgYXJlIGhhbmRsZWQgb2tcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgIGlmIChyZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgaW5mby5pbnN0YWxsYXRpb25JZCA9IHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fU2Vzc2lvblRva2VuKSB7XG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX01hc3RlcktleSkge1xuICAgICAgICBpbmZvLm1hc3RlcktleSA9IHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0KSB7XG4gICAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgIGluZm8uY29udGV4dCA9IHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpbmZvLmNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5ib2R5Ll9jb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoaW5mby5jb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgIH0gZWxzZSBpZiAocmVxLmJvZHkuX2NvbnRleHQgPT09IG51bGwpIHtcbiAgICAgICAgLy8gbnVsbCBjb250ZXh0IGlzIGVxdWl2YWxlbnQgdG8gbm8gY29udGV4dFxuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0NvbnRlbnRUeXBlKSB7XG4gICAgICAgIHJlcS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaW5mby5zZXNzaW9uVG9rZW4gJiYgdHlwZW9mIGluZm8uc2Vzc2lvblRva2VuICE9PSAnc3RyaW5nJykge1xuICAgIGluZm8uc2Vzc2lvblRva2VuID0gaW5mby5zZXNzaW9uVG9rZW4udG9TdHJpbmcoKTtcbiAgfVxuXG4gIGlmIChmaWxlVmlhSlNPTiAmJiByZXEuYm9keSkge1xuICAgIHJlcS5maWxlRGF0YSA9IHJlcS5ib2R5LmZpbGVEYXRhO1xuICAgIC8vIFdlIG5lZWQgdG8gcmVwb3B1bGF0ZSByZXEuYm9keSB3aXRoIGEgYnVmZmVyXG4gICAgdmFyIGJhc2U2NCA9IHJlcS5ib2R5LmJhc2U2NDtcbiAgICByZXEuYm9keSA9IEJ1ZmZlci5mcm9tKGJhc2U2NCwgJ2Jhc2U2NCcpO1xuICB9XG5cbiAgY29uc3QgY2xpZW50SXAgPSBnZXRDbGllbnRJcChyZXEpO1xuICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGluZm8uYXBwSWQsIG1vdW50KTtcbiAgaWYgKGNvbmZpZy5zdGF0ZSAmJiBjb25maWcuc3RhdGUgIT09ICdvaycpIHtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgZXJyb3I6IGBJbnZhbGlkIHNlcnZlciBzdGF0ZTogJHtjb25maWcuc3RhdGV9YCxcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgY29uZmlnLmxvYWRLZXlzKCk7XG5cbiAgaW5mby5hcHAgPSBBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCk7XG4gIHJlcS5jb25maWcgPSBjb25maWc7XG4gIHJlcS5jb25maWcuaGVhZGVycyA9IHJlcS5oZWFkZXJzIHx8IHt9O1xuICByZXEuY29uZmlnLmlwID0gY2xpZW50SXA7XG4gIHJlcS5pbmZvID0gaW5mbztcblxuICBjb25zdCBpc01haW50ZW5hbmNlID1cbiAgICByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5ICYmIGluZm8ubWFpbnRlbmFuY2VLZXkgPT09IHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXk7XG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgaWYgKGNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHMgfHwgW10sIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSkpIHtcbiAgICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIGlzTWFpbnRlbmFuY2U6IHRydWUsXG4gICAgICB9KTtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1haW50ZW5hbmNlIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYWludGVuYW5jZUtleUlwcycuYFxuICAgICk7XG4gIH1cblxuICBjb25zdCBtYXN0ZXJLZXkgPSBhd2FpdCByZXEuY29uZmlnLmxvYWRNYXN0ZXJLZXkoKTtcbiAgbGV0IGlzTWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IG1hc3RlcktleTtcblxuICBpZiAoaXNNYXN0ZXIgJiYgIWNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFzdGVyS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1hc3RlcktleUlwc1N0b3JlKSkge1xuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYXN0ZXIga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21hc3RlcktleUlwcycuYFxuICAgICk7XG4gICAgaXNNYXN0ZXIgPSBmYWxzZTtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gYHVuYXV0aG9yaXplZGA7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIHZhciBpc1JlYWRPbmx5TWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXk7XG4gIGlmIChcbiAgICB0eXBlb2YgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAhPSAndW5kZWZpbmVkJyAmJlxuICAgIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgJiZcbiAgICBpc1JlYWRPbmx5TWFzdGVyXG4gICkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgICAgaXNSZWFkT25seTogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIC8vIENsaWVudCBrZXlzIGFyZSBub3QgcmVxdWlyZWQgaW4gcGFyc2Utc2VydmVyLCBidXQgaWYgYW55IGhhdmUgYmVlbiBjb25maWd1cmVkIGluIHRoZSBzZXJ2ZXIsIHZhbGlkYXRlIHRoZW1cbiAgLy8gIHRvIHByZXNlcnZlIG9yaWdpbmFsIGJlaGF2aW9yLlxuICBjb25zdCBrZXlzID0gWydjbGllbnRLZXknLCAnamF2YXNjcmlwdEtleScsICdkb3ROZXRLZXknLCAncmVzdEFQSUtleSddO1xuICBjb25zdCBvbmVLZXlDb25maWd1cmVkID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQ7XG4gIH0pO1xuICBjb25zdCBvbmVLZXlNYXRjaGVzID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQgJiYgaW5mb1trZXldID09PSByZXEuY29uZmlnW2tleV07XG4gIH0pO1xuXG4gIGlmIChvbmVLZXlDb25maWd1cmVkICYmICFvbmVLZXlNYXRjaGVzKSB7XG4gICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgfVxuXG4gIGlmIChyZXEudXJsID09ICcvbG9naW4nKSB7XG4gICAgZGVsZXRlIGluZm8uc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKHJlcS51c2VyRnJvbUpXVCkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIHVzZXI6IHJlcS51c2VyRnJvbUpXVCxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIGlmICghaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgfSk7XG4gIH1cbiAgaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbn1cblxuY29uc3QgaGFuZGxlUmF0ZUxpbWl0ID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIGNvbnN0IHJhdGVMaW1pdHMgPSByZXEuY29uZmlnLnJhdGVMaW1pdHMgfHwgW107XG4gIHRyeSB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICByYXRlTGltaXRzLm1hcChhc3luYyBsaW1pdCA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGhFeHAgPSBuZXcgUmVnRXhwKGxpbWl0LnBhdGgpO1xuICAgICAgICBpZiAocGF0aEV4cC50ZXN0KHJlcS51cmwpKSB7XG4gICAgICAgICAgYXdhaXQgbGltaXQuaGFuZGxlcihyZXEsIHJlcywgZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgJ0FuIHVua25vd24gZXJyb3Igb2NjdXJlZCB3aGVuIGF0dGVtcHRpbmcgdG8gYXBwbHkgdGhlIHJhdGUgbGltaXRlcjogJyxcbiAgICAgICAgICAgICAgICBlcnJcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJlcy5zdGF0dXMoNDI5KTtcbiAgICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZVBhcnNlU2Vzc2lvbiA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGluZm8gPSByZXEuaW5mbztcbiAgICBpZiAocmVxLmF1dGggfHwgcmVxLnVybCA9PT0gJy9zZXNzaW9ucy9tZScpIHtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlcXVlc3RBdXRoID0gbnVsbDtcbiAgICBpZiAoXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbiAmJlxuICAgICAgcmVxLnVybCA9PT0gJy91cGdyYWRlVG9SZXZvY2FibGVTZXNzaW9uJyAmJlxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4uaW5kZXhPZigncjonKSAhPSAwXG4gICAgKSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJlcS5hdXRoID0gcmVxdWVzdEF1dGg7XG4gICAgbmV4dCgpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gVE9ETzogRGV0ZXJtaW5lIHRoZSBjb3JyZWN0IGVycm9yIHNjZW5hcmlvLlxuICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcignZXJyb3IgZ2V0dGluZyBhdXRoIGZvciBzZXNzaW9uVG9rZW4nLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVOS05PV05fRVJST1IsIGVycm9yKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0Q2xpZW50SXAocmVxKSB7XG4gIHJldHVybiByZXEuaXA7XG59XG5cbmZ1bmN0aW9uIGh0dHBBdXRoKHJlcSkge1xuICBpZiAoIShyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uKSB7IHJldHVybjsgfVxuXG4gIHZhciBoZWFkZXIgPSAocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbjtcbiAgdmFyIGFwcElkLCBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk7XG5cbiAgLy8gcGFyc2UgaGVhZGVyXG4gIHZhciBhdXRoUHJlZml4ID0gJ2Jhc2ljICc7XG5cbiAgdmFyIG1hdGNoID0gaGVhZGVyLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihhdXRoUHJlZml4KTtcblxuICBpZiAobWF0Y2ggPT0gMCkge1xuICAgIHZhciBlbmNvZGVkQXV0aCA9IGhlYWRlci5zdWJzdHJpbmcoYXV0aFByZWZpeC5sZW5ndGgsIGhlYWRlci5sZW5ndGgpO1xuICAgIHZhciBjcmVkZW50aWFscyA9IGRlY29kZUJhc2U2NChlbmNvZGVkQXV0aCkuc3BsaXQoJzonKTtcblxuICAgIGlmIChjcmVkZW50aWFscy5sZW5ndGggPT0gMikge1xuICAgICAgYXBwSWQgPSBjcmVkZW50aWFsc1swXTtcbiAgICAgIHZhciBrZXkgPSBjcmVkZW50aWFsc1sxXTtcblxuICAgICAgdmFyIGpzS2V5UHJlZml4ID0gJ2phdmFzY3JpcHQta2V5PSc7XG5cbiAgICAgIHZhciBtYXRjaEtleSA9IGtleS5pbmRleE9mKGpzS2V5UHJlZml4KTtcbiAgICAgIGlmIChtYXRjaEtleSA9PSAwKSB7XG4gICAgICAgIGphdmFzY3JpcHRLZXkgPSBrZXkuc3Vic3RyaW5nKGpzS2V5UHJlZml4Lmxlbmd0aCwga2V5Lmxlbmd0aCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXN0ZXJLZXkgPSBrZXk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgYXBwSWQ6IGFwcElkLCBtYXN0ZXJLZXk6IG1hc3RlcktleSwgamF2YXNjcmlwdEtleTogamF2YXNjcmlwdEtleSB9O1xufVxuXG5mdW5jdGlvbiBkZWNvZGVCYXNlNjQoc3RyKSB7XG4gIHJldHVybiBCdWZmZXIuZnJvbShzdHIsICdiYXNlNjQnKS50b1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkge1xuICByZXR1cm4gKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChhcHBJZCwgZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSkpO1xuICAgIGxldCBhbGxvd0hlYWRlcnMgPSBERUZBVUxUX0FMTE9XRURfSEVBREVSUztcbiAgICBpZiAoY29uZmlnICYmIGNvbmZpZy5hbGxvd0hlYWRlcnMpIHtcbiAgICAgIGFsbG93SGVhZGVycyArPSBgLCAke2NvbmZpZy5hbGxvd0hlYWRlcnMuam9pbignLCAnKX1gO1xuICAgIH1cblxuICAgIGNvbnN0IGJhc2VPcmlnaW5zID1cbiAgICAgIHR5cGVvZiBjb25maWc/LmFsbG93T3JpZ2luID09PSAnc3RyaW5nJyA/IFtjb25maWcuYWxsb3dPcmlnaW5dIDogY29uZmlnPy5hbGxvd09yaWdpbiA/PyBbJyonXTtcbiAgICBjb25zdCByZXF1ZXN0T3JpZ2luID0gcmVxLmhlYWRlcnMub3JpZ2luO1xuICAgIGNvbnN0IGFsbG93T3JpZ2lucyA9XG4gICAgICByZXF1ZXN0T3JpZ2luICYmIGJhc2VPcmlnaW5zLmluY2x1ZGVzKHJlcXVlc3RPcmlnaW4pID8gcmVxdWVzdE9yaWdpbiA6IGJhc2VPcmlnaW5zWzBdO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsIGFsbG93T3JpZ2lucyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcycsICdHRVQsUFVULFBPU1QsREVMRVRFLE9QVElPTlMnKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJywgYWxsb3dIZWFkZXJzKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1FeHBvc2UtSGVhZGVycycsICdYLVBhcnNlLUpvYi1TdGF0dXMtSWQsIFgtUGFyc2UtUHVzaC1TdGF0dXMtSWQnKTtcbiAgICAvLyBpbnRlcmNlcHQgT1BUSU9OUyBtZXRob2RcbiAgICBpZiAoJ09QVElPTlMnID09IHJlcS5tZXRob2QpIHtcbiAgICAgIHJlcy5zZW5kU3RhdHVzKDIwMCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd01ldGhvZE92ZXJyaWRlKHJlcSwgcmVzLCBuZXh0KSB7XG4gIGlmIChyZXEubWV0aG9kID09PSAnUE9TVCcgJiYgcmVxLmJvZHk/Ll9tZXRob2QpIHtcbiAgICByZXEub3JpZ2luYWxNZXRob2QgPSByZXEubWV0aG9kO1xuICAgIHJlcS5tZXRob2QgPSByZXEuYm9keS5fbWV0aG9kO1xuICAgIGRlbGV0ZSByZXEuYm9keS5fbWV0aG9kO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVBhcnNlRXJyb3JzKGVyciwgcmVxLCByZXMsIG5leHQpIHtcbiAgY29uc3QgbG9nID0gKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB8fCBkZWZhdWx0TG9nZ2VyO1xuICBpZiAoZXJyIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICBpZiAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmVuYWJsZUV4cHJlc3NFcnJvckhhbmRsZXIpIHtcbiAgICAgIHJldHVybiBuZXh0KGVycik7XG4gICAgfVxuICAgIGxldCBodHRwU3RhdHVzO1xuICAgIC8vIFRPRE86IGZpbGwgb3V0IHRoaXMgbWFwcGluZ1xuICAgIHN3aXRjaCAoZXJyLmNvZGUpIHtcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SOlxuICAgICAgICBodHRwU3RhdHVzID0gNTAwO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwNDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBodHRwU3RhdHVzID0gNDAwO1xuICAgIH1cbiAgICByZXMuc3RhdHVzKGh0dHBTdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBsb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnIpO1xuICB9IGVsc2UgaWYgKGVyci5zdGF0dXMgJiYgZXJyLm1lc3NhZ2UpIHtcbiAgICByZXMuc3RhdHVzKGVyci5zdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyLCBlcnIuc3RhY2spO1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBtZXNzYWdlOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yLicsXG4gICAgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5mb3JjZU1hc3RlcktleUFjY2VzcyhyZXEsIHJlcywgbmV4dCkge1xuICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgY29uc3QgZXJyb3IgPSBjcmVhdGVTYW5pdGl6ZWRIdHRwRXJyb3IoNDAzLCAndW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJywgcmVxLmNvbmZpZyk7XG4gICAgcmVzLnN0YXR1cyhlcnJvci5zdGF0dXMpO1xuICAgIHJlcy5lbmQoYHtcImVycm9yXCI6XCIke2Vycm9yLm1lc3NhZ2V9XCJ9YCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0LmF1dGguaXNNYXN0ZXIpIHtcbiAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRIdHRwRXJyb3IoNDAzLCAndW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJywgcmVxdWVzdC5jb25maWcpO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuZXhwb3J0IGNvbnN0IGFkZFJhdGVMaW1pdCA9IChyb3V0ZSwgY29uZmlnLCBjbG91ZCkgPT4ge1xuICBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZyk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gcm91dGUpIHtcbiAgICBpZiAoIVJhdGVMaW1pdE9wdGlvbnNba2V5XSkge1xuICAgICAgdGhyb3cgYEludmFsaWQgcmF0ZSBsaW1pdCBvcHRpb24gXCIke2tleX1cImA7XG4gICAgfVxuICB9XG4gIGlmICghY29uZmlnLnJhdGVMaW1pdHMpIHtcbiAgICBjb25maWcucmF0ZUxpbWl0cyA9IFtdO1xuICB9XG4gIGNvbnN0IHJlZGlzU3RvcmUgPSB7XG4gICAgY29ubmVjdGlvblByb21pc2U6IFByb21pc2UucmVzb2x2ZSgpLFxuICAgIHN0b3JlOiBudWxsLFxuICB9O1xuICBpZiAocm91dGUucmVkaXNVcmwpIHtcbiAgICBjb25zdCBsb2cgPSBjb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBjb25zdCBjbGllbnQgPSBjcmVhdGVDbGllbnQoe1xuICAgICAgdXJsOiByb3V0ZS5yZWRpc1VybCxcbiAgICB9KTtcbiAgICBjbGllbnQub24oJ2Vycm9yJywgZXJyID0+IHsgbG9nLmVycm9yKCdNaWRkbGV3YXJlcyBhZGRSYXRlTGltaXQgUmVkaXMgY2xpZW50IGVycm9yJywgeyBlcnJvcjogZXJyIH0pIH0pO1xuICAgIGNsaWVudC5vbignY29ubmVjdCcsICgpID0+IHsgfSk7XG4gICAgY2xpZW50Lm9uKCdyZWNvbm5lY3RpbmcnLCAoKSA9PiB7IH0pO1xuICAgIGNsaWVudC5vbigncmVhZHknLCAoKSA9PiB7IH0pO1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoY2xpZW50LmlzT3Blbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2cuZXJyb3IoYENvdWxkIG5vdCBjb25uZWN0IHRvIHJlZGlzVVJMIGluIHJhdGUgbGltaXQ6ICR7ZX1gKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICByZWRpc1N0b3JlLnN0b3JlID0gbmV3IFJlZGlzU3RvcmUoe1xuICAgICAgc2VuZENvbW1hbmQ6IGFzeW5jICguLi5hcmdzKSA9PiB7XG4gICAgICAgIGF3YWl0IHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZW5kQ29tbWFuZChhcmdzKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cbiAgbGV0IHRyYW5zZm9ybVBhdGggPSByb3V0ZS5yZXF1ZXN0UGF0aC5zcGxpdCgnLyonKS5qb2luKCcvKC4qKScpO1xuICBpZiAodHJhbnNmb3JtUGF0aCA9PT0gJyonKSB7XG4gICAgdHJhbnNmb3JtUGF0aCA9ICcoLiopJztcbiAgfVxuICBjb25maWcucmF0ZUxpbWl0cy5wdXNoKHtcbiAgICBwYXRoOiBwYXRoVG9SZWdleHAodHJhbnNmb3JtUGF0aCksXG4gICAgcmVxdWVzdENvdW50OiByb3V0ZS5yZXF1ZXN0Q291bnQsXG4gICAgcmVxdWVzdE1ldGhvZHM6IHJvdXRlLnJlcXVlc3RNZXRob2RzLFxuICAgIGluY2x1ZGVNYXN0ZXJLZXk6IHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXksXG4gICAgaW5jbHVkZUludGVybmFsUmVxdWVzdHM6IHJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzLFxuICAgIGVycm9yUmVzcG9uc2VNZXNzYWdlOiByb3V0ZS5lcnJvclJlc3BvbnNlTWVzc2FnZSB8fCBSYXRlTGltaXRPcHRpb25zLmVycm9yUmVzcG9uc2VNZXNzYWdlLmRlZmF1bHQsXG4gICAgaGFuZGxlcjogcmF0ZUxpbWl0KHtcbiAgICAgIHdpbmRvd01zOiByb3V0ZS5yZXF1ZXN0VGltZVdpbmRvdyxcbiAgICAgIG1heDogcm91dGUucmVxdWVzdENvdW50LFxuICAgICAgbWVzc2FnZTogcm91dGUuZXJyb3JSZXNwb25zZU1lc3NhZ2UgfHwgUmF0ZUxpbWl0T3B0aW9ucy5lcnJvclJlc3BvbnNlTWVzc2FnZS5kZWZhdWx0LFxuICAgICAgaGFuZGxlcjogKHJlcXVlc3QsIHJlc3BvbnNlLCBuZXh0LCBvcHRpb25zKSA9PiB7XG4gICAgICAgIHRocm93IHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiBvcHRpb25zLm1lc3NhZ2UsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgc2tpcDogcmVxdWVzdCA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LmlwID09PSAnMTI3LjAuMC4xJyAmJiAhcm91dGUuaW5jbHVkZUludGVybmFsUmVxdWVzdHMpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUuaW5jbHVkZU1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUucmVxdWVzdE1ldGhvZHMpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyb3V0ZS5yZXF1ZXN0TWV0aG9kcykpIHtcbiAgICAgICAgICAgIGlmICghcm91dGUucmVxdWVzdE1ldGhvZHMuaW5jbHVkZXMocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKHJvdXRlLnJlcXVlc3RNZXRob2RzKTtcbiAgICAgICAgICAgIGlmICghcmVnRXhwLnRlc3QocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5hdXRoPy5pc01hc3RlcjtcbiAgICAgIH0sXG4gICAgICBrZXlHZW5lcmF0b3I6IGFzeW5jIHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocm91dGUuem9uZSA9PT0gUGFyc2UuU2VydmVyLlJhdGVMaW1pdFpvbmUuZ2xvYmFsKSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmFwcElkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRva2VuID0gcmVxdWVzdC5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnNlc3Npb24gJiYgdG9rZW4pIHtcbiAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnVzZXIgJiYgdG9rZW4pIHtcbiAgICAgICAgICBpZiAoIXJlcXVlc3QuYXV0aCkge1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBoYW5kbGVQYXJzZVNlc3Npb24ocmVxdWVzdCwgbnVsbCwgcmVzb2x2ZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVxdWVzdC5hdXRoPy51c2VyPy5pZCAmJiByZXF1ZXN0LnpvbmUgPT09ICd1c2VyJykge1xuICAgICAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aC51c2VyLmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5jb25maWcuaXA7XG4gICAgICB9LFxuICAgICAgc3RvcmU6IHJlZGlzU3RvcmUuc3RvcmUsXG4gICAgfSksXG4gICAgY2xvdWQsXG4gIH0pO1xuICBDb25maWcucHV0KGNvbmZpZyk7XG59O1xuXG4vKipcbiAqIERlZHVwbGljYXRlcyBhIHJlcXVlc3QgdG8gZW5zdXJlIGlkZW1wb3RlbmN5LiBEdXBsaWNhdGVzIGFyZSBkZXRlcm1pbmVkIGJ5IHRoZSByZXF1ZXN0IElEXG4gKiBpbiB0aGUgcmVxdWVzdCBoZWFkZXIuIElmIGEgcmVxdWVzdCBoYXMgbm8gcmVxdWVzdCBJRCwgaXQgaXMgZXhlY3V0ZWQgYW55d2F5LlxuICogQHBhcmFtIHsqfSByZXEgVGhlIHJlcXVlc3QgdG8gZXZhbHVhdGUuXG4gKiBAcmV0dXJucyBQcm9taXNlPHt9PlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5KHJlcSkge1xuICAvLyBFbmFibGUgZmVhdHVyZSBvbmx5IGZvciBNb25nb0RCXG4gIGlmIChcbiAgICAhKFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlciB8fFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlclxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIEdldCBwYXJhbWV0ZXJzXG4gIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gIGNvbnN0IHJlcXVlc3RJZCA9ICgocmVxIHx8IHt9KS5oZWFkZXJzIHx8IHt9KVsneC1wYXJzZS1yZXF1ZXN0LWlkJ107XG4gIGNvbnN0IHsgcGF0aHMsIHR0bCB9ID0gY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgaWYgKCFyZXF1ZXN0SWQgfHwgIWNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUmVxdWVzdCBwYXRoIG1heSBjb250YWluIHRyYWlsaW5nIHNsYXNoZXMsIGRlcGVuZGluZyBvbiB0aGUgb3JpZ2luYWwgcmVxdWVzdCwgc28gcmVtb3ZlXG4gIC8vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgdG8gbWFrZSBpdCBlYXNpZXIgdG8gc3BlY2lmeSBwYXRocyBpbiB0aGUgY29uZmlndXJhdGlvblxuICBjb25zdCByZXFQYXRoID0gcmVxLnBhdGgucmVwbGFjZSgvXlxcL3xcXC8kLywgJycpO1xuICAvLyBEZXRlcm1pbmUgd2hldGhlciBpZGVtcG90ZW5jeSBpcyBlbmFibGVkIGZvciBjdXJyZW50IHJlcXVlc3QgcGF0aFxuICBsZXQgbWF0Y2ggPSBmYWxzZTtcbiAgZm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG4gICAgLy8gQXNzdW1lIG9uZSB3YW50cyBhIHBhdGggdG8gYWx3YXlzIG1hdGNoIGZyb20gdGhlIGJlZ2lubmluZyB0byBwcmV2ZW50IGFueSBtaXN0YWtlc1xuICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXRoLmNoYXJBdCgwKSA9PT0gJ14nID8gcGF0aCA6ICdeJyArIHBhdGgpO1xuICAgIGlmIChyZXFQYXRoLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVHJ5IHRvIHN0b3JlIHJlcXVlc3RcbiAgY29uc3QgZXhwaXJ5RGF0ZSA9IG5ldyBEYXRlKG5ldyBEYXRlKCkuc2V0U2Vjb25kcyhuZXcgRGF0ZSgpLmdldFNlY29uZHMoKSArIHR0bCkpO1xuICByZXR1cm4gcmVzdFxuICAgIC5jcmVhdGUoY29uZmlnLCBhdXRoLm1hc3Rlcihjb25maWcpLCAnX0lkZW1wb3RlbmN5Jywge1xuICAgICAgcmVxSWQ6IHJlcXVlc3RJZCxcbiAgICAgIGV4cGlyZTogUGFyc2UuX2VuY29kZShleHBpcnlEYXRlKSxcbiAgICB9KVxuICAgIC5jYXRjaChlID0+IHtcbiAgICAgIGlmIChlLmNvZGUgPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfUkVRVUVTVCwgJ0R1cGxpY2F0ZSByZXF1ZXN0Jyk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMyk7XG4gIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWRcIn0nKTtcbn1cblxuZnVuY3Rpb24gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMCk7XG4gIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBlcnJvcjogJ0ludmFsaWQgb2JqZWN0IGZvciBjb250ZXh0LicgfSk7XG59XG5cbi8qKlxuICogRXhwcmVzcyA0IGFsbG93ZWQgYSBkb3VibGUgZm9yd2FyZCBzbGFzaCBiZXR3ZWVuIGEgcm91dGUgYW5kIHJvdXRlci4gQWx0aG91Z2hcbiAqIHRoaXMgc2hvdWxkIGJlIGNvbnNpZGVyZWQgYW4gYW50aS1wYXR0ZXJuLCB3ZSBuZWVkIHRvIHN1cHBvcnQgaXQgZm9yIGJhY2t3YXJkc1xuICogY29tcGF0aWJpbGl0eS5cbiAqXG4gKiBUZWNobmljYWxseSB2YWxpZCBVUkwgd2l0aCBkb3VibGUgZm9yb3dhcmQgc2xhc2g6XG4gKiBodHRwOi8vbG9jYWxob3N0OjEzMzcvcGFyc2UvL2Z1bmN0aW9ucy90ZXN0RnVuY3Rpb25cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFsbG93RG91YmxlRm9yd2FyZFNsYXNoKHJlcSwgcmVzLCBuZXh0KSB7XG4gIHJlcS51cmwgPSByZXEudXJsLnN0YXJ0c1dpdGgoJy8vJykgPyByZXEudXJsLnN1YnN0cmluZygxKSA6IHJlcS51cmw7XG4gIG5leHQoKTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLE1BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLE9BQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLEtBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLG9CQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyx1QkFBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsaUJBQUEsR0FBQVQsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFTLFlBQUEsR0FBQVQsT0FBQTtBQUNBLElBQUFVLGFBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLGVBQUEsR0FBQVosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFZLE1BQUEsR0FBQVosT0FBQTtBQUNBLElBQUFhLElBQUEsR0FBQWIsT0FBQTtBQUNBLElBQUFjLE1BQUEsR0FBQWQsT0FBQTtBQUFtRCxTQUFBRCx1QkFBQWdCLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFFNUMsTUFBTUcsdUJBQXVCLEdBQUFDLE9BQUEsQ0FBQUQsdUJBQUEsR0FDbEMsK09BQStPO0FBRWpQLE1BQU1FLGtCQUFrQixHQUFHLFNBQUFBLENBQVVDLEdBQUcsRUFBRTtFQUN4QyxNQUFNQyxlQUFlLEdBQUdELEdBQUcsQ0FBQ0UsV0FBVyxDQUFDQyxNQUFNLEdBQUdILEdBQUcsQ0FBQ0ksR0FBRyxDQUFDRCxNQUFNO0VBQy9ELE1BQU1FLFNBQVMsR0FBR0wsR0FBRyxDQUFDRSxXQUFXLENBQUNJLEtBQUssQ0FBQyxDQUFDLEVBQUVMLGVBQWUsQ0FBQztFQUMzRCxPQUFPRCxHQUFHLENBQUNPLFFBQVEsR0FBRyxLQUFLLEdBQUdQLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHSCxTQUFTO0FBQzNELENBQUM7QUFFRCxNQUFNSSxZQUFZLEdBQUdBLENBQUNDLFdBQVcsRUFBRUMsS0FBSyxLQUFLO0VBQzNDLElBQUlBLEtBQUssQ0FBQ0gsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFO0lBQUUsT0FBT0csS0FBSyxDQUFDSCxHQUFHLENBQUMsV0FBVyxDQUFDO0VBQUU7RUFDN0QsTUFBTUksU0FBUyxHQUFHLElBQUlDLGNBQVMsQ0FBQyxDQUFDO0VBQ2pDSCxXQUFXLENBQUNJLE9BQU8sQ0FBQ0MsTUFBTSxJQUFJO0lBQzVCLElBQUlBLE1BQU0sS0FBSyxNQUFNLElBQUlBLE1BQU0sS0FBSyxJQUFJLEVBQUU7TUFDeENKLEtBQUssQ0FBQ0ssR0FBRyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUM7TUFDL0I7SUFDRjtJQUNBLElBQUlELE1BQU0sS0FBSyxXQUFXLElBQUlBLE1BQU0sS0FBSyxTQUFTLEVBQUU7TUFDbERKLEtBQUssQ0FBQ0ssR0FBRyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUM7TUFDL0I7SUFDRjtJQUNBLE1BQU0sQ0FBQ0MsRUFBRSxFQUFFQyxJQUFJLENBQUMsR0FBR0gsTUFBTSxDQUFDSSxLQUFLLENBQUMsR0FBRyxDQUFDO0lBQ3BDLElBQUksQ0FBQ0QsSUFBSSxFQUFFO01BQ1ROLFNBQVMsQ0FBQ1EsVUFBVSxDQUFDSCxFQUFFLEVBQUUsSUFBQUksV0FBTSxFQUFDSixFQUFFLENBQUMsR0FBRyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3hELENBQUMsTUFBTTtNQUNMTCxTQUFTLENBQUNVLFNBQVMsQ0FBQ0wsRUFBRSxFQUFFTSxNQUFNLENBQUNMLElBQUksQ0FBQyxFQUFFLElBQUFHLFdBQU0sRUFBQ0osRUFBRSxDQUFDLEdBQUcsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUNyRTtFQUNGLENBQUMsQ0FBQztFQUNGTixLQUFLLENBQUNLLEdBQUcsQ0FBQyxXQUFXLEVBQUVKLFNBQVMsQ0FBQztFQUNqQyxPQUFPQSxTQUFTO0FBQ2xCLENBQUM7QUFFTSxNQUFNWSxPQUFPLEdBQUdBLENBQUNQLEVBQUUsRUFBRVAsV0FBVyxFQUFFQyxLQUFLLEtBQUs7RUFDakQsTUFBTWMsY0FBYyxHQUFHLElBQUFKLFdBQU0sRUFBQ0osRUFBRSxDQUFDO0VBQ2pDLE1BQU1MLFNBQVMsR0FBR0gsWUFBWSxDQUFDQyxXQUFXLEVBQUVDLEtBQUssQ0FBQztFQUVsRCxJQUFJQSxLQUFLLENBQUNILEdBQUcsQ0FBQ1MsRUFBRSxDQUFDLEVBQUU7SUFBRSxPQUFPLElBQUk7RUFBRTtFQUNsQyxJQUFJTixLQUFLLENBQUNILEdBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSWlCLGNBQWMsRUFBRTtJQUFFLE9BQU8sSUFBSTtFQUFFO0VBQ2hFLElBQUlkLEtBQUssQ0FBQ0gsR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUNpQixjQUFjLEVBQUU7SUFBRSxPQUFPLElBQUk7RUFBRTtFQUNqRSxNQUFNQyxNQUFNLEdBQUdkLFNBQVMsQ0FBQ2UsS0FBSyxDQUFDVixFQUFFLEVBQUVRLGNBQWMsR0FBRyxNQUFNLEdBQUcsTUFBTSxDQUFDOztFQUVwRTtFQUNBO0VBQ0EsSUFBSWYsV0FBVyxDQUFDa0IsUUFBUSxDQUFDWCxFQUFFLENBQUMsSUFBSVMsTUFBTSxFQUFFO0lBQ3RDZixLQUFLLENBQUNLLEdBQUcsQ0FBQ0MsRUFBRSxFQUFFUyxNQUFNLENBQUM7RUFDdkI7RUFDQSxPQUFPQSxNQUFNO0FBQ2YsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTVCLE9BQUEsQ0FBQTBCLE9BQUEsR0FBQUEsT0FBQTtBQUNPLGVBQWVLLGtCQUFrQkEsQ0FBQzdCLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxFQUFFO0VBQ3ZELElBQUlDLEtBQUssR0FBR2pDLGtCQUFrQixDQUFDQyxHQUFHLENBQUM7RUFFbkMsSUFBSWlDLE9BQU8sR0FBRyxDQUFDLENBQUM7RUFDaEIsSUFBSWpDLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHVCQUF1QixDQUFDLElBQUksSUFBSSxFQUFFO0lBQzVDLElBQUk7TUFDRnlCLE9BQU8sR0FBR0MsSUFBSSxDQUFDQyxLQUFLLENBQUNuQyxHQUFHLENBQUNRLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO01BQ3RELElBQUk0QixNQUFNLENBQUNDLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUNOLE9BQU8sQ0FBQyxLQUFLLGlCQUFpQixFQUFFO1FBQ2pFLE1BQU0sMEJBQTBCO01BQ2xDO0lBQ0YsQ0FBQyxDQUFDLE1BQU07TUFDTixPQUFPTyxnQkFBZ0IsQ0FBQ3hDLEdBQUcsRUFBRThCLEdBQUcsQ0FBQztJQUNuQztFQUNGO0VBQ0EsSUFBSVcsSUFBSSxHQUFHO0lBQ1RDLEtBQUssRUFBRTFDLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHdCQUF3QixDQUFDO0lBQ3hDbUMsWUFBWSxFQUFFM0MsR0FBRyxDQUFDUSxHQUFHLENBQUMsdUJBQXVCLENBQUM7SUFDOUNvQyxTQUFTLEVBQUU1QyxHQUFHLENBQUNRLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQztJQUN4Q3FDLGNBQWMsRUFBRTdDLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHlCQUF5QixDQUFDO0lBQ2xEc0MsY0FBYyxFQUFFOUMsR0FBRyxDQUFDUSxHQUFHLENBQUMseUJBQXlCLENBQUM7SUFDbER1QyxTQUFTLEVBQUUvQyxHQUFHLENBQUNRLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQztJQUN4Q3dDLGFBQWEsRUFBRWhELEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHdCQUF3QixDQUFDO0lBQ2hEeUMsU0FBUyxFQUFFakQsR0FBRyxDQUFDUSxHQUFHLENBQUMscUJBQXFCLENBQUM7SUFDekMwQyxVQUFVLEVBQUVsRCxHQUFHLENBQUNRLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQztJQUMzQ3lCLE9BQU8sRUFBRUE7RUFDWCxDQUFDO0VBRUQsSUFBSWtCLFNBQVMsR0FBR0MsUUFBUSxDQUFDcEQsR0FBRyxDQUFDO0VBRTdCLElBQUltRCxTQUFTLEVBQUU7SUFDYixJQUFJRSxjQUFjLEdBQUdGLFNBQVMsQ0FBQ1QsS0FBSztJQUNwQyxJQUFJWSxjQUFRLENBQUM5QyxHQUFHLENBQUM2QyxjQUFjLENBQUMsRUFBRTtNQUNoQ1osSUFBSSxDQUFDQyxLQUFLLEdBQUdXLGNBQWM7TUFDM0JaLElBQUksQ0FBQ0csU0FBUyxHQUFHTyxTQUFTLENBQUNQLFNBQVMsSUFBSUgsSUFBSSxDQUFDRyxTQUFTO01BQ3RESCxJQUFJLENBQUNPLGFBQWEsR0FBR0csU0FBUyxDQUFDSCxhQUFhLElBQUlQLElBQUksQ0FBQ08sYUFBYTtJQUNwRTtFQUNGO0VBRUEsSUFBSWhELEdBQUcsQ0FBQ3VELElBQUksRUFBRTtJQUNaO0lBQ0E7SUFDQSxPQUFPdkQsR0FBRyxDQUFDdUQsSUFBSSxDQUFDQyxPQUFPO0VBQ3pCO0VBRUEsSUFBSUMsV0FBVyxHQUFHLEtBQUs7RUFFdkIsSUFBSSxDQUFDaEIsSUFBSSxDQUFDQyxLQUFLLElBQUksQ0FBQ1ksY0FBUSxDQUFDOUMsR0FBRyxDQUFDaUMsSUFBSSxDQUFDQyxLQUFLLENBQUMsRUFBRTtJQUM1QztJQUNBLElBQUkxQyxHQUFHLENBQUN1RCxJQUFJLFlBQVlHLE1BQU0sRUFBRTtNQUM5QjtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0EsSUFBSTtRQUNGMUQsR0FBRyxDQUFDdUQsSUFBSSxHQUFHckIsSUFBSSxDQUFDQyxLQUFLLENBQUNuQyxHQUFHLENBQUN1RCxJQUFJLENBQUM7TUFDakMsQ0FBQyxDQUFDLE1BQU07UUFDTixPQUFPSSxjQUFjLENBQUMzRCxHQUFHLEVBQUU4QixHQUFHLENBQUM7TUFDakM7TUFDQTJCLFdBQVcsR0FBRyxJQUFJO0lBQ3BCO0lBRUEsSUFBSXpELEdBQUcsQ0FBQ3VELElBQUksRUFBRTtNQUNaLE9BQU92RCxHQUFHLENBQUN1RCxJQUFJLENBQUNLLGlCQUFpQjtJQUNuQztJQUVBLElBQ0U1RCxHQUFHLENBQUN1RCxJQUFJLElBQ1J2RCxHQUFHLENBQUN1RCxJQUFJLENBQUNNLGNBQWMsSUFDdkJQLGNBQVEsQ0FBQzlDLEdBQUcsQ0FBQ1IsR0FBRyxDQUFDdUQsSUFBSSxDQUFDTSxjQUFjLENBQUMsS0FDcEMsQ0FBQ3BCLElBQUksQ0FBQ0csU0FBUyxJQUFJVSxjQUFRLENBQUM5QyxHQUFHLENBQUNSLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ00sY0FBYyxDQUFDLENBQUNqQixTQUFTLEtBQUtILElBQUksQ0FBQ0csU0FBUyxDQUFDLEVBQ3ZGO01BQ0FILElBQUksQ0FBQ0MsS0FBSyxHQUFHMUMsR0FBRyxDQUFDdUQsSUFBSSxDQUFDTSxjQUFjO01BQ3BDcEIsSUFBSSxDQUFDTyxhQUFhLEdBQUdoRCxHQUFHLENBQUN1RCxJQUFJLENBQUNPLGNBQWMsSUFBSSxFQUFFO01BQ2xELE9BQU85RCxHQUFHLENBQUN1RCxJQUFJLENBQUNNLGNBQWM7TUFDOUIsT0FBTzdELEdBQUcsQ0FBQ3VELElBQUksQ0FBQ08sY0FBYztNQUM5QjtNQUNBO01BQ0EsT0FBTzlELEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1EsY0FBYztNQUM5QixJQUFJL0QsR0FBRyxDQUFDdUQsSUFBSSxDQUFDUyxlQUFlLEVBQUU7UUFDNUJ2QixJQUFJLENBQUNLLGNBQWMsR0FBRzlDLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1MsZUFBZTtRQUM5QyxPQUFPaEUsR0FBRyxDQUFDdUQsSUFBSSxDQUFDUyxlQUFlO01BQ2pDO01BQ0EsSUFBSWhFLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1UsYUFBYSxFQUFFO1FBQzFCeEIsSUFBSSxDQUFDRSxZQUFZLEdBQUczQyxHQUFHLENBQUN1RCxJQUFJLENBQUNVLGFBQWE7UUFDMUMsT0FBT2pFLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1UsYUFBYTtNQUMvQjtNQUNBLElBQUlqRSxHQUFHLENBQUN1RCxJQUFJLENBQUNXLFVBQVUsRUFBRTtRQUN2QnpCLElBQUksQ0FBQ0csU0FBUyxHQUFHNUMsR0FBRyxDQUFDdUQsSUFBSSxDQUFDVyxVQUFVO1FBQ3BDLE9BQU9sRSxHQUFHLENBQUN1RCxJQUFJLENBQUNXLFVBQVU7TUFDNUI7TUFDQSxJQUFJbEUsR0FBRyxDQUFDdUQsSUFBSSxDQUFDWSxRQUFRLEVBQUU7UUFDckIsSUFBSW5FLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1ksUUFBUSxZQUFZL0IsTUFBTSxFQUFFO1VBQ3ZDSyxJQUFJLENBQUNSLE9BQU8sR0FBR2pDLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1ksUUFBUTtRQUNsQyxDQUFDLE1BQU07VUFDTCxJQUFJO1lBQ0YxQixJQUFJLENBQUNSLE9BQU8sR0FBR0MsSUFBSSxDQUFDQyxLQUFLLENBQUNuQyxHQUFHLENBQUN1RCxJQUFJLENBQUNZLFFBQVEsQ0FBQztZQUM1QyxJQUFJL0IsTUFBTSxDQUFDQyxTQUFTLENBQUNDLFFBQVEsQ0FBQ0MsSUFBSSxDQUFDRSxJQUFJLENBQUNSLE9BQU8sQ0FBQyxLQUFLLGlCQUFpQixFQUFFO2NBQ3RFLE1BQU0sMEJBQTBCO1lBQ2xDO1VBQ0YsQ0FBQyxDQUFDLE1BQU07WUFDTixPQUFPTyxnQkFBZ0IsQ0FBQ3hDLEdBQUcsRUFBRThCLEdBQUcsQ0FBQztVQUNuQztRQUNGO1FBQ0EsT0FBTzlCLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1ksUUFBUTtNQUMxQixDQUFDLE1BQU0sSUFBSW5FLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ1ksUUFBUSxLQUFLLElBQUksRUFBRTtRQUNyQztRQUNBLE9BQU9uRSxHQUFHLENBQUN1RCxJQUFJLENBQUNZLFFBQVE7TUFDMUI7TUFDQSxJQUFJbkUsR0FBRyxDQUFDdUQsSUFBSSxDQUFDYSxZQUFZLEVBQUU7UUFDekJwRSxHQUFHLENBQUNxRSxPQUFPLENBQUMsY0FBYyxDQUFDLEdBQUdyRSxHQUFHLENBQUN1RCxJQUFJLENBQUNhLFlBQVk7UUFDbkQsT0FBT3BFLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ2EsWUFBWTtNQUM5QjtJQUNGLENBQUMsTUFBTTtNQUNMLE9BQU9ULGNBQWMsQ0FBQzNELEdBQUcsRUFBRThCLEdBQUcsQ0FBQztJQUNqQztFQUNGO0VBRUEsSUFBSVcsSUFBSSxDQUFDRSxZQUFZLElBQUksT0FBT0YsSUFBSSxDQUFDRSxZQUFZLEtBQUssUUFBUSxFQUFFO0lBQzlERixJQUFJLENBQUNFLFlBQVksR0FBR0YsSUFBSSxDQUFDRSxZQUFZLENBQUNMLFFBQVEsQ0FBQyxDQUFDO0VBQ2xEO0VBRUEsSUFBSW1CLFdBQVcsSUFBSXpELEdBQUcsQ0FBQ3VELElBQUksRUFBRTtJQUMzQnZELEdBQUcsQ0FBQ3NFLFFBQVEsR0FBR3RFLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ2UsUUFBUTtJQUNoQztJQUNBLElBQUlDLE1BQU0sR0FBR3ZFLEdBQUcsQ0FBQ3VELElBQUksQ0FBQ2dCLE1BQU07SUFDNUJ2RSxHQUFHLENBQUN1RCxJQUFJLEdBQUdHLE1BQU0sQ0FBQ2MsSUFBSSxDQUFDRCxNQUFNLEVBQUUsUUFBUSxDQUFDO0VBQzFDO0VBRUEsTUFBTUUsUUFBUSxHQUFHQyxXQUFXLENBQUMxRSxHQUFHLENBQUM7RUFDakMsTUFBTTJFLE1BQU0sR0FBR0MsZUFBTSxDQUFDcEUsR0FBRyxDQUFDaUMsSUFBSSxDQUFDQyxLQUFLLEVBQUVWLEtBQUssQ0FBQztFQUM1QyxJQUFJMkMsTUFBTSxDQUFDRSxLQUFLLElBQUlGLE1BQU0sQ0FBQ0UsS0FBSyxLQUFLLElBQUksRUFBRTtJQUN6Qy9DLEdBQUcsQ0FBQ2dELE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDZmhELEdBQUcsQ0FBQ2lELElBQUksQ0FBQztNQUNQQyxJQUFJLEVBQUVDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxxQkFBcUI7TUFDdkNDLEtBQUssRUFBRSx5QkFBeUJULE1BQU0sQ0FBQ0UsS0FBSztJQUM5QyxDQUFDLENBQUM7SUFDRjtFQUNGO0VBQ0EsTUFBTUYsTUFBTSxDQUFDVSxRQUFRLENBQUMsQ0FBQztFQUV2QjVDLElBQUksQ0FBQzZDLEdBQUcsR0FBR2hDLGNBQVEsQ0FBQzlDLEdBQUcsQ0FBQ2lDLElBQUksQ0FBQ0MsS0FBSyxDQUFDO0VBQ25DMUMsR0FBRyxDQUFDMkUsTUFBTSxHQUFHQSxNQUFNO0VBQ25CM0UsR0FBRyxDQUFDMkUsTUFBTSxDQUFDTixPQUFPLEdBQUdyRSxHQUFHLENBQUNxRSxPQUFPLElBQUksQ0FBQyxDQUFDO0VBQ3RDckUsR0FBRyxDQUFDMkUsTUFBTSxDQUFDMUQsRUFBRSxHQUFHd0QsUUFBUTtFQUN4QnpFLEdBQUcsQ0FBQ3lDLElBQUksR0FBR0EsSUFBSTtFQUVmLE1BQU04QyxhQUFhLEdBQ2pCdkYsR0FBRyxDQUFDMkUsTUFBTSxDQUFDOUIsY0FBYyxJQUFJSixJQUFJLENBQUNJLGNBQWMsS0FBSzdDLEdBQUcsQ0FBQzJFLE1BQU0sQ0FBQzlCLGNBQWM7RUFDaEYsSUFBSTBDLGFBQWEsRUFBRTtJQUNqQixJQUFJL0QsT0FBTyxDQUFDaUQsUUFBUSxFQUFFekUsR0FBRyxDQUFDMkUsTUFBTSxDQUFDYSxpQkFBaUIsSUFBSSxFQUFFLEVBQUV4RixHQUFHLENBQUMyRSxNQUFNLENBQUNjLHNCQUFzQixDQUFDLEVBQUU7TUFDNUZ6RixHQUFHLENBQUMwRixJQUFJLEdBQUcsSUFBSUEsYUFBSSxDQUFDQyxJQUFJLENBQUM7UUFDdkJoQixNQUFNLEVBQUUzRSxHQUFHLENBQUMyRSxNQUFNO1FBQ2xCN0IsY0FBYyxFQUFFTCxJQUFJLENBQUNLLGNBQWM7UUFDbkN5QyxhQUFhLEVBQUU7TUFDakIsQ0FBQyxDQUFDO01BQ0Z4RCxJQUFJLENBQUMsQ0FBQztNQUNOO0lBQ0Y7SUFDQSxNQUFNNkQsR0FBRyxHQUFHNUYsR0FBRyxDQUFDMkUsTUFBTSxFQUFFa0IsZ0JBQWdCLElBQUlDLGVBQWE7SUFDekRGLEdBQUcsQ0FBQ1IsS0FBSyxDQUNQLHFFQUFxRVgsUUFBUSwwREFDL0UsQ0FBQztFQUNIO0VBRUEsTUFBTTdCLFNBQVMsR0FBRyxNQUFNNUMsR0FBRyxDQUFDMkUsTUFBTSxDQUFDb0IsYUFBYSxDQUFDLENBQUM7RUFDbEQsSUFBSUMsUUFBUSxHQUFHdkQsSUFBSSxDQUFDRyxTQUFTLEtBQUtBLFNBQVM7RUFFM0MsSUFBSW9ELFFBQVEsSUFBSSxDQUFDeEUsT0FBTyxDQUFDaUQsUUFBUSxFQUFFekUsR0FBRyxDQUFDMkUsTUFBTSxDQUFDc0IsWUFBWSxJQUFJLEVBQUUsRUFBRWpHLEdBQUcsQ0FBQzJFLE1BQU0sQ0FBQ3VCLGlCQUFpQixDQUFDLEVBQUU7SUFDL0YsTUFBTU4sR0FBRyxHQUFHNUYsR0FBRyxDQUFDMkUsTUFBTSxFQUFFa0IsZ0JBQWdCLElBQUlDLGVBQWE7SUFDekRGLEdBQUcsQ0FBQ1IsS0FBSyxDQUNQLGdFQUFnRVgsUUFBUSxxREFDMUUsQ0FBQztJQUNEdUIsUUFBUSxHQUFHLEtBQUs7SUFDaEIsTUFBTVosS0FBSyxHQUFHLElBQUlGLEtBQUssQ0FBQyxDQUFDO0lBQ3pCRSxLQUFLLENBQUNOLE1BQU0sR0FBRyxHQUFHO0lBQ2xCTSxLQUFLLENBQUNlLE9BQU8sR0FBRyxjQUFjO0lBQzlCLE1BQU1mLEtBQUs7RUFDYjtFQUVBLElBQUlZLFFBQVEsRUFBRTtJQUNaaEcsR0FBRyxDQUFDMEYsSUFBSSxHQUFHLElBQUlBLGFBQUksQ0FBQ0MsSUFBSSxDQUFDO01BQ3ZCaEIsTUFBTSxFQUFFM0UsR0FBRyxDQUFDMkUsTUFBTTtNQUNsQjdCLGNBQWMsRUFBRUwsSUFBSSxDQUFDSyxjQUFjO01BQ25Da0QsUUFBUSxFQUFFO0lBQ1osQ0FBQyxDQUFDO0lBQ0YsT0FBT0ksZUFBZSxDQUFDcEcsR0FBRyxFQUFFOEIsR0FBRyxFQUFFQyxJQUFJLENBQUM7RUFDeEM7RUFFQSxJQUFJc0UsZ0JBQWdCLEdBQUc1RCxJQUFJLENBQUNHLFNBQVMsS0FBSzVDLEdBQUcsQ0FBQzJFLE1BQU0sQ0FBQzJCLGlCQUFpQjtFQUN0RSxJQUNFLE9BQU90RyxHQUFHLENBQUMyRSxNQUFNLENBQUMyQixpQkFBaUIsSUFBSSxXQUFXLElBQ2xEdEcsR0FBRyxDQUFDMkUsTUFBTSxDQUFDMkIsaUJBQWlCLElBQzVCRCxnQkFBZ0IsRUFDaEI7SUFDQXJHLEdBQUcsQ0FBQzBGLElBQUksR0FBRyxJQUFJQSxhQUFJLENBQUNDLElBQUksQ0FBQztNQUN2QmhCLE1BQU0sRUFBRTNFLEdBQUcsQ0FBQzJFLE1BQU07TUFDbEI3QixjQUFjLEVBQUVMLElBQUksQ0FBQ0ssY0FBYztNQUNuQ2tELFFBQVEsRUFBRSxJQUFJO01BQ2RPLFVBQVUsRUFBRTtJQUNkLENBQUMsQ0FBQztJQUNGLE9BQU9ILGVBQWUsQ0FBQ3BHLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxDQUFDO0VBQ3hDOztFQUVBO0VBQ0E7RUFDQSxNQUFNeUUsSUFBSSxHQUFHLENBQUMsV0FBVyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsWUFBWSxDQUFDO0VBQ3RFLE1BQU1DLGdCQUFnQixHQUFHRCxJQUFJLENBQUNFLElBQUksQ0FBQyxVQUFVQyxHQUFHLEVBQUU7SUFDaEQsT0FBTzNHLEdBQUcsQ0FBQzJFLE1BQU0sQ0FBQ2dDLEdBQUcsQ0FBQyxLQUFLQyxTQUFTO0VBQ3RDLENBQUMsQ0FBQztFQUNGLE1BQU1DLGFBQWEsR0FBR0wsSUFBSSxDQUFDRSxJQUFJLENBQUMsVUFBVUMsR0FBRyxFQUFFO0lBQzdDLE9BQU8zRyxHQUFHLENBQUMyRSxNQUFNLENBQUNnQyxHQUFHLENBQUMsS0FBS0MsU0FBUyxJQUFJbkUsSUFBSSxDQUFDa0UsR0FBRyxDQUFDLEtBQUszRyxHQUFHLENBQUMyRSxNQUFNLENBQUNnQyxHQUFHLENBQUM7RUFDdkUsQ0FBQyxDQUFDO0VBRUYsSUFBSUYsZ0JBQWdCLElBQUksQ0FBQ0ksYUFBYSxFQUFFO0lBQ3RDLE9BQU9sRCxjQUFjLENBQUMzRCxHQUFHLEVBQUU4QixHQUFHLENBQUM7RUFDakM7RUFFQSxJQUFJOUIsR0FBRyxDQUFDSSxHQUFHLElBQUksUUFBUSxFQUFFO0lBQ3ZCLE9BQU9xQyxJQUFJLENBQUNFLFlBQVk7RUFDMUI7RUFFQSxJQUFJM0MsR0FBRyxDQUFDOEcsV0FBVyxFQUFFO0lBQ25COUcsR0FBRyxDQUFDMEYsSUFBSSxHQUFHLElBQUlBLGFBQUksQ0FBQ0MsSUFBSSxDQUFDO01BQ3ZCaEIsTUFBTSxFQUFFM0UsR0FBRyxDQUFDMkUsTUFBTTtNQUNsQjdCLGNBQWMsRUFBRUwsSUFBSSxDQUFDSyxjQUFjO01BQ25Da0QsUUFBUSxFQUFFLEtBQUs7TUFDZmUsSUFBSSxFQUFFL0csR0FBRyxDQUFDOEc7SUFDWixDQUFDLENBQUM7SUFDRixPQUFPVixlQUFlLENBQUNwRyxHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksQ0FBQztFQUN4QztFQUVBLElBQUksQ0FBQ1UsSUFBSSxDQUFDRSxZQUFZLEVBQUU7SUFDdEIzQyxHQUFHLENBQUMwRixJQUFJLEdBQUcsSUFBSUEsYUFBSSxDQUFDQyxJQUFJLENBQUM7TUFDdkJoQixNQUFNLEVBQUUzRSxHQUFHLENBQUMyRSxNQUFNO01BQ2xCN0IsY0FBYyxFQUFFTCxJQUFJLENBQUNLLGNBQWM7TUFDbkNrRCxRQUFRLEVBQUU7SUFDWixDQUFDLENBQUM7RUFDSjtFQUNBSSxlQUFlLENBQUNwRyxHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksQ0FBQztBQUNqQztBQUVBLE1BQU1xRSxlQUFlLEdBQUcsTUFBQUEsQ0FBT3BHLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxLQUFLO0VBQ2hELE1BQU1pRixVQUFVLEdBQUdoSCxHQUFHLENBQUMyRSxNQUFNLENBQUNxQyxVQUFVLElBQUksRUFBRTtFQUM5QyxJQUFJO0lBQ0YsTUFBTUMsT0FBTyxDQUFDQyxHQUFHLENBQ2ZGLFVBQVUsQ0FBQ0csR0FBRyxDQUFDLE1BQU1DLEtBQUssSUFBSTtNQUM1QixNQUFNQyxPQUFPLEdBQUcsSUFBSUMsTUFBTSxDQUFDRixLQUFLLENBQUNHLElBQUksQ0FBQztNQUN0QyxJQUFJRixPQUFPLENBQUNHLElBQUksQ0FBQ3hILEdBQUcsQ0FBQ0ksR0FBRyxDQUFDLEVBQUU7UUFDekIsTUFBTWdILEtBQUssQ0FBQ0ssT0FBTyxDQUFDekgsR0FBRyxFQUFFOEIsR0FBRyxFQUFFNEYsR0FBRyxJQUFJO1VBQ25DLElBQUlBLEdBQUcsRUFBRTtZQUNQLElBQUlBLEdBQUcsQ0FBQzFDLElBQUksS0FBS0MsYUFBSyxDQUFDQyxLQUFLLENBQUN5QyxpQkFBaUIsRUFBRTtjQUM5QyxNQUFNRCxHQUFHO1lBQ1g7WUFDQTFILEdBQUcsQ0FBQzJFLE1BQU0sQ0FBQ2tCLGdCQUFnQixDQUFDVCxLQUFLLENBQy9CLHNFQUFzRSxFQUN0RXNDLEdBQ0YsQ0FBQztVQUNIO1FBQ0YsQ0FBQyxDQUFDO01BQ0o7SUFDRixDQUFDLENBQ0gsQ0FBQztFQUNILENBQUMsQ0FBQyxPQUFPdEMsS0FBSyxFQUFFO0lBQ2R0RCxHQUFHLENBQUNnRCxNQUFNLENBQUMsR0FBRyxDQUFDO0lBQ2ZoRCxHQUFHLENBQUNpRCxJQUFJLENBQUM7TUFBRUMsSUFBSSxFQUFFQyxhQUFLLENBQUNDLEtBQUssQ0FBQ3lDLGlCQUFpQjtNQUFFdkMsS0FBSyxFQUFFQSxLQUFLLENBQUNlO0lBQVEsQ0FBQyxDQUFDO0lBQ3ZFO0VBQ0Y7RUFDQXBFLElBQUksQ0FBQyxDQUFDO0FBQ1IsQ0FBQztBQUVNLE1BQU02RixrQkFBa0IsR0FBRyxNQUFBQSxDQUFPNUgsR0FBRyxFQUFFOEIsR0FBRyxFQUFFQyxJQUFJLEtBQUs7RUFDMUQsSUFBSTtJQUNGLE1BQU1VLElBQUksR0FBR3pDLEdBQUcsQ0FBQ3lDLElBQUk7SUFDckIsSUFBSXpDLEdBQUcsQ0FBQzBGLElBQUksSUFBSTFGLEdBQUcsQ0FBQ0ksR0FBRyxLQUFLLGNBQWMsRUFBRTtNQUMxQzJCLElBQUksQ0FBQyxDQUFDO01BQ047SUFDRjtJQUNBLElBQUk4RixXQUFXLEdBQUcsSUFBSTtJQUN0QixJQUNFcEYsSUFBSSxDQUFDRSxZQUFZLElBQ2pCM0MsR0FBRyxDQUFDSSxHQUFHLEtBQUssNEJBQTRCLElBQ3hDcUMsSUFBSSxDQUFDRSxZQUFZLENBQUNtRixPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUNwQztNQUNBRCxXQUFXLEdBQUcsTUFBTW5DLGFBQUksQ0FBQ3FDLDRCQUE0QixDQUFDO1FBQ3BEcEQsTUFBTSxFQUFFM0UsR0FBRyxDQUFDMkUsTUFBTTtRQUNsQjdCLGNBQWMsRUFBRUwsSUFBSSxDQUFDSyxjQUFjO1FBQ25DSCxZQUFZLEVBQUVGLElBQUksQ0FBQ0U7TUFDckIsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxNQUFNO01BQ0xrRixXQUFXLEdBQUcsTUFBTW5DLGFBQUksQ0FBQ3NDLHNCQUFzQixDQUFDO1FBQzlDckQsTUFBTSxFQUFFM0UsR0FBRyxDQUFDMkUsTUFBTTtRQUNsQjdCLGNBQWMsRUFBRUwsSUFBSSxDQUFDSyxjQUFjO1FBQ25DSCxZQUFZLEVBQUVGLElBQUksQ0FBQ0U7TUFDckIsQ0FBQyxDQUFDO0lBQ0o7SUFDQTNDLEdBQUcsQ0FBQzBGLElBQUksR0FBR21DLFdBQVc7SUFDdEI5RixJQUFJLENBQUMsQ0FBQztFQUNSLENBQUMsQ0FBQyxPQUFPcUQsS0FBSyxFQUFFO0lBQ2QsSUFBSUEsS0FBSyxZQUFZSCxhQUFLLENBQUNDLEtBQUssRUFBRTtNQUNoQ25ELElBQUksQ0FBQ3FELEtBQUssQ0FBQztNQUNYO0lBQ0Y7SUFDQTtJQUNBcEYsR0FBRyxDQUFDMkUsTUFBTSxDQUFDa0IsZ0JBQWdCLENBQUNULEtBQUssQ0FBQyxxQ0FBcUMsRUFBRUEsS0FBSyxDQUFDO0lBQy9FLE1BQU0sSUFBSUgsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0MsYUFBYSxFQUFFN0MsS0FBSyxDQUFDO0VBQ3pEO0FBQ0YsQ0FBQztBQUFDdEYsT0FBQSxDQUFBOEgsa0JBQUEsR0FBQUEsa0JBQUE7QUFFRixTQUFTbEQsV0FBV0EsQ0FBQzFFLEdBQUcsRUFBRTtFQUN4QixPQUFPQSxHQUFHLENBQUNpQixFQUFFO0FBQ2Y7QUFFQSxTQUFTbUMsUUFBUUEsQ0FBQ3BELEdBQUcsRUFBRTtFQUNyQixJQUFJLENBQUMsQ0FBQ0EsR0FBRyxDQUFDQSxHQUFHLElBQUlBLEdBQUcsRUFBRXFFLE9BQU8sQ0FBQzZELGFBQWEsRUFBRTtJQUFFO0VBQVE7RUFFdkQsSUFBSUMsTUFBTSxHQUFHLENBQUNuSSxHQUFHLENBQUNBLEdBQUcsSUFBSUEsR0FBRyxFQUFFcUUsT0FBTyxDQUFDNkQsYUFBYTtFQUNuRCxJQUFJeEYsS0FBSyxFQUFFRSxTQUFTLEVBQUVJLGFBQWE7O0VBRW5DO0VBQ0EsSUFBSW9GLFVBQVUsR0FBRyxRQUFRO0VBRXpCLElBQUlDLEtBQUssR0FBR0YsTUFBTSxDQUFDRyxXQUFXLENBQUMsQ0FBQyxDQUFDUixPQUFPLENBQUNNLFVBQVUsQ0FBQztFQUVwRCxJQUFJQyxLQUFLLElBQUksQ0FBQyxFQUFFO0lBQ2QsSUFBSUUsV0FBVyxHQUFHSixNQUFNLENBQUNLLFNBQVMsQ0FBQ0osVUFBVSxDQUFDakksTUFBTSxFQUFFZ0ksTUFBTSxDQUFDaEksTUFBTSxDQUFDO0lBQ3BFLElBQUlzSSxXQUFXLEdBQUdDLFlBQVksQ0FBQ0gsV0FBVyxDQUFDLENBQUNwSCxLQUFLLENBQUMsR0FBRyxDQUFDO0lBRXRELElBQUlzSCxXQUFXLENBQUN0SSxNQUFNLElBQUksQ0FBQyxFQUFFO01BQzNCdUMsS0FBSyxHQUFHK0YsV0FBVyxDQUFDLENBQUMsQ0FBQztNQUN0QixJQUFJOUIsR0FBRyxHQUFHOEIsV0FBVyxDQUFDLENBQUMsQ0FBQztNQUV4QixJQUFJRSxXQUFXLEdBQUcsaUJBQWlCO01BRW5DLElBQUlDLFFBQVEsR0FBR2pDLEdBQUcsQ0FBQ21CLE9BQU8sQ0FBQ2EsV0FBVyxDQUFDO01BQ3ZDLElBQUlDLFFBQVEsSUFBSSxDQUFDLEVBQUU7UUFDakI1RixhQUFhLEdBQUcyRCxHQUFHLENBQUM2QixTQUFTLENBQUNHLFdBQVcsQ0FBQ3hJLE1BQU0sRUFBRXdHLEdBQUcsQ0FBQ3hHLE1BQU0sQ0FBQztNQUMvRCxDQUFDLE1BQU07UUFDTHlDLFNBQVMsR0FBRytELEdBQUc7TUFDakI7SUFDRjtFQUNGO0VBRUEsT0FBTztJQUFFakUsS0FBSyxFQUFFQSxLQUFLO0lBQUVFLFNBQVMsRUFBRUEsU0FBUztJQUFFSSxhQUFhLEVBQUVBO0VBQWMsQ0FBQztBQUM3RTtBQUVBLFNBQVMwRixZQUFZQSxDQUFDRyxHQUFHLEVBQUU7RUFDekIsT0FBT25GLE1BQU0sQ0FBQ2MsSUFBSSxDQUFDcUUsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDdkcsUUFBUSxDQUFDLENBQUM7QUFDOUM7QUFFTyxTQUFTd0csZ0JBQWdCQSxDQUFDcEcsS0FBSyxFQUFFO0VBQ3RDLE9BQU8sQ0FBQzFDLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxLQUFLO0lBQ3pCLE1BQU00QyxNQUFNLEdBQUdDLGVBQU0sQ0FBQ3BFLEdBQUcsQ0FBQ2tDLEtBQUssRUFBRTNDLGtCQUFrQixDQUFDQyxHQUFHLENBQUMsQ0FBQztJQUN6RCxJQUFJK0ksWUFBWSxHQUFHbEosdUJBQXVCO0lBQzFDLElBQUk4RSxNQUFNLElBQUlBLE1BQU0sQ0FBQ29FLFlBQVksRUFBRTtNQUNqQ0EsWUFBWSxJQUFJLEtBQUtwRSxNQUFNLENBQUNvRSxZQUFZLENBQUNDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtJQUN2RDtJQUVBLE1BQU1DLFdBQVcsR0FDZixPQUFPdEUsTUFBTSxFQUFFdUUsV0FBVyxLQUFLLFFBQVEsR0FBRyxDQUFDdkUsTUFBTSxDQUFDdUUsV0FBVyxDQUFDLEdBQUd2RSxNQUFNLEVBQUV1RSxXQUFXLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDL0YsTUFBTUMsYUFBYSxHQUFHbkosR0FBRyxDQUFDcUUsT0FBTyxDQUFDK0UsTUFBTTtJQUN4QyxNQUFNQyxZQUFZLEdBQ2hCRixhQUFhLElBQUlGLFdBQVcsQ0FBQ3JILFFBQVEsQ0FBQ3VILGFBQWEsQ0FBQyxHQUFHQSxhQUFhLEdBQUdGLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDdkZuSCxHQUFHLENBQUNxRyxNQUFNLENBQUMsNkJBQTZCLEVBQUVrQixZQUFZLENBQUM7SUFDdkR2SCxHQUFHLENBQUNxRyxNQUFNLENBQUMsOEJBQThCLEVBQUUsNkJBQTZCLENBQUM7SUFDekVyRyxHQUFHLENBQUNxRyxNQUFNLENBQUMsOEJBQThCLEVBQUVZLFlBQVksQ0FBQztJQUN4RGpILEdBQUcsQ0FBQ3FHLE1BQU0sQ0FBQywrQkFBK0IsRUFBRSwrQ0FBK0MsQ0FBQztJQUM1RjtJQUNBLElBQUksU0FBUyxJQUFJbkksR0FBRyxDQUFDc0osTUFBTSxFQUFFO01BQzNCeEgsR0FBRyxDQUFDeUgsVUFBVSxDQUFDLEdBQUcsQ0FBQztJQUNyQixDQUFDLE1BQU07TUFDTHhILElBQUksQ0FBQyxDQUFDO0lBQ1I7RUFDRixDQUFDO0FBQ0g7QUFFTyxTQUFTeUgsbUJBQW1CQSxDQUFDeEosR0FBRyxFQUFFOEIsR0FBRyxFQUFFQyxJQUFJLEVBQUU7RUFDbEQsSUFBSS9CLEdBQUcsQ0FBQ3NKLE1BQU0sS0FBSyxNQUFNLElBQUl0SixHQUFHLENBQUN1RCxJQUFJLEVBQUVrRyxPQUFPLEVBQUU7SUFDOUN6SixHQUFHLENBQUMwSixjQUFjLEdBQUcxSixHQUFHLENBQUNzSixNQUFNO0lBQy9CdEosR0FBRyxDQUFDc0osTUFBTSxHQUFHdEosR0FBRyxDQUFDdUQsSUFBSSxDQUFDa0csT0FBTztJQUM3QixPQUFPekosR0FBRyxDQUFDdUQsSUFBSSxDQUFDa0csT0FBTztFQUN6QjtFQUNBMUgsSUFBSSxDQUFDLENBQUM7QUFDUjtBQUVPLFNBQVM0SCxpQkFBaUJBLENBQUNqQyxHQUFHLEVBQUUxSCxHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksRUFBRTtFQUNyRCxNQUFNNkQsR0FBRyxHQUFJNUYsR0FBRyxDQUFDMkUsTUFBTSxJQUFJM0UsR0FBRyxDQUFDMkUsTUFBTSxDQUFDa0IsZ0JBQWdCLElBQUtDLGVBQWE7RUFDeEUsSUFBSTRCLEdBQUcsWUFBWXpDLGFBQUssQ0FBQ0MsS0FBSyxFQUFFO0lBQzlCLElBQUlsRixHQUFHLENBQUMyRSxNQUFNLElBQUkzRSxHQUFHLENBQUMyRSxNQUFNLENBQUNpRix5QkFBeUIsRUFBRTtNQUN0RCxPQUFPN0gsSUFBSSxDQUFDMkYsR0FBRyxDQUFDO0lBQ2xCO0lBQ0EsSUFBSW1DLFVBQVU7SUFDZDtJQUNBLFFBQVFuQyxHQUFHLENBQUMxQyxJQUFJO01BQ2QsS0FBS0MsYUFBSyxDQUFDQyxLQUFLLENBQUNDLHFCQUFxQjtRQUNwQzBFLFVBQVUsR0FBRyxHQUFHO1FBQ2hCO01BQ0YsS0FBSzVFLGFBQUssQ0FBQ0MsS0FBSyxDQUFDNEUsZ0JBQWdCO1FBQy9CRCxVQUFVLEdBQUcsR0FBRztRQUNoQjtNQUNGO1FBQ0VBLFVBQVUsR0FBRyxHQUFHO0lBQ3BCO0lBQ0EvSCxHQUFHLENBQUNnRCxNQUFNLENBQUMrRSxVQUFVLENBQUM7SUFDdEIvSCxHQUFHLENBQUNpRCxJQUFJLENBQUM7TUFBRUMsSUFBSSxFQUFFMEMsR0FBRyxDQUFDMUMsSUFBSTtNQUFFSSxLQUFLLEVBQUVzQyxHQUFHLENBQUN2QjtJQUFRLENBQUMsQ0FBQztJQUNoRFAsR0FBRyxDQUFDUixLQUFLLENBQUMsZUFBZSxFQUFFc0MsR0FBRyxDQUFDO0VBQ2pDLENBQUMsTUFBTSxJQUFJQSxHQUFHLENBQUM1QyxNQUFNLElBQUk0QyxHQUFHLENBQUN2QixPQUFPLEVBQUU7SUFDcENyRSxHQUFHLENBQUNnRCxNQUFNLENBQUM0QyxHQUFHLENBQUM1QyxNQUFNLENBQUM7SUFDdEJoRCxHQUFHLENBQUNpRCxJQUFJLENBQUM7TUFBRUssS0FBSyxFQUFFc0MsR0FBRyxDQUFDdkI7SUFBUSxDQUFDLENBQUM7SUFDaEMsSUFBSSxFQUFFNEQsT0FBTyxJQUFJQSxPQUFPLENBQUNDLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDLEVBQUU7TUFDckNsSSxJQUFJLENBQUMyRixHQUFHLENBQUM7SUFDWDtFQUNGLENBQUMsTUFBTTtJQUNMOUIsR0FBRyxDQUFDUixLQUFLLENBQUMsaUNBQWlDLEVBQUVzQyxHQUFHLEVBQUVBLEdBQUcsQ0FBQ3dDLEtBQUssQ0FBQztJQUM1RHBJLEdBQUcsQ0FBQ2dELE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDZmhELEdBQUcsQ0FBQ2lELElBQUksQ0FBQztNQUNQQyxJQUFJLEVBQUVDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxxQkFBcUI7TUFDdkNnQixPQUFPLEVBQUU7SUFDWCxDQUFDLENBQUM7SUFDRixJQUFJLEVBQUU0RCxPQUFPLElBQUlBLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDQyxPQUFPLENBQUMsRUFBRTtNQUNyQ2xJLElBQUksQ0FBQzJGLEdBQUcsQ0FBQztJQUNYO0VBQ0Y7QUFDRjtBQUVPLFNBQVN5QyxzQkFBc0JBLENBQUNuSyxHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksRUFBRTtFQUNyRCxJQUFJLENBQUMvQixHQUFHLENBQUMwRixJQUFJLENBQUNNLFFBQVEsRUFBRTtJQUN0QixNQUFNWixLQUFLLEdBQUcsSUFBQWdGLCtCQUF3QixFQUFDLEdBQUcsRUFBRSxzQ0FBc0MsRUFBRXBLLEdBQUcsQ0FBQzJFLE1BQU0sQ0FBQztJQUMvRjdDLEdBQUcsQ0FBQ2dELE1BQU0sQ0FBQ00sS0FBSyxDQUFDTixNQUFNLENBQUM7SUFDeEJoRCxHQUFHLENBQUN1SSxHQUFHLENBQUMsYUFBYWpGLEtBQUssQ0FBQ2UsT0FBTyxJQUFJLENBQUM7SUFDdkM7RUFDRjtFQUNBcEUsSUFBSSxDQUFDLENBQUM7QUFDUjtBQUVPLFNBQVN1SSw2QkFBNkJBLENBQUNDLE9BQU8sRUFBRTtFQUNyRCxJQUFJLENBQUNBLE9BQU8sQ0FBQzdFLElBQUksQ0FBQ00sUUFBUSxFQUFFO0lBQzFCLE1BQU0sSUFBQW9FLCtCQUF3QixFQUFDLEdBQUcsRUFBRSxzQ0FBc0MsRUFBRUcsT0FBTyxDQUFDNUYsTUFBTSxDQUFDO0VBQzdGO0VBQ0EsT0FBT3NDLE9BQU8sQ0FBQ3VELE9BQU8sQ0FBQyxDQUFDO0FBQzFCO0FBRU8sTUFBTUMsWUFBWSxHQUFHQSxDQUFDQyxLQUFLLEVBQUUvRixNQUFNLEVBQUVnRyxLQUFLLEtBQUs7RUFDcEQsSUFBSSxPQUFPaEcsTUFBTSxLQUFLLFFBQVEsRUFBRTtJQUM5QkEsTUFBTSxHQUFHQyxlQUFNLENBQUNwRSxHQUFHLENBQUNtRSxNQUFNLENBQUM7RUFDN0I7RUFDQSxLQUFLLE1BQU1nQyxHQUFHLElBQUkrRCxLQUFLLEVBQUU7SUFDdkIsSUFBSSxDQUFDRSw2QkFBZ0IsQ0FBQ2pFLEdBQUcsQ0FBQyxFQUFFO01BQzFCLE1BQU0sOEJBQThCQSxHQUFHLEdBQUc7SUFDNUM7RUFDRjtFQUNBLElBQUksQ0FBQ2hDLE1BQU0sQ0FBQ3FDLFVBQVUsRUFBRTtJQUN0QnJDLE1BQU0sQ0FBQ3FDLFVBQVUsR0FBRyxFQUFFO0VBQ3hCO0VBQ0EsTUFBTTZELFVBQVUsR0FBRztJQUNqQkMsaUJBQWlCLEVBQUU3RCxPQUFPLENBQUN1RCxPQUFPLENBQUMsQ0FBQztJQUNwQzdKLEtBQUssRUFBRTtFQUNULENBQUM7RUFDRCxJQUFJK0osS0FBSyxDQUFDSyxRQUFRLEVBQUU7SUFDbEIsTUFBTW5GLEdBQUcsR0FBR2pCLE1BQU0sRUFBRWtCLGdCQUFnQixJQUFJQyxlQUFhO0lBQ3JELE1BQU1rRixNQUFNLEdBQUcsSUFBQUMsbUJBQVksRUFBQztNQUMxQjdLLEdBQUcsRUFBRXNLLEtBQUssQ0FBQ0s7SUFDYixDQUFDLENBQUM7SUFDRkMsTUFBTSxDQUFDRSxFQUFFLENBQUMsT0FBTyxFQUFFeEQsR0FBRyxJQUFJO01BQUU5QixHQUFHLENBQUNSLEtBQUssQ0FBQyw2Q0FBNkMsRUFBRTtRQUFFQSxLQUFLLEVBQUVzQztNQUFJLENBQUMsQ0FBQztJQUFDLENBQUMsQ0FBQztJQUN2R3NELE1BQU0sQ0FBQ0UsRUFBRSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUUsQ0FBQyxDQUFDO0lBQy9CRixNQUFNLENBQUNFLEVBQUUsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFFLENBQUMsQ0FBQztJQUNwQ0YsTUFBTSxDQUFDRSxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBRSxDQUFDLENBQUM7SUFDN0JMLFVBQVUsQ0FBQ0MsaUJBQWlCLEdBQUcsWUFBWTtNQUN6QyxJQUFJRSxNQUFNLENBQUNHLE1BQU0sRUFBRTtRQUNqQjtNQUNGO01BQ0EsSUFBSTtRQUNGLE1BQU1ILE1BQU0sQ0FBQ0ksT0FBTyxDQUFDLENBQUM7TUFDeEIsQ0FBQyxDQUFDLE9BQU8xTCxDQUFDLEVBQUU7UUFDVmtHLEdBQUcsQ0FBQ1IsS0FBSyxDQUFDLGdEQUFnRDFGLENBQUMsRUFBRSxDQUFDO01BQ2hFO0lBQ0YsQ0FBQztJQUNEbUwsVUFBVSxDQUFDQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQzlCRCxVQUFVLENBQUNsSyxLQUFLLEdBQUcsSUFBSTBLLHVCQUFVLENBQUM7TUFDaENDLFdBQVcsRUFBRSxNQUFBQSxDQUFPLEdBQUdDLElBQUksS0FBSztRQUM5QixNQUFNVixVQUFVLENBQUNDLGlCQUFpQixDQUFDLENBQUM7UUFDcEMsT0FBT0UsTUFBTSxDQUFDTSxXQUFXLENBQUNDLElBQUksQ0FBQztNQUNqQztJQUNGLENBQUMsQ0FBQztFQUNKO0VBQ0EsSUFBSUMsYUFBYSxHQUFHZCxLQUFLLENBQUNlLFdBQVcsQ0FBQ3RLLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQzZILElBQUksQ0FBQyxPQUFPLENBQUM7RUFDL0QsSUFBSXdDLGFBQWEsS0FBSyxHQUFHLEVBQUU7SUFDekJBLGFBQWEsR0FBRyxNQUFNO0VBQ3hCO0VBQ0E3RyxNQUFNLENBQUNxQyxVQUFVLENBQUMwRSxJQUFJLENBQUM7SUFDckJuRSxJQUFJLEVBQUUsSUFBQW9FLDBCQUFZLEVBQUNILGFBQWEsQ0FBQztJQUNqQ0ksWUFBWSxFQUFFbEIsS0FBSyxDQUFDa0IsWUFBWTtJQUNoQ0MsY0FBYyxFQUFFbkIsS0FBSyxDQUFDbUIsY0FBYztJQUNwQ0MsZ0JBQWdCLEVBQUVwQixLQUFLLENBQUNvQixnQkFBZ0I7SUFDeENDLHVCQUF1QixFQUFFckIsS0FBSyxDQUFDcUIsdUJBQXVCO0lBQ3REQyxvQkFBb0IsRUFBRXRCLEtBQUssQ0FBQ3NCLG9CQUFvQixJQUFJcEIsNkJBQWdCLENBQUNvQixvQkFBb0IsQ0FBQ3BNLE9BQU87SUFDakc2SCxPQUFPLEVBQUUsSUFBQXdFLHlCQUFTLEVBQUM7TUFDakJDLFFBQVEsRUFBRXhCLEtBQUssQ0FBQ3lCLGlCQUFpQjtNQUNqQ0MsR0FBRyxFQUFFMUIsS0FBSyxDQUFDa0IsWUFBWTtNQUN2QnpGLE9BQU8sRUFBRXVFLEtBQUssQ0FBQ3NCLG9CQUFvQixJQUFJcEIsNkJBQWdCLENBQUNvQixvQkFBb0IsQ0FBQ3BNLE9BQU87TUFDcEY2SCxPQUFPLEVBQUVBLENBQUM4QyxPQUFPLEVBQUU4QixRQUFRLEVBQUV0SyxJQUFJLEVBQUV1SyxPQUFPLEtBQUs7UUFDN0MsTUFBTTtVQUNKdEgsSUFBSSxFQUFFQyxhQUFLLENBQUNDLEtBQUssQ0FBQ3lDLGlCQUFpQjtVQUNuQ3hCLE9BQU8sRUFBRW1HLE9BQU8sQ0FBQ25HO1FBQ25CLENBQUM7TUFDSCxDQUFDO01BQ0RvRyxJQUFJLEVBQUVoQyxPQUFPLElBQUk7UUFDZixJQUFJQSxPQUFPLENBQUN0SixFQUFFLEtBQUssV0FBVyxJQUFJLENBQUN5SixLQUFLLENBQUNxQix1QkFBdUIsRUFBRTtVQUNoRSxPQUFPLElBQUk7UUFDYjtRQUNBLElBQUlyQixLQUFLLENBQUNvQixnQkFBZ0IsRUFBRTtVQUMxQixPQUFPLEtBQUs7UUFDZDtRQUNBLElBQUlwQixLQUFLLENBQUNtQixjQUFjLEVBQUU7VUFDeEIsSUFBSVcsS0FBSyxDQUFDQyxPQUFPLENBQUMvQixLQUFLLENBQUNtQixjQUFjLENBQUMsRUFBRTtZQUN2QyxJQUFJLENBQUNuQixLQUFLLENBQUNtQixjQUFjLENBQUNqSyxRQUFRLENBQUMySSxPQUFPLENBQUNqQixNQUFNLENBQUMsRUFBRTtjQUNsRCxPQUFPLElBQUk7WUFDYjtVQUNGLENBQUMsTUFBTTtZQUNMLE1BQU1vRCxNQUFNLEdBQUcsSUFBSXBGLE1BQU0sQ0FBQ29ELEtBQUssQ0FBQ21CLGNBQWMsQ0FBQztZQUMvQyxJQUFJLENBQUNhLE1BQU0sQ0FBQ2xGLElBQUksQ0FBQytDLE9BQU8sQ0FBQ2pCLE1BQU0sQ0FBQyxFQUFFO2NBQ2hDLE9BQU8sSUFBSTtZQUNiO1VBQ0Y7UUFDRjtRQUNBLE9BQU9pQixPQUFPLENBQUM3RSxJQUFJLEVBQUVNLFFBQVE7TUFDL0IsQ0FBQztNQUNEMkcsWUFBWSxFQUFFLE1BQU1wQyxPQUFPLElBQUk7UUFDN0IsSUFBSUcsS0FBSyxDQUFDa0MsSUFBSSxLQUFLM0gsYUFBSyxDQUFDNEgsTUFBTSxDQUFDQyxhQUFhLENBQUNDLE1BQU0sRUFBRTtVQUNwRCxPQUFPeEMsT0FBTyxDQUFDNUYsTUFBTSxDQUFDakMsS0FBSztRQUM3QjtRQUNBLE1BQU1zSyxLQUFLLEdBQUd6QyxPQUFPLENBQUM5SCxJQUFJLENBQUNFLFlBQVk7UUFDdkMsSUFBSStILEtBQUssQ0FBQ2tDLElBQUksS0FBSzNILGFBQUssQ0FBQzRILE1BQU0sQ0FBQ0MsYUFBYSxDQUFDRyxPQUFPLElBQUlELEtBQUssRUFBRTtVQUM5RCxPQUFPQSxLQUFLO1FBQ2Q7UUFDQSxJQUFJdEMsS0FBSyxDQUFDa0MsSUFBSSxLQUFLM0gsYUFBSyxDQUFDNEgsTUFBTSxDQUFDQyxhQUFhLENBQUMvRixJQUFJLElBQUlpRyxLQUFLLEVBQUU7VUFDM0QsSUFBSSxDQUFDekMsT0FBTyxDQUFDN0UsSUFBSSxFQUFFO1lBQ2pCLE1BQU0sSUFBSXVCLE9BQU8sQ0FBQ3VELE9BQU8sSUFBSTVDLGtCQUFrQixDQUFDMkMsT0FBTyxFQUFFLElBQUksRUFBRUMsT0FBTyxDQUFDLENBQUM7VUFDMUU7VUFDQSxJQUFJRCxPQUFPLENBQUM3RSxJQUFJLEVBQUVxQixJQUFJLEVBQUVtRyxFQUFFLElBQUkzQyxPQUFPLENBQUNxQyxJQUFJLEtBQUssTUFBTSxFQUFFO1lBQ3JELE9BQU9yQyxPQUFPLENBQUM3RSxJQUFJLENBQUNxQixJQUFJLENBQUNtRyxFQUFFO1VBQzdCO1FBQ0Y7UUFDQSxPQUFPM0MsT0FBTyxDQUFDNUYsTUFBTSxDQUFDMUQsRUFBRTtNQUMxQixDQUFDO01BQ0ROLEtBQUssRUFBRWtLLFVBQVUsQ0FBQ2xLO0lBQ3BCLENBQUMsQ0FBQztJQUNGZ0s7RUFDRixDQUFDLENBQUM7RUFDRi9GLGVBQU0sQ0FBQ3VJLEdBQUcsQ0FBQ3hJLE1BQU0sQ0FBQztBQUNwQixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUxBN0UsT0FBQSxDQUFBMkssWUFBQSxHQUFBQSxZQUFBO0FBTU8sU0FBUzJDLHdCQUF3QkEsQ0FBQ3BOLEdBQUcsRUFBRTtFQUM1QztFQUNBLElBQ0UsRUFDRUEsR0FBRyxDQUFDMkUsTUFBTSxDQUFDMEksUUFBUSxDQUFDQyxPQUFPLFlBQVlDLDRCQUFtQixJQUMxRHZOLEdBQUcsQ0FBQzJFLE1BQU0sQ0FBQzBJLFFBQVEsQ0FBQ0MsT0FBTyxZQUFZRSwrQkFBc0IsQ0FDOUQsRUFDRDtJQUNBLE9BQU92RyxPQUFPLENBQUN1RCxPQUFPLENBQUMsQ0FBQztFQUMxQjtFQUNBO0VBQ0EsTUFBTTdGLE1BQU0sR0FBRzNFLEdBQUcsQ0FBQzJFLE1BQU07RUFDekIsTUFBTThJLFNBQVMsR0FBRyxDQUFDLENBQUN6TixHQUFHLElBQUksQ0FBQyxDQUFDLEVBQUVxRSxPQUFPLElBQUksQ0FBQyxDQUFDLEVBQUUsb0JBQW9CLENBQUM7RUFDbkUsTUFBTTtJQUFFcUosS0FBSztJQUFFQztFQUFJLENBQUMsR0FBR2hKLE1BQU0sQ0FBQ2lKLGtCQUFrQjtFQUNoRCxJQUFJLENBQUNILFNBQVMsSUFBSSxDQUFDOUksTUFBTSxDQUFDaUosa0JBQWtCLEVBQUU7SUFDNUMsT0FBTzNHLE9BQU8sQ0FBQ3VELE9BQU8sQ0FBQyxDQUFDO0VBQzFCO0VBQ0E7RUFDQTtFQUNBLE1BQU1xRCxPQUFPLEdBQUc3TixHQUFHLENBQUN1SCxJQUFJLENBQUN1RyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQztFQUMvQztFQUNBLElBQUl6RixLQUFLLEdBQUcsS0FBSztFQUNqQixLQUFLLE1BQU1kLElBQUksSUFBSW1HLEtBQUssRUFBRTtJQUN4QjtJQUNBLE1BQU1LLEtBQUssR0FBRyxJQUFJekcsTUFBTSxDQUFDQyxJQUFJLENBQUN5RyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxHQUFHekcsSUFBSSxHQUFHLEdBQUcsR0FBR0EsSUFBSSxDQUFDO0lBQ3BFLElBQUlzRyxPQUFPLENBQUN4RixLQUFLLENBQUMwRixLQUFLLENBQUMsRUFBRTtNQUN4QjFGLEtBQUssR0FBRyxJQUFJO01BQ1o7SUFDRjtFQUNGO0VBQ0EsSUFBSSxDQUFDQSxLQUFLLEVBQUU7SUFDVixPQUFPcEIsT0FBTyxDQUFDdUQsT0FBTyxDQUFDLENBQUM7RUFDMUI7RUFDQTtFQUNBLE1BQU15RCxVQUFVLEdBQUcsSUFBSUMsSUFBSSxDQUFDLElBQUlBLElBQUksQ0FBQyxDQUFDLENBQUNDLFVBQVUsQ0FBQyxJQUFJRCxJQUFJLENBQUMsQ0FBQyxDQUFDRSxVQUFVLENBQUMsQ0FBQyxHQUFHVCxHQUFHLENBQUMsQ0FBQztFQUNqRixPQUFPVSxhQUFJLENBQ1JDLE1BQU0sQ0FBQzNKLE1BQU0sRUFBRWUsYUFBSSxDQUFDNkksTUFBTSxDQUFDNUosTUFBTSxDQUFDLEVBQUUsY0FBYyxFQUFFO0lBQ25ENkosS0FBSyxFQUFFZixTQUFTO0lBQ2hCZ0IsTUFBTSxFQUFFeEosYUFBSyxDQUFDeUosT0FBTyxDQUFDVCxVQUFVO0VBQ2xDLENBQUMsQ0FBQyxDQUNEVSxLQUFLLENBQUNqUCxDQUFDLElBQUk7SUFDVixJQUFJQSxDQUFDLENBQUNzRixJQUFJLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEosZUFBZSxFQUFFO01BQ3pDLE1BQU0sSUFBSTNKLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQzJKLGlCQUFpQixFQUFFLG1CQUFtQixDQUFDO0lBQzNFO0lBQ0EsTUFBTW5QLENBQUM7RUFDVCxDQUFDLENBQUM7QUFDTjtBQUVBLFNBQVNpRSxjQUFjQSxDQUFDM0QsR0FBRyxFQUFFOEIsR0FBRyxFQUFFO0VBQ2hDQSxHQUFHLENBQUNnRCxNQUFNLENBQUMsR0FBRyxDQUFDO0VBQ2ZoRCxHQUFHLENBQUN1SSxHQUFHLENBQUMsMEJBQTBCLENBQUM7QUFDckM7QUFFQSxTQUFTN0gsZ0JBQWdCQSxDQUFDeEMsR0FBRyxFQUFFOEIsR0FBRyxFQUFFO0VBQ2xDQSxHQUFHLENBQUNnRCxNQUFNLENBQUMsR0FBRyxDQUFDO0VBQ2ZoRCxHQUFHLENBQUNpRCxJQUFJLENBQUM7SUFBRUMsSUFBSSxFQUFFQyxhQUFLLENBQUNDLEtBQUssQ0FBQzRKLFlBQVk7SUFBRTFKLEtBQUssRUFBRTtFQUE4QixDQUFDLENBQUM7QUFDcEY7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNBQVMySix1QkFBdUJBLENBQUMvTyxHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksRUFBRTtFQUN0RC9CLEdBQUcsQ0FBQ0ksR0FBRyxHQUFHSixHQUFHLENBQUNJLEdBQUcsQ0FBQzRPLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBR2hQLEdBQUcsQ0FBQ0ksR0FBRyxDQUFDb0ksU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHeEksR0FBRyxDQUFDSSxHQUFHO0VBQ25FMkIsSUFBSSxDQUFDLENBQUM7QUFDUiIsImlnbm9yZUxpc3QiOltdfQ==