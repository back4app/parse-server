"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GlobalConfigRouter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// global_config.js
class GlobalConfigRouter extends _PromiseRouter.default {
  getGlobalConfig(req) {
    return req.config.database.find('_GlobalConfig', {
      objectId: '1'
    }, {
      limit: 1
    }).then(results => {
      if (results.length != 1) {
        // If there is no config in the database - return empty config.
        return {
          response: {
            params: {}
          }
        };
      }

      const globalConfig = results[0];

      if (!req.auth.isMaster && globalConfig.masterKeyOnly !== undefined) {
        for (const param in globalConfig.params) {
          if (globalConfig.masterKeyOnly[param]) {
            delete globalConfig.params[param];
            delete globalConfig.masterKeyOnly[param];
          }
        }
      }

      return {
        response: {
          params: globalConfig.params,
          masterKeyOnly: globalConfig.masterKeyOnly
        }
      };
    });
  }

  updateGlobalConfig(req) {
    if (req.auth.isReadOnly) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update the config.");
    }

    const params = req.body.params;
    const masterKeyOnly = req.body.masterKeyOnly || {}; // Transform in dot notation to make sure it works

    const update = Object.keys(params).reduce((acc, key) => {
      acc[`params.${key}`] = params[key];
      acc[`masterKeyOnly.${key}`] = masterKeyOnly[key] || false;
      return acc;
    }, {});
    return req.config.database.update('_GlobalConfig', {
      objectId: '1'
    }, update, {
      upsert: true
    }).then(() => ({
      response: {
        result: true
      }
    }));
  }

  mountRoutes() {
    this.route('GET', '/config', req => {
      return this.getGlobalConfig(req);
    });
    this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.updateGlobalConfig(req);
    });
  }

}

