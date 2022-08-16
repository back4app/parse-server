"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;

var _cache = _interopRequireDefault(require("./cache"));

var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));

var _net = _interopRequireDefault(require("net"));

var _Definitions = require("./Options/Definitions");

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.
function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }

  if (str.endsWith('/')) {
    str = str.substr(0, str.length - 1);
  }

  return str;
}

class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);

    if (!cacheInfo) {
      return;
    }

    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, config);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    return config;
  }

  static put(serverConfiguration) {
    Config.validate(serverConfiguration);

    _cache.default.put(serverConfiguration.appId, serverConfiguration);

    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }

  static validate({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    maxLimit,
    emailVerifyTokenValidityDuration,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    emailVerifyTokenReuseIfValid,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }

    const emailAdapter = userController.adapter;

    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }

    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);

    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }

    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }

    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateMasterKeyIps(masterKeyIps);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
  }

  static validateRequestKeywordDenylist(requestKeywordDenylist) {
    if (requestKeywordDenylist === undefined) {
      requestKeywordDenylist = requestKeywordDenylist.default;
    } else if (!Array.isArray(requestKeywordDenylist)) {
      throw 'Parse Server option requestKeywordDenylist must be an array.';
    }
  }

  static validateEnforcePrivateUsers(enforcePrivateUsers) {
    if (typeof enforcePrivateUsers !== 'boolean') {
      throw 'Parse Server option enforcePrivateUsers must be a boolean.';
    }
  }

  static validateSecurityOptions(security) {
    if (Object.prototype.toString.call(security) !== '[object Object]') {
      throw 'Parse Server option security must be an object.';
    }

    if (security.enableCheck === undefined) {
      security.enableCheck = _Definitions.SecurityOptions.enableCheck.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheck)) {
      throw 'Parse Server option security.enableCheck must be a boolean.';
    }

    if (security.enableCheckLog === undefined) {
      security.enableCheckLog = _Definitions.SecurityOptions.enableCheckLog.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheckLog)) {
      throw 'Parse Server option security.enableCheckLog must be a boolean.';
    }
  }

  static validateSchemaOptions(schema) {
    if (!schema) return;

    if (Object.prototype.toString.call(schema) !== '[object Object]') {
      throw 'Parse Server option schema must be an object.';
    }

    if (schema.definitions === undefined) {
      schema.definitions = _Definitions.SchemaOptions.definitions.default;
    } else if (!Array.isArray(schema.definitions)) {
      throw 'Parse Server option schema.definitions must be an array.';
    }

    if (schema.strict === undefined) {
      schema.strict = _Definitions.SchemaOptions.strict.default;
    } else if (!(0, _lodash.isBoolean)(schema.strict)) {
      throw 'Parse Server option schema.strict must be a boolean.';
    }

    if (schema.deleteExtraFields === undefined) {
      schema.deleteExtraFields = _Definitions.SchemaOptions.deleteExtraFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.deleteExtraFields)) {
      throw 'Parse Server option schema.deleteExtraFields must be a boolean.';
    }

    if (schema.recreateModifiedFields === undefined) {
      schema.recreateModifiedFields = _Definitions.SchemaOptions.recreateModifiedFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.recreateModifiedFields)) {
      throw 'Parse Server option schema.recreateModifiedFields must be a boolean.';
    }

    if (schema.lockSchemas === undefined) {
      schema.lockSchemas = _Definitions.SchemaOptions.lockSchemas.default;
    } else if (!(0, _lodash.isBoolean)(schema.lockSchemas)) {
      throw 'Parse Server option schema.lockSchemas must be a boolean.';
    }

    if (schema.beforeMigration === undefined) {
      schema.beforeMigration = null;
    } else if (schema.beforeMigration !== null && typeof schema.beforeMigration !== 'function') {
      throw 'Parse Server option schema.beforeMigration must be a function.';
    }

    if (schema.afterMigration === undefined) {
      schema.afterMigration = null;
    } else if (schema.afterMigration !== null && typeof schema.afterMigration !== 'function') {
      throw 'Parse Server option schema.afterMigration must be a function.';
    }
  }

  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }

    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }

    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }

    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }

    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }

    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }

    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }

    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }

    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }

    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }

    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }

  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }

    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }

    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }

  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }

      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }

      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }

  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }

      if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }

      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }

      if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }

      if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }

      if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }

      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }

      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
    }
  } // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern


  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }

  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }

    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }

    if (typeof publicServerURL !== 'string') {
      throw 'A public server url is required for e-mail verification and password resets.';
    }

    if (emailVerifyTokenValidityDuration) {
      if (isNaN(emailVerifyTokenValidityDuration)) {
        throw 'Email verify token validity duration must be a valid number.';
      } else if (emailVerifyTokenValidityDuration <= 0) {
        throw 'Email verify token validity duration must be a value greater than 0.';
      }
    }

    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }

    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }

  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }

      throw e;
    }

    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }

    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }

    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
  }

  static validateMasterKeyIps(masterKeyIps) {
    for (const ip of masterKeyIps) {
      if (!_net.default.isIP(ip)) {
        throw `Invalid ip in masterKeyIps: ${ip}`;
      }
    }
  }

  get mount() {
    var mount = this._mount;

    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }

    return mount;
  }

  set mount(newValue) {
    this._mount = newValue;
  }

  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }

  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }

  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }

  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }

  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }

    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }

  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }

  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }

  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }

  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }

  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }

  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }

  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }

  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }

  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }

  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }

  get verifyEmailURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  } // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.


  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }

}

exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHIiLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZSIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwidmVyaWZ5VXNlckVtYWlscyIsInVzZXJDb250cm9sbGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsIm1heExpbWl0IiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJhY2NvdW50TG9ja291dCIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleSIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImZpbGVVcGxvYWQiLCJwYWdlcyIsInNlY3VyaXR5IiwiZW5mb3JjZVByaXZhdGVVc2VycyIsInNjaGVtYSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJFcnJvciIsImVtYWlsQWRhcHRlciIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwidmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeSIsInZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJ2YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zIiwic3RhcnRzV2l0aCIsInZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU1hc3RlcktleUlwcyIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInVuZGVmaW5lZCIsImRlZmF1bHQiLCJBcnJheSIsImlzQXJyYXkiLCJwcm90b3R5cGUiLCJ0b1N0cmluZyIsImNhbGwiLCJlbmFibGVDaGVjayIsIlNlY3VyaXR5T3B0aW9ucyIsImlzQm9vbGVhbiIsImVuYWJsZUNoZWNrTG9nIiwiZGVmaW5pdGlvbnMiLCJTY2hlbWFPcHRpb25zIiwic3RyaWN0IiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwibG9ja1NjaGVtYXMiLCJiZWZvcmVNaWdyYXRpb24iLCJhZnRlck1pZ3JhdGlvbiIsImVuYWJsZVJvdXRlciIsIlBhZ2VzT3B0aW9ucyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiaXNTdHJpbmciLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsInBsYWNlaG9sZGVycyIsImZvcmNlUmVkaXJlY3QiLCJwYWdlc1BhdGgiLCJwYWdlc0VuZHBvaW50IiwiY3VzdG9tVXJscyIsImN1c3RvbVJvdXRlcyIsInR0bCIsIklkZW1wb3RlbmN5T3B0aW9ucyIsImlzTmFOIiwicGF0aHMiLCJkdXJhdGlvbiIsIk51bWJlciIsImlzSW50ZWdlciIsInRocmVzaG9sZCIsInVubG9ja09uUGFzc3dvcmRSZXNldCIsIkFjY291bnRMb2Nrb3V0T3B0aW9ucyIsIm1heFBhc3N3b3JkQWdlIiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJ2YWxpZGF0b3JQYXR0ZXJuIiwiUmVnRXhwIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicGF0dGVyblZhbGlkYXRvciIsInZhbHVlIiwidGVzdCIsImUiLCJSZWZlcmVuY2VFcnJvciIsImVuYWJsZUZvckFub255bW91c1VzZXIiLCJGaWxlVXBsb2FkT3B0aW9ucyIsImVuYWJsZUZvclB1YmxpYyIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiaXAiLCJuZXQiLCJpc0lQIiwiX21vdW50IiwibmV3VmFsdWUiLCJpbmNsdWRlcyIsImhlYWRlciIsInRyaW0iLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiaW52YWxpZExpbmtVUkwiLCJjdXN0b21QYWdlcyIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXJzZUZyYW1lVVJMIiwidmVyaWZ5RW1haWxVUkwiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCBBcHBDYWNoZSBmcm9tICcuL2NhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHtcbiAgSWRlbXBvdGVuY3lPcHRpb25zLFxuICBGaWxlVXBsb2FkT3B0aW9ucyxcbiAgQWNjb3VudExvY2tvdXRPcHRpb25zLFxuICBQYWdlc09wdGlvbnMsXG4gIFNlY3VyaXR5T3B0aW9ucyxcbiAgU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuXG5mdW5jdGlvbiByZW1vdmVUcmFpbGluZ1NsYXNoKHN0cikge1xuICBpZiAoIXN0cikge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbiAgaWYgKHN0ci5lbmRzV2l0aCgnLycpKSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigwLCBzdHIubGVuZ3RoIC0gMSk7XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZyB7XG4gIHN0YXRpYyBnZXQoYXBwbGljYXRpb25JZDogc3RyaW5nLCBtb3VudDogc3RyaW5nKSB7XG4gICAgY29uc3QgY2FjaGVJbmZvID0gQXBwQ2FjaGUuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghY2FjaGVJbmZvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWcoKTtcbiAgICBjb25maWcuYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgT2JqZWN0LmtleXMoY2FjaGVJbmZvKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09ICdkYXRhYmFzZUNvbnRyb2xsZXInKSB7XG4gICAgICAgIGNvbmZpZy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZUNvbnRyb2xsZXIoY2FjaGVJbmZvLmRhdGFiYXNlQ29udHJvbGxlci5hZGFwdGVyLCBjb25maWcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZShzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBBcHBDYWNoZS5wdXQoc2VydmVyQ29uZmlndXJhdGlvbi5hcHBJZCwgc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnNldHVwUGFzc3dvcmRWYWxpZGF0b3Ioc2VydmVyQ29uZmlndXJhdGlvbi5wYXNzd29yZFBvbGljeSk7XG4gICAgcmV0dXJuIHNlcnZlckNvbmZpZ3VyYXRpb247XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGUoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCxcbiAgICBleHBpcmVJbmFjdGl2ZVNlc3Npb25zLFxuICAgIHNlc3Npb25MZW5ndGgsXG4gICAgbWF4TGltaXQsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgICBlbmZvcmNlUHJpdmF0ZVVzZXJzLFxuICAgIHNjaGVtYSxcbiAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0LFxuICB9KSB7XG4gICAgaWYgKG1hc3RlcktleSA9PT0gcmVhZE9ubHlNYXN0ZXJLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCByZWFkT25seU1hc3RlcktleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgY29uc3QgZW1haWxBZGFwdGVyID0gdXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgICBpZiAodmVyaWZ5VXNlckVtYWlscykge1xuICAgICAgdGhpcy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcixcbiAgICAgICAgYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCk7XG4gICAgdGhpcy52YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KTtcbiAgICB0aGlzLnZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCk7XG5cbiAgICBpZiAodHlwZW9mIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ3Jldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmIChwdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIGlmICghcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSAmJiAhcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgdGhyb3cgJ3B1YmxpY1NlcnZlclVSTCBzaG91bGQgYmUgYSB2YWxpZCBIVFRQUyBVUkwgc3RhcnRpbmcgd2l0aCBodHRwczovLyc7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlTWFzdGVyS2V5SXBzKG1hc3RlcktleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycyk7XG4gICAgdGhpcy52YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpO1xuICAgIHRoaXMudmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpO1xuICAgIHRoaXMudmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYSk7XG4gICAgdGhpcy52YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycyk7XG4gICAgdGhpcy52YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCk7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICBpZiAocmVxdWVzdEtleXdvcmREZW55bGlzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0ID0gcmVxdWVzdEtleXdvcmREZW55bGlzdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdEtleXdvcmREZW55bGlzdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgIGlmICh0eXBlb2YgZW5mb3JjZVByaXZhdGVVc2VycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmZvcmNlUHJpdmF0ZVVzZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHJldHVybjtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWFzdGVyS2V5SXBzKG1hc3RlcktleUlwcykge1xuICAgIGZvciAoY29uc3QgaXAgb2YgbWFzdGVyS2V5SXBzKSB7XG4gICAgICBpZiAoIW5ldC5pc0lQKGlwKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBpcCBpbiBtYXN0ZXJLZXlJcHM6ICR7aXB9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbW91bnQoKSB7XG4gICAgdmFyIG1vdW50ID0gdGhpcy5fbW91bnQ7XG4gICAgaWYgKHRoaXMucHVibGljU2VydmVyVVJMKSB7XG4gICAgICBtb3VudCA9IHRoaXMucHVibGljU2VydmVyVVJMO1xuICAgIH1cbiAgICByZXR1cm4gbW91bnQ7XG4gIH1cblxuICBzZXQgbW91bnQobmV3VmFsdWUpIHtcbiAgICB0aGlzLl9tb3VudCA9IG5ld1ZhbHVlO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgIGlmIChleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICBpZiAoaXNOYU4oc2Vzc2lvbkxlbmd0aCkpIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoc2Vzc2lvbkxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vcmVxdWVzdF9wYXNzd29yZF9yZXNldGA7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vdmVyaWZ5X2VtYWlsYDtcbiAgfVxuXG4gIC8vIFRPRE86IFJlbW92ZSB0aGlzIGZ1bmN0aW9uIG9uY2UgUGFnZXNSb3V0ZXIgcmVwbGFjZXMgdGhlIFB1YmxpY0FQSVJvdXRlcjtcbiAgLy8gdGhlIChkZWZhdWx0KSBlbmRwb2ludCBoYXMgdG8gYmUgZGVmaW5lZCBpbiBQYWdlc1JvdXRlciBvbmx5LlxuICBnZXQgcGFnZXNFbmRwb2ludCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYWdlcyAmJiB0aGlzLnBhZ2VzLmVuYWJsZVJvdXRlciAmJiB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgID8gdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA6ICdhcHBzJztcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25maWc7XG5tb2R1bGUuZXhwb3J0cyA9IENvbmZpZztcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUlBOztBQUNBOztBQUNBOztBQUNBOztBQVFBOzs7O0FBZkE7QUFDQTtB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