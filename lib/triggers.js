"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = void 0;
exports._unregisterAll = _unregisterAll;
exports.addConnectTrigger = addConnectTrigger;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.addTrigger = addTrigger;
exports.getClassName = getClassName;
exports.getFunction = getFunction;
exports.getFunctionNames = getFunctionNames;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getRequestFileObject = getRequestFileObject;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.getTrigger = getTrigger;
exports.getValidator = getValidator;
exports.inflate = inflate;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.maybeRunGlobalConfigTrigger = maybeRunGlobalConfigTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.maybeRunValidator = maybeRunValidator;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports.resolveError = resolveError;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.runTrigger = runTrigger;
exports.toJSONwithObjects = toJSONwithObjects;
exports.triggerExists = triggerExists;
var _node = _interopRequireDefault(require("parse/node"));
var _logger = require("./logger");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // triggers.js
const Types = exports.Types = {
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent'
};
const ConnectClassName = '@Connect';
const baseStore = function () {
  const Validators = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  const Functions = {};
  const Jobs = {};
  const LiveQuery = [];
  const Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  return Object.freeze({
    Functions,
    Jobs,
    Validators,
    Triggers,
    LiveQuery
  });
};
function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  if (parseClass && parseClass.name) {
    return parseClass.name.replace('Parse', '@');
  }
  return parseClass;
}
function validateClassNameForTriggers(className, type) {
  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }
  if ((type === Types.beforeLogin || type === Types.afterLogin) && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin and afterLogin triggers';
  }
  if (type === Types.afterLogout && className !== '_Session') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _Session class is allowed for the afterLogout trigger.';
  }
  if (className === '_Session' && type !== Types.afterLogout) {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the afterLogout trigger is allowed for the _Session class.';
  }
  return className;
}
const _triggerStore = {};
const Category = {
  Functions: 'Functions',
  Validators: 'Validators',
  Jobs: 'Jobs',
  Triggers: 'Triggers'
};
function getStore(category, name, applicationId) {
  const invalidNameRegex = /['"`]/;
  if (invalidNameRegex.test(name)) {
    // Prevent a malicious user from injecting properties into the store
    return {};
  }
  const path = name.split('.');
  path.splice(-1); // remove last component
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];
  for (const component of path) {
    store = store[component];
    if (!store) {
      return {};
    }
  }
  return store;
}
function add(category, name, handler, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  if (store[lastComponent]) {
    _logger.logger.warn(`Warning: Duplicate cloud functions exist for ${lastComponent}. Only the last one will be used and the others will be ignored.`);
  }
  store[lastComponent] = handler;
}
function remove(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  delete store[lastComponent];
}
function get(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  return store[lastComponent];
}
function addFunction(functionName, handler, validationHandler, applicationId) {
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}
function addJob(jobName, handler, applicationId) {
  add(Category.Jobs, jobName, handler, applicationId);
}
function addTrigger(type, className, handler, applicationId, validationHandler) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}
function addConnectTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
}
function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.push(handler);
}
function removeFunction(functionName, applicationId) {
  remove(Category.Functions, functionName, applicationId);
}
function removeTrigger(type, className, applicationId) {
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}
function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
}
function toJSONwithObjects(object, className) {
  if (!object || !object.toJSON) {
    return {};
  }
  const toJSON = object.toJSON();
  const stateController = _node.default.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(object._getStateIdentifier());
  for (const key in pending) {
    const val = object.get(key);
    if (!val || !val._toFullJSON) {
      toJSON[key] = val;
      continue;
    }
    toJSON[key] = val._toFullJSON();
  }
  if (className) {
    toJSON.className = className;
  }
  return toJSON;
}
function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }
  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}
