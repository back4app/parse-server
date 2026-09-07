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
  async verifyEmail(token) {
    if (!this.shouldVerifyEmails) {
      // Trying to verify email when not enabled
      // TODO: Better error here.
      throw undefined;
    }
    const query = {
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
    const restQuery = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      auth: maintenanceAuth,
      className: '_User',
      restWhere: query
    });
    const result = await restQuery.execute();
    if (result.results.length) {
      query.objectId = result.results[0].objectId;
    }
    return await _rest.default.update(this.config, maintenanceAuth, '_User', query, updateFields);
  }
  async checkResetTokenValidity(token) {
    const results = await this.config.database.find('_User', {
      _perishable_token: token
    }, {
      limit: 1
    }, Auth.maintenance(this.config));
    if (results.length !== 1) {
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
  }
  async getUserIfNeeded(user) {
    var where = {};
    if (user.username) {
      where.username = user.username;
    }
    if (user.email) {
      where.email = user.email;
    }
    if (user._email_verify_token) {
      where._email_verify_token = user._email_verify_token;
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
      const response = await Promise.resolve(this.config.sendUserEmailVerification({
        user: _node.default.Object.fromJSON({
          className: '_User',
          ...fetchedUser
        }),
        master: req.auth?.isMaster
      }));
      shouldSendEmail = !!response;
    }
    if (!shouldSendEmail) {
      return;
    }
    const link = buildEmailLink(this.config.verifyEmailURL, token, this.config);
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
  async resendVerificationEmail(username, req, token) {
    const aUser = await this.getUserIfNeeded({
      username,
      _email_verify_token: token
    });
    if (!aUser || aUser.emailVerified) {
      throw undefined;
    }
    const generate = await this.regenerateEmailVerifyToken(aUser, req.auth?.isMaster, req.auth?.installationId, req.ip);
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
    if (user && user.value) {
      user = user.value;
    }
    const token = encodeURIComponent(user._perishable_token);
    const link = buildEmailLink(this.config.requestResetPasswordURL, token, this.config);
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
  async updatePassword(token, password) {
    try {
      const rawUser = await this.checkResetTokenValidity(token);
      let user;
      try {
        user = await updateUserPassword(rawUser, password, this.config);
      } catch (error) {
        if (error && error.code === _node.default.Error.OBJECT_NOT_FOUND) {
          throw 'Failed to reset password: username / email / token is invalid';
        }
        throw error;
      }
      const accountLockoutPolicy = new _AccountLockout.default(user, this.config);
      return await accountLockoutPolicy.unlockAccount();
    } catch (error) {
      if (error && error.message) {
        // in case of Parse.Error, fail with the error message only
        return Promise.reject(error.message);
      }
      return Promise.reject(error);
    }
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
    objectId: user.objectId,
    _perishable_token: user._perishable_token
  }, {
    password: password
  }).then(() => user);
}
function buildEmailLink(destination, token, config) {
  token = `token=${token}`;
  if (config.parseFrameURL) {
    const destinationWithoutHost = destination.replace(config.publicServerURL, '');
    return `${config.parseFrameURL}?link=${encodeURIComponent(destinationWithoutHost)}&${token}`;
  } else {
    return `${destination}?${token}`;
  }
}
var _default = exports.default = UserController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX3RyaWdnZXJzIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX01haWxBZGFwdGVyIiwiX3Jlc3QiLCJfbm9kZSIsIl9BY2NvdW50TG9ja291dCIsIl9Db25maWciLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJSZXN0UXVlcnkiLCJBdXRoIiwiVXNlckNvbnRyb2xsZXIiLCJBZGFwdGFibGVDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiYXBwSWQiLCJvcHRpb25zIiwiY29uZmlnIiwiQ29uZmlnIiwiZ2V0IiwidmFsaWRhdGVBZGFwdGVyIiwic2hvdWxkVmVyaWZ5RW1haWxzIiwiZXhwZWN0ZWRBZGFwdGVyVHlwZSIsIk1haWxBZGFwdGVyIiwidmVyaWZ5VXNlckVtYWlscyIsInNldEVtYWlsVmVyaWZ5VG9rZW4iLCJ1c2VyIiwicmVxIiwic3RvcmFnZSIsInNob3VsZFNlbmRFbWFpbCIsIlByb21pc2UiLCJyZXNvbHZlIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsInJhbmRvbVN0cmluZyIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJpbmNsdWRlcyIsImVtYWlsVmVyaWZpZWQiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcmlmeUVtYWlsIiwidG9rZW4iLCJ1bmRlZmluZWQiLCJxdWVyeSIsInVwZGF0ZUZpZWxkcyIsIl9fb3AiLCIkZ3QiLCJEYXRlIiwibWFpbnRlbmFuY2VBdXRoIiwibWFpbnRlbmFuY2UiLCJyZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJhdXRoIiwiY2xhc3NOYW1lIiwicmVzdFdoZXJlIiwicmVzdWx0IiwiZXhlY3V0ZSIsInJlc3VsdHMiLCJsZW5ndGgiLCJvYmplY3RJZCIsInJlc3QiLCJ1cGRhdGUiLCJjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSIsImRhdGFiYXNlIiwiZmluZCIsIl9wZXJpc2hhYmxlX3Rva2VuIiwibGltaXQiLCJwYXNzd29yZFBvbGljeSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZXhwaXJlc0RhdGUiLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX190eXBlIiwiaXNvIiwiZ2V0VXNlcklmTmVlZGVkIiwid2hlcmUiLCJ1c2VybmFtZSIsImVtYWlsIiwicnVuQmVmb3JlRmluZCIsIm1hc3RlciIsImVuY29kZVVSSUNvbXBvbmVudCIsImZldGNoZWRVc2VyIiwic2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbiIsInJlc3BvbnNlIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJpc01hc3RlciIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsImluZmxhdGUiLCJzZW5kTWFpbCIsImRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJpcCIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJzaG91bGRTZW5kIiwib2JqZWN0IiwiVXNlciIsImFzc2lnbiIsInJlc2VuZFJlcXVlc3QiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImFVc2VyIiwiZ2VuZXJhdGUiLCJzZXRQYXNzd29yZFJlc2V0VG9rZW4iLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsIiRvciIsIiRleGlzdHMiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInZhbHVlIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJkZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsIiwidXBkYXRlUGFzc3dvcmQiLCJwYXNzd29yZCIsInJhd1VzZXIiLCJ1cGRhdGVVc2VyUGFzc3dvcmQiLCJlcnJvciIsImNvZGUiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwidW5sb2NrQWNjb3VudCIsIm1lc3NhZ2UiLCJyZWplY3QiLCJ0ZXh0IiwidG8iLCJzdWJqZWN0IiwiZXhwb3J0cyIsInRoZW4iLCJkZXN0aW5hdGlvbiIsInBhcnNlRnJhbWVVUkwiLCJkZXN0aW5hdGlvbldpdGhvdXRIb3N0IiwicmVwbGFjZSIsInB1YmxpY1NlcnZlclVSTCIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1VzZXJDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCB7IGluZmxhdGUgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgQWRhcHRhYmxlQ29udHJvbGxlciBmcm9tICcuL0FkYXB0YWJsZUNvbnRyb2xsZXInO1xuaW1wb3J0IE1haWxBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL0VtYWlsL01haWxBZGFwdGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcblxudmFyIFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4uL1Jlc3RRdWVyeScpO1xudmFyIEF1dGggPSByZXF1aXJlKCcuLi9BdXRoJyk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBjb25zdHJ1Y3RvcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgZ2V0IGNvbmZpZygpIHtcbiAgICByZXR1cm4gQ29uZmlnLmdldCh0aGlzLmFwcElkKTtcbiAgfVxuXG4gIHZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKSB7XG4gICAgLy8gQWxsb3cgbm8gYWRhcHRlclxuICAgIGlmICghYWRhcHRlciAmJiAhdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3VwZXIudmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTWFpbEFkYXB0ZXI7XG4gIH1cblxuICBnZXQgc2hvdWxkVmVyaWZ5RW1haWxzKCkge1xuICAgIHJldHVybiAodGhpcy5jb25maWcgfHwgdGhpcy5vcHRpb25zKS52ZXJpZnlVc2VyRW1haWxzO1xuICB9XG5cbiAgYXN5bmMgc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEsIHN0b3JhZ2UgPSB7fSkge1xuICAgIGNvbnN0IHNob3VsZFNlbmRFbWFpbCA9XG4gICAgICB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gdHJ1ZSB8fFxuICAgICAgKHR5cGVvZiB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAoYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKHJlcSkpKSA9PT0gdHJ1ZSk7XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RvcmFnZS5zZW5kVmVyaWZpY2F0aW9uRW1haWwgPSB0cnVlO1xuICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHJhbmRvbVN0cmluZygyNSk7XG4gICAgaWYgKFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmNsdWRlcygnZW1haWxWZXJpZmllZCcpXG4gICAgKSB7XG4gICAgICB1c2VyLmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5RW1haWwodG9rZW4pIHtcbiAgICBpZiAoIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICAvLyBUcnlpbmcgdG8gdmVyaWZ5IGVtYWlsIHdoZW4gbm90IGVuYWJsZWRcbiAgICAgIC8vIFRPRE86IEJldHRlciBlcnJvciBoZXJlLlxuICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5ID0geyBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9O1xuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcblxuICAgIC8vIGlmIHRoZSBlbWFpbCB2ZXJpZnkgdG9rZW4gbmVlZHMgdG8gYmUgdmFsaWRhdGVkIHRoZW5cbiAgICAvLyBhZGQgYWRkaXRpb25hbCBxdWVyeSBwYXJhbXMgYW5kIGFkZGl0aW9uYWwgZmllbGRzIHRoYXQgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBxdWVyeS5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgICBxdWVyeS5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9O1xuXG4gICAgICB1cGRhdGVGaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCBtYWludGVuYW5jZUF1dGggPSBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKTtcbiAgICBjb25zdCByZXN0UXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBtYWludGVuYW5jZUF1dGgsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICByZXN0V2hlcmU6IHF1ZXJ5LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdFF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHJlc3VsdC5yZXN1bHRzWzBdLm9iamVjdElkO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgcmVzdC51cGRhdGUodGhpcy5jb25maWcsIG1haW50ZW5hbmNlQXV0aCwgJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gIH1cblxuICBhc3luYyBjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh0b2tlbikge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHtcbiAgICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHRva2VuLFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgKTtcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93ICdGYWlsZWQgdG8gcmVzZXQgcGFzc3dvcmQ6IHVzZXJuYW1lIC8gZW1haWwgLyB0b2tlbiBpcyBpbnZhbGlkJztcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgIGV4cGlyZXNEYXRlID0gbmV3IERhdGUoZXhwaXJlc0RhdGUuaXNvKTtcbiAgICAgIH1cbiAgICAgIGlmIChleHBpcmVzRGF0ZSA8IG5ldyBEYXRlKCkpIHtcbiAgICAgICAgdGhyb3cgJ1RoZSBwYXNzd29yZCByZXNldCBsaW5rIGhhcyBleHBpcmVkJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIGFzeW5jIGdldFVzZXJJZk5lZWRlZCh1c2VyKSB7XG4gICAgdmFyIHdoZXJlID0ge307XG4gICAgaWYgKHVzZXIudXNlcm5hbWUpIHtcbiAgICAgIHdoZXJlLnVzZXJuYW1lID0gdXNlci51c2VybmFtZTtcbiAgICB9XG4gICAgaWYgKHVzZXIuZW1haWwpIHtcbiAgICAgIHdoZXJlLmVtYWlsID0gdXNlci5lbWFpbDtcbiAgICB9XG4gICAgaWYgKHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbikge1xuICAgICAgd2hlcmUuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgICB9XG5cbiAgICB2YXIgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIHJlc3RXaGVyZTogd2hlcmUsXG4gICAgfSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LnJlc3VsdHNbMF07XG4gIH1cblxuICBhc3luYyBzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlciwgcmVxKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0b2tlbiA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW4pO1xuICAgIC8vIFdlIG1heSBuZWVkIHRvIGZldGNoIHRoZSB1c2VyIGluIGNhc2Ugb2YgdXBkYXRlIGVtYWlsOyBvbmx5IHVzZSB0aGUgYGZldGNoZWRVc2VyYFxuICAgIC8vIGZyb20gdGhpcyBwb2ludCBvbndhcmRzOyBkbyBub3QgdXNlIHRoZSBgdXNlcmAgYXMgaXQgbWF5IG5vdCBjb250YWluIGFsbCBmaWVsZHMuXG4gICAgY29uc3QgZmV0Y2hlZFVzZXIgPSBhd2FpdCB0aGlzLmdldFVzZXJJZk5lZWRlZCh1c2VyKTtcbiAgICBsZXQgc2hvdWxkU2VuZEVtYWlsID0gdGhpcy5jb25maWcuc2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbjtcbiAgICBpZiAodHlwZW9mIHNob3VsZFNlbmRFbWFpbCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIHRoaXMuY29uZmlnLnNlbmRVc2VyRW1haWxWZXJpZmljYXRpb24oe1xuICAgICAgICAgIHVzZXI6IFBhcnNlLk9iamVjdC5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZmV0Y2hlZFVzZXIgfSksXG4gICAgICAgICAgbWFzdGVyOiByZXEuYXV0aD8uaXNNYXN0ZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgc2hvdWxkU2VuZEVtYWlsID0gISFyZXNwb25zZTtcbiAgICB9XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnZlcmlmeUVtYWlsVVJMLCB0b2tlbiwgdGhpcy5jb25maWcpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBhcHBOYW1lOiB0aGlzLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgbGluazogbGluayxcbiAgICAgIHVzZXI6IGluZmxhdGUoJ19Vc2VyJywgZmV0Y2hlZFVzZXIpLFxuICAgIH07XG4gICAgaWYgKHRoaXMuYWRhcHRlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwpIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwob3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2VuZXJhdGVzIHRoZSBnaXZlbiB1c2VyJ3MgZW1haWwgdmVyaWZpY2F0aW9uIHRva2VuXG4gICAqXG4gICAqIEBwYXJhbSB1c2VyXG4gICAqIEByZXR1cm5zIHsqfVxuICAgKi9cbiAgYXN5bmMgcmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4odXNlciwgbWFzdGVyLCBpbnN0YWxsYXRpb25JZCwgaXApIHtcbiAgICBjb25zdCB7IF9lbWFpbF92ZXJpZnlfdG9rZW4gfSA9IHVzZXI7XG4gICAgbGV0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IH0gPSB1c2VyO1xuICAgIGlmIChfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgJiYgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuaXNvO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAmJlxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbiAmJlxuICAgICAgbmV3IERhdGUoKSA8IG5ldyBEYXRlKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdClcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIGNvbnN0IHNob3VsZFNlbmQgPSBhd2FpdCB0aGlzLnNldEVtYWlsVmVyaWZ5VG9rZW4odXNlciwge1xuICAgICAgb2JqZWN0OiBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbWFzdGVyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpcCxcbiAgICAgIHJlc2VuZFJlcXVlc3Q6IHRydWVcbiAgICB9KTtcbiAgICBpZiAoIXNob3VsZFNlbmQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sIHVzZXIpO1xuICB9XG5cbiAgYXN5bmMgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcm5hbWUsIHJlcSwgdG9rZW4pIHtcbiAgICBjb25zdCBhVXNlciA9IGF3YWl0IHRoaXMuZ2V0VXNlcklmTmVlZGVkKHsgdXNlcm5hbWUsIF9lbWFpbF92ZXJpZnlfdG9rZW46IHRva2VuIH0pO1xuICAgIGlmICghYVVzZXIgfHwgYVVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBnZW5lcmF0ZSA9IGF3YWl0IHRoaXMucmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4oYVVzZXIsIHJlcS5hdXRoPy5pc01hc3RlciwgcmVxLmF1dGg/Lmluc3RhbGxhdGlvbklkLCByZXEuaXApO1xuICAgIGlmIChnZW5lcmF0ZSkge1xuICAgICAgdGhpcy5zZW5kVmVyaWZpY2F0aW9uRW1haWwoYVVzZXIsIHJlcSk7XG4gICAgfVxuICB9XG5cbiAgc2V0UGFzc3dvcmRSZXNldFRva2VuKGVtYWlsKSB7XG4gICAgY29uc3QgdG9rZW4gPSB7IF9wZXJpc2hhYmxlX3Rva2VuOiByYW5kb21TdHJpbmcoMjUpIH07XG5cbiAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRva2VuLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICB0aGlzLmNvbmZpZy5nZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAnX1VzZXInLFxuICAgICAgeyAkb3I6IFt7IGVtYWlsIH0sIHsgdXNlcm5hbWU6IGVtYWlsLCBlbWFpbDogeyAkZXhpc3RzOiBmYWxzZSB9IH1dIH0sXG4gICAgICB0b2tlbixcbiAgICAgIHt9LFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cblxuICBhc3luYyBzZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKSB7XG4gICAgaWYgKCF0aGlzLmFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdUcnlpbmcgdG8gc2VuZCBhIHJlc2V0IHBhc3N3b3JkIGJ1dCBubyBhZGFwdGVyIGlzIHNldCc7XG4gICAgICAvLyAgVE9ETzogTm8gYWRhcHRlcj9cbiAgICB9XG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKFxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uXG4gICAgKSB7XG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogW1xuICAgICAgICAgICAgeyBlbWFpbCwgX3BlcmlzaGFibGVfdG9rZW46IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgICAgICB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSwgX3BlcmlzaGFibGVfdG9rZW46IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgeyBsaW1pdDogMSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKTtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgICAgaWYgKGV4cGlyZXNEYXRlICYmIGV4cGlyZXNEYXRlLl9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBleHBpcmVzRGF0ZSA9IG5ldyBEYXRlKGV4cGlyZXNEYXRlLmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV4cGlyZXNEYXRlID4gbmV3IERhdGUoKSkge1xuICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghdXNlciB8fCAhdXNlci5fcGVyaXNoYWJsZV90b2tlbikge1xuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuc2V0UGFzc3dvcmRSZXNldFRva2VuKGVtYWlsKTtcbiAgICB9XG5cbiAgICBpZiAodXNlciAmJiB1c2VyLnZhbHVlKSB7XG4gICAgICB1c2VyID0gdXNlci52YWx1ZVxuICAgIH1cbiAgICBcbiAgICBjb25zdCB0b2tlbiA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLl9wZXJpc2hhYmxlX3Rva2VuKTtcbiAgICBjb25zdCBsaW5rID0gYnVpbGRFbWFpbExpbmsodGhpcy5jb25maWcucmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwsIHRva2VuLCB0aGlzLmNvbmZpZyk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIGFwcE5hbWU6IHRoaXMuY29uZmlnLmFwcE5hbWUsXG4gICAgICBsaW5rOiBsaW5rLFxuICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCB1c2VyKSxcbiAgICB9O1xuXG4gICAgaWYgKHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbChvcHRpb25zKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1c2VyKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVBhc3N3b3JkKHRva2VuLCBwYXNzd29yZCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByYXdVc2VyID0gYXdhaXQgdGhpcy5jaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh0b2tlbik7XG4gICAgICBsZXQgdXNlcjtcbiAgICAgIHRyeSB7XG4gICAgICAgIHVzZXIgPSBhd2FpdCB1cGRhdGVVc2VyUGFzc3dvcmQocmF3VXNlciwgcGFzc3dvcmQsIHRoaXMuY29uZmlnKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgdGhyb3cgJ0ZhaWxlZCB0byByZXNldCBwYXNzd29yZDogdXNlcm5hbWUgLyBlbWFpbCAvIHRva2VuIGlzIGludmFsaWQnO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCB0aGlzLmNvbmZpZyk7XG4gICAgICByZXR1cm4gYXdhaXQgYWNjb3VudExvY2tvdXRQb2xpY3kudW5sb2NrQWNjb3VudCgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAvLyBpbiBjYXNlIG9mIFBhcnNlLkVycm9yLCBmYWlsIHdpdGggdGhlIGVycm9yIG1lc3NhZ2Ugb25seVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IubWVzc2FnZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCh7IGxpbmssIHVzZXIsIGFwcE5hbWUgfSkge1xuICAgIGNvbnN0IHRleHQgPVxuICAgICAgJ0hpLFxcblxcbicgK1xuICAgICAgJ1lvdSBhcmUgYmVpbmcgYXNrZWQgdG8gY29uZmlybSB0aGUgZS1tYWlsIGFkZHJlc3MgJyArXG4gICAgICB1c2VyLmdldCgnZW1haWwnKSArXG4gICAgICAnIHdpdGggJyArXG4gICAgICBhcHBOYW1lICtcbiAgICAgICdcXG5cXG4nICtcbiAgICAgICcnICtcbiAgICAgICdDbGljayBoZXJlIHRvIGNvbmZpcm0gaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQbGVhc2UgdmVyaWZ5IHlvdXIgZS1tYWlsIGZvciAnICsgYXBwTmFtZTtcbiAgICByZXR1cm4geyB0ZXh0LCB0bywgc3ViamVjdCB9O1xuICB9XG5cbiAgZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbCh7IGxpbmssIHVzZXIsIGFwcE5hbWUgfSkge1xuICAgIGNvbnN0IHRleHQgPVxuICAgICAgJ0hpLFxcblxcbicgK1xuICAgICAgJ1lvdSByZXF1ZXN0ZWQgdG8gcmVzZXQgeW91ciBwYXNzd29yZCBmb3IgJyArXG4gICAgICBhcHBOYW1lICtcbiAgICAgICh1c2VyLmdldCgndXNlcm5hbWUnKSA/IFwiICh5b3VyIHVzZXJuYW1lIGlzICdcIiArIHVzZXIuZ2V0KCd1c2VybmFtZScpICsgXCInKVwiIDogJycpICtcbiAgICAgICcuXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byByZXNldCBpdDpcXG4nICtcbiAgICAgIGxpbms7XG4gICAgY29uc3QgdG8gPSB1c2VyLmdldCgnZW1haWwnKSB8fCB1c2VyLmdldCgndXNlcm5hbWUnKTtcbiAgICBjb25zdCBzdWJqZWN0ID0gJ1Bhc3N3b3JkIFJlc2V0IGZvciAnICsgYXBwTmFtZTtcbiAgICByZXR1cm4geyB0ZXh0LCB0bywgc3ViamVjdCB9O1xuICB9XG59XG5cbi8vIE1hcmsgdGhpcyBwcml2YXRlXG5mdW5jdGlvbiB1cGRhdGVVc2VyUGFzc3dvcmQodXNlciwgcGFzc3dvcmQsIGNvbmZpZykge1xuICByZXR1cm4gcmVzdFxuICAgIC51cGRhdGUoXG4gICAgICBjb25maWcsXG4gICAgICBBdXRoLm1hc3Rlcihjb25maWcpLFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQsIF9wZXJpc2hhYmxlX3Rva2VuOiB1c2VyLl9wZXJpc2hhYmxlX3Rva2VuIH0sXG4gICAgICB7XG4gICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgIH1cbiAgICApXG4gICAgLnRoZW4oKCkgPT4gdXNlcik7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRW1haWxMaW5rKGRlc3RpbmF0aW9uLCB0b2tlbiwgY29uZmlnKSB7XG4gIHRva2VuID0gYHRva2VuPSR7dG9rZW59YDtcbiAgaWYgKGNvbmZpZy5wYXJzZUZyYW1lVVJMKSB7XG4gICAgY29uc3QgZGVzdGluYXRpb25XaXRob3V0SG9zdCA9IGRlc3RpbmF0aW9uLnJlcGxhY2UoY29uZmlnLnB1YmxpY1NlcnZlclVSTCwgJycpO1xuXG4gICAgcmV0dXJuIGAke2NvbmZpZy5wYXJzZUZyYW1lVVJMfT9saW5rPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGRlc3RpbmF0aW9uV2l0aG91dEhvc3QpfSYke3Rva2VufWA7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGAke2Rlc3RpbmF0aW9ufT8ke3Rva2VufWA7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlckNvbnRyb2xsZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLFlBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFNBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLG9CQUFBLEdBQUFDLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSSxZQUFBLEdBQUFELHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSyxLQUFBLEdBQUFGLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFILHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBTyxlQUFBLEdBQUFKLHNCQUFBLENB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