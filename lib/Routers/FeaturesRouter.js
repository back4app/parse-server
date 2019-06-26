"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FeaturesRouter = void 0;

var _package = require("../../package.json");

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyLmpzIl0sIm5hbWVzIjpbIkZlYXR1cmVzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJyZXEiLCJjb25maWciLCJmZWF0dXJlcyIsImdsb2JhbENvbmZpZyIsImNyZWF0ZSIsInJlYWQiLCJ1cGRhdGUiLCJkZWxldGUiLCJob29rcyIsImNsb3VkQ29kZSIsImpvYnMiLCJsb2dzIiwibGV2ZWwiLCJzaXplIiwib3JkZXIiLCJ1bnRpbCIsImZyb20iLCJwdXNoIiwiaW1tZWRpYXRlUHVzaCIsImhhc1B1c2hTdXBwb3J0Iiwic2NoZWR1bGVkUHVzaCIsImhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0Iiwic3RvcmVkUHVzaERhdGEiLCJwdXNoQXVkaWVuY2VzIiwibG9jYWxpemF0aW9uIiwic2NoZW1hcyIsImFkZEZpZWxkIiwicmVtb3ZlRmllbGQiLCJhZGRDbGFzcyIsInJlbW92ZUNsYXNzIiwiY2xlYXJBbGxEYXRhRnJvbUNsYXNzIiwiaW1wb3J0IiwiZXhwb3J0Q2xhc3MiLCJlZGl0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZWRpdFBvaW50ZXJQZXJtaXNzaW9ucyIsInJlc3BvbnNlIiwicGFyc2VTZXJ2ZXJWZXJzaW9uIiwidmVyc2lvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7QUFFTyxNQUFNQSxjQUFOLFNBQTZCQyxzQkFBN0IsQ0FBMkM7QUFDaERDLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FDRSxLQURGLEVBRUUsYUFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUVDLEdBQUcsSUFBSTtBQUNMLFlBQU07QUFBRUMsUUFBQUE7QUFBRixVQUFhRCxHQUFuQjtBQUNBLFlBQU1FLFFBQVEsR0FBRztBQUNmQyxRQUFBQSxZQUFZLEVBQUU7QUFDWkMsVUFBQUEsTUFBTSxFQUFFLElBREk7QUFFWkMsVUFBQUEsSUFBSSxFQUFFLElBRk07QUFHWkMsVUFBQUEsTUFBTSxFQUFFLElBSEk7QUFJWkMsVUFBQUEsTUFBTSxFQUFFO0FBSkksU0FEQztBQU9mQyxRQUFBQSxLQUFLLEVBQUU7QUFDTEosVUFBQUEsTUFBTSxFQUFFLElBREg7QUFFTEMsVUFBQUEsSUFBSSxFQUFFLElBRkQ7QUFHTEMsVUFBQUEsTUFBTSxFQUFFLElBSEg7QUFJTEMsVUFBQUEsTUFBTSxFQUFFO0FBSkgsU0FQUTtBQWFmRSxRQUFBQSxTQUFTLEVBQUU7QUFDVEMsVUFBQUEsSUFBSSxFQUFFO0FBREcsU0FiSTtBQWdCZkMsUUFBQUEsSUFBSSxFQUFFO0FBQ0pDLFVBQUFBLEtBQUssRUFBRSxJQURIO0FBRUpDLFVBQUFBLElBQUksRUFBRSxJQUZGO0FBR0pDLFVBQUFBLEtBQUssRUFBRSxJQUhIO0FBSUpDLFVBQUFBLEtBQUssRUFBRSxJQUpIO0FBS0pDLFVBQUFBLElBQUksRUFBRTtBQUxGLFNBaEJTO0FBdUJmQyxRQUFBQSxJQUFJLEVBQUU7QUFDSkMsVUFBQUEsYUFBYSxFQUFFakIsTUFBTSxDQUFDa0IsY0FEbEI7QUFFSkMsVUFBQUEsYUFBYSxFQUFFbkIsTUFBTSxDQUFDb0IsdUJBRmxCO0FBR0pDLFVBQUFBLGNBQWMsRUFBRXJCLE1BQU0sQ0FBQ2tCLGNBSG5CO0FBSUpJLFVBQUFBLGFBQWEsRUFBRSxJQUpYO0FBS0pDLFVBQUFBLFlBQVksRUFBRTtBQUxWLFNBdkJTO0FBOEJmQyxRQUFBQSxPQUFPLEVBQUU7QUFDUEMsVUFBQUEsUUFBUSxFQUFFLElBREg7QUFFUEMsVUFBQUEsV0FBVyxFQUFFLElBRk47QUFHUEMsVUFBQUEsUUFBUSxFQUFFLElBSEg7QUFJUEMsVUFBQUEsV0FBVyxFQUFFLElBSk47QUFLUEMsVUFBQUEscUJBQXFCLEVBQUUsSUFMaEI7QUFNUEMsVUFBQUEsTUFBTSxFQUFFLElBTkQ7QUFPUEMsVUFBQUEsV0FBVyxFQUFFLElBUE47QUFRUEMsVUFBQUEseUJBQXlCLEVBQUUsSUFScEI7QUFTUEMsVUFBQUEsc0JBQXNCLEVBQUU7QUFUakI7QUE5Qk0sT0FBakI7QUEyQ0EsYUFBTztBQUNMQyxRQUFBQSxRQUFRLEVBQUU7QUFDUmpDLFVBQUFBLFFBQVEsRUFBRUEsUUFERjtBQUVSa0MsVUFBQUEsa0JBQWtCLEVBQUVDO0FBRlo7QUFETCxPQUFQO0FBTUQsS0F2REg7QUF5REQ7O0FBM0QrQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHZlcnNpb24gfSBmcm9tICcuLi8uLi9wYWNrYWdlLmpzb24nO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuZXhwb3J0IGNsYXNzIEZlYXR1cmVzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgICcvc2VydmVySW5mbycsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcgfSA9IHJlcTtcbiAgICAgICAgY29uc3QgZmVhdHVyZXMgPSB7XG4gICAgICAgICAgZ2xvYmFsQ29uZmlnOiB7XG4gICAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgICByZWFkOiB0cnVlLFxuICAgICAgICAgICAgdXBkYXRlOiB0cnVlLFxuICAgICAgICAgICAgZGVsZXRlOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgaG9va3M6IHtcbiAgICAgICAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICAgICAgICAgIHJlYWQ6IHRydWUsXG4gICAgICAgICAgICB1cGRhdGU6IHRydWUsXG4gICAgICAgICAgICBkZWxldGU6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjbG91ZENvZGU6IHtcbiAgICAgICAgICAgIGpvYnM6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBsb2dzOiB7XG4gICAgICAgICAgICBsZXZlbDogdHJ1ZSxcbiAgICAgICAgICAgIHNpemU6IHRydWUsXG4gICAgICAgICAgICBvcmRlcjogdHJ1ZSxcbiAgICAgICAgICAgIHVudGlsOiB0cnVlLFxuICAgICAgICAgICAgZnJvbTogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHB1c2g6IHtcbiAgICAgICAgICAgIGltbWVkaWF0ZVB1c2g6IGNvbmZpZy5oYXNQdXNoU3VwcG9ydCxcbiAgICAgICAgICAgIHNjaGVkdWxlZFB1c2g6IGNvbmZpZy5oYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCxcbiAgICAgICAgICAgIHN0b3JlZFB1c2hEYXRhOiBjb25maWcuaGFzUHVzaFN1cHBvcnQsXG4gICAgICAgICAgICBwdXNoQXVkaWVuY2VzOiB0cnVlLFxuICAgICAgICAgICAgbG9jYWxpemF0aW9uOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc2NoZW1hczoge1xuICAgICAgICAgICAgYWRkRmllbGQ6IHRydWUsXG4gICAgICAgICAgICByZW1vdmVGaWVsZDogdHJ1ZSxcbiAgICAgICAgICAgIGFkZENsYXNzOiB0cnVlLFxuICAgICAgICAgICAgcmVtb3ZlQ2xhc3M6IHRydWUsXG4gICAgICAgICAgICBjbGVhckFsbERhdGFGcm9tQ2xhc3M6IHRydWUsXG4gICAgICAgICAgICBpbXBvcnQ6IHRydWUsXG4gICAgICAgICAgICBleHBvcnRDbGFzczogdHJ1ZSxcbiAgICAgICAgICAgIGVkaXRDbGFzc0xldmVsUGVybWlzc2lvbnM6IHRydWUsXG4gICAgICAgICAgICBlZGl0UG9pbnRlclBlcm1pc3Npb25zOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgZmVhdHVyZXM6IGZlYXR1cmVzLFxuICAgICAgICAgICAgcGFyc2VTZXJ2ZXJWZXJzaW9uOiB2ZXJzaW9uLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuIl19