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
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
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
    enableInsecureAuthAdapters,
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
    this.validateEnableInsecureAuthAdapters(enableInsecureAuthAdapters);
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
  static validateEnableInsecureAuthAdapters(enableInsecureAuthAdapters) {
    if (enableInsecureAuthAdapters && typeof enableInsecureAuthAdapters !== 'boolean') {
      throw 'Parse Server option enableInsecureAuthAdapters must be a boolean.';
    }
    if (enableInsecureAuthAdapters) {
      _Deprecator.default.logRuntimeDeprecation({
        usage: 'insecure adapter'
      });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX3BhY2thZ2UiLCJfRGVmaW5pdGlvbnMiLCJfUGFyc2UiLCJfRGVwcmVjYXRvciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInJlbW92ZVRyYWlsaW5nU2xhc2giLCJzdHIiLCJlbmRzV2l0aCIsInN1YnN0cmluZyIsImxlbmd0aCIsIkNvbmZpZyIsImdldCIsImFwcGxpY2F0aW9uSWQiLCJtb3VudCIsImNhY2hlSW5mbyIsIkFwcENhY2hlIiwiY29uZmlnIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJrZXkiLCJkYXRhYmFzZSIsIkRhdGFiYXNlQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImFkYXB0ZXIiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJiaW5kIiwiZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0IiwidmVyc2lvbiIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJ2YWxpZGF0ZUNvbnRyb2xsZXJzIiwiYXBwSWQiLCJzZXR1cFBhc3N3b3JkVmFsaWRhdG9yIiwicGFzc3dvcmRQb2xpY3kiLCJjdXN0b21QYWdlcyIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsImRlZmF1bHRMaW1pdCIsIm1heExpbWl0IiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsIm1haW50ZW5hbmNlS2V5SXBzIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJhbGxvd0hlYWRlcnMiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyIsInNjaGVtYSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwibG9nTGV2ZWxzIiwicmF0ZUxpbWl0IiwiZGF0YWJhc2VPcHRpb25zIiwiZXh0ZW5kU2Vzc2lvbk9uVXNlIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwiRXJyb3IiLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJzdGFydHNXaXRoIiwidmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlSXBzIiwidmFsaWRhdGVEZWZhdWx0TGltaXQiLCJ2YWxpZGF0ZU1heExpbWl0IiwidmFsaWRhdGVBbGxvd0hlYWRlcnMiLCJ2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyIsInZhbGlkYXRlUGFnZXNPcHRpb25zIiwidmFsaWRhdGVTZWN1cml0eU9wdGlvbnMiLCJ2YWxpZGF0ZVNjaGVtYU9wdGlvbnMiLCJ2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMiLCJ2YWxpZGF0ZUVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzIiwidmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwidmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwidmFsaWRhdGVSYXRlTGltaXQiLCJ2YWxpZGF0ZUxvZ0xldmVscyIsInZhbGlkYXRlRGF0YWJhc2VPcHRpb25zIiwidmFsaWRhdGVDdXN0b21QYWdlcyIsInZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwidmVyaWZ5VXNlckVtYWlscyIsInVzZXJDb250cm9sbGVyIiwiYXBwTmFtZSIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImVtYWlsQWRhcHRlciIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwidW5kZWZpbmVkIiwiQXJyYXkiLCJpc0FycmF5IiwiZW5hYmxlQ2hlY2siLCJTZWN1cml0eU9wdGlvbnMiLCJpc0Jvb2xlYW4iLCJlbmFibGVDaGVja0xvZyIsImRlZmluaXRpb25zIiwiU2NoZW1hT3B0aW9ucyIsInN0cmljdCIsImRlbGV0ZUV4dHJhRmllbGRzIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImxvY2tTY2hlbWFzIiwiYmVmb3JlTWlncmF0aW9uIiwiYWZ0ZXJNaWdyYXRpb24iLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImlzU3RyaW5nIiwibG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUiLCJwbGFjZWhvbGRlcnMiLCJmb3JjZVJlZGlyZWN0IiwicGFnZXNQYXRoIiwicGFnZXNFbmRwb2ludCIsImN1c3RvbVVybHMiLCJjdXN0b21Sb3V0ZXMiLCJ0dGwiLCJJZGVtcG90ZW5jeU9wdGlvbnMiLCJpc05hTiIsInBhdGhzIiwiZHVyYXRpb24iLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJ0aHJlc2hvbGQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJBY2NvdW50TG9ja291dE9wdGlvbnMiLCJtYXhQYXNzd29yZEFnZSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwidmFsaWRhdG9yUGF0dGVybiIsIlJlZ0V4cCIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsdWUiLCJ0ZXN0IiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImZpbGVFeHRlbnNpb25zIiwiZmllbGQiLCJpcCIsImluY2x1ZGVzIiwic3BsaXQiLCJuZXQiLCJpc0lQIiwiRGVwcmVjYXRvciIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsInVzYWdlIiwiX21vdW50IiwibmV3VmFsdWUiLCJQYXJzZVNlcnZlck9wdGlvbnMiLCJoZWFkZXIiLCJ0cmltIiwiTG9nTGV2ZWxzIiwidmFsaWRMb2dMZXZlbHMiLCJpbmRleE9mIiwiSlNPTiIsInN0cmluZ2lmeSIsImVuYWJsZVNjaGVtYUhvb2tzIiwiRGF0YWJhc2VPcHRpb25zIiwic2NoZW1hQ2FjaGVUdGwiLCJvcHRpb25zIiwib3B0aW9uIiwicmVxdWVzdFBhdGgiLCJyZXF1ZXN0VGltZVdpbmRvdyIsImluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzIiwicmVxdWVzdENvdW50IiwiZXJyb3JSZXNwb25zZU1lc3NhZ2UiLCJQYXJzZVNlcnZlciIsIlJhdGVMaW1pdFpvbmUiLCJ6b25lIiwiZm9ybWF0dGVyIiwiSW50bCIsIkxpc3RGb3JtYXQiLCJzdHlsZSIsInR5cGUiLCJmb3JtYXQiLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwidW5yZWdpc3RlclJhdGVMaW1pdGVycyIsIl90aGlzJHJhdGVMaW1pdHMiLCJpIiwicmF0ZUxpbWl0cyIsImxpbWl0IiwiY2xvdWQiLCJzcGxpY2UiLCJpbnZhbGlkTGlua1VSTCIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXJzZUZyYW1lVVJMIiwidmVyaWZ5RW1haWxVUkwiLCJleHBvcnRzIiwiX2RlZmF1bHQiLCJtb2R1bGUiXSwic291cmNlcyI6WyIuLi9zcmMvQ29uZmlnLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCB7IGxvZ0xldmVscyBhcyB2YWxpZExvZ0xldmVscyB9IGZyb20gJy4vQ29udHJvbGxlcnMvTG9nZ2VyQ29udHJvbGxlcic7XG5pbXBvcnQgeyB2ZXJzaW9uIH0gZnJvbSAnLi4vcGFja2FnZS5qc29uJztcbmltcG9ydCB7XG4gIEFjY291bnRMb2Nrb3V0T3B0aW9ucyxcbiAgRGF0YWJhc2VPcHRpb25zLFxuICBGaWxlVXBsb2FkT3B0aW9ucyxcbiAgSWRlbXBvdGVuY3lPcHRpb25zLFxuICBMb2dMZXZlbHMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgUGFyc2VTZXJ2ZXJPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxuICBTZWN1cml0eU9wdGlvbnMsXG59IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIsIGNvbmZpZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbmZpZy5tb3VudCA9IHJlbW92ZVRyYWlsaW5nU2xhc2gobW91bnQpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0LmJpbmQoY29uZmlnKTtcbiAgICBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdC5iaW5kKFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICBjb25maWcudmVyc2lvbiA9IHZlcnNpb247XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZU9wdGlvbnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnZhbGlkYXRlQ29udHJvbGxlcnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQXBwQ2FjaGUucHV0KHNlcnZlckNvbmZpZ3VyYXRpb24uYXBwSWQsIHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy5zZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHNlcnZlckNvbmZpZ3VyYXRpb24ucGFzc3dvcmRQb2xpY3kpO1xuICAgIHJldHVybiBzZXJ2ZXJDb25maWd1cmF0aW9uO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlT3B0aW9ucyh7XG4gICAgY3VzdG9tUGFnZXMsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQsXG4gICAgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyxcbiAgICBzZXNzaW9uTGVuZ3RoLFxuICAgIGRlZmF1bHRMaW1pdCxcbiAgICBtYXhMaW1pdCxcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5SXBzLFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgICBlbmZvcmNlUHJpdmF0ZVVzZXJzLFxuICAgIGVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzLFxuICAgIHNjaGVtYSxcbiAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0LFxuICAgIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4sXG4gICAgbG9nTGV2ZWxzLFxuICAgIHJhdGVMaW1pdCxcbiAgICBkYXRhYmFzZU9wdGlvbnMsXG4gICAgZXh0ZW5kU2Vzc2lvbk9uVXNlLFxuICAgIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbixcbiAgfSkge1xuICAgIGlmIChtYXN0ZXJLZXkgPT09IHJlYWRPbmx5TWFzdGVyS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgcmVhZE9ubHlNYXN0ZXJLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIGlmIChtYXN0ZXJLZXkgPT09IG1haW50ZW5hbmNlS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgbWFpbnRlbmFuY2VLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCk7XG4gICAgdGhpcy52YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KTtcbiAgICB0aGlzLnZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCk7XG5cbiAgICBpZiAodHlwZW9mIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ3Jldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZXh0ZW5kU2Vzc2lvbk9uVXNlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdleHRlbmRTZXNzaW9uT25Vc2UgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmIChwdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIGlmICghcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSAmJiAhcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgdGhyb3cgJ3B1YmxpY1NlcnZlclVSTCBzaG91bGQgYmUgYSB2YWxpZCBIVFRQUyBVUkwgc3RhcnRpbmcgd2l0aCBodHRwczovLyc7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYXN0ZXJLZXlJcHMnLCBtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21haW50ZW5hbmNlS2V5SXBzJywgbWFpbnRlbmFuY2VLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMoZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pO1xuICAgIHRoaXMudmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpO1xuICAgIHRoaXMudmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTG9nTGV2ZWxzKGxvZ0xldmVscyk7XG4gICAgdGhpcy52YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVDdXN0b21QYWdlcyhjdXN0b21QYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbihhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24pO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQ3VzdG9tUGFnZXMoY3VzdG9tUGFnZXMpIHtcbiAgICBpZiAoIWN1c3RvbVBhZ2VzKSB7IHJldHVybjsgfVxuXG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjdXN0b21QYWdlcykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyBFcnJvcignUGFyc2UgU2VydmVyIG9wdGlvbiBjdXN0b21QYWdlcyBtdXN0IGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVDb250cm9sbGVycyh7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgICB1c2VyQ29udHJvbGxlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICB9KSB7XG4gICAgY29uc3QgZW1haWxBZGFwdGVyID0gdXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgICBpZiAodmVyaWZ5VXNlckVtYWlscykge1xuICAgICAgdGhpcy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcixcbiAgICAgICAgYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIGlmIChyZXF1ZXN0S2V5d29yZERlbnlsaXN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPSByZXF1ZXN0S2V5d29yZERlbnlsaXN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcmVxdWVzdEtleXdvcmREZW55bGlzdCBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgaWYgKHR5cGVvZiBlbmZvcmNlUHJpdmF0ZVVzZXJzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGVuZm9yY2VQcml2YXRlVXNlcnMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pIHtcbiAgICBpZiAodHlwZW9mIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbihhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24pIHtcbiAgICBpZiAodHlwZW9mIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNlY3VyaXR5KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5IG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVjayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVjayA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVjay5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVjaykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVja0xvZy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVja0xvZykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWE6IFNjaGVtYU9wdGlvbnMpIHtcbiAgICBpZiAoIXNjaGVtYSkgeyByZXR1cm47IH1cbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Jlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGlzIGNvbmZpZ3VyZWQgdGhlbiBzZXR1cCBhIGNhbGxiYWNrIHRvIHByb2Nlc3MgdGhlIHBhdHRlcm5cbiAgc3RhdGljIHNldHVwUGFzc3dvcmRWYWxpZGF0b3IocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kgJiYgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgcGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciA9IHZhbHVlID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4udGVzdCh2YWx1ZSk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgZW1haWxBZGFwdGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gIH0pIHtcbiAgICBpZiAoIWVtYWlsQWRhcHRlcikge1xuICAgICAgdGhyb3cgJ0FuIGVtYWlsQWRhcHRlciBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYXBwTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBbiBhcHAgbmFtZSBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgcHVibGljU2VydmVyVVJMICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0EgcHVibGljIHNlcnZlciB1cmwgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIGlmIChpc05hTihlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikpIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgdHlwZW9mIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2VtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiAhZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKGZpbGVVcGxvYWQgPT0gbnVsbCB8fCB0eXBlb2YgZmlsZVVwbG9hZCAhPT0gJ29iamVjdCcgfHwgZmlsZVVwbG9hZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHRocm93ICdmaWxlVXBsb2FkIG11c3QgYmUgYW4gb2JqZWN0IHZhbHVlLic7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBSZWZlcmVuY2VFcnJvcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckFub255bW91c1VzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JQdWJsaWMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID0gRmlsZVVwbG9hZE9wdGlvbnMuZmlsZUV4dGVuc2lvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMpKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSXBzKGZpZWxkLCBtYXN0ZXJLZXlJcHMpIHtcbiAgICBmb3IgKGxldCBpcCBvZiBtYXN0ZXJLZXlJcHMpIHtcbiAgICAgIGlmIChpcC5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIGlwID0gaXAuc3BsaXQoJy8nKVswXTtcbiAgICAgIH1cbiAgICAgIGlmICghbmV0LmlzSVAoaXApKSB7XG4gICAgICAgIHRocm93IGBUaGUgUGFyc2UgU2VydmVyIG9wdGlvbiBcIiR7ZmllbGR9XCIgY29udGFpbnMgYW4gaW52YWxpZCBJUCBhZGRyZXNzIFwiJHtpcH1cIi5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzKGVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzKSB7XG4gICAgaWYgKGVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzICYmIHR5cGVvZiBlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMpIHtcbiAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHsgdXNhZ2U6ICdpbnNlY3VyZSBhZGFwdGVyJyB9KTtcbiAgICB9XG4gIH1cblxuICBnZXQgbW91bnQoKSB7XG4gICAgdmFyIG1vdW50ID0gdGhpcy5fbW91bnQ7XG4gICAgaWYgKHRoaXMucHVibGljU2VydmVyVVJMKSB7XG4gICAgICBtb3VudCA9IHRoaXMucHVibGljU2VydmVyVVJMO1xuICAgIH1cbiAgICByZXR1cm4gbW91bnQ7XG4gIH1cblxuICBzZXQgbW91bnQobmV3VmFsdWUpIHtcbiAgICB0aGlzLl9tb3VudCA9IG5ld1ZhbHVlO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgIGlmIChleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICBpZiAoaXNOYU4oc2Vzc2lvbkxlbmd0aCkpIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoc2Vzc2lvbkxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KSB7XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA9PSBudWxsKSB7XG4gICAgICBkZWZhdWx0TGltaXQgPSBQYXJzZVNlcnZlck9wdGlvbnMuZGVmYXVsdExpbWl0LmRlZmF1bHQ7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZGVmYXVsdExpbWl0ICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgJ0RlZmF1bHQgbGltaXQgbXVzdCBiZSBhIG51bWJlci4nO1xuICAgIH1cbiAgICBpZiAoZGVmYXVsdExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KSB7XG4gICAgaWYgKG1heExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdNYXggbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycykge1xuICAgIGlmICghW251bGwsIHVuZGVmaW5lZF0uaW5jbHVkZXMoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgICBhbGxvd0hlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgaGVhZGVyICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBvbmx5IGNvbnRhaW4gc3RyaW5ncyc7XG4gICAgICAgICAgfSBlbHNlIGlmICghaGVhZGVyLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgbm90IGNvbnRhaW4gZW1wdHkgc3RyaW5ncyc7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3QgYmUgYW4gYXJyYXknO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUxvZ0xldmVscyhsb2dMZXZlbHMpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhMb2dMZXZlbHMpKSB7XG4gICAgICBpZiAobG9nTGV2ZWxzW2tleV0pIHtcbiAgICAgICAgaWYgKHZhbGlkTG9nTGV2ZWxzLmluZGV4T2YobG9nTGV2ZWxzW2tleV0pID09PSAtMSkge1xuICAgICAgICAgIHRocm93IGAnJHtrZXl9JyBtdXN0IGJlIG9uZSBvZiAke0pTT04uc3RyaW5naWZ5KHZhbGlkTG9nTGV2ZWxzKX1gO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dMZXZlbHNba2V5XSA9IExvZ0xldmVsc1trZXldLmRlZmF1bHQ7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRGF0YWJhc2VPcHRpb25zKGRhdGFiYXNlT3B0aW9ucykge1xuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMgPT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YWJhc2VPcHRpb25zKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93IGBkYXRhYmFzZU9wdGlvbnMgbXVzdCBiZSBhbiBvYmplY3RgO1xuICAgIH1cblxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzID0gRGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93IGBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgIH1cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCA9IERhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93IGBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmF0ZUxpbWl0KHJhdGVMaW1pdCkge1xuICAgIGlmICghcmF0ZUxpbWl0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChyYXRlTGltaXQpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgIUFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KVxuICAgICkge1xuICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9yIG9iamVjdGA7XG4gICAgfVxuICAgIGNvbnN0IG9wdGlvbnMgPSBBcnJheS5pc0FycmF5KHJhdGVMaW1pdCkgPyByYXRlTGltaXQgOiBbcmF0ZUxpbWl0XTtcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9wdGlvbikgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQgbXVzdCBiZSBhbiBhcnJheSBvZiBvYmplY3RzYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdFBhdGggPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0UGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0UGF0aCBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdFRpbWVXaW5kb3cgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0VGltZVdpbmRvdyBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24uaW5jbHVkZUludGVybmFsUmVxdWVzdHMgJiYgdHlwZW9mIG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuaW5jbHVkZUludGVybmFsUmVxdWVzdHMgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0Q291bnQgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RDb3VudCBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdENvdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RDb3VudCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24uZXJyb3JSZXNwb25zZU1lc3NhZ2UgJiYgdHlwZW9mIG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5lcnJvclJlc3BvbnNlTWVzc2FnZSBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBPYmplY3Qua2V5cyhQYXJzZVNlcnZlci5SYXRlTGltaXRab25lKTtcbiAgICAgIGlmIChvcHRpb24uem9uZSAmJiAhb3B0aW9ucy5pbmNsdWRlcyhvcHRpb24uem9uZSkpIHtcbiAgICAgICAgY29uc3QgZm9ybWF0dGVyID0gbmV3IEludGwuTGlzdEZvcm1hdCgnZW4nLCB7IHN0eWxlOiAnc2hvcnQnLCB0eXBlOiAnZGlzanVuY3Rpb24nIH0pO1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnpvbmUgbXVzdCBiZSBvbmUgb2YgJHtmb3JtYXR0ZXIuZm9ybWF0KG9wdGlvbnMpfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy52ZXJpZnlVc2VyRW1haWxzIHx8ICF0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gKiAxMDAwKTtcbiAgfVxuXG4gIGdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5wYXNzd29yZFBvbGljeSB8fCAhdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gKiAxMDAwKTtcbiAgfVxuXG4gIGdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMuZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnNlc3Npb25MZW5ndGggKiAxMDAwKTtcbiAgfVxuXG4gIHVucmVnaXN0ZXJSYXRlTGltaXRlcnMoKSB7XG4gICAgbGV0IGkgPSB0aGlzLnJhdGVMaW1pdHM/Lmxlbmd0aDtcbiAgICB3aGlsZSAoaS0tKSB7XG4gICAgICBjb25zdCBsaW1pdCA9IHRoaXMucmF0ZUxpbWl0c1tpXTtcbiAgICAgIGlmIChsaW1pdC5jbG91ZCkge1xuICAgICAgICB0aGlzLnJhdGVMaW1pdHMuc3BsaWNlKGksIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBpbnZhbGlkTGlua1VSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkTGluayB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX2xpbmsuaHRtbGA7XG4gIH1cblxuICBnZXQgaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfdmVyaWZpY2F0aW9uX2xpbmsuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGxpbmtTZW5kU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5saW5rU2VuZFN1Y2Nlc3MgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvbGlua19zZW5kX3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGxpbmtTZW5kRmFpbFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5saW5rU2VuZEZhaWwgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvbGlua19zZW5kX2ZhaWwuaHRtbGA7XG4gIH1cblxuICBnZXQgdmVyaWZ5RW1haWxTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLnZlcmlmeUVtYWlsU3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvdmVyaWZ5X2VtYWlsX3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGNob29zZVBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmNob29zZVBhc3N3b3JkIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2Nob29zZV9wYXNzd29yZGA7XG4gIH1cblxuICBnZXQgcmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMucHVibGljU2VydmVyVVJMfS8ke3RoaXMucGFnZXNFbmRwb2ludH0vJHt0aGlzLmFwcGxpY2F0aW9uSWR9L3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgO1xuICB9XG5cbiAgZ2V0IHBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLnBhc3N3b3JkUmVzZXRTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9wYXNzd29yZF9yZXNldF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBwYXJzZUZyYW1lVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLnBhcnNlRnJhbWVVUkw7XG4gIH1cblxuICBnZXQgdmVyaWZ5RW1haWxVUkwoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMucHVibGljU2VydmVyVVJMfS8ke3RoaXMucGFnZXNFbmRwb2ludH0vJHt0aGlzLmFwcGxpY2F0aW9uSWR9L3ZlcmlmeV9lbWFpbGA7XG4gIH1cblxuICAvLyBUT0RPOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIFBhZ2VzUm91dGVyIHJlcGxhY2VzIHRoZSBQdWJsaWNBUElSb3V0ZXI7XG4gIC8vIHRoZSAoZGVmYXVsdCkgZW5kcG9pbnQgaGFzIHRvIGJlIGRlZmluZWQgaW4gUGFnZXNSb3V0ZXIgb25seS5cbiAgZ2V0IHBhZ2VzRW5kcG9pbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMucGFnZXMgJiYgdGhpcy5wYWdlcy5lbmFibGVSb3V0ZXIgJiYgdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA/IHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgOiAnYXBwcyc7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQ29uZmlnO1xubW9kdWxlLmV4cG9ydHMgPSBDb25maWc7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUlBLElBQUFBLE9BQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLElBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLE1BQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFJLG1CQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7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