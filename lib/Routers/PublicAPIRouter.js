'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PublicAPIRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const public_html = _path2.default.resolve(__dirname, "../../public_html");
const views = _path2.default.resolve(__dirname, '../../views');

class PublicAPIRouter extends _PromiseRouter2.default {

  verifyEmail(req) {
    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    const appId = req.params.appId;
    const config = _Config2.default.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!token || !username) {
      return this.invalidLink(req);
    }

    const userController = config.userController;
    return userController.verifyEmail(username, token).then(() => {
      const params = _querystring2.default.stringify({ username });
      return Promise.resolve({
        status: 302,
        location: `${config.verifyEmailSuccessURL}?${params}`
      });
    }, () => {
      return this.invalidVerificationLink(req);
    });
  }

  resendVerificationEmail(req) {
    const username = req.body.username;
    const appId = req.params.appId;
    const config = _Config2.default.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!username) {
      return this.invalidLink(req);
    }

    const userController = config.userController;

    return userController.resendVerificationEmail(username).then(() => {
      return Promise.resolve({
        status: 302,
        location: `${config.linkSendSuccessURL}`
      });
    }, () => {
      return Promise.resolve({
        status: 302,
        location: `${config.linkSendFailURL}`
      });
    });
  }

  changePassword(req) {
    return new Promise((resolve, reject) => {
      const config = _Config2.default.get(req.query.id);

      if (!config) {
        this.invalidRequest();
      }

      if (!config.publicServerURL) {
        return resolve({
          status: 404,
          text: 'Not found.'
        });
      }
      // Should we keep the file in memory or leave like that?
      _fs2.default.readFile(_path2.default.resolve(views, "choose_password"), 'utf-8', (err, data) => {
        if (err) {
          return reject(err);
        }
        data = data.replace("PARSE_SERVER_URL", `'${config.publicServerURL}'`);
        resolve({
          text: data
        });
      });
    });
  }

  requestResetPassword(req) {

    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username || !token) {
      return this.invalidLink(req);
    }

    return config.userController.checkResetTokenValidity(username, token).then(() => {
      const params = _querystring2.default.stringify({ token, id: config.applicationId, username, app: config.appName });
      return Promise.resolve({
        status: 302,
        location: `${config.choosePasswordURL}?${params}`
      });
    }, () => {
      return this.invalidLink(req);
    });
  }

  resetPassword(req) {

    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const { username, new_password, token: rawToken } = req.body;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username || !token || !new_password) {
      return this.invalidLink(req);
    }

    return config.userController.updatePassword(username, token, new_password).then(() => {
      const params = _querystring2.default.stringify({ username: username });
      return Promise.resolve({
        status: 302,
        location: `${config.passwordResetSuccessURL}?${params}`
      });
    }, err => {
      const params = _querystring2.default.stringify({ username: username, token: token, id: config.applicationId, error: err, app: config.appName });
      return Promise.resolve({
        status: 302,
        location: `${config.choosePasswordURL}?${params}`
      });
    });
  }

  invalidLink(req) {
    return Promise.resolve({
      status: 302,
      location: req.config.invalidLinkURL
    });
  }

  invalidVerificationLink(req) {
    const config = req.config;
    if (req.query.username && req.params.appId) {
      const params = _querystring2.default.stringify({ username: req.query.username, appId: req.params.appId });
      return Promise.resolve({
        status: 302,
        location: `${config.invalidVerificationLinkURL}?${params}`
      });
    } else {
      return this.invalidLink(req);
    }
  }

  missingPublicServerURL() {
    return Promise.resolve({
      text: 'Not found.',
      status: 404
    });
  }

  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = "unauthorized";
    throw error;
  }

  setConfig(req) {
    req.config = _Config2.default.get(req.params.appId);
    return Promise.resolve();
  }

  mountRoutes() {
    this.route('GET', '/apps/:appId/verify_email', req => {
      this.setConfig(req);
    }, req => {
      return this.verifyEmail(req);
    });

    this.route('POST', '/apps/:appId/resend_verification_email', req => {
      this.setConfig(req);
    }, req => {
      return this.resendVerificationEmail(req);
    });

    this.route('GET', '/apps/choose_password', req => {
      return this.changePassword(req);
    });

    this.route('POST', '/apps/:appId/request_password_reset', req => {
      this.setConfig(req);
    }, req => {
      return this.resetPassword(req);
    });

    this.route('GET', '/apps/:appId/request_password_reset', req => {
      this.setConfig(req);
    }, req => {
      return this.requestResetPassword(req);
    });
  }

  expressRouter() {
    const router = _express2.default.Router();
    router.use("/apps", _express2.default.static(public_html));
    router.use("/", super.expressRouter());
    return router;
  }
}