exports.GlobalConfigRouter = GlobalConfigRouter;
var _default = GlobalConfigRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlci5qcyJdLCJuYW1lcyI6WyJHbG9iYWxDb25maWdSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwiZ2V0R2xvYmFsQ29uZmlnIiwicmVxIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwib2JqZWN0SWQiLCJsaW1pdCIsInRoZW4iLCJyZXN1bHRzIiwibGVuZ3RoIiwicmVzcG9uc2UiLCJwYXJhbXMiLCJnbG9iYWxDb25maWciLCJhdXRoIiwiaXNNYXN0ZXIiLCJtYXN0ZXJLZXlPbmx5IiwidW5kZWZpbmVkIiwicGFyYW0iLCJ1cGRhdGVHbG9iYWxDb25maWciLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJib2R5IiwidXBkYXRlIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImFjYyIsImtleSIsInVwc2VydCIsInJlc3VsdCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7O0FBSEE7QUFLTyxNQUFNQSxrQkFBTixTQUFpQ0Msc0JBQWpDLENBQStDO0FBQ3BEQyxFQUFBQSxlQUFlLENBQUNDLEdBQUQsRUFBTTtBQUNuQixXQUFPQSxHQUFHLENBQUNDLE1BQUosQ0FBV0MsUUFBWCxDQUNKQyxJQURJLENBQ0MsZUFERCxFQUNrQjtBQUFFQyxNQUFBQSxRQUFRLEVBQUU7QUFBWixLQURsQixFQUNxQztBQUFFQyxNQUFBQSxLQUFLLEVBQUU7QUFBVCxLQURyQyxFQUVKQyxJQUZJLENBRUNDLE9BQU8sSUFBSTtBQUNmLFVBQUlBLE9BQU8sQ0FBQ0MsTUFBUixJQUFrQixDQUF0QixFQUF5QjtBQUN2QjtBQUNBLGVBQU87QUFBRUMsVUFBQUEsUUFBUSxFQUFFO0FBQUVDLFlBQUFBLE1BQU0sRUFBRTtBQUFWO0FBQVosU0FBUDtBQUNEOztBQUNELFlBQU1DLFlBQVksR0FBR0osT0FBTyxDQUFDLENBQUQsQ0FBNUI7O0FBQ0EsVUFBSSxDQUFDUCxHQUFHLENBQUNZLElBQUosQ0FBU0MsUUFBVixJQUFzQkYsWUFBWSxDQUFDRyxhQUFiLEtBQStCQyxTQUF6RCxFQUFvRTtBQUNsRSxhQUFLLE1BQU1DLEtBQVgsSUFBb0JMLFlBQVksQ0FBQ0QsTUFBakMsRUFBeUM7QUFDdkMsY0FBSUMsWUFBWSxDQUFDRyxhQUFiLENBQTJCRSxLQUEzQixDQUFKLEVBQXVDO0FBQ3JDLG1CQUFPTCxZQUFZLENBQUNELE1BQWIsQ0FBb0JNLEtBQXBCLENBQVA7QUFDQSxtQkFBT0wsWUFBWSxDQUFDRyxhQUFiLENBQTJCRSxLQUEzQixDQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUNELGFBQU87QUFDTFAsUUFBQUEsUUFBUSxFQUFFO0FBQ1JDLFVBQUFBLE1BQU0sRUFBRUMsWUFBWSxDQUFDRCxNQURiO0FBRVJJLFVBQUFBLGFBQWEsRUFBRUgsWUFBWSxDQUFDRztBQUZwQjtBQURMLE9BQVA7QUFNRCxLQXRCSSxDQUFQO0FBdUJEOztBQUVERyxFQUFBQSxrQkFBa0IsQ0FBQ2pCLEdBQUQsRUFBTTtBQUN0QixRQUFJQSxHQUFHLENBQUNZLElBQUosQ0FBU00sVUFBYixFQUF5QjtBQUN2QixZQUFNLElBQUlDLGNBQU1DLEtBQVYsQ0FDSkQsY0FBTUMsS0FBTixDQUFZQyxtQkFEUixFQUVKLHlEQUZJLENBQU47QUFJRDs7QUFDRCxVQUFNWCxNQUFNLEdBQUdWLEdBQUcsQ0FBQ3NCLElBQUosQ0FBU1osTUFBeEI7QUFDQSxVQUFNSSxhQUFhLEdBQUdkLEdBQUcsQ0FBQ3NCLElBQUosQ0FBU1IsYUFBVCxJQUEwQixFQUFoRCxDQVJzQixDQVN0Qjs7QUFDQSxVQUFNUyxNQUFNLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZZixNQUFaLEVBQW9CZ0IsTUFBcEIsQ0FBMkIsQ0FBQ0MsR0FBRCxFQUFNQyxHQUFOLEtBQWM7QUFDdERELE1BQUFBLEdBQUcsQ0FBRSxVQUFTQyxHQUFJLEVBQWYsQ0FBSCxHQUF1QmxCLE1BQU0sQ0FBQ2tCLEdBQUQsQ0FBN0I7QUFDQUQsTUFBQUEsR0FBRyxDQUFFLGlCQUFnQkMsR0FBSSxFQUF0QixDQUFILEdBQThCZCxhQUFhLENBQUNjLEdBQUQsQ0FBYixJQUFzQixLQUFwRDtBQUNBLGFBQU9ELEdBQVA7QUFDRCxLQUpjLEVBSVosRUFKWSxDQUFmO0FBS0EsV0FBTzNCLEdBQUcsQ0FBQ0MsTUFBSixDQUFXQyxRQUFYLENBQ0pxQixNQURJLENBQ0csZUFESCxFQUNvQjtBQUFFbkIsTUFBQUEsUUFBUSxFQUFFO0FBQVosS0FEcEIsRUFDdUNtQixNQUR2QyxFQUMrQztBQUFFTSxNQUFBQSxNQUFNLEVBQUU7QUFBVixLQUQvQyxFQUVKdkIsSUFGSSxDQUVDLE9BQU87QUFBRUcsTUFBQUEsUUFBUSxFQUFFO0FBQUVxQixRQUFBQSxNQUFNLEVBQUU7QUFBVjtBQUFaLEtBQVAsQ0FGRCxDQUFQO0FBR0Q7O0FBRURDLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FBVyxLQUFYLEVBQWtCLFNBQWxCLEVBQTZCaEMsR0FBRyxJQUFJO0FBQ2xDLGFBQU8sS0FBS0QsZUFBTCxDQUFxQkMsR0FBckIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLZ0MsS0FBTCxDQUNFLEtBREYsRUFFRSxTQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRWxDLEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBS2lCLGtCQUFMLENBQXdCakIsR0FBeEIsQ0FBUDtBQUNELEtBTkg7QUFRRDs7QUEzRG1EOzs7ZUE4RHZDSCxrQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIGdsb2JhbF9jb25maWcuanNcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmV4cG9ydCBjbGFzcyBHbG9iYWxDb25maWdSb3V0ZXIgZXh0ZW5kcyBQcm9taXNlUm91dGVyIHtcbiAgZ2V0R2xvYmFsQ29uZmlnKHJlcSkge1xuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZCgnX0dsb2JhbENvbmZpZycsIHsgb2JqZWN0SWQ6ICcxJyB9LCB7IGxpbWl0OiAxIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjb25maWcgaW4gdGhlIGRhdGFiYXNlIC0gcmV0dXJuIGVtcHR5IGNvbmZpZy5cbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogeyBwYXJhbXM6IHt9IH0gfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBnbG9iYWxDb25maWcgPSByZXN1bHRzWzBdO1xuICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIGdsb2JhbENvbmZpZy5tYXN0ZXJLZXlPbmx5ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHBhcmFtIGluIGdsb2JhbENvbmZpZy5wYXJhbXMpIHtcbiAgICAgICAgICAgIGlmIChnbG9iYWxDb25maWcubWFzdGVyS2V5T25seVtwYXJhbV0pIHtcbiAgICAgICAgICAgICAgZGVsZXRlIGdsb2JhbENvbmZpZy5wYXJhbXNbcGFyYW1dO1xuICAgICAgICAgICAgICBkZWxldGUgZ2xvYmFsQ29uZmlnLm1hc3RlcktleU9ubHlbcGFyYW1dO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICBwYXJhbXM6IGdsb2JhbENvbmZpZy5wYXJhbXMsXG4gICAgICAgICAgICBtYXN0ZXJLZXlPbmx5OiBnbG9iYWxDb25maWcubWFzdGVyS2V5T25seSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGVHbG9iYWxDb25maWcocmVxKSB7XG4gICAgaWYgKHJlcS5hdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gdXBkYXRlIHRoZSBjb25maWcuXCJcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHBhcmFtcyA9IHJlcS5ib2R5LnBhcmFtcztcbiAgICBjb25zdCBtYXN0ZXJLZXlPbmx5ID0gcmVxLmJvZHkubWFzdGVyS2V5T25seSB8fCB7fTtcbiAgICAvLyBUcmFuc2Zvcm0gaW4gZG90IG5vdGF0aW9uIHRvIG1ha2Ugc3VyZSBpdCB3b3Jrc1xuICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKHBhcmFtcykucmVkdWNlKChhY2MsIGtleSkgPT4ge1xuICAgICAgYWNjW2BwYXJhbXMuJHtrZXl9YF0gPSBwYXJhbXNba2V5XTtcbiAgICAgIGFjY1tgbWFzdGVyS2V5T25seS4ke2tleX1gXSA9IG1hc3RlcktleU9ubHlba2V5XSB8fCBmYWxzZTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAudXBkYXRlKCdfR2xvYmFsQ29uZmlnJywgeyBvYmplY3RJZDogJzEnIH0sIHVwZGF0ZSwgeyB1cHNlcnQ6IHRydWUgfSlcbiAgICAgIC50aGVuKCgpID0+ICh7IHJlc3BvbnNlOiB7IHJlc3VsdDogdHJ1ZSB9IH0pKTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvY29uZmlnJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldEdsb2JhbENvbmZpZyhyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUFVUJyxcbiAgICAgICcvY29uZmlnJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy51cGRhdGVHbG9iYWxDb25maWcocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEdsb2JhbENvbmZpZ1JvdXRlcjtcbiJdfQ==