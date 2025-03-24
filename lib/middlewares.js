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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiREVGQVVMVF9BTExPV0VEX0hFQURFUlMiLCJleHBvcnRzIiwiZ2V0TW91bnRGb3JSZXF1ZXN0IiwicmVxIiwibW91bnRQYXRoTGVuZ3RoIiwib3JpZ2luYWxVcmwiLCJsZW5ndGgiLCJ1cmwiLCJtb3VudFBhdGgiLCJzbGljZSIsInByb3RvY29sIiwiZ2V0IiwiZ2V0QmxvY2tMaXN0IiwiaXBSYW5nZUxpc3QiLCJzdG9yZSIsImJsb2NrTGlzdCIsIkJsb2NrTGlzdCIsImZvckVhY2giLCJmdWxsSXAiLCJzZXQiLCJpcCIsIm1hc2siLCJzcGxpdCIsImFkZEFkZHJlc3MiLCJpc0lQdjQiLCJhZGRTdWJuZXQiLCJOdW1iZXIiLCJjaGVja0lwIiwiaW5jb21pbmdJcElzVjQiLCJyZXN1bHQiLCJjaGVjayIsImluY2x1ZGVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicmVzIiwibmV4dCIsIm1vdW50IiwiY29udGV4dCIsIkpTT04iLCJwYXJzZSIsIk9iamVjdCIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJfcmVxJGNvbmZpZyIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJpc01hc3RlciIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleUlwc1N0b3JlIiwiX3JlcSRjb25maWcyIiwibWVzc2FnZSIsImhhbmRsZVJhdGVMaW1pdCIsImlzUmVhZE9ubHlNYXN0ZXIiLCJyZWFkT25seU1hc3RlcktleSIsImlzUmVhZE9ubHkiLCJrZXlzIiwib25lS2V5Q29uZmlndXJlZCIsInNvbWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJvbmVLZXlNYXRjaGVzIiwidXNlckZyb21KV1QiLCJ1c2VyIiwicmF0ZUxpbWl0cyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJsaW1pdCIsInBhdGhFeHAiLCJSZWdFeHAiLCJwYXRoIiwidGVzdCIsImhhbmRsZXIiLCJlcnIiLCJDT05ORUNUSU9OX0ZBSUxFRCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsInJlcXVlc3RBdXRoIiwiaW5kZXhPZiIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiVU5LTk9XTl9FUlJPUiIsImF1dGhvcml6YXRpb24iLCJoZWFkZXIiLCJhdXRoUHJlZml4IiwibWF0Y2giLCJ0b0xvd2VyQ2FzZSIsImVuY29kZWRBdXRoIiwic3Vic3RyaW5nIiwiY3JlZGVudGlhbHMiLCJkZWNvZGVCYXNlNjQiLCJqc0tleVByZWZpeCIsIm1hdGNoS2V5Iiwic3RyIiwiYWxsb3dDcm9zc0RvbWFpbiIsImFsbG93SGVhZGVycyIsImpvaW4iLCJiYXNlT3JpZ2lucyIsImFsbG93T3JpZ2luIiwicmVxdWVzdE9yaWdpbiIsIm9yaWdpbiIsImFsbG93T3JpZ2lucyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsInJlZGlzVXJsIiwiY2xpZW50IiwiY3JlYXRlQ2xpZW50IiwiaXNPcGVuIiwiY29ubmVjdCIsIl9jb25maWciLCJSZWRpc1N0b3JlIiwic2VuZENvbW1hbmQiLCJhcmdzIiwidHJhbnNmb3JtUGF0aCIsInJlcXVlc3RQYXRoIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJlc3BvbnNlIiwib3B0aW9ucyIsInNraXAiLCJfcmVxdWVzdCRhdXRoIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJ6b25lIiwiU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsImdsb2JhbCIsInRva2VuIiwic2Vzc2lvbiIsIl9yZXF1ZXN0JGF1dGgyIiwiaWQiLCJwdXQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInJlcXVlc3RJZCIsInBhdGhzIiwidHRsIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwicmVxUGF0aCIsInJlcGxhY2UiLCJyZWdleCIsImNoYXJBdCIsImV4cGlyeURhdGUiLCJEYXRlIiwic2V0U2Vjb25kcyIsImdldFNlY29uZHMiLCJyZXN0IiwiY3JlYXRlIiwibWFzdGVyIiwicmVxSWQiLCJleHBpcmUiLCJfZW5jb2RlIiwiY2F0Y2giLCJEVVBMSUNBVEVfVkFMVUUiLCJEVVBMSUNBVEVfUkVRVUVTVCIsIklOVkFMSURfSlNPTiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9taWRkbGV3YXJlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgYXV0aCBmcm9tICcuL0F1dGgnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgQ2xpZW50U0RLIGZyb20gJy4vQ2xpZW50U0RLJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9BTExPV0VEX0hFQURFUlMgPVxuICAnWC1QYXJzZS1NYXN0ZXItS2V5LCBYLVBhcnNlLVJFU1QtQVBJLUtleSwgWC1QYXJzZS1KYXZhc2NyaXB0LUtleSwgWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCwgWC1QYXJzZS1DbGllbnQtVmVyc2lvbiwgWC1QYXJzZS1TZXNzaW9uLVRva2VuLCBYLVJlcXVlc3RlZC1XaXRoLCBYLVBhcnNlLVJldm9jYWJsZS1TZXNzaW9uLCBYLVBhcnNlLVJlcXVlc3QtSWQsIENvbnRlbnQtVHlwZSwgUHJhZ21hLCBDYWNoZS1Db250cm9sJztcblxuY29uc3QgZ2V0TW91bnRGb3JSZXF1ZXN0ID0gZnVuY3Rpb24gKHJlcSkge1xuICBjb25zdCBtb3VudFBhdGhMZW5ndGggPSByZXEub3JpZ2luYWxVcmwubGVuZ3RoIC0gcmVxLnVybC5sZW5ndGg7XG4gIGNvbnN0IG1vdW50UGF0aCA9IHJlcS5vcmlnaW5hbFVybC5zbGljZSgwLCBtb3VudFBhdGhMZW5ndGgpO1xuICByZXR1cm4gcmVxLnByb3RvY29sICsgJzovLycgKyByZXEuZ2V0KCdob3N0JykgKyBtb3VudFBhdGg7XG59O1xuXG5jb25zdCBnZXRCbG9ja0xpc3QgPSAoaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGlmIChzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpKSB7IHJldHVybiBzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpOyB9XG4gIGNvbnN0IGJsb2NrTGlzdCA9IG5ldyBCbG9ja0xpc3QoKTtcbiAgaXBSYW5nZUxpc3QuZm9yRWFjaChmdWxsSXAgPT4ge1xuICAgIGlmIChmdWxsSXAgPT09ICc6Oi8wJyB8fCBmdWxsSXAgPT09ICc6OicpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY2JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChmdWxsSXAgPT09ICcwLjAuMC4wLzAnIHx8IGZ1bGxJcCA9PT0gJzAuMC4wLjAnKSB7XG4gICAgICBzdG9yZS5zZXQoJ2FsbG93QWxsSXB2NCcsIHRydWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBbaXAsIG1hc2tdID0gZnVsbElwLnNwbGl0KCcvJyk7XG4gICAgaWYgKCFtYXNrKSB7XG4gICAgICBibG9ja0xpc3QuYWRkQWRkcmVzcyhpcCwgaXNJUHY0KGlwKSA/ICdpcHY0JyA6ICdpcHY2Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRTdWJuZXQoaXAsIE51bWJlcihtYXNrKSwgaXNJUHY0KGlwKSA/ICdpcHY0JyA6ICdpcHY2Jyk7XG4gICAgfVxuICB9KTtcbiAgc3RvcmUuc2V0KCdibG9ja0xpc3QnLCBibG9ja0xpc3QpO1xuICByZXR1cm4gYmxvY2tMaXN0O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrSXAgPSAoaXAsIGlwUmFuZ2VMaXN0LCBzdG9yZSkgPT4ge1xuICBjb25zdCBpbmNvbWluZ0lwSXNWNCA9IGlzSVB2NChpcCk7XG4gIGNvbnN0IGJsb2NrTGlzdCA9IGdldEJsb2NrTGlzdChpcFJhbmdlTGlzdCwgc3RvcmUpO1xuXG4gIGlmIChzdG9yZS5nZXQoaXApKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NCcpICYmIGluY29taW5nSXBJc1Y0KSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NicpICYmICFpbmNvbWluZ0lwSXNWNCkgeyByZXR1cm4gdHJ1ZTsgfVxuICBjb25zdCByZXN1bHQgPSBibG9ja0xpc3QuY2hlY2soaXAsIGluY29taW5nSXBJc1Y0ID8gJ2lwdjQnIDogJ2lwdjYnKTtcblxuICAvLyBJZiB0aGUgaXAgaXMgaW4gdGhlIGxpc3QsIHdlIHN0b3JlIHRoZSByZXN1bHQgaW4gdGhlIHN0b3JlXG4gIC8vIHNvIHdlIGhhdmUgYSBvcHRpbWl6ZWQgcGF0aCBmb3IgdGhlIG5leHQgcmVxdWVzdFxuICBpZiAoaXBSYW5nZUxpc3QuaW5jbHVkZXMoaXApICYmIHJlc3VsdCkge1xuICAgIHN0b3JlLnNldChpcCwgcmVzdWx0KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLy8gQ2hlY2tzIHRoYXQgdGhlIHJlcXVlc3QgaXMgYXV0aG9yaXplZCBmb3IgdGhpcyBhcHAgYW5kIGNoZWNrcyB1c2VyXG4vLyBhdXRoIHRvby5cbi8vIFRoZSBib2R5cGFyc2VyIHNob3VsZCBydW4gYmVmb3JlIHRoaXMgbWlkZGxld2FyZS5cbi8vIEFkZHMgaW5mbyB0byB0aGUgcmVxdWVzdDpcbi8vIHJlcS5jb25maWcgLSB0aGUgQ29uZmlnIGZvciB0aGlzIGFwcFxuLy8gcmVxLmF1dGggLSB0aGUgQXV0aCBmb3IgdGhpcyByZXF1ZXN0XG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlUGFyc2VIZWFkZXJzKHJlcSwgcmVzLCBuZXh0KSB7XG4gIHZhciBtb3VudCA9IGdldE1vdW50Rm9yUmVxdWVzdChyZXEpO1xuXG4gIGxldCBjb250ZXh0ID0ge307XG4gIGlmIChyZXEuZ2V0KCdYLVBhcnNlLUNsb3VkLUNvbnRleHQnKSAhPSBudWxsKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpKTtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoY29udGV4dCkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgIHRocm93ICdDb250ZXh0IGlzIG5vdCBhbiBvYmplY3QnO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cbiAgdmFyIGluZm8gPSB7XG4gICAgYXBwSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtQXBwbGljYXRpb24tSWQnKSxcbiAgICBzZXNzaW9uVG9rZW46IHJlcS5nZXQoJ1gtUGFyc2UtU2Vzc2lvbi1Ub2tlbicpLFxuICAgIG1hc3RlcktleTogcmVxLmdldCgnWC1QYXJzZS1NYXN0ZXItS2V5JyksXG4gICAgbWFpbnRlbmFuY2VLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFpbnRlbmFuY2UtS2V5JyksXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtSW5zdGFsbGF0aW9uLUlkJyksXG4gICAgY2xpZW50S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1LZXknKSxcbiAgICBqYXZhc2NyaXB0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUphdmFzY3JpcHQtS2V5JyksXG4gICAgZG90TmV0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLVdpbmRvd3MtS2V5JyksXG4gICAgcmVzdEFQSUtleTogcmVxLmdldCgnWC1QYXJzZS1SRVNULUFQSS1LZXknKSxcbiAgICBjbGllbnRWZXJzaW9uOiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1WZXJzaW9uJyksXG4gICAgY29udGV4dDogY29udGV4dCxcbiAgfTtcblxuICB2YXIgYmFzaWNBdXRoID0gaHR0cEF1dGgocmVxKTtcblxuICBpZiAoYmFzaWNBdXRoKSB7XG4gICAgdmFyIGJhc2ljQXV0aEFwcElkID0gYmFzaWNBdXRoLmFwcElkO1xuICAgIGlmIChBcHBDYWNoZS5nZXQoYmFzaWNBdXRoQXBwSWQpKSB7XG4gICAgICBpbmZvLmFwcElkID0gYmFzaWNBdXRoQXBwSWQ7XG4gICAgICBpbmZvLm1hc3RlcktleSA9IGJhc2ljQXV0aC5tYXN0ZXJLZXkgfHwgaW5mby5tYXN0ZXJLZXk7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSBiYXNpY0F1dGguamF2YXNjcmlwdEtleSB8fCBpbmZvLmphdmFzY3JpcHRLZXk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlcS5ib2R5KSB7XG4gICAgLy8gVW5pdHkgU0RLIHNlbmRzIGEgX25vQm9keSBrZXkgd2hpY2ggbmVlZHMgdG8gYmUgcmVtb3ZlZC5cbiAgICAvLyBVbmNsZWFyIGF0IHRoaXMgcG9pbnQgaWYgYWN0aW9uIG5lZWRzIHRvIGJlIHRha2VuLlxuICAgIGRlbGV0ZSByZXEuYm9keS5fbm9Cb2R5O1xuICB9XG5cbiAgdmFyIGZpbGVWaWFKU09OID0gZmFsc2U7XG5cbiAgaWYgKCFpbmZvLmFwcElkIHx8ICFBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCkpIHtcbiAgICAvLyBTZWUgaWYgd2UgY2FuIGZpbmQgdGhlIGFwcCBpZCBvbiB0aGUgYm9keS5cbiAgICBpZiAocmVxLmJvZHkgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgIC8vIFRoZSBvbmx5IGNoYW5jZSB0byBmaW5kIHRoZSBhcHAgaWQgaXMgaWYgdGhpcyBpcyBhIGZpbGVcbiAgICAgIC8vIHVwbG9hZCB0aGF0IGFjdHVhbGx5IGlzIGEgSlNPTiBib2R5LiBTbyB0cnkgdG8gcGFyc2UgaXQuXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvNjU4OVxuICAgICAgLy8gSXQgaXMgYWxzbyBwb3NzaWJsZSB0aGF0IHRoZSBjbGllbnQgaXMgdHJ5aW5nIHRvIHVwbG9hZCBhIGZpbGUgYnV0IGZvcmdvdFxuICAgICAgLy8gdG8gcHJvdmlkZSB4LXBhcnNlLWFwcC1pZCBpbiBoZWFkZXIgYW5kIHBhcnNlIGEgYmluYXJ5IGZpbGUgd2lsbCBmYWlsXG4gICAgICB0cnkge1xuICAgICAgICByZXEuYm9keSA9IEpTT04ucGFyc2UocmVxLmJvZHkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgfVxuICAgICAgZmlsZVZpYUpTT04gPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXEuYm9keSkge1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9SZXZvY2FibGVTZXNzaW9uO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHJlcS5ib2R5ICYmXG4gICAgICByZXEuYm9keS5fQXBwbGljYXRpb25JZCAmJlxuICAgICAgQXBwQ2FjaGUuZ2V0KHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkKSAmJlxuICAgICAgKCFpbmZvLm1hc3RlcktleSB8fCBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpLm1hc3RlcktleSA9PT0gaW5mby5tYXN0ZXJLZXkpXG4gICAgKSB7XG4gICAgICBpbmZvLmFwcElkID0gcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQ7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSByZXEuYm9keS5fSmF2YVNjcmlwdEtleSB8fCAnJztcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fSmF2YVNjcmlwdEtleTtcbiAgICAgIC8vIFRPRE86IHRlc3QgdGhhdCB0aGUgUkVTVCBBUEkgZm9ybWF0cyBnZW5lcmF0ZWQgYnkgdGhlIG90aGVyXG4gICAgICAvLyBTREtzIGFyZSBoYW5kbGVkIG9rXG4gICAgICBpZiAocmVxLmJvZHkuX0NsaWVudFZlcnNpb24pIHtcbiAgICAgICAgaW5mby5jbGllbnRWZXJzaW9uID0gcmVxLmJvZHkuX0NsaWVudFZlcnNpb247XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgaW5mby5pbnN0YWxsYXRpb25JZCA9IHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fU2Vzc2lvblRva2VuKSB7XG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX01hc3RlcktleSkge1xuICAgICAgICBpbmZvLm1hc3RlcktleSA9IHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0KSB7XG4gICAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgIGluZm8uY29udGV4dCA9IHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpbmZvLmNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5ib2R5Ll9jb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoaW5mby5jb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0NvbnRlbnRUeXBlKSB7XG4gICAgICAgIHJlcS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cbiAgaWYgKGluZm8uc2Vzc2lvblRva2VuICYmIHR5cGVvZiBpbmZvLnNlc3Npb25Ub2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IGluZm8uc2Vzc2lvblRva2VuLnRvU3RyaW5nKCk7XG4gIH1cblxuICBpZiAoaW5mby5jbGllbnRWZXJzaW9uKSB7XG4gICAgaW5mby5jbGllbnRTREsgPSBDbGllbnRTREsuZnJvbVN0cmluZyhpbmZvLmNsaWVudFZlcnNpb24pO1xuICB9XG5cbiAgaWYgKGZpbGVWaWFKU09OKSB7XG4gICAgcmVxLmZpbGVEYXRhID0gcmVxLmJvZHkuZmlsZURhdGE7XG4gICAgLy8gV2UgbmVlZCB0byByZXBvcHVsYXRlIHJlcS5ib2R5IHdpdGggYSBidWZmZXJcbiAgICB2YXIgYmFzZTY0ID0gcmVxLmJvZHkuYmFzZTY0O1xuICAgIHJlcS5ib2R5ID0gQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0Jyk7XG4gIH1cblxuICBjb25zdCBjbGllbnRJcCA9IGdldENsaWVudElwKHJlcSk7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoaW5mby5hcHBJZCwgbW91bnQpO1xuICBpZiAoY29uZmlnLnN0YXRlICYmIGNvbmZpZy5zdGF0ZSAhPT0gJ29rJykge1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBlcnJvcjogYEludmFsaWQgc2VydmVyIHN0YXRlOiAke2NvbmZpZy5zdGF0ZX1gLFxuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGluZm8uYXBwID0gQXBwQ2FjaGUuZ2V0KGluZm8uYXBwSWQpO1xuICByZXEuY29uZmlnID0gY29uZmlnO1xuICByZXEuY29uZmlnLmhlYWRlcnMgPSByZXEuaGVhZGVycyB8fCB7fTtcbiAgcmVxLmNvbmZpZy5pcCA9IGNsaWVudElwO1xuICByZXEuaW5mbyA9IGluZm87XG5cbiAgY29uc3QgaXNNYWludGVuYW5jZSA9XG4gICAgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleSAmJiBpbmZvLm1haW50ZW5hbmNlS2V5ID09PSByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5O1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlmIChjaGVja0lwKGNsaWVudElwLCByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzU3RvcmUpKSB7XG4gICAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBpc01haW50ZW5hbmNlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYWludGVuYW5jZSBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFpbnRlbmFuY2VLZXlJcHMnLmBcbiAgICApO1xuICB9XG5cbiAgbGV0IGlzTWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcubWFzdGVyS2V5O1xuXG4gIGlmIChpc01hc3RlciAmJiAhY2hlY2tJcChjbGllbnRJcCwgcmVxLmNvbmZpZy5tYXN0ZXJLZXlJcHMgfHwgW10sIHJlcS5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUpKSB7XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1hc3RlciBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFzdGVyS2V5SXBzJy5gXG4gICAgKTtcbiAgICBpc01hc3RlciA9IGZhbHNlO1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSBgdW5hdXRob3JpemVkYDtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgdmFyIGlzUmVhZE9ubHlNYXN0ZXIgPSBpbmZvLm1hc3RlcktleSA9PT0gcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleTtcbiAgaWYgKFxuICAgIHR5cGVvZiByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICE9ICd1bmRlZmluZWQnICYmXG4gICAgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAmJlxuICAgIGlzUmVhZE9ubHlNYXN0ZXJcbiAgKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgICBpc1JlYWRPbmx5OiB0cnVlLFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgLy8gQ2xpZW50IGtleXMgYXJlIG5vdCByZXF1aXJlZCBpbiBwYXJzZS1zZXJ2ZXIsIGJ1dCBpZiBhbnkgaGF2ZSBiZWVuIGNvbmZpZ3VyZWQgaW4gdGhlIHNlcnZlciwgdmFsaWRhdGUgdGhlbVxuICAvLyAgdG8gcHJlc2VydmUgb3JpZ2luYWwgYmVoYXZpb3IuXG4gIGNvbnN0IGtleXMgPSBbJ2NsaWVudEtleScsICdqYXZhc2NyaXB0S2V5JywgJ2RvdE5ldEtleScsICdyZXN0QVBJS2V5J107XG4gIGNvbnN0IG9uZUtleUNvbmZpZ3VyZWQgPSBrZXlzLnNvbWUoZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiByZXEuY29uZmlnW2tleV0gIT09IHVuZGVmaW5lZDtcbiAgfSk7XG4gIGNvbnN0IG9uZUtleU1hdGNoZXMgPSBrZXlzLnNvbWUoZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiByZXEuY29uZmlnW2tleV0gIT09IHVuZGVmaW5lZCAmJiBpbmZvW2tleV0gPT09IHJlcS5jb25maWdba2V5XTtcbiAgfSk7XG5cbiAgaWYgKG9uZUtleUNvbmZpZ3VyZWQgJiYgIW9uZUtleU1hdGNoZXMpIHtcbiAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICB9XG5cbiAgaWYgKHJlcS51cmwgPT0gJy9sb2dpbicpIHtcbiAgICBkZWxldGUgaW5mby5zZXNzaW9uVG9rZW47XG4gIH1cblxuICBpZiAocmVxLnVzZXJGcm9tSldUKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgdXNlcjogcmVxLnVzZXJGcm9tSldULFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgaWYgKCFpbmZvLnNlc3Npb25Ub2tlbikge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICB9KTtcbiAgfVxuICBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xufVxuXG5jb25zdCBoYW5kbGVSYXRlTGltaXQgPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgY29uc3QgcmF0ZUxpbWl0cyA9IHJlcS5jb25maWcucmF0ZUxpbWl0cyB8fCBbXTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIHJhdGVMaW1pdHMubWFwKGFzeW5jIGxpbWl0ID0+IHtcbiAgICAgICAgY29uc3QgcGF0aEV4cCA9IG5ldyBSZWdFeHAobGltaXQucGF0aCk7XG4gICAgICAgIGlmIChwYXRoRXhwLnRlc3QocmVxLnVybCkpIHtcbiAgICAgICAgICBhd2FpdCBsaW1pdC5oYW5kbGVyKHJlcSwgcmVzLCBlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcihcbiAgICAgICAgICAgICAgICAnQW4gdW5rbm93biBlcnJvciBvY2N1cmVkIHdoZW4gYXR0ZW1wdGluZyB0byBhcHBseSB0aGUgcmF0ZSBsaW1pdGVyOiAnLFxuICAgICAgICAgICAgICAgIGVyclxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmVzLnN0YXR1cyg0MjkpO1xuICAgIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICBuZXh0KCk7XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlUGFyc2VTZXNzaW9uID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgaW5mbyA9IHJlcS5pbmZvO1xuICAgIGlmIChyZXEuYXV0aCB8fCByZXEudXJsID09PSAnL3Nlc3Npb25zL21lJykge1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgcmVxdWVzdEF1dGggPSBudWxsO1xuICAgIGlmIChcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuICYmXG4gICAgICByZXEudXJsID09PSAnL3VwZ3JhZGVUb1Jldm9jYWJsZVNlc3Npb24nICYmXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbi5pbmRleE9mKCdyOicpICE9IDBcbiAgICApIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmVxLmF1dGggPSByZXF1ZXN0QXV0aDtcbiAgICBuZXh0KCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBUT0RPOiBEZXRlcm1pbmUgdGhlIGNvcnJlY3QgZXJyb3Igc2NlbmFyaW8uXG4gICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKCdlcnJvciBnZXR0aW5nIGF1dGggZm9yIHNlc3Npb25Ub2tlbicsIGVycm9yKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVU5LTk9XTl9FUlJPUiwgZXJyb3IpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBnZXRDbGllbnRJcChyZXEpIHtcbiAgcmV0dXJuIHJlcS5pcDtcbn1cblxuZnVuY3Rpb24gaHR0cEF1dGgocmVxKSB7XG4gIGlmICghKHJlcS5yZXEgfHwgcmVxKS5oZWFkZXJzLmF1dGhvcml6YXRpb24pIHsgcmV0dXJuOyB9XG5cbiAgdmFyIGhlYWRlciA9IChyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uO1xuICB2YXIgYXBwSWQsIG1hc3RlcktleSwgamF2YXNjcmlwdEtleTtcblxuICAvLyBwYXJzZSBoZWFkZXJcbiAgdmFyIGF1dGhQcmVmaXggPSAnYmFzaWMgJztcblxuICB2YXIgbWF0Y2ggPSBoZWFkZXIudG9Mb3dlckNhc2UoKS5pbmRleE9mKGF1dGhQcmVmaXgpO1xuXG4gIGlmIChtYXRjaCA9PSAwKSB7XG4gICAgdmFyIGVuY29kZWRBdXRoID0gaGVhZGVyLnN1YnN0cmluZyhhdXRoUHJlZml4Lmxlbmd0aCwgaGVhZGVyLmxlbmd0aCk7XG4gICAgdmFyIGNyZWRlbnRpYWxzID0gZGVjb2RlQmFzZTY0KGVuY29kZWRBdXRoKS5zcGxpdCgnOicpO1xuXG4gICAgaWYgKGNyZWRlbnRpYWxzLmxlbmd0aCA9PSAyKSB7XG4gICAgICBhcHBJZCA9IGNyZWRlbnRpYWxzWzBdO1xuICAgICAgdmFyIGtleSA9IGNyZWRlbnRpYWxzWzFdO1xuXG4gICAgICB2YXIganNLZXlQcmVmaXggPSAnamF2YXNjcmlwdC1rZXk9JztcblxuICAgICAgdmFyIG1hdGNoS2V5ID0ga2V5LmluZGV4T2YoanNLZXlQcmVmaXgpO1xuICAgICAgaWYgKG1hdGNoS2V5ID09IDApIHtcbiAgICAgICAgamF2YXNjcmlwdEtleSA9IGtleS5zdWJzdHJpbmcoanNLZXlQcmVmaXgubGVuZ3RoLCBrZXkubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1hc3RlcktleSA9IGtleTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBhcHBJZDogYXBwSWQsIG1hc3RlcktleTogbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5OiBqYXZhc2NyaXB0S2V5IH07XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NChzdHIpIHtcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0ciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd0Nyb3NzRG9tYWluKGFwcElkKSB7XG4gIHJldHVybiAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGFwcElkLCBnZXRNb3VudEZvclJlcXVlc3QocmVxKSk7XG4gICAgbGV0IGFsbG93SGVhZGVycyA9IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTO1xuICAgIGlmIChjb25maWcgJiYgY29uZmlnLmFsbG93SGVhZGVycykge1xuICAgICAgYWxsb3dIZWFkZXJzICs9IGAsICR7Y29uZmlnLmFsbG93SGVhZGVycy5qb2luKCcsICcpfWA7XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZU9yaWdpbnMgPVxuICAgICAgdHlwZW9mIGNvbmZpZz8uYWxsb3dPcmlnaW4gPT09ICdzdHJpbmcnID8gW2NvbmZpZy5hbGxvd09yaWdpbl0gOiBjb25maWc/LmFsbG93T3JpZ2luID8/IFsnKiddO1xuICAgIGNvbnN0IHJlcXVlc3RPcmlnaW4gPSByZXEuaGVhZGVycy5vcmlnaW47XG4gICAgY29uc3QgYWxsb3dPcmlnaW5zID1cbiAgICAgIHJlcXVlc3RPcmlnaW4gJiYgYmFzZU9yaWdpbnMuaW5jbHVkZXMocmVxdWVzdE9yaWdpbikgPyByZXF1ZXN0T3JpZ2luIDogYmFzZU9yaWdpbnNbMF07XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgYWxsb3dPcmlnaW5zKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCxQVVQsUE9TVCxERUxFVEUsT1BUSU9OUycpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCBhbGxvd0hlYWRlcnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUV4cG9zZS1IZWFkZXJzJywgJ1gtUGFyc2UtSm9iLVN0YXR1cy1JZCwgWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCcpO1xuICAgIC8vIGludGVyY2VwdCBPUFRJT05TIG1ldGhvZFxuICAgIGlmICgnT1BUSU9OUycgPT0gcmVxLm1ldGhvZCkge1xuICAgICAgcmVzLnNlbmRTdGF0dXMoMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93TWV0aG9kT3ZlcnJpZGUocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiByZXEuYm9keS5fbWV0aG9kKSB7XG4gICAgcmVxLm9yaWdpbmFsTWV0aG9kID0gcmVxLm1ldGhvZDtcbiAgICByZXEubWV0aG9kID0gcmVxLmJvZHkuX21ldGhvZDtcbiAgICBkZWxldGUgcmVxLmJvZHkuX21ldGhvZDtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUVycm9ycyhlcnIsIHJlcSwgcmVzLCBuZXh0KSB7XG4gIGNvbnN0IGxvZyA9IChyZXEuY29uZmlnICYmIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlcikgfHwgZGVmYXVsdExvZ2dlcjtcbiAgaWYgKGVyciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgaWYgKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5lbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyKSB7XG4gICAgICByZXR1cm4gbmV4dChlcnIpO1xuICAgIH1cbiAgICBsZXQgaHR0cFN0YXR1cztcbiAgICAvLyBUT0RPOiBmaWxsIG91dCB0aGlzIG1hcHBpbmdcbiAgICBzd2l0Y2ggKGVyci5jb2RlKSB7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUjpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDUwMDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwMDtcbiAgICB9XG4gICAgcmVzLnN0YXR1cyhodHRwU3RhdHVzKTtcbiAgICByZXMuanNvbih7IGNvZGU6IGVyci5jb2RlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgbG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyKTtcbiAgfSBlbHNlIGlmIChlcnIuc3RhdHVzICYmIGVyci5tZXNzYWdlKSB7XG4gICAgcmVzLnN0YXR1cyhlcnIuc3RhdHVzKTtcbiAgICByZXMuanNvbih7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVyciwgZXJyLnN0YWNrKTtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgbWVzc2FnZTogJ0ludGVybmFsIHNlcnZlciBlcnJvci4nLFxuICAgIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkXCJ9Jyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0LmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5leHBvcnQgY29uc3QgYWRkUmF0ZUxpbWl0ID0gKHJvdXRlLCBjb25maWcsIGNsb3VkKSA9PiB7XG4gIGlmICh0eXBlb2YgY29uZmlnID09PSAnc3RyaW5nJykge1xuICAgIGNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiByb3V0ZSkge1xuICAgIGlmICghUmF0ZUxpbWl0T3B0aW9uc1trZXldKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCByYXRlIGxpbWl0IG9wdGlvbiBcIiR7a2V5fVwiYDtcbiAgICB9XG4gIH1cbiAgaWYgKCFjb25maWcucmF0ZUxpbWl0cykge1xuICAgIGNvbmZpZy5yYXRlTGltaXRzID0gW107XG4gIH1cbiAgY29uc3QgcmVkaXNTdG9yZSA9IHtcbiAgICBjb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKCksXG4gICAgc3RvcmU6IG51bGwsXG4gIH07XG4gIGlmIChyb3V0ZS5yZWRpc1VybCkge1xuICAgIGNvbnN0IGNsaWVudCA9IGNyZWF0ZUNsaWVudCh7XG4gICAgICB1cmw6IHJvdXRlLnJlZGlzVXJsLFxuICAgIH0pO1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoY2xpZW50LmlzT3Blbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zdCBsb2cgPSBjb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICAgICAgbG9nLmVycm9yKGBDb3VsZCBub3QgY29ubmVjdCB0byByZWRpc1VSTCBpbiByYXRlIGxpbWl0OiAke2V9YCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgcmVkaXNTdG9yZS5zdG9yZSA9IG5ldyBSZWRpc1N0b3JlKHtcbiAgICAgIHNlbmRDb21tYW5kOiBhc3luYyAoLi4uYXJncykgPT4ge1xuICAgICAgICBhd2FpdCByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2VuZENvbW1hbmQoYXJncyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIGxldCB0cmFuc2Zvcm1QYXRoID0gcm91dGUucmVxdWVzdFBhdGguc3BsaXQoJy8qJykuam9pbignLyguKiknKTtcbiAgaWYgKHRyYW5zZm9ybVBhdGggPT09ICcqJykge1xuICAgIHRyYW5zZm9ybVBhdGggPSAnKC4qKSc7XG4gIH1cbiAgY29uZmlnLnJhdGVMaW1pdHMucHVzaCh7XG4gICAgcGF0aDogcGF0aFRvUmVnZXhwKHRyYW5zZm9ybVBhdGgpLFxuICAgIGhhbmRsZXI6IHJhdGVMaW1pdCh7XG4gICAgICB3aW5kb3dNczogcm91dGUucmVxdWVzdFRpbWVXaW5kb3csXG4gICAgICBtYXg6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICAgIG1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICAgIGhhbmRsZXI6IChyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCwgb3B0aW9ucykgPT4ge1xuICAgICAgICB0aHJvdyB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogb3B0aW9ucy5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHNraXA6IHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5pcCA9PT0gJzEyNy4wLjAuMScgJiYgIXJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnJlcXVlc3RNZXRob2RzKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocm91dGUucmVxdWVzdE1ldGhvZHMpKSB7XG4gICAgICAgICAgICBpZiAoIXJvdXRlLnJlcXVlc3RNZXRob2RzLmluY2x1ZGVzKHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChyb3V0ZS5yZXF1ZXN0TWV0aG9kcyk7XG4gICAgICAgICAgICBpZiAoIXJlZ0V4cC50ZXN0KHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aD8uaXNNYXN0ZXI7XG4gICAgICB9LFxuICAgICAga2V5R2VuZXJhdG9yOiBhc3luYyByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLmdsb2JhbCkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5hcHBJZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b2tlbiA9IHJlcXVlc3QuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS5zZXNzaW9uICYmIHRva2VuKSB7XG4gICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS51c2VyICYmIHRva2VuKSB7XG4gICAgICAgICAgaWYgKCFyZXF1ZXN0LmF1dGgpIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlUGFyc2VTZXNzaW9uKHJlcXVlc3QsIG51bGwsIHJlc29sdmUpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlcXVlc3QuYXV0aD8udXNlcj8uaWQgJiYgcmVxdWVzdC56b25lID09PSAndXNlcicpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGgudXNlci5pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmlwO1xuICAgICAgfSxcbiAgICAgIHN0b3JlOiByZWRpc1N0b3JlLnN0b3JlLFxuICAgIH0pLFxuICAgIGNsb3VkLFxuICB9KTtcbiAgQ29uZmlnLnB1dChjb25maWcpO1xufTtcblxuLyoqXG4gKiBEZWR1cGxpY2F0ZXMgYSByZXF1ZXN0IHRvIGVuc3VyZSBpZGVtcG90ZW5jeS4gRHVwbGljYXRlcyBhcmUgZGV0ZXJtaW5lZCBieSB0aGUgcmVxdWVzdCBJRFxuICogaW4gdGhlIHJlcXVlc3QgaGVhZGVyLiBJZiBhIHJlcXVlc3QgaGFzIG5vIHJlcXVlc3QgSUQsIGl0IGlzIGV4ZWN1dGVkIGFueXdheS5cbiAqIEBwYXJhbSB7Kn0gcmVxIFRoZSByZXF1ZXN0IHRvIGV2YWx1YXRlLlxuICogQHJldHVybnMgUHJvbWlzZTx7fT5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeShyZXEpIHtcbiAgLy8gRW5hYmxlIGZlYXR1cmUgb25seSBmb3IgTW9uZ29EQlxuICBpZiAoXG4gICAgIShcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXIgfHxcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXJcbiAgICApXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBHZXQgcGFyYW1ldGVyc1xuICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICBjb25zdCByZXF1ZXN0SWQgPSAoKHJlcSB8fCB7fSkuaGVhZGVycyB8fCB7fSlbJ3gtcGFyc2UtcmVxdWVzdC1pZCddO1xuICBjb25zdCB7IHBhdGhzLCB0dGwgfSA9IGNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gIGlmICghcmVxdWVzdElkIHx8ICFjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFJlcXVlc3QgcGF0aCBtYXkgY29udGFpbiB0cmFpbGluZyBzbGFzaGVzLCBkZXBlbmRpbmcgb24gdGhlIG9yaWdpbmFsIHJlcXVlc3QsIHNvIHJlbW92ZVxuICAvLyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIHRvIG1ha2UgaXQgZWFzaWVyIHRvIHNwZWNpZnkgcGF0aHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgY29uc3QgcmVxUGF0aCA9IHJlcS5wYXRoLnJlcGxhY2UoL15cXC98XFwvJC8sICcnKTtcbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgaWRlbXBvdGVuY3kgaXMgZW5hYmxlZCBmb3IgY3VycmVudCByZXF1ZXN0IHBhdGhcbiAgbGV0IG1hdGNoID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuICAgIC8vIEFzc3VtZSBvbmUgd2FudHMgYSBwYXRoIHRvIGFsd2F5cyBtYXRjaCBmcm9tIHRoZSBiZWdpbm5pbmcgdG8gcHJldmVudCBhbnkgbWlzdGFrZXNcbiAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0aC5jaGFyQXQoMCkgPT09ICdeJyA/IHBhdGggOiAnXicgKyBwYXRoKTtcbiAgICBpZiAocmVxUGF0aC5tYXRjaChyZWdleCkpIHtcbiAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFRyeSB0byBzdG9yZSByZXF1ZXN0XG4gIGNvbnN0IGV4cGlyeURhdGUgPSBuZXcgRGF0ZShuZXcgRGF0ZSgpLnNldFNlY29uZHMobmV3IERhdGUoKS5nZXRTZWNvbmRzKCkgKyB0dGwpKTtcbiAgcmV0dXJuIHJlc3RcbiAgICAuY3JlYXRlKGNvbmZpZywgYXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19JZGVtcG90ZW5jeScsIHtcbiAgICAgIHJlcUlkOiByZXF1ZXN0SWQsXG4gICAgICBleHBpcmU6IFBhcnNlLl9lbmNvZGUoZXhwaXJ5RGF0ZSksXG4gICAgfSlcbiAgICAuY2F0Y2goZSA9PiB7XG4gICAgICBpZiAoZS5jb2RlID09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1JFUVVFU1QsICdEdXBsaWNhdGUgcmVxdWVzdCcpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDMpO1xuICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkXCJ9Jyk7XG59XG5cbmZ1bmN0aW9uIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDApO1xuICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgZXJyb3I6ICdJbnZhbGlkIG9iamVjdCBmb3IgY29udGV4dC4nIH0pO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxLQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxVQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxvQkFBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsdUJBQUEsR0FBQVQsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFTLGlCQUFBLEdBQUFWLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVSxZQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxhQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxlQUFBLEdBQUFiLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBYSxNQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxJQUFBLEdBQUFkLE9BQUE7QUFBd0MsU0FBQUQsdUJBQUFnQixDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRWpDLE1BQU1HLHVCQUF1QixHQUFBQyxPQUFBLENBQUFELHVCQUFBLEdBQ2xDLCtPQUErTztBQUVqUCxNQUFNRSxrQkFBa0IsR0FBRyxTQUFBQSxDQUFVQyxHQUFHLEVBQUU7RUFDeEMsTUFBTUMsZUFBZSxHQUFHRCxHQUFHLENBQUNFLFdBQVcsQ0FBQ0MsTUFBTSxHQUFHSCxHQUFHLENB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