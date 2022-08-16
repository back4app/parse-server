"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.HooksController = void 0;

var triggers = _interopRequireWildcard(require("../triggers"));

var Parse = _interopRequireWildcard(require("parse/node"));

var _request = _interopRequireDefault(require("../request"));

var _logger = require("../logger");

var _http = _interopRequireDefault(require("http"));

var _https = _interopRequireDefault(require("https"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

// -disable-next
// -disable-next
const DefaultHooksCollectionName = '_Hooks';
const HTTPAgents = {
  http: new _http.default.Agent({
    keepAlive: true
  }),
  https: new _https.default.Agent({
    keepAlive: true
  })
};

class HooksController {
  constructor(applicationId, databaseController, webhookKey) {
    this._applicationId = applicationId;
    this._webhookKey = webhookKey;
    this.database = databaseController;
  }

  load() {
    return this._getHooks().then(hooks => {
      hooks = hooks || [];
      hooks.forEach(hook => {
        this.addHookToTriggers(hook);
      });
    });
  }

  getFunction(functionName) {
    return this._getHooks({
      functionName: functionName
    }).then(results => results[0]);
  }

  getFunctions() {
    return this._getHooks({
      functionName: {
        $exists: true
      }
    });
  }

  getTrigger(className, triggerName) {
    return this._getHooks({
      className: className,
      triggerName: triggerName
    }).then(results => results[0]);
  }

  getTriggers() {
    return this._getHooks({
      className: {
        $exists: true
      },
      triggerName: {
        $exists: true
      }
    });
  }

  deleteFunction(functionName) {
    triggers.removeFunction(functionName, this._applicationId);
    return this._removeHooks({
      functionName: functionName
    });
  }

  deleteTrigger(className, triggerName) {
    triggers.removeTrigger(triggerName, className, this._applicationId);
    return this._removeHooks({
      className: className,
      triggerName: triggerName
    });
  }

  _getHooks(query = {}) {
    return this.database.find(DefaultHooksCollectionName, query).then(results => {
      return results.map(result => {
        delete result.objectId;
        return result;
      });
    });
  }

  _removeHooks(query) {
    return this.database.destroy(DefaultHooksCollectionName, query).then(() => {
      return Promise.resolve({});
    });
  }

  saveHook(hook) {
    var query;

    if (hook.functionName && hook.url) {
      query = {
        functionName: hook.functionName
      };
    } else if (hook.triggerName && hook.className && hook.url) {
      query = {
        className: hook.className,
        triggerName: hook.triggerName
      };
    } else {
      throw new Parse.Error(143, 'invalid hook declaration');
    }

    return this.database.update(DefaultHooksCollectionName, query, hook, {
      upsert: true
    }).then(() => {
      return Promise.resolve(hook);
    });
  }

  addHookToTriggers(hook) {
    var wrappedFunction = wrapToHTTPRequest(hook, this._webhookKey);
    wrappedFunction.url = hook.url;

    if (hook.className) {
      triggers.addTrigger(hook.triggerName, hook.className, wrappedFunction, this._applicationId);
    } else {
      triggers.addFunction(hook.functionName, wrappedFunction, null, this._applicationId);
    }
  }

  addHook(hook) {
    this.addHookToTriggers(hook);
    return this.saveHook(hook);
  }

  createOrUpdateHook(aHook) {
    var hook;

    if (aHook && aHook.functionName && aHook.url) {
      hook = {};
      hook.functionName = aHook.functionName;
      hook.url = aHook.url;
    } else if (aHook && aHook.className && aHook.url && aHook.triggerName && triggers.Types[aHook.triggerName]) {
      hook = {};
      hook.className = aHook.className;
      hook.url = aHook.url;
      hook.triggerName = aHook.triggerName;
    } else {
      throw new Parse.Error(143, 'invalid hook declaration');
    }

    return this.addHook(hook);
  }

  createHook(aHook) {
    if (aHook.functionName) {
      return this.getFunction(aHook.functionName).then(result => {
        if (result) {
          throw new Parse.Error(143, `function name: ${aHook.functionName} already exits`);
        } else {
          return this.createOrUpdateHook(aHook);
        }
      });
    } else if (aHook.className && aHook.triggerName) {
      return this.getTrigger(aHook.className, aHook.triggerName).then(result => {
        if (result) {
          throw new Parse.Error(143, `class ${aHook.className} already has trigger ${aHook.triggerName}`);
        }

        return this.createOrUpdateHook(aHook);
      });
    }

    throw new Parse.Error(143, 'invalid hook declaration');
  }

  updateHook(aHook) {
    if (aHook.functionName) {
      return this.getFunction(aHook.functionName).then(result => {
        if (result) {
          return this.createOrUpdateHook(aHook);
        }

        throw new Parse.Error(143, `no function named: ${aHook.functionName} is defined`);
      });
    } else if (aHook.className && aHook.triggerName) {
      return this.getTrigger(aHook.className, aHook.triggerName).then(result => {
        if (result) {
          return this.createOrUpdateHook(aHook);
        }

        throw new Parse.Error(143, `class ${aHook.className} does not exist`);
      });
    }

    throw new Parse.Error(143, 'invalid hook declaration');
  }

}

exports.HooksController = HooksController;

function wrapToHTTPRequest(hook, key) {
  return req => {
    const jsonBody = {};

    for (var i in req) {
      jsonBody[i] = req[i];
    }

    if (req.object) {
      jsonBody.object = req.object.toJSON();
      jsonBody.object.className = req.object.className;
    }

    if (req.original) {
      jsonBody.original = req.original.toJSON();
      jsonBody.original.className = req.original.className;
    }

    const jsonRequest = {
      url: hook.url,
      headers: {
        'Content-Type': 'application/json'
      },
      body: jsonBody,
      method: 'POST'
    };
    const agent = hook.url.startsWith('https') ? HTTPAgents['https'] : HTTPAgents['http'];
    jsonRequest.agent = agent;

    if (key) {
      jsonRequest.headers['X-Parse-Webhook-Key'] = key;
    } else {
      _logger.logger.warn('Making outgoing webhook request without webhookKey being set!');
    }

    return (0, _request.default)(jsonRequest).then(response => {
      let err;
      let result;
      let body = response.data;

      if (body) {
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (e) {
            err = {
              error: 'Malformed response',
              code: -1,
              partialResponse: body.substring(0, 100)
            };
          }
        }

        if (!err) {
          result = body.success;
          err = body.error;
        }
      }

      if (err) {
        throw err;
      } else if (hook.triggerName === 'beforeSave') {
        if (typeof result === 'object') {
          delete result.createdAt;
          delete result.updatedAt;
          delete result.className;
        }

        return {
          object: result
        };
      } else {
        return result;
      }
    });
  };
}

var _default = HooksController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJEZWZhdWx0SG9va3NDb2xsZWN0aW9uTmFtZSIsIkhUVFBBZ2VudHMiLCJodHRwIiwiQWdlbnQiLCJrZWVwQWxpdmUiLCJodHRwcyIsIkhvb2tzQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYXBwbGljYXRpb25JZCIsImRhdGFiYXNlQ29udHJvbGxlciIsIndlYmhvb2tLZXkiLCJfYXBwbGljYXRpb25JZCIsIl93ZWJob29rS2V5IiwiZGF0YWJhc2UiLCJsb2FkIiwiX2dldEhvb2tzIiwidGhlbiIsImhvb2tzIiwiZm9yRWFjaCIsImhvb2siLCJhZGRIb29rVG9UcmlnZ2VycyIsImdldEZ1bmN0aW9uIiwiZnVuY3Rpb25OYW1lIiwicmVzdWx0cyIsImdldEZ1bmN0aW9ucyIsIiRleGlzdHMiLCJnZXRUcmlnZ2VyIiwiY2xhc3NOYW1lIiwidHJpZ2dlck5hbWUiLCJnZXRUcmlnZ2VycyIsImRlbGV0ZUZ1bmN0aW9uIiwidHJpZ2dlcnMiLCJyZW1vdmVGdW5jdGlvbiIsIl9yZW1vdmVIb29rcyIsImRlbGV0ZVRyaWdnZXIiLCJyZW1vdmVUcmlnZ2VyIiwicXVlcnkiLCJmaW5kIiwibWFwIiwicmVzdWx0Iiwib2JqZWN0SWQiLCJkZXN0cm95IiwiUHJvbWlzZSIsInJlc29sdmUiLCJzYXZlSG9vayIsInVybCIsIlBhcnNlIiwiRXJyb3IiLCJ1cGRhdGUiLCJ1cHNlcnQiLCJ3cmFwcGVkRnVuY3Rpb24iLCJ3cmFwVG9IVFRQUmVxdWVzdCIsImFkZFRyaWdnZXIiLCJhZGRGdW5jdGlvbiIsImFkZEhvb2siLCJjcmVhdGVPclVwZGF0ZUhvb2siLCJhSG9vayIsIlR5cGVzIiwiY3JlYXRlSG9vayIsInVwZGF0ZUhvb2siLCJrZXkiLCJyZXEiLCJqc29uQm9keSIsImkiLCJvYmplY3QiLCJ0b0pTT04iLCJvcmlnaW5hbCIsImpzb25SZXF1ZXN0IiwiaGVhZGVycyIsImJvZHkiLCJtZXRob2QiLCJhZ2VudCIsInN0YXJ0c1dpdGgiLCJsb2dnZXIiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiZXJyIiwiZGF0YSIsIkpTT04iLCJwYXJzZSIsImUiLCJlcnJvciIsImNvZGUiLCJwYXJ0aWFsUmVzcG9uc2UiLCJzdWJzdHJpbmciLCJzdWNjZXNzIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0hvb2tzQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiogQGZsb3cgd2VhayAqL1xuXG5pbXBvcnQgKiBhcyB0cmlnZ2VycyBmcm9tICcuLi90cmlnZ2Vycyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCAqIGFzIFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgcmVxdWVzdCBmcm9tICcuLi9yZXF1ZXN0JztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCBodHRwcyBmcm9tICdodHRwcyc7XG5cbmNvbnN0IERlZmF1bHRIb29rc0NvbGxlY3Rpb25OYW1lID0gJ19Ib29rcyc7XG5jb25zdCBIVFRQQWdlbnRzID0ge1xuICBodHRwOiBuZXcgaHR0cC5BZ2VudCh7IGtlZXBBbGl2ZTogdHJ1ZSB9KSxcbiAgaHR0cHM6IG5ldyBodHRwcy5BZ2VudCh7IGtlZXBBbGl2ZTogdHJ1ZSB9KSxcbn07XG5cbmV4cG9ydCBjbGFzcyBIb29rc0NvbnRyb2xsZXIge1xuICBfYXBwbGljYXRpb25JZDogc3RyaW5nO1xuICBfd2ViaG9va0tleTogc3RyaW5nO1xuICBkYXRhYmFzZTogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFwcGxpY2F0aW9uSWQ6IHN0cmluZywgZGF0YWJhc2VDb250cm9sbGVyLCB3ZWJob29rS2V5KSB7XG4gICAgdGhpcy5fYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgdGhpcy5fd2ViaG9va0tleSA9IHdlYmhvb2tLZXk7XG4gICAgdGhpcy5kYXRhYmFzZSA9IGRhdGFiYXNlQ29udHJvbGxlcjtcbiAgfVxuXG4gIGxvYWQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldEhvb2tzKCkudGhlbihob29rcyA9PiB7XG4gICAgICBob29rcyA9IGhvb2tzIHx8IFtdO1xuICAgICAgaG9va3MuZm9yRWFjaChob29rID0+IHtcbiAgICAgICAgdGhpcy5hZGRIb29rVG9UcmlnZ2Vycyhob29rKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldEhvb2tzKHsgZnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUgfSkudGhlbihyZXN1bHRzID0+IHJlc3VsdHNbMF0pO1xuICB9XG5cbiAgZ2V0RnVuY3Rpb25zKCkge1xuICAgIHJldHVybiB0aGlzLl9nZXRIb29rcyh7IGZ1bmN0aW9uTmFtZTogeyAkZXhpc3RzOiB0cnVlIH0gfSk7XG4gIH1cblxuICBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlck5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0SG9va3Moe1xuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlck5hbWUsXG4gICAgfSkudGhlbihyZXN1bHRzID0+IHJlc3VsdHNbMF0pO1xuICB9XG5cbiAgZ2V0VHJpZ2dlcnMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldEhvb2tzKHtcbiAgICAgIGNsYXNzTmFtZTogeyAkZXhpc3RzOiB0cnVlIH0sXG4gICAgICB0cmlnZ2VyTmFtZTogeyAkZXhpc3RzOiB0cnVlIH0sXG4gICAgfSk7XG4gIH1cblxuICBkZWxldGVGdW5jdGlvbihmdW5jdGlvbk5hbWUpIHtcbiAgICB0cmlnZ2Vycy5yZW1vdmVGdW5jdGlvbihmdW5jdGlvbk5hbWUsIHRoaXMuX2FwcGxpY2F0aW9uSWQpO1xuICAgIHJldHVybiB0aGlzLl9yZW1vdmVIb29rcyh7IGZ1bmN0aW9uTmFtZTogZnVuY3Rpb25OYW1lIH0pO1xuICB9XG5cbiAgZGVsZXRlVHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJOYW1lKSB7XG4gICAgdHJpZ2dlcnMucmVtb3ZlVHJpZ2dlcih0cmlnZ2VyTmFtZSwgY2xhc3NOYW1lLCB0aGlzLl9hcHBsaWNhdGlvbklkKTtcbiAgICByZXR1cm4gdGhpcy5fcmVtb3ZlSG9va3Moe1xuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlck5hbWUsXG4gICAgfSk7XG4gIH1cblxuICBfZ2V0SG9va3MocXVlcnkgPSB7fSkge1xuICAgIHJldHVybiB0aGlzLmRhdGFiYXNlLmZpbmQoRGVmYXVsdEhvb2tzQ29sbGVjdGlvbk5hbWUsIHF1ZXJ5KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKHJlc3VsdCA9PiB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQub2JqZWN0SWQ7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIF9yZW1vdmVIb29rcyhxdWVyeSkge1xuICAgIHJldHVybiB0aGlzLmRhdGFiYXNlLmRlc3Ryb3koRGVmYXVsdEhvb2tzQ29sbGVjdGlvbk5hbWUsIHF1ZXJ5KS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH0pO1xuICB9XG5cbiAgc2F2ZUhvb2soaG9vaykge1xuICAgIHZhciBxdWVyeTtcbiAgICBpZiAoaG9vay5mdW5jdGlvbk5hbWUgJiYgaG9vay51cmwpIHtcbiAgICAgIHF1ZXJ5ID0geyBmdW5jdGlvbk5hbWU6IGhvb2suZnVuY3Rpb25OYW1lIH07XG4gICAgfSBlbHNlIGlmIChob29rLnRyaWdnZXJOYW1lICYmIGhvb2suY2xhc3NOYW1lICYmIGhvb2sudXJsKSB7XG4gICAgICBxdWVyeSA9IHsgY2xhc3NOYW1lOiBob29rLmNsYXNzTmFtZSwgdHJpZ2dlck5hbWU6IGhvb2sudHJpZ2dlck5hbWUgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgJ2ludmFsaWQgaG9vayBkZWNsYXJhdGlvbicpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYXRhYmFzZVxuICAgICAgLnVwZGF0ZShEZWZhdWx0SG9va3NDb2xsZWN0aW9uTmFtZSwgcXVlcnksIGhvb2ssIHsgdXBzZXJ0OiB0cnVlIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoaG9vayk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFkZEhvb2tUb1RyaWdnZXJzKGhvb2spIHtcbiAgICB2YXIgd3JhcHBlZEZ1bmN0aW9uID0gd3JhcFRvSFRUUFJlcXVlc3QoaG9vaywgdGhpcy5fd2ViaG9va0tleSk7XG4gICAgd3JhcHBlZEZ1bmN0aW9uLnVybCA9IGhvb2sudXJsO1xuICAgIGlmIChob29rLmNsYXNzTmFtZSkge1xuICAgICAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihob29rLnRyaWdnZXJOYW1lLCBob29rLmNsYXNzTmFtZSwgd3JhcHBlZEZ1bmN0aW9uLCB0aGlzLl9hcHBsaWNhdGlvbklkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJpZ2dlcnMuYWRkRnVuY3Rpb24oaG9vay5mdW5jdGlvbk5hbWUsIHdyYXBwZWRGdW5jdGlvbiwgbnVsbCwgdGhpcy5fYXBwbGljYXRpb25JZCk7XG4gICAgfVxuICB9XG5cbiAgYWRkSG9vayhob29rKSB7XG4gICAgdGhpcy5hZGRIb29rVG9UcmlnZ2Vycyhob29rKTtcbiAgICByZXR1cm4gdGhpcy5zYXZlSG9vayhob29rKTtcbiAgfVxuXG4gIGNyZWF0ZU9yVXBkYXRlSG9vayhhSG9vaykge1xuICAgIHZhciBob29rO1xuICAgIGlmIChhSG9vayAmJiBhSG9vay5mdW5jdGlvbk5hbWUgJiYgYUhvb2sudXJsKSB7XG4gICAgICBob29rID0ge307XG4gICAgICBob29rLmZ1bmN0aW9uTmFtZSA9IGFIb29rLmZ1bmN0aW9uTmFtZTtcbiAgICAgIGhvb2sudXJsID0gYUhvb2sudXJsO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBhSG9vayAmJlxuICAgICAgYUhvb2suY2xhc3NOYW1lICYmXG4gICAgICBhSG9vay51cmwgJiZcbiAgICAgIGFIb29rLnRyaWdnZXJOYW1lICYmXG4gICAgICB0cmlnZ2Vycy5UeXBlc1thSG9vay50cmlnZ2VyTmFtZV1cbiAgICApIHtcbiAgICAgIGhvb2sgPSB7fTtcbiAgICAgIGhvb2suY2xhc3NOYW1lID0gYUhvb2suY2xhc3NOYW1lO1xuICAgICAgaG9vay51cmwgPSBhSG9vay51cmw7XG4gICAgICBob29rLnRyaWdnZXJOYW1lID0gYUhvb2sudHJpZ2dlck5hbWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsICdpbnZhbGlkIGhvb2sgZGVjbGFyYXRpb24nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5hZGRIb29rKGhvb2spO1xuICB9XG5cbiAgY3JlYXRlSG9vayhhSG9vaykge1xuICAgIGlmIChhSG9vay5mdW5jdGlvbk5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldEZ1bmN0aW9uKGFIb29rLmZ1bmN0aW9uTmFtZSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgYGZ1bmN0aW9uIG5hbWU6ICR7YUhvb2suZnVuY3Rpb25OYW1lfSBhbHJlYWR5IGV4aXRzYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlT3JVcGRhdGVIb29rKGFIb29rKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChhSG9vay5jbGFzc05hbWUgJiYgYUhvb2sudHJpZ2dlck5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldFRyaWdnZXIoYUhvb2suY2xhc3NOYW1lLCBhSG9vay50cmlnZ2VyTmFtZSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTQzLFxuICAgICAgICAgICAgYGNsYXNzICR7YUhvb2suY2xhc3NOYW1lfSBhbHJlYWR5IGhhcyB0cmlnZ2VyICR7YUhvb2sudHJpZ2dlck5hbWV9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlT3JVcGRhdGVIb29rKGFIb29rKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsICdpbnZhbGlkIGhvb2sgZGVjbGFyYXRpb24nKTtcbiAgfVxuXG4gIHVwZGF0ZUhvb2soYUhvb2spIHtcbiAgICBpZiAoYUhvb2suZnVuY3Rpb25OYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRGdW5jdGlvbihhSG9vay5mdW5jdGlvbk5hbWUpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZU9yVXBkYXRlSG9vayhhSG9vayk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgYG5vIGZ1bmN0aW9uIG5hbWVkOiAke2FIb29rLmZ1bmN0aW9uTmFtZX0gaXMgZGVmaW5lZGApO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChhSG9vay5jbGFzc05hbWUgJiYgYUhvb2sudHJpZ2dlck5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldFRyaWdnZXIoYUhvb2suY2xhc3NOYW1lLCBhSG9vay50cmlnZ2VyTmFtZSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlT3JVcGRhdGVIb29rKGFIb29rKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTQzLCBgY2xhc3MgJHthSG9vay5jbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0YCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgJ2ludmFsaWQgaG9vayBkZWNsYXJhdGlvbicpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBUb0hUVFBSZXF1ZXN0KGhvb2ssIGtleSkge1xuICByZXR1cm4gcmVxID0+IHtcbiAgICBjb25zdCBqc29uQm9keSA9IHt9O1xuICAgIGZvciAodmFyIGkgaW4gcmVxKSB7XG4gICAgICBqc29uQm9keVtpXSA9IHJlcVtpXTtcbiAgICB9XG4gICAgaWYgKHJlcS5vYmplY3QpIHtcbiAgICAgIGpzb25Cb2R5Lm9iamVjdCA9IHJlcS5vYmplY3QudG9KU09OKCk7XG4gICAgICBqc29uQm9keS5vYmplY3QuY2xhc3NOYW1lID0gcmVxLm9iamVjdC5jbGFzc05hbWU7XG4gICAgfVxuICAgIGlmIChyZXEub3JpZ2luYWwpIHtcbiAgICAgIGpzb25Cb2R5Lm9yaWdpbmFsID0gcmVxLm9yaWdpbmFsLnRvSlNPTigpO1xuICAgICAganNvbkJvZHkub3JpZ2luYWwuY2xhc3NOYW1lID0gcmVxLm9yaWdpbmFsLmNsYXNzTmFtZTtcbiAgICB9XG4gICAgY29uc3QganNvblJlcXVlc3Q6IGFueSA9IHtcbiAgICAgIHVybDogaG9vay51cmwsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgYm9keToganNvbkJvZHksXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICB9O1xuXG4gICAgY29uc3QgYWdlbnQgPSBob29rLnVybC5zdGFydHNXaXRoKCdodHRwcycpID8gSFRUUEFnZW50c1snaHR0cHMnXSA6IEhUVFBBZ2VudHNbJ2h0dHAnXTtcbiAgICBqc29uUmVxdWVzdC5hZ2VudCA9IGFnZW50O1xuXG4gICAgaWYgKGtleSkge1xuICAgICAganNvblJlcXVlc3QuaGVhZGVyc1snWC1QYXJzZS1XZWJob29rLUtleSddID0ga2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dnZXIud2FybignTWFraW5nIG91dGdvaW5nIHdlYmhvb2sgcmVxdWVzdCB3aXRob3V0IHdlYmhvb2tLZXkgYmVpbmcgc2V0IScpO1xuICAgIH1cbiAgICByZXR1cm4gcmVxdWVzdChqc29uUmVxdWVzdCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBsZXQgZXJyO1xuICAgICAgbGV0IHJlc3VsdDtcbiAgICAgIGxldCBib2R5ID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgIGlmIChib2R5KSB7XG4gICAgICAgIGlmICh0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYm9keSA9IEpTT04ucGFyc2UoYm9keSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZXJyID0ge1xuICAgICAgICAgICAgICBlcnJvcjogJ01hbGZvcm1lZCByZXNwb25zZScsXG4gICAgICAgICAgICAgIGNvZGU6IC0xLFxuICAgICAgICAgICAgICBwYXJ0aWFsUmVzcG9uc2U6IGJvZHkuc3Vic3RyaW5nKDAsIDEwMCksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoIWVycikge1xuICAgICAgICAgIHJlc3VsdCA9IGJvZHkuc3VjY2VzcztcbiAgICAgICAgICBlcnIgPSBib2R5LmVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0gZWxzZSBpZiAoaG9vay50cmlnZ2VyTmFtZSA9PT0gJ2JlZm9yZVNhdmUnKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIGRlbGV0ZSByZXN1bHQuY3JlYXRlZEF0O1xuICAgICAgICAgIGRlbGV0ZSByZXN1bHQudXBkYXRlZEF0O1xuICAgICAgICAgIGRlbGV0ZSByZXN1bHQuY2xhc3NOYW1lO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG9iamVjdDogcmVzdWx0IH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBIb29rc0NvbnRyb2xsZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFOQTtBQUVBO0FBTUEsTUFBTUEsMEJBQTBCLEdBQUcsUUFBbkM7QUFDQSxNQUFNQyxVQUFVLEdBQUc7RUFDakJDLElBQUksRUFBRSxJQUFJQSxhQUFBLENBQUtDLEtBQVQsQ0FBZTtJQUFFQyxTQUFTLEVBQUU7RUFBYixDQUFmLENBRFc7RUFFakJDLEtBQUssRUFBRSxJQUFJQSxjQUFBLENBQU1GLEtBQVYsQ0FBZ0I7SUFBRUMsU0FBUyxFQUFFO0VBQWIsQ0FBaEI7QUFGVSxDQUFuQjs7QUFLTyxNQUFNRSxlQUFOLENBQXNCO0VBSzNCQyxXQUFXLENBQUNDLGFBQUQsRUFBd0JDLGtCQUF4QixFQUE0Q0MsVUFBNUMsRUFBd0Q7SUFDakUsS0FBS0MsY0FBTCxHQUFzQkgsYUFBdEI7SUFDQSxLQUFLSSxXQUFMLEdBQW1CRixVQUFuQjtJQUNBLEtBQUtHLFFBQUwsR0FBZ0JKLGtCQUFoQjtFQUNEOztFQUVESyxJQUFJLEdBQUc7SUFDTCxPQUFPLEtBQUtDLFNBQUwsR0FBaUJDLElBQWpCLENBQXNCQyxLQUFLLElBQUk7TUFDcENBLEtBQUssR0FBR0EsS0FBSyxJQUFJLEVBQWpCO01BQ0FBLEtBQUssQ0FBQ0MsT0FBTixDQUFjQyxJQUFJLElBQUk7UUFDcEIsS0FBS0MsaUJBQUwsQ0FBdUJELElBQXZCO01BQ0QsQ0FGRDtJQUdELENBTE0sQ0FBUDtFQU1EOztFQUVERSxXQUFXLENBQUNDLFlBQUQsRUFBZTtJQUN4QixP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