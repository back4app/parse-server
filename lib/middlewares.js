"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
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
var _ClientSDK = _interopRequireDefault(require("./ClientSDK"));
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
    if (checkIp(clientIp, req.config.maintenanceKeyIps || [], req.config.maintenanceKeyIpsStore)) {
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
  if (isMaster && !checkIp(clientIp, req.config.masterKeyIps || [], req.config.masterKeyIpsStore)) {
    var _req$config2;
    const log = ((_req$config2 = req.config) === null || _req$config2 === void 0 ? void 0 : _req$config2.loggerController) || _logger.default;
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
    store: null
  };
  if (route.redisUrl) {
    var _config;
    const log = ((_config = config) === null || _config === void 0 ? void 0 : _config.loggerController) || _logger.default;
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
      keyGenerator: async request => {
        if (route.zone === _node.default.Server.RateLimitZone.global) {
          return request.config.appId;
        }
        const token = request.info.sessionToken;
        if (route.zone === _node.default.Server.RateLimitZone.session && token) {
          return token;
        }
        if (route.zone === _node.default.Server.RateLimitZone.user && token) {
          var _request$auth2;
          if (!request.auth) {
            await new Promise(resolve => handleParseSession(request, null, resolve));
          }
          if ((_request$auth2 = request.auth) !== null && _request$auth2 !== void 0 && (_request$auth2 = _request$auth2.user) !== null && _request$auth2 !== void 0 && _request$auth2.id && request.zone === 'user') {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiREVGQVVMVF9BTExPV0VEX0hFQURFUlMiLCJleHBvcnRzIiwiZ2V0TW91bnRGb3JSZXF1ZXN0IiwicmVxIiwibW91bnRQYXRoTGVuZ3RoIiwib3JpZ2luYWxVcmwiLCJsZW5ndGgiLCJ1cmwiLCJtb3VudFBhdGgiLCJzbGljZSIsInByb3RvY29sIiwiZ2V0IiwiZ2V0QmxvY2tMaXN0IiwiaXBSYW5nZUxpc3QiLCJzdG9yZSIsImJsb2NrTGlzdCIsIkJsb2NrTGlzdCIsImZvckVhY2giLCJmdWxsSXAiLCJzZXQiLCJpcCIsIm1hc2siLCJzcGxpdCIsImFkZEFkZHJlc3MiLCJpc0lQdjQiLCJhZGRTdWJuZXQiLCJOdW1iZXIiLCJjaGVja0lwIiwiaW5jb21pbmdJcElzVjQiLCJyZXN1bHQiLCJjaGVjayIsImluY2x1ZGVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicmVzIiwibmV4dCIsIm1vdW50IiwiY29udGV4dCIsIkpTT04iLCJwYXJzZSIsIk9iamVjdCIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJfcmVxJGNvbmZpZyIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJpc01hc3RlciIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleUlwc1N0b3JlIiwiX3JlcSRjb25maWcyIiwibWVzc2FnZSIsImhhbmRsZVJhdGVMaW1pdCIsImlzUmVhZE9ubHlNYXN0ZXIiLCJyZWFkT25seU1hc3RlcktleSIsImlzUmVhZE9ubHkiLCJrZXlzIiwib25lS2V5Q29uZmlndXJlZCIsInNvbWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJvbmVLZXlNYXRjaGVzIiwidXNlckZyb21KV1QiLCJ1c2VyIiwicmF0ZUxpbWl0cyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJsaW1pdCIsInBhdGhFeHAiLCJSZWdFeHAiLCJwYXRoIiwidGVzdCIsImhhbmRsZXIiLCJlcnIiLCJDT05ORUNUSU9OX0ZBSUxFRCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsInJlcXVlc3RBdXRoIiwiaW5kZXhPZiIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiVU5LTk9XTl9FUlJPUiIsImF1dGhvcml6YXRpb24iLCJoZWFkZXIiLCJhdXRoUHJlZml4IiwibWF0Y2giLCJ0b0xvd2VyQ2FzZSIsImVuY29kZWRBdXRoIiwic3Vic3RyaW5nIiwiY3JlZGVudGlhbHMiLCJkZWNvZGVCYXNlNjQiLCJqc0tleVByZWZpeCIsIm1hdGNoS2V5Iiwic3RyIiwiYWxsb3dDcm9zc0RvbWFpbiIsImFsbG93SGVhZGVycyIsImpvaW4iLCJiYXNlT3JpZ2lucyIsImFsbG93T3JpZ2luIiwicmVxdWVzdE9yaWdpbiIsIm9yaWdpbiIsImFsbG93T3JpZ2lucyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsInJlZGlzVXJsIiwiX2NvbmZpZyIsImNsaWVudCIsImNyZWF0ZUNsaWVudCIsIm9uIiwiaXNPcGVuIiwiY29ubmVjdCIsIlJlZGlzU3RvcmUiLCJzZW5kQ29tbWFuZCIsImFyZ3MiLCJ0cmFuc2Zvcm1QYXRoIiwicmVxdWVzdFBhdGgiLCJwdXNoIiwicGF0aFRvUmVnZXhwIiwicmF0ZUxpbWl0Iiwid2luZG93TXMiLCJyZXF1ZXN0VGltZVdpbmRvdyIsIm1heCIsInJlcXVlc3RDb3VudCIsImVycm9yUmVzcG9uc2VNZXNzYWdlIiwicmVzcG9uc2UiLCJvcHRpb25zIiwic2tpcCIsIl9yZXF1ZXN0JGF1dGgiLCJpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyIsImluY2x1ZGVNYXN0ZXJLZXkiLCJyZXF1ZXN0TWV0aG9kcyIsIkFycmF5IiwiaXNBcnJheSIsInJlZ0V4cCIsImtleUdlbmVyYXRvciIsInpvbmUiLCJTZXJ2ZXIiLCJSYXRlTGltaXRab25lIiwiZ2xvYmFsIiwidG9rZW4iLCJzZXNzaW9uIiwiX3JlcXVlc3QkYXV0aDIiLCJpZCIsInB1dCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImRhdGFiYXNlIiwiYWRhcHRlciIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwicmVxdWVzdElkIiwicGF0aHMiLCJ0dGwiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJyZXFQYXRoIiwicmVwbGFjZSIsInJlZ2V4IiwiY2hhckF0IiwiZXhwaXJ5RGF0ZSIsIkRhdGUiLCJzZXRTZWNvbmRzIiwiZ2V0U2Vjb25kcyIsInJlc3QiLCJjcmVhdGUiLCJtYXN0ZXIiLCJyZXFJZCIsImV4cGlyZSIsIl9lbmNvZGUiLCJjYXRjaCIsIkRVUExJQ0FURV9WQUxVRSIsIkRVUExJQ0FURV9SRVFVRVNUIiwiSU5WQUxJRF9KU09OIl0sInNvdXJjZXMiOlsiLi4vc3JjL21pZGRsZXdhcmVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBBcHBDYWNoZSBmcm9tICcuL2NhY2hlJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBhdXRoIGZyb20gJy4vQXV0aCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBDbGllbnRTREsgZnJvbSAnLi9DbGllbnRTREsnO1xuaW1wb3J0IGRlZmF1bHRMb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi9yZXN0JztcbmltcG9ydCBNb25nb1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCByYXRlTGltaXQgZnJvbSAnZXhwcmVzcy1yYXRlLWxpbWl0JztcbmltcG9ydCB7IFJhdGVMaW1pdE9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgcGF0aFRvUmVnZXhwIH0gZnJvbSAncGF0aC10by1yZWdleHAnO1xuaW1wb3J0IFJlZGlzU3RvcmUgZnJvbSAncmF0ZS1saW1pdC1yZWRpcyc7XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICdyZWRpcyc7XG5pbXBvcnQgeyBCbG9ja0xpc3QsIGlzSVB2NCB9IGZyb20gJ25ldCc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0FMTE9XRURfSEVBREVSUyA9XG4gICdYLVBhcnNlLU1hc3Rlci1LZXksIFgtUGFyc2UtUkVTVC1BUEktS2V5LCBYLVBhcnNlLUphdmFzY3JpcHQtS2V5LCBYLVBhcnNlLUFwcGxpY2F0aW9uLUlkLCBYLVBhcnNlLUNsaWVudC1WZXJzaW9uLCBYLVBhcnNlLVNlc3Npb24tVG9rZW4sIFgtUmVxdWVzdGVkLVdpdGgsIFgtUGFyc2UtUmV2b2NhYmxlLVNlc3Npb24sIFgtUGFyc2UtUmVxdWVzdC1JZCwgQ29udGVudC1UeXBlLCBQcmFnbWEsIENhY2hlLUNvbnRyb2wnO1xuXG5jb25zdCBnZXRNb3VudEZvclJlcXVlc3QgPSBmdW5jdGlvbiAocmVxKSB7XG4gIGNvbnN0IG1vdW50UGF0aExlbmd0aCA9IHJlcS5vcmlnaW5hbFVybC5sZW5ndGggLSByZXEudXJsLmxlbmd0aDtcbiAgY29uc3QgbW91bnRQYXRoID0gcmVxLm9yaWdpbmFsVXJsLnNsaWNlKDAsIG1vdW50UGF0aExlbmd0aCk7XG4gIHJldHVybiByZXEucHJvdG9jb2wgKyAnOi8vJyArIHJlcS5nZXQoJ2hvc3QnKSArIG1vdW50UGF0aDtcbn07XG5cbmNvbnN0IGdldEJsb2NrTGlzdCA9IChpcFJhbmdlTGlzdCwgc3RvcmUpID0+IHtcbiAgaWYgKHN0b3JlLmdldCgnYmxvY2tMaXN0JykpIHsgcmV0dXJuIHN0b3JlLmdldCgnYmxvY2tMaXN0Jyk7IH1cbiAgY29uc3QgYmxvY2tMaXN0ID0gbmV3IEJsb2NrTGlzdCgpO1xuICBpcFJhbmdlTGlzdC5mb3JFYWNoKGZ1bGxJcCA9PiB7XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzo6LzAnIHx8IGZ1bGxJcCA9PT0gJzo6Jykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjYnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzAuMC4wLjAvMCcgfHwgZnVsbElwID09PSAnMC4wLjAuMCcpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY0JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IFtpcCwgbWFza10gPSBmdWxsSXAuc3BsaXQoJy8nKTtcbiAgICBpZiAoIW1hc2spIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRBZGRyZXNzKGlwLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmxvY2tMaXN0LmFkZFN1Ym5ldChpcCwgTnVtYmVyKG1hc2spLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9XG4gIH0pO1xuICBzdG9yZS5zZXQoJ2Jsb2NrTGlzdCcsIGJsb2NrTGlzdCk7XG4gIHJldHVybiBibG9ja0xpc3Q7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tJcCA9IChpcCwgaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGNvbnN0IGluY29taW5nSXBJc1Y0ID0gaXNJUHY0KGlwKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gZ2V0QmxvY2tMaXN0KGlwUmFuZ2VMaXN0LCBzdG9yZSk7XG5cbiAgaWYgKHN0b3JlLmdldChpcCkpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHN0b3JlLmdldCgnYWxsb3dBbGxJcHY0JykgJiYgaW5jb21pbmdJcElzVjQpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHN0b3JlLmdldCgnYWxsb3dBbGxJcHY2JykgJiYgIWluY29taW5nSXBJc1Y0KSB7IHJldHVybiB0cnVlOyB9XG4gIGNvbnN0IHJlc3VsdCA9IGJsb2NrTGlzdC5jaGVjayhpcCwgaW5jb21pbmdJcElzVjQgPyAnaXB2NCcgOiAnaXB2NicpO1xuXG4gIC8vIElmIHRoZSBpcCBpcyBpbiB0aGUgbGlzdCwgd2Ugc3RvcmUgdGhlIHJlc3VsdCBpbiB0aGUgc3RvcmVcbiAgLy8gc28gd2UgaGF2ZSBhIG9wdGltaXplZCBwYXRoIGZvciB0aGUgbmV4dCByZXF1ZXN0XG4gIGlmIChpcFJhbmdlTGlzdC5pbmNsdWRlcyhpcCkgJiYgcmVzdWx0KSB7XG4gICAgc3RvcmUuc2V0KGlwLCByZXN1bHQpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vLyBDaGVja3MgdGhhdCB0aGUgcmVxdWVzdCBpcyBhdXRob3JpemVkIGZvciB0aGlzIGFwcCBhbmQgY2hlY2tzIHVzZXJcbi8vIGF1dGggdG9vLlxuLy8gVGhlIGJvZHlwYXJzZXIgc2hvdWxkIHJ1biBiZWZvcmUgdGhpcyBtaWRkbGV3YXJlLlxuLy8gQWRkcyBpbmZvIHRvIHRoZSByZXF1ZXN0OlxuLy8gcmVxLmNvbmZpZyAtIHRoZSBDb25maWcgZm9yIHRoaXMgYXBwXG4vLyByZXEuYXV0aCAtIHRoZSBBdXRoIGZvciB0aGlzIHJlcXVlc3RcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUhlYWRlcnMocmVxLCByZXMsIG5leHQpIHtcbiAgdmFyIG1vdW50ID0gZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSk7XG5cbiAgbGV0IGNvbnRleHQgPSB7fTtcbiAgaWYgKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykpO1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuICB2YXIgaW5mbyA9IHtcbiAgICBhcHBJZDogcmVxLmdldCgnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCcpLFxuICAgIHNlc3Npb25Ub2tlbjogcmVxLmdldCgnWC1QYXJzZS1TZXNzaW9uLVRva2VuJyksXG4gICAgbWFzdGVyS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1hc3Rlci1LZXknKSxcbiAgICBtYWludGVuYW5jZUtleTogcmVxLmdldCgnWC1QYXJzZS1NYWludGVuYW5jZS1LZXknKSxcbiAgICBpbnN0YWxsYXRpb25JZDogcmVxLmdldCgnWC1QYXJzZS1JbnN0YWxsYXRpb24tSWQnKSxcbiAgICBjbGllbnRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LUtleScpLFxuICAgIGphdmFzY3JpcHRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtSmF2YXNjcmlwdC1LZXknKSxcbiAgICBkb3ROZXRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtV2luZG93cy1LZXknKSxcbiAgICByZXN0QVBJS2V5OiByZXEuZ2V0KCdYLVBhcnNlLVJFU1QtQVBJLUtleScpLFxuICAgIGNsaWVudFZlcnNpb246IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LVZlcnNpb24nKSxcbiAgICBjb250ZXh0OiBjb250ZXh0LFxuICB9O1xuXG4gIHZhciBiYXNpY0F1dGggPSBodHRwQXV0aChyZXEpO1xuXG4gIGlmIChiYXNpY0F1dGgpIHtcbiAgICB2YXIgYmFzaWNBdXRoQXBwSWQgPSBiYXNpY0F1dGguYXBwSWQ7XG4gICAgaWYgKEFwcENhY2hlLmdldChiYXNpY0F1dGhBcHBJZCkpIHtcbiAgICAgIGluZm8uYXBwSWQgPSBiYXNpY0F1dGhBcHBJZDtcbiAgICAgIGluZm8ubWFzdGVyS2V5ID0gYmFzaWNBdXRoLm1hc3RlcktleSB8fCBpbmZvLm1hc3RlcktleTtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IGJhc2ljQXV0aC5qYXZhc2NyaXB0S2V5IHx8IGluZm8uamF2YXNjcmlwdEtleTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVxLmJvZHkpIHtcbiAgICAvLyBVbml0eSBTREsgc2VuZHMgYSBfbm9Cb2R5IGtleSB3aGljaCBuZWVkcyB0byBiZSByZW1vdmVkLlxuICAgIC8vIFVuY2xlYXIgYXQgdGhpcyBwb2ludCBpZiBhY3Rpb24gbmVlZHMgdG8gYmUgdGFrZW4uXG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9ub0JvZHk7XG4gIH1cblxuICB2YXIgZmlsZVZpYUpTT04gPSBmYWxzZTtcblxuICBpZiAoIWluZm8uYXBwSWQgfHwgIUFwcENhY2hlLmdldChpbmZvLmFwcElkKSkge1xuICAgIC8vIFNlZSBpZiB3ZSBjYW4gZmluZCB0aGUgYXBwIGlkIG9uIHRoZSBib2R5LlxuICAgIGlmIChyZXEuYm9keSBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgLy8gVGhlIG9ubHkgY2hhbmNlIHRvIGZpbmQgdGhlIGFwcCBpZCBpcyBpZiB0aGlzIGlzIGEgZmlsZVxuICAgICAgLy8gdXBsb2FkIHRoYXQgYWN0dWFsbHkgaXMgYSBKU09OIGJvZHkuIFNvIHRyeSB0byBwYXJzZSBpdC5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy82NTg5XG4gICAgICAvLyBJdCBpcyBhbHNvIHBvc3NpYmxlIHRoYXQgdGhlIGNsaWVudCBpcyB0cnlpbmcgdG8gdXBsb2FkIGEgZmlsZSBidXQgZm9yZ290XG4gICAgICAvLyB0byBwcm92aWRlIHgtcGFyc2UtYXBwLWlkIGluIGhlYWRlciBhbmQgcGFyc2UgYSBiaW5hcnkgZmlsZSB3aWxsIGZhaWxcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcS5ib2R5ID0gSlNPTi5wYXJzZShyZXEuYm9keSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICB9XG4gICAgICBmaWxlVmlhSlNPTiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5ib2R5KSB7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX1Jldm9jYWJsZVNlc3Npb247XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgcmVxLmJvZHkgJiZcbiAgICAgIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkICYmXG4gICAgICBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpICYmXG4gICAgICAoIWluZm8ubWFzdGVyS2V5IHx8IEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkubWFzdGVyS2V5ID09PSBpbmZvLm1hc3RlcktleSlcbiAgICApIHtcbiAgICAgIGluZm8uYXBwSWQgPSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5IHx8ICcnO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5O1xuICAgICAgLy8gVE9ETzogdGVzdCB0aGF0IHRoZSBSRVNUIEFQSSBmb3JtYXRzIGdlbmVyYXRlZCBieSB0aGUgb3RoZXJcbiAgICAgIC8vIFNES3MgYXJlIGhhbmRsZWQgb2tcbiAgICAgIGlmIChyZXEuYm9keS5fQ2xpZW50VmVyc2lvbikge1xuICAgICAgICBpbmZvLmNsaWVudFZlcnNpb24gPSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZCkge1xuICAgICAgICBpbmZvLmluc3RhbGxhdGlvbklkID0gcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fTWFzdGVyS2V5KSB7XG4gICAgICAgIGluZm8ubWFzdGVyS2V5ID0gcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQpIHtcbiAgICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0IGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgaW5mby5jb250ZXh0ID0gcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGluZm8uY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmJvZHkuX2NvbnRleHQpO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChpbmZvLmNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fQ29udGVudFR5cGUpIHtcbiAgICAgICAgcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuICBpZiAoaW5mby5zZXNzaW9uVG9rZW4gJiYgdHlwZW9mIGluZm8uc2Vzc2lvblRva2VuICE9PSAnc3RyaW5nJykge1xuICAgIGluZm8uc2Vzc2lvblRva2VuID0gaW5mby5zZXNzaW9uVG9rZW4udG9TdHJpbmcoKTtcbiAgfVxuXG4gIGlmIChpbmZvLmNsaWVudFZlcnNpb24pIHtcbiAgICBpbmZvLmNsaWVudFNESyA9IENsaWVudFNESy5mcm9tU3RyaW5nKGluZm8uY2xpZW50VmVyc2lvbik7XG4gIH1cblxuICBpZiAoZmlsZVZpYUpTT04pIHtcbiAgICByZXEuZmlsZURhdGEgPSByZXEuYm9keS5maWxlRGF0YTtcbiAgICAvLyBXZSBuZWVkIHRvIHJlcG9wdWxhdGUgcmVxLmJvZHkgd2l0aCBhIGJ1ZmZlclxuICAgIHZhciBiYXNlNjQgPSByZXEuYm9keS5iYXNlNjQ7XG4gICAgcmVxLmJvZHkgPSBCdWZmZXIuZnJvbShiYXNlNjQsICdiYXNlNjQnKTtcbiAgfVxuXG4gIGNvbnN0IGNsaWVudElwID0gZ2V0Q2xpZW50SXAocmVxKTtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChpbmZvLmFwcElkLCBtb3VudCk7XG4gIGlmIChjb25maWcuc3RhdGUgJiYgY29uZmlnLnN0YXRlICE9PSAnb2snKSB7XG4gICAgcmVzLnN0YXR1cyg1MDApO1xuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgIGVycm9yOiBgSW52YWxpZCBzZXJ2ZXIgc3RhdGU6ICR7Y29uZmlnLnN0YXRlfWAsXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaW5mby5hcHAgPSBBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCk7XG4gIHJlcS5jb25maWcgPSBjb25maWc7XG4gIHJlcS5jb25maWcuaGVhZGVycyA9IHJlcS5oZWFkZXJzIHx8IHt9O1xuICByZXEuY29uZmlnLmlwID0gY2xpZW50SXA7XG4gIHJlcS5pbmZvID0gaW5mbztcblxuICBjb25zdCBpc01haW50ZW5hbmNlID1cbiAgICByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5ICYmIGluZm8ubWFpbnRlbmFuY2VLZXkgPT09IHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXk7XG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgaWYgKGNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHMgfHwgW10sIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSkpIHtcbiAgICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIGlzTWFpbnRlbmFuY2U6IHRydWUsXG4gICAgICB9KTtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1haW50ZW5hbmNlIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYWludGVuYW5jZUtleUlwcycuYFxuICAgICk7XG4gIH1cblxuICBsZXQgaXNNYXN0ZXIgPSBpbmZvLm1hc3RlcktleSA9PT0gcmVxLmNvbmZpZy5tYXN0ZXJLZXk7XG5cbiAgaWYgKGlzTWFzdGVyICYmICFjaGVja0lwKGNsaWVudElwLCByZXEuY29uZmlnLm1hc3RlcktleUlwcyB8fCBbXSwgcmVxLmNvbmZpZy5tYXN0ZXJLZXlJcHNTdG9yZSkpIHtcbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFzdGVyIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYXN0ZXJLZXlJcHMnLmBcbiAgICApO1xuICAgIGlzTWFzdGVyID0gZmFsc2U7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9IGB1bmF1dGhvcml6ZWRgO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICB2YXIgaXNSZWFkT25seU1hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5O1xuICBpZiAoXG4gICAgdHlwZW9mIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgIT0gJ3VuZGVmaW5lZCcgJiZcbiAgICByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICYmXG4gICAgaXNSZWFkT25seU1hc3RlclxuICApIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICAgIGlzUmVhZE9ubHk6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICAvLyBDbGllbnQga2V5cyBhcmUgbm90IHJlcXVpcmVkIGluIHBhcnNlLXNlcnZlciwgYnV0IGlmIGFueSBoYXZlIGJlZW4gY29uZmlndXJlZCBpbiB0aGUgc2VydmVyLCB2YWxpZGF0ZSB0aGVtXG4gIC8vICB0byBwcmVzZXJ2ZSBvcmlnaW5hbCBiZWhhdmlvci5cbiAgY29uc3Qga2V5cyA9IFsnY2xpZW50S2V5JywgJ2phdmFzY3JpcHRLZXknLCAnZG90TmV0S2V5JywgJ3Jlc3RBUElLZXknXTtcbiAgY29uc3Qgb25lS2V5Q29uZmlndXJlZCA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkO1xuICB9KTtcbiAgY29uc3Qgb25lS2V5TWF0Y2hlcyA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkICYmIGluZm9ba2V5XSA9PT0gcmVxLmNvbmZpZ1trZXldO1xuICB9KTtcblxuICBpZiAob25lS2V5Q29uZmlndXJlZCAmJiAhb25lS2V5TWF0Y2hlcykge1xuICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gIH1cblxuICBpZiAocmVxLnVybCA9PSAnL2xvZ2luJykge1xuICAgIGRlbGV0ZSBpbmZvLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChyZXEudXNlckZyb21KV1QpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICB1c2VyOiByZXEudXNlckZyb21KV1QsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICBpZiAoIWluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIH0pO1xuICB9XG4gIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG59XG5cbmNvbnN0IGhhbmRsZVJhdGVMaW1pdCA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICBjb25zdCByYXRlTGltaXRzID0gcmVxLmNvbmZpZy5yYXRlTGltaXRzIHx8IFtdO1xuICB0cnkge1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgcmF0ZUxpbWl0cy5tYXAoYXN5bmMgbGltaXQgPT4ge1xuICAgICAgICBjb25zdCBwYXRoRXhwID0gbmV3IFJlZ0V4cChsaW1pdC5wYXRoKTtcbiAgICAgICAgaWYgKHBhdGhFeHAudGVzdChyZXEudXJsKSkge1xuICAgICAgICAgIGF3YWl0IGxpbWl0LmhhbmRsZXIocmVxLCByZXMsIGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgICAgICAgICdBbiB1bmtub3duIGVycm9yIG9jY3VyZWQgd2hlbiBhdHRlbXB0aW5nIHRvIGFwcGx5IHRoZSByYXRlIGxpbWl0ZXI6ICcsXG4gICAgICAgICAgICAgICAgZXJyXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXMuc3RhdHVzKDQyOSk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVQYXJzZVNlc3Npb24gPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBpbmZvID0gcmVxLmluZm87XG4gICAgaWYgKHJlcS5hdXRoIHx8IHJlcS51cmwgPT09ICcvc2Vzc2lvbnMvbWUnKSB7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCByZXF1ZXN0QXV0aCA9IG51bGw7XG4gICAgaWYgKFxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4gJiZcbiAgICAgIHJlcS51cmwgPT09ICcvdXBncmFkZVRvUmV2b2NhYmxlU2Vzc2lvbicgJiZcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuLmluZGV4T2YoJ3I6JykgIT0gMFxuICAgICkge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXEuYXV0aCA9IHJlcXVlc3RBdXRoO1xuICAgIG5leHQoKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIFRPRE86IERldGVybWluZSB0aGUgY29ycmVjdCBlcnJvciBzY2VuYXJpby5cbiAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoJ2Vycm9yIGdldHRpbmcgYXV0aCBmb3Igc2Vzc2lvblRva2VuJywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VTktOT1dOX0VSUk9SLCBlcnJvcik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldENsaWVudElwKHJlcSkge1xuICByZXR1cm4gcmVxLmlwO1xufVxuXG5mdW5jdGlvbiBodHRwQXV0aChyZXEpIHtcbiAgaWYgKCEocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbikgeyByZXR1cm47IH1cblxuICB2YXIgaGVhZGVyID0gKHJlcS5yZXEgfHwgcmVxKS5oZWFkZXJzLmF1dGhvcml6YXRpb247XG4gIHZhciBhcHBJZCwgbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5O1xuXG4gIC8vIHBhcnNlIGhlYWRlclxuICB2YXIgYXV0aFByZWZpeCA9ICdiYXNpYyAnO1xuXG4gIHZhciBtYXRjaCA9IGhlYWRlci50b0xvd2VyQ2FzZSgpLmluZGV4T2YoYXV0aFByZWZpeCk7XG5cbiAgaWYgKG1hdGNoID09IDApIHtcbiAgICB2YXIgZW5jb2RlZEF1dGggPSBoZWFkZXIuc3Vic3RyaW5nKGF1dGhQcmVmaXgubGVuZ3RoLCBoZWFkZXIubGVuZ3RoKTtcbiAgICB2YXIgY3JlZGVudGlhbHMgPSBkZWNvZGVCYXNlNjQoZW5jb2RlZEF1dGgpLnNwbGl0KCc6Jyk7XG5cbiAgICBpZiAoY3JlZGVudGlhbHMubGVuZ3RoID09IDIpIHtcbiAgICAgIGFwcElkID0gY3JlZGVudGlhbHNbMF07XG4gICAgICB2YXIga2V5ID0gY3JlZGVudGlhbHNbMV07XG5cbiAgICAgIHZhciBqc0tleVByZWZpeCA9ICdqYXZhc2NyaXB0LWtleT0nO1xuXG4gICAgICB2YXIgbWF0Y2hLZXkgPSBrZXkuaW5kZXhPZihqc0tleVByZWZpeCk7XG4gICAgICBpZiAobWF0Y2hLZXkgPT0gMCkge1xuICAgICAgICBqYXZhc2NyaXB0S2V5ID0ga2V5LnN1YnN0cmluZyhqc0tleVByZWZpeC5sZW5ndGgsIGtleS5sZW5ndGgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWFzdGVyS2V5ID0ga2V5O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGFwcElkOiBhcHBJZCwgbWFzdGVyS2V5OiBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk6IGphdmFzY3JpcHRLZXkgfTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlQmFzZTY0KHN0cikge1xuICByZXR1cm4gQnVmZmVyLmZyb20oc3RyLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93Q3Jvc3NEb21haW4oYXBwSWQpIHtcbiAgcmV0dXJuIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoYXBwSWQsIGdldE1vdW50Rm9yUmVxdWVzdChyZXEpKTtcbiAgICBsZXQgYWxsb3dIZWFkZXJzID0gREVGQVVMVF9BTExPV0VEX0hFQURFUlM7XG4gICAgaWYgKGNvbmZpZyAmJiBjb25maWcuYWxsb3dIZWFkZXJzKSB7XG4gICAgICBhbGxvd0hlYWRlcnMgKz0gYCwgJHtjb25maWcuYWxsb3dIZWFkZXJzLmpvaW4oJywgJyl9YDtcbiAgICB9XG5cbiAgICBjb25zdCBiYXNlT3JpZ2lucyA9XG4gICAgICB0eXBlb2YgY29uZmlnPy5hbGxvd09yaWdpbiA9PT0gJ3N0cmluZycgPyBbY29uZmlnLmFsbG93T3JpZ2luXSA6IGNvbmZpZz8uYWxsb3dPcmlnaW4gPz8gWycqJ107XG4gICAgY29uc3QgcmVxdWVzdE9yaWdpbiA9IHJlcS5oZWFkZXJzLm9yaWdpbjtcbiAgICBjb25zdCBhbGxvd09yaWdpbnMgPVxuICAgICAgcmVxdWVzdE9yaWdpbiAmJiBiYXNlT3JpZ2lucy5pbmNsdWRlcyhyZXF1ZXN0T3JpZ2luKSA/IHJlcXVlc3RPcmlnaW4gOiBiYXNlT3JpZ2luc1swXTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCBhbGxvd09yaWdpbnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULFBVVCxQT1NULERFTEVURSxPUFRJT05TJyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsIGFsbG93SGVhZGVycyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtRXhwb3NlLUhlYWRlcnMnLCAnWC1QYXJzZS1Kb2ItU3RhdHVzLUlkLCBYLVBhcnNlLVB1c2gtU3RhdHVzLUlkJyk7XG4gICAgLy8gaW50ZXJjZXB0IE9QVElPTlMgbWV0aG9kXG4gICAgaWYgKCdPUFRJT05TJyA9PSByZXEubWV0aG9kKSB7XG4gICAgICByZXMuc2VuZFN0YXR1cygyMDApO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0KCk7XG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dNZXRob2RPdmVycmlkZShyZXEsIHJlcywgbmV4dCkge1xuICBpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnICYmIHJlcS5ib2R5Ll9tZXRob2QpIHtcbiAgICByZXEub3JpZ2luYWxNZXRob2QgPSByZXEubWV0aG9kO1xuICAgIHJlcS5tZXRob2QgPSByZXEuYm9keS5fbWV0aG9kO1xuICAgIGRlbGV0ZSByZXEuYm9keS5fbWV0aG9kO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVBhcnNlRXJyb3JzKGVyciwgcmVxLCByZXMsIG5leHQpIHtcbiAgY29uc3QgbG9nID0gKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB8fCBkZWZhdWx0TG9nZ2VyO1xuICBpZiAoZXJyIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICBpZiAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmVuYWJsZUV4cHJlc3NFcnJvckhhbmRsZXIpIHtcbiAgICAgIHJldHVybiBuZXh0KGVycik7XG4gICAgfVxuICAgIGxldCBodHRwU3RhdHVzO1xuICAgIC8vIFRPRE86IGZpbGwgb3V0IHRoaXMgbWFwcGluZ1xuICAgIHN3aXRjaCAoZXJyLmNvZGUpIHtcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SOlxuICAgICAgICBodHRwU3RhdHVzID0gNTAwO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwNDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBodHRwU3RhdHVzID0gNDAwO1xuICAgIH1cbiAgICByZXMuc3RhdHVzKGh0dHBTdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBsb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnIpO1xuICB9IGVsc2UgaWYgKGVyci5zdGF0dXMgJiYgZXJyLm1lc3NhZ2UpIHtcbiAgICByZXMuc3RhdHVzKGVyci5zdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyLCBlcnIuc3RhY2spO1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBtZXNzYWdlOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yLicsXG4gICAgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5mb3JjZU1hc3RlcktleUFjY2VzcyhyZXEsIHJlcywgbmV4dCkge1xuICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWRcIn0nKTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxdWVzdCkge1xuICBpZiAoIXJlcXVlc3QuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSAndW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJztcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59XG5cbmV4cG9ydCBjb25zdCBhZGRSYXRlTGltaXQgPSAocm91dGUsIGNvbmZpZywgY2xvdWQpID0+IHtcbiAgaWYgKHR5cGVvZiBjb25maWcgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uZmlnID0gQ29uZmlnLmdldChjb25maWcpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJvdXRlKSB7XG4gICAgaWYgKCFSYXRlTGltaXRPcHRpb25zW2tleV0pIHtcbiAgICAgIHRocm93IGBJbnZhbGlkIHJhdGUgbGltaXQgb3B0aW9uIFwiJHtrZXl9XCJgO1xuICAgIH1cbiAgfVxuICBpZiAoIWNvbmZpZy5yYXRlTGltaXRzKSB7XG4gICAgY29uZmlnLnJhdGVMaW1pdHMgPSBbXTtcbiAgfVxuICBjb25zdCByZWRpc1N0b3JlID0ge1xuICAgIGNvbm5lY3Rpb25Qcm9taXNlOiBQcm9taXNlLnJlc29sdmUoKSxcbiAgICBzdG9yZTogbnVsbCxcbiAgfTtcbiAgaWYgKHJvdXRlLnJlZGlzVXJsKSB7XG4gICAgY29uc3QgbG9nID0gY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgY29uc3QgY2xpZW50ID0gY3JlYXRlQ2xpZW50KHtcbiAgICAgIHVybDogcm91dGUucmVkaXNVcmwsXG4gICAgfSk7XG4gICAgY2xpZW50Lm9uKCdlcnJvcicsIGVyciA9PiB7IGxvZy5lcnJvcignTWlkZGxld2FyZXMgYWRkUmF0ZUxpbWl0IFJlZGlzIGNsaWVudCBlcnJvcicsIHsgZXJyb3I6IGVyciB9KSB9KTtcbiAgICBjbGllbnQub24oJ2Nvbm5lY3QnLCAoKSA9PiB7fSk7XG4gICAgY2xpZW50Lm9uKCdyZWNvbm5lY3RpbmcnLCAoKSA9PiB7fSk7XG4gICAgY2xpZW50Lm9uKCdyZWFkeScsICgpID0+IHt9KTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlID0gYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKGNsaWVudC5pc09wZW4pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nLmVycm9yKGBDb3VsZCBub3QgY29ubmVjdCB0byByZWRpc1VSTCBpbiByYXRlIGxpbWl0OiAke2V9YCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgcmVkaXNTdG9yZS5zdG9yZSA9IG5ldyBSZWRpc1N0b3JlKHtcbiAgICAgIHNlbmRDb21tYW5kOiBhc3luYyAoLi4uYXJncykgPT4ge1xuICAgICAgICBhd2FpdCByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2VuZENvbW1hbmQoYXJncyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIGxldCB0cmFuc2Zvcm1QYXRoID0gcm91dGUucmVxdWVzdFBhdGguc3BsaXQoJy8qJykuam9pbignLyguKiknKTtcbiAgaWYgKHRyYW5zZm9ybVBhdGggPT09ICcqJykge1xuICAgIHRyYW5zZm9ybVBhdGggPSAnKC4qKSc7XG4gIH1cbiAgY29uZmlnLnJhdGVMaW1pdHMucHVzaCh7XG4gICAgcGF0aDogcGF0aFRvUmVnZXhwKHRyYW5zZm9ybVBhdGgpLFxuICAgIGhhbmRsZXI6IHJhdGVMaW1pdCh7XG4gICAgICB3aW5kb3dNczogcm91dGUucmVxdWVzdFRpbWVXaW5kb3csXG4gICAgICBtYXg6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICAgIG1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICAgIGhhbmRsZXI6IChyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCwgb3B0aW9ucykgPT4ge1xuICAgICAgICB0aHJvdyB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogb3B0aW9ucy5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHNraXA6IHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5pcCA9PT0gJzEyNy4wLjAuMScgJiYgIXJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnJlcXVlc3RNZXRob2RzKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocm91dGUucmVxdWVzdE1ldGhvZHMpKSB7XG4gICAgICAgICAgICBpZiAoIXJvdXRlLnJlcXVlc3RNZXRob2RzLmluY2x1ZGVzKHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChyb3V0ZS5yZXF1ZXN0TWV0aG9kcyk7XG4gICAgICAgICAgICBpZiAoIXJlZ0V4cC50ZXN0KHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aD8uaXNNYXN0ZXI7XG4gICAgICB9LFxuICAgICAga2V5R2VuZXJhdG9yOiBhc3luYyByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLmdsb2JhbCkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5hcHBJZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b2tlbiA9IHJlcXVlc3QuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS5zZXNzaW9uICYmIHRva2VuKSB7XG4gICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS51c2VyICYmIHRva2VuKSB7XG4gICAgICAgICAgaWYgKCFyZXF1ZXN0LmF1dGgpIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlUGFyc2VTZXNzaW9uKHJlcXVlc3QsIG51bGwsIHJlc29sdmUpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlcXVlc3QuYXV0aD8udXNlcj8uaWQgJiYgcmVxdWVzdC56b25lID09PSAndXNlcicpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGgudXNlci5pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmlwO1xuICAgICAgfSxcbiAgICAgIHN0b3JlOiByZWRpc1N0b3JlLnN0b3JlLFxuICAgIH0pLFxuICAgIGNsb3VkLFxuICB9KTtcbiAgQ29uZmlnLnB1dChjb25maWcpO1xufTtcblxuLyoqXG4gKiBEZWR1cGxpY2F0ZXMgYSByZXF1ZXN0IHRvIGVuc3VyZSBpZGVtcG90ZW5jeS4gRHVwbGljYXRlcyBhcmUgZGV0ZXJtaW5lZCBieSB0aGUgcmVxdWVzdCBJRFxuICogaW4gdGhlIHJlcXVlc3QgaGVhZGVyLiBJZiBhIHJlcXVlc3QgaGFzIG5vIHJlcXVlc3QgSUQsIGl0IGlzIGV4ZWN1dGVkIGFueXdheS5cbiAqIEBwYXJhbSB7Kn0gcmVxIFRoZSByZXF1ZXN0IHRvIGV2YWx1YXRlLlxuICogQHJldHVybnMgUHJvbWlzZTx7fT5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeShyZXEpIHtcbiAgLy8gRW5hYmxlIGZlYXR1cmUgb25seSBmb3IgTW9uZ29EQlxuICBpZiAoXG4gICAgIShcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXIgfHxcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXJcbiAgICApXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBHZXQgcGFyYW1ldGVyc1xuICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICBjb25zdCByZXF1ZXN0SWQgPSAoKHJlcSB8fCB7fSkuaGVhZGVycyB8fCB7fSlbJ3gtcGFyc2UtcmVxdWVzdC1pZCddO1xuICBjb25zdCB7IHBhdGhzLCB0dGwgfSA9IGNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gIGlmICghcmVxdWVzdElkIHx8ICFjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFJlcXVlc3QgcGF0aCBtYXkgY29udGFpbiB0cmFpbGluZyBzbGFzaGVzLCBkZXBlbmRpbmcgb24gdGhlIG9yaWdpbmFsIHJlcXVlc3QsIHNvIHJlbW92ZVxuICAvLyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIHRvIG1ha2UgaXQgZWFzaWVyIHRvIHNwZWNpZnkgcGF0aHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgY29uc3QgcmVxUGF0aCA9IHJlcS5wYXRoLnJlcGxhY2UoL15cXC98XFwvJC8sICcnKTtcbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgaWRlbXBvdGVuY3kgaXMgZW5hYmxlZCBmb3IgY3VycmVudCByZXF1ZXN0IHBhdGhcbiAgbGV0IG1hdGNoID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuICAgIC8vIEFzc3VtZSBvbmUgd2FudHMgYSBwYXRoIHRvIGFsd2F5cyBtYXRjaCBmcm9tIHRoZSBiZWdpbm5pbmcgdG8gcHJldmVudCBhbnkgbWlzdGFrZXNcbiAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0aC5jaGFyQXQoMCkgPT09ICdeJyA/IHBhdGggOiAnXicgKyBwYXRoKTtcbiAgICBpZiAocmVxUGF0aC5tYXRjaChyZWdleCkpIHtcbiAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFRyeSB0byBzdG9yZSByZXF1ZXN0XG4gIGNvbnN0IGV4cGlyeURhdGUgPSBuZXcgRGF0ZShuZXcgRGF0ZSgpLnNldFNlY29uZHMobmV3IERhdGUoKS5nZXRTZWNvbmRzKCkgKyB0dGwpKTtcbiAgcmV0dXJuIHJlc3RcbiAgICAuY3JlYXRlKGNvbmZpZywgYXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19JZGVtcG90ZW5jeScsIHtcbiAgICAgIHJlcUlkOiByZXF1ZXN0SWQsXG4gICAgICBleHBpcmU6IFBhcnNlLl9lbmNvZGUoZXhwaXJ5RGF0ZSksXG4gICAgfSlcbiAgICAuY2F0Y2goZSA9PiB7XG4gICAgICBpZiAoZS5jb2RlID09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1JFUVVFU1QsICdEdXBsaWNhdGUgcmVxdWVzdCcpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDMpO1xuICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkXCJ9Jyk7XG59XG5cbmZ1bmN0aW9uIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDApO1xuICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgZXJyb3I6ICdJbnZhbGlkIG9iamVjdCBmb3IgY29udGV4dC4nIH0pO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxLQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxVQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxvQkFBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsdUJBQUEsR0FBQVQsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFTLGlCQUFBLEdBQUFWLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVSxZQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxhQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxlQUFBLEdBQUFiLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBYSxNQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxJQUFBLEdBQUFkLE9BQUE7QUFBd0MsU0FBQUQsdUJBQUFnQixDQUFBLFdBQUFB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