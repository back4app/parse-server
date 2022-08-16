"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AnalyticsController = void 0;

var _AdaptableController = _interopRequireDefault(require("./AdaptableController"));

var _AnalyticsAdapter = require("../Adapters/Analytics/AnalyticsAdapter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AnalyticsController extends _AdaptableController.default {
  appOpened(req) {
    return Promise.resolve().then(() => {
      return this.adapter.appOpened(req.body, req);
    }).then(response => {
      return {
        response: response || {}
      };
    }).catch(() => {
      return {
        response: {}
      };
    });
  }

  trackEvent(req) {
    return Promise.resolve().then(() => {
      return this.adapter.trackEvent(req.params.eventName, req.body, req);
    }).then(response => {
      return {
        response: response || {}
      };
    }).catch(() => {
      return {
        response: {}
      };
    });
  }

  expectedAdapterType() {
    return _AnalyticsAdapter.AnalyticsAdapter;
  }

}

exports.AnalyticsController = AnalyticsController;
var _default = AnalyticsController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBbmFseXRpY3NDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImFwcE9wZW5lZCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImFkYXB0ZXIiLCJib2R5IiwicmVzcG9uc2UiLCJjYXRjaCIsInRyYWNrRXZlbnQiLCJwYXJhbXMiLCJldmVudE5hbWUiLCJleHBlY3RlZEFkYXB0ZXJUeXBlIiwiQW5hbHl0aWNzQWRhcHRlciJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9BbmFseXRpY3NDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBBZGFwdGFibGVDb250cm9sbGVyIGZyb20gJy4vQWRhcHRhYmxlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBBbmFseXRpY3NBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvQW5hbHl0aWNzL0FuYWx5dGljc0FkYXB0ZXInO1xuXG5leHBvcnQgY2xhc3MgQW5hbHl0aWNzQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBhcHBPcGVuZWQocmVxKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYXBwT3BlbmVkKHJlcS5ib2R5LCByZXEpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHJlc3BvbnNlIHx8IHt9IH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICB9KTtcbiAgfVxuXG4gIHRyYWNrRXZlbnQocmVxKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudHJhY2tFdmVudChyZXEucGFyYW1zLmV2ZW50TmFtZSwgcmVxLmJvZHksIHJlcSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXR1cm4geyByZXNwb25zZTogcmVzcG9uc2UgfHwge30gfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gQW5hbHl0aWNzQWRhcHRlcjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBbmFseXRpY3NDb250cm9sbGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7QUFFTyxNQUFNQSxtQkFBTixTQUFrQ0MsNEJBQWxDLENBQXNEO0VBQzNEQyxTQUFTLENBQUNDLEdBQUQsRUFBTTtJQUNiLE9BQU9DLE9BQU8sQ0FBQ0MsT0FBUixHQUNKQyxJQURJLENBQ0MsTUFBTTtNQUNWLE9BQU8sS0FBS0MsT0FBTCxDQUFhTCxTQUFiLENBQXVCQyxHQUFHLENBQUNLLElBQTNCLEVBQWlDTCxHQUFqQyxDQUFQO0lBQ0QsQ0FISSxFQUlKRyxJQUpJLENBSUNHLFFBQVEsSUFBSTtNQUNoQixPQUFPO1FBQUVBLFFBQVEsRUFBRUEsUUFBUSxJQUFJO01BQXhCLENBQVA7SUFDRCxDQU5JLEVBT0pDLEtBUEksQ0FPRSxNQUFNO01BQ1gsT0FBTztRQUFFRCxRQUFRLEVBQUU7TUFBWixDQUFQO0lBQ0QsQ0FUSSxDQUFQO0VBVUQ7O0VBRURFLFVBQVUsQ0FBQ1IsR0FBRCxFQUFNO0lBQ2QsT0FBT0MsT0FBTyxDQUFDQyxPQUFSLEdBQ0pDLElBREksQ0FDQyxNQUFNO01BQ1YsT0FBTyxLQUFLQyxPQUFMLENBQWFJLFVBQWIsQ0FBd0JSLEdBQUcsQ0FBQ1MsTUFBSixDQUFXQyxTQUFuQyxFQUE4Q1YsR0FBRyxDQUFDSyxJQUFsRCxFQUF3REwsR0FBeEQsQ0FBUDtJQUNELENBSEksRUFJSkcsSUFKSSxDQUlDRyxRQUFRLElBQUk7TUFDaEIsT0FBTztRQUFFQSxRQUFRLEVBQUVBLFFBQVEsSUFBSTtNQUF4QixDQUFQO0lBQ0QsQ0FOSSxFQU9KQyxLQVBJLENBT0UsTUFBTTtNQUNYLE9BQU87UUFBRUQsUUFBUSxFQUFFO01BQVosQ0FBUDtJQUNELENBVEksQ0FBUDtFQVVEOztFQUVESyxtQkFBbUIsR0FBRztJQUNwQixPQUFPQyxrQ0FBUDtFQUNEOztBQTdCMEQ7OztlQWdDOUNmLG1CIn0=