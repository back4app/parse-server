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
var _package = require("../package.json");
var _Definitions = require("./Options/Definitions");
var _Parse = _interopRequireDefault(require("./cloud-code/Parse.Server"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith('/')) {
    str = str.substring(0, str.length - 1);
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
    config.version = _package.version;
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
    customPages,
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
    databaseOptions,
    extendSessionOnUse,
    allowClientClassCreation
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
    if (typeof extendSessionOnUse !== 'boolean') {
      throw 'extendSessionOnUse must be a boolean value';
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
    this.validateCustomPages(customPages);
    this.validateAllowClientClassCreation(allowClientClassCreation);
  }
  static validateCustomPages(customPages) {
    if (!customPages) {
      return;
    }
    if (Object.prototype.toString.call(customPages) !== '[object Object]') {
      throw Error('Parse Server option customPages must be an object.');
    }
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
  static validateAllowClientClassCreation(allowClientClassCreation) {
    if (typeof allowClientClassCreation !== 'boolean') {
      throw 'Parse Server option allowClientClassCreation must be a boolean.';
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
    if (!schema) {
      return;
    }
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
      const options = Object.keys(_Parse.default.RateLimitZone);
      if (option.zone && !options.includes(option.zone)) {
        const formatter = new Intl.ListFormat('en', {
          style: 'short',
          type: 'disjunction'
        });
        throw `rateLimit.zone must be one of ${formatter.format(options)}`;
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
var _default = exports.default = Config;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX3BhY2thZ2UiLCJfRGVmaW5pdGlvbnMiLCJfUGFyc2UiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHJpbmciLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcnNpb24iLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGVPcHRpb25zIiwidmFsaWRhdGVDb250cm9sbGVycyIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwiY3VzdG9tUGFnZXMiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJkZWZhdWx0TGltaXQiLCJtYXhMaW1pdCIsImFjY291bnRMb2Nrb3V0IiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5IiwibWFpbnRlbmFuY2VLZXkiLCJtYWludGVuYW5jZUtleUlwcyIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZmlsZVVwbG9hZCIsInBhZ2VzIiwic2VjdXJpdHkiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwic2NoZW1hIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJsb2dMZXZlbHMiLCJyYXRlTGltaXQiLCJkYXRhYmFzZU9wdGlvbnMiLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJFcnJvciIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVJcHMiLCJ2YWxpZGF0ZURlZmF1bHRMaW1pdCIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVMb2dMZXZlbHMiLCJ2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyIsInZhbGlkYXRlQ3VzdG9tUGFnZXMiLCJ2YWxpZGF0ZUFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlbWFpbEFkYXB0ZXIiLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsInVuZGVmaW5lZCIsIkFycmF5IiwiaXNBcnJheSIsImVuYWJsZUNoZWNrIiwiU2VjdXJpdHlPcHRpb25zIiwiaXNCb29sZWFuIiwiZW5hYmxlQ2hlY2tMb2ciLCJkZWZpbml0aW9ucyIsIlNjaGVtYU9wdGlvbnMiLCJzdHJpY3QiLCJkZWxldGVFeHRyYUZpZWxkcyIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJsb2NrU2NoZW1hcyIsImJlZm9yZU1pZ3JhdGlvbiIsImFmdGVyTWlncmF0aW9uIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNPcHRpb25zIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJpc1N0cmluZyIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwidHRsIiwiSWRlbXBvdGVuY3lPcHRpb25zIiwiaXNOYU4iLCJwYXRocyIsImR1cmF0aW9uIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwidGhyZXNob2xkIiwidW5sb2NrT25QYXNzd29yZFJlc2V0IiwiQWNjb3VudExvY2tvdXRPcHRpb25zIiwibWF4UGFzc3dvcmRBZ2UiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsInZhbGlkYXRvclBhdHRlcm4iLCJSZWdFeHAiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwicGF0dGVyblZhbGlkYXRvciIsInZhbHVlIiwidGVzdCIsIlJlZmVyZW5jZUVycm9yIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZpbGVVcGxvYWRPcHRpb25zIiwiZW5hYmxlRm9yUHVibGljIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJmaWxlRXh0ZW5zaW9ucyIsImZpZWxkIiwiaXAiLCJpbmNsdWRlcyIsInNwbGl0IiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaGVhZGVyIiwidHJpbSIsIkxvZ0xldmVscyIsInZhbGlkTG9nTGV2ZWxzIiwiaW5kZXhPZiIsIkpTT04iLCJzdHJpbmdpZnkiLCJlbmFibGVTY2hlbWFIb29rcyIsIkRhdGFiYXNlT3B0aW9ucyIsInNjaGVtYUNhY2hlVHRsIiwib3B0aW9ucyIsIm9wdGlvbiIsInJlcXVlc3RQYXRoIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyIsInJlcXVlc3RDb3VudCIsImVycm9yUmVzcG9uc2VNZXNzYWdlIiwiUGFyc2VTZXJ2ZXIiLCJSYXRlTGltaXRab25lIiwiem9uZSIsImZvcm1hdHRlciIsIkludGwiLCJMaXN0Rm9ybWF0Iiwic3R5bGUiLCJ0eXBlIiwiZm9ybWF0Iiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsInVucmVnaXN0ZXJSYXRlTGltaXRlcnMiLCJfdGhpcyRyYXRlTGltaXRzIiwiaSIsInJhdGVMaW1pdHMiLCJsaW1pdCIsImNsb3VkIiwic3BsaWNlIiwiaW52YWxpZExpbmtVUkwiLCJpbnZhbGlkTGluayIsImludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZFN1Y2Nlc3MiLCJsaW5rU2VuZEZhaWxVUkwiLCJsaW5rU2VuZEZhaWwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3MiLCJjaG9vc2VQYXNzd29yZFVSTCIsImNob29zZVBhc3N3b3JkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFyc2VGcmFtZVVSTCIsInZlcmlmeUVtYWlsVVJMIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBsb2dMZXZlbHMgYXMgdmFsaWRMb2dMZXZlbHMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL0xvZ2dlckNvbnRyb2xsZXInO1xuaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQge1xuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIERhdGFiYXNlT3B0aW9ucyxcbiAgRmlsZVVwbG9hZE9wdGlvbnMsXG4gIElkZW1wb3RlbmN5T3B0aW9ucyxcbiAgTG9nTGV2ZWxzLFxuICBQYWdlc09wdGlvbnMsXG4gIFBhcnNlU2VydmVyT3B0aW9ucyxcbiAgU2NoZW1hT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxufSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IFBhcnNlU2VydmVyIGZyb20gJy4vY2xvdWQtY29kZS9QYXJzZS5TZXJ2ZXInO1xuXG5mdW5jdGlvbiByZW1vdmVUcmFpbGluZ1NsYXNoKHN0cikge1xuICBpZiAoIXN0cikge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbiAgaWYgKHN0ci5lbmRzV2l0aCgnLycpKSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cmluZygwLCBzdHIubGVuZ3RoIC0gMSk7XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZyB7XG4gIHN0YXRpYyBnZXQoYXBwbGljYXRpb25JZDogc3RyaW5nLCBtb3VudDogc3RyaW5nKSB7XG4gICAgY29uc3QgY2FjaGVJbmZvID0gQXBwQ2FjaGUuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghY2FjaGVJbmZvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWcoKTtcbiAgICBjb25maWcuYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgT2JqZWN0LmtleXMoY2FjaGVJbmZvKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09ICdkYXRhYmFzZUNvbnRyb2xsZXInKSB7XG4gICAgICAgIGNvbmZpZy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZUNvbnRyb2xsZXIoY2FjaGVJbmZvLmRhdGFiYXNlQ29udHJvbGxlci5hZGFwdGVyLCBjb25maWcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgY29uZmlnLnZlcnNpb24gPSB2ZXJzaW9uO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICBzdGF0aWMgcHV0KHNlcnZlckNvbmZpZ3VyYXRpb24pIHtcbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy52YWxpZGF0ZUNvbnRyb2xsZXJzKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIEFwcENhY2hlLnB1dChzZXJ2ZXJDb25maWd1cmF0aW9uLmFwcElkLCBzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcuc2V0dXBQYXNzd29yZFZhbGlkYXRvcihzZXJ2ZXJDb25maWd1cmF0aW9uLnBhc3N3b3JkUG9saWN5KTtcbiAgICByZXR1cm4gc2VydmVyQ29uZmlndXJhdGlvbjtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU9wdGlvbnMoe1xuICAgIGN1c3RvbVBhZ2VzLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0LFxuICAgIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMsXG4gICAgc2Vzc2lvbkxlbmd0aCxcbiAgICBkZWZhdWx0TGltaXQsXG4gICAgbWF4TGltaXQsXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICBtYWludGVuYW5jZUtleSxcbiAgICBtYWludGVuYW5jZUtleUlwcyxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGZpbGVVcGxvYWQsXG4gICAgcGFnZXMsXG4gICAgc2VjdXJpdHksXG4gICAgZW5mb3JjZVByaXZhdGVVc2VycyxcbiAgICBzY2hlbWEsXG4gICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCxcbiAgICBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuLFxuICAgIGxvZ0xldmVscyxcbiAgICByYXRlTGltaXQsXG4gICAgZGF0YWJhc2VPcHRpb25zLFxuICAgIGV4dGVuZFNlc3Npb25PblVzZSxcbiAgICBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24sXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBpZiAobWFzdGVyS2V5ID09PSBtYWludGVuYW5jZUtleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIG1haW50ZW5hbmNlS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpO1xuICAgIHRoaXMudmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSk7XG4gICAgdGhpcy52YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpO1xuXG4gICAgaWYgKHR5cGVvZiByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGV4dGVuZFNlc3Npb25PblVzZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZXh0ZW5kU2Vzc2lvbk9uVXNlIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAocHVibGljU2VydmVyVVJMKSB7XG4gICAgICBpZiAoIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgIHRocm93ICdwdWJsaWNTZXJ2ZXJVUkwgc2hvdWxkIGJlIGEgdmFsaWQgSFRUUFMgVVJMIHN0YXJ0aW5nIHdpdGggaHR0cHM6Ly8nO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZUlwcygnbWFzdGVyS2V5SXBzJywgbWFzdGVyS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYWludGVuYW5jZUtleUlwcycsIG1haW50ZW5hbmNlS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycyk7XG4gICAgdGhpcy52YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpO1xuICAgIHRoaXMudmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpO1xuICAgIHRoaXMudmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYSk7XG4gICAgdGhpcy52YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycyk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbik7XG4gICAgdGhpcy52YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCk7XG4gICAgdGhpcy52YWxpZGF0ZVJhdGVMaW1pdChyYXRlTGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGF0YWJhc2VPcHRpb25zKGRhdGFiYXNlT3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZUN1c3RvbVBhZ2VzKGN1c3RvbVBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbik7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVDdXN0b21QYWdlcyhjdXN0b21QYWdlcykge1xuICAgIGlmICghY3VzdG9tUGFnZXMpIHsgcmV0dXJuOyB9XG5cbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGN1c3RvbVBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93IEVycm9yKCdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGN1c3RvbVBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0LicpO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUNvbnRyb2xsZXJzKHtcbiAgICB2ZXJpZnlVc2VyRW1haWxzLFxuICAgIHVzZXJDb250cm9sbGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gIH0pIHtcbiAgICBjb25zdCBlbWFpbEFkYXB0ZXIgPSB1c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICAgIGlmICh2ZXJpZnlVc2VyRW1haWxzKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyLFxuICAgICAgICBhcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgaWYgKHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCA9IHJlcXVlc3RLZXl3b3JkRGVueWxpc3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiByZXF1ZXN0S2V5d29yZERlbnlsaXN0IG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICBpZiAodHlwZW9mIGVuZm9yY2VQcml2YXRlVXNlcnMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gZW5mb3JjZVByaXZhdGVVc2VycyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgIGlmICh0eXBlb2YgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbikge1xuICAgIGlmICh0eXBlb2YgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSkge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2VjdXJpdHkpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2sgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrTG9nLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYTogU2NoZW1hT3B0aW9ucykge1xuICAgIGlmICghc2NoZW1hKSB7IHJldHVybjsgfVxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2NoZW1hKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlZmluaXRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWZpbml0aW9ucyA9IFNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYS5kZWZpbml0aW9ucykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWZpbml0aW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuc3RyaWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5zdHJpY3QgPSBTY2hlbWFPcHRpb25zLnN0cmljdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuc3RyaWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnN0cmljdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9IFNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9IFNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEubG9ja1NjaGVtYXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmxvY2tTY2hlbWFzID0gU2NoZW1hT3B0aW9ucy5sb2NrU2NoZW1hcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEubG9ja1NjaGVtYXMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEubG9ja1NjaGVtYXMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmFmdGVyTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgPSBGaWxlVXBsb2FkT3B0aW9ucy5maWxlRXh0ZW5zaW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucykpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJcHMoZmllbGQsIG1hc3RlcktleUlwcykge1xuICAgIGZvciAobGV0IGlwIG9mIG1hc3RlcktleUlwcykge1xuICAgICAgaWYgKGlwLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgaXAgPSBpcC5zcGxpdCgnLycpWzBdO1xuICAgICAgfVxuICAgICAgaWYgKCFuZXQuaXNJUChpcCkpIHtcbiAgICAgICAgdGhyb3cgYFRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIFwiJHtmaWVsZH1cIiBjb250YWlucyBhbiBpbnZhbGlkIElQIGFkZHJlc3MgXCIke2lwfVwiLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IG1vdW50KCkge1xuICAgIHZhciBtb3VudCA9IHRoaXMuX21vdW50O1xuICAgIGlmICh0aGlzLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgbW91bnQgPSB0aGlzLnB1YmxpY1NlcnZlclVSTDtcbiAgICB9XG4gICAgcmV0dXJuIG1vdW50O1xuICB9XG5cbiAgc2V0IG1vdW50KG5ld1ZhbHVlKSB7XG4gICAgdGhpcy5fbW91bnQgPSBuZXdWYWx1ZTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICBpZiAoZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgaWYgKGlzTmFOKHNlc3Npb25MZW5ndGgpKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKHNlc3Npb25MZW5ndGggPD0gMCkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCkge1xuICAgIGlmIChkZWZhdWx0TGltaXQgPT0gbnVsbCkge1xuICAgICAgZGVmYXVsdExpbWl0ID0gUGFyc2VTZXJ2ZXJPcHRpb25zLmRlZmF1bHRMaW1pdC5kZWZhdWx0O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGRlZmF1bHRMaW1pdCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSBudW1iZXIuJztcbiAgICB9XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoTG9nTGV2ZWxzKSkge1xuICAgICAgaWYgKGxvZ0xldmVsc1trZXldKSB7XG4gICAgICAgIGlmICh2YWxpZExvZ0xldmVscy5pbmRleE9mKGxvZ0xldmVsc1trZXldKSA9PT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBgJyR7a2V5fScgbXVzdCBiZSBvbmUgb2YgJHtKU09OLnN0cmluZ2lmeSh2YWxpZExvZ0xldmVscyl9YDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nTGV2ZWxzW2tleV0gPSBMb2dMZXZlbHNba2V5XS5kZWZhdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpIHtcbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zID09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGFiYXNlT3B0aW9ucykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zIG11c3QgYmUgYW4gb2JqZWN0YDtcbiAgICB9XG5cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9IERhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICB9XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPSBEYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsIG11c3QgYmUgYSBudW1iZXJgO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJhdGVMaW1pdChyYXRlTGltaXQpIHtcbiAgICBpZiAoIXJhdGVMaW1pdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocmF0ZUxpbWl0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgICFBcnJheS5pc0FycmF5KHJhdGVMaW1pdClcbiAgICApIHtcbiAgICAgIHRocm93IGByYXRlTGltaXQgbXVzdCBiZSBhbiBhcnJheSBvciBvYmplY3RgO1xuICAgIH1cbiAgICBjb25zdCBvcHRpb25zID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvcHRpb24pICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb2Ygb2JqZWN0c2A7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RQYXRoID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0UGF0aCBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdFBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0VGltZVdpbmRvdyBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdFRpbWVXaW5kb3cgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICYmIHR5cGVvZiBvcHRpb24uaW5jbHVkZUludGVybmFsUmVxdWVzdHMgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdENvdW50ID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0Q291bnQgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RDb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0Q291bnQgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICYmIHR5cGVvZiBvcHRpb24uZXJyb3JSZXNwb25zZU1lc3NhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuZXJyb3JSZXNwb25zZU1lc3NhZ2UgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBjb25zdCBvcHRpb25zID0gT2JqZWN0LmtleXMoUGFyc2VTZXJ2ZXIuUmF0ZUxpbWl0Wm9uZSk7XG4gICAgICBpZiAob3B0aW9uLnpvbmUgJiYgIW9wdGlvbnMuaW5jbHVkZXMob3B0aW9uLnpvbmUpKSB7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRlciA9IG5ldyBJbnRsLkxpc3RGb3JtYXQoJ2VuJywgeyBzdHlsZTogJ3Nob3J0JywgdHlwZTogJ2Rpc2p1bmN0aW9uJyB9KTtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC56b25lIG11c3QgYmUgb25lIG9mICR7Zm9ybWF0dGVyLmZvcm1hdChvcHRpb25zKX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICB1bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzKCkge1xuICAgIGxldCBpID0gdGhpcy5yYXRlTGltaXRzPy5sZW5ndGg7XG4gICAgd2hpbGUgKGktLSkge1xuICAgICAgY29uc3QgbGltaXQgPSB0aGlzLnJhdGVMaW1pdHNbaV07XG4gICAgICBpZiAobGltaXQuY2xvdWQpIHtcbiAgICAgICAgdGhpcy5yYXRlTGltaXRzLnNwbGljZShpLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQSxJQUFBQSxPQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxJQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxNQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSSxtQkFBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUssaUJBQUEsR0FBQUwsT0FBQTtBQUNBLElBQUFNLFFBQUEsR0FBQU4sT0FBQTtBQUNBLElBQUFPLFlBQUEsR0FBQVAsT0FBQTtBQVdBLElBQUFRLE1BQUEsR0FBQU4sc0JBQUEsQ0FBQUYsT0FBQTtBQUFvRCxTQUFBRSx1QkFBQU8sQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQXJCcEQ7QUFDQTtBQUNBOztBQXFCQSxTQUFTRyxtQkFBbUJBLENBQUNDLEdBQUcsRUFBRTtFQUNoQyxJQUFJLENBQUNBLEdBQUcsRUFBRTtJQUNSLE9BQU9BLEdBQUc7RUFDWjtFQUNBLElBQUlBLEdBQUcsQ0FBQ0MsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQ3JCRCxHQUFHLEdBQUdBLEdBQUcsQ0FBQ0UsU0FBUyxDQUFDLENBQUMsRUFBRUYsR0FBRyxDQUFDRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0VBQ3hDO0VBQ0EsT0FBT0gsR0FBRztBQUNaO0FBRU8sTUFBTUksTUFBTSxDQUFDO0VBQ2xCLE9BQU9DLEdBQUdBLENBQUNDLGFBQXFCLEVBQUVDLEtBQWEsRUFBRTtJQUMvQyxNQUFNQyxTQUFTLEdBQUdDLGNBQVEsQ0FBQ0osR0FBRyxDQUFDQyxhQUFhLENBQUM7SUFDN0MsSUFBSSxDQUFDRSxTQUFTLEVBQUU7TUFDZDtJQUNGO0lBQ0EsTUFBTUUsTUFBTSxHQUFHLElBQUlOLE1BQU0sQ0FB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