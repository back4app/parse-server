"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UserController = void 0;
var _cryptoUtils = require("../cryptoUtils");
var _triggers = require("../triggers");
var _AdaptableController = _interopRequireDefault(require("./AdaptableController"));
var _MailAdapter = _interopRequireDefault(require("../Adapters/Email/MailAdapter"));
var _rest = _interopRequireDefault(require("../rest"));
var _node = _interopRequireDefault(require("parse/node"));
var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));
var _Config = _interopRequireDefault(require("../Config"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var RestQuery = require('../RestQuery');
var Auth = require('../Auth');
class UserController extends _AdaptableController.default {
  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);
  }
  get config() {
    return _Config.default.get(this.appId);
  }
  validateAdapter(adapter) {
    // Allow no adapter
    if (!adapter && !this.shouldVerifyEmails) {
      return;
    }
    super.validateAdapter(adapter);
  }
  expectedAdapterType() {
    return _MailAdapter.default;
  }
  get shouldVerifyEmails() {
    return (this.config || this.options).verifyUserEmails;
  }
  async setEmailVerifyToken(user, req, storage = {}) {
    const shouldSendEmail = this.shouldVerifyEmails === true || typeof this.shouldVerifyEmails === 'function' && (await Promise.resolve(this.shouldVerifyEmails(req))) === true;
    if (!shouldSendEmail) {
      return false;
    }
    storage.sendVerificationEmail = true;
    user._email_verify_token = (0, _cryptoUtils.randomString)(25);
    if (!storage.fieldsChangedByTrigger || !storage.fieldsChangedByTrigger.includes('emailVerified')) {
      user.emailVerified = false;
    }
    if (this.config.emailVerifyTokenValidityDuration) {
      user._email_verify_token_expires_at = _node.default._encode(this.config.generateEmailVerifyTokenExpiresAt());
    }
    return true;
  }
  async verifyEmail(username, token) {
    if (!this.shouldVerifyEmails) {
      // Trying to verify email when not enabled
      // TODO: Better error here.
      throw undefined;
    }
    const query = {
      username: username,
      _email_verify_token: token
    };
    const updateFields = {
      emailVerified: true,
      _email_verify_token: {
        __op: 'Delete'
      }
    };

    // if the email verify token needs to be validated then
    // add additional query params and additional fields that need to be updated
    if (this.config.emailVerifyTokenValidityDuration) {
      query.emailVerified = false;
      query._email_verify_token_expires_at = {
        $gt: _node.default._encode(new Date())
      };
      updateFields._email_verify_token_expires_at = {
        __op: 'Delete'
      };
    }
    const maintenanceAuth = Auth.maintenance(this.config);
    var findUserForEmailVerification = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      auth: maintenanceAuth,
      className: '_User',
      restWhere: {
        username
      }
    });
    return findUserForEmailVerification.execute().then(result => {
      if (result.results.length && result.results[0].emailVerified) {
        return Promise.resolve(result.results.length[0]);
      } else if (result.results.length) {
        query.objectId = result.results[0].objectId;
      }
      return _rest.default.update(this.config, maintenanceAuth, '_User', query, updateFields);
    });
  }
  checkResetTokenValidity(username, token) {
    return this.config.database.find('_User', {
      username: username,
      _perishable_token: token
    }, {
      limit: 1
    }, Auth.maintenance(this.config)).then(results => {
      if (results.length != 1) {
        throw 'Failed to reset password: username / email / token is invalid';
      }
      if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
        let expiresDate = results[0]._perishable_token_expires_at;
        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }
        if (expiresDate < new Date()) {
          throw 'The password reset link has expired';
        }
      }
      return results[0];
    });
  }
  async getUserIfNeeded(user) {
    var where = {};
    if (user.username) {
      where.username = user.username;
    }
    if (user.email) {
      where.email = user.email;
    }
    var query = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      runBeforeFind: false,
      auth: Auth.master(this.config),
      className: '_User',
      restWhere: where
    });
    const result = await query.execute();
    if (result.results.length != 1) {
      throw undefined;
    }
    return result.results[0];
  }
  async sendVerificationEmail(user, req) {
    if (!this.shouldVerifyEmails) {
      return;
    }
    const token = encodeURIComponent(user._email_verify_token);
    // We may need to fetch the user in case of update email; only use the `fetchedUser`
    // from this point onwards; do not use the `user` as it may not contain all fields.
    const fetchedUser = await this.getUserIfNeeded(user);
    let shouldSendEmail = this.config.sendUserEmailVerification;
    if (typeof shouldSendEmail === 'function') {
      var _req$auth;
      const response = await Promise.resolve(this.config.sendUserEmailVerification({
        user: _node.default.Object.fromJSON(_objectSpread({
          className: '_User'
        }, fetchedUser)),
        master: (_req$auth = req.auth) === null || _req$auth === void 0 ? void 0 : _req$auth.isMaster
      }));
      shouldSendEmail = !!response;
    }
    if (!shouldSendEmail) {
      return;
    }
    const username = encodeURIComponent(fetchedUser.username);
    const link = buildEmailLink(this.config.verifyEmailURL, username, token, this.config);
    const options = {
      appName: this.config.appName,
      link: link,
      user: (0, _triggers.inflate)('_User', fetchedUser)
    };
    if (this.adapter.sendVerificationEmail) {
      this.adapter.sendVerificationEmail(options);
    } else {
      this.adapter.sendMail(this.defaultVerificationEmail(options));
    }
  }

  /**
   * Regenerates the given user's email verification token
   *
   * @param user
   * @returns {*}
   */
  async regenerateEmailVerifyToken(user, master, installationId, ip) {
    const {
      _email_verify_token
    } = user;
    let {
      _email_verify_token_expires_at
    } = user;
    if (_email_verify_token_expires_at && _email_verify_token_expires_at.__type === 'Date') {
      _email_verify_token_expires_at = _email_verify_token_expires_at.iso;
    }
    if (this.config.emailVerifyTokenReuseIfValid && this.config.emailVerifyTokenValidityDuration && _email_verify_token && new Date() < new Date(_email_verify_token_expires_at)) {
      return Promise.resolve(true);
    }
    const shouldSend = await this.setEmailVerifyToken(user, {
      object: _node.default.User.fromJSON(Object.assign({
        className: '_User'
      }, user)),
      master,
      installationId,
      ip,
      resendRequest: true
    });
    if (!shouldSend) {
      return;
    }
    return this.config.database.update('_User', {
      username: user.username
    }, user);
  }
  async resendVerificationEmail(username, req) {
    var _req$auth2, _req$auth3;
    const aUser = await this.getUserIfNeeded({
      username: username
    });
    if (!aUser || aUser.emailVerified) {
      throw undefined;
    }
    const generate = await this.regenerateEmailVerifyToken(aUser, (_req$auth2 = req.auth) === null || _req$auth2 === void 0 ? void 0 : _req$auth2.isMaster, (_req$auth3 = req.auth) === null || _req$auth3 === void 0 ? void 0 : _req$auth3.installationId, req.ip);
    if (generate) {
      this.sendVerificationEmail(aUser, req);
    }
  }
  setPasswordResetToken(email) {
    const token = {
      _perishable_token: (0, _cryptoUtils.randomString)(25)
    };
    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
      token._perishable_token_expires_at = _node.default._encode(this.config.generatePasswordResetTokenExpiresAt());
    }
    return this.config.database.update('_User', {
      $or: [{
        email
      }, {
        username: email,
        email: {
          $exists: false
        }
      }]
    }, token, {}, true);
  }
  async sendPasswordResetEmail(email) {
    if (!this.adapter) {
      throw 'Trying to send a reset password but no adapter is set';
      //  TODO: No adapter?
    }
    let user;
    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenReuseIfValid && this.config.passwordPolicy.resetTokenValidityDuration) {
      const results = await this.config.database.find('_User', {
        $or: [{
          email,
          _perishable_token: {
            $exists: true
          }
        }, {
          username: email,
          email: {
            $exists: false
          },
          _perishable_token: {
            $exists: true
          }
        }]
      }, {
        limit: 1
      }, Auth.maintenance(this.config));
      if (results.length == 1) {
        let expiresDate = results[0]._perishable_token_expires_at;
        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }
        if (expiresDate > new Date()) {
          user = results[0];
        }
      }
    }
    if (!user || !user._perishable_token) {
      user = await this.setPasswordResetToken(email);
    }
    const token = encodeURIComponent(user._perishable_token);
    const username = encodeURIComponent(user.username);
    const link = buildEmailLink(this.config.requestResetPasswordURL, username, token, this.config);
    const options = {
      appName: this.config.appName,
      link: link,
      user: (0, _triggers.inflate)('_User', user)
    };
    if (this.adapter.sendPasswordResetEmail) {
      this.adapter.sendPasswordResetEmail(options);
    } else {
      this.adapter.sendMail(this.defaultResetPasswordEmail(options));
    }
    return Promise.resolve(user);
  }
  updatePassword(username, token, password) {
    return this.checkResetTokenValidity(username, token).then(user => updateUserPassword(user, password, this.config)).then(user => {
      const accountLockoutPolicy = new _AccountLockout.default(user, this.config);
      return accountLockoutPolicy.unlockAccount();
    }).catch(error => {
      if (error && error.message) {
        // in case of Parse.Error, fail with the error message only
        return Promise.reject(error.message);
      } else {
        return Promise.reject(error);
      }
    });
  }
  defaultVerificationEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You are being asked to confirm the e-mail address ' + user.get('email') + ' with ' + appName + '\n\n' + '' + 'Click here to confirm it:\n' + link;
    const to = user.get('email');
    const subject = 'Please verify your e-mail for ' + appName;
    return {
      text,
      to,
      subject
    };
  }
  defaultResetPasswordEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You requested to reset your password for ' + appName + (user.get('username') ? " (your username is '" + user.get('username') + "')" : '') + '.\n\n' + '' + 'Click here to reset it:\n' + link;
    const to = user.get('email') || user.get('username');
    const subject = 'Password Reset for ' + appName;
    return {
      text,
      to,
      subject
    };
  }
}

