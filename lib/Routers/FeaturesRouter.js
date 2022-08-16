"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FeaturesRouter = void 0;

var _package = require("../../package.json");

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class FeaturesRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('GET', '/serverInfo', middleware.promiseEnforceMasterKeyAccess, req => {
      const {
        config
      } = req;
      const features = {
        globalConfig: {
          create: true,
          read: true,
          update: true,
          delete: true
        },
        hooks: {
          create: true,
          read: true,
          update: true,
          delete: true
        },
        cloudCode: {
          jobs: true
        },
        logs: {
          level: true,
          size: true,
          order: true,
          until: true,
          from: true
        },
        push: {
          immediatePush: config.hasPushSupport,
          scheduledPush: config.hasPushScheduledSupport,
          storedPushData: config.hasPushSupport,
          pushAudiences: true,
          localization: true
        },
        schemas: {
          addField: true,
          removeField: true,
          addClass: true,
          removeClass: true,
          clearAllDataFromClass: true,
          import: true,
          exportClass: true,
          editClassLevelPermissions: true,
          editPointerPermissions: true
        }
      };
      return {
        response: {
          features: features,
          parseServerVersion: _package.version
        }
      };
    });
  }

}

exports.FeaturesRouter = FeaturesRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJGZWF0dXJlc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxIiwiY29uZmlnIiwiZmVhdHVyZXMiLCJnbG9iYWxDb25maWciLCJjcmVhdGUiLCJyZWFkIiwidXBkYXRlIiwiZGVsZXRlIiwiaG9va3MiLCJjbG91ZENvZGUiLCJqb2JzIiwibG9ncyIsImxldmVsIiwic2l6ZSIsIm9yZGVyIiwidW50aWwiLCJmcm9tIiwicHVzaCIsImltbWVkaWF0ZVB1c2giLCJoYXNQdXNoU3VwcG9ydCIsInNjaGVkdWxlZFB1c2giLCJoYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCIsInN0b3JlZFB1c2hEYXRhIiwicHVzaEF1ZGllbmNlcyIsImxvY2FsaXphdGlvbiIsInNjaGVtYXMiLCJhZGRGaWVsZCIsInJlbW92ZUZpZWxkIiwiYWRkQ2xhc3MiLCJyZW1vdmVDbGFzcyIsImNsZWFyQWxsRGF0YUZyb21DbGFzcyIsImltcG9ydCIsImV4cG9ydENsYXNzIiwiZWRpdENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImVkaXRQb2ludGVyUGVybWlzc2lvbnMiLCJyZXNwb25zZSIsInBhcnNlU2VydmVyVmVyc2lvbiIsInZlcnNpb24iXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9GZWF0dXJlc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB2ZXJzaW9uIH0gZnJvbSAnLi4vLi4vcGFja2FnZS5qc29uJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmV4cG9ydCBjbGFzcyBGZWF0dXJlc1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3NlcnZlckluZm8nLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcgfSA9IHJlcTtcbiAgICAgIGNvbnN0IGZlYXR1cmVzID0ge1xuICAgICAgICBnbG9iYWxDb25maWc6IHtcbiAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgcmVhZDogdHJ1ZSxcbiAgICAgICAgICB1cGRhdGU6IHRydWUsXG4gICAgICAgICAgZGVsZXRlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBob29rczoge1xuICAgICAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICAgICAgICByZWFkOiB0cnVlLFxuICAgICAgICAgIHVwZGF0ZTogdHJ1ZSxcbiAgICAgICAgICBkZWxldGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGNsb3VkQ29kZToge1xuICAgICAgICAgIGpvYnM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGxvZ3M6IHtcbiAgICAgICAgICBsZXZlbDogdHJ1ZSxcbiAgICAgICAgICBzaXplOiB0cnVlLFxuICAgICAgICAgIG9yZGVyOiB0cnVlLFxuICAgICAgICAgIHVudGlsOiB0cnVlLFxuICAgICAgICAgIGZyb206IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHB1c2g6IHtcbiAgICAgICAgICBpbW1lZGlhdGVQdXNoOiBjb25maWcuaGFzUHVzaFN1cHBvcnQsXG4gICAgICAgICAgc2NoZWR1bGVkUHVzaDogY29uZmlnLmhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0LFxuICAgICAgICAgIHN0b3JlZFB1c2hEYXRhOiBjb25maWcuaGFzUHVzaFN1cHBvcnQsXG4gICAgICAgICAgcHVzaEF1ZGllbmNlczogdHJ1ZSxcbiAgICAgICAgICBsb2NhbGl6YXRpb246IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjaGVtYXM6IHtcbiAgICAgICAgICBhZGRGaWVsZDogdHJ1ZSxcbiAgICAgICAgICByZW1vdmVGaWVsZDogdHJ1ZSxcbiAgICAgICAgICBhZGRDbGFzczogdHJ1ZSxcbiAgICAgICAgICByZW1vdmVDbGFzczogdHJ1ZSxcbiAgICAgICAgICBjbGVhckFsbERhdGFGcm9tQ2xhc3M6IHRydWUsXG5cdCAgaW1wb3J0OiB0cnVlLFxuICAgICAgICAgIGV4cG9ydENsYXNzOiB0cnVlLFxuICAgICAgICAgIGVkaXRDbGFzc0xldmVsUGVybWlzc2lvbnM6IHRydWUsXG4gICAgICAgICAgZWRpdFBvaW50ZXJQZXJtaXNzaW9uczogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgZmVhdHVyZXM6IGZlYXR1cmVzLFxuICAgICAgICAgIHBhcnNlU2VydmVyVmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVPLE1BQU1BLGNBQU4sU0FBNkJDLHNCQUE3QixDQUEyQztFQUNoREMsV0FBVyxHQUFHO0lBQ1osS0FBS0MsS0FBTCxDQUFXLEtBQVgsRUFBa0IsYUFBbEIsRUFBaUNDLFVBQVUsQ0FBQ0MsNkJBQTVDLEVBQTJFQyxHQUFHLElBQUk7TUFDaEYsTUFBTTtRQUFFQztNQUFGLElBQWFELEdBQW5CO01BQ0EsTUFBTUUsUUFBUSxHQUFHO1FBQ2ZDLFlBQVksRUFBRTtVQUNaQyxNQUFNLEVBQUUsSUFESTtVQUVaQyxJQUFJLEVBQUUsSUFGTTtVQUdaQyxNQUFNLEVBQUUsSUFISTtVQUlaQyxNQUFNLEVBQUU7UUFKSSxDQURDO1FBT2ZDLEtBQUssRUFBRTtVQUNMSixNQUFNLEVBQUUsSUFESDtVQUVMQyxJQUFJLEVBQUUsSUFGRDtVQUdMQyxNQUFNLEVBQUUsSUFISDtVQUlMQyxNQUFNLEVBQUU7UUFKSCxDQVBRO1FBYWZFLFNBQVMsRUFBRTtVQUNUQyxJQUFJLEVBQUU7UUFERyxDQWJJO1FBZ0JmQyxJQUFJLEVBQUU7VUFDSkMsS0FBSyxFQUFFLElBREg7VUFFSkMsSUFBSSxFQUFFLElBRkY7VUFHSkMsS0FBSyxFQUFFLElBSEg7VUFJSkMsS0FBSyxFQUFFLElBSkg7VUFLSkMsSUFBSSxFQUFFO1FBTEYsQ0FoQlM7UUF1QmZDLElBQUksRUFBRTtVQUNKQyxhQUFhLEVBQUVqQixNQUFNLENBQUNrQixjQURsQjtVQUVKQyxhQUFhLEVBQUVuQixNQUFNLENBQUNvQix1QkFGbEI7VUFHSkMsY0FBYyxFQUFFckIsTUFBTSxDQUFDa0IsY0FIbkI7VUFJSkksYUFBYSxFQUFFLElBSlg7VUFLSkMsWUFBWSxFQUFFO1FBTFYsQ0F2QlM7UUE4QmZDLE9BQU8sRUFBRTtVQUNQQyxRQUFRLEVBQUUsSUFESDtVQUVQQyxXQUFXLEVBQUUsSUFGTjtVQUdQQyxRQUFRLEVBQUUsSUFISDtVQUlQQyxXQUFXLEVBQUUsSUFKTjtVQUtQQyxxQkFBcUIsRUFBRSxJQUxoQjtVQU1kQyxNQUFNLEVBQUUsSUFOTTtVQU9QQyxXQUFXLEVBQUUsSUFQTjtVQVFQQyx5QkFBeUIsRUFBRSxJQVJwQjtVQVNQQyxzQkFBc0IsRUFBRTtRQVRqQjtNQTlCTSxDQUFqQjtNQTJDQSxPQUFPO1FBQ0xDLFFBQVEsRUFBRTtVQUNSakMsUUFBUSxFQUFFQSxRQURGO1VBRVJrQyxrQkFBa0IsRUFBRUM7UUFGWjtNQURMLENBQVA7SUFNRCxDQW5ERDtFQW9ERDs7QUF0RCtDIn0=