async function runTrigger(trigger, name, request, auth) {
  if (!trigger) {
    return;
  }
  await maybeRunValidator(request, name, auth);
  if (request.skipWithMasterKey) {
    return;
  }
  return await trigger(request);
}
function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}
function getFunction(functionName, applicationId) {
  return get(Category.Functions, functionName, applicationId);
}
function getFunctionNames(applicationId) {
  const store = _triggerStore[applicationId] && _triggerStore[applicationId][Category.Functions] || {};
  const functionNames = [];
  const extractFunctionNames = (namespace, store) => {
    Object.keys(store).forEach(name => {
      const value = store[name];
      if (namespace) {
        name = `${namespace}.${name}`;
      }
      if (typeof value === 'function') {
        functionNames.push(name);
      } else {
        extractFunctionNames(name, value);
      }
    });
  };
  extractFunctionNames(null, store);
  return functionNames;
}
function getJob(jobName, applicationId) {
  return get(Category.Jobs, jobName, applicationId);
}
function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Jobs) {
    return manager.Jobs;
  }
  return undefined;
}
function getValidator(functionName, applicationId) {
  return get(Category.Validators, functionName, applicationId);
}
function getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context) {
  const request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip
  };
  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.beforeLogin || triggerType === Types.afterLogin || triggerType === Types.afterFind) {
    // Set a copy of the context on the request object.
    request.context = Object.assign({}, context);
  }
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
  isGet = !!isGet;
  var request = {
    triggerName: triggerType,
    query,
    master: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip,
    context: context || {}
  };
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
function getResponseObject(request, resolve, reject) {
  return {
    success: function (response) {
      if (request.triggerName === Types.afterFind) {
        if (!response) {
          response = request.objects;
        }
        response = response.map(object => {
          return toJSONwithObjects(object);
        });
        return resolve(response);
      }
      // Use the JSON response
      if (response && typeof response === 'object' && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }
      if (response && typeof response === 'object' && request.triggerName === Types.afterSave) {
        return resolve(response);
      }
      if (request.triggerName === Types.afterSave) {
        return resolve();
      }
      response = {};
      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
        response['object']['objectId'] = request.object.id;
      }
      return resolve(response);
    },
    error: function (error) {
      const e = resolveError(error, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.'
      });
      reject(e);
    }
  };
}
function userIdForLog(auth) {
  return auth && auth.user ? auth.user.id : undefined;
}
function logTriggerAfterHook(triggerType, className, input, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerErrorBeforeHook(triggerType, className, input, auth, error, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
    className,
    triggerType,
    error,
    user: userIdForLog(auth)
  });
}
function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config, query, context) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    const request = getRequestObject(triggerType, auth, null, null, config, context);
    if (query) {
      request.query = query;
    }
    const {
      success,
      error
    } = getResponseObject(request, object => {
      resolve(object);
    }, error => {
      reject(error);
    });
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth, config.logLevels.triggerBeforeSuccess);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return _node.default.Object.fromJSON(object);
    });
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }
      const response = trigger(request);
      if (response && typeof response.then === 'function') {
        return response.then(results => {
          return results;
        });
      }
      return response;
    }).then(success, error);
  }).then(results => {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth, config.logLevels.triggerAfter);
    return results;
  });
}
function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, context, isGet) {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions
    });
  }
  const json = Object.assign({}, restOptions);
  json.where = restWhere;
  const parseQuery = new _node.default.Query(className);
  parseQuery.withJSON(json);
  let count = false;
  if (restOptions) {
    count = !!restOptions.count;
  }
  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, context, isGet);
  return Promise.resolve().then(() => {
    return maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);
  }).then(() => {
    if (requestObject.skipWithMasterKey) {
      return requestObject.query;
    }
    return trigger(requestObject);
  }).then(result => {
    let queryResult = parseQuery;
    if (result && result instanceof _node.default.Query) {
      queryResult = result;
    }
    const jsonQuery = queryResult.toJSON();
    if (jsonQuery.where) {
      restWhere = jsonQuery.where;
    }
    if (jsonQuery.limit) {
      restOptions = restOptions || {};
      restOptions.limit = jsonQuery.limit;
    }
    if (jsonQuery.skip) {
      restOptions = restOptions || {};
      restOptions.skip = jsonQuery.skip;
    }
    if (jsonQuery.include) {
      restOptions = restOptions || {};
      restOptions.include = jsonQuery.include;
    }
    if (jsonQuery.excludeKeys) {
      restOptions = restOptions || {};
      restOptions.excludeKeys = jsonQuery.excludeKeys;
    }
    if (jsonQuery.explain) {
      restOptions = restOptions || {};
      restOptions.explain = jsonQuery.explain;
    }
    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }
    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
    }
    if (jsonQuery.hint) {
      restOptions = restOptions || {};
      restOptions.hint = jsonQuery.hint;
    }
    if (jsonQuery.comment) {
      restOptions = restOptions || {};
      restOptions.comment = jsonQuery.comment;
    }
    if (requestObject.readPreference) {
      restOptions = restOptions || {};
      restOptions.readPreference = requestObject.readPreference;
    }
    if (requestObject.includeReadPreference) {
      restOptions = restOptions || {};
      restOptions.includeReadPreference = requestObject.includeReadPreference;
    }
    if (requestObject.subqueryReadPreference) {
      restOptions = restOptions || {};
      restOptions.subqueryReadPreference = requestObject.subqueryReadPreference;
    }
    return {
      restWhere,
      restOptions
    };
  }, err => {
    const error = resolveError(err, {
      code: _node.default.Error.SCRIPT_FAILED,
      message: 'Script failed. Unknown error.'
    });
    throw error;
  });
}
function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }
  if (!message) {
    return new _node.default.Error(defaultOpts.code || _node.default.Error.SCRIPT_FAILED, defaultOpts.message || 'Script failed.');
  }
  if (message instanceof _node.default.Error) {
    return message;
  }
  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED;
  // If it's an error, mark it as a script failed
  if (typeof message === 'string') {
    return new _node.default.Error(code, message);
  }
  const error = new _node.default.Error(code, message.message || message);
  if (message instanceof Error) {
    error.stack = message.stack;
  }
  return error;
}
function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, _node.default.applicationId);
  if (!theValidator) {
    return;
  }
  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }
  return new Promise((resolve, reject) => {
    return Promise.resolve().then(() => {
      return typeof theValidator === 'object' ? builtInTriggerValidator(theValidator, request, auth) : theValidator(request);
    }).then(() => {
      resolve();
    }).catch(e => {
      const error = resolveError(e, {
        code: _node.default.Error.VALIDATION_ERROR,
        message: 'Validation failed.'
      });
      reject(error);
    });
  });
}
async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }
  let reqUser = request.user;
  if (!reqUser && request.object && request.object.className === '_User' && !request.object.existed()) {
    reqUser = request.object;
  }
  if ((options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) && !reqUser) {
    throw 'Validation failed. Please login to continue.';
  }
  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }
  let params = request.params || {};
  if (request.object) {
    params = request.object.toJSON();
  }
  const requiredParam = key => {
    const value = params[key];
    if (value == null) {
      throw `Validation failed. Please specify data for ${key}.`;
    }
  };
  const validateOptions = async (opt, key, val) => {
    let opts = opt.options;
    if (typeof opts === 'function') {
      try {
        const result = await opts(val);
        if (!result && result != null) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
      } catch (e) {
        if (!e) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
        throw opt.error || e.message || e;
      }
      return;
    }
    if (!Array.isArray(opts)) {
      opts = [opt.options];
    }
    if (!opts.includes(val)) {
      throw opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`;
    }
  };
  const getType = fn => {
    const match = fn && fn.toString().match(/^\s*function (\w+)/);
    return (match ? match[1] : '').toLowerCase();
  };
  if (Array.isArray(options.fields)) {
    for (const key of options.fields) {
      requiredParam(key);
    }
  } else {
    const optionPromises = [];
    for (const key in options.fields) {
      const opt = options.fields[key];
      let val = params[key];
      if (typeof opt === 'string') {
        requiredParam(opt);
      }
      if (typeof opt === 'object') {
        if (opt.default != null && val == null) {
          val = opt.default;
          params[key] = val;
          if (request.object) {
            request.object.set(key, val);
          }
        }
        if (opt.constant && request.object) {
          if (request.original) {
            request.object.revert(key);
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }
        if (opt.required) {
          requiredParam(key);
        }
        const optional = !opt.required && val === undefined;
        if (!optional) {
          if (opt.type) {
            const type = getType(opt.type);
            const valType = Array.isArray(val) ? 'array' : typeof val;
            if (valType !== type) {
              throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
            }
          }
          if (opt.options) {
            optionPromises.push(validateOptions(opt, key, val));
          }
        }
      }
    }
    await Promise.all(optionPromises);
  }
  let userRoles = options.requireAnyUserRoles;
  let requireAllRoles = options.requireAllUserRoles;
  const promises = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  if (userRoles || requireAllRoles) {
    promises[0] = auth.getUserRoles();
  }
  if (typeof userRoles === 'function') {
    promises[1] = userRoles();
  }
  if (typeof requireAllRoles === 'function') {
    promises[2] = requireAllRoles();
  }
  const [roles, resolvedUserRoles, resolvedRequireAll] = await Promise.all(promises);
  if (resolvedUserRoles && Array.isArray(resolvedUserRoles)) {
    userRoles = resolvedUserRoles;
  }
  if (resolvedRequireAll && Array.isArray(resolvedRequireAll)) {
    requireAllRoles = resolvedRequireAll;
  }
  if (userRoles) {
    const hasRole = userRoles.some(requiredRole => roles.includes(`role:${requiredRole}`));
    if (!hasRole) {
      throw `Validation failed. User does not match the required roles.`;
    }
  }
  if (requireAllRoles) {
    for (const requiredRole of requireAllRoles) {
      if (!roles.includes(`role:${requiredRole}`)) {
        throw `Validation failed. User does not match all the required roles.`;
      }
    }
  }
  const userKeys = options.requireUserKeys || [];
  if (Array.isArray(userKeys)) {
    for (const key of userKeys) {
      if (!reqUser) {
        throw 'Please login to make this request.';
      }
      if (reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    }
  } else if (typeof userKeys === 'object') {
    const optionPromises = [];
    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];
      if (opt.options) {
        optionPromises.push(validateOptions(opt, key, reqUser.get(key)));
      }
    }
    await Promise.all(optionPromises);
  }
}

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions
function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config, context) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context);
    var {
      success,
      error
    } = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth, triggerType.startsWith('after') ? config.logLevels.triggerAfter : config.logLevels.triggerBeforeSuccess);
      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
        Object.assign(context, request.context);
      }
      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error, config.logLevels.triggerBeforeError);
      reject(error);
    });

    // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return Promise.resolve();
      }
      const promise = trigger(request);
      if (triggerType === Types.afterSave || triggerType === Types.afterDelete || triggerType === Types.afterLogin) {
        logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth, config.logLevels.triggerAfter);
      }
      // beforeSave is expected to return null (nothing)
      if (triggerType === Types.beforeSave) {
        if (promise && typeof promise.then === 'function') {
          return promise.then(response => {
            // response.object may come from express routing before hook
            if (response && response.object) {
              return response;
            }
            return null;
          });
        }
        return null;
      }
      return promise;
    }).then(success, error);
  });
}

// Converts a REST-format object to a Parse.Object
// data is either className or an object
function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : {
    className: data
  };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return _node.default.Object.fromJSON(copy);
}
function runLiveQueryEventHandlers(data, applicationId = _node.default.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }
  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}
function getRequestFileObject(triggerType, auth, fileObject, config) {
  const request = _objectSpread(_objectSpread({}, fileObject), {}, {
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip
  });
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
async function maybeRunFileTrigger(triggerType, fileObject, config, auth) {
  const FileClassName = getClassName(_node.default.File);
  const fileTrigger = getTrigger(FileClassName, triggerType, config.applicationId);
  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);
      if (request.skipWithMasterKey) {
        return fileObject;
      }
      const result = await fileTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), result, auth, config.logLevels.triggerBeforeSuccess);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return fileObject;
}
async function maybeRunGlobalConfigTrigger(triggerType, auth, configObject, originalConfigObject, config, context) {
  const GlobalConfigClassName = getClassName(_node.default.Config);
  const configTrigger = getTrigger(GlobalConfigClassName, triggerType, config.applicationId);
  if (typeof configTrigger === 'function') {
    try {
      const request = getRequestObject(triggerType, auth, configObject, originalConfigObject, config, context);
      await maybeRunValidator(request, `${triggerType}.${GlobalConfigClassName}`, auth);
      if (request.skipWithMasterKey) {
        return configObject;
      }
      const result = await configTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.Config', configObject, result, auth, config.logLevels.triggerBeforeSuccess);
      return result || configObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.Config', configObject, auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return configObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIm93bktleXMiLCJyIiwidCIsIk9iamVjdCIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsIl90b1Byb3BlcnR5S2V5IiwidmFsdWUiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImkiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsImNhbGwiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJUeXBlcyIsImV4cG9ydHMiLCJiZWZvcmVMb2dpbiIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImJlZm9yZVNhdmUiLCJhZnRlclNhdmUiLCJiZWZvcmVEZWxldGUiLCJhZnRlckRlbGV0ZSIsImJlZm9yZUZpbmQiLCJhZnRlckZpbmQiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkNvbm5lY3RDbGFzc05hbWUiLCJiYXNlU3RvcmUiLCJWYWxpZGF0b3JzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJpbnZhbGlkTmFtZVJlZ2V4IiwidGVzdCIsInBhdGgiLCJzcGxpdCIsInNwbGljZSIsIlBhcnNlIiwic3RvcmUiLCJjb21wb25lbnQiLCJhZGQiLCJoYW5kbGVyIiwibGFzdENvbXBvbmVudCIsImxvZ2dlciIsIndhcm4iLCJyZW1vdmUiLCJnZXQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInJlbW92ZUZ1bmN0aW9uIiwicmVtb3ZlVHJpZ2dlciIsIl91bnJlZ2lzdGVyQWxsIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsInRyaWdnZXJFeGlzdHMiLCJ1bmRlZmluZWQiLCJnZXRGdW5jdGlvbiIsImdldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzIiwiZXh0cmFjdEZ1bmN0aW9uTmFtZXMiLCJuYW1lc3BhY2UiLCJnZXRKb2IiLCJnZXRKb2JzIiwibWFuYWdlciIsImdldFZhbGlkYXRvciIsImdldFJlcXVlc3RPYmplY3QiLCJwYXJzZU9iamVjdCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJjb25maWciLCJjb250ZXh0IiwidHJpZ2dlck5hbWUiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJpZCIsImVycm9yIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJsb2dUcmlnZ2VyQWZ0ZXJIb29rIiwiaW5wdXQiLCJsb2dMZXZlbCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsImxvZ0xldmVscyIsInRyaWdnZXJCZWZvcmVTdWNjZXNzIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsInRyaWdnZXJBZnRlciIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJjb21tZW50IiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZXJyIiwiZGVmYXVsdE9wdHMiLCJzdGFjayIsInRoZVZhbGlkYXRvciIsImJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yIiwiY2F0Y2giLCJWQUxJREFUSU9OX0VSUk9SIiwib3B0aW9ucyIsInZhbGlkYXRlTWFzdGVyS2V5IiwicmVxVXNlciIsImV4aXN0ZWQiLCJyZXF1aXJlVXNlciIsInJlcXVpcmVBbnlVc2VyUm9sZXMiLCJyZXF1aXJlQWxsVXNlclJvbGVzIiwicmVxdWlyZU1hc3RlciIsInBhcmFtcyIsInJlcXVpcmVkUGFyYW0iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJvcHQiLCJvcHRzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZXMiLCJqb2luIiwiZ2V0VHlwZSIsImZuIiwibWF0Y2giLCJ0b1N0cmluZyIsInRvTG93ZXJDYXNlIiwiZmllbGRzIiwib3B0aW9uUHJvbWlzZXMiLCJzZXQiLCJjb25zdGFudCIsInJldmVydCIsInJlcXVpcmVkIiwib3B0aW9uYWwiLCJ2YWxUeXBlIiwiYWxsIiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInN0YXJ0c1dpdGgiLCJ0cmlnZ2VyQmVmb3JlRXJyb3IiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJnZXRSZXF1ZXN0RmlsZU9iamVjdCIsImZpbGVPYmplY3QiLCJtYXliZVJ1bkZpbGVUcmlnZ2VyIiwiRmlsZUNsYXNzTmFtZSIsIkZpbGUiLCJmaWxlVHJpZ2dlciIsImZpbGUiLCJmaWxlU2l6ZSIsIm1heWJlUnVuR2xvYmFsQ29uZmlnVHJpZ2dlciIsImNvbmZpZ09iamVjdCIsIm9yaWdpbmFsQ29uZmlnT2JqZWN0IiwiR2xvYmFsQ29uZmlnQ2xhc3NOYW1lIiwiQ29uZmlnIiwiY29uZmlnVHJpZ2dlciJdLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyB0cmlnZ2Vycy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVHlwZXMgPSB7XG4gIGJlZm9yZUxvZ2luOiAnYmVmb3JlTG9naW4nLFxuICBhZnRlckxvZ2luOiAnYWZ0ZXJMb2dpbicsXG4gIGFmdGVyTG9nb3V0OiAnYWZ0ZXJMb2dvdXQnLFxuICBiZWZvcmVTYXZlOiAnYmVmb3JlU2F2ZScsXG4gIGFmdGVyU2F2ZTogJ2FmdGVyU2F2ZScsXG4gIGJlZm9yZURlbGV0ZTogJ2JlZm9yZURlbGV0ZScsXG4gIGFmdGVyRGVsZXRlOiAnYWZ0ZXJEZWxldGUnLFxuICBiZWZvcmVGaW5kOiAnYmVmb3JlRmluZCcsXG4gIGFmdGVyRmluZDogJ2FmdGVyRmluZCcsXG4gIGJlZm9yZUNvbm5lY3Q6ICdiZWZvcmVDb25uZWN0JyxcbiAgYmVmb3JlU3Vic2NyaWJlOiAnYmVmb3JlU3Vic2NyaWJlJyxcbiAgYWZ0ZXJFdmVudDogJ2FmdGVyRXZlbnQnLFxufTtcblxuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLm5hbWUpIHtcbiAgICByZXR1cm4gcGFyc2VDbGFzcy5uYW1lLnJlcGxhY2UoJ1BhcnNlJywgJ0AnKTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGludmFsaWROYW1lUmVnZXggPSAvWydcImBdLztcbiAgaWYgKGludmFsaWROYW1lUmVnZXgudGVzdChuYW1lKSkge1xuICAgIC8vIFByZXZlbnQgYSBtYWxpY2lvdXMgdXNlciBmcm9tIGluamVjdGluZyBwcm9wZXJ0aWVzIGludG8gdGhlIHN0b3JlXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgY29uc3QgcGF0aCA9IG5hbWUuc3BsaXQoJy4nKTtcbiAgcGF0aC5zcGxpY2UoLTEpOyAvLyByZW1vdmUgbGFzdCBjb21wb25lbnRcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIGxldCBzdG9yZSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bY2F0ZWdvcnldO1xuICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBwYXRoKSB7XG4gICAgc3RvcmUgPSBzdG9yZVtjb21wb25lbnRdO1xuICAgIGlmICghc3RvcmUpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb25uZWN0VHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QsIGNsYXNzTmFtZSkge1xuICBpZiAoIW9iamVjdCB8fCAhb2JqZWN0LnRvSlNPTikge1xuICAgIHJldHVybiB7fTtcbiAgfVxuICBjb25zdCB0b0pTT04gPSBvYmplY3QudG9KU09OKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhvYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcGVuZGluZykge1xuICAgIGNvbnN0IHZhbCA9IG9iamVjdC5nZXQoa2V5KTtcbiAgICBpZiAoIXZhbCB8fCAhdmFsLl90b0Z1bGxKU09OKSB7XG4gICAgICB0b0pTT05ba2V5XSA9IHZhbDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0b0pTT05ba2V5XSA9IHZhbC5fdG9GdWxsSlNPTigpO1xuICB9XG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICB0b0pTT04uY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9XG4gIHJldHVybiB0b0pTT047XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVHJpZ2dlcih0cmlnZ2VyLCBuYW1lLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBuYW1lLCBhdXRoKTtcbiAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGF3YWl0IHRyaWdnZXIocmVxdWVzdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGFwcGxpY2F0aW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgcmVxdWVzdC5vcmlnaW5hbCA9IG9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpbiB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckZpbmRcbiAgKSB7XG4gICAgLy8gU2V0IGEgY29weSBvZiB0aGUgY29udGV4dCBvbiB0aGUgcmVxdWVzdCBvYmplY3QuXG4gICAgcmVxdWVzdC5jb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgY29udGV4dCk7XG4gIH1cblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0UXVlcnlPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIHF1ZXJ5LCBjb3VudCwgY29uZmlnLCBjb250ZXh0LCBpc0dldCkge1xuICBpc0dldCA9ICEhaXNHZXQ7XG5cbiAgdmFyIHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIHF1ZXJ5LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgY291bnQsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBpc0dldCxcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbnRleHQ6IGNvbnRleHQgfHwge30sXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgICByZXNwb25zZSA9IHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXNwb25zZSA9IHJlc3BvbnNlLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIHJldHVybiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXVsnb2JqZWN0SWQnXSA9IHJlcXVlc3Qub2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnJvciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICByZWplY3QoZSk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlcklkRm9yTG9nKGF1dGgpIHtcbiAgcmV0dXJuIGF1dGggJiYgYXV0aC51c2VyID8gYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBsb2dMZXZlbCkge1xuICBpZiAobG9nTGV2ZWwgPT09ICdzaWxlbnQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgsIGxvZ0xldmVsKSB7XG4gIGlmIChsb2dMZXZlbCA9PT0gJ3NpbGVudCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXJbbG9nTGV2ZWxdKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yLCBsb2dMZXZlbCkge1xuICBpZiAobG9nTGV2ZWwgPT09ICdzaWxlbnQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IGZhaWxlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgZXJyb3IsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICBvYmplY3RzLFxuICBjb25maWcsXG4gIHF1ZXJ5LFxuICBjb250ZXh0XG4pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgbnVsbCwgbnVsbCwgY29uZmlnLCBjb250ZXh0KTtcbiAgICBpZiAocXVlcnkpIHtcbiAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgJ0FmdGVyRmluZCcsXG4gICAgICBKU09OLnN0cmluZ2lmeShvYmplY3RzKSxcbiAgICAgIGF1dGgsXG4gICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgKTtcbiAgICByZXF1ZXN0Lm9iamVjdHMgPSBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgLy9zZXR0aW5nIHRoZSBjbGFzcyBuYW1lIHRvIHRyYW5zZm9ybSBpbnRvIHBhcnNlIG9iamVjdFxuICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqZWN0KTtcbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBKU09OLnN0cmluZ2lmeShyZXN1bHRzKSxcbiAgICAgIGF1dGgsXG4gICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSxcbiAgcmVzdE9wdGlvbnMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gIH1cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHJlc3RXaGVyZTtcblxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG5cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgY29udGV4dCxcbiAgICBpc0dldFxuICApO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdE9iamVjdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RPYmplY3QucXVlcnk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJpZ2dlcihyZXF1ZXN0T2JqZWN0KTtcbiAgICB9KVxuICAgIC50aGVuKFxuICAgICAgcmVzdWx0ID0+IHtcbiAgICAgICAgbGV0IHF1ZXJ5UmVzdWx0ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgICAgICAgIHF1ZXJ5UmVzdWx0ID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGpzb25RdWVyeSA9IHF1ZXJ5UmVzdWx0LnRvSlNPTigpO1xuICAgICAgICBpZiAoanNvblF1ZXJ5LndoZXJlKSB7XG4gICAgICAgICAgcmVzdFdoZXJlID0ganNvblF1ZXJ5LndoZXJlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkubGltaXQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmxpbWl0ID0ganNvblF1ZXJ5LmxpbWl0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuc2tpcCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc2tpcCA9IGpzb25RdWVyeS5za2lwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaW5jbHVkZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGpzb25RdWVyeS5pbmNsdWRlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhjbHVkZUtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0ganNvblF1ZXJ5LmV4Y2x1ZGVLZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhwbGFpbikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhwbGFpbiA9IGpzb25RdWVyeS5leHBsYWluO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkua2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMua2V5cyA9IGpzb25RdWVyeS5rZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkub3JkZXIpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLm9yZGVyID0ganNvblF1ZXJ5Lm9yZGVyO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaGludCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaGludCA9IGpzb25RdWVyeS5oaW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuY29tbWVudCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuY29tbWVudCA9IGpzb25RdWVyeS5jb21tZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlRXJyb3IobWVzc2FnZSwgZGVmYXVsdE9wdHMpIHtcbiAgaWYgKCFkZWZhdWx0T3B0cykge1xuICAgIGRlZmF1bHRPcHRzID0ge307XG4gIH1cbiAgaWYgKCFtZXNzYWdlKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgIGRlZmF1bHRPcHRzLm1lc3NhZ2UgfHwgJ1NjcmlwdCBmYWlsZWQuJ1xuICAgICk7XG4gIH1cbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgIHJldHVybiBtZXNzYWdlO1xuICB9XG5cbiAgY29uc3QgY29kZSA9IGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRDtcbiAgLy8gSWYgaXQncyBhbiBlcnJvciwgbWFyayBpdCBhcyBhIHNjcmlwdCBmYWlsZWRcbiAgaWYgKHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZSk7XG4gIH1cbiAgY29uc3QgZXJyb3IgPSBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZS5tZXNzYWdlIHx8IG1lc3NhZ2UpO1xuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgZXJyb3Iuc3RhY2sgPSBtZXNzYWdlLnN0YWNrO1xuICB9XG4gIHJldHVybiBlcnJvcjtcbn1cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBmdW5jdGlvbk5hbWUsIGF1dGgpIHtcbiAgY29uc3QgdGhlVmFsaWRhdG9yID0gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdGhlVmFsaWRhdG9yKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0JyAmJiB0aGVWYWxpZGF0b3Iuc2tpcFdpdGhNYXN0ZXJLZXkgJiYgcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICByZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5ID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCdcbiAgICAgICAgICA/IGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKHRoZVZhbGlkYXRvciwgcmVxdWVzdCwgYXV0aClcbiAgICAgICAgICA6IHRoZVZhbGlkYXRvcihyZXF1ZXN0KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZSA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgIG1lc3NhZ2U6ICdWYWxpZGF0aW9uIGZhaWxlZC4nLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH0pO1xuICB9KTtcbn1cbmFzeW5jIGZ1bmN0aW9uIGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKG9wdGlvbnMsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKHJlcXVlc3QubWFzdGVyICYmICFvcHRpb25zLnZhbGlkYXRlTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCByZXFVc2VyID0gcmVxdWVzdC51c2VyO1xuICBpZiAoXG4gICAgIXJlcVVzZXIgJiZcbiAgICByZXF1ZXN0Lm9iamVjdCAmJlxuICAgIHJlcXVlc3Qub2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICFyZXF1ZXN0Lm9iamVjdC5leGlzdGVkKClcbiAgKSB7XG4gICAgcmVxVXNlciA9IHJlcXVlc3Qub2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICAob3B0aW9ucy5yZXF1aXJlVXNlciB8fCBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXMgfHwgb3B0aW9ucy5yZXF1aXJlQWxsVXNlclJvbGVzKSAmJlxuICAgICFyZXFVc2VyXG4gICkge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIGxvZ2luIHRvIGNvbnRpbnVlLic7XG4gIH1cbiAgaWYgKG9wdGlvbnMucmVxdWlyZU1hc3RlciAmJiAhcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIE1hc3RlciBrZXkgaXMgcmVxdWlyZWQgdG8gY29tcGxldGUgdGhpcyByZXF1ZXN0Lic7XG4gIH1cbiAgbGV0IHBhcmFtcyA9IHJlcXVlc3QucGFyYW1zIHx8IHt9O1xuICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICBwYXJhbXMgPSByZXF1ZXN0Lm9iamVjdC50b0pTT04oKTtcbiAgfVxuICBjb25zdCByZXF1aXJlZFBhcmFtID0ga2V5ID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcmFtc1trZXldO1xuICAgIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzcGVjaWZ5IGRhdGEgZm9yICR7a2V5fS5gO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCB2YWxpZGF0ZU9wdGlvbnMgPSBhc3luYyAob3B0LCBrZXksIHZhbCkgPT4ge1xuICAgIGxldCBvcHRzID0gb3B0Lm9wdGlvbnM7XG4gICAgaWYgKHR5cGVvZiBvcHRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvcHRzKHZhbCk7XG4gICAgICAgIGlmICghcmVzdWx0ICYmIHJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB2YWx1ZSBmb3IgJHtrZXl9LmA7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKCFlKSB7XG4gICAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB2YWx1ZSBmb3IgJHtrZXl9LmA7XG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgZS5tZXNzYWdlIHx8IGU7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghQXJyYXkuaXNBcnJheShvcHRzKSkge1xuICAgICAgb3B0cyA9IFtvcHQub3B0aW9uc107XG4gICAgfVxuXG4gICAgaWYgKCFvcHRzLmluY2x1ZGVzKHZhbCkpIHtcbiAgICAgIHRocm93IChcbiAgICAgICAgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCBvcHRpb24gZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7b3B0cy5qb2luKCcsICcpfWBcbiAgICAgICk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGdldFR5cGUgPSBmbiA9PiB7XG4gICAgY29uc3QgbWF0Y2ggPSBmbiAmJiBmbi50b1N0cmluZygpLm1hdGNoKC9eXFxzKmZ1bmN0aW9uIChcXHcrKS8pO1xuICAgIHJldHVybiAobWF0Y2ggPyBtYXRjaFsxXSA6ICcnKS50b0xvd2VyQ2FzZSgpO1xuICB9O1xuICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLmZpZWxkcykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLmZpZWxkc1trZXldO1xuICAgICAgbGV0IHZhbCA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmVkUGFyYW0ob3B0KTtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCAmJiB2YWwgPT0gbnVsbCkge1xuICAgICAgICAgIHZhbCA9IG9wdC5kZWZhdWx0O1xuICAgICAgICAgIHBhcmFtc1trZXldID0gdmFsO1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgdmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5jb25zdGFudCAmJiByZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9yaWdpbmFsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5yZXZlcnQoa2V5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIG9wdC5kZWZhdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5yZXF1aXJlZCkge1xuICAgICAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvcHRpb25hbCA9ICFvcHQucmVxdWlyZWQgJiYgdmFsID09PSB1bmRlZmluZWQ7XG4gICAgICAgIGlmICghb3B0aW9uYWwpIHtcbiAgICAgICAgICBpZiAob3B0LnR5cGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBnZXRUeXBlKG9wdC50eXBlKTtcbiAgICAgICAgICAgIGNvbnN0IHZhbFR5cGUgPSBBcnJheS5pc0FycmF5KHZhbCkgPyAnYXJyYXknIDogdHlwZW9mIHZhbDtcbiAgICAgICAgICAgIGlmICh2YWxUeXBlICE9PSB0eXBlKSB7XG4gICAgICAgICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB0eXBlIGZvciAke2tleX0uIEV4cGVjdGVkOiAke3R5cGV9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgdmFsKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxuICBsZXQgdXNlclJvbGVzID0gb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzO1xuICBsZXQgcmVxdWlyZUFsbFJvbGVzID0gb3B0aW9ucy5yZXF1aXJlQWxsVXNlclJvbGVzO1xuICBjb25zdCBwcm9taXNlcyA9IFtQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpXTtcbiAgaWYgKHVzZXJSb2xlcyB8fCByZXF1aXJlQWxsUm9sZXMpIHtcbiAgICBwcm9taXNlc1swXSA9IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiB1c2VyUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1sxXSA9IHVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgcmVxdWlyZUFsbFJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMl0gPSByZXF1aXJlQWxsUm9sZXMoKTtcbiAgfVxuICBjb25zdCBbcm9sZXMsIHJlc29sdmVkVXNlclJvbGVzLCByZXNvbHZlZFJlcXVpcmVBbGxdID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICBpZiAocmVzb2x2ZWRVc2VyUm9sZXMgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFVzZXJSb2xlcykpIHtcbiAgICB1c2VyUm9sZXMgPSByZXNvbHZlZFVzZXJSb2xlcztcbiAgfVxuICBpZiAocmVzb2x2ZWRSZXF1aXJlQWxsICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRSZXF1aXJlQWxsKSkge1xuICAgIHJlcXVpcmVBbGxSb2xlcyA9IHJlc29sdmVkUmVxdWlyZUFsbDtcbiAgfVxuICBpZiAodXNlclJvbGVzKSB7XG4gICAgY29uc3QgaGFzUm9sZSA9IHVzZXJSb2xlcy5zb21lKHJlcXVpcmVkUm9sZSA9PiByb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSk7XG4gICAgaWYgKCFoYXNSb2xlKSB7XG4gICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgfVxuICB9XG4gIGlmIChyZXF1aXJlQWxsUm9sZXMpIHtcbiAgICBmb3IgKGNvbnN0IHJlcXVpcmVkUm9sZSBvZiByZXF1aXJlQWxsUm9sZXMpIHtcbiAgICAgIGlmICghcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpIHtcbiAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIGFsbCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgdXNlcktleXMgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cyB8fCBbXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkodXNlcktleXMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgdXNlcktleXMpIHtcbiAgICAgIGlmICghcmVxVXNlcikge1xuICAgICAgICB0aHJvdyAnUGxlYXNlIGxvZ2luIHRvIG1ha2UgdGhpcyByZXF1ZXN0Lic7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXFVc2VyLmdldChrZXkpID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc2V0IGRhdGEgZm9yICR7a2V5fSBvbiB5b3VyIGFjY291bnQuYDtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZW9mIHVzZXJLZXlzID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzW2tleV07XG4gICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHJlcVVzZXIuZ2V0KGtleSkpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG59XG5cbi8vIFRvIGJlIHVzZWQgYXMgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiB3aGVuIHNhdmluZy9kZWxldGluZyBhbiBvYmplY3Rcbi8vIFdpbGwgcmVzb2x2ZSBzdWNjZXNzZnVsbHkgaWYgbm8gdHJpZ2dlciBpcyBjb25maWd1cmVkXG4vLyBSZXNvbHZlcyB0byBhbiBvYmplY3QsIGVtcHR5IG9yIGNvbnRhaW5pbmcgYW4gb2JqZWN0IGtleS4gQSBiZWZvcmVTYXZlXG4vLyB0cmlnZ2VyIHdpbGwgc2V0IHRoZSBvYmplY3Qga2V5IHRvIHRoZSByZXN0IGZvcm1hdCBvYmplY3QgdG8gc2F2ZS5cbi8vIG9yaWdpbmFsUGFyc2VPYmplY3QgaXMgb3B0aW9uYWwsIHdlIG9ubHkgbmVlZCB0aGF0IGZvciBiZWZvcmUvYWZ0ZXJTYXZlIGZ1bmN0aW9uc1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgdHJpZ2dlciA9IGdldFRyaWdnZXIocGFyc2VPYmplY3QuY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikgeyByZXR1cm4gcmVzb2x2ZSgpOyB9XG4gICAgdmFyIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBhdXRoLFxuICAgICAgcGFyc2VPYmplY3QsXG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgY29uZmlnLFxuICAgICAgY29udGV4dFxuICAgICk7XG4gICAgdmFyIHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgdHJpZ2dlclR5cGUuc3RhcnRzV2l0aCgnYWZ0ZXInKVxuICAgICAgICAgICAgPyBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICAgOiBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICAgICk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke3BhcnNlT2JqZWN0LmNsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckxvZ2luXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckFmdGVyXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiZWZvcmVTYXZlIGlzIGV4cGVjdGVkIHRvIHJldHVybiBudWxsIChub3RoaW5nKVxuICAgICAgICBpZiAodHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgICBpZiAocHJvbWlzZSAmJiB0eXBlb2YgcHJvbWlzZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgLy8gcmVzcG9uc2Uub2JqZWN0IG1heSBjb21lIGZyb20gZXhwcmVzcyByb3V0aW5nIGJlZm9yZSBob29rXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pO1xufVxuXG4vLyBDb252ZXJ0cyBhIFJFU1QtZm9ybWF0IG9iamVjdCB0byBhIFBhcnNlLk9iamVjdFxuLy8gZGF0YSBpcyBlaXRoZXIgY2xhc3NOYW1lIG9yIGFuIG9iamVjdFxuZXhwb3J0IGZ1bmN0aW9uIGluZmxhdGUoZGF0YSwgcmVzdE9iamVjdCkge1xuICB2YXIgY29weSA9IHR5cGVvZiBkYXRhID09ICdvYmplY3QnID8gZGF0YSA6IHsgY2xhc3NOYW1lOiBkYXRhIH07XG4gIGZvciAodmFyIGtleSBpbiByZXN0T2JqZWN0KSB7XG4gICAgY29weVtrZXldID0gcmVzdE9iamVjdFtrZXldO1xuICB9XG4gIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04oY29weSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKGRhdGEsIGFwcGxpY2F0aW9uSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkKSB7XG4gIGlmICghX3RyaWdnZXJTdG9yZSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZykge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIC4uLmZpbGVPYmplY3QsXG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlclR5cGUsIGZpbGVPYmplY3QsIGNvbmZpZywgYXV0aCkge1xuICBjb25zdCBGaWxlQ2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKFBhcnNlLkZpbGUpO1xuICBjb25zdCBmaWxlVHJpZ2dlciA9IGdldFRyaWdnZXIoRmlsZUNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHR5cGVvZiBmaWxlVHJpZ2dlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZyk7XG4gICAgICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVPYmplY3Q7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlVHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgKTtcbiAgICAgIHJldHVybiByZXN1bHQgfHwgZmlsZU9iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGVycm9yLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmlsZU9iamVjdDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuR2xvYmFsQ29uZmlnVHJpZ2dlcih0cmlnZ2VyVHlwZSwgYXV0aCwgY29uZmlnT2JqZWN0LCBvcmlnaW5hbENvbmZpZ09iamVjdCwgY29uZmlnLCBjb250ZXh0KSB7XG4gIGNvbnN0IEdsb2JhbENvbmZpZ0NsYXNzTmFtZSA9IGdldENsYXNzTmFtZShQYXJzZS5Db25maWcpO1xuICBjb25zdCBjb25maWdUcmlnZ2VyID0gZ2V0VHJpZ2dlcihHbG9iYWxDb25maWdDbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICh0eXBlb2YgY29uZmlnVHJpZ2dlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgY29uZmlnT2JqZWN0LCBvcmlnaW5hbENvbmZpZ09iamVjdCwgY29uZmlnLCBjb250ZXh0KTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0dsb2JhbENvbmZpZ0NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiBjb25maWdPYmplY3Q7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25maWdUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkNvbmZpZycsXG4gICAgICAgIGNvbmZpZ09iamVjdCxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBjb25maWdPYmplY3Q7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuQ29uZmlnJyxcbiAgICAgICAgY29uZmlnT2JqZWN0LFxuICAgICAgICBhdXRoLFxuICAgICAgICBlcnJvcixcbiAgICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlRXJyb3JcbiAgICAgICk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbmZpZ09iamVjdDtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLElBQUFBLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUQsT0FBQTtBQUFrQyxTQUFBRCx1QkFBQUcsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUFBLFNBQUFHLFFBQUFILENBQUEsRUFBQUksQ0FBQSxRQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsSUFBQSxDQUFBUCxDQUFBLE9BQUFNLE1BQUEsQ0FBQUUscUJBQUEsUUFBQUMsQ0FBQSxHQUFBSCxNQUFBLENBQUFFLHFCQUFBLENBQUFSLENBQUEsR0FBQUksQ0FBQSxLQUFBSyxDQUFBLEdBQUFBLENBQUEsQ0FBQUMsTUFBQSxXQUFBTixDQUFBLFdBQUFFLE1BQUEsQ0FBQUssd0JB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