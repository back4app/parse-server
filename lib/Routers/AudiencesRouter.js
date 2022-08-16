"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AudiencesRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AudiencesRouter extends _ClassesRouter.default {
  className() {
    return '_Audience';
  }

  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));

    const options = _ClassesRouter.default.optionsFromBody(body);

    return _rest.default.find(req.config, req.auth, '_Audience', body.where, options, req.info.clientSDK, req.info.context).then(response => {
      response.results.forEach(item => {
        item.query = JSON.parse(item.query);
      });
      return {
        response: response
      };
    });
  }

  handleGet(req) {
    return super.handleGet(req).then(data => {
      data.response.query = JSON.parse(data.response.query);
      return data;
    });
  }

  mountRoutes() {
    this.route('GET', '/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
    this.route('GET', '/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleGet(req);
    });
    this.route('POST', '/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleDelete(req);
    });
  }

}

exports.AudiencesRouter = AudiencesRouter;
var _default = AudiencesRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBdWRpZW5jZXNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwib3B0aW9uc0Zyb21Cb2R5IiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwid2hlcmUiLCJpbmZvIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiaXRlbSIsIkpTT04iLCJwYXJzZSIsImhhbmRsZUdldCIsImRhdGEiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgQXVkaWVuY2VzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19BdWRpZW5jZSc7XG4gIH1cblxuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKHJlcS5ib2R5LCBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KSk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IENsYXNzZXNSb3V0ZXIub3B0aW9uc0Zyb21Cb2R5KGJvZHkpO1xuXG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5yZXN1bHRzLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgaXRlbS5xdWVyeSA9IEpTT04ucGFyc2UoaXRlbS5xdWVyeSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiByZXNwb25zZSB9O1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVHZXQocmVxKSB7XG4gICAgcmV0dXJuIHN1cGVyLmhhbmRsZUdldChyZXEpLnRoZW4oZGF0YSA9PiB7XG4gICAgICBkYXRhLnJlc3BvbnNlLnF1ZXJ5ID0gSlNPTi5wYXJzZShkYXRhLnJlc3BvbnNlLnF1ZXJ5KTtcblxuICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3B1c2hfYXVkaWVuY2VzJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9wdXNoX2F1ZGllbmNlcycsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BVVCcsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0RFTEVURScsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBdWRpZW5jZXNSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxlQUFOLFNBQThCQyxzQkFBOUIsQ0FBNEM7RUFDakRDLFNBQVMsR0FBRztJQUNWLE9BQU8sV0FBUDtFQUNEOztFQUVEQyxVQUFVLENBQUNDLEdBQUQsRUFBTTtJQUNkLE1BQU1DLElBQUksR0FBR0MsTUFBTSxDQUFDQyxNQUFQLENBQWNILEdBQUcsQ0FBQ0MsSUFBbEIsRUFBd0JKLHNCQUFBLENBQWNPLGFBQWQsQ0FBNEJKLEdBQUcsQ0FBQ0ssS0FBaEMsQ0FBeEIsQ0FBYjs7SUFDQSxNQUFNQyxPQUFPLEdBQUdULHNCQUFBLENBQWNVLGVBQWQsQ0FBOEJOLElBQTlCLENBQWhCOztJQUVBLE9BQU9PLGFBQUEsQ0FDSkMsSUFESSxDQUVIVCxHQUFHLENBQUNVLE1BRkQsRUFHSFYsR0FBRyxDQUFDVyxJQUhELEVBSUgsV0FKRyxFQUtIVixJQUFJLENBQUNXLEtBTEYsRUFNSE4sT0FORyxFQU9ITixHQUFHLENBQUNhLElBQUosQ0FBU0MsU0FQTixFQVFIZCxHQUFHLENBQUNhLElBQUosQ0FBU0UsT0FSTixFQVVKQyxJQVZJLENBVUNDLFFBQVEsSUFBSTtNQUNoQkEsUUFBUSxDQUFDQyxPQUFULENBQWlCQyxPQUFqQixDQUF5QkMsSUFBSSxJQUFJO1FBQy9CQSxJQUFJLENBQUNmLEtBQUwsR0FBYWdCLElBQUksQ0FBQ0MsS0FBTCxDQUFXRixJQUFJLENBQUNmLEtBQWhCLENBQWI7TUFDRCxDQUZEO01BSUEsT0FBTztRQUFFWSxRQUFRLEVBQUVBO01BQVosQ0FBUDtJQUNELENBaEJJLENBQVA7RUFpQkQ7O0VBRURNLFNBQVMsQ0FBQ3ZCLEdBQUQsRUFBTTtJQUNiLE9BQU8sTUFBTXVCLFNBQU4sQ0FBZ0J2QixHQUFoQixFQUFxQmdCLElBQXJCLENBQTBCUSxJQUFJLElBQUk7TUFDdkNBLElBQUksQ0FBQ1AsUUFBTCxDQUFjWixLQUFkLEdBQXNCZ0IsSUFBSSxDQUFDQyxLQUFMLENBQVdFLElBQUksQ0FBQ1AsUUFBTCxDQUFjWixLQUF6QixDQUF0QjtNQUVBLE9BQU9tQixJQUFQO0lBQ0QsQ0FKTSxDQUFQO0VBS0Q7O0VBRURDLFdBQVcsR0FBRztJQUNaLEtBQUtDLEtBQUwsQ0FBVyxLQUFYLEVBQWtCLGlCQUFsQixFQUFxQ0MsVUFBVSxDQUFDQyw2QkFBaEQsRUFBK0U1QixHQUFHLElBQUk7TUFDcEYsT0FBTyxLQUFLRCxVQUFMLENBQWdCQyxHQUFoQixDQUFQO0lBQ0QsQ0FGRDtJQUdBLEtBQUswQixLQUFMLENBQ0UsS0FERixFQUVFLDJCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRTVCLEdBQUcsSUFBSTtNQUNMLE9BQU8sS0FBS3VCLFNBQUwsQ0FBZXZCLEdBQWYsQ0FBUDtJQUNELENBTkg7SUFRQSxLQUFLMEIsS0FBTCxDQUFXLE1BQVgsRUFBbUIsaUJBQW5CLEVBQXNDQyxVQUFVLENBQUNDLDZCQUFqRCxFQUFnRjVCLEdBQUcsSUFBSTtNQUNyRixPQUFPLEtBQUs2QixZQUFMLENBQWtCN0IsR0FBbEIsQ0FBUDtJQUNELENBRkQ7SUFHQSxLQUFLMEIsS0FBTCxDQUNFLEtBREYsRUFFRSwyQkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUU1QixHQUFHLElBQUk7TUFDTCxPQUFPLEtBQUs4QixZQUFMLENBQWtCOUIsR0FBbEIsQ0FBUDtJQUNELENBTkg7SUFRQSxLQUFLMEIsS0FBTCxDQUNFLFFBREYsRUFFRSwyQkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUU1QixHQUFHLElBQUk7TUFDTCxPQUFPLEtBQUsrQixZQUFMLENBQWtCL0IsR0FBbEIsQ0FBUDtJQUNELENBTkg7RUFRRDs7QUFuRWdEOzs7ZUFzRXBDSixlIn0=