"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addTrigger = addTrigger;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports._unregisterAll = _unregisterAll;
exports.getTrigger = getTrigger;
exports.triggerExists = triggerExists;
exports.getFunction = getFunction;
exports.getFunctionNames = getFunctionNames;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getValidator = getValidator;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.inflate = inflate;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.Types = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _logger = require("./logger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// triggers.js
const Types = {
  beforeLogin: 'beforeLogin',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind'
};
exports.Types = Types;

const baseStore = function () {
  const Validators = {};
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

function validateClassNameForTriggers(className, type) {
  const restrictedClassNames = ['_Session'];

  if (restrictedClassNames.indexOf(className) != -1) {
    throw `Triggers are not supported for ${className} class.`;
  }

  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }

  if (type === Types.beforeLogin && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin trigger';
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

function addTrigger(type, className, handler, applicationId) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
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

function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }

  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
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

  if (triggerType === Types.beforeSave || triggerType === Types.afterSave) {
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

function getRequestQueryObject(triggerType, auth, query, count, config, isGet) {
  isGet = !!isGet;
  var request = {
    triggerName: triggerType,
    query,
    master: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip
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
          return object.toJSON();
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
      }

      return resolve(response);
    },
    error: function (error) {
      if (error instanceof _node.default.Error) {
        reject(error);
      } else if (error instanceof Error) {
        reject(new _node.default.Error(_node.default.Error.SCRIPT_FAILED, error.message));
      } else {
        reject(new _node.default.Error(_node.default.Error.SCRIPT_FAILED, error));
      }
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

function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);

    if (!trigger) {
      return resolve();
    }

    const request = getRequestObject(triggerType, auth, null, null, config);
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
      const response = trigger(request);

      if (response && typeof response.then === 'function') {
        return response.then(results => {
          if (!results) {
            throw new _node.default.Error(_node.default.Error.SCRIPT_FAILED, 'AfterFind expect results to be returned in the promise');
          }

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

function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, isGet) {
  const trigger = getTrigger(className, triggerType, config.applicationId);

  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions
    });
  }

  const parseQuery = new _node.default.Query(className);

  if (restWhere) {
    parseQuery._where = restWhere;
  }

  let count = false;

  if (restOptions) {
    if (restOptions.include && restOptions.include.length > 0) {
      parseQuery._include = restOptions.include.split(',');
    }

    if (restOptions.skip) {
      parseQuery._skip = restOptions.skip;
    }

    if (restOptions.limit) {
      parseQuery._limit = restOptions.limit;
    }

    count = !!restOptions.count;
  }

  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, isGet);
  return Promise.resolve().then(() => {
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

    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }

    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
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
    if (typeof err === 'string') {
      throw new _node.default.Error(1, err);
    } else {
      throw err;
    }
  });
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

      if (triggerType === Types.beforeSave || triggerType === Types.afterSave) {
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
      const promise = trigger(request);

      if (triggerType === Types.afterSave || triggerType === Types.afterDelete) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJhc2VTdG9yZSIsIlZhbGlkYXRvcnMiLCJGdW5jdGlvbnMiLCJKb2JzIiwiTGl2ZVF1ZXJ5IiwiVHJpZ2dlcnMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsImZyZWV6ZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJjbGFzc05hbWUiLCJ0eXBlIiwicmVzdHJpY3RlZENsYXNzTmFtZXMiLCJpbmRleE9mIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsIm5hbWUiLCJhcHBsaWNhdGlvbklkIiwicGF0aCIsInNwbGl0Iiwic3BsaWNlIiwiUGFyc2UiLCJzdG9yZSIsImNvbXBvbmVudCIsInVuZGVmaW5lZCIsImFkZCIsImhhbmRsZXIiLCJsYXN0Q29tcG9uZW50IiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyIiwicHVzaCIsInJlbW92ZUZ1bmN0aW9uIiwicmVtb3ZlVHJpZ2dlciIsIl91bnJlZ2lzdGVyQWxsIiwiZm9yRWFjaCIsImFwcElkIiwiZ2V0VHJpZ2dlciIsInRyaWdnZXJUeXBlIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYXV0aCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJyZXF1ZXN0IiwidHJpZ2dlck5hbWUiLCJvYmplY3QiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJ0b0pTT04iLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJlcnJvciIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJpZCIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJpbnB1dCIsImNsZWFuSW5wdXQiLCJsb2dnZXIiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwiaW5mbyIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIlByb21pc2UiLCJ0cmlnZ2VyIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJfd2hlcmUiLCJpbmNsdWRlIiwibGVuZ3RoIiwiX2luY2x1ZGUiLCJza2lwIiwiX3NraXAiLCJsaW1pdCIsIl9saW1pdCIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsIndoZXJlIiwib3JkZXIiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJtYXliZVJ1blRyaWdnZXIiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0E7O0FBQ0E7Ozs7QUFGQTtBQUlPLE1BQU1BLEtBQUssR0FBRztBQUNuQkMsRUFBQUEsV0FBVyxFQUFFLGFBRE07QUFFbkJDLEVBQUFBLFVBQVUsRUFBRSxZQUZPO0FBR25CQyxFQUFBQSxTQUFTLEVBQUUsV0FIUTtBQUluQkMsRUFBQUEsWUFBWSxFQUFFLGNBSks7QUFLbkJDLEVBQUFBLFdBQVcsRUFBRSxhQUxNO0FBTW5CQyxFQUFBQSxVQUFVLEVBQUUsWUFOTztBQU9uQkMsRUFBQUEsU0FBUyxFQUFFO0FBUFEsQ0FBZDs7O0FBVVAsTUFBTUMsU0FBUyxHQUFHLFlBQVc7QUFDM0IsUUFBTUMsVUFBVSxHQUFHLEVBQW5CO0FBQ0EsUUFBTUMsU0FBUyxHQUFHLEVBQWxCO0FBQ0EsUUFBTUMsSUFBSSxHQUFHLEVBQWI7QUFDQSxRQUFNQyxTQUFTLEdBQUcsRUFBbEI7QUFDQSxRQUFNQyxRQUFRLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZZixLQUFaLEVBQW1CZ0IsTUFBbkIsQ0FBMEIsVUFBU0MsSUFBVCxFQUFlQyxHQUFmLEVBQW9CO0FBQzdERCxJQUFBQSxJQUFJLENBQUNDLEdBQUQsQ0FBSixHQUFZLEVBQVo7QUFDQSxXQUFPRCxJQUFQO0FBQ0QsR0FIZ0IsRUFHZCxFQUhjLENBQWpCO0FBS0EsU0FBT0gsTUFBTSxDQUFDSyxNQUFQLENBQWM7QUFDbkJULElBQUFBLFNBRG1CO0FBRW5CQyxJQUFBQSxJQUZtQjtBQUduQkYsSUFBQUEsVUFIbUI7QUFJbkJJLElBQUFBLFFBSm1CO0FBS25CRCxJQUFBQTtBQUxtQixHQUFkLENBQVA7QUFPRCxD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SnpCLElBOUJJLENBOEJDN0IsT0E5QkQsRUE4QlVPLEtBOUJWLENBQVA7QUErQkQsR0FqRk0sQ0FBUDtBQWtGRCxDLENBRUQ7QUFDQTs7O0FBQ08sU0FBU2dELE9BQVQsQ0FBaUJDLElBQWpCLEVBQXVCQyxVQUF2QixFQUFtQztBQUN4QyxNQUFJQyxJQUFJLEdBQUcsT0FBT0YsSUFBUCxJQUFlLFFBQWYsR0FBMEJBLElBQTFCLEdBQWlDO0FBQUVsSSxJQUFBQSxTQUFTLEVBQUVrSTtBQUFiLEdBQTVDOztBQUNBLE9BQUssSUFBSXJJLEdBQVQsSUFBZ0JzSSxVQUFoQixFQUE0QjtBQUMxQkMsSUFBQUEsSUFBSSxDQUFDdkksR0FBRCxDQUFKLEdBQVlzSSxVQUFVLENBQUN0SSxHQUFELENBQXRCO0FBQ0Q7O0FBQ0QsU0FBT2dCLGNBQU1wQixNQUFOLENBQWE2RyxRQUFiLENBQXNCOEIsSUFBdEIsQ0FBUDtBQUNEOztBQUVNLFNBQVNDLHlCQUFULENBQ0xILElBREssRUFFTHpILGFBQWEsR0FBR0ksY0FBTUosYUFGakIsRUFHTDtBQUNBLE1BQ0UsQ0FBQ0wsYUFBRCxJQUNBLENBQUNBLGFBQWEsQ0FBQ0ssYUFBRCxDQURkLElBRUEsQ0FBQ0wsYUFBYSxDQUFDSyxhQUFELENBQWIsQ0FBNkJsQixTQUhoQyxFQUlFO0FBQ0E7QUFDRDs7QUFDRGEsRUFBQUEsYUFBYSxDQUFDSyxhQUFELENBQWIsQ0FBNkJsQixTQUE3QixDQUF1QzBDLE9BQXZDLENBQStDZixPQUFPLElBQUlBLE9BQU8sQ0FBQ2dILElBQUQsQ0FBakU7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbn07XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICBjb25zdCBWYWxpZGF0b3JzID0ge307XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24oYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0ge307XG4gICAgcmV0dXJuIGJhc2U7XG4gIH0sIHt9KTtcblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgRnVuY3Rpb25zLFxuICAgIEpvYnMsXG4gICAgVmFsaWRhdG9ycyxcbiAgICBUcmlnZ2VycyxcbiAgICBMaXZlUXVlcnksXG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgY29uc3QgcmVzdHJpY3RlZENsYXNzTmFtZXMgPSBbJ19TZXNzaW9uJ107XG4gIGlmIChyZXN0cmljdGVkQ2xhc3NOYW1lcy5pbmRleE9mKGNsYXNzTmFtZSkgIT0gLTEpIHtcbiAgICB0aHJvdyBgVHJpZ2dlcnMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yICR7Y2xhc3NOYW1lfSBjbGFzcy5gO1xuICB9XG4gIGlmICh0eXBlID09IFR5cGVzLmJlZm9yZVNhdmUgJiYgY2xhc3NOYW1lID09PSAnX1B1c2hTdGF0dXMnKSB7XG4gICAgLy8gX1B1c2hTdGF0dXMgdXNlcyB1bmRvY3VtZW50ZWQgbmVzdGVkIGtleSBpbmNyZW1lbnQgb3BzXG4gICAgLy8gYWxsb3dpbmcgYmVmb3JlU2F2ZSB3b3VsZCBtZXNzIHVwIHRoZSBvYmplY3RzIGJpZyB0aW1lXG4gICAgLy8gVE9ETzogQWxsb3cgcHJvcGVyIGRvY3VtZW50ZWQgd2F5IG9mIHVzaW5nIG5lc3RlZCBpbmNyZW1lbnQgb3BzXG4gICAgdGhyb3cgJ09ubHkgYWZ0ZXJTYXZlIGlzIGFsbG93ZWQgb24gX1B1c2hTdGF0dXMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiB0cmlnZ2VyJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgc3RvcmVbbGFzdENvbXBvbmVudF0gPSBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiByZW1vdmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgZGVsZXRlIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5mdW5jdGlvbiBnZXQoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgcmV0dXJuIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRnVuY3Rpb24oXG4gIGZ1bmN0aW9uTmFtZSxcbiAgaGFuZGxlcixcbiAgdmFsaWRhdGlvbkhhbmRsZXIsXG4gIGFwcGxpY2F0aW9uSWRcbikge1xuICBhZGQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRKb2Ioam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlckV4aXN0cyhcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHR5cGU6IHN0cmluZyxcbiAgYXBwbGljYXRpb25JZDogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKSAhPSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbk5hbWVzKGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3Qgc3RvcmUgPVxuICAgIChfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdICYmXG4gICAgICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8XG4gICAge307XG4gIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBbXTtcbiAgY29uc3QgZXh0cmFjdEZ1bmN0aW9uTmFtZXMgPSAobmFtZXNwYWNlLCBzdG9yZSkgPT4ge1xuICAgIE9iamVjdC5rZXlzKHN0b3JlKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBzdG9yZVtuYW1lXTtcbiAgICAgIGlmIChuYW1lc3BhY2UpIHtcbiAgICAgICAgbmFtZSA9IGAke25hbWVzcGFjZX0uJHtuYW1lfWA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZXMucHVzaChuYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG5hbWUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbiAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobnVsbCwgc3RvcmUpO1xuICByZXR1cm4gZnVuY3Rpb25OYW1lcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYihqb2JOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2JzKGFwcGxpY2F0aW9uSWQpIHtcbiAgdmFyIG1hbmFnZXIgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdO1xuICBpZiAobWFuYWdlciAmJiBtYW5hZ2VyLkpvYnMpIHtcbiAgICByZXR1cm4gbWFuYWdlci5Kb2JzO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RPYmplY3QoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgb2JqZWN0OiBwYXJzZU9iamVjdCxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG5cbiAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8IHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAvLyBTZXQgYSBjb3B5IG9mIHRoZSBjb250ZXh0IG9uIHRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICByZXF1ZXN0LmNvbnRleHQgPSBPYmplY3QuYXNzaWduKHt9LCBjb250ZXh0KTtcbiAgfVxuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHF1ZXJ5LFxuICBjb3VudCxcbiAgY29uZmlnLFxuICBpc0dldFxuKSB7XG4gIGlzR2V0ID0gISFpc0dldDtcblxuICB2YXIgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgcXVlcnksXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBjb3VudCxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGlzR2V0LFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSB0aGUgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKFxuICAgICAgICByZXNwb25zZSAmJlxuICAgICAgICB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmXG4gICAgICAgICFyZXF1ZXN0Lm9iamVjdC5lcXVhbHMocmVzcG9uc2UpICYmXG4gICAgICAgIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgICAgfVxuICAgICAgcmVzcG9uc2UgPSB7fTtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXSA9IHJlcXVlc3Qub2JqZWN0Ll9nZXRTYXZlSlNPTigpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCwgZXJyb3IubWVzc2FnZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELCBlcnJvcikpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZXJJZEZvckxvZyhhdXRoKSB7XG4gIHJldHVybiBhdXRoICYmIGF1dGgudXNlciA/IGF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIGlucHV0LFxuICByZXN1bHQsXG4gIGF1dGhcbikge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBjb25zdCBjbGVhblJlc3VsdCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5lcnJvcihcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZ1xuKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIG51bGwsIG51bGwsIGNvbmZpZyk7XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgJ0FmdGVyRmluZCcsXG4gICAgICBKU09OLnN0cmluZ2lmeShvYmplY3RzKSxcbiAgICAgIGF1dGhcbiAgICApO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKCFyZXN1bHRzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgICAgICAgICdBZnRlckZpbmQgZXhwZWN0IHJlc3VsdHMgdG8gYmUgcmV0dXJuZWQgaW4gdGhlIHByb21pc2UnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksIGF1dGgpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBpZiAocmVzdFdoZXJlKSB7XG4gICAgcGFyc2VRdWVyeS5fd2hlcmUgPSByZXN0V2hlcmU7XG4gIH1cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGlmIChyZXN0T3B0aW9ucy5pbmNsdWRlICYmIHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgcGFyc2VRdWVyeS5faW5jbHVkZSA9IHJlc3RPcHRpb25zLmluY2x1ZGUuc3BsaXQoJywnKTtcbiAgICB9XG4gICAgaWYgKHJlc3RPcHRpb25zLnNraXApIHtcbiAgICAgIHBhcnNlUXVlcnkuX3NraXAgPSByZXN0T3B0aW9ucy5za2lwO1xuICAgIH1cbiAgICBpZiAocmVzdE9wdGlvbnMubGltaXQpIHtcbiAgICAgIHBhcnNlUXVlcnkuX2xpbWl0ID0gcmVzdE9wdGlvbnMubGltaXQ7XG4gICAgfVxuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgaXNHZXRcbiAgKTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdE9iamVjdCk7XG4gICAgfSlcbiAgICAudGhlbihcbiAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgIGxldCBxdWVyeVJlc3VsdCA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICAgICAgICBxdWVyeVJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBqc29uUXVlcnkgPSBxdWVyeVJlc3VsdC50b0pTT04oKTtcbiAgICAgICAgaWYgKGpzb25RdWVyeS53aGVyZSkge1xuICAgICAgICAgIHJlc3RXaGVyZSA9IGpzb25RdWVyeS53aGVyZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmxpbWl0KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5saW1pdCA9IGpzb25RdWVyeS5saW1pdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LnNraXApIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnNraXAgPSBqc29uUXVlcnkuc2tpcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmluY2x1ZGUpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBqc29uUXVlcnkuaW5jbHVkZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmtleXMgPSBqc29uUXVlcnkua2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5Lm9yZGVyKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5vcmRlciA9IGpzb25RdWVyeS5vcmRlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID1cbiAgICAgICAgICAgIHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPVxuICAgICAgICAgICAgcmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgZXJyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxLCBlcnIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICk7XG59XG5cbi8vIFRvIGJlIHVzZWQgYXMgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiB3aGVuIHNhdmluZy9kZWxldGluZyBhbiBvYmplY3Rcbi8vIFdpbGwgcmVzb2x2ZSBzdWNjZXNzZnVsbHkgaWYgbm8gdHJpZ2dlciBpcyBjb25maWd1cmVkXG4vLyBSZXNvbHZlcyB0byBhbiBvYmplY3QsIGVtcHR5IG9yIGNvbnRhaW5pbmcgYW4gb2JqZWN0IGtleS4gQSBiZWZvcmVTYXZlXG4vLyB0cmlnZ2VyIHdpbGwgc2V0IHRoZSBvYmplY3Qga2V5IHRvIHRoZSByZXN0IGZvcm1hdCBvYmplY3QgdG8gc2F2ZS5cbi8vIG9yaWdpbmFsUGFyc2VPYmplY3QgaXMgb3B0aW9uYWwsIHdlIG9ubHkgbmVlZCB0aGF0IGZvciBiZWZvcmUvYWZ0ZXJTYXZlIGZ1bmN0aW9uc1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihcbiAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgICApO1xuICAgIGlmICghdHJpZ2dlcikgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB2YXIgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGF1dGgsXG4gICAgICBwYXJzZU9iamVjdCxcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICBjb25maWcsXG4gICAgICBjb250ZXh0XG4gICAgKTtcbiAgICB2YXIgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgYXV0aFxuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgICAgYXV0aFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhcbiAgZGF0YSxcbiAgYXBwbGljYXRpb25JZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWRcbikge1xuICBpZiAoXG4gICAgIV90cmlnZ2VyU3RvcmUgfHxcbiAgICAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fFxuICAgICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuIl19