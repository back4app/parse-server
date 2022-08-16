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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const Types = {
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
exports.Types = Types;
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
  const path = name.split('.');
  path.splice(-1); // remove last component

  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];

  for (const component of path) {
    store = store[component];

    if (!store) {
      return undefined;
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

  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.afterFind) {
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
} // Creates the response object, and uses the request object to pass data
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
      } // Use the JSON response


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

function logTriggerAfterHook(triggerType, className, input, auth) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));

  _logger.logger.info(`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));

  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));

  _logger.logger.info(`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerErrorBeforeHook(triggerType, className, input, auth, error) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));

  _logger.logger.error(`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
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
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth);
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
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth);
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

  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED; // If it's an error, mark it as a script failed

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
} // To be used as part of the promise chain when saving/deleting an object
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
    if (!trigger) return resolve();
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context);
    var {
      success,
      error
    } = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth);

      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
        Object.assign(context, request.context);
      }

      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error);
      reject(error);
    }); // AfterSave and afterDelete triggers can return a promise, which if they
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
        logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth);
      } // beforeSave is expected to return null (nothing)


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
} // Converts a REST-format object to a Parse.Object
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
      }), result, auth);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), auth, error);
      throw error;
    }
  }

  return fileObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZUNvbm5lY3QiLCJiZWZvcmVTdWJzY3JpYmUiLCJhZnRlckV2ZW50IiwiQ29ubmVjdENsYXNzTmFtZSIsImJhc2VTdG9yZSIsIlZhbGlkYXRvcnMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJsb2dnZXIiLCJ3YXJuIiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsInRyaWdnZXJFeGlzdHMiLCJnZXRGdW5jdGlvbiIsImdldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzIiwiZXh0cmFjdEZ1bmN0aW9uTmFtZXMiLCJuYW1lc3BhY2UiLCJ2YWx1ZSIsImdldEpvYiIsImdldEpvYnMiLCJtYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yIiwiZ2V0UmVxdWVzdE9iamVjdCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJ0cmlnZ2VyTmFtZSIsIm1hc3RlciIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJoZWFkZXJzIiwiaXAiLCJvcmlnaW5hbCIsImFzc2lnbiIsImlzTWFzdGVyIiwidXNlciIsImluc3RhbGxhdGlvbklkIiwiZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0IiwicXVlcnkiLCJjb3VudCIsImlzR2V0IiwiZ2V0UmVzcG9uc2VPYmplY3QiLCJyZXNvbHZlIiwicmVqZWN0Iiwic3VjY2VzcyIsInJlc3BvbnNlIiwib2JqZWN0cyIsIm1hcCIsImVxdWFscyIsIl9nZXRTYXZlSlNPTiIsImlkIiwiZXJyb3IiLCJlIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJsb2dUcmlnZ2VyQWZ0ZXJIb29rIiwiaW5wdXQiLCJjbGVhbklucHV0IiwidHJ1bmNhdGVMb2dNZXNzYWdlIiwiSlNPTiIsInN0cmluZ2lmeSIsImluZm8iLCJsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2siLCJyZXN1bHQiLCJjbGVhblJlc3VsdCIsImxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2siLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJQcm9taXNlIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJkZWZhdWx0T3B0cyIsInN0YWNrIiwidGhlVmFsaWRhdG9yIiwiYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IiLCJjYXRjaCIsIlZBTElEQVRJT05fRVJST1IiLCJvcHRpb25zIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJyZXFVc2VyIiwiZXhpc3RlZCIsInJlcXVpcmVVc2VyIiwicmVxdWlyZUFueVVzZXJSb2xlcyIsInJlcXVpcmVBbGxVc2VyUm9sZXMiLCJyZXF1aXJlTWFzdGVyIiwicGFyYW1zIiwicmVxdWlyZWRQYXJhbSIsInZhbGlkYXRlT3B0aW9ucyIsIm9wdCIsIm9wdHMiLCJBcnJheSIsImlzQXJyYXkiLCJpbmNsdWRlcyIsImpvaW4iLCJnZXRUeXBlIiwiZm4iLCJtYXRjaCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJmaWVsZHMiLCJvcHRpb25Qcm9taXNlcyIsImRlZmF1bHQiLCJzZXQiLCJjb25zdGFudCIsInJldmVydCIsInJlcXVpcmVkIiwib3B0aW9uYWwiLCJ2YWxUeXBlIiwiYWxsIiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInByb21pc2UiLCJpbmZsYXRlIiwiZGF0YSIsInJlc3RPYmplY3QiLCJjb3B5IiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImdldFJlcXVlc3RGaWxlT2JqZWN0IiwiZmlsZU9iamVjdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJGaWxlQ2xhc3NOYW1lIiwiRmlsZSIsImZpbGVUcmlnZ2VyIiwiZmlsZSIsImZpbGVTaXplIl0sInNvdXJjZXMiOlsiLi4vc3JjL3RyaWdnZXJzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGFmdGVyTG9naW46ICdhZnRlckxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlQ29ubmVjdDogJ2JlZm9yZUNvbm5lY3QnLFxuICBiZWZvcmVTdWJzY3JpYmU6ICdiZWZvcmVTdWJzY3JpYmUnLFxuICBhZnRlckV2ZW50OiAnYWZ0ZXJFdmVudCcsXG59O1xuXG5jb25zdCBDb25uZWN0Q2xhc3NOYW1lID0gJ0BDb25uZWN0JztcblxuY29uc3QgYmFzZVN0b3JlID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBWYWxpZGF0b3JzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbiAoYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0ge307XG4gICAgcmV0dXJuIGJhc2U7XG4gIH0sIHt9KTtcbiAgY29uc3QgRnVuY3Rpb25zID0ge307XG4gIGNvbnN0IEpvYnMgPSB7fTtcbiAgY29uc3QgTGl2ZVF1ZXJ5ID0gW107XG4gIGNvbnN0IFRyaWdnZXJzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbiAoYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0ge307XG4gICAgcmV0dXJuIGJhc2U7XG4gIH0sIHt9KTtcblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgRnVuY3Rpb25zLFxuICAgIEpvYnMsXG4gICAgVmFsaWRhdG9ycyxcbiAgICBUcmlnZ2VycyxcbiAgICBMaXZlUXVlcnksXG4gIH0pO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXNzTmFtZShwYXJzZUNsYXNzKSB7XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MuY2xhc3NOYW1lKSB7XG4gICAgcmV0dXJuIHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICB9XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MubmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLm5hbWUucmVwbGFjZSgnUGFyc2UnLCAnQCcpO1xuICB9XG4gIHJldHVybiBwYXJzZUNsYXNzO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSkge1xuICBpZiAodHlwZSA9PSBUeXBlcy5iZWZvcmVTYXZlICYmIGNsYXNzTmFtZSA9PT0gJ19QdXNoU3RhdHVzJykge1xuICAgIC8vIF9QdXNoU3RhdHVzIHVzZXMgdW5kb2N1bWVudGVkIG5lc3RlZCBrZXkgaW5jcmVtZW50IG9wc1xuICAgIC8vIGFsbG93aW5nIGJlZm9yZVNhdmUgd291bGQgbWVzcyB1cCB0aGUgb2JqZWN0cyBiaWcgdGltZVxuICAgIC8vIFRPRE86IEFsbG93IHByb3BlciBkb2N1bWVudGVkIHdheSBvZiB1c2luZyBuZXN0ZWQgaW5jcmVtZW50IG9wc1xuICAgIHRocm93ICdPbmx5IGFmdGVyU2F2ZSBpcyBhbGxvd2VkIG9uIF9QdXNoU3RhdHVzJztcbiAgfVxuICBpZiAoKHR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8IHR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4pICYmIGNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1VzZXIgY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGJlZm9yZUxvZ2luIGFuZCBhZnRlckxvZ2luIHRyaWdnZXJzJztcbiAgfVxuICBpZiAodHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dvdXQgJiYgY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfU2Vzc2lvbiBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlci4nO1xuICB9XG4gIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgdHlwZSAhPT0gVHlwZXMuYWZ0ZXJMb2dvdXQpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIgaXMgYWxsb3dlZCBmb3IgdGhlIF9TZXNzaW9uIGNsYXNzLic7XG4gIH1cbiAgcmV0dXJuIGNsYXNzTmFtZTtcbn1cblxuY29uc3QgX3RyaWdnZXJTdG9yZSA9IHt9O1xuXG5jb25zdCBDYXRlZ29yeSA9IHtcbiAgRnVuY3Rpb25zOiAnRnVuY3Rpb25zJyxcbiAgVmFsaWRhdG9yczogJ1ZhbGlkYXRvcnMnLFxuICBKb2JzOiAnSm9icycsXG4gIFRyaWdnZXJzOiAnVHJpZ2dlcnMnLFxufTtcblxuZnVuY3Rpb24gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgcGF0aCA9IG5hbWUuc3BsaXQoJy4nKTtcbiAgcGF0aC5zcGxpY2UoLTEpOyAvLyByZW1vdmUgbGFzdCBjb21wb25lbnRcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIGxldCBzdG9yZSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bY2F0ZWdvcnldO1xuICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBwYXRoKSB7XG4gICAgc3RvcmUgPSBzdG9yZVtjb21wb25lbnRdO1xuICAgIGlmICghc3RvcmUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdG9yZTtcbn1cblxuZnVuY3Rpb24gYWRkKGNhdGVnb3J5LCBuYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGlmIChzdG9yZVtsYXN0Q29tcG9uZW50XSkge1xuICAgIGxvZ2dlci53YXJuKFxuICAgICAgYFdhcm5pbmc6IER1cGxpY2F0ZSBjbG91ZCBmdW5jdGlvbnMgZXhpc3QgZm9yICR7bGFzdENvbXBvbmVudH0uIE9ubHkgdGhlIGxhc3Qgb25lIHdpbGwgYmUgdXNlZCBhbmQgdGhlIG90aGVycyB3aWxsIGJlIGlnbm9yZWQuYFxuICAgICk7XG4gIH1cbiAgc3RvcmVbbGFzdENvbXBvbmVudF0gPSBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiByZW1vdmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgZGVsZXRlIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5mdW5jdGlvbiBnZXQoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgcmV0dXJuIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRKb2Ioam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpO1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkQ29ubmVjdFRyaWdnZXIodHlwZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke0Nvbm5lY3RDbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke0Nvbm5lY3RDbGFzc05hbWV9YCwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyKGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LnB1c2goaGFuZGxlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZVRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBfdW5yZWdpc3RlckFsbCgpIHtcbiAgT2JqZWN0LmtleXMoX3RyaWdnZXJTdG9yZSkuZm9yRWFjaChhcHBJZCA9PiBkZWxldGUgX3RyaWdnZXJTdG9yZVthcHBJZF0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9KU09Od2l0aE9iamVjdHMob2JqZWN0LCBjbGFzc05hbWUpIHtcbiAgaWYgKCFvYmplY3QgfHwgIW9iamVjdC50b0pTT04pIHtcbiAgICByZXR1cm4ge307XG4gIH1cbiAgY29uc3QgdG9KU09OID0gb2JqZWN0LnRvSlNPTigpO1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHMob2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKSk7XG4gIGZvciAoY29uc3Qga2V5IGluIHBlbmRpbmcpIHtcbiAgICBjb25zdCB2YWwgPSBvYmplY3QuZ2V0KGtleSk7XG4gICAgaWYgKCF2YWwgfHwgIXZhbC5fdG9GdWxsSlNPTikge1xuICAgICAgdG9KU09OW2tleV0gPSB2YWw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgdG9KU09OW2tleV0gPSB2YWwuX3RvRnVsbEpTT04oKTtcbiAgfVxuICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgdG9KU09OLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gdG9KU09OO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBhcHBsaWNhdGlvbklkKSB7XG4gIGlmICghYXBwbGljYXRpb25JZCkge1xuICAgIHRocm93ICdNaXNzaW5nIEFwcGxpY2F0aW9uSUQnO1xuICB9XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blRyaWdnZXIodHJpZ2dlciwgbmFtZSwgcmVxdWVzdCwgYXV0aCkge1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgbmFtZSwgYXV0aCk7XG4gIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiBhd2FpdCB0cmlnZ2VyKHJlcXVlc3QpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlckV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nLCBhcHBsaWNhdGlvbklkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKSAhPSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbk5hbWVzKGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3Qgc3RvcmUgPVxuICAgIChfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdICYmIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bQ2F0ZWdvcnkuRnVuY3Rpb25zXSkgfHwge307XG4gIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBbXTtcbiAgY29uc3QgZXh0cmFjdEZ1bmN0aW9uTmFtZXMgPSAobmFtZXNwYWNlLCBzdG9yZSkgPT4ge1xuICAgIE9iamVjdC5rZXlzKHN0b3JlKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBzdG9yZVtuYW1lXTtcbiAgICAgIGlmIChuYW1lc3BhY2UpIHtcbiAgICAgICAgbmFtZSA9IGAke25hbWVzcGFjZX0uJHtuYW1lfWA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZXMucHVzaChuYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG5hbWUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbiAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobnVsbCwgc3RvcmUpO1xuICByZXR1cm4gZnVuY3Rpb25OYW1lcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYihqb2JOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2JzKGFwcGxpY2F0aW9uSWQpIHtcbiAgdmFyIG1hbmFnZXIgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdO1xuICBpZiAobWFuYWdlciAmJiBtYW5hZ2VyLkpvYnMpIHtcbiAgICByZXR1cm4gbWFuYWdlci5Kb2JzO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RPYmplY3QoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgb2JqZWN0OiBwYXJzZU9iamVjdCxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRmluZFxuICApIHtcbiAgICAvLyBTZXQgYSBjb3B5IG9mIHRoZSBjb250ZXh0IG9uIHRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICByZXF1ZXN0LmNvbnRleHQgPSBPYmplY3QuYXNzaWduKHt9LCBjb250ZXh0KTtcbiAgfVxuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RRdWVyeU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgcXVlcnksIGNvdW50LCBjb25maWcsIGNvbnRleHQsIGlzR2V0KSB7XG4gIGlzR2V0ID0gISFpc0dldDtcblxuICB2YXIgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgcXVlcnksXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBjb3VudCxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGlzR2V0LFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gICAgY29udGV4dDogY29udGV4dCB8fCB7fSxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICAvLyBVc2UgdGhlIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhcmVxdWVzdC5vYmplY3QuZXF1YWxzKHJlc3BvbnNlKSAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICAgIH1cbiAgICAgIHJlc3BvbnNlID0ge307XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSByZXF1ZXN0Lm9iamVjdC5fZ2V0U2F2ZUpTT04oKTtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddWydvYmplY3RJZCddID0gcmVxdWVzdC5vYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVycm9yLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIHJlamVjdChlKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VySWRGb3JMb2coYXV0aCkge1xuICByZXR1cm4gYXV0aCAmJiBhdXRoLnVzZXIgPyBhdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgUmVzdWx0OiAke2NsZWFuUmVzdWx0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBlcnJvcikge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuZXJyb3IoXG4gICAgYCR7dHJpZ2dlclR5cGV9IGZhaWxlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgZXJyb3IsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICBvYmplY3RzLFxuICBjb25maWcsXG4gIHF1ZXJ5LFxuICBjb250ZXh0XG4pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgbnVsbCwgbnVsbCwgY29uZmlnLCBjb250ZXh0KTtcbiAgICBpZiAocXVlcnkpIHtcbiAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCAnQWZ0ZXJGaW5kJywgSlNPTi5zdHJpbmdpZnkob2JqZWN0cyksIGF1dGgpO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksIGF1dGgpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNvbnRleHQsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCByZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSByZXN0V2hlcmU7XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuXG4gIGxldCBjb3VudCA9IGZhbHNlO1xuICBpZiAocmVzdE9wdGlvbnMpIHtcbiAgICBjb3VudCA9ICEhcmVzdE9wdGlvbnMuY291bnQ7XG4gIH1cbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgICB0cmlnZ2VyVHlwZSxcbiAgICBhdXRoLFxuICAgIHBhcnNlUXVlcnksXG4gICAgY291bnQsXG4gICAgY29uZmlnLFxuICAgIGNvbnRleHQsXG4gICAgaXNHZXRcbiAgKTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3RPYmplY3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiByZXF1ZXN0T2JqZWN0LnF1ZXJ5O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdE9iamVjdCk7XG4gICAgfSlcbiAgICAudGhlbihcbiAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgIGxldCBxdWVyeVJlc3VsdCA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICAgICAgICBxdWVyeVJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBqc29uUXVlcnkgPSBxdWVyeVJlc3VsdC50b0pTT04oKTtcbiAgICAgICAgaWYgKGpzb25RdWVyeS53aGVyZSkge1xuICAgICAgICAgIHJlc3RXaGVyZSA9IGpzb25RdWVyeS53aGVyZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmxpbWl0KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5saW1pdCA9IGpzb25RdWVyeS5saW1pdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LnNraXApIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnNraXAgPSBqc29uUXVlcnkuc2tpcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmluY2x1ZGUpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBqc29uUXVlcnkuaW5jbHVkZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4Y2x1ZGVLZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IGpzb25RdWVyeS5leGNsdWRlS2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4cGxhaW4pIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4cGxhaW4gPSBqc29uUXVlcnkuZXhwbGFpbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmtleXMgPSBqc29uUXVlcnkua2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5Lm9yZGVyKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5vcmRlciA9IGpzb25RdWVyeS5vcmRlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmhpbnQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmhpbnQgPSBqc29uUXVlcnkuaGludDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUVycm9yKG1lc3NhZ2UsIGRlZmF1bHRPcHRzKSB7XG4gIGlmICghZGVmYXVsdE9wdHMpIHtcbiAgICBkZWZhdWx0T3B0cyA9IHt9O1xuICB9XG4gIGlmICghbWVzc2FnZSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICBkZWZhdWx0T3B0cy5tZXNzYWdlIHx8ICdTY3JpcHQgZmFpbGVkLidcbiAgICApO1xuICB9XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIGNvbnN0IGNvZGUgPSBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQ7XG4gIC8vIElmIGl0J3MgYW4gZXJyb3IsIG1hcmsgaXQgYXMgYSBzY3JpcHQgZmFpbGVkXG4gIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UpO1xuICB9XG4gIGNvbnN0IGVycm9yID0gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UubWVzc2FnZSB8fCBtZXNzYWdlKTtcbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgIGVycm9yLnN0YWNrID0gbWVzc2FnZS5zdGFjaztcbiAgfVxuICByZXR1cm4gZXJyb3I7XG59XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgZnVuY3Rpb25OYW1lLCBhdXRoKSB7XG4gIGNvbnN0IHRoZVZhbGlkYXRvciA9IGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRoZVZhbGlkYXRvcikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCcgJiYgdGhlVmFsaWRhdG9yLnNraXBXaXRoTWFzdGVyS2V5ICYmIHJlcXVlc3QubWFzdGVyKSB7XG4gICAgcmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnXG4gICAgICAgICAgPyBidWlsdEluVHJpZ2dlclZhbGlkYXRvcih0aGVWYWxpZGF0b3IsIHJlcXVlc3QsIGF1dGgpXG4gICAgICAgICAgOiB0aGVWYWxpZGF0b3IocmVxdWVzdCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBmYWlsZWQuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcbiAgfSk7XG59XG5hc3luYyBmdW5jdGlvbiBidWlsdEluVHJpZ2dlclZhbGlkYXRvcihvcHRpb25zLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmIChyZXF1ZXN0Lm1hc3RlciAmJiAhb3B0aW9ucy52YWxpZGF0ZU1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgcmVxVXNlciA9IHJlcXVlc3QudXNlcjtcbiAgaWYgKFxuICAgICFyZXFVc2VyICYmXG4gICAgcmVxdWVzdC5vYmplY3QgJiZcbiAgICByZXF1ZXN0Lm9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAhcmVxdWVzdC5vYmplY3QuZXhpc3RlZCgpXG4gICkge1xuICAgIHJlcVVzZXIgPSByZXF1ZXN0Lm9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgKG9wdGlvbnMucmVxdWlyZVVzZXIgfHwgb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzIHx8IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcykgJiZcbiAgICAhcmVxVXNlclxuICApIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBsb2dpbiB0byBjb250aW51ZS4nO1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVNYXN0ZXIgJiYgIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBNYXN0ZXIga2V5IGlzIHJlcXVpcmVkIHRvIGNvbXBsZXRlIHRoaXMgcmVxdWVzdC4nO1xuICB9XG4gIGxldCBwYXJhbXMgPSByZXF1ZXN0LnBhcmFtcyB8fCB7fTtcbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcGFyYW1zID0gcmVxdWVzdC5vYmplY3QudG9KU09OKCk7XG4gIH1cbiAgY29uc3QgcmVxdWlyZWRQYXJhbSA9IGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc3BlY2lmeSBkYXRhIGZvciAke2tleX0uYDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgdmFsaWRhdGVPcHRpb25zID0gYXN5bmMgKG9wdCwga2V5LCB2YWwpID0+IHtcbiAgICBsZXQgb3B0cyA9IG9wdC5vcHRpb25zO1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3B0cyh2YWwpO1xuICAgICAgICBpZiAoIXJlc3VsdCAmJiByZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICghZSkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGUubWVzc2FnZSB8fCBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3B0cykpIHtcbiAgICAgIG9wdHMgPSBbb3B0Lm9wdGlvbnNdO1xuICAgIH1cblxuICAgIGlmICghb3B0cy5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICB0aHJvdyAoXG4gICAgICAgIG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgb3B0aW9uIGZvciAke2tleX0uIEV4cGVjdGVkOiAke29wdHMuam9pbignLCAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnJykudG9Mb3dlckNhc2UoKTtcbiAgfTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5maWVsZHMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5maWVsZHNba2V5XTtcbiAgICAgIGxldCB2YWwgPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlZFBhcmFtKG9wdCk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwgJiYgdmFsID09IG51bGwpIHtcbiAgICAgICAgICB2YWwgPSBvcHQuZGVmYXVsdDtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHZhbDtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQuY29uc3RhbnQgJiYgcmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vcmlnaW5hbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3QucmV2ZXJ0KGtleSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCBvcHQuZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQucmVxdWlyZWQpIHtcbiAgICAgICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb3B0aW9uYWwgPSAhb3B0LnJlcXVpcmVkICYmIHZhbCA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIW9wdGlvbmFsKSB7XG4gICAgICAgICAgaWYgKG9wdC50eXBlKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gZ2V0VHlwZShvcHQudHlwZSk7XG4gICAgICAgICAgICBjb25zdCB2YWxUeXBlID0gQXJyYXkuaXNBcnJheSh2YWwpID8gJ2FycmF5JyA6IHR5cGVvZiB2YWw7XG4gICAgICAgICAgICBpZiAodmFsVHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHt0eXBlfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHZhbCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbiAgbGV0IHVzZXJSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcztcbiAgbGV0IHJlcXVpcmVBbGxSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcztcbiAgY29uc3QgcHJvbWlzZXMgPSBbUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKV07XG4gIGlmICh1c2VyUm9sZXMgfHwgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgcHJvbWlzZXNbMF0gPSBhdXRoLmdldFVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgdXNlclJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMV0gPSB1c2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHJlcXVpcmVBbGxSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzJdID0gcmVxdWlyZUFsbFJvbGVzKCk7XG4gIH1cbiAgY29uc3QgW3JvbGVzLCByZXNvbHZlZFVzZXJSb2xlcywgcmVzb2x2ZWRSZXF1aXJlQWxsXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgaWYgKHJlc29sdmVkVXNlclJvbGVzICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRVc2VyUm9sZXMpKSB7XG4gICAgdXNlclJvbGVzID0gcmVzb2x2ZWRVc2VyUm9sZXM7XG4gIH1cbiAgaWYgKHJlc29sdmVkUmVxdWlyZUFsbCAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkUmVxdWlyZUFsbCkpIHtcbiAgICByZXF1aXJlQWxsUm9sZXMgPSByZXNvbHZlZFJlcXVpcmVBbGw7XG4gIH1cbiAgaWYgKHVzZXJSb2xlcykge1xuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyUm9sZXMuc29tZShyZXF1aXJlZFJvbGUgPT4gcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpO1xuICAgIGlmICghaGFzUm9sZSkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgIH1cbiAgfVxuICBpZiAocmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgZm9yIChjb25zdCByZXF1aXJlZFJvbGUgb2YgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgICBpZiAoIXJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCBhbGwgdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHVzZXJLZXlzID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMgfHwgW107XG4gIGlmIChBcnJheS5pc0FycmF5KHVzZXJLZXlzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHVzZXJLZXlzKSB7XG4gICAgICBpZiAoIXJlcVVzZXIpIHtcbiAgICAgICAgdGhyb3cgJ1BsZWFzZSBsb2dpbiB0byBtYWtlIHRoaXMgcmVxdWVzdC4nO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxVXNlci5nZXQoa2V5KSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNldCBkYXRhIGZvciAke2tleX0gb24geW91ciBhY2NvdW50LmA7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiB1c2VyS2V5cyA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5c1trZXldO1xuICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCByZXFVc2VyLmdldChrZXkpKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyaWdnZXIgPSBnZXRUcmlnZ2VyKHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHJldHVybiByZXNvbHZlKCk7XG4gICAgdmFyIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBhdXRoLFxuICAgICAgcGFyc2VPYmplY3QsXG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgY29uZmlnLFxuICAgICAgY29udGV4dFxuICAgICk7XG4gICAgdmFyIHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgIGF1dGhcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGVcbiAgICAgICAgKSB7XG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihjb250ZXh0LCByZXF1ZXN0LmNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHJlc29sdmUob2JqZWN0KTtcbiAgICAgIH0sXG4gICAgICBlcnJvciA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgZXJyb3JcbiAgICAgICAgKTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQWZ0ZXJTYXZlIGFuZCBhZnRlckRlbGV0ZSB0cmlnZ2VycyBjYW4gcmV0dXJuIGEgcHJvbWlzZSwgd2hpY2ggaWYgdGhleVxuICAgIC8vIGRvLCBuZWVkcyB0byBiZSByZXNvbHZlZCBiZWZvcmUgdGhpcyBwcm9taXNlIGlzIHJlc29sdmVkLFxuICAgIC8vIHNvIHRyaWdnZXIgZXhlY3V0aW9uIGlzIHN5bmNlZCB3aXRoIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICAvLyBJZiB0cmlnZ2VycyBkbyBub3QgcmV0dXJuIGEgcHJvbWlzZSwgdGhleSBjYW4gcnVuIGFzeW5jIGNvZGUgcGFyYWxsZWxcbiAgICAvLyB0byB0aGUgUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7cGFyc2VPYmplY3QuY2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW5cbiAgICAgICAgKSB7XG4gICAgICAgICAgbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgcGFyc2VPYmplY3QuY2xhc3NOYW1lLCBwYXJzZU9iamVjdC50b0pTT04oKSwgYXV0aCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYXliZVJ1bkZpbGVUcmlnZ2VyKHRyaWdnZXJUeXBlLCBmaWxlT2JqZWN0LCBjb25maWcsIGF1dGgpIHtcbiAgY29uc3QgRmlsZUNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShQYXJzZS5GaWxlKTtcbiAgY29uc3QgZmlsZVRyaWdnZXIgPSBnZXRUcmlnZ2VyKEZpbGVDbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICh0eXBlb2YgZmlsZVRyaWdnZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpO1xuICAgICAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiBmaWxlT2JqZWN0O1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZVRyaWdnZXIocmVxdWVzdCk7XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGhcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGZpbGVPYmplY3Q7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICBhdXRoLFxuICAgICAgICBlcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmlsZU9iamVjdDtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sTUFBTUEsS0FBSyxHQUFHO0VBQ25CQyxXQUFXLEVBQUUsYUFETTtFQUVuQkMsVUFBVSxFQUFFLFlBRk87RUFHbkJDLFdBQVcsRUFBRSxhQUhNO0VBSW5CQyxVQUFVLEVBQUUsWUFKTztFQUtuQkMsU0FBUyxFQUFFLFdBTFE7RUFNbkJDLFlBQVksRUFBRSxjQU5LO0VBT25CQyxXQUFXLEVBQUUsYUFQTTtFQVFuQkMsVUFBVSxFQUFFLFlBUk87RUFTbkJDLFNBQVMsRUFBRSxXQVRRO0VBVW5CQyxhQUFhLEVBQUUsZUFWSTtFQVduQkMsZUFBZSxFQUFFLGlCQVhFO0VBWW5CQyxVQUFVLEVBQUU7QUFaTyxDQUFkOztBQWVQLE1BQU1DLGdCQUFnQixHQUFHLFVBQXpCOztBQUVBLE1BQU1DLFNBQVMsR0FBRyxZQUFZO0VBQzVCLE1BQU1DLFVBQVUsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVlqQixLQUFaLEVBQW1Ca0IsTUFBbkIsQ0FBMEIsVUFBVUMsSUFBVixFQUFnQkMsR0FBaEIsRUFBcUI7SUFDaEVELElBQUksQ0FBQ0MsR0FBRCxDQUFKLEdBQVksRUFBWjtJQUNBLE9BQU9ELElBQVA7RUFDRCxDQUhrQixFQUdoQixFQUhnQixDQUFuQjtFQUlBLE1BQU1FLFNBQVMsR0FBRyxFQUFsQjtFQUNBLE1BQU1DLElBQUksR0FBRyxFQUFiO0VBQ0EsTUFBTUMsU0FBUyxHQUFHLEVBQWxCO0VBQ0EsTUFBTUMsUUFBUSxHQUFHUixNQUFN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