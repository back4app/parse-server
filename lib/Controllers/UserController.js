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
var _logger = _interopRequireDefault(require("../logger"));
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

  // Never rejects; errors are logged
  async sendVerificationEmail(user, req) {
    try {
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
      sendEmail('verification', () => this.adapter.sendVerificationEmail ? this.adapter.sendVerificationEmail(options) : this.adapter.sendMail(this.defaultVerificationEmail(options)));
    } catch (error) {
      logSendEmailError('verification', error);
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
    sendEmail('password reset', () => this.adapter.sendPasswordResetEmail ? this.adapter.sendPasswordResetEmail(options) : this.adapter.sendMail(this.defaultResetPasswordEmail(options)));
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

// Never rejects; errors are logged
async function sendEmail(name, send) {
  try {
    await send();
  } catch (error) {
    logSendEmailError(name, error);
  }
}

// Omits error properties, which may contain credentials or email content
function logSendEmailError(name, error) {
  _logger.default.error(`Failed to send ${name} email`, {
    error: error?.stack || error?.message || String(error)
  });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX3RyaWdnZXJzIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX01haWxBZGFwdGVyIiwiX3Jlc3QiLCJfbm9kZSIsIl9BY2NvdW50TG9ja291dCIsIl9Db25maWciLCJfbG9nZ2VyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUmVzdFF1ZXJ5IiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsInJlcSIsInN0b3JhZ2UiLCJzaG91bGRTZW5kRW1haWwiLCJQcm9taXNlIiwicmVzb2x2ZSIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJyYW5kb21TdHJpbmciLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiaW5jbHVkZXMiLCJlbWFpbFZlcmlmaWVkIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJQYXJzZSIsIl9lbmNvZGUiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJ2ZXJpZnlFbWFpbCIsInRva2VuIiwidW5kZWZpbmVkIiwicXVlcnkiLCJ1cGRhdGVGaWVsZHMiLCJfX29wIiwiJGd0IiwiRGF0ZSIsIm1haW50ZW5hbmNlQXV0aCIsIm1haW50ZW5hbmNlIiwicmVzdFF1ZXJ5IiwibWV0aG9kIiwiTWV0aG9kIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3VsdCIsImV4ZWN1dGUiLCJyZXN1bHRzIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJyZXN0IiwidXBkYXRlIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJkYXRhYmFzZSIsImZpbmQiLCJfcGVyaXNoYWJsZV90b2tlbiIsImxpbWl0IiwicGFzc3dvcmRQb2xpY3kiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImV4cGlyZXNEYXRlIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsIl9fdHlwZSIsImlzbyIsImdldFVzZXJJZk5lZWRlZCIsIndoZXJlIiwidXNlcm5hbWUiLCJlbWFpbCIsInJ1bkJlZm9yZUZpbmQiLCJtYXN0ZXIiLCJlbmNvZGVVUklDb21wb25lbnQiLCJmZXRjaGVkVXNlciIsInNlbmRVc2VyRW1haWxWZXJpZmljYXRpb24iLCJyZXNwb25zZSIsIk9iamVjdCIsImZyb21KU09OIiwiaXNNYXN0ZXIiLCJsaW5rIiwiYnVpbGRFbWFpbExpbmsiLCJ2ZXJpZnlFbWFpbFVSTCIsImFwcE5hbWUiLCJpbmZsYXRlIiwic2VuZEVtYWlsIiwic2VuZE1haWwiLCJkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwiLCJlcnJvciIsImxvZ1NlbmRFbWFpbEVycm9yIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJpbnN0YWxsYXRpb25JZCIsImlwIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsInNob3VsZFNlbmQiLCJvYmplY3QiLCJVc2VyIiwiYXNzaWduIiwicmVzZW5kUmVxdWVzdCIsInJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiYVVzZXIiLCJnZW5lcmF0ZSIsInNldFBhc3N3b3JkUmVzZXRUb2tlbiIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiJG9yIiwiJGV4aXN0cyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwidmFsdWUiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsImRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwiLCJ1cGRhdGVQYXNzd29yZCIsInBhc3N3b3JkIiwicmF3VXNlciIsInVwZGF0ZVVzZXJQYXNzd29yZCIsImNvZGUiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwidW5sb2NrQWNjb3VudCIsIm1lc3NhZ2UiLCJyZWplY3QiLCJ0ZXh0IiwidG8iLCJzdWJqZWN0IiwiZXhwb3J0cyIsInRoZW4iLCJuYW1lIiwic2VuZCIsImxvZ2dlciIsInN0YWNrIiwiU3RyaW5nIiwiZGVzdGluYXRpb24iLCJwYXJzZUZyYW1lVVJMIiwiZGVzdGluYXRpb25XaXRob3V0SG9zdCIsInJlcGxhY2UiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9Vc2VyQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByYW5kb21TdHJpbmcgfSBmcm9tICcuLi9jcnlwdG9VdGlscyc7XG5pbXBvcnQgeyBpbmZsYXRlIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IEFkYXB0YWJsZUNvbnRyb2xsZXIgZnJvbSAnLi9BZGFwdGFibGVDb250cm9sbGVyJztcbmltcG9ydCBNYWlsQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9FbWFpbC9NYWlsQWRhcHRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5cbnZhciBSZXN0UXVlcnkgPSByZXF1aXJlKCcuLi9SZXN0UXVlcnknKTtcbnZhciBBdXRoID0gcmVxdWlyZSgnLi4vQXV0aCcpO1xuXG5leHBvcnQgY2xhc3MgVXNlckNvbnRyb2xsZXIgZXh0ZW5kcyBBZGFwdGFibGVDb250cm9sbGVyIHtcbiAgY29uc3RydWN0b3IoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMgPSB7fSkge1xuICAgIHN1cGVyKGFkYXB0ZXIsIGFwcElkLCBvcHRpb25zKTtcbiAgfVxuXG4gIGdldCBjb25maWcoKSB7XG4gICAgcmV0dXJuIENvbmZpZy5nZXQodGhpcy5hcHBJZCk7XG4gIH1cblxuICB2YWxpZGF0ZUFkYXB0ZXIoYWRhcHRlcikge1xuICAgIC8vIEFsbG93IG5vIGFkYXB0ZXJcbiAgICBpZiAoIWFkYXB0ZXIgJiYgIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHN1cGVyLnZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKTtcbiAgfVxuXG4gIGV4cGVjdGVkQWRhcHRlclR5cGUoKSB7XG4gICAgcmV0dXJuIE1haWxBZGFwdGVyO1xuICB9XG5cbiAgZ2V0IHNob3VsZFZlcmlmeUVtYWlscygpIHtcbiAgICByZXR1cm4gKHRoaXMuY29uZmlnIHx8IHRoaXMub3B0aW9ucykudmVyaWZ5VXNlckVtYWlscztcbiAgfVxuXG4gIGFzeW5jIHNldEVtYWlsVmVyaWZ5VG9rZW4odXNlciwgcmVxLCBzdG9yYWdlID0ge30pIHtcbiAgICBjb25zdCBzaG91bGRTZW5kRW1haWwgPVxuICAgICAgdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMgPT09IHRydWUgfHxcbiAgICAgICh0eXBlb2YgdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgKGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNob3VsZFZlcmlmeUVtYWlscyhyZXEpKSkgPT09IHRydWUpO1xuICAgIGlmICghc2hvdWxkU2VuZEVtYWlsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHN0b3JhZ2Uuc2VuZFZlcmlmaWNhdGlvbkVtYWlsID0gdHJ1ZTtcbiAgICB1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSByYW5kb21TdHJpbmcoMjUpO1xuICAgIGlmIChcbiAgICAgICFzdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHxcbiAgICAgICFzdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5jbHVkZXMoJ2VtYWlsVmVyaWZpZWQnKVxuICAgICkge1xuICAgICAgdXNlci5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgIHRoaXMuY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGFzeW5jIHZlcmlmeUVtYWlsKHRva2VuKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgLy8gVHJ5aW5nIHRvIHZlcmlmeSBlbWFpbCB3aGVuIG5vdCBlbmFibGVkXG4gICAgICAvLyBUT0RPOiBCZXR0ZXIgZXJyb3IgaGVyZS5cbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IHsgX2VtYWlsX3ZlcmlmeV90b2tlbjogdG9rZW4gfTtcbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBlbWFpbFZlcmlmaWVkOiB0cnVlLFxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG5cbiAgICAvLyBpZiB0aGUgZW1haWwgdmVyaWZ5IHRva2VuIG5lZWRzIHRvIGJlIHZhbGlkYXRlZCB0aGVuXG4gICAgLy8gYWRkIGFkZGl0aW9uYWwgcXVlcnkgcGFyYW1zIGFuZCBhZGRpdGlvbmFsIGZpZWxkcyB0aGF0IG5lZWQgdG8gYmUgdXBkYXRlZFxuICAgIGlmICh0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcXVlcnkuZW1haWxWZXJpZmllZCA9IGZhbHNlO1xuICAgICAgcXVlcnkuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyAkZ3Q6IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkgfTtcblxuICAgICAgdXBkYXRlRmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICB9XG4gICAgY29uc3QgbWFpbnRlbmFuY2VBdXRoID0gQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZyk7XG4gICAgY29uc3QgcmVzdFF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgYXV0aDogbWFpbnRlbmFuY2VBdXRoLFxuICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgcmVzdFdoZXJlOiBxdWVyeSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3RRdWVyeS5leGVjdXRlKCk7XG4gICAgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSByZXN1bHQucmVzdWx0c1swXS5vYmplY3RJZDtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IHJlc3QudXBkYXRlKHRoaXMuY29uZmlnLCBtYWludGVuYW5jZUF1dGgsICdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICB9XG5cbiAgYXN5bmMgY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodG9rZW4pIHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICdfVXNlcicsXG4gICAgICB7XG4gICAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB0b2tlbixcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICk7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyAnRmFpbGVkIHRvIHJlc2V0IHBhc3N3b3JkOiB1c2VybmFtZSAvIGVtYWlsIC8gdG9rZW4gaXMgaW52YWxpZCc7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICBpZiAoZXhwaXJlc0RhdGUgJiYgZXhwaXJlc0RhdGUuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICBleHBpcmVzRGF0ZSA9IG5ldyBEYXRlKGV4cGlyZXNEYXRlLmlzbyk7XG4gICAgICB9XG4gICAgICBpZiAoZXhwaXJlc0RhdGUgPCBuZXcgRGF0ZSgpKSB7XG4gICAgICAgIHRocm93ICdUaGUgcGFzc3dvcmQgcmVzZXQgbGluayBoYXMgZXhwaXJlZCc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBhc3luYyBnZXRVc2VySWZOZWVkZWQodXNlcikge1xuICAgIHZhciB3aGVyZSA9IHt9O1xuICAgIGlmICh1c2VyLnVzZXJuYW1lKSB7XG4gICAgICB3aGVyZS51c2VybmFtZSA9IHVzZXIudXNlcm5hbWU7XG4gICAgfVxuICAgIGlmICh1c2VyLmVtYWlsKSB7XG4gICAgICB3aGVyZS5lbWFpbCA9IHVzZXIuZW1haWw7XG4gICAgfVxuICAgIGlmICh1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW4pIHtcbiAgICAgIHdoZXJlLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW47XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICByZXN0V2hlcmU6IHdoZXJlLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5yZXN1bHRzWzBdO1xuICB9XG5cbiAgLy8gTmV2ZXIgcmVqZWN0czsgZXJyb3JzIGFyZSBsb2dnZWRcbiAgYXN5bmMgc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIsIHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbik7XG4gICAgICAvLyBXZSBtYXkgbmVlZCB0byBmZXRjaCB0aGUgdXNlciBpbiBjYXNlIG9mIHVwZGF0ZSBlbWFpbDsgb25seSB1c2UgdGhlIGBmZXRjaGVkVXNlcmBcbiAgICAgIC8vIGZyb20gdGhpcyBwb2ludCBvbndhcmRzOyBkbyBub3QgdXNlIHRoZSBgdXNlcmAgYXMgaXQgbWF5IG5vdCBjb250YWluIGFsbCBmaWVsZHMuXG4gICAgICBjb25zdCBmZXRjaGVkVXNlciA9IGF3YWl0IHRoaXMuZ2V0VXNlcklmTmVlZGVkKHVzZXIpO1xuICAgICAgbGV0IHNob3VsZFNlbmRFbWFpbCA9IHRoaXMuY29uZmlnLnNlbmRVc2VyRW1haWxWZXJpZmljYXRpb247XG4gICAgICBpZiAodHlwZW9mIHNob3VsZFNlbmRFbWFpbCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgICB0aGlzLmNvbmZpZy5zZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uKHtcbiAgICAgICAgICAgIHVzZXI6IFBhcnNlLk9iamVjdC5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZmV0Y2hlZFVzZXIgfSksXG4gICAgICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoPy5pc01hc3RlcixcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgICBzaG91bGRTZW5kRW1haWwgPSAhIXJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnZlcmlmeUVtYWlsVVJMLCB0b2tlbiwgdGhpcy5jb25maWcpO1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgbGluazogbGluayxcbiAgICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCBmZXRjaGVkVXNlciksXG4gICAgICB9O1xuICAgICAgc2VuZEVtYWlsKCd2ZXJpZmljYXRpb24nLCAoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsXG4gICAgICAgICAgPyB0aGlzLmFkYXB0ZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpXG4gICAgICAgICAgOiB0aGlzLmFkYXB0ZXIuc2VuZE1haWwodGhpcy5kZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwob3B0aW9ucykpXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dTZW5kRW1haWxFcnJvcigndmVyaWZpY2F0aW9uJywgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdlbmVyYXRlcyB0aGUgZ2l2ZW4gdXNlcidzIGVtYWlsIHZlcmlmaWNhdGlvbiB0b2tlblxuICAgKlxuICAgKiBAcGFyYW0gdXNlclxuICAgKiBAcmV0dXJucyB7Kn1cbiAgICovXG4gIGFzeW5jIHJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIsIG1hc3RlciwgaW5zdGFsbGF0aW9uSWQsIGlwKSB7XG4gICAgY29uc3QgeyBfZW1haWxfdmVyaWZ5X3Rva2VuIH0gPSB1c2VyO1xuICAgIGxldCB7IF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCB9ID0gdXNlcjtcbiAgICBpZiAoX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ICYmIF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0LmlzbztcbiAgICB9XG4gICAgaWYgKFxuICAgICAgdGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJlxuICAgICAgdGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gJiZcbiAgICAgIF9lbWFpbF92ZXJpZnlfdG9rZW4gJiZcbiAgICAgIG5ldyBEYXRlKCkgPCBuZXcgRGF0ZShfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICBjb25zdCBzaG91bGRTZW5kID0gYXdhaXQgdGhpcy5zZXRFbWFpbFZlcmlmeVRva2VuKHVzZXIsIHtcbiAgICAgIG9iamVjdDogUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG1hc3RlcixcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgaXAsXG4gICAgICByZXNlbmRSZXF1ZXN0OiB0cnVlXG4gICAgfSk7XG4gICAgaWYgKCFzaG91bGRTZW5kKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoJ19Vc2VyJywgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LCB1c2VyKTtcbiAgfVxuXG4gIGFzeW5jIHJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXJuYW1lLCByZXEsIHRva2VuKSB7XG4gICAgY29uc3QgYVVzZXIgPSBhd2FpdCB0aGlzLmdldFVzZXJJZk5lZWRlZCh7IHVzZXJuYW1lLCBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9KTtcbiAgICBpZiAoIWFVc2VyIHx8IGFVc2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3QgZ2VuZXJhdGUgPSBhd2FpdCB0aGlzLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKGFVc2VyLCByZXEuYXV0aD8uaXNNYXN0ZXIsIHJlcS5hdXRoPy5pbnN0YWxsYXRpb25JZCwgcmVxLmlwKTtcbiAgICBpZiAoZ2VuZXJhdGUpIHtcbiAgICAgIHRoaXMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKGFVc2VyLCByZXEpO1xuICAgIH1cbiAgfVxuXG4gIHNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCkge1xuICAgIGNvbnN0IHRva2VuID0geyBfcGVyaXNoYWJsZV90b2tlbjogcmFuZG9tU3RyaW5nKDI1KSB9O1xuXG4gICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0b2tlbi5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgJG9yOiBbeyBlbWFpbCB9LCB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSB9XSB9LFxuICAgICAgdG9rZW4sXG4gICAgICB7fSxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkge1xuICAgIGlmICghdGhpcy5hZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnVHJ5aW5nIHRvIHNlbmQgYSByZXNldCBwYXNzd29yZCBidXQgbm8gYWRhcHRlciBpcyBzZXQnO1xuICAgICAgLy8gIFRPRE86IE5vIGFkYXB0ZXI/XG4gICAgfVxuICAgIGxldCB1c2VyO1xuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvblxuICAgICkge1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IFtcbiAgICAgICAgICAgIHsgZW1haWwsIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgICAgeyB1c2VybmFtZTogZW1haWwsIGVtYWlsOiB7ICRleGlzdHM6IGZhbHNlIH0sIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSA+IG5ldyBEYXRlKCkpIHtcbiAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXVzZXIgfHwgIXVzZXIuX3BlcmlzaGFibGVfdG9rZW4pIHtcbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLnNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCk7XG4gICAgfVxuXG4gICAgaWYgKHVzZXIgJiYgdXNlci52YWx1ZSkge1xuICAgICAgdXNlciA9IHVzZXIudmFsdWVcbiAgICB9XG4gICAgXG4gICAgY29uc3QgdG9rZW4gPSBlbmNvZGVVUklDb21wb25lbnQodXNlci5fcGVyaXNoYWJsZV90b2tlbik7XG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnJlcXVlc3RSZXNldFBhc3N3b3JkVVJMLCB0b2tlbiwgdGhpcy5jb25maWcpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBhcHBOYW1lOiB0aGlzLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgbGluazogbGluayxcbiAgICAgIHVzZXI6IGluZmxhdGUoJ19Vc2VyJywgdXNlciksXG4gICAgfTtcblxuICAgIHNlbmRFbWFpbCgncGFzc3dvcmQgcmVzZXQnLCAoKSA9PlxuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWxcbiAgICAgICAgPyB0aGlzLmFkYXB0ZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChvcHRpb25zKVxuICAgICAgICA6IHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwob3B0aW9ucykpXG4gICAgKTtcblxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodXNlcik7XG4gIH1cblxuICBhc3luYyB1cGRhdGVQYXNzd29yZCh0b2tlbiwgcGFzc3dvcmQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmF3VXNlciA9IGF3YWl0IHRoaXMuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodG9rZW4pO1xuICAgICAgbGV0IHVzZXI7XG4gICAgICB0cnkge1xuICAgICAgICB1c2VyID0gYXdhaXQgdXBkYXRlVXNlclBhc3N3b3JkKHJhd1VzZXIsIHBhc3N3b3JkLCB0aGlzLmNvbmZpZyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHRocm93ICdGYWlsZWQgdG8gcmVzZXQgcGFzc3dvcmQ6IHVzZXJuYW1lIC8gZW1haWwgLyB0b2tlbiBpcyBpbnZhbGlkJztcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgdGhpcy5jb25maWcpO1xuICAgICAgcmV0dXJuIGF3YWl0IGFjY291bnRMb2Nrb3V0UG9saWN5LnVubG9ja0FjY291bnQoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yICYmIGVycm9yLm1lc3NhZ2UpIHtcbiAgICAgICAgLy8gaW4gY2FzZSBvZiBQYXJzZS5FcnJvciwgZmFpbCB3aXRoIHRoZSBlcnJvciBtZXNzYWdlIG9ubHlcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yLm1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgYXJlIGJlaW5nIGFza2VkIHRvIGNvbmZpcm0gdGhlIGUtbWFpbCBhZGRyZXNzICcgK1xuICAgICAgdXNlci5nZXQoJ2VtYWlsJykgK1xuICAgICAgJyB3aXRoICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAnXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byBjb25maXJtIGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGxlYXNlIHZlcmlmeSB5b3VyIGUtbWFpbCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxuXG4gIGRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgcmVxdWVzdGVkIHRvIHJlc2V0IHlvdXIgcGFzc3dvcmQgZm9yICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAodXNlci5nZXQoJ3VzZXJuYW1lJykgPyBcIiAoeW91ciB1c2VybmFtZSBpcyAnXCIgKyB1c2VyLmdldCgndXNlcm5hbWUnKSArIFwiJylcIiA6ICcnKSArXG4gICAgICAnLlxcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gcmVzZXQgaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJykgfHwgdXNlci5nZXQoJ3VzZXJuYW1lJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQYXNzd29yZCBSZXNldCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxufVxuXG4vLyBNYXJrIHRoaXMgcHJpdmF0ZVxuZnVuY3Rpb24gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCBjb25maWcpIHtcbiAgcmV0dXJuIHJlc3RcbiAgICAudXBkYXRlKFxuICAgICAgY29uZmlnLFxuICAgICAgQXV0aC5tYXN0ZXIoY29uZmlnKSxcbiAgICAgICdfVXNlcicsXG4gICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkLCBfcGVyaXNoYWJsZV90b2tlbjogdXNlci5fcGVyaXNoYWJsZV90b2tlbiB9LFxuICAgICAge1xuICAgICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgICB9XG4gICAgKVxuICAgIC50aGVuKCgpID0+IHVzZXIpO1xufVxuXG4vLyBOZXZlciByZWplY3RzOyBlcnJvcnMgYXJlIGxvZ2dlZFxuYXN5bmMgZnVuY3Rpb24gc2VuZEVtYWlsKG5hbWUsIHNlbmQpIHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBzZW5kKCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nU2VuZEVtYWlsRXJyb3IobmFtZSwgZXJyb3IpO1xuICB9XG59XG5cbi8vIE9taXRzIGVycm9yIHByb3BlcnRpZXMsIHdoaWNoIG1heSBjb250YWluIGNyZWRlbnRpYWxzIG9yIGVtYWlsIGNvbnRlbnRcbmZ1bmN0aW9uIGxvZ1NlbmRFbWFpbEVycm9yKG5hbWUsIGVycm9yKSB7XG4gIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHNlbmQgJHtuYW1lfSBlbWFpbGAsIHtcbiAgICBlcnJvcjogZXJyb3I/LnN0YWNrIHx8IGVycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvciksXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidWlsZEVtYWlsTGluayhkZXN0aW5hdGlvbiwgdG9rZW4sIGNvbmZpZykge1xuICB0b2tlbiA9IGB0b2tlbj0ke3Rva2VufWA7XG4gIGlmIChjb25maWcucGFyc2VGcmFtZVVSTCkge1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uV2l0aG91dEhvc3QgPSBkZXN0aW5hdGlvbi5yZXBsYWNlKGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsICcnKTtcblxuICAgIHJldHVybiBgJHtjb25maWcucGFyc2VGcmFtZVVSTH0/bGluaz0ke2VuY29kZVVSSUNvbXBvbmVudChkZXN0aW5hdGlvbldpdGhvdXRIb3N0KX0mJHt0b2tlbn1gO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBgJHtkZXN0aW5hdGlvbn0/JHt0b2tlbn1gO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJDb250cm9sbGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxZQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxvQkFBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksWUFBQSxHQUFBRCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUssS0FBQSxHQUFBRixzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQU0sS0FBQSxHQUFBSCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQU8sZUFBQSxHQUFBSixzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQVEsT0FBQSxHQUFBTCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQVMsT0FBQSxHQUFBTixzQkFBQSxDQUFBSCxPQUFBO0FBQStCLFNBQUFHLHVCQUFBTyxDQUFBLFdBQUFBLENBQUEsSUFBQUEs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