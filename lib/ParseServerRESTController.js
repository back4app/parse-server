"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseServerRESTController = ParseServerRESTController;
exports.default = void 0;
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const Config = require('./Config');
const Auth = require('./Auth');
const RESTController = require('parse/lib/node/RESTController');
const Parse = require('parse/node');
function getSessionToken(options) {
  if (options && typeof options.sessionToken === 'string') {
    return Promise.resolve(options.sessionToken);
  }
  return Promise.resolve(null);
}
function getAuth(options = {}, config) {
  const installationId = options.installationId || 'cloud';
  if (options.useMasterKey) {
    return Promise.resolve(new Auth.Auth({
      config,
      isMaster: true,
      installationId
    }));
  }
  return getSessionToken(options).then(sessionToken => {
    if (sessionToken) {
      options.sessionToken = sessionToken;
      return Auth.getAuthForSessionToken({
        config,
        sessionToken: sessionToken,
        installationId
      });
    } else {
      return Promise.resolve(new Auth.Auth({
        config,
        installationId
      }));
    }
  });
}
function ParseServerRESTController(applicationId, router) {
  function handleRequest(method, path, data = {}, options = {}, config) {
    // Store the arguments, for later use if internal fails
    const args = arguments;
    if (!config) {
      config = Config.get(applicationId);
    }
    const serverURL = new URL(config.serverURL);
    if (path.indexOf(serverURL.pathname) === 0) {
      path = path.slice(serverURL.pathname.length, path.length);
    }
    if (path[0] !== '/') {
      path = '/' + path;
    }
    if (path === '/batch') {
      const batch = transactionRetries => {
        let initialPromise = Promise.resolve();
        if (data.transaction === true) {
          initialPromise = config.database.createTransactionalSession();
        }
        return initialPromise.then(() => {
          const promises = data.requests.map(request => {
            return handleRequest(request.method, request.path, request.body, options, config).then(response => {
              if (options.returnStatus) {
                const status = response._status;
                const headers = response._headers;
                delete response._status;
                delete response._headers;
                return {
                  success: response,
                  _status: status,
                  _headers: headers
                };
              }
              return {
                success: response
              };
            }, error => {
              return {
                error: {
                  code: error.code,
                  error: error.message
                }
              };
            });
          });
          return Promise.all(promises).then(result => {
            if (data.transaction === true) {
              if (result.find(resultItem => typeof resultItem.error === 'object')) {
                return config.database.abortTransactionalSession().then(() => {
                  return Promise.reject(result);
                });
              } else {
                return config.database.commitTransactionalSession().then(() => {
                  return result;
                });
              }
            } else {
              return result;
            }
          }).catch(error => {
            if (error && error.find(errorItem => typeof errorItem.error === 'object' && errorItem.error.code === 251) && transactionRetries > 0) {
              return batch(transactionRetries - 1);
            }
            throw error;
          });
        });
      };
      return batch(5);
    }
    let query;
    if (method === 'GET') {
      query = data;
    }
    return new Promise((resolve, reject) => {
      getAuth(options, config).then(auth => {
        const request = {
          body: data,
          config,
          auth,
          info: {
            applicationId: applicationId,
            sessionToken: options.sessionToken,
            installationId: options.installationId,
            context: options.context || {}
          },
          query
        };
        return Promise.resolve().then(() => {
          return router.tryRouteRequest(method, path, request);
        }).then(resp => {
          const {
            response,
            status,
            headers = {}
          } = resp;
          if (options.returnStatus) {
            resolve(_objectSpread(_objectSpread({}, response), {}, {
              _status: status,
              _headers: headers
            }));
          } else {
            resolve(response);
          }
        }, err => {
          if (err instanceof Parse.Error && err.code == Parse.Error.INVALID_JSON && err.message == `cannot route ${method} ${path}`) {
            RESTController.request.apply(null, args).then(resolve, reject);
          } else {
            reject(err);
          }
        });
      }, reject);
    });
  }
  return {
    request: handleRequest,
    ajax: RESTController.ajax,
    handleError: RESTController.handleError
  };
}
var _default = exports.default = ParseServerRESTController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDb25maWciLCJyZXF1aXJlIiwiQXV0aCIsIlJFU1RDb250cm9sbGVyIiwiUGFyc2UiLCJnZXRTZXNzaW9uVG9rZW4iLCJvcHRpb25zIiwic2Vzc2lvblRva2VuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJnZXRBdXRoIiwiY29uZmlnIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VNYXN0ZXJLZXkiLCJpc01hc3RlciIsInRoZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsImFwcGxpY2F0aW9uSWQiLCJyb3V0ZXIiLCJoYW5kbGVSZXF1ZXN0IiwibWV0aG9kIiwicGF0aCIsImRhdGEiLCJhcmdzIiwiYXJndW1lbnRzIiwiZ2V0Iiwic2VydmVyVVJMIiwiVVJMIiwiaW5kZXhPZiIsInBhdGhuYW1lIiwic2xpY2UiLCJsZW5ndGgiLCJiYXRjaCIsInRyYW5zYWN0aW9uUmV0cmllcyIsImluaXRpYWxQcm9taXNlIiwidHJhbnNhY3Rpb24iLCJkYXRhYmFzZSIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicHJvbWlzZXMiLCJyZXF1ZXN0cyIsIm1hcCIsInJlcXVlc3QiLCJib2R5IiwicmVzcG9uc2UiLCJyZXR1cm5TdGF0dXMiLCJzdGF0dXMiLCJfc3RhdHVzIiwiaGVhZGVycyIsIl9oZWFkZXJzIiwic3VjY2VzcyIsImVycm9yIiwiY29kZSIsIm1lc3NhZ2UiLCJhbGwiLCJyZXN1bHQiLCJmaW5kIiwicmVzdWx0SXRlbSIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJyZWplY3QiLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNhdGNoIiwiZXJyb3JJdGVtIiwicXVlcnkiLCJhdXRoIiwiaW5mbyIsImNvbnRleHQiLCJ0cnlSb3V0ZVJlcXVlc3QiLCJyZXNwIiwiX29iamVjdFNwcmVhZCIsImVyciIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwiYXBwbHkiLCJhamF4IiwiaGFuZGxlRXJyb3IiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJkZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgQ29uZmlnID0gcmVxdWlyZSgnLi9Db25maWcnKTtcbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFJFU1RDb250cm9sbGVyID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvUkVTVENvbnRyb2xsZXInKTtcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuXG5mdW5jdGlvbiBnZXRTZXNzaW9uVG9rZW4ob3B0aW9ucykge1xuICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5zZXNzaW9uVG9rZW4gPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShvcHRpb25zLnNlc3Npb25Ub2tlbik7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcbn1cblxuZnVuY3Rpb24gZ2V0QXV0aChvcHRpb25zID0ge30sIGNvbmZpZykge1xuICBjb25zdCBpbnN0YWxsYXRpb25JZCA9IG9wdGlvbnMuaW5zdGFsbGF0aW9uSWQgfHwgJ2Nsb3VkJztcbiAgaWYgKG9wdGlvbnMudXNlTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShuZXcgQXV0aC5BdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaW5zdGFsbGF0aW9uSWQgfSkpO1xuICB9XG4gIHJldHVybiBnZXRTZXNzaW9uVG9rZW4ob3B0aW9ucykudGhlbihzZXNzaW9uVG9rZW4gPT4ge1xuICAgIGlmIChzZXNzaW9uVG9rZW4pIHtcbiAgICAgIG9wdGlvbnMuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgICAgcmV0dXJuIEF1dGguZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBzZXNzaW9uVG9rZW4sXG4gICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmV3IEF1dGguQXV0aCh7IGNvbmZpZywgaW5zdGFsbGF0aW9uSWQgfSkpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwbGljYXRpb25JZCwgcm91dGVyKSB7XG4gIGZ1bmN0aW9uIGhhbmRsZVJlcXVlc3QobWV0aG9kLCBwYXRoLCBkYXRhID0ge30sIG9wdGlvbnMgPSB7fSwgY29uZmlnKSB7XG4gICAgLy8gU3RvcmUgdGhlIGFyZ3VtZW50cywgZm9yIGxhdGVyIHVzZSBpZiBpbnRlcm5hbCBmYWlsc1xuICAgIGNvbnN0IGFyZ3MgPSBhcmd1bWVudHM7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgY29uZmlnID0gQ29uZmlnLmdldChhcHBsaWNhdGlvbklkKTtcbiAgICB9XG4gICAgY29uc3Qgc2VydmVyVVJMID0gbmV3IFVSTChjb25maWcuc2VydmVyVVJMKTtcbiAgICBpZiAocGF0aC5pbmRleE9mKHNlcnZlclVSTC5wYXRobmFtZSkgPT09IDApIHtcbiAgICAgIHBhdGggPSBwYXRoLnNsaWNlKHNlcnZlclVSTC5wYXRobmFtZS5sZW5ndGgsIHBhdGgubGVuZ3RoKTtcbiAgICB9XG5cbiAgICBpZiAocGF0aFswXSAhPT0gJy8nKSB7XG4gICAgICBwYXRoID0gJy8nICsgcGF0aDtcbiAgICB9XG5cbiAgICBpZiAocGF0aCA9PT0gJy9iYXRjaCcpIHtcbiAgICAgIGNvbnN0IGJhdGNoID0gdHJhbnNhY3Rpb25SZXRyaWVzID0+IHtcbiAgICAgICAgbGV0IGluaXRpYWxQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkYXRhLnRyYW5zYWN0aW9uID09PSB0cnVlKSB7XG4gICAgICAgICAgaW5pdGlhbFByb21pc2UgPSBjb25maWcuZGF0YWJhc2UuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaW5pdGlhbFByb21pc2UudGhlbigoKSA9PiB7XG4gICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBkYXRhLnJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVSZXF1ZXN0KHJlcXVlc3QubWV0aG9kLCByZXF1ZXN0LnBhdGgsIHJlcXVlc3QuYm9keSwgb3B0aW9ucywgY29uZmlnKS50aGVuKFxuICAgICAgICAgICAgICByZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMucmV0dXJuU3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXMgPSByZXNwb25zZS5fc3RhdHVzO1xuICAgICAgICAgICAgICAgICAgY29uc3QgaGVhZGVycyA9IHJlc3BvbnNlLl9oZWFkZXJzO1xuICAgICAgICAgICAgICAgICAgZGVsZXRlIHJlc3BvbnNlLl9zdGF0dXM7XG4gICAgICAgICAgICAgICAgICBkZWxldGUgcmVzcG9uc2UuX2hlYWRlcnM7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiByZXNwb25zZSwgX3N0YXR1czogc3RhdHVzLCBfaGVhZGVyczogaGVhZGVycyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiByZXNwb25zZSB9O1xuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yOiB7IGNvZGU6IGVycm9yLmNvZGUsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0sXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICBpZiAoZGF0YS50cmFuc2FjdGlvbiA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuZmluZChyZXN1bHRJdGVtID0+IHR5cGVvZiByZXN1bHRJdGVtLmVycm9yID09PSAnb2JqZWN0JykpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBjb25maWcuZGF0YWJhc2UuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gY29uZmlnLmRhdGFiYXNlLmNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBlcnJvciAmJlxuICAgICAgICAgICAgICAgIGVycm9yLmZpbmQoXG4gICAgICAgICAgICAgICAgICBlcnJvckl0ZW0gPT4gdHlwZW9mIGVycm9ySXRlbS5lcnJvciA9PT0gJ29iamVjdCcgJiYgZXJyb3JJdGVtLmVycm9yLmNvZGUgPT09IDI1MVxuICAgICAgICAgICAgICAgICkgJiZcbiAgICAgICAgICAgICAgICB0cmFuc2FjdGlvblJldHJpZXMgPiAwXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJldHVybiBiYXRjaCh0cmFuc2FjdGlvblJldHJpZXMgLSAxKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgICByZXR1cm4gYmF0Y2goNSk7XG4gICAgfVxuXG4gICAgbGV0IHF1ZXJ5O1xuICAgIGlmIChtZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICBxdWVyeSA9IGRhdGE7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGdldEF1dGgob3B0aW9ucywgY29uZmlnKS50aGVuKGF1dGggPT4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgICAgIGJvZHk6IGRhdGEsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbzoge1xuICAgICAgICAgICAgYXBwbGljYXRpb25JZDogYXBwbGljYXRpb25JZCxcbiAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogb3B0aW9ucy5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogb3B0aW9ucy5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIGNvbnRleHQ6IG9wdGlvbnMuY29udGV4dCB8fCB7fSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcm91dGVyLnRyeVJvdXRlUmVxdWVzdChtZXRob2QsIHBhdGgsIHJlcXVlc3QpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICByZXNwID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgeyByZXNwb25zZSwgc3RhdHVzLCBoZWFkZXJzID0ge30gfSA9IHJlc3A7XG4gICAgICAgICAgICAgIGlmIChvcHRpb25zLnJldHVyblN0YXR1cykge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyAuLi5yZXNwb25zZSwgX3N0YXR1czogc3RhdHVzLCBfaGVhZGVyczogaGVhZGVycyB9KTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBlcnIgaW5zdGFuY2VvZiBQYXJzZS5FcnJvciAmJlxuICAgICAgICAgICAgICAgIGVyci5jb2RlID09IFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiAmJlxuICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID09IGBjYW5ub3Qgcm91dGUgJHttZXRob2R9ICR7cGF0aH1gXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIFJFU1RDb250cm9sbGVyLnJlcXVlc3QuYXBwbHkobnVsbCwgYXJncykudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgIH0sIHJlamVjdCk7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHJlcXVlc3Q6IGhhbmRsZVJlcXVlc3QsXG4gICAgYWpheDogUkVTVENvbnRyb2xsZXIuYWpheCxcbiAgICBoYW5kbGVFcnJvcjogUkVTVENvbnRyb2xsZXIuaGFuZGxlRXJyb3IsXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXI7XG5leHBvcnQgeyBQYXJzZVNlcnZlclJFU1RD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