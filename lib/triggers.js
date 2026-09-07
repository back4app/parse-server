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
// triggers.js

const Types = exports.Types = {
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforePasswordResetRequest: 'beforePasswordResetRequest',
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

/**
 * Creates a prototype-free object for use as a lookup store.
 * This prevents prototype chain properties (e.g. `constructor`, `toString`)
 * from being resolved as registered handlers when using bracket notation
 * for lookups. Always use this instead of `{}` for handler stores.
 */
function createStore() {
  return Object.create(null);
}
const baseStore = function () {
  const Validators = Object.keys(Types).reduce(function (base, key) {
    base[key] = createStore();
    return base;
  }, createStore());
  const Functions = createStore();
  const Jobs = createStore();
  const LiveQuery = [];
  const Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = createStore();
    return base;
  }, createStore());
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
  if ((type === Types.beforeLogin || type === Types.afterLogin || type === Types.beforePasswordResetRequest) && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin, afterLogin, and beforePasswordResetRequest triggers';
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
    return createStore();
  }
  const path = name.split('.');
  path.splice(-1); // remove last component
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];
  for (const component of path) {
    if (!Object.prototype.hasOwnProperty.call(store, component)) {
      return createStore();
    }
    store = store[component];
    if (!store || Object.getPrototypeOf(store) !== null) {
      return createStore();
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
  if (!Object.prototype.hasOwnProperty.call(store, lastComponent)) {
    return undefined;
  }
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
  // Preserve original object's className if no override className is provided
  if (className) {
    toJSON.className = className;
  } else if (object.className && !toJSON.className) {
    toJSON.className = object.className;
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
function getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context, isGet) {
  const request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    config
  };
  if (isGet !== undefined) {
    request.isGet = !!isGet;
  }
  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.beforeLogin || triggerType === Types.afterLogin || triggerType === Types.beforePasswordResetRequest || triggerType === Types.afterFind) {
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
    context: context || {},
    config
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
function maybeRunAfterFindTrigger(triggerType, auth, classNameQuery, objectsInput, config, query, context, isGet) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(classNameQuery, triggerType, config.applicationId);
    if (!trigger) {
      if (objectsInput && objectsInput.length > 0 && objectsInput[0] instanceof _node.default.Object) {
        return resolve(objectsInput.map(obj => toJSONwithObjects(obj)));
      }
      return resolve(objectsInput || []);
    }
    const request = getRequestObject(triggerType, auth, null, null, config, context, isGet);
    // Convert query parameter to Parse.Query instance
    if (query instanceof _node.default.Query) {
      request.query = query;
    } else if (typeof query === 'object' && query !== null) {
      const parseQueryInstance = new _node.default.Query(classNameQuery);
      if (query.where) {
        parseQueryInstance.withJSON(query);
      }
      request.query = parseQueryInstance;
    } else {
      request.query = new _node.default.Query(classNameQuery);
    }
    const {
      success,
      error
    } = getResponseObject(request, processedObjectsJSON => {
      resolve(processedObjectsJSON);
    }, errorData => {
      reject(errorData);
    });
    logTriggerSuccessBeforeHook(triggerType, classNameQuery, 'AfterFind Input (Pre-Transform)', JSON.stringify(objectsInput.map(o => o instanceof _node.default.Object ? o.id + ':' + o.className : o)), auth, config.logLevels.triggerBeforeSuccess);

    // Convert plain objects to Parse.Object instances for trigger
    request.objects = objectsInput.map(currentObject => {
      if (currentObject instanceof _node.default.Object) {
        return currentObject;
      }
      // Preserve the original className if it exists, otherwise use the query className
      const originalClassName = currentObject.className || classNameQuery;
      const tempObjectWithClassName = {
        ...currentObject,
        className: originalClassName
      };
      return _node.default.Object.fromJSON(tempObjectWithClassName);
    });
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${classNameQuery}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }
      const responseFromTrigger = trigger(request);
      if (responseFromTrigger && typeof responseFromTrigger.then === 'function') {
        return responseFromTrigger.then(results => {
          return results;
        });
      }
      return responseFromTrigger;
    }).then(success, error);
  }).then(resultsAsJSON => {
    logTriggerAfterHook(triggerType, classNameQuery, JSON.stringify(resultsAsJSON), auth, config.logLevels.triggerAfter);
    return resultsAsJSON;
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
    let objects = undefined;
    if (result instanceof _node.default.Object) {
      objects = [result];
    } else if (Array.isArray(result) && (!result.length || result.every(obj => obj instanceof _node.default.Object))) {
      objects = result;
    }
    return {
      restWhere,
      restOptions,
      objects
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
  const request = {
    ...fileObject,
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    config
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
      if (request.forceDownload) {
        fileObject.forceDownload = true;
      }
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', {
        ...fileObject.file.toJSON(),
        fileSize: fileObject.fileSize
      }, result, auth, config.logLevels.triggerBeforeSuccess);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', {
        ...fileObject.file.toJSON(),
        fileSize: fileObject.fileSize
      }, auth, error, config.logLevels.triggerBeforeError);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlR5cGVzIiwiZXhwb3J0cyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QiLCJiZWZvcmVTYXZlIiwiYWZ0ZXJTYXZlIiwiYmVmb3JlRGVsZXRlIiwiYWZ0ZXJEZWxldGUiLCJiZWZvcmVGaW5kIiwiYWZ0ZXJGaW5kIiwiYmVmb3JlQ29ubmVjdCIsImJlZm9yZVN1YnNjcmliZSIsImFmdGVyRXZlbnQiLCJDb25uZWN0Q2xhc3NOYW1lIiwiY3JlYXRlU3RvcmUiLCJPYmplY3QiLCJjcmVhdGUiLCJiYXNlU3RvcmUiLCJWYWxpZGF0b3JzIiwia2V5cyIsInJlZHVjZSIsImJhc2UiLCJrZXkiLCJGdW5jdGlvbnMiLCJKb2JzIiwiTGl2ZVF1ZXJ5IiwiVHJpZ2dlcnMiLCJmcmVlemUiLCJnZXRDbGFzc05hbWUiLCJwYXJzZUNsYXNzIiwiY2xhc3NOYW1lIiwibmFtZSIsInJlcGxhY2UiLCJ2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzIiwidHlwZSIsIl90cmlnZ2VyU3RvcmUiLCJDYXRlZ29yeSIsImdldFN0b3JlIiwiY2F0ZWdvcnkiLCJhcHBsaWNhdGlvbklkIiwiaW52YWxpZE5hbWVSZWdleCIsInRlc3QiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZ2V0UHJvdG90eXBlT2YiLCJhZGQiLCJoYW5kbGVyIiwibGFzdENvbXBvbmVudCIsImxvZ2dlciIsIndhcm4iLCJyZW1vdmUiLCJnZXQiLCJ1bmRlZmluZWQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInB1c2giLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImZvckVhY2giLCJhcHBJZCIsInRvSlNPTndpdGhPYmplY3RzIiwib2JqZWN0IiwidG9KU09OIiwic3RhdGVDb250cm9sbGVyIiwiQ29yZU1hbmFnZXIiLCJnZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIiLCJwZW5kaW5nIiwiZ2V0UGVuZGluZ09wcyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJ2YWwiLCJfdG9GdWxsSlNPTiIsImdldFRyaWdnZXIiLCJ0cmlnZ2VyVHlwZSIsInJ1blRyaWdnZXIiLCJ0cmlnZ2VyIiwicmVxdWVzdCIsImF1dGgiLCJtYXliZVJ1blZhbGlkYXRvciIsInNraXBXaXRoTWFzdGVyS2V5IiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsImlzR2V0IiwidHJpZ2dlck5hbWUiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJnZXRSZXNwb25zZU9iamVjdCIsInJlc29sdmUiLCJyZWplY3QiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJvYmplY3RzIiwibWFwIiwiZXF1YWxzIiwiX2dldFNhdmVKU09OIiwiaWQiLCJlcnJvciIsInJlc29sdmVFcnJvciIsImNvZGUiLCJFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwidXNlcklkRm9yTG9nIiwibG9nVHJpZ2dlckFmdGVySG9vayIsImlucHV0IiwibG9nTGV2ZWwiLCJjbGVhbklucHV0IiwidHJ1bmNhdGVMb2dNZXNzYWdlIiwiSlNPTiIsInN0cmluZ2lmeSIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImNsYXNzTmFtZVF1ZXJ5Iiwib2JqZWN0c0lucHV0IiwiUHJvbWlzZSIsImxlbmd0aCIsIm9iaiIsIlF1ZXJ5IiwicGFyc2VRdWVyeUluc3RhbmNlIiwid2hlcmUiLCJ3aXRoSlNPTiIsInByb2Nlc3NlZE9iamVjdHNKU09OIiwiZXJyb3JEYXRhIiwibyIsImxvZ0xldmVscyIsInRyaWdnZXJCZWZvcmVTdWNjZXNzIiwiY3VycmVudE9iamVjdCIsIm9yaWdpbmFsQ2xhc3NOYW1lIiwidGVtcE9iamVjdFdpdGhDbGFzc05hbWUiLCJmcm9tSlNPTiIsInRoZW4iLCJyZXNwb25zZUZyb21UcmlnZ2VyIiwicmVzdWx0cyIsInJlc3VsdHNBc0pTT04iLCJ0cmlnZ2VyQWZ0ZXIiLCJtYXliZVJ1blF1ZXJ5VHJpZ2dlciIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwianNvbiIsInBhcnNlUXVlcnkiLCJyZXF1ZXN0T2JqZWN0IiwicXVlcnlSZXN1bHQiLCJqc29uUXVlcnkiLCJsaW1pdCIsInNraXAiLCJpbmNsdWRlIiwiZXhjbHVkZUtleXMiLCJleHBsYWluIiwib3JkZXIiLCJoaW50IiwiY29tbWVudCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIkFycmF5IiwiaXNBcnJheSIsImV2ZXJ5IiwiZXJyIiwiZGVmYXVsdE9wdHMiLCJzdGFjayIsInRoZVZhbGlkYXRvciIsImJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yIiwiY2F0Y2giLCJWQUxJREFUSU9OX0VSUk9SIiwib3B0aW9ucyIsInZhbGlkYXRlTWFzdGVyS2V5IiwicmVxVXNlciIsImV4aXN0ZWQiLCJyZXF1aXJlVXNlciIsInJlcXVpcmVBbnlVc2VyUm9sZXMiLCJyZXF1aXJlQWxsVXNlclJvbGVzIiwicmVxdWlyZU1hc3RlciIsInBhcmFtcyIsInJlcXVpcmVkUGFyYW0iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJvcHQiLCJvcHRzIiwiaW5jbHVkZXMiLCJqb2luIiwiZ2V0VHlwZSIsImZuIiwibWF0Y2giLCJ0b1N0cmluZyIsInRvTG93ZXJDYXNlIiwiZmllbGRzIiwib3B0aW9uUHJvbWlzZXMiLCJzZXQiLCJjb25zdGFudCIsInJldmVydCIsInJlcXVpcmVkIiwib3B0aW9uYWwiLCJ2YWxUeXBlIiwiYWxsIiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInN0YXJ0c1dpdGgiLCJ0cmlnZ2VyQmVmb3JlRXJyb3IiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJnZXRSZXF1ZXN0RmlsZU9iamVjdCIsImZpbGVPYmplY3QiLCJtYXliZVJ1bkZpbGVUcmlnZ2VyIiwiRmlsZUNsYXNzTmFtZSIsIkZpbGUiLCJmaWxlVHJpZ2dlciIsImZvcmNlRG93bmxvYWQiLCJmaWxlIiwiZmlsZVNpemUiLCJtYXliZVJ1bkdsb2JhbENvbmZpZ1RyaWdnZXIiLCJjb25maWdPYmplY3QiLCJvcmlnaW5hbENvbmZpZ09iamVjdCIsIkdsb2JhbENvbmZpZ0NsYXNzTmFtZSIsIkNvbmZpZyIsImNvbmZpZ1RyaWdnZXIiXSwic291cmNlcyI6WyIuLi9zcmMvdHJpZ2dlcnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gdHJpZ2dlcnMuanNcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcblxuZXhwb3J0IGNvbnN0IFR5cGVzID0ge1xuICBiZWZvcmVMb2dpbjogJ2JlZm9yZUxvZ2luJyxcbiAgYWZ0ZXJMb2dpbjogJ2FmdGVyTG9naW4nLFxuICBhZnRlckxvZ291dDogJ2FmdGVyTG9nb3V0JyxcbiAgYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3Q6ICdiZWZvcmVQYXNzd29yZFJlc2V0UmVxdWVzdCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlQ29ubmVjdDogJ2JlZm9yZUNvbm5lY3QnLFxuICBiZWZvcmVTdWJzY3JpYmU6ICdiZWZvcmVTdWJzY3JpYmUnLFxuICBhZnRlckV2ZW50OiAnYWZ0ZXJFdmVudCcsXG59O1xuXG5jb25zdCBDb25uZWN0Q2xhc3NOYW1lID0gJ0BDb25uZWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgcHJvdG90eXBlLWZyZWUgb2JqZWN0IGZvciB1c2UgYXMgYSBsb29rdXAgc3RvcmUuXG4gKiBUaGlzIHByZXZlbnRzIHByb3RvdHlwZSBjaGFpbiBwcm9wZXJ0aWVzIChlLmcuIGBjb25zdHJ1Y3RvcmAsIGB0b1N0cmluZ2ApXG4gKiBmcm9tIGJlaW5nIHJlc29sdmVkIGFzIHJlZ2lzdGVyZWQgaGFuZGxlcnMgd2hlbiB1c2luZyBicmFja2V0IG5vdGF0aW9uXG4gKiBmb3IgbG9va3Vwcy4gQWx3YXlzIHVzZSB0aGlzIGluc3RlYWQgb2YgYHt9YCBmb3IgaGFuZGxlciBzdG9yZXMuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVN0b3JlKCkge1xuICByZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTtcbn1cblxuY29uc3QgYmFzZVN0b3JlID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBWYWxpZGF0b3JzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbiAoYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0gY3JlYXRlU3RvcmUoKTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwgY3JlYXRlU3RvcmUoKSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IGNyZWF0ZVN0b3JlKCk7XG4gIGNvbnN0IEpvYnMgPSBjcmVhdGVTdG9yZSgpO1xuICBjb25zdCBMaXZlUXVlcnkgPSBbXTtcbiAgY29uc3QgVHJpZ2dlcnMgPSBPYmplY3Qua2V5cyhUeXBlcykucmVkdWNlKGZ1bmN0aW9uIChiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSBjcmVhdGVTdG9yZSgpO1xuICAgIHJldHVybiBiYXNlO1xuICB9LCBjcmVhdGVTdG9yZSgpKTtcblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgRnVuY3Rpb25zLFxuICAgIEpvYnMsXG4gICAgVmFsaWRhdG9ycyxcbiAgICBUcmlnZ2VycyxcbiAgICBMaXZlUXVlcnksXG4gIH0pO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXNzTmFtZShwYXJzZUNsYXNzKSB7XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MuY2xhc3NOYW1lKSB7XG4gICAgcmV0dXJuIHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICB9XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MubmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLm5hbWUucmVwbGFjZSgnUGFyc2UnLCAnQCcpO1xuICB9XG4gIHJldHVybiBwYXJzZUNsYXNzO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSkge1xuICBpZiAodHlwZSA9PSBUeXBlcy5iZWZvcmVTYXZlICYmIGNsYXNzTmFtZSA9PT0gJ19QdXNoU3RhdHVzJykge1xuICAgIC8vIF9QdXNoU3RhdHVzIHVzZXMgdW5kb2N1bWVudGVkIG5lc3RlZCBrZXkgaW5jcmVtZW50IG9wc1xuICAgIC8vIGFsbG93aW5nIGJlZm9yZVNhdmUgd291bGQgbWVzcyB1cCB0aGUgb2JqZWN0cyBiaWcgdGltZVxuICAgIC8vIFRPRE86IEFsbG93IHByb3BlciBkb2N1bWVudGVkIHdheSBvZiB1c2luZyBuZXN0ZWQgaW5jcmVtZW50IG9wc1xuICAgIHRocm93ICdPbmx5IGFmdGVyU2F2ZSBpcyBhbGxvd2VkIG9uIF9QdXNoU3RhdHVzJztcbiAgfVxuICBpZiAoKHR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8IHR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4gfHwgdHlwZSA9PT0gVHlwZXMuYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QpICYmIGNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1VzZXIgY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGJlZm9yZUxvZ2luLCBhZnRlckxvZ2luLCBhbmQgYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QgdHJpZ2dlcnMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBpbnZhbGlkTmFtZVJlZ2V4ID0gL1snXCJgXS87XG4gIGlmIChpbnZhbGlkTmFtZVJlZ2V4LnRlc3QobmFtZSkpIHtcbiAgICAvLyBQcmV2ZW50IGEgbWFsaWNpb3VzIHVzZXIgZnJvbSBpbmplY3RpbmcgcHJvcGVydGllcyBpbnRvIHRoZSBzdG9yZVxuICAgIHJldHVybiBjcmVhdGVTdG9yZSgpO1xuICB9XG5cbiAgY29uc3QgcGF0aCA9IG5hbWUuc3BsaXQoJy4nKTtcbiAgcGF0aC5zcGxpY2UoLTEpOyAvLyByZW1vdmUgbGFzdCBjb21wb25lbnRcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIGxldCBzdG9yZSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bY2F0ZWdvcnldO1xuICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBwYXRoKSB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RvcmUsIGNvbXBvbmVudCkpIHtcbiAgICAgIHJldHVybiBjcmVhdGVTdG9yZSgpO1xuICAgIH1cbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSB8fCBPYmplY3QuZ2V0UHJvdG90eXBlT2Yoc3RvcmUpICE9PSBudWxsKSB7XG4gICAgICByZXR1cm4gY3JlYXRlU3RvcmUoKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdG9yZSwgbGFzdENvbXBvbmVudCkpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENvbm5lY3RUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCwgY2xhc3NOYW1lKSB7XG4gIGlmICghb2JqZWN0IHx8ICFvYmplY3QudG9KU09OKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG4gIGNvbnN0IHRvSlNPTiA9IG9iamVjdC50b0pTT04oKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKG9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiBwZW5kaW5nKSB7XG4gICAgY29uc3QgdmFsID0gb2JqZWN0LmdldChrZXkpO1xuICAgIGlmICghdmFsIHx8ICF2YWwuX3RvRnVsbEpTT04pIHtcbiAgICAgIHRvSlNPTltrZXldID0gdmFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRvSlNPTltrZXldID0gdmFsLl90b0Z1bGxKU09OKCk7XG4gIH1cbiAgLy8gUHJlc2VydmUgb3JpZ2luYWwgb2JqZWN0J3MgY2xhc3NOYW1lIGlmIG5vIG92ZXJyaWRlIGNsYXNzTmFtZSBpcyBwcm92aWRlZFxuICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgdG9KU09OLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgfSBlbHNlIGlmIChvYmplY3QuY2xhc3NOYW1lICYmICF0b0pTT04uY2xhc3NOYW1lKSB7XG4gICAgdG9KU09OLmNsYXNzTmFtZSA9IG9iamVjdC5jbGFzc05hbWU7XG4gIH1cbiAgcmV0dXJuIHRvSlNPTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5UcmlnZ2VyKHRyaWdnZXIsIG5hbWUsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIG5hbWUsIGF1dGgpO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gYXdhaXQgdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgYXBwbGljYXRpb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkgIT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb25OYW1lcyhhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHN0b3JlID1cbiAgICAoX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSAmJiBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8IHt9O1xuICBjb25zdCBmdW5jdGlvbk5hbWVzID0gW107XG4gIGNvbnN0IGV4dHJhY3RGdW5jdGlvbk5hbWVzID0gKG5hbWVzcGFjZSwgc3RvcmUpID0+IHtcbiAgICBPYmplY3Qua2V5cyhzdG9yZSkuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gc3RvcmVbbmFtZV07XG4gICAgICBpZiAobmFtZXNwYWNlKSB7XG4gICAgICAgIG5hbWUgPSBgJHtuYW1lc3BhY2V9LiR7bmFtZX1gO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBmdW5jdGlvbk5hbWVzLnB1c2gobmFtZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBleHRyYWN0RnVuY3Rpb25OYW1lcyhuYW1lLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG4gIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG51bGwsIHN0b3JlKTtcbiAgcmV0dXJuIGZ1bmN0aW9uTmFtZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2Ioam9iTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9icyhhcHBsaWNhdGlvbklkKSB7XG4gIHZhciBtYW5hZ2VyID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXTtcbiAgaWYgKG1hbmFnZXIgJiYgbWFuYWdlci5Kb2JzKSB7XG4gICAgcmV0dXJuIG1hbmFnZXIuSm9icztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0T2JqZWN0KFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAoaXNHZXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJlcXVlc3QuaXNHZXQgPSAhIWlzR2V0O1xuICB9XG5cbiAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICByZXF1ZXN0Lm9yaWdpbmFsID0gb3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckxvZ2luIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVBhc3N3b3JkUmVzZXRSZXF1ZXN0IHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRmluZFxuICApIHtcbiAgICAvLyBTZXQgYSBjb3B5IG9mIHRoZSBjb250ZXh0IG9uIHRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICByZXF1ZXN0LmNvbnRleHQgPSBPYmplY3QuYXNzaWduKHt9LCBjb250ZXh0KTtcbiAgfVxuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RRdWVyeU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgcXVlcnksIGNvdW50LCBjb25maWcsIGNvbnRleHQsIGlzR2V0KSB7XG4gIGlzR2V0ID0gISFpc0dldDtcblxuICB2YXIgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgcXVlcnksXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBjb3VudCxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGlzR2V0LFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gICAgY29udGV4dDogY29udGV4dCB8fCB7fSxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgICByZXNwb25zZSA9IHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXNwb25zZSA9IHJlc3BvbnNlLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIHJldHVybiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXVsnb2JqZWN0SWQnXSA9IHJlcXVlc3Qub2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnJvciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICByZWplY3QoZSk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlcklkRm9yTG9nKGF1dGgpIHtcbiAgcmV0dXJuIGF1dGggJiYgYXV0aC51c2VyID8gYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBsb2dMZXZlbCkge1xuICBpZiAobG9nTGV2ZWwgPT09ICdzaWxlbnQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgsIGxvZ0xldmVsKSB7XG4gIGlmIChsb2dMZXZlbCA9PT0gJ3NpbGVudCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXJbbG9nTGV2ZWxdKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yLCBsb2dMZXZlbCkge1xuICBpZiAobG9nTGV2ZWwgPT09ICdzaWxlbnQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IGZhaWxlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgZXJyb3IsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lUXVlcnksXG4gIG9iamVjdHNJbnB1dCxcbiAgY29uZmlnLFxuICBxdWVyeSxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZVF1ZXJ5LCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuXG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICBpZiAob2JqZWN0c0lucHV0ICYmIG9iamVjdHNJbnB1dC5sZW5ndGggPiAwICYmIG9iamVjdHNJbnB1dFswXSBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShvYmplY3RzSW5wdXQubWFwKG9iaiA9PiB0b0pTT053aXRoT2JqZWN0cyhvYmopKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShvYmplY3RzSW5wdXQgfHwgW10pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBudWxsLCBudWxsLCBjb25maWcsIGNvbnRleHQsIGlzR2V0KTtcbiAgICAvLyBDb252ZXJ0IHF1ZXJ5IHBhcmFtZXRlciB0byBQYXJzZS5RdWVyeSBpbnN0YW5jZVxuICAgIGlmIChxdWVyeSBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmIHF1ZXJ5ICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBwYXJzZVF1ZXJ5SW5zdGFuY2UgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lUXVlcnkpO1xuICAgICAgaWYgKHF1ZXJ5LndoZXJlKSB7XG4gICAgICAgIHBhcnNlUXVlcnlJbnN0YW5jZS53aXRoSlNPTihxdWVyeSk7XG4gICAgICB9XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeUluc3RhbmNlO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZVF1ZXJ5KTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBwcm9jZXNzZWRPYmplY3RzSlNPTiA9PiB7XG4gICAgICAgIHJlc29sdmUocHJvY2Vzc2VkT2JqZWN0c0pTT04pO1xuICAgICAgfSxcbiAgICAgIGVycm9yRGF0YSA9PiB7XG4gICAgICAgIHJlamVjdChlcnJvckRhdGEpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWVRdWVyeSxcbiAgICAgICdBZnRlckZpbmQgSW5wdXQgKFByZS1UcmFuc2Zvcm0pJyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KFxuICAgICAgICBvYmplY3RzSW5wdXQubWFwKG8gPT4gKG8gaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QgPyBvLmlkICsgJzonICsgby5jbGFzc05hbWUgOiBvKSlcbiAgICAgICksXG4gICAgICBhdXRoLFxuICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICk7XG5cbiAgICAvLyBDb252ZXJ0IHBsYWluIG9iamVjdHMgdG8gUGFyc2UuT2JqZWN0IGluc3RhbmNlcyBmb3IgdHJpZ2dlclxuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHNJbnB1dC5tYXAoY3VycmVudE9iamVjdCA9PiB7XG4gICAgICBpZiAoY3VycmVudE9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICByZXR1cm4gY3VycmVudE9iamVjdDtcbiAgICAgIH1cbiAgICAgIC8vIFByZXNlcnZlIHRoZSBvcmlnaW5hbCBjbGFzc05hbWUgaWYgaXQgZXhpc3RzLCBvdGhlcndpc2UgdXNlIHRoZSBxdWVyeSBjbGFzc05hbWVcbiAgICAgIGNvbnN0IG9yaWdpbmFsQ2xhc3NOYW1lID0gY3VycmVudE9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lUXVlcnk7XG4gICAgICBjb25zdCB0ZW1wT2JqZWN0V2l0aENsYXNzTmFtZSA9IHsgLi4uY3VycmVudE9iamVjdCwgY2xhc3NOYW1lOiBvcmlnaW5hbENsYXNzTmFtZSB9O1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTih0ZW1wT2JqZWN0V2l0aENsYXNzTmFtZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWVRdWVyeX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNwb25zZUZyb21UcmlnZ2VyID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlRnJvbVRyaWdnZXIgJiYgdHlwZW9mIHJlc3BvbnNlRnJvbVRyaWdnZXIudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZUZyb21UcmlnZ2VyLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2VGcm9tVHJpZ2dlcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0c0FzSlNPTiA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lUXVlcnksXG4gICAgICBKU09OLnN0cmluZ2lmeShyZXN1bHRzQXNKU09OKSxcbiAgICAgIGF1dGgsXG4gICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNBc0pTT047XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSxcbiAgcmVzdE9wdGlvbnMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gIH1cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHJlc3RXaGVyZTtcblxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG5cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgY29udGV4dCxcbiAgICBpc0dldFxuICApO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdE9iamVjdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RPYmplY3QucXVlcnk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJpZ2dlcihyZXF1ZXN0T2JqZWN0KTtcbiAgICB9KVxuICAgIC50aGVuKFxuICAgICAgcmVzdWx0ID0+IHtcbiAgICAgICAgbGV0IHF1ZXJ5UmVzdWx0ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgICAgICAgIHF1ZXJ5UmVzdWx0ID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGpzb25RdWVyeSA9IHF1ZXJ5UmVzdWx0LnRvSlNPTigpO1xuICAgICAgICBpZiAoanNvblF1ZXJ5LndoZXJlKSB7XG4gICAgICAgICAgcmVzdFdoZXJlID0ganNvblF1ZXJ5LndoZXJlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkubGltaXQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmxpbWl0ID0ganNvblF1ZXJ5LmxpbWl0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuc2tpcCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc2tpcCA9IGpzb25RdWVyeS5za2lwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaW5jbHVkZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGpzb25RdWVyeS5pbmNsdWRlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhjbHVkZUtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0ganNvblF1ZXJ5LmV4Y2x1ZGVLZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhwbGFpbikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhwbGFpbiA9IGpzb25RdWVyeS5leHBsYWluO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkua2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMua2V5cyA9IGpzb25RdWVyeS5rZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkub3JkZXIpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLm9yZGVyID0ganNvblF1ZXJ5Lm9yZGVyO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaGludCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaGludCA9IGpzb25RdWVyeS5oaW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuY29tbWVudCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuY29tbWVudCA9IGpzb25RdWVyeS5jb21tZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGxldCBvYmplY3RzID0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAocmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuT2JqZWN0KSB7XG4gICAgICAgICAgb2JqZWN0cyA9IFtyZXN1bHRdO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIEFycmF5LmlzQXJyYXkocmVzdWx0KSAmJlxuICAgICAgICAgICghcmVzdWx0Lmxlbmd0aCB8fCByZXN1bHQuZXZlcnkob2JqID0+IG9iaiBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkpXG4gICAgICAgICkge1xuICAgICAgICAgIG9iamVjdHMgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgICAgb2JqZWN0cyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUVycm9yKG1lc3NhZ2UsIGRlZmF1bHRPcHRzKSB7XG4gIGlmICghZGVmYXVsdE9wdHMpIHtcbiAgICBkZWZhdWx0T3B0cyA9IHt9O1xuICB9XG4gIGlmICghbWVzc2FnZSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICBkZWZhdWx0T3B0cy5tZXNzYWdlIHx8ICdTY3JpcHQgZmFpbGVkLidcbiAgICApO1xuICB9XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIGNvbnN0IGNvZGUgPSBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQ7XG4gIC8vIElmIGl0J3MgYW4gZXJyb3IsIG1hcmsgaXQgYXMgYSBzY3JpcHQgZmFpbGVkXG4gIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UpO1xuICB9XG4gIGNvbnN0IGVycm9yID0gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UubWVzc2FnZSB8fCBtZXNzYWdlKTtcbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgIGVycm9yLnN0YWNrID0gbWVzc2FnZS5zdGFjaztcbiAgfVxuICByZXR1cm4gZXJyb3I7XG59XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgZnVuY3Rpb25OYW1lLCBhdXRoKSB7XG4gIGNvbnN0IHRoZVZhbGlkYXRvciA9IGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRoZVZhbGlkYXRvcikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCcgJiYgdGhlVmFsaWRhdG9yLnNraXBXaXRoTWFzdGVyS2V5ICYmIHJlcXVlc3QubWFzdGVyKSB7XG4gICAgcmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnXG4gICAgICAgICAgPyBidWlsdEluVHJpZ2dlclZhbGlkYXRvcih0aGVWYWxpZGF0b3IsIHJlcXVlc3QsIGF1dGgpXG4gICAgICAgICAgOiB0aGVWYWxpZGF0b3IocmVxdWVzdCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBmYWlsZWQuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcbiAgfSk7XG59XG5hc3luYyBmdW5jdGlvbiBidWlsdEluVHJpZ2dlclZhbGlkYXRvcihvcHRpb25zLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmIChyZXF1ZXN0Lm1hc3RlciAmJiAhb3B0aW9ucy52YWxpZGF0ZU1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgcmVxVXNlciA9IHJlcXVlc3QudXNlcjtcbiAgaWYgKFxuICAgICFyZXFVc2VyICYmXG4gICAgcmVxdWVzdC5vYmplY3QgJiZcbiAgICByZXF1ZXN0Lm9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAhcmVxdWVzdC5vYmplY3QuZXhpc3RlZCgpXG4gICkge1xuICAgIHJlcVVzZXIgPSByZXF1ZXN0Lm9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgKG9wdGlvbnMucmVxdWlyZVVzZXIgfHwgb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzIHx8IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcykgJiZcbiAgICAhcmVxVXNlclxuICApIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBsb2dpbiB0byBjb250aW51ZS4nO1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVNYXN0ZXIgJiYgIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBNYXN0ZXIga2V5IGlzIHJlcXVpcmVkIHRvIGNvbXBsZXRlIHRoaXMgcmVxdWVzdC4nO1xuICB9XG4gIGxldCBwYXJhbXMgPSByZXF1ZXN0LnBhcmFtcyB8fCB7fTtcbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcGFyYW1zID0gcmVxdWVzdC5vYmplY3QudG9KU09OKCk7XG4gIH1cbiAgY29uc3QgcmVxdWlyZWRQYXJhbSA9IGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc3BlY2lmeSBkYXRhIGZvciAke2tleX0uYDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgdmFsaWRhdGVPcHRpb25zID0gYXN5bmMgKG9wdCwga2V5LCB2YWwpID0+IHtcbiAgICBsZXQgb3B0cyA9IG9wdC5vcHRpb25zO1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3B0cyh2YWwpO1xuICAgICAgICBpZiAoIXJlc3VsdCAmJiByZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICghZSkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGUubWVzc2FnZSB8fCBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3B0cykpIHtcbiAgICAgIG9wdHMgPSBbb3B0Lm9wdGlvbnNdO1xuICAgIH1cblxuICAgIGlmICghb3B0cy5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICB0aHJvdyAoXG4gICAgICAgIG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgb3B0aW9uIGZvciAke2tleX0uIEV4cGVjdGVkOiAke29wdHMuam9pbignLCAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnJykudG9Mb3dlckNhc2UoKTtcbiAgfTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5maWVsZHMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5maWVsZHNba2V5XTtcbiAgICAgIGxldCB2YWwgPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlZFBhcmFtKG9wdCk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwgJiYgdmFsID09IG51bGwpIHtcbiAgICAgICAgICB2YWwgPSBvcHQuZGVmYXVsdDtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHZhbDtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQuY29uc3RhbnQgJiYgcmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vcmlnaW5hbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3QucmV2ZXJ0KGtleSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCBvcHQuZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQucmVxdWlyZWQpIHtcbiAgICAgICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb3B0aW9uYWwgPSAhb3B0LnJlcXVpcmVkICYmIHZhbCA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIW9wdGlvbmFsKSB7XG4gICAgICAgICAgaWYgKG9wdC50eXBlKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gZ2V0VHlwZShvcHQudHlwZSk7XG4gICAgICAgICAgICBjb25zdCB2YWxUeXBlID0gQXJyYXkuaXNBcnJheSh2YWwpID8gJ2FycmF5JyA6IHR5cGVvZiB2YWw7XG4gICAgICAgICAgICBpZiAodmFsVHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHt0eXBlfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHZhbCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbiAgbGV0IHVzZXJSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcztcbiAgbGV0IHJlcXVpcmVBbGxSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcztcbiAgY29uc3QgcHJvbWlzZXMgPSBbUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKV07XG4gIGlmICh1c2VyUm9sZXMgfHwgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgcHJvbWlzZXNbMF0gPSBhdXRoLmdldFVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgdXNlclJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMV0gPSB1c2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHJlcXVpcmVBbGxSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzJdID0gcmVxdWlyZUFsbFJvbGVzKCk7XG4gIH1cbiAgY29uc3QgW3JvbGVzLCByZXNvbHZlZFVzZXJSb2xlcywgcmVzb2x2ZWRSZXF1aXJlQWxsXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgaWYgKHJlc29sdmVkVXNlclJvbGVzICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRVc2VyUm9sZXMpKSB7XG4gICAgdXNlclJvbGVzID0gcmVzb2x2ZWRVc2VyUm9sZXM7XG4gIH1cbiAgaWYgKHJlc29sdmVkUmVxdWlyZUFsbCAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkUmVxdWlyZUFsbCkpIHtcbiAgICByZXF1aXJlQWxsUm9sZXMgPSByZXNvbHZlZFJlcXVpcmVBbGw7XG4gIH1cbiAgaWYgKHVzZXJSb2xlcykge1xuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyUm9sZXMuc29tZShyZXF1aXJlZFJvbGUgPT4gcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpO1xuICAgIGlmICghaGFzUm9sZSkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgIH1cbiAgfVxuICBpZiAocmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgZm9yIChjb25zdCByZXF1aXJlZFJvbGUgb2YgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgICBpZiAoIXJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCBhbGwgdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHVzZXJLZXlzID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMgfHwgW107XG4gIGlmIChBcnJheS5pc0FycmF5KHVzZXJLZXlzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHVzZXJLZXlzKSB7XG4gICAgICBpZiAoIXJlcVVzZXIpIHtcbiAgICAgICAgdGhyb3cgJ1BsZWFzZSBsb2dpbiB0byBtYWtlIHRoaXMgcmVxdWVzdC4nO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxVXNlci5nZXQoa2V5KSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNldCBkYXRhIGZvciAke2tleX0gb24geW91ciBhY2NvdW50LmA7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiB1c2VyS2V5cyA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5c1trZXldO1xuICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCByZXFVc2VyLmdldChrZXkpKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyaWdnZXIgPSBnZXRUcmlnZ2VyKHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHsgcmV0dXJuIHJlc29sdmUoKTsgfVxuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIHRyaWdnZXJUeXBlLnN0YXJ0c1dpdGgoJ2FmdGVyJylcbiAgICAgICAgICAgID8gY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICAgICAgICAgIDogY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgaWYgKHJlcXVlc3QuZm9yY2VEb3dubG9hZCkge1xuICAgICAgICBmaWxlT2JqZWN0LmZvcmNlRG93bmxvYWQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG4gIHJldHVybiBmaWxlT2JqZWN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5HbG9iYWxDb25maWdUcmlnZ2VyKHRyaWdnZXJUeXBlLCBhdXRoLCBjb25maWdPYmplY3QsIG9yaWdpbmFsQ29uZmlnT2JqZWN0LCBjb25maWcsIGNvbnRleHQpIHtcbiAgY29uc3QgR2xvYmFsQ29uZmlnQ2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKFBhcnNlLkNvbmZpZyk7XG4gIGNvbnN0IGNvbmZpZ1RyaWdnZXIgPSBnZXRUcmlnZ2VyKEdsb2JhbENvbmZpZ0NsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHR5cGVvZiBjb25maWdUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBjb25maWdPYmplY3QsIG9yaWdpbmFsQ29uZmlnT2JqZWN0LCBjb25maWcsIGNvbnRleHQpO1xuICAgICAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7R2xvYmFsQ29uZmlnQ2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIGNvbmZpZ09iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpZ1RyaWdnZXIocmVxdWVzdCk7XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuQ29uZmlnJyxcbiAgICAgICAgY29uZmlnT2JqZWN0LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZVN1Y2Nlc3NcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGNvbmZpZ09iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5Db25maWcnLFxuICAgICAgICBjb25maWdPYmplY3QsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGVycm9yLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29uZmlnT2JqZWN0O1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRCxPQUFBO0FBQWtDLFNBQUFELHVCQUFBRyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRmxDOztBQUlPLE1BQU1HLEtBQUssR0FBQUMsT0FBQSxDQUFBRCxLQUFBLEdBQUc7RUFDbkJFLFdBQVcsRUFBRSxhQUFhO0VBQzFCQyxVQUFVLEVBQUUsWUFBWTtFQUN4QkMsV0FBVyxFQUFFLGFBQWE7RUFDMUJD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