// Mark this private
exports.UserController = UserController;
function updateUserPassword(user, password, config) {
  return _rest.default.update(config, Auth.master(config), '_User', {
    objectId: user.objectId
  }, {
    password: password
  }).then(() => user);
}
function buildEmailLink(destination, username, token, config) {
  const usernameAndToken = `token=${token}&username=${username}`;
  if (config.parseFrameURL) {
    const destinationWithoutHost = destination.replace(config.publicServerURL, '');
    return `${config.parseFrameURL}?link=${encodeURIComponent(destinationWithoutHost)}&${usernameAndToken}`;
  } else {
    return `${destination}?${usernameAndToken}`;
  }
}
var _default = exports.default = UserController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX3RyaWdnZXJzIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX01haWxBZGFwdGVyIiwiX3Jlc3QiLCJfbm9kZSIsIl9BY2NvdW50TG9ja291dCIsIl9Db25maWciLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiciIsInQiLCJPYmplY3QiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZGVmaW5lUHJvcGVydHkiLCJfdG9Qcm9wZXJ0eUtleSIsInZhbHVlIiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJpIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJjYWxsIiwiVHlwZUVycm9yIiwiU3RyaW5nIiwiTnVtYmVyIiwiUmVzdFF1ZXJ5IiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsInJlcSIsInN0b3JhZ2UiLCJzaG91bGRTZW5kRW1haWwiLCJQcm9taXNlIiwicmVzb2x2ZSIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJyYW5kb21TdHJpbmciLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiaW5jbHVkZXMiLCJlbWFpbFZlcmlmaWVkIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJQYXJzZSIsIl9lbmNvZGUiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJ2ZXJpZnlFbWFpbCIsInVzZXJuYW1lIiwidG9rZW4iLCJ1bmRlZmluZWQiLCJxdWVyeSIsInVwZGF0ZUZpZWxkcyIsIl9fb3AiLCIkZ3QiLCJEYXRlIiwibWFpbnRlbmFuY2VBdXRoIiwibWFpbnRlbmFuY2UiLCJmaW5kVXNlckZvckVtYWlsVmVyaWZpY2F0aW9uIiwibWV0aG9kIiwiTWV0aG9kIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsImV4ZWN1dGUiLCJ0aGVuIiwicmVzdWx0IiwicmVzdWx0cyIsIm9iamVjdElkIiwicmVzdCIsInVwZGF0ZSIsImNoZWNrUmVzZXRUb2tlblZhbGlkaXR5IiwiZGF0YWJhc2UiLCJmaW5kIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJsaW1pdCIsInBhc3N3b3JkUG9saWN5IiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJleHBpcmVzRGF0ZSIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfX3R5cGUiLCJpc28iLCJnZXRVc2VySWZOZWVkZWQiLCJ3aGVyZSIsImVtYWlsIiwicnVuQmVmb3JlRmluZCIsIm1hc3RlciIsImVuY29kZVVSSUNvbXBvbmVudCIsImZldGNoZWRVc2VyIiwic2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbiIsIl9yZXEkYXV0aCIsInJlc3BvbnNlIiwiZnJvbUpTT04iLCJpc01hc3RlciIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsImluZmxhdGUiLCJzZW5kTWFpbCIsImRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJpcCIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJzaG91bGRTZW5kIiwib2JqZWN0IiwiVXNlciIsImFzc2lnbiIsInJlc2VuZFJlcXVlc3QiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9yZXEkYXV0aDIiLCJfcmVxJGF1dGgzIiwiYVVzZXIiLCJnZW5lcmF0ZSIsInNldFBhc3N3b3JkUmVzZXRUb2tlbiIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiJG9yIiwiJGV4aXN0cyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJkZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsIiwidXBkYXRlUGFzc3dvcmQiLCJwYXNzd29yZCIsInVwZGF0ZVVzZXJQYXNzd29yZCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJ1bmxvY2tBY2NvdW50IiwiY2F0Y2giLCJlcnJvciIsIm1lc3NhZ2UiLCJyZWplY3QiLCJ0ZXh0IiwidG8iLCJzdWJqZWN0IiwiZXhwb3J0cyIsImRlc3RpbmF0aW9uIiwidXNlcm5hbWVBbmRUb2tlbiIsInBhcnNlRnJhbWVVUkwiLCJkZXN0aW5hdGlvbldpdGhvdXRIb3N0IiwicmVwbGFjZSIsInB1YmxpY1NlcnZlclVSTCIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1VzZXJDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCB7IGluZmxhdGUgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgQWRhcHRhYmxlQ29udHJvbGxlciBmcm9tICcuL0FkYXB0YWJsZUNvbnRyb2xsZXInO1xuaW1wb3J0IE1haWxBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL0VtYWlsL01haWxBZGFwdGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcblxudmFyIFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4uL1Jlc3RRdWVyeScpO1xudmFyIEF1dGggPSByZXF1aXJlKCcuLi9BdXRoJyk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBjb25zdHJ1Y3RvcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgZ2V0IGNvbmZpZygpIHtcbiAgICByZXR1cm4gQ29uZmlnLmdldCh0aGlzLmFwcElkKTtcbiAgfVxuXG4gIHZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKSB7XG4gICAgLy8gQWxsb3cgbm8gYWRhcHRlclxuICAgIGlmICghYWRhcHRlciAmJiAhdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3VwZXIudmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTWFpbEFkYXB0ZXI7XG4gIH1cblxuICBnZXQgc2hvdWxkVmVyaWZ5RW1haWxzKCkge1xuICAgIHJldHVybiAodGhpcy5jb25maWcgfHwgdGhpcy5vcHRpb25zKS52ZXJpZnlVc2VyRW1haWxzO1xuICB9XG5cbiAgYXN5bmMgc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEsIHN0b3JhZ2UgPSB7fSkge1xuICAgIGNvbnN0IHNob3VsZFNlbmRFbWFpbCA9XG4gICAgICB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gdHJ1ZSB8fFxuICAgICAgKHR5cGVvZiB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAoYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKHJlcSkpKSA9PT0gdHJ1ZSk7XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RvcmFnZS5zZW5kVmVyaWZpY2F0aW9uRW1haWwgPSB0cnVlO1xuICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHJhbmRvbVN0cmluZygyNSk7XG4gICAgaWYgKFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmNsdWRlcygnZW1haWxWZXJpZmllZCcpXG4gICAgKSB7XG4gICAgICB1c2VyLmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgLy8gVHJ5aW5nIHRvIHZlcmlmeSBlbWFpbCB3aGVuIG5vdCBlbmFibGVkXG4gICAgICAvLyBUT0RPOiBCZXR0ZXIgZXJyb3IgaGVyZS5cbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9O1xuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcblxuICAgIC8vIGlmIHRoZSBlbWFpbCB2ZXJpZnkgdG9rZW4gbmVlZHMgdG8gYmUgdmFsaWRhdGVkIHRoZW5cbiAgICAvLyBhZGQgYWRkaXRpb25hbCBxdWVyeSBwYXJhbXMgYW5kIGFkZGl0aW9uYWwgZmllbGRzIHRoYXQgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBxdWVyeS5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgICBxdWVyeS5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9O1xuXG4gICAgICB1cGRhdGVGaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCBtYWludGVuYW5jZUF1dGggPSBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKTtcbiAgICB2YXIgZmluZFVzZXJGb3JFbWFpbFZlcmlmaWNhdGlvbiA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1haW50ZW5hbmNlQXV0aCxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIHJlc3RXaGVyZToge1xuICAgICAgICB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcmV0dXJuIGZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24uZXhlY3V0ZSgpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGggJiYgcmVzdWx0LnJlc3VsdHNbMF0uZW1haWxWZXJpZmllZCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdC5yZXN1bHRzLmxlbmd0aFswXSk7XG4gICAgICB9IGVsc2UgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICBxdWVyeS5vYmplY3RJZCA9IHJlc3VsdC5yZXN1bHRzWzBdLm9iamVjdElkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3QudXBkYXRlKHRoaXMuY29uZmlnLCBtYWludGVuYW5jZUF1dGgsICdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICAgIH0pO1xuICB9XG5cbiAgY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICBfcGVyaXNoYWJsZV90b2tlbjogdG9rZW4sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93ICdGYWlsZWQgdG8gcmVzZXQgcGFzc3dvcmQ6IHVzZXJuYW1lIC8gZW1haWwgLyB0b2tlbiBpcyBpbnZhbGlkJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgJiYgZXhwaXJlc0RhdGUuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgPCBuZXcgRGF0ZSgpKSB7IHRocm93ICdUaGUgcGFzc3dvcmQgcmVzZXQgbGluayBoYXMgZXhwaXJlZCc7IH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0VXNlcklmTmVlZGVkKHVzZXIpIHtcbiAgICB2YXIgd2hlcmUgPSB7fTtcbiAgICBpZiAodXNlci51c2VybmFtZSkge1xuICAgICAgd2hlcmUudXNlcm5hbWUgPSB1c2VyLnVzZXJuYW1lO1xuICAgIH1cbiAgICBpZiAodXNlci5lbWFpbCkge1xuICAgICAgd2hlcmUuZW1haWwgPSB1c2VyLmVtYWlsO1xuICAgIH1cblxuICAgIHZhciBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgcmVzdFdoZXJlOiB3aGVyZSxcbiAgICB9KTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQucmVzdWx0c1swXTtcbiAgfVxuXG4gIGFzeW5jIHNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyLCByZXEpIHtcbiAgICBpZiAoIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbik7XG4gICAgLy8gV2UgbWF5IG5lZWQgdG8gZmV0Y2ggdGhlIHVzZXIgaW4gY2FzZSBvZiB1cGRhdGUgZW1haWw7IG9ubHkgdXNlIHRoZSBgZmV0Y2hlZFVzZXJgXG4gICAgLy8gZnJvbSB0aGlzIHBvaW50IG9ud2FyZHM7IGRvIG5vdCB1c2UgdGhlIGB1c2VyYCBhcyBpdCBtYXkgbm90IGNvbnRhaW4gYWxsIGZpZWxkcy5cbiAgICBjb25zdCBmZXRjaGVkVXNlciA9IGF3YWl0IHRoaXMuZ2V0VXNlcklmTmVlZGVkKHVzZXIpO1xuICAgIGxldCBzaG91bGRTZW5kRW1haWwgPSB0aGlzLmNvbmZpZy5zZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uO1xuICAgIGlmICh0eXBlb2Ygc2hvdWxkU2VuZEVtYWlsID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgdGhpcy5jb25maWcuc2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbih7XG4gICAgICAgICAgdXNlcjogUGFyc2UuT2JqZWN0LmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mZXRjaGVkVXNlciB9KSxcbiAgICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoPy5pc01hc3RlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICBzaG91bGRTZW5kRW1haWwgPSAhIXJlc3BvbnNlO1xuICAgIH1cbiAgICBpZiAoIXNob3VsZFNlbmRFbWFpbCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB1c2VybmFtZSA9IGVuY29kZVVSSUNvbXBvbmVudChmZXRjaGVkVXNlci51c2VybmFtZSk7XG5cbiAgICBjb25zdCBsaW5rID0gYnVpbGRFbWFpbExpbmsodGhpcy5jb25maWcudmVyaWZ5RW1haWxVUkwsIHVzZXJuYW1lLCB0b2tlbiwgdGhpcy5jb25maWcpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBhcHBOYW1lOiB0aGlzLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgbGluazogbGluayxcbiAgICAgIHVzZXI6IGluZmxhdGUoJ19Vc2VyJywgZmV0Y2hlZFVzZXIpLFxuICAgIH07XG4gICAgaWYgKHRoaXMuYWRhcHRlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwpIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwob3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2VuZXJhdGVzIHRoZSBnaXZlbiB1c2VyJ3MgZW1haWwgdmVyaWZpY2F0aW9uIHRva2VuXG4gICAqXG4gICAqIEBwYXJhbSB1c2VyXG4gICAqIEByZXR1cm5zIHsqfVxuICAgKi9cbiAgYXN5bmMgcmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4odXNlciwgbWFzdGVyLCBpbnN0YWxsYXRpb25JZCwgaXApIHtcbiAgICBjb25zdCB7IF9lbWFpbF92ZXJpZnlfdG9rZW4gfSA9IHVzZXI7XG4gICAgbGV0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IH0gPSB1c2VyO1xuICAgIGlmIChfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgJiYgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuaXNvO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAmJlxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbiAmJlxuICAgICAgbmV3IERhdGUoKSA8IG5ldyBEYXRlKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdClcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIGNvbnN0IHNob3VsZFNlbmQgPSBhd2FpdCB0aGlzLnNldEVtYWlsVmVyaWZ5VG9rZW4odXNlciwge1xuICAgICAgb2JqZWN0OiBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbWFzdGVyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpcCxcbiAgICAgIHJlc2VuZFJlcXVlc3Q6IHRydWVcbiAgICB9KTtcbiAgICBpZiAoIXNob3VsZFNlbmQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sIHVzZXIpO1xuICB9XG5cbiAgYXN5bmMgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcm5hbWUsIHJlcSkge1xuICAgIGNvbnN0IGFVc2VyID0gYXdhaXQgdGhpcy5nZXRVc2VySWZOZWVkZWQoeyB1c2VybmFtZTogdXNlcm5hbWUgfSk7XG4gICAgaWYgKCFhVXNlciB8fCBhVXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IGdlbmVyYXRlID0gYXdhaXQgdGhpcy5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbihhVXNlciwgcmVxLmF1dGg/LmlzTWFzdGVyLCByZXEuYXV0aD8uaW5zdGFsbGF0aW9uSWQsIHJlcS5pcCk7XG4gICAgaWYgKGdlbmVyYXRlKSB7XG4gICAgICB0aGlzLnNlbmRWZXJpZmljYXRpb25FbWFpbChhVXNlciwgcmVxKTtcbiAgICB9XG4gIH1cblxuICBzZXRQYXNzd29yZFJlc2V0VG9rZW4oZW1haWwpIHtcbiAgICBjb25zdCB0b2tlbiA9IHsgX3BlcmlzaGFibGVfdG9rZW46IHJhbmRvbVN0cmluZygyNSkgfTtcblxuICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdG9rZW4uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgIHRoaXMuY29uZmlnLmdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICdfVXNlcicsXG4gICAgICB7ICRvcjogW3sgZW1haWwgfSwgeyB1c2VybmFtZTogZW1haWwsIGVtYWlsOiB7ICRleGlzdHM6IGZhbHNlIH0gfV0gfSxcbiAgICAgIHRva2VuLFxuICAgICAge30sXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpIHtcbiAgICBpZiAoIXRoaXMuYWRhcHRlcikge1xuICAgICAgdGhyb3cgJ1RyeWluZyB0byBzZW5kIGEgcmVzZXQgcGFzc3dvcmQgYnV0IG5vIGFkYXB0ZXIgaXMgc2V0JztcbiAgICAgIC8vICBUT0RPOiBObyBhZGFwdGVyP1xuICAgIH1cbiAgICBsZXQgdXNlcjtcbiAgICBpZiAoXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb25cbiAgICApIHtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7XG4gICAgICAgICAgJG9yOiBbXG4gICAgICAgICAgICB7IGVtYWlsLCBfcGVyaXNoYWJsZV90b2tlbjogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgICAgICAgIHsgdXNlcm5hbWU6IGVtYWlsLCBlbWFpbDogeyAkZXhpc3RzOiBmYWxzZSB9LCBfcGVyaXNoYWJsZV90b2tlbjogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgbGV0IGV4cGlyZXNEYXRlID0gcmVzdWx0c1swXS5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICAgICAgICBpZiAoZXhwaXJlc0RhdGUgJiYgZXhwaXJlc0RhdGUuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGV4cGlyZXNEYXRlID0gbmV3IERhdGUoZXhwaXJlc0RhdGUuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXhwaXJlc0RhdGUgPiBuZXcgRGF0ZSgpKSB7XG4gICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCF1c2VyIHx8ICF1c2VyLl9wZXJpc2hhYmxlX3Rva2VuKSB7XG4gICAgICB1c2VyID0gYXdhaXQgdGhpcy5zZXRQYXNzd29yZFJlc2V0VG9rZW4oZW1haWwpO1xuICAgIH1cbiAgICBjb25zdCB0b2tlbiA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLl9wZXJpc2hhYmxlX3Rva2VuKTtcbiAgICBjb25zdCB1c2VybmFtZSA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLnVzZXJuYW1lKTtcblxuICAgIGNvbnN0IGxpbmsgPSBidWlsZEVtYWlsTGluayh0aGlzLmNvbmZpZy5yZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCwgdXNlcm5hbWUsIHRva2VuLCB0aGlzLmNvbmZpZyk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIGFwcE5hbWU6IHRoaXMuY29uZmlnLmFwcE5hbWUsXG4gICAgICBsaW5rOiBsaW5rLFxuICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCB1c2VyKSxcbiAgICB9O1xuXG4gICAgaWYgKHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbChvcHRpb25zKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1c2VyKTtcbiAgfVxuXG4gIHVwZGF0ZVBhc3N3b3JkKHVzZXJuYW1lLCB0b2tlbiwgcGFzc3dvcmQpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh1c2VybmFtZSwgdG9rZW4pXG4gICAgICAudGhlbih1c2VyID0+IHVwZGF0ZVVzZXJQYXNzd29yZCh1c2VyLCBwYXNzd29yZCwgdGhpcy5jb25maWcpKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHRoaXMuY29uZmlnKTtcbiAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LnVubG9ja0FjY291bnQoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgIC8vIGluIGNhc2Ugb2YgUGFyc2UuRXJyb3IsIGZhaWwgd2l0aCB0aGUgZXJyb3IgbWVzc2FnZSBvbmx5XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsKHsgbGluaywgdXNlciwgYXBwTmFtZSB9KSB7XG4gICAgY29uc3QgdGV4dCA9XG4gICAgICAnSGksXFxuXFxuJyArXG4gICAgICAnWW91IGFyZSBiZWluZyBhc2tlZCB0byBjb25maXJtIHRoZSBlLW1haWwgYWRkcmVzcyAnICtcbiAgICAgIHVzZXIuZ2V0KCdlbWFpbCcpICtcbiAgICAgICcgd2l0aCAnICtcbiAgICAgIGFwcE5hbWUgK1xuICAgICAgJ1xcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gY29uZmlybSBpdDpcXG4nICtcbiAgICAgIGxpbms7XG4gICAgY29uc3QgdG8gPSB1c2VyLmdldCgnZW1haWwnKTtcbiAgICBjb25zdCBzdWJqZWN0ID0gJ1BsZWFzZSB2ZXJpZnkgeW91ciBlLW1haWwgZm9yICcgKyBhcHBOYW1lO1xuICAgIHJldHVybiB7IHRleHQsIHRvLCBzdWJqZWN0IH07XG4gIH1cblxuICBkZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsKHsgbGluaywgdXNlciwgYXBwTmFtZSB9KSB7XG4gICAgY29uc3QgdGV4dCA9XG4gICAgICAnSGksXFxuXFxuJyArXG4gICAgICAnWW91IHJlcXVlc3RlZCB0byByZXNldCB5b3VyIHBhc3N3b3JkIGZvciAnICtcbiAgICAgIGFwcE5hbWUgK1xuICAgICAgKHVzZXIuZ2V0KCd1c2VybmFtZScpID8gXCIgKHlvdXIgdXNlcm5hbWUgaXMgJ1wiICsgdXNlci5nZXQoJ3VzZXJuYW1lJykgKyBcIicpXCIgOiAnJykgK1xuICAgICAgJy5cXG5cXG4nICtcbiAgICAgICcnICtcbiAgICAgICdDbGljayBoZXJlIHRvIHJlc2V0IGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpIHx8IHVzZXIuZ2V0KCd1c2VybmFtZScpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGFzc3dvcmQgUmVzZXQgZm9yICcgKyBhcHBOYW1lO1xuICAgIHJldHVybiB7IHRleHQsIHRvLCBzdWJqZWN0IH07XG4gIH1cbn1cblxuLy8gTWFyayB0aGlzIHByaXZhdGVcbmZ1bmN0aW9uIHVwZGF0ZVVzZXJQYXNzd29yZCh1c2VyLCBwYXNzd29yZCwgY29uZmlnKSB7XG4gIHJldHVybiByZXN0XG4gICAgLnVwZGF0ZShcbiAgICAgIGNvbmZpZyxcbiAgICAgIEF1dGgubWFzdGVyKGNvbmZpZyksXG4gICAgICAnX1VzZXInLFxuICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAge1xuICAgICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgICB9XG4gICAgKVxuICAgIC50aGVuKCgpID0+IHVzZXIpO1xufVxuXG5mdW5jdGlvbiBidWlsZEVtYWlsTGluayhkZXN0aW5hdGlvbiwgdXNlcm5hbWUsIHRva2VuLCBjb25maWcpIHtcbiAgY29uc3QgdXNlcm5hbWVBbmRUb2tlbiA9IGB0b2tlbj0ke3Rva2VufSZ1c2VybmFtZT0ke3VzZXJuYW1lfWA7XG5cbiAgaWYgKGNvbmZpZy5wYXJzZUZyYW1lVVJMKSB7XG4gICAgY29uc3QgZGVzdGluYXRpb25XaXRob3V0SG9zdCA9IGRlc3RpbmF0aW9uLnJlcGxhY2UoY29uZmlnLnB1YmxpY1NlcnZlclVSTCwgJycpO1xuXG4gICAgcmV0dXJuIGAke2NvbmZpZy5wYXJzZUZyYW1lVVJMfT9saW5rPSR7ZW5jb2RlVVJJQ29tcG9uZW50KFxuICAgICAgZGVzdGluYXRpb25XaXRob3V0SG9zdFxuICAgICl9JiR7dXNlcm5hbWVBbmRUb2tlbn1gO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBgJHtkZXN0aW5hdGlvbn0/JHt1c2VybmFtZUFuZFRva2VufWA7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlckNvbnRyb2xsZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLFlBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFNBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLG9CQUFBLEdBQUFDLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSSxZQUFBLEdBQUFELHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSyxLQUFBLEdBQUFGLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFILHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBTyxlQUFBLEdBQUFKLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBUSxPQUFBLEdBQUFMLHNCQUFBLENBQUFILE9BQUE7QUFBK0IsU0FBQUcsdUJBQUFNLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFBQSxTQUFBRyxRQUFBSCxDQUFBLEVBQUFJLENBQUEsUUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLElBQUEsQ0FBQVAsQ0FBQSxPQUFBTSxNQUFBLENBQUFFLHFCQUFBLFFBQUFDLENBQUEsR0FBQUgsTUFBQSxDQUFBRSxxQkFBQSxDQUFBUixDQUFBLEdBQUFJLENBQUEsS0FBQUssQ0FBQSxHQUFBQSxDQUFBLENBQUFDLE1BQUEsV0FBQU4sQ0FBQSxXQUFBRSxNQUFBLENBQUFLLHdCQUFBLENBQUFYLENBQUEsRUFB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