exports.PublicAPIRouter = PublicAPIRouter;
exports.default = PublicAPIRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1B1YmxpY0FQSVJvdXRlci5qcyJdLCJuYW1lcyI6WyJwdWJsaWNfaHRtbCIsInBhdGgiLCJyZXNvbHZlIiwiX19kaXJuYW1lIiwidmlld3MiLCJQdWJsaWNBUElSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwidmVyaWZ5RW1haWwiLCJyZXEiLCJ1c2VybmFtZSIsInRva2VuIiwicmF3VG9rZW4iLCJxdWVyeSIsInRvU3RyaW5nIiwiYXBwSWQiLCJwYXJhbXMiLCJjb25maWciLCJDb25maWciLCJnZXQiLCJpbnZhbGlkUmVxdWVzdCIsInB1YmxpY1NlcnZlclVSTCIsIm1pc3NpbmdQdWJsaWNTZXJ2ZXJVUkwiLCJpbnZhbGlkTGluayIsInVzZXJDb250cm9sbGVyIiwidGhlbiIsInFzIiwic3RyaW5naWZ5IiwiUHJvbWlzZSIsInN0YXR1cyIsImxvY2F0aW9uIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImJvZHkiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZEZhaWxVUkwiLCJjaGFuZ2VQYXNzd29yZCIsInJlamVjdCIsImlkIiwidGV4dCIsImZzIiwicmVhZEZpbGUiLCJlcnIiLCJkYXRhIiwicmVwbGFjZSIsInJlcXVlc3RSZXNldFBhc3N3b3JkIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJhcHBsaWNhdGlvbklkIiwiYXBwIiwiYXBwTmFtZSIsImNob29zZVBhc3N3b3JkVVJMIiwicmVzZXRQYXNzd29yZCIsIm5ld19wYXNzd29yZCIsInVwZGF0ZVBhc3N3b3JkIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwiLCJlcnJvciIsImludmFsaWRMaW5rVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJFcnJvciIsIm1lc3NhZ2UiLCJzZXRDb25maWciLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiZXhwcmVz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QUE3QixDQUFQO0FBQTJDLEtBRnREOztBQUlBLFNBQUtzRCxLQUFMLENBQVcsS0FBWCxFQUFpQix1QkFBakIsRUFDRXRELE9BQU87QUFBRSxhQUFPLEtBQUs0QixjQUFMLENBQW9CNUIsR0FBcEIsQ0FBUDtBQUFrQyxLQUQ3Qzs7QUFHQSxTQUFLc0QsS0FBTCxDQUFXLE1BQVgsRUFBa0IscUNBQWxCLEVBQ0V0RCxPQUFPO0FBQUUsV0FBS29ELFNBQUwsQ0FBZXBELEdBQWY7QUFBcUIsS0FEaEMsRUFFRUEsT0FBTztBQUFFLGFBQU8sS0FBSzJDLGFBQUwsQ0FBbUIzQyxHQUFuQixDQUFQO0FBQWlDLEtBRjVDOztBQUlBLFNBQUtzRCxLQUFMLENBQVcsS0FBWCxFQUFpQixxQ0FBakIsRUFDRXRELE9BQU87QUFBRSxXQUFLb0QsU0FBTCxDQUFlcEQsR0FBZjtBQUFxQixLQURoQyxFQUVFQSxPQUFPO0FBQUUsYUFBTyxLQUFLcUMsb0JBQUwsQ0FBMEJyQyxHQUExQixDQUFQO0FBQXdDLEtBRm5EO0FBR0Q7O0FBRUR1RCxrQkFBZ0I7QUFDZCxVQUFNQyxTQUFTQyxrQkFBUUMsTUFBUixFQUFmO0FBQ0FGLFdBQU9HLEdBQVAsQ0FBVyxPQUFYLEVBQW9CRixrQkFBUUcsTUFBUixDQUFlcEUsV0FBZixDQUFwQjtBQUNBZ0UsV0FBT0csR0FBUCxDQUFXLEdBQVgsRUFBZ0IsTUFBTUosYUFBTixFQUFoQjtBQUNBLFdBQU9DLE1BQVA7QUFDRDtBQTdOZ0Q7O1FBQXRDM0QsZSxHQUFBQSxlO2tCQWdPRUEsZSIsImZpbGUiOiJQdWJsaWNBUElSb3V0ZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHFzIGZyb20gJ3F1ZXJ5c3RyaW5nJztcblxuY29uc3QgcHVibGljX2h0bWwgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4uLy4uL3B1YmxpY19odG1sXCIpO1xuY29uc3Qgdmlld3MgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vdmlld3MnKTtcblxuZXhwb3J0IGNsYXNzIFB1YmxpY0FQSVJvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuXG4gIHZlcmlmeUVtYWlsKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcbiAgICBjb25zdCBhcHBJZCA9IHJlcS5wYXJhbXMuYXBwSWQ7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChhcHBJZCk7XG5cbiAgICBpZighY29uZmlnKXtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIWNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIHJldHVybiB0aGlzLm1pc3NpbmdQdWJsaWNTZXJ2ZXJVUkwoKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuIHx8ICF1c2VybmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuaW52YWxpZExpbmsocmVxKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIudmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKS50aGVuKCgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtcyA9IHFzLnN0cmluZ2lmeSh7dXNlcm5hbWV9KTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBzdGF0dXM6IDMwMixcbiAgICAgICAgbG9jYXRpb246IGAke2NvbmZpZy52ZXJpZnlFbWFpbFN1Y2Nlc3NVUkx9PyR7cGFyYW1zfWBcbiAgICAgIH0pO1xuICAgIH0sICgpPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsocmVxKTtcbiAgICB9KVxuICB9XG5cbiAgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwocmVxKSB7XG4gICAgY29uc3QgdXNlcm5hbWUgPSByZXEuYm9keS51c2VybmFtZTtcbiAgICBjb25zdCBhcHBJZCA9IHJlcS5wYXJhbXMuYXBwSWQ7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChhcHBJZCk7XG5cbiAgICBpZighY29uZmlnKXtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIWNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIHJldHVybiB0aGlzLm1pc3NpbmdQdWJsaWNTZXJ2ZXJVUkwoKTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5pbnZhbGlkTGluayhyZXEpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuXG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXJuYW1lKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBzdGF0dXM6IDMwMixcbiAgICAgICAgbG9jYXRpb246IGAke2NvbmZpZy5saW5rU2VuZFN1Y2Nlc3NVUkx9YFxuICAgICAgfSk7XG4gICAgfSwgKCk9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgc3RhdHVzOiAzMDIsXG4gICAgICAgIGxvY2F0aW9uOiBgJHtjb25maWcubGlua1NlbmRGYWlsVVJMfWBcbiAgICAgIH0pO1xuICAgIH0pXG4gIH1cblxuICBjaGFuZ2VQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucXVlcnkuaWQpO1xuXG4gICAgICBpZighY29uZmlnKXtcbiAgICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoe1xuICAgICAgICAgIHN0YXR1czogNDA0LFxuICAgICAgICAgIHRleHQ6ICdOb3QgZm91bmQuJ1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIC8vIFNob3VsZCB3ZSBrZWVwIHRoZSBmaWxlIGluIG1lbW9yeSBvciBsZWF2ZSBsaWtlIHRoYXQ/XG4gICAgICBmcy5yZWFkRmlsZShwYXRoLnJlc29sdmUodmlld3MsIFwiY2hvb3NlX3Bhc3N3b3JkXCIpLCAndXRmLTgnLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgIH1cbiAgICAgICAgZGF0YSA9IGRhdGEucmVwbGFjZShcIlBBUlNFX1NFUlZFUl9VUkxcIiwgYCcke2NvbmZpZy5wdWJsaWNTZXJ2ZXJVUkx9J2ApO1xuICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICB0ZXh0OiBkYXRhXG4gICAgICAgIH0pXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkKHJlcSkge1xuXG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIGlmKCFjb25maWcpe1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghY29uZmlnLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgcmV0dXJuIHRoaXMubWlzc2luZ1B1YmxpY1NlcnZlclVSTCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdXNlcm5hbWUgfHwgIXRva2VuKSB7XG4gICAgICByZXR1cm4gdGhpcy5pbnZhbGlkTGluayhyZXEpO1xuICAgIH1cblxuICAgIHJldHVybiBjb25maWcudXNlckNvbnRyb2xsZXIuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKS50aGVuKCgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtcyA9IHFzLnN0cmluZ2lmeSh7dG9rZW4sIGlkOiBjb25maWcuYXBwbGljYXRpb25JZCwgdXNlcm5hbWUsIGFwcDogY29uZmlnLmFwcE5hbWUsIH0pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHN0YXR1czogMzAyLFxuICAgICAgICBsb2NhdGlvbjogYCR7Y29uZmlnLmNob29zZVBhc3N3b3JkVVJMfT8ke3BhcmFtc31gXG4gICAgICB9KVxuICAgIH0sICgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmludmFsaWRMaW5rKHJlcSk7XG4gICAgfSlcbiAgfVxuXG4gIHJlc2V0UGFzc3dvcmQocmVxKSB7XG5cbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgaWYoIWNvbmZpZyl7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCFjb25maWcucHVibGljU2VydmVyVVJMKSB7XG4gICAgICByZXR1cm4gdGhpcy5taXNzaW5nUHVibGljU2VydmVyVVJMKCk7XG4gICAgfVxuXG4gICAgY29uc3QgeyB1c2VybmFtZSwgbmV3X3Bhc3N3b3JkLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5ib2R5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdXNlcm5hbWUgfHwgIXRva2VuIHx8ICFuZXdfcGFzc3dvcmQpIHtcbiAgICAgIHJldHVybiB0aGlzLmludmFsaWRMaW5rKHJlcSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZy51c2VyQ29udHJvbGxlci51cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIG5ld19wYXNzd29yZCkudGhlbigoKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbXMgPSBxcy5zdHJpbmdpZnkoe3VzZXJuYW1lOiB1c2VybmFtZX0pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHN0YXR1czogMzAyLFxuICAgICAgICBsb2NhdGlvbjogYCR7Y29uZmlnLnBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMfT8ke3BhcmFtc31gXG4gICAgICB9KTtcbiAgICB9LCAoZXJyKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbXMgPSBxcy5zdHJpbmdpZnkoe3VzZXJuYW1lOiB1c2VybmFtZSwgdG9rZW46IHRva2VuLCBpZDogY29uZmlnLmFwcGxpY2F0aW9uSWQsIGVycm9yOmVyciwgYXBwOmNvbmZpZy5hcHBOYW1lfSk7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgc3RhdHVzOiAzMDIsXG4gICAgICAgIGxvY2F0aW9uOiBgJHtjb25maWcuY2hvb3NlUGFzc3dvcmRVUkx9PyR7cGFyYW1zfWBcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gIH1cblxuICBpbnZhbGlkTGluayhyZXEpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHN0YXR1czogMzAyLFxuICAgICAgbG9jYXRpb246IHJlcS5jb25maWcuaW52YWxpZExpbmtVUkxcbiAgICB9KTtcbiAgfVxuXG4gIGludmFsaWRWZXJpZmljYXRpb25MaW5rKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgaWYgKHJlcS5xdWVyeS51c2VybmFtZSAmJiByZXEucGFyYW1zLmFwcElkKSB7XG4gICAgICBjb25zdCBwYXJhbXMgPSBxcy5zdHJpbmdpZnkoe3VzZXJuYW1lOiByZXEucXVlcnkudXNlcm5hbWUsIGFwcElkOiByZXEucGFyYW1zLmFwcElkfSk7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgc3RhdHVzOiAzMDIsXG4gICAgICAgIGxvY2F0aW9uOiBgJHtjb25maWcuaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkx9PyR7cGFyYW1zfWBcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5pbnZhbGlkTGluayhyZXEpO1xuICAgIH1cbiAgfVxuXG4gIG1pc3NpbmdQdWJsaWNTZXJ2ZXJVUkwoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICB0ZXh0OiAgJ05vdCBmb3VuZC4nLFxuICAgICAgc3RhdHVzOiA0MDRcbiAgICB9KTtcbiAgfVxuXG4gIGludmFsaWRSZXF1ZXN0KCkge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSBcInVuYXV0aG9yaXplZFwiO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgc2V0Q29uZmlnKHJlcSkge1xuICAgIHJlcS5jb25maWcgPSBDb25maWcuZ2V0KHJlcS5wYXJhbXMuYXBwSWQpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsJy9hcHBzLzphcHBJZC92ZXJpZnlfZW1haWwnLFxuICAgICAgcmVxID0+IHsgdGhpcy5zZXRDb25maWcocmVxKSB9LFxuICAgICAgcmVxID0+IHsgcmV0dXJuIHRoaXMudmVyaWZ5RW1haWwocmVxKTsgfSk7XG5cbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9hcHBzLzphcHBJZC9yZXNlbmRfdmVyaWZpY2F0aW9uX2VtYWlsJyxcbiAgICAgIHJlcSA9PiB7IHRoaXMuc2V0Q29uZmlnKHJlcSk7IH0sXG4gICAgICByZXEgPT4geyByZXR1cm4gdGhpcy5yZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpOyB9KTtcblxuICAgIHRoaXMucm91dGUoJ0dFVCcsJy9hcHBzL2Nob29zZV9wYXNzd29yZCcsXG4gICAgICByZXEgPT4geyByZXR1cm4gdGhpcy5jaGFuZ2VQYXNzd29yZChyZXEpOyB9KTtcblxuICAgIHRoaXMucm91dGUoJ1BPU1QnLCcvYXBwcy86YXBwSWQvcmVxdWVzdF9wYXNzd29yZF9yZXNldCcsXG4gICAgICByZXEgPT4geyB0aGlzLnNldENvbmZpZyhyZXEpIH0sXG4gICAgICByZXEgPT4geyByZXR1cm4gdGhpcy5yZXNldFBhc3N3b3JkKHJlcSk7IH0pO1xuXG4gICAgdGhpcy5yb3V0ZSgnR0VUJywnL2FwcHMvOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXQnLFxuICAgICAgcmVxID0+IHsgdGhpcy5zZXRDb25maWcocmVxKSB9LFxuICAgICAgcmVxID0+IHsgcmV0dXJuIHRoaXMucmVxdWVzdFJlc2V0UGFzc3dvcmQocmVxKTsgfSk7XG4gIH1cblxuICBleHByZXNzUm91dGVyKCkge1xuICAgIGNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG4gICAgcm91dGVyLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKHB1YmxpY19odG1sKSk7XG4gICAgcm91dGVyLnVzZShcIi9cIiwgc3VwZXIuZXhwcmVzc1JvdXRlcigpKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFB1YmxpY0FQSVJvdXRlcjtcbiJdfQ==