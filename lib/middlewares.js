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
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    redisStore.connectionPromise = async () => {
      if (client.isOpen) {
        return;
      }
      try {
        await client.connect();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiREVGQVVMVF9BTExPV0VEX0hFQURFUlMiLCJleHBvcnRzIiwiZ2V0TW91bnRGb3JSZXF1ZXN0IiwicmVxIiwibW91bnRQYXRoTGVuZ3RoIiwib3JpZ2luYWxVcmwiLCJsZW5ndGgiLCJ1cmwiLCJtb3VudFBhdGgiLCJzbGljZSIsInByb3RvY29sIiwiZ2V0IiwiZ2V0QmxvY2tMaXN0IiwiaXBSYW5nZUxpc3QiLCJzdG9yZSIsImJsb2NrTGlzdCIsIkJsb2NrTGlzdCIsImZvckVhY2giLCJmdWxsSXAiLCJzZXQiLCJpcCIsIm1hc2siLCJzcGxpdCIsImFkZEFkZHJlc3MiLCJpc0lQdjQiLCJhZGRTdWJuZXQiLCJOdW1iZXIiLCJjaGVja0lwIiwiaW5jb21pbmdJcElzVjQiLCJyZXN1bHQiLCJjaGVjayIsImluY2x1ZGVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicmVzIiwibmV4dCIsIm1vdW50IiwiY29udGV4dCIsIkpTT04iLCJwYXJzZSIsIk9iamVjdCIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJfcmVxJGNvbmZpZyIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJpc01hc3RlciIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleUlwc1N0b3JlIiwiX3JlcSRjb25maWcyIiwibWVzc2FnZSIsImhhbmRsZVJhdGVMaW1pdCIsImlzUmVhZE9ubHlNYXN0ZXIiLCJyZWFkT25seU1hc3RlcktleSIsImlzUmVhZE9ubHkiLCJrZXlzIiwib25lS2V5Q29uZmlndXJlZCIsInNvbWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJvbmVLZXlNYXRjaGVzIiwidXNlckZyb21KV1QiLCJ1c2VyIiwicmF0ZUxpbWl0cyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJsaW1pdCIsInBhdGhFeHAiLCJSZWdFeHAiLCJwYXRoIiwidGVzdCIsImhhbmRsZXIiLCJlcnIiLCJDT05ORUNUSU9OX0ZBSUxFRCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsInJlcXVlc3RBdXRoIiwiaW5kZXhPZiIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiVU5LTk9XTl9FUlJPUiIsImF1dGhvcml6YXRpb24iLCJoZWFkZXIiLCJhdXRoUHJlZml4IiwibWF0Y2giLCJ0b0xvd2VyQ2FzZSIsImVuY29kZWRBdXRoIiwic3Vic3RyaW5nIiwiY3JlZGVudGlhbHMiLCJkZWNvZGVCYXNlNjQiLCJqc0tleVByZWZpeCIsIm1hdGNoS2V5Iiwic3RyIiwiYWxsb3dDcm9zc0RvbWFpbiIsImFsbG93SGVhZGVycyIsImpvaW4iLCJiYXNlT3JpZ2lucyIsImFsbG93T3JpZ2luIiwicmVxdWVzdE9yaWdpbiIsIm9yaWdpbiIsImFsbG93T3JpZ2lucyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsInJlZGlzVXJsIiwiY2xpZW50IiwiY3JlYXRlQ2xpZW50IiwiaXNPcGVuIiwiY29ubmVjdCIsIl9jb25maWciLCJSZWRpc1N0b3JlIiwic2VuZENvbW1hbmQiLCJhcmdzIiwidHJhbnNmb3JtUGF0aCIsInJlcXVlc3RQYXRoIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJlc3BvbnNlIiwib3B0aW9ucyIsInNraXAiLCJfcmVxdWVzdCRhdXRoIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJ6b25lIiwiU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsImdsb2JhbCIsInRva2VuIiwic2Vzc2lvbiIsIl9yZXF1ZXN0JGF1dGgyIiwiaWQiLCJwdXQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInJlcXVlc3RJZCIsInBhdGhzIiwidHRsIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwicmVxUGF0aCIsInJlcGxhY2UiLCJyZWdleCIsImNoYXJBdCIsImV4cGlyeURhdGUiLCJEYXRlIiwic2V0U2Vjb25kcyIsImdldFNlY29uZHMiLCJyZXN0IiwiY3JlYXRlIiwibWFzdGVyIiwicmVxSWQiLCJleHBpcmUiLCJfZW5jb2RlIiwiY2F0Y2giLCJEVVBMSUNBVEVfVkFMVUUiLCJEVVBMSUNBVEVfUkVRVUVTVCIsIklOVkFMSURfSlNPTiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9taWRkbGV3YXJlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgYXV0aCBmcm9tICcuL0F1dGgnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgQ2xpZW50U0RLIGZyb20gJy4vQ2xpZW50U0RLJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9BTExPV0VEX0hFQURFUlMgPVxuICAnWC1QYXJzZS1NYXN0ZXItS2V5LCBYLVBhcnNlLVJFU1QtQVBJLUtleSwgWC1QYXJzZS1KYXZhc2NyaXB0LUtleSwgWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCwgWC1QYXJzZS1DbGllbnQtVmVyc2lvbiwgWC1QYXJzZS1TZXNzaW9uLVRva2VuLCBYLVJlcXVlc3RlZC1XaXRoLCBYLVBhcnNlLVJldm9jYWJsZS1TZXNzaW9uLCBYLVBhcnNlLVJlcXVlc3QtSWQsIENvbnRlbnQtVHlwZSwgUHJhZ21hLCBDYWNoZS1Db250cm9sJztcblxuY29uc3QgZ2V0TW91bnRGb3JSZXF1ZXN0ID0gZnVuY3Rpb24gKHJlcSkge1xuICBjb25zdCBtb3VudFBhdGhMZW5ndGggPSByZXEub3JpZ2luYWxVcmwubGVuZ3RoIC0gcmVxLnVybC5sZW5ndGg7XG4gIGNvbnN0IG1vdW50UGF0aCA9IHJlcS5vcmlnaW5hbFVybC5zbGljZSgwLCBtb3VudFBhdGhMZW5ndGgpO1xuICByZXR1cm4gcmVxLnByb3RvY29sICsgJzovLycgKyByZXEuZ2V0KCdob3N0JykgKyBtb3VudFBhdGg7XG59O1xuXG5jb25zdCBnZXRCbG9ja0xpc3QgPSAoaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGlmIChzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpKSB7IHJldHVybiBzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpOyB9XG4gIGNvbnN0IGJsb2NrTGlzdCA9IG5ldyBCbG9ja0xpc3QoKTtcbiAgaXBSYW5nZUxpc3QuZm9yRWFjaChmdWxsSXAgPT4ge1xuICAgIGlmIChmdWxsSXAgPT09ICc6Oi8wJyB8fCBmdWxsSXAgPT09ICc6OicpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY2JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChmdWxsSXAgPT09ICcwLjAuMC4wLzAnIHx8IGZ1bGxJcCA9PT0gJzAuMC4wLjAnKSB7XG4gICAgICBzdG9yZS5zZXQoJ2FsbG93QWxsSXB2NCcsIHRydWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBbaXAsIG1hc2tdID0gZnVsbElwLnNwbGl0KCcvJyk7XG4gICAgaWYgKCFtYXNrKSB7XG4gICAgICBibG9ja0xpc3QuYWRkQWRkcmVzcyhpcCwgaXNJUHY0KGlwKSA/ICdpcHY0JyA6ICdpcHY2Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRTdWJuZXQoaXAsIE51bWJlcihtYXNrKSwgaXNJUHY0KGlwKSA/ICdpcHY0JyA6ICdpcHY2Jyk7XG4gICAgfVxuICB9KTtcbiAgc3RvcmUuc2V0KCdibG9ja0xpc3QnLCBibG9ja0xpc3QpO1xuICByZXR1cm4gYmxvY2tMaXN0O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrSXAgPSAoaXAsIGlwUmFuZ2VMaXN0LCBzdG9yZSkgPT4ge1xuICBjb25zdCBpbmNvbWluZ0lwSXNWNCA9IGlzSVB2NChpcCk7XG4gIGNvbnN0IGJsb2NrTGlzdCA9IGdldEJsb2NrTGlzdChpcFJhbmdlTGlzdCwgc3RvcmUpO1xuXG4gIGlmIChzdG9yZS5nZXQoaXApKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NCcpICYmIGluY29taW5nSXBJc1Y0KSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NicpICYmICFpbmNvbWluZ0lwSXNWNCkgeyByZXR1cm4gdHJ1ZTsgfVxuICBjb25zdCByZXN1bHQgPSBibG9ja0xpc3QuY2hlY2soaXAsIGluY29taW5nSXBJc1Y0ID8gJ2lwdjQnIDogJ2lwdjYnKTtcblxuICAvLyBJZiB0aGUgaXAgaXMgaW4gdGhlIGxpc3QsIHdlIHN0b3JlIHRoZSByZXN1bHQgaW4gdGhlIHN0b3JlXG4gIC8vIHNvIHdlIGhhdmUgYSBvcHRpbWl6ZWQgcGF0aCBmb3IgdGhlIG5leHQgcmVxdWVzdFxuICBpZiAoaXBSYW5nZUxpc3QuaW5jbHVkZXMoaXApICYmIHJlc3VsdCkge1xuICAgIHN0b3JlLnNldChpcCwgcmVzdWx0KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLy8gQ2hlY2tzIHRoYXQgdGhlIHJlcXVlc3QgaXMgYXV0aG9yaXplZCBmb3IgdGhpcyBhcHAgYW5kIGNoZWNrcyB1c2VyXG4vLyBhdXRoIHRvby5cbi8vIFRoZSBib2R5cGFyc2VyIHNob3VsZCBydW4gYmVmb3JlIHRoaXMgbWlkZGxld2FyZS5cbi8vIEFkZHMgaW5mbyB0byB0aGUgcmVxdWVzdDpcbi8vIHJlcS5jb25maWcgLSB0aGUgQ29uZmlnIGZvciB0aGlzIGFwcFxuLy8gcmVxLmF1dGggLSB0aGUgQXV0aCBmb3IgdGhpcyByZXF1ZXN0XG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlUGFyc2VIZWFkZXJzKHJlcSwgcmVzLCBuZXh0KSB7XG4gIHZhciBtb3VudCA9IGdldE1vdW50Rm9yUmVxdWVzdChyZXEpO1xuXG4gIGxldCBjb250ZXh0ID0ge307XG4gIGlmIChyZXEuZ2V0KCdYLVBhcnNlLUNsb3VkLUNvbnRleHQnKSAhPSBudWxsKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpKTtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoY29udGV4dCkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgIHRocm93ICdDb250ZXh0IGlzIG5vdCBhbiBvYmplY3QnO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cbiAgdmFyIGluZm8gPSB7XG4gICAgYXBwSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtQXBwbGljYXRpb24tSWQnKSxcbiAgICBzZXNzaW9uVG9rZW46IHJlcS5nZXQoJ1gtUGFyc2UtU2Vzc2lvbi1Ub2tlbicpLFxuICAgIG1hc3RlcktleTogcmVxLmdldCgnWC1QYXJzZS1NYXN0ZXItS2V5JyksXG4gICAgbWFpbnRlbmFuY2VLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFpbnRlbmFuY2UtS2V5JyksXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtSW5zdGFsbGF0aW9uLUlkJyksXG4gICAgY2xpZW50S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1LZXknKSxcbiAgICBqYXZhc2NyaXB0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUphdmFzY3JpcHQtS2V5JyksXG4gICAgZG90TmV0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLVdpbmRvd3MtS2V5JyksXG4gICAgcmVzdEFQSUtleTogcmVxLmdldCgnWC1QYXJzZS1SRVNULUFQSS1LZXknKSxcbiAgICBjbGllbnRWZXJzaW9uOiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1WZXJzaW9uJyksXG4gICAgY29udGV4dDogY29udGV4dCxcbiAgfTtcblxuICB2YXIgYmFzaWNBdXRoID0gaHR0cEF1dGgocmVxKTtcblxuICBpZiAoYmFzaWNBdXRoKSB7XG4gICAgdmFyIGJhc2ljQXV0aEFwcElkID0gYmFzaWNBdXRoLmFwcElkO1xuICAgIGlmIChBcHBDYWNoZS5nZXQoYmFzaWNBdXRoQXBwSWQpKSB7XG4gICAgICBpbmZvLmFwcElkID0gYmFzaWNBdXRoQXBwSWQ7XG4gICAgICBpbmZvLm1hc3RlcktleSA9IGJhc2ljQXV0aC5tYXN0ZXJLZXkgfHwgaW5mby5tYXN0ZXJLZXk7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSBiYXNpY0F1dGguamF2YXNjcmlwdEtleSB8fCBpbmZvLmphdmFzY3JpcHRLZXk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlcS5ib2R5KSB7XG4gICAgLy8gVW5pdHkgU0RLIHNlbmRzIGEgX25vQm9keSBrZXkgd2hpY2ggbmVlZHMgdG8gYmUgcmVtb3ZlZC5cbiAgICAvLyBVbmNsZWFyIGF0IHRoaXMgcG9pbnQgaWYgYWN0aW9uIG5lZWRzIHRvIGJlIHRha2VuLlxuICAgIGRlbGV0ZSByZXEuYm9keS5fbm9Cb2R5O1xuICB9XG5cbiAgdmFyIGZpbGVWaWFKU09OID0gZmFsc2U7XG5cbiAgaWYgKCFpbmZvLmFwcElkIHx8ICFBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCkpIHtcbiAgICAvLyBTZWUgaWYgd2UgY2FuIGZpbmQgdGhlIGFwcCBpZCBvbiB0aGUgYm9keS5cbiAgICBpZiAocmVxLmJvZHkgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgIC8vIFRoZSBvbmx5IGNoYW5jZSB0byBmaW5kIHRoZSBhcHAgaWQgaXMgaWYgdGhpcyBpcyBhIGZpbGVcbiAgICAgIC8vIHVwbG9hZCB0aGF0IGFjdHVhbGx5IGlzIGEgSlNPTiBib2R5LiBTbyB0cnkgdG8gcGFyc2UgaXQuXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvNjU4OVxuICAgICAgLy8gSXQgaXMgYWxzbyBwb3NzaWJsZSB0aGF0IHRoZSBjbGllbnQgaXMgdHJ5aW5nIHRvIHVwbG9hZCBhIGZpbGUgYnV0IGZvcmdvdFxuICAgICAgLy8gdG8gcHJvdmlkZSB4LXBhcnNlLWFwcC1pZCBpbiBoZWFkZXIgYW5kIHBhcnNlIGEgYmluYXJ5IGZpbGUgd2lsbCBmYWlsXG4gICAgICB0cnkge1xuICAgICAgICByZXEuYm9keSA9IEpTT04ucGFyc2UocmVxLmJvZHkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgfVxuICAgICAgZmlsZVZpYUpTT04gPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXEuYm9keSkge1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9SZXZvY2FibGVTZXNzaW9uO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHJlcS5ib2R5ICYmXG4gICAgICByZXEuYm9keS5fQXBwbGljYXRpb25JZCAmJlxuICAgICAgQXBwQ2FjaGUuZ2V0KHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkKSAmJlxuICAgICAgKCFpbmZvLm1hc3RlcktleSB8fCBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpLm1hc3RlcktleSA9PT0gaW5mby5tYXN0ZXJLZXkpXG4gICAgKSB7XG4gICAgICBpbmZvLmFwcElkID0gcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQ7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSByZXEuYm9keS5fSmF2YVNjcmlwdEtleSB8fCAnJztcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fSmF2YVNjcmlwdEtleTtcbiAgICAgIC8vIFRPRE86IHRlc3QgdGhhdCB0aGUgUkVTVCBBUEkgZm9ybWF0cyBnZW5lcmF0ZWQgYnkgdGhlIG90aGVyXG4gICAgICAvLyBTREtzIGFyZSBoYW5kbGVkIG9rXG4gICAgICBpZiAocmVxLmJvZHkuX0NsaWVudFZlcnNpb24pIHtcbiAgICAgICAgaW5mby5jbGllbnRWZXJzaW9uID0gcmVxLmJvZHkuX0NsaWVudFZlcnNpb247XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgaW5mby5pbnN0YWxsYXRpb25JZCA9IHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fU2Vzc2lvblRva2VuKSB7XG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX01hc3RlcktleSkge1xuICAgICAgICBpbmZvLm1hc3RlcktleSA9IHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0KSB7XG4gICAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgIGluZm8uY29udGV4dCA9IHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpbmZvLmNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5ib2R5Ll9jb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoaW5mby5jb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0NvbnRlbnRUeXBlKSB7XG4gICAgICAgIHJlcS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cbiAgaWYgKGluZm8uc2Vzc2lvblRva2VuICYmIHR5cGVvZiBpbmZvLnNlc3Npb25Ub2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IGluZm8uc2Vzc2lvblRva2VuLnRvU3RyaW5nKCk7XG4gIH1cblxuICBpZiAoaW5mby5zZXNzaW9uVG9rZW4gJiYgdHlwZW9mIGluZm8uc2Vzc2lvblRva2VuICE9PSAnc3RyaW5nJykge1xuICAgIGluZm8uc2Vzc2lvblRva2VuID0gaW5mby5zZXNzaW9uVG9rZW4udG9TdHJpbmcoKTtcbiAgfVxuXG4gIGlmIChpbmZvLmNsaWVudFZlcnNpb24pIHtcbiAgICBpbmZvLmNsaWVudFNESyA9IENsaWVudFNESy5mcm9tU3RyaW5nKGluZm8uY2xpZW50VmVyc2lvbik7XG4gIH1cblxuICBpZiAoZmlsZVZpYUpTT04pIHtcbiAgICByZXEuZmlsZURhdGEgPSByZXEuYm9keS5maWxlRGF0YTtcbiAgICAvLyBXZSBuZWVkIHRvIHJlcG9wdWxhdGUgcmVxLmJvZHkgd2l0aCBhIGJ1ZmZlclxuICAgIHZhciBiYXNlNjQgPSByZXEuYm9keS5iYXNlNjQ7XG4gICAgcmVxLmJvZHkgPSBCdWZmZXIuZnJvbShiYXNlNjQsICdiYXNlNjQnKTtcbiAgfVxuXG4gIGNvbnN0IGNsaWVudElwID0gZ2V0Q2xpZW50SXAocmVxKTtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChpbmZvLmFwcElkLCBtb3VudCk7XG4gIGlmIChjb25maWcuc3RhdGUgJiYgY29uZmlnLnN0YXRlICE9PSAnb2snKSB7XG4gICAgcmVzLnN0YXR1cyg1MDApO1xuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgIGVycm9yOiBgSW52YWxpZCBzZXJ2ZXIgc3RhdGU6ICR7Y29uZmlnLnN0YXRlfWAsXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaW5mby5hcHAgPSBBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCk7XG4gIHJlcS5jb25maWcgPSBjb25maWc7XG4gIHJlcS5jb25maWcuaGVhZGVycyA9IHJlcS5oZWFkZXJzIHx8IHt9O1xuICByZXEuY29uZmlnLmlwID0gY2xpZW50SXA7XG4gIHJlcS5pbmZvID0gaW5mbztcblxuICBjb25zdCBpc01haW50ZW5hbmNlID1cbiAgICByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5ICYmIGluZm8ubWFpbnRlbmFuY2VLZXkgPT09IHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXk7XG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgaWYgKGNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHMgfHwgW10sIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSkpIHtcbiAgICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIGlzTWFpbnRlbmFuY2U6IHRydWUsXG4gICAgICB9KTtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1haW50ZW5hbmNlIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYWludGVuYW5jZUtleUlwcycuYFxuICAgICk7XG4gIH1cblxuICBsZXQgaXNNYXN0ZXIgPSBpbmZvLm1hc3RlcktleSA9PT0gcmVxLmNvbmZpZy5tYXN0ZXJLZXk7XG5cbiAgaWYgKGlzTWFzdGVyICYmICFjaGVja0lwKGNsaWVudElwLCByZXEuY29uZmlnLm1hc3RlcktleUlwcyB8fCBbXSwgcmVxLmNvbmZpZy5tYXN0ZXJLZXlJcHNTdG9yZSkpIHtcbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFzdGVyIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYXN0ZXJLZXlJcHMnLmBcbiAgICApO1xuICAgIGlzTWFzdGVyID0gZmFsc2U7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9IGB1bmF1dGhvcml6ZWRgO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICB2YXIgaXNSZWFkT25seU1hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5O1xuICBpZiAoXG4gICAgdHlwZW9mIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgIT0gJ3VuZGVmaW5lZCcgJiZcbiAgICByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICYmXG4gICAgaXNSZWFkT25seU1hc3RlclxuICApIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICAgIGlzUmVhZE9ubHk6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICAvLyBDbGllbnQga2V5cyBhcmUgbm90IHJlcXVpcmVkIGluIHBhcnNlLXNlcnZlciwgYnV0IGlmIGFueSBoYXZlIGJlZW4gY29uZmlndXJlZCBpbiB0aGUgc2VydmVyLCB2YWxpZGF0ZSB0aGVtXG4gIC8vICB0byBwcmVzZXJ2ZSBvcmlnaW5hbCBiZWhhdmlvci5cbiAgY29uc3Qga2V5cyA9IFsnY2xpZW50S2V5JywgJ2phdmFzY3JpcHRLZXknLCAnZG90TmV0S2V5JywgJ3Jlc3RBUElLZXknXTtcbiAgY29uc3Qgb25lS2V5Q29uZmlndXJlZCA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkO1xuICB9KTtcbiAgY29uc3Qgb25lS2V5TWF0Y2hlcyA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkICYmIGluZm9ba2V5XSA9PT0gcmVxLmNvbmZpZ1trZXldO1xuICB9KTtcblxuICBpZiAob25lS2V5Q29uZmlndXJlZCAmJiAhb25lS2V5TWF0Y2hlcykge1xuICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gIH1cblxuICBpZiAocmVxLnVybCA9PSAnL2xvZ2luJykge1xuICAgIGRlbGV0ZSBpbmZvLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChyZXEudXNlckZyb21KV1QpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICB1c2VyOiByZXEudXNlckZyb21KV1QsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICBpZiAoIWluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIH0pO1xuICB9XG4gIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG59XG5cbmNvbnN0IGhhbmRsZVJhdGVMaW1pdCA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICBjb25zdCByYXRlTGltaXRzID0gcmVxLmNvbmZpZy5yYXRlTGltaXRzIHx8IFtdO1xuICB0cnkge1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgcmF0ZUxpbWl0cy5tYXAoYXN5bmMgbGltaXQgPT4ge1xuICAgICAgICBjb25zdCBwYXRoRXhwID0gbmV3IFJlZ0V4cChsaW1pdC5wYXRoKTtcbiAgICAgICAgaWYgKHBhdGhFeHAudGVzdChyZXEudXJsKSkge1xuICAgICAgICAgIGF3YWl0IGxpbWl0LmhhbmRsZXIocmVxLCByZXMsIGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgICAgICAgICdBbiB1bmtub3duIGVycm9yIG9jY3VyZWQgd2hlbiBhdHRlbXB0aW5nIHRvIGFwcGx5IHRoZSByYXRlIGxpbWl0ZXI6ICcsXG4gICAgICAgICAgICAgICAgZXJyXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXMuc3RhdHVzKDQyOSk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVQYXJzZVNlc3Npb24gPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBpbmZvID0gcmVxLmluZm87XG4gICAgaWYgKHJlcS5hdXRoIHx8IHJlcS51cmwgPT09ICcvc2Vzc2lvbnMvbWUnKSB7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCByZXF1ZXN0QXV0aCA9IG51bGw7XG4gICAgaWYgKFxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4gJiZcbiAgICAgIHJlcS51cmwgPT09ICcvdXBncmFkZVRvUmV2b2NhYmxlU2Vzc2lvbicgJiZcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuLmluZGV4T2YoJ3I6JykgIT0gMFxuICAgICkge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXEuYXV0aCA9IHJlcXVlc3RBdXRoO1xuICAgIG5leHQoKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIFRPRE86IERldGVybWluZSB0aGUgY29ycmVjdCBlcnJvciBzY2VuYXJpby5cbiAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoJ2Vycm9yIGdldHRpbmcgYXV0aCBmb3Igc2Vzc2lvblRva2VuJywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VTktOT1dOX0VSUk9SLCBlcnJvcik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldENsaWVudElwKHJlcSkge1xuICByZXR1cm4gcmVxLmlwO1xufVxuXG5mdW5jdGlvbiBodHRwQXV0aChyZXEpIHtcbiAgaWYgKCEocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbikgeyByZXR1cm47IH1cblxuICB2YXIgaGVhZGVyID0gKHJlcS5yZXEgfHwgcmVxKS5oZWFkZXJzLmF1dGhvcml6YXRpb247XG4gIHZhciBhcHBJZCwgbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5O1xuXG4gIC8vIHBhcnNlIGhlYWRlclxuICB2YXIgYXV0aFByZWZpeCA9ICdiYXNpYyAnO1xuXG4gIHZhciBtYXRjaCA9IGhlYWRlci50b0xvd2VyQ2FzZSgpLmluZGV4T2YoYXV0aFByZWZpeCk7XG5cbiAgaWYgKG1hdGNoID09IDApIHtcbiAgICB2YXIgZW5jb2RlZEF1dGggPSBoZWFkZXIuc3Vic3RyaW5nKGF1dGhQcmVmaXgubGVuZ3RoLCBoZWFkZXIubGVuZ3RoKTtcbiAgICB2YXIgY3JlZGVudGlhbHMgPSBkZWNvZGVCYXNlNjQoZW5jb2RlZEF1dGgpLnNwbGl0KCc6Jyk7XG5cbiAgICBpZiAoY3JlZGVudGlhbHMubGVuZ3RoID09IDIpIHtcbiAgICAgIGFwcElkID0gY3JlZGVudGlhbHNbMF07XG4gICAgICB2YXIga2V5ID0gY3JlZGVudGlhbHNbMV07XG5cbiAgICAgIHZhciBqc0tleVByZWZpeCA9ICdqYXZhc2NyaXB0LWtleT0nO1xuXG4gICAgICB2YXIgbWF0Y2hLZXkgPSBrZXkuaW5kZXhPZihqc0tleVByZWZpeCk7XG4gICAgICBpZiAobWF0Y2hLZXkgPT0gMCkge1xuICAgICAgICBqYXZhc2NyaXB0S2V5ID0ga2V5LnN1YnN0cmluZyhqc0tleVByZWZpeC5sZW5ndGgsIGtleS5sZW5ndGgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWFzdGVyS2V5ID0ga2V5O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGFwcElkOiBhcHBJZCwgbWFzdGVyS2V5OiBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk6IGphdmFzY3JpcHRLZXkgfTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlQmFzZTY0KHN0cikge1xuICByZXR1cm4gQnVmZmVyLmZyb20oc3RyLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93Q3Jvc3NEb21haW4oYXBwSWQpIHtcbiAgcmV0dXJuIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoYXBwSWQsIGdldE1vdW50Rm9yUmVxdWVzdChyZXEpKTtcbiAgICBsZXQgYWxsb3dIZWFkZXJzID0gREVGQVVMVF9BTExPV0VEX0hFQURFUlM7XG4gICAgaWYgKGNvbmZpZyAmJiBjb25maWcuYWxsb3dIZWFkZXJzKSB7XG4gICAgICBhbGxvd0hlYWRlcnMgKz0gYCwgJHtjb25maWcuYWxsb3dIZWFkZXJzLmpvaW4oJywgJyl9YDtcbiAgICB9XG5cbiAgICBjb25zdCBiYXNlT3JpZ2lucyA9XG4gICAgICB0eXBlb2YgY29uZmlnPy5hbGxvd09yaWdpbiA9PT0gJ3N0cmluZycgPyBbY29uZmlnLmFsbG93T3JpZ2luXSA6IGNvbmZpZz8uYWxsb3dPcmlnaW4gPz8gWycqJ107XG4gICAgY29uc3QgcmVxdWVzdE9yaWdpbiA9IHJlcS5oZWFkZXJzLm9yaWdpbjtcbiAgICBjb25zdCBhbGxvd09yaWdpbnMgPVxuICAgICAgcmVxdWVzdE9yaWdpbiAmJiBiYXNlT3JpZ2lucy5pbmNsdWRlcyhyZXF1ZXN0T3JpZ2luKSA/IHJlcXVlc3RPcmlnaW4gOiBiYXNlT3JpZ2luc1swXTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCBhbGxvd09yaWdpbnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULFBVVCxQT1NULERFTEVURSxPUFRJT05TJyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsIGFsbG93SGVhZGVycyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtRXhwb3NlLUhlYWRlcnMnLCAnWC1QYXJzZS1Kb2ItU3RhdHVzLUlkLCBYLVBhcnNlLVB1c2gtU3RhdHVzLUlkJyk7XG4gICAgLy8gaW50ZXJjZXB0IE9QVElPTlMgbWV0aG9kXG4gICAgaWYgKCdPUFRJT05TJyA9PSByZXEubWV0aG9kKSB7XG4gICAgICByZXMuc2VuZFN0YXR1cygyMDApO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0KCk7XG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dNZXRob2RPdmVycmlkZShyZXEsIHJlcywgbmV4dCkge1xuICBpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnICYmIHJlcS5ib2R5Ll9tZXRob2QpIHtcbiAgICByZXEub3JpZ2luYWxNZXRob2QgPSByZXEubWV0aG9kO1xuICAgIHJlcS5tZXRob2QgPSByZXEuYm9keS5fbWV0aG9kO1xuICAgIGRlbGV0ZSByZXEuYm9keS5fbWV0aG9kO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVBhcnNlRXJyb3JzKGVyciwgcmVxLCByZXMsIG5leHQpIHtcbiAgY29uc3QgbG9nID0gKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB8fCBkZWZhdWx0TG9nZ2VyO1xuICBpZiAoZXJyIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICBpZiAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmVuYWJsZUV4cHJlc3NFcnJvckhhbmRsZXIpIHtcbiAgICAgIHJldHVybiBuZXh0KGVycik7XG4gICAgfVxuICAgIGxldCBodHRwU3RhdHVzO1xuICAgIC8vIFRPRE86IGZpbGwgb3V0IHRoaXMgbWFwcGluZ1xuICAgIHN3aXRjaCAoZXJyLmNvZGUpIHtcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SOlxuICAgICAgICBodHRwU3RhdHVzID0gNTAwO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwNDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBodHRwU3RhdHVzID0gNDAwO1xuICAgIH1cbiAgICByZXMuc3RhdHVzKGh0dHBTdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBsb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnIpO1xuICB9IGVsc2UgaWYgKGVyci5zdGF0dXMgJiYgZXJyLm1lc3NhZ2UpIHtcbiAgICByZXMuc3RhdHVzKGVyci5zdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyLCBlcnIuc3RhY2spO1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBtZXNzYWdlOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yLicsXG4gICAgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5mb3JjZU1hc3RlcktleUFjY2VzcyhyZXEsIHJlcywgbmV4dCkge1xuICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWRcIn0nKTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxdWVzdCkge1xuICBpZiAoIXJlcXVlc3QuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSAndW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJztcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59XG5cbmV4cG9ydCBjb25zdCBhZGRSYXRlTGltaXQgPSAocm91dGUsIGNvbmZpZywgY2xvdWQpID0+IHtcbiAgaWYgKHR5cGVvZiBjb25maWcgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uZmlnID0gQ29uZmlnLmdldChjb25maWcpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJvdXRlKSB7XG4gICAgaWYgKCFSYXRlTGltaXRPcHRpb25zW2tleV0pIHtcbiAgICAgIHRocm93IGBJbnZhbGlkIHJhdGUgbGltaXQgb3B0aW9uIFwiJHtrZXl9XCJgO1xuICAgIH1cbiAgfVxuICBpZiAoIWNvbmZpZy5yYXRlTGltaXRzKSB7XG4gICAgY29uZmlnLnJhdGVMaW1pdHMgPSBbXTtcbiAgfVxuICBjb25zdCByZWRpc1N0b3JlID0ge1xuICAgIGNvbm5lY3Rpb25Qcm9taXNlOiBQcm9taXNlLnJlc29sdmUoKSxcbiAgICBzdG9yZTogbnVsbCxcbiAgfTtcbiAgaWYgKHJvdXRlLnJlZGlzVXJsKSB7XG4gICAgY29uc3QgY2xpZW50ID0gY3JlYXRlQ2xpZW50KHtcbiAgICAgIHVybDogcm91dGUucmVkaXNVcmwsXG4gICAgfSk7XG4gICAgcmVkaXNTdG9yZS5jb25uZWN0aW9uUHJvbWlzZSA9IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChjbGllbnQuaXNPcGVuKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5jb25uZWN0KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGxvZyA9IGNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgICAgICBsb2cuZXJyb3IoYENvdWxkIG5vdCBjb25uZWN0IHRvIHJlZGlzVVJMIGluIHJhdGUgbGltaXQ6ICR7ZX1gKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICByZWRpc1N0b3JlLnN0b3JlID0gbmV3IFJlZGlzU3RvcmUoe1xuICAgICAgc2VuZENvbW1hbmQ6IGFzeW5jICguLi5hcmdzKSA9PiB7XG4gICAgICAgIGF3YWl0IHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZW5kQ29tbWFuZChhcmdzKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cbiAgbGV0IHRyYW5zZm9ybVBhdGggPSByb3V0ZS5yZXF1ZXN0UGF0aC5zcGxpdCgnLyonKS5qb2luKCcvKC4qKScpO1xuICBpZiAodHJhbnNmb3JtUGF0aCA9PT0gJyonKSB7XG4gICAgdHJhbnNmb3JtUGF0aCA9ICcoLiopJztcbiAgfVxuICBjb25maWcucmF0ZUxpbWl0cy5wdXNoKHtcbiAgICBwYXRoOiBwYXRoVG9SZWdleHAodHJhbnNmb3JtUGF0aCksXG4gICAgaGFuZGxlcjogcmF0ZUxpbWl0KHtcbiAgICAgIHdpbmRvd01zOiByb3V0ZS5yZXF1ZXN0VGltZVdpbmRvdyxcbiAgICAgIG1heDogcm91dGUucmVxdWVzdENvdW50LFxuICAgICAgbWVzc2FnZTogcm91dGUuZXJyb3JSZXNwb25zZU1lc3NhZ2UgfHwgUmF0ZUxpbWl0T3B0aW9ucy5lcnJvclJlc3BvbnNlTWVzc2FnZS5kZWZhdWx0LFxuICAgICAgaGFuZGxlcjogKHJlcXVlc3QsIHJlc3BvbnNlLCBuZXh0LCBvcHRpb25zKSA9PiB7XG4gICAgICAgIHRocm93IHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiBvcHRpb25zLm1lc3NhZ2UsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgc2tpcDogcmVxdWVzdCA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LmlwID09PSAnMTI3LjAuMC4xJyAmJiAhcm91dGUuaW5jbHVkZUludGVybmFsUmVxdWVzdHMpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUuaW5jbHVkZU1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUucmVxdWVzdE1ldGhvZHMpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyb3V0ZS5yZXF1ZXN0TWV0aG9kcykpIHtcbiAgICAgICAgICAgIGlmICghcm91dGUucmVxdWVzdE1ldGhvZHMuaW5jbHVkZXMocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKHJvdXRlLnJlcXVlc3RNZXRob2RzKTtcbiAgICAgICAgICAgIGlmICghcmVnRXhwLnRlc3QocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5hdXRoPy5pc01hc3RlcjtcbiAgICAgIH0sXG4gICAgICBrZXlHZW5lcmF0b3I6IGFzeW5jIHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocm91dGUuem9uZSA9PT0gUGFyc2UuU2VydmVyLlJhdGVMaW1pdFpvbmUuZ2xvYmFsKSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmFwcElkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRva2VuID0gcmVxdWVzdC5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnNlc3Npb24gJiYgdG9rZW4pIHtcbiAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnVzZXIgJiYgdG9rZW4pIHtcbiAgICAgICAgICBpZiAoIXJlcXVlc3QuYXV0aCkge1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBoYW5kbGVQYXJzZVNlc3Npb24ocmVxdWVzdCwgbnVsbCwgcmVzb2x2ZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVxdWVzdC5hdXRoPy51c2VyPy5pZCAmJiByZXF1ZXN0LnpvbmUgPT09ICd1c2VyJykge1xuICAgICAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aC51c2VyLmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5jb25maWcuaXA7XG4gICAgICB9LFxuICAgICAgc3RvcmU6IHJlZGlzU3RvcmUuc3RvcmUsXG4gICAgfSksXG4gICAgY2xvdWQsXG4gIH0pO1xuICBDb25maWcucHV0KGNvbmZpZyk7XG59O1xuXG4vKipcbiAqIERlZHVwbGljYXRlcyBhIHJlcXVlc3QgdG8gZW5zdXJlIGlkZW1wb3RlbmN5LiBEdXBsaWNhdGVzIGFyZSBkZXRlcm1pbmVkIGJ5IHRoZSByZXF1ZXN0IElEXG4gKiBpbiB0aGUgcmVxdWVzdCBoZWFkZXIuIElmIGEgcmVxdWVzdCBoYXMgbm8gcmVxdWVzdCBJRCwgaXQgaXMgZXhlY3V0ZWQgYW55d2F5LlxuICogQHBhcmFtIHsqfSByZXEgVGhlIHJlcXVlc3QgdG8gZXZhbHVhdGUuXG4gKiBAcmV0dXJucyBQcm9taXNlPHt9PlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5KHJlcSkge1xuICAvLyBFbmFibGUgZmVhdHVyZSBvbmx5IGZvciBNb25nb0RCXG4gIGlmIChcbiAgICAhKFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlciB8fFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlclxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIEdldCBwYXJhbWV0ZXJzXG4gIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gIGNvbnN0IHJlcXVlc3RJZCA9ICgocmVxIHx8IHt9KS5oZWFkZXJzIHx8IHt9KVsneC1wYXJzZS1yZXF1ZXN0LWlkJ107XG4gIGNvbnN0IHsgcGF0aHMsIHR0bCB9ID0gY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgaWYgKCFyZXF1ZXN0SWQgfHwgIWNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUmVxdWVzdCBwYXRoIG1heSBjb250YWluIHRyYWlsaW5nIHNsYXNoZXMsIGRlcGVuZGluZyBvbiB0aGUgb3JpZ2luYWwgcmVxdWVzdCwgc28gcmVtb3ZlXG4gIC8vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgdG8gbWFrZSBpdCBlYXNpZXIgdG8gc3BlY2lmeSBwYXRocyBpbiB0aGUgY29uZmlndXJhdGlvblxuICBjb25zdCByZXFQYXRoID0gcmVxLnBhdGgucmVwbGFjZSgvXlxcL3xcXC8kLywgJycpO1xuICAvLyBEZXRlcm1pbmUgd2hldGhlciBpZGVtcG90ZW5jeSBpcyBlbmFibGVkIGZvciBjdXJyZW50IHJlcXVlc3QgcGF0aFxuICBsZXQgbWF0Y2ggPSBmYWxzZTtcbiAgZm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG4gICAgLy8gQXNzdW1lIG9uZSB3YW50cyBhIHBhdGggdG8gYWx3YXlzIG1hdGNoIGZyb20gdGhlIGJlZ2lubmluZyB0byBwcmV2ZW50IGFueSBtaXN0YWtlc1xuICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXRoLmNoYXJBdCgwKSA9PT0gJ14nID8gcGF0aCA6ICdeJyArIHBhdGgpO1xuICAgIGlmIChyZXFQYXRoLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVHJ5IHRvIHN0b3JlIHJlcXVlc3RcbiAgY29uc3QgZXhwaXJ5RGF0ZSA9IG5ldyBEYXRlKG5ldyBEYXRlKCkuc2V0U2Vjb25kcyhuZXcgRGF0ZSgpLmdldFNlY29uZHMoKSArIHR0bCkpO1xuICByZXR1cm4gcmVzdFxuICAgIC5jcmVhdGUoY29uZmlnLCBhdXRoLm1hc3Rlcihjb25maWcpLCAnX0lkZW1wb3RlbmN5Jywge1xuICAgICAgcmVxSWQ6IHJlcXVlc3RJZCxcbiAgICAgIGV4cGlyZTogUGFyc2UuX2VuY29kZShleHBpcnlEYXRlKSxcbiAgICB9KVxuICAgIC5jYXRjaChlID0+IHtcbiAgICAgIGlmIChlLmNvZGUgPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfUkVRVUVTVCwgJ0R1cGxpY2F0ZSByZXF1ZXN0Jyk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMyk7XG4gIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWRcIn0nKTtcbn1cblxuZnVuY3Rpb24gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMCk7XG4gIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBlcnJvcjogJ0ludmFsaWQgb2JqZWN0IGZvciBjb250ZXh0LicgfSk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLE1BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLFVBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLEtBQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLG9CQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBUSx1QkFBQSxHQUFBVCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVMsaUJBQUEsR0FBQVYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFVLFlBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLGFBQUEsR0FBQVgsT0FBQTtBQUNBLElBQUFZLGVBQUEsR0FBQWIsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFhLE1BQUEsR0FBQWIsT0FBQTtBQUNBLElBQUFjLElBQUEsR0FBQWQsT0FBQTtBQUF3QyxTQUFBRCx1QkFBQWdCLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFFakMsTUFBTUcsdUJBQXVCLEdBQUFDLE9BQUEsQ0FB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QUFDLEtBQUssR0FBRyxHQUFHMUcsSUFBSSxHQUFHLEdBQUcsR0FBR0EsSUFBSSxDQUFDO0lBQ3BFLElBQUl1RyxPQUFPLENBQUN6RixLQUFLLENBQUMyRixLQUFLLENBQUMsRUFBRTtNQUN4QjNGLEtBQUssR0FBRyxJQUFJO01BQ1o7SUFDRjtFQUNGO0VBQ0EsSUFBSSxDQUFDQSxLQUFLLEVBQUU7SUFDVixPQUFPcEIsT0FBTyxDQUFDc0QsT0FBTyxDQUFDLENBQUM7RUFDMUI7RUFDQTtFQUNBLE1BQU0yRCxVQUFVLEdBQUcsSUFBSUMsSUFBSSxDQUFDLElBQUlBLElBQUksQ0FBQyxDQUFDLENBQUNDLFVBQVUsQ0FBQyxJQUFJRCxJQUFJLENBQUMsQ0FBQyxDQUFDRSxVQUFVLENBQUMsQ0FBQyxHQUFHVCxHQUFHLENBQUMsQ0FBQztFQUNqRixPQUFPVSxhQUFJLENBQ1JDLE1BQU0sQ0FBQzVKLE1BQU0sRUFBRWUsYUFBSSxDQUFDOEksTUFBTSxDQUFDN0osTUFBTSxDQUFDLEVBQUUsY0FBYyxFQUFFO0lBQ25EOEosS0FBSyxFQUFFZixTQUFTO0lBQ2hCZ0IsTUFBTSxFQUFFekosYUFBSyxDQUFDMEosT0FBTyxDQUFDVCxVQUFVO0VBQ2xDLENBQUMsQ0FBQyxDQUNEVSxLQUFLLENBQUN0UCxDQUFDLElBQUk7SUFDVixJQUFJQSxDQUFDLENBQUMwRixJQUFJLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDMkosZUFBZSxFQUFFO01BQ3pDLE1BQU0sSUFBSTVKLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQzRKLGlCQUFpQixFQUFFLG1CQUFtQixDQUFDO0lBQzNFO0lBQ0EsTUFBTXhQLENBQUM7RUFDVCxDQUFDLENBQUM7QUFDTjtBQUVBLFNBQVNrRSxjQUFjQSxDQUFDNUQsR0FBRyxFQUFFOEIsR0FBRyxFQUFFO0VBQ2hDQSxHQUFHLENBQUNvRCxNQUFNLENBQUMsR0FBRyxDQUFDO0VBQ2ZwRCxHQUFHLENBQUMwSSxHQUFHLENBQUMsMEJBQTBCLENBQUM7QUFDckM7QUFFQSxTQUFTaEksZ0JBQWdCQSxDQUFDeEMsR0FBRyxFQUFFOEIsR0FBRyxFQUFFO0VBQ2xDQSxHQUFHLENBQUNvRCxNQUFNLENBQUMsR0FBRyxDQUFDO0VBQ2ZwRCxHQUFHLENBQUNxRCxJQUFJLENBQUM7SUFBRUMsSUFBSSxFQUFFQyxhQUFLLENBQUNDLEtBQUssQ0FBQzZKLFlBQVk7SUFBRTNKLEtBQUssRUFBRTtFQUE4QixDQUFDLENBQUM7QUFDcEYiLCJpZ25vcmVMaXN0IjpbXX0=