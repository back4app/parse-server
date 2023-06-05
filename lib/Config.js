"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;
var _lodash = require("lodash");
var _net = _interopRequireDefault(require("net"));
var _cache = _interopRequireDefault(require("./cache"));
var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));
var _LoggerController = require("./Controllers/LoggerController");
var _Definitions = require("./Options/Definitions");
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
    Config.validateOptions(serverConfiguration);
    Config.validateControllers(serverConfiguration);
    _cache.default.put(serverConfiguration.appId, serverConfiguration);
    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }
  static validateOptions({
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    defaultLimit,
    maxLimit,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    maintenanceKey,
    maintenanceKeyIps,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist,
    allowExpiredAuthDataToken,
    logLevels,
    rateLimit,
    databaseOptions
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }
    if (masterKey === maintenanceKey) {
      throw new Error('masterKey and maintenanceKey should be different');
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
    this.validateIps('masterKeyIps', masterKeyIps);
    this.validateIps('maintenanceKeyIps', maintenanceKeyIps);
    this.validateDefaultLimit(defaultLimit);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
    this.validateRateLimit(rateLimit);
    this.validateLogLevels(logLevels);
    this.validateDatabaseOptions(databaseOptions);
  }
  static validateControllers({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
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
  static validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken) {
    if (typeof allowExpiredAuthDataToken !== 'boolean') {
      throw 'Parse Server option allowExpiredAuthDataToken must be a boolean.';
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
      if (passwordPolicy.resetPasswordSuccessOnInvalidEmail && typeof passwordPolicy.resetPasswordSuccessOnInvalidEmail !== 'boolean') {
        throw 'resetPasswordSuccessOnInvalidEmail must be a boolean value';
      }
    }
  }

  // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern
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
    if (fileUpload.fileExtensions === undefined) {
      fileUpload.fileExtensions = _Definitions.FileUploadOptions.fileExtensions.default;
    } else if (!Array.isArray(fileUpload.fileExtensions)) {
      throw 'fileUpload.fileExtensions must be an array.';
    }
  }
  static validateIps(field, masterKeyIps) {
    for (let ip of masterKeyIps) {
      if (ip.includes('/')) {
        ip = ip.split('/')[0];
      }
      if (!_net.default.isIP(ip)) {
        throw `The Parse Server option "${field}" contains an invalid IP address "${ip}".`;
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
  static validateDefaultLimit(defaultLimit) {
    if (defaultLimit == null) {
      defaultLimit = _Definitions.ParseServerOptions.defaultLimit.default;
    }
    if (typeof defaultLimit !== 'number') {
      throw 'Default limit must be a number.';
    }
    if (defaultLimit <= 0) {
      throw 'Default limit must be a value greater than 0.';
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
  static validateLogLevels(logLevels) {
    for (const key of Object.keys(_Definitions.LogLevels)) {
      if (logLevels[key]) {
        if (_LoggerController.logLevels.indexOf(logLevels[key]) === -1) {
          throw `'${key}' must be one of ${JSON.stringify(_LoggerController.logLevels)}`;
        }
      } else {
        logLevels[key] = _Definitions.LogLevels[key].default;
      }
    }
  }
  static validateDatabaseOptions(databaseOptions) {
    if (databaseOptions == undefined) {
      return;
    }
    if (Object.prototype.toString.call(databaseOptions) !== '[object Object]') {
      throw `databaseOptions must be an object`;
    }
    if (databaseOptions.enableSchemaHooks === undefined) {
      databaseOptions.enableSchemaHooks = _Definitions.DatabaseOptions.enableSchemaHooks.default;
    } else if (typeof databaseOptions.enableSchemaHooks !== 'boolean') {
      throw `databaseOptions.enableSchemaHooks must be a boolean`;
    }
    if (databaseOptions.schemaCacheTtl === undefined) {
      databaseOptions.schemaCacheTtl = _Definitions.DatabaseOptions.schemaCacheTtl.default;
    } else if (typeof databaseOptions.schemaCacheTtl !== 'number') {
      throw `databaseOptions.schemaCacheTtl must be a number`;
    }
  }
  static validateRateLimit(rateLimit) {
    if (!rateLimit) {
      return;
    }
    if (Object.prototype.toString.call(rateLimit) !== '[object Object]' && !Array.isArray(rateLimit)) {
      throw `rateLimit must be an array or object`;
    }
    const options = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const option of options) {
      if (Object.prototype.toString.call(option) !== '[object Object]') {
        throw `rateLimit must be an array of objects`;
      }
      if (option.requestPath == null) {
        throw `rateLimit.requestPath must be defined`;
      }
      if (typeof option.requestPath !== 'string') {
        throw `rateLimit.requestPath must be a string`;
      }
      if (option.requestTimeWindow == null) {
        throw `rateLimit.requestTimeWindow must be defined`;
      }
      if (typeof option.requestTimeWindow !== 'number') {
        throw `rateLimit.requestTimeWindow must be a number`;
      }
      if (option.includeInternalRequests && typeof option.includeInternalRequests !== 'boolean') {
        throw `rateLimit.includeInternalRequests must be a boolean`;
      }
      if (option.requestCount == null) {
        throw `rateLimit.requestCount must be defined`;
      }
      if (typeof option.requestCount !== 'number') {
        throw `rateLimit.requestCount must be a number`;
      }
      if (option.errorResponseMessage && typeof option.errorResponseMessage !== 'string') {
        throw `rateLimit.errorResponseMessage must be a string`;
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
  unregisterRateLimiters() {
    var _this$rateLimits;
    let i = (_this$rateLimits = this.rateLimits) === null || _this$rateLimits === void 0 ? void 0 : _this$rateLimits.length;
    while (i--) {
      const limit = this.rateLimits[i];
      if (limit.cloud) {
        this.rateLimits.splice(i, 1);
      }
    }
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
  }

  // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.
  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }
}
exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX0RlZmluaXRpb25zIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHIiLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJ2YWxpZGF0ZUNvbnRyb2xsZXJzIiwiYXBwSWQiLCJzZXR1cFBhc3N3b3JkVmFsaWRhdG9yIiwicGFzc3dvcmRQb2xpY3kiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJkZWZhdWx0TGltaXQiLCJtYXhMaW1pdCIsImFjY291bnRMb2Nrb3V0IiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5IiwibWFpbnRlbmFuY2VLZXkiLCJtYWludGVuYW5jZUtleUlwcyIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZmlsZVVwbG9hZCIsInBhZ2VzIiwic2VjdXJpdHkiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwic2NoZW1hIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJsb2dMZXZlbHMiLCJyYXRlTGltaXQiLCJkYXRhYmFzZU9wdGlvbnMiLCJFcnJvciIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVJcHMiLCJ2YWxpZGF0ZURlZmF1bHRMaW1pdCIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVMb2dMZXZlbHMiLCJ2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlbWFpbEFkYXB0ZXIiLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsInVuZGVmaW5lZCIsIkFycmF5IiwiaXNBcnJheSIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsImVuYWJsZUNoZWNrIiwiU2VjdXJpdHlPcHRpb25zIiwiaXNCb29sZWFuIiwiZW5hYmxlQ2hlY2tMb2ciLCJkZWZpbml0aW9ucyIsIlNjaGVtYU9wdGlvbnMiLCJzdHJpY3QiLCJkZWxldGVFeHRyYUZpZWxkcyIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJsb2NrU2NoZW1hcyIsImJlZm9yZU1pZ3JhdGlvbiIsImFmdGVyTWlncmF0aW9uIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNPcHRpb25zIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJpc1N0cmluZyIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwidHRsIiwiSWRlbXBvdGVuY3lPcHRpb25zIiwiaXNOYU4iLCJwYXRocyIsImR1cmF0aW9uIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwidGhyZXNob2xkIiwidW5sb2NrT25QYXNzd29yZFJlc2V0IiwiQWNjb3VudExvY2tvdXRPcHRpb25zIiwibWF4UGFzc3dvcmRBZ2UiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsInZhbGlkYXRvclBhdHRlcm4iLCJSZWdFeHAiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwicGF0dGVyblZhbGlkYXRvciIsInZhbHVlIiwidGVzdCIsImUiLCJSZWZlcmVuY2VFcnJvciIsImVuYWJsZUZvckFub255bW91c1VzZXIiLCJGaWxlVXBsb2FkT3B0aW9ucyIsImVuYWJsZUZvclB1YmxpYyIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiZmlsZUV4dGVuc2lvbnMiLCJmaWVsZCIsImlwIiwiaW5jbHVkZXMiLCJzcGxpdCIsIm5ldCIsImlzSVAiLCJfbW91bnQiLCJuZXdWYWx1ZSIsIlBhcnNlU2VydmVyT3B0aW9ucyIsImhlYWRlciIsInRyaW0iLCJMb2dMZXZlbHMiLCJ2YWxpZExvZ0xldmVscyIsImluZGV4T2YiLCJKU09OIiwic3RyaW5naWZ5IiwiZW5hYmxlU2NoZW1hSG9va3MiLCJEYXRhYmFzZU9wdGlvbnMiLCJzY2hlbWFDYWNoZVR0bCIsIm9wdGlvbnMiLCJvcHRpb24iLCJyZXF1ZXN0UGF0aCIsInJlcXVlc3RUaW1lV2luZG93IiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCJ1bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzIiwiX3RoaXMkcmF0ZUxpbWl0cyIsImkiLCJyYXRlTGltaXRzIiwibGltaXQiLCJjbG91ZCIsInNwbGljZSIsImludmFsaWRMaW5rVVJMIiwiY3VzdG9tUGFnZXMiLCJpbnZhbGlkTGluayIsImludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZFN1Y2Nlc3MiLCJsaW5rU2VuZEZhaWxVUkwiLCJsaW5rU2VuZEZhaWwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3MiLCJjaG9vc2VQYXNzd29yZFVSTCIsImNob29zZVBhc3N3b3JkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFyc2VGcmFtZVVSTCIsInZlcmlmeUVtYWlsVVJMIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBsb2dMZXZlbHMgYXMgdmFsaWRMb2dMZXZlbHMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL0xvZ2dlckNvbnRyb2xsZXInO1xuaW1wb3J0IHtcbiAgQWNjb3VudExvY2tvdXRPcHRpb25zLFxuICBEYXRhYmFzZU9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIExvZ0xldmVscyxcbiAgUGFnZXNPcHRpb25zLFxuICBQYXJzZVNlcnZlck9wdGlvbnMsXG4gIFNjaGVtYU9wdGlvbnMsXG4gIFNlY3VyaXR5T3B0aW9ucyxcbn0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcblxuZnVuY3Rpb24gcmVtb3ZlVHJhaWxpbmdTbGFzaChzdHIpIHtcbiAgaWYgKCFzdHIpIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG4gIGlmIChzdHIuZW5kc1dpdGgoJy8nKSkge1xuICAgIHN0ciA9IHN0ci5zdWJzdHIoMCwgc3RyLmxlbmd0aCAtIDEpO1xuICB9XG4gIHJldHVybiBzdHI7XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWcge1xuICBzdGF0aWMgZ2V0KGFwcGxpY2F0aW9uSWQ6IHN0cmluZywgbW91bnQ6IHN0cmluZykge1xuICAgIGNvbnN0IGNhY2hlSW5mbyA9IEFwcENhY2hlLmdldChhcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIWNhY2hlSW5mbykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjb25maWcgPSBuZXcgQ29uZmlnKCk7XG4gICAgY29uZmlnLmFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkO1xuICAgIE9iamVjdC5rZXlzKGNhY2hlSW5mbykuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PSAnZGF0YWJhc2VDb250cm9sbGVyJykge1xuICAgICAgICBjb25maWcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2VDb250cm9sbGVyKGNhY2hlSW5mby5kYXRhYmFzZUNvbnRyb2xsZXIuYWRhcHRlciwgY29uZmlnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbmZpZ1trZXldID0gY2FjaGVJbmZvW2tleV07XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uZmlnLm1vdW50ID0gcmVtb3ZlVHJhaWxpbmdTbGFzaChtb3VudCk7XG4gICAgY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQuYmluZChjb25maWcpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0LmJpbmQoXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICBzdGF0aWMgcHV0KHNlcnZlckNvbmZpZ3VyYXRpb24pIHtcbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy52YWxpZGF0ZUNvbnRyb2xsZXJzKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIEFwcENhY2hlLnB1dChzZXJ2ZXJDb25maWd1cmF0aW9uLmFwcElkLCBzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcuc2V0dXBQYXNzd29yZFZhbGlkYXRvcihzZXJ2ZXJDb25maWd1cmF0aW9uLnBhc3N3b3JkUG9saWN5KTtcbiAgICByZXR1cm4gc2VydmVyQ29uZmlndXJhdGlvbjtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU9wdGlvbnMoe1xuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0LFxuICAgIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMsXG4gICAgc2Vzc2lvbkxlbmd0aCxcbiAgICBkZWZhdWx0TGltaXQsXG4gICAgbWF4TGltaXQsXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICBtYWludGVuYW5jZUtleSxcbiAgICBtYWludGVuYW5jZUtleUlwcyxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGZpbGVVcGxvYWQsXG4gICAgcGFnZXMsXG4gICAgc2VjdXJpdHksXG4gICAgZW5mb3JjZVByaXZhdGVVc2VycyxcbiAgICBzY2hlbWEsXG4gICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCxcbiAgICBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuLFxuICAgIGxvZ0xldmVscyxcbiAgICByYXRlTGltaXQsXG4gICAgZGF0YWJhc2VPcHRpb25zLFxuICB9KSB7XG4gICAgaWYgKG1hc3RlcktleSA9PT0gcmVhZE9ubHlNYXN0ZXJLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCByZWFkT25seU1hc3RlcktleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgaWYgKG1hc3RlcktleSA9PT0gbWFpbnRlbmFuY2VLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCBtYWludGVuYW5jZUtleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KTtcbiAgICB0aGlzLnZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpO1xuICAgIHRoaXMudmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKTtcblxuICAgIGlmICh0eXBlb2YgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAncmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuXG4gICAgaWYgKHB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgaWYgKCFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cDovLycpICYmICFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICB0aHJvdyAncHVibGljU2VydmVyVVJMIHNob3VsZCBiZSBhIHZhbGlkIEhUVFBTIFVSTCBzdGFydGluZyB3aXRoIGh0dHBzOi8vJztcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21hc3RlcktleUlwcycsIG1hc3RlcktleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZUlwcygnbWFpbnRlbmFuY2VLZXlJcHMnLCBtYWludGVuYW5jZUtleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZURlZmF1bHRMaW1pdChkZWZhdWx0TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KTtcbiAgICB0aGlzLnZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWEpO1xuICAgIHRoaXMudmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pO1xuICAgIHRoaXMudmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpO1xuICAgIHRoaXMudmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTG9nTGV2ZWxzKGxvZ0xldmVscyk7XG4gICAgdGhpcy52YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQ29udHJvbGxlcnMoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGNvbnN0IGVtYWlsQWRhcHRlciA9IHVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gICAgaWYgKHZlcmlmeVVzZXJFbWFpbHMpIHtcbiAgICAgIHRoaXMudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICBpZiAocmVxdWVzdEtleXdvcmREZW55bGlzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0ID0gcmVxdWVzdEtleXdvcmREZW55bGlzdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdEtleXdvcmREZW55bGlzdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgIGlmICh0eXBlb2YgZW5mb3JjZVByaXZhdGVVc2VycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmZvcmNlUHJpdmF0ZVVzZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgaWYgKHR5cGVvZiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNlY3VyaXR5KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5IG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVjayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVjayA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVjay5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVjaykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVja0xvZy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVja0xvZykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWE6IFNjaGVtYU9wdGlvbnMpIHtcbiAgICBpZiAoIXNjaGVtYSkgcmV0dXJuO1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2NoZW1hKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlZmluaXRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWZpbml0aW9ucyA9IFNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYS5kZWZpbml0aW9ucykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWZpbml0aW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuc3RyaWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5zdHJpY3QgPSBTY2hlbWFPcHRpb25zLnN0cmljdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuc3RyaWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnN0cmljdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9IFNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9IFNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEubG9ja1NjaGVtYXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmxvY2tTY2hlbWFzID0gU2NoZW1hT3B0aW9ucy5sb2NrU2NoZW1hcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEubG9ja1NjaGVtYXMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEubG9ja1NjaGVtYXMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmFmdGVyTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgPSBGaWxlVXBsb2FkT3B0aW9ucy5maWxlRXh0ZW5zaW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucykpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJcHMoZmllbGQsIG1hc3RlcktleUlwcykge1xuICAgIGZvciAobGV0IGlwIG9mIG1hc3RlcktleUlwcykge1xuICAgICAgaWYgKGlwLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgaXAgPSBpcC5zcGxpdCgnLycpWzBdO1xuICAgICAgfVxuICAgICAgaWYgKCFuZXQuaXNJUChpcCkpIHtcbiAgICAgICAgdGhyb3cgYFRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIFwiJHtmaWVsZH1cIiBjb250YWlucyBhbiBpbnZhbGlkIElQIGFkZHJlc3MgXCIke2lwfVwiLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IG1vdW50KCkge1xuICAgIHZhciBtb3VudCA9IHRoaXMuX21vdW50O1xuICAgIGlmICh0aGlzLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgbW91bnQgPSB0aGlzLnB1YmxpY1NlcnZlclVSTDtcbiAgICB9XG4gICAgcmV0dXJuIG1vdW50O1xuICB9XG5cbiAgc2V0IG1vdW50KG5ld1ZhbHVlKSB7XG4gICAgdGhpcy5fbW91bnQgPSBuZXdWYWx1ZTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICBpZiAoZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgaWYgKGlzTmFOKHNlc3Npb25MZW5ndGgpKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKHNlc3Npb25MZW5ndGggPD0gMCkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCkge1xuICAgIGlmIChkZWZhdWx0TGltaXQgPT0gbnVsbCkge1xuICAgICAgZGVmYXVsdExpbWl0ID0gUGFyc2VTZXJ2ZXJPcHRpb25zLmRlZmF1bHRMaW1pdC5kZWZhdWx0O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGRlZmF1bHRMaW1pdCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSBudW1iZXIuJztcbiAgICB9XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoTG9nTGV2ZWxzKSkge1xuICAgICAgaWYgKGxvZ0xldmVsc1trZXldKSB7XG4gICAgICAgIGlmICh2YWxpZExvZ0xldmVscy5pbmRleE9mKGxvZ0xldmVsc1trZXldKSA9PT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBgJyR7a2V5fScgbXVzdCBiZSBvbmUgb2YgJHtKU09OLnN0cmluZ2lmeSh2YWxpZExvZ0xldmVscyl9YDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nTGV2ZWxzW2tleV0gPSBMb2dMZXZlbHNba2V5XS5kZWZhdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpIHtcbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zID09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGFiYXNlT3B0aW9ucykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zIG11c3QgYmUgYW4gb2JqZWN0YDtcbiAgICB9XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgPSBEYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgfVxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsID0gRGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KSB7XG4gICAgaWYgKCFyYXRlTGltaXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHJhdGVMaW1pdCkgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShyYXRlTGltaXQpXG4gICAgKSB7XG4gICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb3Igb2JqZWN0YDtcbiAgICB9XG4gICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob3B0aW9uKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9mIG9iamVjdHNgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0UGF0aCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAmJiB0eXBlb2Ygb3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RDb3VudCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0Q291bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAmJiB0eXBlb2Ygb3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmVycm9yUmVzcG9uc2VNZXNzYWdlIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICB1bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzKCkge1xuICAgIGxldCBpID0gdGhpcy5yYXRlTGltaXRzPy5sZW5ndGg7XG4gICAgd2hpbGUgKGktLSkge1xuICAgICAgY29uc3QgbGltaXQgPSB0aGlzLnJhdGVMaW1pdHNbaV07XG4gICAgICBpZiAobGltaXQuY2xvdWQpIHtcbiAgICAgICAgdGhpcy5yYXRlTGltaXRzLnNwbGljZShpLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQSxJQUFBQSxPQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxJQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxNQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSSxtQkFBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUssaUJBQUEsR0FBQUwsT0FBQTtBQUNBLElBQUFNLFlBQUEsR0FBQU4sT0FBQTtBQVUrQixTQUFBRSx1QkFBQUssR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQW5CL0I7QUFDQTtBQUNBOztBQW1CQSxTQUFTRyxtQkFBbUJBLENBQUNDLEdBQUcsRUFBRTtFQUNoQyxJQUFJLENBQUNBLEdBQUcsRUFBRTtJQUNSLE9BQU9BLEdBQUc7RUFDWjtFQUNBLElBQUlBLEdBQUcsQ0FBQ0MsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQ3JCRCxHQUFHLEdB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