"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseServerRESTController = ParseServerRESTController;
exports.default = void 0;
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Config = require('./Config');
const Auth = require('./Auth');
const RESTController = require('parse/lib/node/RESTController');
const URL = require('url');
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
    const serverURL = URL.parse(config.serverURL);
    if (path.indexOf(serverURL.path) === 0) {
      path = path.slice(serverURL.path.length, path.length);
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
                delete response._status;
                return {
                  success: response,
                  _status: status
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
            status
          } = resp;
          if (options.returnStatus) {
            resolve(_objectSpread(_objectSpread({}, response), {}, {
              _status: status
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
var _default = ParseServerRESTController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDb25maWciLCJyZXF1aXJlIiwiQXV0aCIsIlJFU1RDb250cm9sbGVyIiwiVVJMIiwiUGFyc2UiLCJnZXRTZXNzaW9uVG9rZW4iLCJvcHRpb25zIiwic2Vzc2lvblRva2VuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJnZXRBdXRoIiwiY29uZmlnIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VNYXN0ZXJLZXkiLCJpc01hc3RlciIsInRoZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsImFwcGxpY2F0aW9uSWQiLCJyb3V0ZXIiLCJoYW5kbGVSZXF1ZXN0IiwibWV0aG9kIiwicGF0aCIsImRhdGEiLCJhcmdzIiwiYXJndW1lbnRzIiwiZ2V0Iiwic2VydmVyVVJMIiwicGFyc2UiLCJpbmRleE9mIiwic2xpY2UiLCJsZW5ndGgiLCJiYXRjaCIsInRyYW5zYWN0aW9uUmV0cmllcyIsImluaXRpYWxQcm9taXNlIiwidHJhbnNhY3Rpb24iLCJkYXRhYmFzZSIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicHJvbWlzZXMiLCJyZXF1ZXN0cyIsIm1hcCIsInJlcXVlc3QiLCJib2R5IiwicmVzcG9uc2UiLCJyZXR1cm5TdGF0dXMiLCJzdGF0dXMiLCJfc3RhdHVzIiwic3VjY2VzcyIsImVycm9yIiwiY29kZSIsIm1lc3NhZ2UiLCJhbGwiLCJyZXN1bHQiLCJmaW5kIiwicmVzdWx0SXRlbSIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJyZWplY3QiLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNhdGNoIiwiZXJyb3JJdGVtIiwicXVlcnkiLCJhdXRoIiwiaW5mbyIsImNvbnRleHQiLCJ0cnlSb3V0ZVJlcXVlc3QiLCJyZXNwIiwiX29iamVjdFNwcmVhZCIsImVyciIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwiYXBwbHkiLCJhamF4IiwiaGFuZGxlRXJyb3IiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJkZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgQ29uZmlnID0gcmVxdWlyZSgnLi9Db25maWcnKTtcbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFJFU1RDb250cm9sbGVyID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvUkVTVENvbnRyb2xsZXInKTtcbmNvbnN0IFVSTCA9IHJlcXVpcmUoJ3VybCcpO1xuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5cbmZ1bmN0aW9uIGdldFNlc3Npb25Ub2tlbihvcHRpb25zKSB7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLnNlc3Npb25Ub2tlbiA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG9wdGlvbnMuc2Vzc2lvblRva2VuKTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xufVxuXG5mdW5jdGlvbiBnZXRBdXRoKG9wdGlvbnMgPSB7fSwgY29uZmlnKSB7XG4gIGNvbnN0IGluc3RhbGxhdGlvbklkID0gb3B0aW9ucy5pbnN0YWxsYXRpb25JZCB8fCAnY2xvdWQnO1xuICBpZiAob3B0aW9ucy51c2VNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5ldyBBdXRoLkF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlLCBpbnN0YWxsYXRpb25JZCB9KSk7XG4gIH1cbiAgcmV0dXJuIGdldFNlc3Npb25Ub2tlbihvcHRpb25zKS50aGVuKHNlc3Npb25Ub2tlbiA9PiB7XG4gICAgaWYgKHNlc3Npb25Ub2tlbikge1xuICAgICAgb3B0aW9ucy5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICByZXR1cm4gQXV0aC5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHNlc3Npb25Ub2tlbixcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShuZXcgQXV0aC5BdXRoKHsgY29uZmlnLCBpbnN0YWxsYXRpb25JZCB9KSk7XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcihhcHBsaWNhdGlvbklkLCByb3V0ZXIpIHtcbiAgZnVuY3Rpb24gaGFuZGxlUmVxdWVzdChtZXRob2QsIHBhdGgsIGRhdGEgPSB7fSwgb3B0aW9ucyA9IHt9LCBjb25maWcpIHtcbiAgICAvLyBTdG9yZSB0aGUgYXJndW1lbnRzLCBmb3IgbGF0ZXIgdXNlIGlmIGludGVybmFsIGZhaWxzXG4gICAgY29uc3QgYXJncyA9IGFyZ3VtZW50cztcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICBjb25maWcgPSBDb25maWcuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIH1cbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBVUkwucGFyc2UoY29uZmlnLnNlcnZlclVSTCk7XG4gICAgaWYgKHBhdGguaW5kZXhPZihzZXJ2ZXJVUkwucGF0aCkgPT09IDApIHtcbiAgICAgIHBhdGggPSBwYXRoLnNsaWNlKHNlcnZlclVSTC5wYXRoLmxlbmd0aCwgcGF0aC5sZW5ndGgpO1xuICAgIH1cblxuICAgIGlmIChwYXRoWzBdICE9PSAnLycpIHtcbiAgICAgIHBhdGggPSAnLycgKyBwYXRoO1xuICAgIH1cblxuICAgIGlmIChwYXRoID09PSAnL2JhdGNoJykge1xuICAgICAgY29uc3QgYmF0Y2ggPSB0cmFuc2FjdGlvblJldHJpZXMgPT4ge1xuICAgICAgICBsZXQgaW5pdGlhbFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgaWYgKGRhdGEudHJhbnNhY3Rpb24gPT09IHRydWUpIHtcbiAgICAgICAgICBpbml0aWFsUHJvbWlzZSA9IGNvbmZpZy5kYXRhYmFzZS5jcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpbml0aWFsUHJvbWlzZS50aGVuKCgpID0+IHtcbiAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IGRhdGEucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZVJlcXVlc3QocmVxdWVzdC5tZXRob2QsIHJlcXVlc3QucGF0aCwgcmVxdWVzdC5ib2R5LCBvcHRpb25zLCBjb25maWcpLnRoZW4oXG4gICAgICAgICAgICAgIHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5yZXR1cm5TdGF0dXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1cyA9IHJlc3BvbnNlLl9zdGF0dXM7XG4gICAgICAgICAgICAgICAgICBkZWxldGUgcmVzcG9uc2UuX3N0YXR1cztcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHJlc3BvbnNlLCBfc3RhdHVzOiBzdGF0dXMgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogcmVzcG9uc2UgfTtcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICBlcnJvcjogeyBjb2RlOiBlcnJvci5jb2RlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9LFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgaWYgKGRhdGEudHJhbnNhY3Rpb24gPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LmZpbmQocmVzdWx0SXRlbSA9PiB0eXBlb2YgcmVzdWx0SXRlbS5lcnJvciA9PT0gJ29iamVjdCcpKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gY29uZmlnLmRhdGFiYXNlLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbmZpZy5kYXRhYmFzZS5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgZXJyb3IgJiZcbiAgICAgICAgICAgICAgICBlcnJvci5maW5kKFxuICAgICAgICAgICAgICAgICAgZXJyb3JJdGVtID0+IHR5cGVvZiBlcnJvckl0ZW0uZXJyb3IgPT09ICdvYmplY3QnICYmIGVycm9ySXRlbS5lcnJvci5jb2RlID09PSAyNTFcbiAgICAgICAgICAgICAgICApICYmXG4gICAgICAgICAgICAgICAgdHJhbnNhY3Rpb25SZXRyaWVzID4gMFxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYmF0Y2godHJhbnNhY3Rpb25SZXRyaWVzIC0gMSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgcmV0dXJuIGJhdGNoKDUpO1xuICAgIH1cblxuICAgIGxldCBxdWVyeTtcbiAgICBpZiAobWV0aG9kID09PSAnR0VUJykge1xuICAgICAgcXVlcnkgPSBkYXRhO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBnZXRBdXRoKG9wdGlvbnMsIGNvbmZpZykudGhlbihhdXRoID0+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgICAgICBib2R5OiBkYXRhLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm86IHtcbiAgICAgICAgICAgIGFwcGxpY2F0aW9uSWQ6IGFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgICBzZXNzaW9uVG9rZW46IG9wdGlvbnMuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IG9wdGlvbnMuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICBjb250ZXh0OiBvcHRpb25zLmNvbnRleHQgfHwge30sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJvdXRlci50cnlSb3V0ZVJlcXVlc3QobWV0aG9kLCBwYXRoLCByZXF1ZXN0KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKFxuICAgICAgICAgICAgcmVzcCA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHsgcmVzcG9uc2UsIHN0YXR1cyB9ID0gcmVzcDtcbiAgICAgICAgICAgICAgaWYgKG9wdGlvbnMucmV0dXJuU3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IC4uLnJlc3BvbnNlLCBfc3RhdHVzOiBzdGF0dXMgfSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgZXJyIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IgJiZcbiAgICAgICAgICAgICAgICBlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04gJiZcbiAgICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9PSBgY2Fubm90IHJvdXRlICR7bWV0aG9kfSAke3BhdGh9YFxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICBSRVNUQ29udHJvbGxlci5yZXF1ZXN0LmFwcGx5KG51bGwsIGFyZ3MpLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICB9LCByZWplY3QpO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICByZXF1ZXN0OiBoYW5kbGVSZXF1ZXN0LFxuICAgIGFqYXg6IFJFU1RDb250cm9sbGVyLmFqYXgsXG4gICAgaGFuZGxlRXJyb3I6IFJFU1RDb250cm9sbGVyLmhhbmRsZUVycm9yLFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyO1xuZXhwb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxNQUFNQSxNQUFNLEdBQUdDLE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFDbEMsTUFBTUMsSUFBSSxHQUFHRCxPQUFPLENBQUMsUUFBUSxDQUFDO0FBQzlCLE1BQU1FLGNBQWMsR0FBR0YsT0FB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